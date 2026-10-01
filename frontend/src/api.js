const BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')

export async function searchLocations(query, signal) {
  const response = await fetch(
    `${BASE}/api/locations/?q=${encodeURIComponent(query)}`,
    { signal },
  )
  return response.ok ? response.json() : []
}

const FIELD_NAMES = {
  current_location: 'Current location',
  pickup_location: 'Pickup location',
  dropoff_location: 'Drop-off location',
  current_cycle_used: 'Cycle hours used',
  start_time: 'Start time',
}

export async function planTrip(trip) {
  let response
  try {
    response = await fetch(`${BASE}/api/trips/plan/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(trip),
    })
  } catch {
    throw new Error('Could not reach the planner. Check your connection and try again.')
  }
  const body = await response.json().catch(() => null)
  if (response.ok) return body
  if (body?.detail) throw new Error(body.detail)
  if (body && response.status === 400) {
    const [field, messages] = Object.entries(body)[0]
    throw new Error(`${FIELD_NAMES[field] || field}: ${[].concat(messages)[0]}`)
  }
  throw new Error('The planner hit a problem. Try again in a moment.')
}
