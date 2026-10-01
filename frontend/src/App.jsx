import { useRef, useState } from 'react'
import { defaultStart } from './format'
import LogSheet from './components/LogSheet'
import RouteMap from './components/RouteMap'
import Summary from './components/Summary'
import Timeline from './components/Timeline'
import TripForm from './components/TripForm'
import useTripPlan, { tripKey } from './useTripPlan'

const EMPTY = { text: '', place: null }
const EXAMPLE = {
  current: { text: 'Chicago, IL', place: null },
  pickup: { text: 'Dallas, TX', place: null },
  dropoff: { text: 'Los Angeles, CA', place: null },
  cycle: '32',
}

export default function App() {
  const [form, setForm] = useState({
    current: EMPTY, pickup: EMPTY, dropoff: EMPTY,
    cycle: '0', start: defaultStart(),
    driver: '', carrier: '', office: '', truck: '',
  })
  const { plan, error, loading, key, submit: requestPlan } = useTripPlan()
  const [focus, setFocus] = useState(null)
  const mapRef = useRef(null)
  // the form has been edited since the plan or error on screen was requested
  const edited = key !== null && key !== tripKey(form)

  async function submit(values = form) {
    if (await requestPlan(values)) setFocus(null)
  }

  function fillExample() {
    const values = { ...form, ...EXAMPLE }
    setForm(values)
    submit(values)
  }

  function focusStop(stop) {
    setFocus({ lat: stop.lat, lng: stop.lng, at: stop.start })
    // on phones the map is above the list
    mapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }

  return (
    <>
      <header className="masthead">
        <a className="brand" href="/">
          <svg viewBox="0 0 32 32" aria-hidden="true">
            <rect width="32" height="32" rx="6" />
            <path d="M5 11h7v10h8V15h7" />
          </svg>
          Roadlog
        </a>
        <p>Trip planning and daily logs for property-carrying drivers, 70 hours in 8 days</p>
      </header>

      <main>
        <div className={plan ? 'planner has-plan' : 'planner'}>
          <aside className="panel">
            <h1>Plan a trip that stays inside your hours</h1>
            <TripForm
              form={form}
              setForm={setForm}
              onSubmit={() => submit()}
              onExample={fillExample}
              loading={loading}
            />
            {error && !edited && <p className="error" role="alert">{error}</p>}
            {plan && (
              <>
                {edited && !loading && (
                  <p className="stale" role="status">
                    The trip details have changed. Plan the trip again to update the
                    route and log sheets below.
                  </p>
                )}
                <Summary plan={plan} />
                <h2>Route and stops</h2>
                <Timeline plan={plan} onFocus={focusStop} />
              </>
            )}
          </aside>

          <div className="map-wrap" ref={mapRef}>
            <RouteMap plan={plan} focus={focus} />
            {!plan && !loading && (
              <p className="map-note">
                Enter where you are, the pickup and the drop-off. The route, required
                stops and log sheets appear here.
              </p>
            )}
            {loading && <p className="map-note">Finding the route and fitting it to your hours…</p>}
          </div>
        </div>

        {plan && (
          <section className="logs">
            <div className="logs-head">
              <div>
                <h2>Daily log sheets</h2>
                <p>
                  {plan.logs.length} {plan.logs.length > 1 ? 'sheets' : 'sheet'}, one per
                  calendar day, in home terminal time.
                </p>
              </div>
              <button className="secondary" type="button" onClick={() => window.print()}>
                Print log sheets
              </button>
            </div>
            {plan.logs.map((log) => (
              <LogSheet key={log.date} log={log} details={form} totalDays={plan.logs.length} />
            ))}
            <p className="assumptions">
              Planned for a property-carrying driver on the 70-hour/8-day cycle with no
              adverse driving conditions: at most 11 hours of driving inside a 14-hour
              window, a 30-minute break after 8 hours of driving, 10 hours of rest between
              shifts, a 34-hour restart when the cycle runs out, fuel at least every 1,000
              miles, 1 hour each for pickup and drop-off, and a 15-minute pre-trip
              inspection at the start of every shift.
            </p>
          </section>
        )}
      </main>
    </>
  )
}
