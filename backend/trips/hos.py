"""Hours-of-service scheduling for a property-carrying driver (70 hrs / 8 days).

All times are whole minutes counted from midnight of the day the trip starts,
in home terminal time.
"""

import math
from dataclasses import dataclass, field

OFF_DUTY = "off_duty"
SLEEPER = "sleeper_berth"
DRIVING = "driving"
ON_DUTY = "on_duty"

STATUSES = (OFF_DUTY, SLEEPER, DRIVING, ON_DUTY)
DAY = 24 * 60

# What a leg can end in: the remark for the log. How long it takes is the
# field of the same name on Rules.
ARRIVALS = {"pickup": "Pickup, loading", "dropoff": "Drop-off, unloading"}


@dataclass(frozen=True)
class Rules:
    max_driving: int = 11 * 60  # driving allowed per shift
    duty_window: int = 14 * 60  # consecutive window driving must fit in
    break_after: int = 8 * 60  # cumulative driving before a 30-minute break
    break_length: int = 30
    daily_rest: int = 10 * 60  # consecutive rest that resets the shift
    cycle_limit: int = 70 * 60  # on-duty time allowed in 8 days
    restart: int = 34 * 60  # consecutive off duty that resets the cycle
    fuel_interval_miles: float = 1000.0
    fuel_stop: int = 30
    pre_trip: int = 15
    pickup: int = 60
    dropoff: int = 60


@dataclass
class Leg:
    miles: float
    speed_mph: float
    # What happens at the end of the leg, a key of ARRIVALS.
    arrival: str


@dataclass
class Segment:
    status: str
    start: int
    end: int
    kind: str
    note: str
    # Miles into the route where the segment begins, and miles it covers.
    mile: float = 0.0
    miles: float = 0.0
    resets_cycle: bool = False
    location: str = ""
    lat: float | None = None
    lng: float | None = None

    @property
    def minutes(self):
        return self.end - self.start


@dataclass
class Planner:
    cycle_used: int
    start: int
    rules: Rules = field(default_factory=Rules)

    def __post_init__(self):
        self.t = self.start
        self.segments: list[Segment] = []
        self.mile = 0.0
        self.shift_driving = 0
        self.window_start = None  # None until the driver comes on duty
        self.since_break = 0
        self.cycle = self.cycle_used
        self.fuel_miles = 0.0
        self.driving_ahead = 0  # minutes of driving on the legs after this one
        if self.start > 0:
            self.segments.append(
                Segment(OFF_DUTY, 0, self.start, "before_trip", "Off duty")
            )

    def _add(self, status, minutes, kind, note, miles=0.0, resets_cycle=False):
        segment = Segment(
            status, self.t, self.t + minutes, kind, note,
            mile=self.mile, miles=miles, resets_cycle=resets_cycle,
        )
        self.segments.append(segment)
        self.t += minutes
        self.mile += miles
        return segment

    def _on_duty(self, minutes, kind, note):
        # The cycle limit stops driving, not work (49 CFR 395.3(b)), so loading
        # or unloading may run the cycle past it; drive() restarts before the
        # next mile.
        if self.window_start is None:
            self.window_start = self.t
        self._add(ON_DUTY, minutes, kind, note)
        self.cycle += minutes
        if minutes >= self.rules.break_length:
            # Any 30 consecutive minutes not driving satisfies the break.
            self.since_break = 0

    def _reset_shift(self):
        self.shift_driving = 0
        self.window_start = None
        self.since_break = 0

    def _rest(self, driving_left):
        """End the shift. `driving_left` is the minutes of driving still to do.

        A restart includes the daily rest, so when the cycle would run out
        partway through the next shift the restart is taken now, not as a
        second long stop a few hours down the road.
        """
        r = self.rules
        next_shift = r.pre_trip + min(r.max_driving, driving_left)
        if self.cycle + next_shift > r.cycle_limit:
            self._restart()
            return
        self._add(SLEEPER, r.daily_rest, "rest", "10-hour rest")
        self._reset_shift()

    def _restart(self):
        self._add(
            OFF_DUTY, self.rules.restart, "restart", "34-hour restart",
            resets_cycle=True,
        )
        self.cycle = 0
        self._reset_shift()

    def _break(self):
        self._add(OFF_DUTY, self.rules.break_length, "break", "30-minute break")
        self.since_break = 0

    def _fuel(self):
        self._on_duty(self.rules.fuel_stop, "fuel", "Fueling")
        self.fuel_miles = 0.0

    def _cycle_cannot_fit(self, minutes):
        """True if `minutes` on duty would leave no cycle time to drive after."""
        return self.cycle + minutes >= self.rules.cycle_limit

    def drive(self, leg: Leg):
        r = self.rules
        remaining = leg.miles
        miles_per_minute = leg.speed_mph / 60

        while remaining > 1e-6:
            if self.cycle >= r.cycle_limit:
                self._restart()
                continue
            if self.window_start is None:
                if self._cycle_cannot_fit(r.pre_trip):
                    self._restart()
                    continue
                self._on_duty(r.pre_trip, "pre_trip", "Pre-trip inspection")
                continue

            window_left = r.duty_window - (self.t - self.window_start)
            driving_left = r.max_driving - self.shift_driving
            trip_left = math.ceil(remaining / miles_per_minute) + self.driving_ahead
            if window_left <= 0 or driving_left <= 0:
                self._rest(trip_left)
                continue
            if self.since_break >= r.break_after:
                # A break that would run out the window is pointless; rest.
                if window_left <= r.break_length:
                    self._rest(trip_left)
                else:
                    self._break()
                continue
            fuel_left = r.fuel_interval_miles - self.fuel_miles
            if fuel_left <= 1e-6:
                # Fueling on the last of the cycle only pushes it past the
                # limit; restart first and fuel on the way out.
                if self._cycle_cannot_fit(r.fuel_stop):
                    self._restart()
                else:
                    self._fuel()
                continue

            minutes = min(
                driving_left,
                window_left,
                r.break_after - self.since_break,
                r.cycle_limit - self.cycle,
                math.ceil(remaining / miles_per_minute - 1e-9),
                math.ceil(fuel_left / miles_per_minute - 1e-9),
            )
            miles = min(remaining, minutes * miles_per_minute, fuel_left)
            self._add(DRIVING, minutes, "driving", "Driving", miles=miles)
            remaining -= miles
            self.shift_driving += minutes
            self.since_break += minutes
            self.cycle += minutes
            self.fuel_miles += miles

    def run(self, legs):
        r = self.rules
        for i, leg in enumerate(legs):
            self.driving_ahead = sum(
                math.ceil(later.miles / later.speed_mph * 60) for later in legs[i + 1:]
            )
            self.drive(leg)
            self._on_duty(getattr(r, leg.arrival), leg.arrival, ARRIVALS[leg.arrival])
        self.arrival = self.t
        # Close out the final log sheet off duty.
        tail = -self.t % DAY
        if tail:
            self._add(OFF_DUTY, tail, "off_duty", "Off duty")
        return self.segments


def plan_trip(legs, cycle_used_hours, start_minute, rules=None):
    planner = Planner(
        cycle_used=round(cycle_used_hours * 60),
        start=start_minute,
        rules=rules or Rules(),
    )
    planner.run(legs)
    return planner


def _hours(minutes):
    return round(minutes / 60, 2)


def daily_logs(segments, cycle_used_minutes, rules=None):
    """One log sheet per calendar day."""
    rules = rules or Rules()
    total_days = segments[-1].end // DAY
    cycle = cycle_used_minutes
    logs = []

    for day in range(total_days):
        day_start, day_end = day * DAY, (day + 1) * DAY
        totals = dict.fromkeys(STATUSES, 0)
        entries, remarks = [], []
        miles = 0.0
        first_location = last_location = ""

        for seg in segments:
            start, end = max(seg.start, day_start), min(seg.end, day_end)
            if start >= end:
                continue
            minutes = end - start
            totals[seg.status] += minutes
            if seg.miles:
                miles += seg.miles * minutes / seg.minutes
            if seg.status in (DRIVING, ON_DUTY):
                cycle += minutes
            if seg.resets_cycle and seg.end <= day_end:
                cycle = 0

            # Adjacent segments in the same status are one line on the grid.
            if entries and entries[-1]["status"] == seg.status:
                entries[-1]["end"] = end - day_start
            else:
                entries.append(
                    {"status": seg.status, "start": start - day_start,
                     "end": end - day_start}
                )

            first_location = first_location or seg.location
            last_location = seg.location or last_location
            # Remarks go where the status changes, so not for a segment
            # carried over from yesterday or the hours before the trip.
            if seg.start >= day_start and seg.kind != "before_trip":
                remarks.append(
                    {"minute": seg.start - day_start, "status": seg.status,
                     "location": seg.location, "note": seg.note}
                )

        on_duty_today = totals[DRIVING] + totals[ON_DUTY]
        logs.append({
            "day": day + 1,
            "entries": entries,
            "totals": {status: _hours(m) for status, m in totals.items()},
            "miles": round(miles),
            "from": first_location,
            "to": last_location,
            "remarks": remarks,
            "recap": {
                "on_duty_today": _hours(on_duty_today),
                "cycle_used": _hours(cycle),
                "cycle_available": _hours(max(0, rules.cycle_limit - cycle)),
            },
        })
    return logs
