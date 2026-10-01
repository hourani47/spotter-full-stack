# Roadlog: ELD trip planner

Enter where the truck is, the pickup, the drop-off and the cycle hours already
used. Roadlog returns the route on a map, every stop the Hours of Service rules
require, and a filled-out driver's daily log sheet for each day of the trip.

Live: https://spotter-roadlog.vercel.app (API: https://spotter-roadlog-api.vercel.app/api/health/)

- `backend/` Django + Django REST Framework API (stateless, no database)
- `frontend/` React (Vite) app with a Leaflet map and SVG log sheets
- `docs/` the assessment brief and the FMCSA reference material

## How the trip is planned

`backend/trips/hos.py` simulates the trip minute by minute for a
property-carrying driver on the 70-hour/8-day cycle:

| Rule | Applied as |
| --- | --- |
| 11-hour driving limit | 10 hours in the sleeper berth once 11 hours are driven |
| 14-hour driving window | No driving after the 14th hour since coming on duty |
| 30-minute break | After 8 cumulative hours of driving; any 30-minute non-driving stop (fuel, pickup) also counts |
| 70 hours / 8 days | A 34-hour restart when the cycle is used up. It takes the place of the last 10-hour rest before the cycle would run out, and comes before a fuel stop or pre-trip inspection that would use the last of it |
| Fuel | A 30-minute on-duty stop at least every 1,000 miles |
| Pickup and drop-off | 1 hour on duty (not driving) each. The 70-hour limit forbids driving, not working, so unloading may take the recap past 70; no driving follows without a restart |
| Pre-trip inspection | 15 minutes on duty at the start of every shift |

Other assumptions: the driver starts the trip rested (10 hours off duty), all
"cycle hours used" stay in the 8-day window for the length of the trip, speed
comes from the router and is capped at 65 mph, and times are home terminal time
(an offset on `start_time` is ignored, not converted).

The timeline is then cut at midnight into one log sheet per day, with totals
per duty status, miles driven, a remark for each change of duty status (nearest
city and state) and the 70-hour recap.

## How the code is laid out

- `backend/trips/hos.py` the Hours of Service planner. Plain Python, no Django, no network.
- `backend/trips/geo.py` `MapService`, which is handed a place search (`Photon`)
  and a router (`Osrm`). Either can be replaced by anything with the same methods.
- `backend/trips/planning.py` `build_plan(data, maps)` ties the two together.
- `backend/trips/views.py` validates the request and maps errors to status codes.
- `frontend/src/useTripPlan.js` requests a plan and holds its state;
  `frontend/src/components/` draws the form, map, timeline and log sheets.
- `frontend/src/styles.css` starts with the design tokens: palette, light and
  dark theme colours, type scale and spacing scale. The log sheets stay paper
  white in the dark theme, as they are meant for printing.

Tests: `python manage.py test` (planner compliance, log sheets, map service,
API) and `npm test` (formatting, API client, components). Both run in CI
(`.github/workflows/ci.yml`) along with lint and the production build.

## Free map services

- Routing: [OSRM](https://project-osrm.org/) public server
- Place search: [Photon](https://photon.komoot.io/) (OpenStreetMap data)
- Map tiles: OpenStreetMap
- Stop names: a bundled list of US cities (`backend/trips/data/us_cities.csv`,
  from [kelvins/US-Cities-Database](https://github.com/kelvins/US-Cities-Database), MIT)

No API keys are needed.

## Run locally

```bash
# API on http://localhost:8000
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python manage.py test
DJANGO_DEBUG=1 python manage.py runserver

# App on http://localhost:5173 (proxies /api to the API above)
cd frontend
npm install
npm test
npm run dev
```

If port 8000 is taken, run the API elsewhere and start the app with
`API_PROXY=http://localhost:8765 npm run dev`.

## API

`POST /api/trips/plan/`

```json
{
  "current_location": "Chicago, IL",
  "pickup_location": "Dallas, TX",
  "dropoff_location": "Los Angeles, CA",
  "current_cycle_used": 32,
  "start_time": "2026-10-01T07:30"
}
```

All five fields are required. `start_time` is the clock at the home terminal.

Locations may be text or `{ "label", "short", "lat", "lng" }` objects.
The response holds `route`, `summary`, `timeline`, `stops` and `logs`.

`GET /api/locations/?q=dall` returns place suggestions.

## Security

- Every input is validated before it reaches the planner or a map service:
  coordinates in range, text at most 200 characters, cycle hours 0 to 70, start
  time between 2000 and 2100. Request bodies over 2.5 MB are refused.
- The API holds no data, cookies or accounts. It is rate limited to 120
  requests a minute per client address, taken from the platform proxy and not
  from a header the client controls.
- Requests for an unknown `Host` are refused, and responses carry
  `X-Frame-Options: DENY` and `X-Content-Type-Options: nosniff`.
- The app renders all text through React, so markup in a place or driver name
  is shown as text. `frontend/vercel.json` adds a Content-Security-Policy that
  only allows the app's own scripts, plus the other usual headers.
- `npm audit --omit=dev` and `pip-audit` report nothing. `npm audit` still
  lists a moderate advisory in Vitest, a test-only tool; its fix needs Node 20.

## Deploy on Vercel

Create two Vercel projects from this repository.

1. **API**: root directory `backend`. `backend/vercel.json` runs Django on the
   Python runtime. Set `DJANGO_SECRET_KEY` (required on Vercel) and
   `DJANGO_DEBUG=0`. Set `DJANGO_ALLOWED_HOSTS` if the API is served from a
   domain outside `.vercel.app`, and `REDIS_URL` so the rate limit is counted
   across serverless instances instead of per instance.
   The rate limit keys on the address Vercel's proxy reports (`NUM_PROXIES`
   defaults to 1 there); change it if the API sits behind more proxies.
2. **App**: root directory `frontend` (Vite preset). Set `VITE_API_URL` to the
   API project's URL, for example `https://roadlog-api.vercel.app`.
