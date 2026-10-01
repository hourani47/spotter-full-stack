import PropTypes from 'prop-types'
import { segmentType } from '../propTypes'
import { formatDay, formatDuration, formatMiles, formatTime } from '../format'

// the planner can split one stretch of driving in two; show it as one step
function mergeDriving(timeline) {
  const steps = []
  for (const seg of timeline) {
    const last = steps[steps.length - 1]
    if (last && last.kind === 'driving' && seg.kind === 'driving') {
      last.minutes += seg.minutes
      last.miles += seg.miles
      last.end = seg.end
    } else {
      steps.push({ ...seg })
    }
  }
  return steps
}

function describe(step, next) {
  switch (step.kind) {
    case 'driving':
      return `Drive ${formatMiles(step.miles)} mi${next ? ` to ${next.location}` : ''}`
    case 'pre_trip':
      return 'Pre-trip inspection'
    case 'pickup':
      return 'Pick up the load'
    case 'dropoff':
      return 'Drop off the load'
    case 'fuel':
      return 'Stop for fuel'
    case 'break':
      return 'Take a 30-minute break'
    case 'rest':
      return 'Rest 10 hours in the sleeper berth'
    case 'restart':
      return 'Take a 34-hour restart'
    default:
      return step.note
  }
}

const REASONS = {
  break: '8 hours of driving since the last break',
  rest: 'Driving limit or 14-hour window reached',
  restart: '70-hour cycle used up',
  fuel: '1,000 miles since the last fill',
}

export default function Timeline({ plan, onFocus }) {
  const steps = mergeDriving(plan.timeline)
  let day = null

  return (
    <ol className="timeline">
      {steps.map((step, index) => {
        const heading = formatDay(step.start)
        const showDay = heading !== day
        day = heading
        return (
          <li key={step.start} className={`step status-${step.status}`}>
            {showDay && <h3 className="day">{heading}</h3>}
            <button type="button" onClick={() => onFocus(step)}>
              <time>{formatTime(step.start)}</time>
              <span className="dot" aria-hidden="true" />
              <span className="what">
                <strong>{describe(step, steps[index + 1])}</strong>
                <span>
                  {step.kind === 'driving' ? `From ${step.location}` : step.location}
                  {', '}
                  {formatDuration(step.minutes)}
                </span>
                {REASONS[step.kind] && <em>{REASONS[step.kind]}</em>}
              </span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}

Timeline.propTypes = {
  plan: PropTypes.shape({ timeline: PropTypes.arrayOf(segmentType).isRequired }).isRequired,
  onFocus: PropTypes.func.isRequired,
}
