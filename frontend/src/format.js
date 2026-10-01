// on-duty hours allowed in 8 days
export const CYCLE_LIMIT = 70

export const STATUS = {
  off_duty: { label: 'Off duty', row: 0 },
  sleeper_berth: { label: 'Sleeper berth', row: 1 },
  driving: { label: 'Driving', row: 2 },
  on_duty: { label: 'On duty', row: 3 },
}

export function formatTime(iso) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

export function formatDay(iso) {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  })
}

export function formatDuration(minutes) {
  const total = Math.round(minutes)
  const h = Math.floor(total / 60)
  const m = total % 60
  if (!h) return `${m} min`
  return m ? `${h} h ${m} min` : `${h} h`
}

// 450 -> "7:30 AM"
export function formatMinute(minute) {
  const h = Math.floor(minute / 60) % 24
  const m = minute % 60
  const suffix = h < 12 ? 'AM' : 'PM'
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${suffix}`
}

export function formatHours(hours) {
  return Number(hours.toFixed(2)).toString()
}

export function formatMiles(miles) {
  return Math.round(miles).toLocaleString('en-US')
}

// now, rounded up to the next quarter hour, in datetime-local format
export function defaultStart() {
  const d = new Date()
  d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
