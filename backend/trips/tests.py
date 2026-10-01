from datetime import datetime
from unittest import mock

from django.core.cache import cache
from django.test import SimpleTestCase, override_settings
from rest_framework.throttling import AnonRateThrottle

from . import geo, hos
from .planning import build_plan


def plan(*legs, cycle=0, start=6 * 60):
    return hos.plan_trip([hos.Leg(*leg) for leg in legs], cycle, start)


def shifts(segments):
    """Split the timeline into shifts separated by 10+ hours of rest."""
    shift = []
    for seg in segments:
        resting = seg.status in (hos.OFF_DUTY, hos.SLEEPER) and seg.minutes >= 600
        if resting:
            if shift:
                yield shift
            shift = []
        else:
            shift.append(seg)
    if shift:
        yield shift


class ComplianceTests(SimpleTestCase):
    def assert_compliant(self, planner):
        segments = planner.segments
        for a, b in zip(segments, segments[1:]):
            self.assertEqual(a.end, b.start)
        self.assertEqual(segments[0].start, 0)
        self.assertEqual(segments[-1].end % hos.DAY, 0)

        for shift in shifts(segments):
            driving = [s for s in shift if s.status == hos.DRIVING]
            if not driving:
                continue
            work = [s for s in shift if s.status != hos.OFF_DUTY]
            self.assertLessEqual(sum(s.minutes for s in driving), 11 * 60)
            self.assertLessEqual(driving[-1].end - work[0].start, 14 * 60)
            since_break = 0
            for seg in shift:
                if seg.status == hos.DRIVING:
                    since_break += seg.minutes
                    self.assertLessEqual(since_break, 8 * 60)
                elif seg.minutes >= 30:
                    since_break = 0

        cycle, since_fuel = planner.cycle_used, 0.0
        for seg in segments:
            if seg.status == hos.DRIVING:
                # No driving once 70 on-duty hours are used.
                self.assertLess(cycle, 70 * 60)
                since_fuel += seg.miles
                self.assertLessEqual(since_fuel, 1000 + 1e-6)
            if seg.status in (hos.DRIVING, hos.ON_DUTY):
                cycle += seg.minutes
            if seg.kind == "fuel":
                since_fuel = 0.0
            if seg.resets_cycle:
                cycle = 0

    def test_short_trip_fits_one_day(self):
        planner = plan((100, 50, "pickup"), (150, 50, "dropoff"))
        self.assert_compliant(planner)
        kinds = [s.kind for s in planner.segments]
        self.assertEqual(
            kinds,
            ["before_trip", "pre_trip", "driving", "pickup", "driving", "dropoff", "off_duty"],
        )
        self.assertEqual(planner.segments[-1].end, hos.DAY)

    def test_long_trip_takes_breaks_rests_and_fuel(self):
        planner = plan((300, 60, "pickup"), (2500, 60, "dropoff"))
        self.assert_compliant(planner)
        kinds = [s.kind for s in planner.segments]
        self.assertEqual(kinds.count("fuel"), 2)
        self.assertIn("break", kinds)
        self.assertGreaterEqual(kinds.count("rest"), 3)
        miles = sum(s.miles for s in planner.segments)
        self.assertAlmostEqual(miles, 2800, places=3)

    def test_cycle_limit_forces_restart(self):
        planner = plan((60, 60, "pickup"), (900, 60, "dropoff"), cycle=62)
        self.assert_compliant(planner)
        self.assertIn("restart", [s.kind for s in planner.segments])

    def test_exhausted_cycle_restarts_before_driving(self):
        planner = plan((60, 60, "pickup"), (60, 60, "dropoff"), cycle=70)
        self.assert_compliant(planner)
        self.assertEqual(planner.segments[1].kind, "restart")

    def test_no_fuel_stop_on_the_last_of_the_cycle(self):
        # 1,000 miles come up with about two minutes of the cycle left.
        planner = plan((1200, 60, "pickup"), (10, 60, "dropoff"), cycle=52.8)
        self.assert_compliant(planner)
        kinds = [s.kind for s in planner.segments]
        self.assertIn("restart", kinds)
        self.assertNotIn(("fuel", "restart"), list(zip(kinds, kinds[1:])))
        cycle = planner.cycle_used
        for seg in planner.segments:
            if seg.resets_cycle:
                cycle = 0
            elif seg.status in (hos.DRIVING, hos.ON_DUTY):
                cycle += seg.minutes
                if seg.kind in ("fuel", "pre_trip", "driving"):
                    self.assertLessEqual(cycle, 70 * 60)

    def test_restart_takes_the_place_of_a_rest(self):
        # The cycle runs out during the fourth shift, so the third ends in a
        # restart and the driver never stops for 10 hours and then 34.
        planner = plan((967, 56.5, "pickup"), (1438, 58, "dropoff"), cycle=32)
        self.assert_compliant(planner)
        kinds = [s.kind for s in planner.segments]
        self.assertEqual(kinds.count("restart"), 1)
        self.assertEqual(kinds.count("rest"), 2)
        before = planner.segments[kinds.index("restart") - 1]
        self.assertEqual(before.status, hos.DRIVING)
        self.assertGreater(before.minutes, 60)

    def test_rest_when_the_trip_ends_inside_the_cycle(self):
        # Little cycle left, but enough to finish: no reason to sit for 34 hours.
        planner = plan((0, 60, "pickup"), (720, 60, "dropoff"), cycle=55)
        self.assert_compliant(planner)
        kinds = [s.kind for s in planner.segments]
        self.assertIn("rest", kinds)
        self.assertNotIn("restart", kinds)

    def test_unloading_may_pass_the_cycle_limit_but_driving_may_not(self):
        # Pickup and 7 hours of driving bring the cycle to 69 h 30 min at the dock.
        planner = plan((0, 60, "pickup"), (420, 60, "dropoff"), cycle=61.5)
        self.assert_compliant(planner)
        kinds = [s.kind for s in planner.segments]
        self.assertNotIn("restart", kinds)
        self.assertEqual(planner.cycle, 70 * 60 + 30)

    def test_pickup_at_current_location(self):
        planner = plan((0, 60, "pickup"), (120, 60, "dropoff"))
        self.assert_compliant(planner)
        self.assertEqual(planner.segments[1].kind, "pickup")

    def test_many_start_times_and_distances(self):
        for start in (0, 5 * 60 + 45, 13 * 60, 23 * 60 + 30):
            for miles in (40, 480, 700, 1340, 3100):
                for cycle in (0, 35.5, 66):
                    planner = plan(
                        (miles / 4, 57, "pickup"), (miles, 63, "dropoff"),
                        cycle=cycle, start=start,
                    )
                    self.assert_compliant(planner)


class DailyLogTests(SimpleTestCase):
    def test_every_sheet_totals_24_hours(self):
        planner = plan((300, 60, "pickup"), (2500, 60, "dropoff"), cycle=20)
        logs = hos.daily_logs(planner.segments, planner.cycle_used)
        self.assertEqual(len(logs), planner.segments[-1].end // hos.DAY)
        for log in logs:
            self.assertAlmostEqual(sum(log["totals"].values()), 24, places=1)
            self.assertEqual(log["entries"][0]["start"], 0)
            self.assertEqual(log["entries"][-1]["end"], hos.DAY)
        self.assertAlmostEqual(sum(log["miles"] for log in logs), 2800, delta=len(logs))

    def test_midnight_start_still_gets_first_remark(self):
        planner = plan((100, 50, "pickup"), (150, 50, "dropoff"), start=0)
        log = hos.daily_logs(planner.segments, planner.cycle_used)[0]
        self.assertEqual(log["remarks"][0]["minute"], 0)
        self.assertEqual(log["remarks"][0]["note"], "Pre-trip inspection")

    def test_no_remark_for_hours_before_trip(self):
        planner = plan((100, 50, "pickup"), (150, 50, "dropoff"), start=480)
        log = hos.daily_logs(planner.segments, planner.cycle_used)[0]
        self.assertEqual(log["remarks"][0]["minute"], 480)

    def test_recap_tracks_cycle(self):
        planner = plan((100, 50, "pickup"), (150, 50, "dropoff"), cycle=10)
        log = hos.daily_logs(planner.segments, planner.cycle_used)[0]
        # 15 min pre-trip + 5 h driving + 2 h pickup and drop-off.
        self.assertEqual(log["recap"]["on_duty_today"], 7.25)
        self.assertEqual(log["recap"]["cycle_used"], 17.25)
        self.assertEqual(log["recap"]["cycle_available"], 52.75)


def fake_route(places):
    # straight line Dallas -> Fort Worth -> Abilene, roughly
    coords = [(-96.80, 32.78), (-97.33, 32.75), (-99.73, 32.45)]
    return geo.Route(coords, [{"miles": 32.0, "hours": 0.6}, {"miles": 150.0, "hours": 2.4}])


class FakeMaps:
    """A map provider that never touches the network."""

    def geocode(self, query):
        return {"label": query, "short": query, "lat": 32.78, "lng": -96.80}

    def route(self, places):
        return fake_route(places)

    def reverse(self, lat, lng):
        return "Somewhere, TX"


class BuildPlanTests(SimpleTestCase):
    def test_plans_with_any_map_provider(self):
        data = {
            "current_location": "Dallas, TX",
            "pickup_location": "Fort Worth, TX",
            "dropoff_location": "Abilene, TX",
            "current_cycle_used": 0,
            "start_time": datetime(2026, 10, 1, 6, 0, 30),
        }
        result = build_plan(data, FakeMaps())
        self.assertEqual(result["summary"]["miles"], 182.0)
        self.assertEqual(result["locations"]["pickup"]["label"], "Fort Worth, TX")
        self.assertEqual(result["logs"][0]["to"], "Abilene, TX")
        self.assertEqual(result["summary"]["start"], "2026-10-01T06:00")


class MapServiceTests(SimpleTestCase):
    def setUp(self):
        cache.clear()

    def test_geocode_asks_the_place_search_once(self):
        places = mock.Mock()
        places.search.return_value = [{"label": "Dallas, TX", "short": "Dallas, TX", "lat": 1, "lng": 2}]
        maps = geo.MapService(places, router=mock.Mock())
        self.assertEqual(maps.geocode("Dallas, TX")["lat"], 1)
        self.assertEqual(maps.geocode(" dallas, tx ")["lat"], 1)
        places.search.assert_called_once_with("Dallas, TX", limit=1)

    def test_geocode_unknown_place(self):
        places = mock.Mock()
        places.search.return_value = []
        with self.assertRaises(geo.GeoError):
            geo.MapService(places, router=mock.Mock()).geocode("nowhere at all")

    def test_reverse_uses_bundled_cities_in_the_us(self):
        places = mock.Mock()
        maps = geo.MapService(places, router=mock.Mock())
        self.assertEqual(maps.reverse(41.8858, -87.6181), "Chicago, IL")
        places.reverse.assert_not_called()

    def test_reverse_outside_the_us_survives_an_outage(self):
        places = mock.Mock()
        places.reverse.side_effect = geo.Unavailable("down")
        maps = geo.MapService(places, router=mock.Mock())
        self.assertIsNone(maps.reverse(60.0, -110.0))


class ApiTests(SimpleTestCase):
    payload = {
        "current_location": {"label": "Dallas, TX", "lat": 32.78, "lng": -96.80},
        "pickup_location": {"label": "Fort Worth, TX", "lat": 32.75, "lng": -97.33},
        "dropoff_location": {"label": "Abilene, TX", "lat": 32.45, "lng": -99.73},
        "current_cycle_used": 12,
        "start_time": "2026-10-01T08:00",
    }

    def setUp(self):
        cache.clear()  # throttle counters live in the cache

    def post(self, **changes):
        return self.client.post(
            "/api/trips/plan/", {**self.payload, **changes}, content_type="application/json"
        )

    @mock.patch("trips.geo.Osrm.route", side_effect=fake_route)
    def test_plan(self, _):
        response = self.post()
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["summary"]["miles"], 182.0)
        self.assertEqual(body["summary"]["start"], "2026-10-01T08:00")
        self.assertEqual([s["kind"] for s in body["stops"]], ["pickup", "dropoff"])
        self.assertEqual(len(body["logs"]), 1)
        self.assertEqual(body["logs"][0]["date"], "2026-10-01")
        self.assertEqual(body["logs"][0]["from"], "Dallas, TX")
        self.assertEqual(body["logs"][0]["to"], "Abilene, TX")
        self.assertEqual(body["timeline"][0]["kind"], "pre_trip")

    @mock.patch("trips.geo.Osrm.route", side_effect=fake_route)
    def test_start_time_keeps_its_clock_time(self, _):
        body = self.post(start_time="2026-10-01T23:50:00+05:00").json()
        self.assertEqual(body["summary"]["start"], "2026-10-01T23:50")

    @mock.patch(
        "trips.geo.Osrm.route",
        return_value=geo.Route(
            [(-96.80, 32.78)] * 3, [{"miles": 0.0, "hours": 0.0}] * 2
        ),
    )
    def test_same_place_three_times(self, _):
        response = self.post()
        self.assertEqual(response.status_code, 422)
        self.assertIn("same place", response.json()["detail"])

    def test_rejects_bad_input(self):
        self.assertEqual(self.post(current_cycle_used=71).status_code, 400)
        self.assertEqual(self.post(current_cycle_used=-1).status_code, 400)
        self.assertEqual(self.post(pickup_location="  ").status_code, 400)
        self.assertEqual(self.post(dropoff_location={"lat": 95, "lng": 0}).status_code, 400)
        self.assertEqual(self.post(start_time="tomorrow").status_code, 400)
        self.assertEqual(self.post(current_cycle_used="nan").status_code, 400)
        self.assertEqual(self.post(current_cycle_used="inf").status_code, 400)
        self.assertEqual(self.post(start_time="9999-12-31T23:59").status_code, 400)
        self.assertEqual(self.post(start_time="0001-01-01T00:00").status_code, 400)
        self.assertEqual(self.post(current_location={"lat": "nan", "lng": 0}).status_code, 400)
        self.assertEqual(self.post(current_location=["Dallas"]).status_code, 400)
        missing = {k: v for k, v in self.payload.items() if k != "start_time"}
        response = self.client.post("/api/trips/plan/", missing, content_type="application/json")
        self.assertEqual(response.status_code, 400)

    @mock.patch("trips.geo.Osrm.route", side_effect=fake_route)
    def test_markup_in_a_label_comes_back_as_json_text(self, _):
        label = "<img src=x onerror=alert(1)>"
        response = self.post(current_location={"label": label, "lat": 32.78, "lng": -96.80})
        self.assertEqual(response["Content-Type"], "application/json")
        self.assertEqual(response["X-Content-Type-Options"], "nosniff")
        self.assertEqual(response.json()["locations"]["current"]["label"], label)

    def test_security_headers(self):
        response = self.client.get("/api/health/")
        self.assertEqual(response["X-Frame-Options"], "DENY")
        self.assertEqual(response["X-Content-Type-Options"], "nosniff")

    @override_settings(ALLOWED_HOSTS=["localhost"])
    def test_unknown_host_is_refused(self):
        self.assertEqual(self.client.get("/api/health/", HTTP_HOST="evil.example").status_code, 400)

    def test_rate_limit(self):
        with mock.patch.object(AnonRateThrottle, "get_rate", return_value="3/min"):
            codes = [self.client.get("/api/health/").status_code for _ in range(5)]
        self.assertEqual(codes, [200, 200, 200, 429, 429])

    def test_forwarded_for_header_does_not_reset_the_rate_limit(self):
        with mock.patch.object(AnonRateThrottle, "get_rate", return_value="3/min"):
            codes = [
                self.client.get("/api/health/", HTTP_X_FORWARDED_FOR=f"10.0.0.{i}").status_code
                for i in range(5)
            ]
        self.assertEqual(codes, [200, 200, 200, 429, 429])

    @mock.patch("trips.geo.Osrm.route", side_effect=geo.Unavailable("down"))
    def test_map_service_down(self, _):
        self.assertEqual(self.post().status_code, 503)

    @mock.patch("trips.geo.Osrm.route", side_effect=geo.GeoError("No drivable route connects those locations."))
    def test_no_route(self, _):
        response = self.post()
        self.assertEqual(response.status_code, 422)
        self.assertIn("No drivable route", response.json()["detail"])

    @mock.patch("trips.geo.Photon.search", side_effect=geo.GeoError("down"))
    def test_suggestions_fail_quietly(self, _):
        self.assertEqual(self.client.get("/api/locations/?q=dallas").json(), [])
        self.assertEqual(self.client.get("/api/locations/?q=da").json(), [])
