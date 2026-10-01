import PropTypes from 'prop-types'
import { summaryType } from '../propTypes'
import { CYCLE_LIMIT, formatDay, formatDuration, formatHours, formatMiles, formatTime } from '../format'

export default function Summary({ plan }) {
  const { summary } = plan
  const stops = [
    [summary.fuel_stops, 'fuel stop'],
    [summary.breaks, '30-minute break'],
    [summary.rests, '10-hour rest'],
    [summary.restarts, '34-hour restart'],
  ]
    .filter(([count]) => count)
    .map(([count, name]) => `${count} ${name}${count > 1 ? 's' : ''}`)

  return (
    <section className="summary" aria-label="Trip summary">
      <dl>
        <div>
          <dt>Distance</dt>
          <dd>{formatMiles(summary.miles)} mi</dd>
        </div>
        <div>
          <dt>Driving</dt>
          <dd>{formatDuration(summary.driving_hours * 60)}</dd>
        </div>
        <div>
          <dt>Door to door</dt>
          <dd>{formatDuration(summary.total_hours * 60)}</dd>
        </div>
        <div>
          <dt>Delivered</dt>
          <dd>{formatDay(summary.arrival)}, {formatTime(summary.arrival)}</dd>
        </div>
      </dl>
      <p>
        {stops.length ? `Includes ${stops.join(', ')}. ` : 'No rest or fuel stops needed. '}
        The cycle stands at {formatHours(summary.cycle_used_end)} of {CYCLE_LIMIT} hours after drop-off.
      </p>
    </section>
  )
}

Summary.propTypes = {
  plan: PropTypes.shape({ summary: summaryType.isRequired }).isRequired,
}
