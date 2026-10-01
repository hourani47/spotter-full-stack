import PropTypes from 'prop-types'
import { detailsType, logType, remarkType } from '../propTypes'
import { STATUS, formatHours, formatMinute } from '../format'

// grid layout, in svg units
const GRID_X = 150
const HOUR = 31
const GRID_W = HOUR * 24
const BAND_Y = 232
const BAND_H = 30
const GRID_Y = BAND_Y + BAND_H
const ROW_H = 36
const GRID_H = ROW_H * 4
const GRID_BOTTOM = GRID_Y + GRID_H
const TOTAL_X = GRID_X + GRID_W + 46
// room a slanted remark needs before the next one
const LABEL_GAP = 18

const ROW_LABELS = [
  ['1. Off Duty'],
  ['2. Sleeper', 'Berth'],
  ['3. Driving'],
  ['4. On Duty', '(not driving)'],
]
const STATUS_KEYS = ['off_duty', 'sleeper_berth', 'driving', 'on_duty']

const x = (minute) => GRID_X + (minute / 60) * HOUR
const rowY = (status) => GRID_Y + STATUS[status].row * ROW_H + ROW_H / 2

function hourLabel(hour) {
  if (hour === 0 || hour === 24) return 'Mid-\nnight'
  if (hour === 12) return 'Noon'
  return String(hour > 12 ? hour - 12 : hour)
}

function Grid() {
  const ticks = []
  for (let row = 0; row < 4; row++) {
    const top = GRID_Y + row * ROW_H
    for (let quarter = 1; quarter < 96; quarter++) {
      if (quarter % 4 === 0) continue
      const length = quarter % 2 === 0 ? 16 : 9
      const tx = GRID_X + (quarter * HOUR) / 4
      ticks.push(<line key={`${row}-${quarter}`} x1={tx} x2={tx} y1={top} y2={top + length} />)
    }
  }
  return (
    <g className="grid">
      <rect className="band" x={GRID_X - 18} y={BAND_Y} width={GRID_W + 36} height={BAND_H} />
      {Array.from({ length: 25 }, (_, hour) => (
        <text key={hour} className="hour" x={x(hour * 60)} y={BAND_Y + (hour % 24 ? 20 : 13)}>
          {hourLabel(hour).split('\n').map((part, i) => (
            <tspan key={part} x={x(hour * 60)} dy={i ? 10 : 0}>{part}</tspan>
          ))}
        </text>
      ))}
      <rect className="frame" x={GRID_X} y={GRID_Y} width={GRID_W} height={GRID_H} />
      {[1, 2, 3].map((row) => (
        <line key={row} className="row" x1={GRID_X} x2={GRID_X + GRID_W} y1={GRID_Y + row * ROW_H} y2={GRID_Y + row * ROW_H} />
      ))}
      {Array.from({ length: 23 }, (_, i) => (
        <line key={i} className="hour-line" x1={x((i + 1) * 60)} x2={x((i + 1) * 60)} y1={GRID_Y} y2={GRID_BOTTOM} />
      ))}
      <g className="ticks">{ticks}</g>
      {ROW_LABELS.map((lines, row) => (
        <text key={row} className="row-label" x={18} y={GRID_Y + row * ROW_H + (lines.length > 1 ? 16 : 22)}>
          {lines.map((line, i) => (
            <tspan key={line} x={i ? 32 : 18} dy={i ? 12 : 0} className={i && row === 3 ? 'small' : undefined}>
              {line}
            </tspan>
          ))}
        </text>
      ))}
      <text className="hour dark" x={TOTAL_X} y={BAND_Y + 9}>
        <tspan x={TOTAL_X}>Total</tspan>
        <tspan x={TOTAL_X} dy={11}>Hours</tspan>
      </text>
    </g>
  )
}

function dutyPath(entries) {
  return entries
    .map((entry, i) => {
      const y = rowY(entry.status)
      return `${i ? 'L' : 'M'}${x(entry.start)} ${y} L${x(entry.end)} ${y}`
    })
    .join(' ')
}

function Remarks({ remarks }) {
  let lastLabelX = -Infinity
  return (
    <g className="remarks">
      {remarks.map((remark) => {
        const rx = x(remark.minute)
        // driving starts at a stop that's already labelled
        const labelled = remark.status !== 'driving'
        // stops close together would print on top of each other, so a label
        // slides right and its tick leans over to meet it
        const lx = labelled ? Math.max(rx, lastLabelX + LABEL_GAP) : rx
        if (labelled) lastLabelX = lx
        return (
          <g key={remark.minute}>
            {labelled ? (
              <polyline points={`${rx},${GRID_BOTTOM} ${rx},${GRID_BOTTOM + 6} ${lx},${GRID_BOTTOM + 14}`} />
            ) : (
              <line x1={rx} x2={rx} y1={GRID_BOTTOM} y2={GRID_BOTTOM + 7} />
            )}
            {labelled && (
              <text transform={`translate(${lx - 3} ${GRID_BOTTOM + 24}) rotate(52)`}>
                {remark.location}
                <tspan className="note"> {remark.note.toLowerCase()}</tspan>
              </text>
            )}
          </g>
        )
      })}
    </g>
  )
}

function Field({ x: fx, y, width, label, value }) {
  const tx = fx + width / 2
  return (
    <g>
      <text className="ink" x={tx} y={y - 5} textAnchor="middle">{value}</text>
      <line className="rule" x1={fx} x2={fx + width} y1={y} y2={y} />
      <text className="caption" x={tx} y={y + 13} textAnchor="middle">{label}</text>
    </g>
  )
}

export default function LogSheet({ log, details, totalDays }) {
  const [year, month, day] = log.date.split('-')
  // each total is rounded to 2 places, so the sum can come out as 23.99
  const total = Math.round(STATUS_KEYS.reduce((sum, key) => sum + log.totals[key], 0) * 10) / 10

  return (
    <article className="sheet">
      <svg viewBox="0 0 1000 690" role="img" aria-label={`Driver's daily log for ${log.date}, day ${log.day} of ${totalDays}`}>
        <text className="title" x={18} y={36}>Drivers Daily Log</text>
        <text className="caption" x={20} y={52}>(24 hours)</text>

        <Field x={270} y={38} width={70} label="(month)" value={month} />
        <text className="slash" x={349} y={36}>/</text>
        <Field x={364} y={38} width={70} label="(day)" value={day} />
        <text className="slash" x={443} y={36}>/</text>
        <Field x={458} y={38} width={80} label="(year)" value={year} />

        <text className="fine" x={600} y={26}>
          <tspan fontWeight="600">Original</tspan> - File at home terminal.
        </text>
        <text className="fine" x={600} y={42}>
          <tspan fontWeight="600">Duplicate</tspan> - Driver retains in his/her possession for 8 days.
        </text>

        <text className="label" x={40} y={88}>From:</text>
        <text className="ink" x={96} y={87}>{log.from}</text>
        <line className="rule" x1={90} x2={470} y1={92} y2={92} />
        <text className="label" x={500} y={88}>To:</text>
        <text className="ink" x={536} y={87}>{log.to}</text>
        <line className="rule" x1={530} x2={910} y1={92} y2={92} />

        <rect className="box" x={60} y={112} width={150} height={38} />
        <text className="ink big" x={135} y={139} textAnchor="middle">{log.miles}</text>
        <text className="caption" x={135} y={164} textAnchor="middle">Total Miles Driving Today</text>
        <rect className="box" x={226} y={112} width={150} height={38} />
        <text className="ink big" x={301} y={139} textAnchor="middle">{log.miles}</text>
        <text className="caption" x={301} y={164} textAnchor="middle">Total Mileage Today</text>

        <Field x={60} y={196} width={316} label="Truck/Tractor and Trailer Numbers or License Plate(s)/State (show each unit)" value={details.truck} />
        <Field x={440} y={128} width={470} label="Name of Carrier or Carriers" value={details.carrier} />
        <Field x={440} y={166} width={470} label="Main Office Address" value={details.office} />
        <Field x={440} y={204} width={470} label="Driver's Signature in Full" value={details.driver} />

        <Grid />
        <path className="duty" d={dutyPath(log.entries)} />

        {STATUS_KEYS.map((key, row) => (
          <g key={key}>
            <text className="ink big" x={TOTAL_X} y={GRID_Y + row * ROW_H + 26} textAnchor="middle">
              {formatHours(log.totals[key])}
            </text>
            <line className="rule" x1={TOTAL_X - 28} x2={TOTAL_X + 28} y1={GRID_Y + row * ROW_H + 31} y2={GRID_Y + row * ROW_H + 31} />
          </g>
        ))}
        <text className="ink big" x={TOTAL_X} y={GRID_BOTTOM + 26} textAnchor="middle">
          ={formatHours(total)}
        </text>

        <text className="label" x={18} y={GRID_BOTTOM + 30}>Remarks</text>
        <line className="margin" x1={GRID_X - 8} x2={GRID_X - 8} y1={GRID_BOTTOM + 8} y2={588} />
        <Remarks remarks={log.remarks} />

        <line className="heavy" x1={18} x2={982} y1={600} y2={600} />
        <text className="label" x={18} y={624}>Recap</text>
        <text className="caption" x={18} y={640}>70 Hour / 8 Day Drivers</text>
        <Field x={230} y={636} width={90} label="On duty hours today (lines 3 and 4)" value={formatHours(log.recap.on_duty_today)} />
        <Field x={480} y={636} width={90} label="A. Total hours on duty, last 8 days including today" value={formatHours(log.recap.cycle_used)} />
        <Field x={760} y={636} width={90} label="B. Hours available tomorrow (70 minus A)" value={formatHours(log.recap.cycle_available)} />
        <text className="fine" x={982} y={678} textAnchor="end">Sheet {log.day} of {totalDays}</text>
      </svg>

      <details className="changes">
        <summary>Duty status changes on this sheet</summary>
        <table>
          <thead>
            <tr><th>Time</th><th>Status</th><th>Location</th><th>Remark</th></tr>
          </thead>
          <tbody>
            {log.remarks.map((remark) => (
              <tr key={remark.minute}>
                <td>{formatMinute(remark.minute)}</td>
                <td>{STATUS[remark.status].label}</td>
                <td>{remark.location}</td>
                <td>{remark.note}</td>
              </tr>
            ))}
            {!log.remarks.length && (
              <tr><td colSpan={4}>No change of duty status. The whole day continues the previous sheet.</td></tr>
            )}
          </tbody>
        </table>
      </details>
    </article>
  )
}

Remarks.propTypes = {
  remarks: PropTypes.arrayOf(remarkType).isRequired,
}

Field.propTypes = {
  x: PropTypes.number.isRequired,
  y: PropTypes.number.isRequired,
  width: PropTypes.number.isRequired,
  label: PropTypes.string.isRequired,
  value: PropTypes.string.isRequired,
}

LogSheet.propTypes = {
  log: logType.isRequired,
  details: detailsType.isRequired,
  totalDays: PropTypes.number.isRequired,
}
