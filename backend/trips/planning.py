"""Turns a validated trip request into the route, stops and log sheets."""

from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, time, timedelta

from . import geo, hos

# OSRM routes for cars. Most fleets govern trucks at about 65.
MAX_SPEED_MPH = 65.0
STOP_KINDS = {"pickup", "dropoff", "fuel", "break", "rest", "restart"}
LOCATION_FIELDS = ("current_location", "pickup_location", "dropoff_location")


def _places(data, maps):
    def resolve(location):
        return maps.geocode(location) if isinstance(location, str) else location

    with ThreadPoolExecutor(max_workers=3) as pool:
        return list(pool.map(resolve, (data[name] for name in LOCATION_FIELDS)))


def _legs(route):
    return [
        hos.Leg(
            miles=leg["miles"],
            # the floor keeps a junk duration from the router from stalling the planner
            speed_mph=min(max(leg["miles"] / leg["hours"], 5.0), MAX_SPEED_MPH)
            if leg["hours"] else MAX_SPEED_MPH,
            arrival=arrival,
        )
        for leg, arrival in zip(route.legs, ("pickup", "dropoff"))
    ]


def _locate(segments, route, places, maps):
    """Fill in location name and coordinates on every segment."""
    current, pickup, dropoff = places
    pickup_mile = route.legs[0]["miles"]
    known = {0.0: current, pickup_mile: pickup, route.miles: dropoff}

    def known_place(seg):
        if seg.kind == "pickup":
            return pickup
        if seg.kind == "dropoff":
            return dropoff
        for mile, place in known.items():
            if abs(seg.mile - mile) < 0.5:
                return place
        return None

    stops = [s for s in segments if s.status != hos.DRIVING]
    unknown = {round(s.mile, 1) for s in stops if known_place(s) is None}
    names = {mile: maps.reverse(*route.point_at(mile)) for mile in unknown}

    previous = current["short"]
    for seg in segments:
        seg.lat, seg.lng = route.point_at(seg.mile)
        if seg.status == hos.DRIVING:
            seg.location = previous
            continue
        place = known_place(seg)
        if place:
            seg.location, seg.lat, seg.lng = place["short"], place["lat"], place["lng"]
        else:
            mile = round(seg.mile, 1)
            seg.location = names[mile] or f"{seg.lat:.2f}, {seg.lng:.2f}"
        previous = seg.location


def _segment_json(seg, stamp):
    return {
        "status": seg.status,
        "kind": seg.kind,
        "note": seg.note,
        "start": stamp(seg.start),
        "end": stamp(seg.end),
        "minutes": seg.minutes,
        "miles": round(seg.miles, 1),
        "mile": round(seg.mile, 1),
        "location": seg.location,
        "lat": seg.lat,
        "lng": seg.lng,
    }


def _summary(trip, planner, route, start_minute, days, stamp):
    driving = sum(s.minutes for s in trip if s.status == hos.DRIVING)
    on_duty = sum(s.minutes for s in trip if s.status == hos.ON_DUTY)
    kinds = Counter(s.kind for s in trip)
    return {
        "start": stamp(start_minute),
        "arrival": stamp(planner.arrival),
        "total_hours": round((planner.arrival - start_minute) / 60, 2),
        "driving_hours": round(driving / 60, 2),
        "on_duty_hours": round(on_duty / 60, 2),
        "miles": round(route.miles, 1),
        "days": days,
        "fuel_stops": kinds["fuel"],
        "rests": kinds["rest"],
        "breaks": kinds["break"],
        "restarts": kinds["restart"],
        "cycle_used_start": round(planner.cycle_used / 60, 2),
        "cycle_used_end": round(planner.cycle / 60, 2),
    }


def build_plan(data, maps):
    """Plan the trip in `data` (a validated TripSerializer payload).

    `maps` looks places and routes up: a geo.MapService, or anything with its
    geocode, route and reverse. Raises geo.GeoError when the trip can't be routed.
    """
    start = data["start_time"].replace(tzinfo=None, second=0, microsecond=0)
    midnight = datetime.combine(start.date(), time())
    start_minute = start.hour * 60 + start.minute

    places = _places(data, maps)
    route = maps.route(places)
    if route.miles < 0.5:
        raise geo.GeoError(
            "Those locations are all the same place, so there is no trip to plan."
        )

    legs = _legs(route)
    planner = hos.plan_trip(legs, data["current_cycle_used"], start_minute)
    segments = planner.segments
    _locate(segments, route, places, maps)

    def stamp(minute):
        return (midnight + timedelta(minutes=minute)).isoformat(timespec="minutes")

    logs = hos.daily_logs(segments, planner.cycle_used)
    for log in logs:
        log["date"] = (midnight + timedelta(days=log["day"] - 1)).date().isoformat()

    # leave out the off-duty padding before the start and after drop-off
    trip = [s for s in segments if start_minute <= s.start < planner.arrival]

    return {
        "locations": dict(zip(("current", "pickup", "dropoff"), places)),
        "route": {
            "geometry": route.polyline(),
            "miles": round(route.miles, 1),
            "legs": [
                {"miles": round(leg.miles, 1), "speed_mph": round(leg.speed_mph, 1)}
                for leg in legs
            ],
        },
        "summary": _summary(trip, planner, route, start_minute, len(logs), stamp),
        "timeline": [_segment_json(s, stamp) for s in trip],
        "stops": [_segment_json(s, stamp) for s in trip if s.kind in STOP_KINDS],
        "logs": logs,
    }
