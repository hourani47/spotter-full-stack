import PropTypes from 'prop-types'

const { arrayOf, number, oneOf, shape, string } = PropTypes

const status = oneOf(['off_duty', 'sleeper_berth', 'driving', 'on_duty'])

export const placeType = shape({
  label: string.isRequired,
  short: string,
  lat: number.isRequired,
  lng: number.isRequired,
})

// what a location field holds: the text typed, and the suggestion picked if any
export const locationValueType = shape({
  text: string.isRequired,
  place: placeType,
})

export const formType = shape({
  current: locationValueType.isRequired,
  pickup: locationValueType.isRequired,
  dropoff: locationValueType.isRequired,
  cycle: string.isRequired,
  start: string.isRequired,
  driver: string.isRequired,
  carrier: string.isRequired,
  office: string.isRequired,
  truck: string.isRequired,
})

export const segmentType = shape({
  status: status.isRequired,
  kind: string.isRequired,
  note: string.isRequired,
  start: string.isRequired,
  minutes: number.isRequired,
  miles: number.isRequired,
  location: string.isRequired,
  lat: number.isRequired,
  lng: number.isRequired,
})

export const summaryType = shape({
  miles: number.isRequired,
  driving_hours: number.isRequired,
  total_hours: number.isRequired,
  arrival: string.isRequired,
  fuel_stops: number.isRequired,
  breaks: number.isRequired,
  rests: number.isRequired,
  restarts: number.isRequired,
  cycle_used_end: number.isRequired,
})

export const remarkType = shape({
  minute: number.isRequired,
  status: status.isRequired,
  location: string.isRequired,
  note: string.isRequired,
})

// the driver and carrier lines of a log sheet
export const detailsType = shape({
  driver: string.isRequired,
  carrier: string.isRequired,
  office: string.isRequired,
  truck: string.isRequired,
})

export const logType = shape({
  day: number.isRequired,
  date: string.isRequired,
  miles: number.isRequired,
  from: string.isRequired,
  to: string.isRequired,
  entries: arrayOf(shape({
    status: status.isRequired,
    start: number.isRequired,
    end: number.isRequired,
  })).isRequired,
  totals: shape({
    off_duty: number.isRequired,
    sleeper_berth: number.isRequired,
    driving: number.isRequired,
    on_duty: number.isRequired,
  }).isRequired,
  remarks: arrayOf(remarkType).isRequired,
  recap: shape({
    on_duty_today: number.isRequired,
    cycle_used: number.isRequired,
    cycle_available: number.isRequired,
  }).isRequired,
})
