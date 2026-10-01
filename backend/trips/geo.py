"""Place search and routing.

MapService is what the rest of the app talks to. It is handed a place search
(Photon) and a router (OSRM), and either can be swapped for anything with the
same methods.
"""

import csv
import math
from bisect import bisect_left
from functools import lru_cache
from pathlib import Path
from typing import Protocol
from urllib.parse import quote

import requests
from django.conf import settings
from django.core.cache import cache

METERS_PER_MILE = 1609.344
TIMEOUT = 12
HEADERS = {"User-Agent": "eld-trip-planner/1.0 (assessment project)"}
# Rough North America box, to keep suggestions relevant to FMCSA trips.
BBOX = "-170,14,-50,72"
# City list from kelvins/US-Cities-Database (MIT): name, state, lat, lng.
CITIES_FILE = Path(__file__).parent / "data" / "us_cities.csv"

US_STATES = {
    "Alabama": "AL", "Alaska": "AK", "Arizona": "AZ", "Arkansas": "AR",
    "California": "CA", "Colorado": "CO", "Connecticut": "CT", "Delaware": "DE",
    "District of Columbia": "DC", "Florida": "FL", "Georgia": "GA", "Hawaii": "HI",
    "Idaho": "ID", "Illinois": "IL", "Indiana": "IN", "Iowa": "IA", "Kansas": "KS",
    "Kentucky": "KY", "Louisiana": "LA", "Maine": "ME", "Maryland": "MD",
    "Massachusetts": "MA", "Michigan": "MI", "Minnesota": "MN",
    "Mississippi": "MS", "Missouri": "MO", "Montana": "MT", "Nebraska": "NE",
    "Nevada": "NV", "New Hampshire": "NH", "New Jersey": "NJ", "New Mexico": "NM",
    "New York": "NY", "North Carolina": "NC", "North Dakota": "ND", "Ohio": "OH",
    "Oklahoma": "OK", "Oregon": "OR", "Pennsylvania": "PA", "Rhode Island": "RI",
    "South Carolina": "SC", "South Dakota": "SD", "Tennessee": "TN", "Texas": "TX",
    "Utah": "UT", "Vermont": "VT", "Virginia": "VA", "Washington": "WA",
    "West Virginia": "WV", "Wisconsin": "WI", "Wyoming": "WY",
}
PLACE_TYPES = {"city", "town", "village", "hamlet", "locality", "district"}


UNAVAILABLE = "The map service did not respond. Try again in a moment."


class GeoError(Exception):
    pass


class Unavailable(GeoError):
    """The map service is down or timed out, as opposed to a bad place."""


def _get(url, params):
    try:
        response = requests.get(url, params=params, headers=HEADERS, timeout=TIMEOUT)
        response.raise_for_status()
        return response.json()
    except (requests.RequestException, ValueError) as exc:
        raise Unavailable(UNAVAILABLE) from exc


def _region(props):
    state = props.get("state")
    if not state:
        return props.get("country", "")
    return US_STATES.get(state, state)


def _city(props):
    if props.get("type") in PLACE_TYPES or props.get("osm_key") == "place":
        return props.get("name") or props.get("city")
    return props.get("city") or props.get("county") or props.get("name")


def _place(feature):
    props = feature["properties"]
    lng, lat = feature["geometry"]["coordinates"]
    city, region = _city(props), _region(props)
    short = ", ".join(part for part in (city, region) if part)
    name = props.get("name")
    label = f"{name}, {short}" if name and name != city else short
    return {"label": label, "short": short, "lat": lat, "lng": lng}


class PlaceSearch(Protocol):
    def search(self, query: str, limit: int = 5) -> list[dict]:
        """Places matching the text, best first, as {label, short, lat, lng}."""

    def reverse(self, lat: float, lng: float) -> str | None:
        """ "City, ST" for a point, or None if nothing is near it."""


class Router(Protocol):
    def route(self, places: list[dict]) -> "Route":
        """The driving route through the places, in order."""


class Photon:
    """Place search on a Photon server (OpenStreetMap data)."""

    def __init__(self, url):
        self.url = url

    def search(self, query, limit=5):
        data = _get(
            f"{self.url}/api/",
            {"q": query, "limit": limit, "lang": "en", "bbox": BBOX},
        )
        places, seen = [], set()
        for feature in data.get("features", []):
            place = _place(feature)
            if place["label"] and place["label"] not in seen:
                seen.add(place["label"])
                places.append(place)
        return places

    def reverse(self, lat, lng):
        data = _get(
            f"{self.url}/reverse",
            {"lat": lat, "lon": lng, "lang": "en", "layer": "city", "radius": 80},
        )
        features = data.get("features") or []
        return _place(features[0])["short"] if features else None


@lru_cache(maxsize=1)
def _city_grid():
    """Bundled US cities, bucketed by whole degree for quick nearest lookups."""
    grid = {}
    with open(CITIES_FILE, newline="") as handle:
        for name, state, lat, lng in csv.reader(handle):
            lat, lng = float(lat), float(lng)
            grid.setdefault((math.floor(lat), math.floor(lng)), []).append(
                (lat, lng, f"{name}, {state}")
            )
    return grid


def _nearest_city(lat, lng, within_miles=40):
    grid, best, best_miles = _city_grid(), None, within_miles
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            cell = (math.floor(lat) + dy, math.floor(lng) + dx)
            for city_lat, city_lng, label in grid.get(cell, ()):
                miles = _haversine((lng, lat), (city_lng, city_lat)) / METERS_PER_MILE
                if miles < best_miles:
                    best, best_miles = label, miles
    return best


def _haversine(a, b):
    """Great-circle distance in meters between two (lng, lat) points."""
    lng1, lat1, lng2, lat2 = map(math.radians, (*a, *b))
    h = (
        math.sin((lat2 - lat1) / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin((lng2 - lng1) / 2) ** 2
    )
    return 2 * 6371008.8 * math.asin(math.sqrt(h))


class Route:
    """A driving route with leg totals and mile-based lookup along its line."""

    def __init__(self, coordinates, legs):
        self.coordinates = coordinates  # [(lng, lat), ...]
        self.legs = legs  # [{"miles": float, "hours": float}, ...]
        self.miles = sum(leg["miles"] for leg in legs)

        cumulative = [0.0]
        for a, b in zip(coordinates, coordinates[1:]):
            cumulative.append(cumulative[-1] + _haversine(a, b))
        # Scale the line's own length onto the router's reported distance.
        scale = self.miles / cumulative[-1] if cumulative[-1] else 0
        self._cumulative = [d * scale for d in cumulative]

    def point_at(self, mile):
        """(lat, lng) of the point `mile` miles along the route."""
        marks = self._cumulative
        mile = min(max(mile, 0.0), marks[-1])
        i = min(max(bisect_left(marks, mile), 1), len(marks) - 1)
        span = marks[i] - marks[i - 1]
        f = (mile - marks[i - 1]) / span if span else 0
        (lng1, lat1), (lng2, lat2) = self.coordinates[i - 1], self.coordinates[i]
        return lat1 + (lat2 - lat1) * f, lng1 + (lng2 - lng1) * f

    def polyline(self, max_points=6000):
        """[lat, lng] pairs, thinned so long routes stay light to send."""
        step = max(1, len(self.coordinates) // max_points)
        points = self.coordinates[::step]
        if points[-1] != self.coordinates[-1]:
            points.append(self.coordinates[-1])
        return [[round(lat, 5), round(lng, 5)] for lng, lat in points]


class Osrm:
    """Routing on an OSRM server."""

    def __init__(self, url):
        self.url = url

    def route(self, places):
        waypoints = ";".join(f"{p['lng']},{p['lat']}" for p in places)
        # OSRM answers "no route" with a 400 and a JSON body, so don't go
        # through _get, which would report that as an outage.
        try:
            response = requests.get(
                f"{self.url}/route/v1/driving/{waypoints}",
                params={"overview": "full", "geometries": "geojson"},
                headers=HEADERS,
                timeout=TIMEOUT,
            )
            data = response.json()
        except (requests.RequestException, ValueError) as exc:
            raise Unavailable(UNAVAILABLE) from exc
        if data.get("code") != "Ok" or not data.get("routes"):
            raise GeoError("No drivable route connects those locations.")
        found = data["routes"][0]
        legs = [
            {"miles": leg["distance"] / METERS_PER_MILE, "hours": leg["duration"] / 3600}
            for leg in found["legs"]
        ]
        return Route([tuple(c) for c in found["geometry"]["coordinates"]], legs)


class MapService:
    """Everything the planner asks of a map, with repeat lookups cached."""

    def __init__(self, places: PlaceSearch, router: Router):
        self.places = places
        self.router = router

    def search(self, query, limit=5):
        return self.places.search(query, limit)

    def geocode(self, query):
        # quoted, because memcached-style backends reject spaces in keys
        key = f"geocode:{quote(query.strip().lower())}"
        place = cache.get(key)
        if place is None:
            results = self.places.search(query, limit=1)
            if not results:
                raise GeoError(f'Could not find "{query}". Try a city and state.')
            place = results[0]
            cache.set(key, place)
        return place

    def reverse(self, lat, lng):
        """Nearest "City, ST" for a point on the route, or None if unavailable.

        Log remarks need the nearest city at every stop, so the bundled city
        list answers first; the place search only covers points outside the US.
        """
        city = _nearest_city(lat, lng)
        if city:
            return city
        key = f"reverse:{lat:.2f}:{lng:.2f}"
        short = cache.get(key)
        if short is None:
            try:
                short = self.places.reverse(lat, lng)
            except GeoError:
                return None
            if short:
                cache.set(key, short)
        return short

    def route(self, places):
        return self.router.route(places)


def default_service():
    return MapService(Photon(settings.PHOTON_URL), Osrm(settings.OSRM_URL))
