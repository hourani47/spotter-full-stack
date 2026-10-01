import PropTypes from 'prop-types'
import { formType } from '../propTypes'
import { CYCLE_LIMIT } from '../format'
import LocationInput from './LocationInput'

export default function TripForm({ form, setForm, onSubmit, onExample, loading }) {
  const set = (name) => (value) => setForm((f) => ({ ...f, [name]: value }))
  const setText = (name) => (event) => set(name)(event.target.value)
  const cycle = Math.min(Math.max(Number(form.cycle) || 0, 0), CYCLE_LIMIT)

  return (
    <form
      className="trip-form"
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit()
      }}
    >
      <div className="route-fields">
        <LocationInput
          label="Current location"
          placeholder="Where the truck is now"
          value={form.current}
          onChange={set('current')}
        />
        <LocationInput
          label="Pickup location"
          placeholder="Where the load is picked up"
          value={form.pickup}
          onChange={set('pickup')}
        />
        <LocationInput
          label="Drop-off location"
          placeholder="Where the load is delivered"
          value={form.dropoff}
          onChange={set('dropoff')}
        />
      </div>

      <div className="field-row">
        <div className="field">
          <label htmlFor="cycle">Cycle hours used</label>
          <input
            id="cycle"
            type="number"
            required
            min="0"
            max={CYCLE_LIMIT}
            step="0.25"
            inputMode="decimal"
            value={form.cycle}
            onChange={setText('cycle')}
          />
        </div>
        <div className="field">
          <label htmlFor="start">Start time</label>
          <input
            id="start"
            type="datetime-local"
            required
            value={form.start}
            onChange={setText('start')}
          />
        </div>
      </div>
      <div className="cycle-meter" aria-hidden="true">
        <span style={{ width: `${(cycle / CYCLE_LIMIT) * 100}%` }} />
      </div>
      <p className="hint">
        {CYCLE_LIMIT - cycle} of {CYCLE_LIMIT} hours left in the 8-day cycle.
      </p>

      <details className="sheet-details">
        <summary>Driver and carrier details for the log sheet</summary>
        <div className="field">
          <label htmlFor="driver">Driver name</label>
          <input id="driver" type="text" value={form.driver} onChange={setText('driver')} />
        </div>
        <div className="field">
          <label htmlFor="carrier">Carrier name</label>
          <input id="carrier" type="text" value={form.carrier} onChange={setText('carrier')} />
        </div>
        <div className="field">
          <label htmlFor="office">Main office address</label>
          <input id="office" type="text" value={form.office} onChange={setText('office')} />
        </div>
        <div className="field">
          <label htmlFor="truck">Truck and trailer numbers</label>
          <input id="truck" type="text" value={form.truck} onChange={setText('truck')} />
        </div>
      </details>

      <button className="primary" type="submit" disabled={loading}>
        {loading ? 'Planning trip…' : 'Plan trip'}
      </button>
      <button className="link" type="button" onClick={onExample} disabled={loading}>
        Fill in an example: Chicago to Dallas to Los Angeles
      </button>
    </form>
  )
}

TripForm.propTypes = {
  form: formType.isRequired,
  setForm: PropTypes.func.isRequired,
  onSubmit: PropTypes.func.isRequired,
  onExample: PropTypes.func.isRequired,
  loading: PropTypes.bool.isRequired,
}
