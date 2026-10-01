import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'

const dallas = { label: 'Dallas, TX', short: 'Dallas, TX', lat: 32.78, lng: -96.8 }
const stop = (kind, status, start, minutes, extra = {}) => ({
  kind, status, start, minutes, miles: 0, note: kind, location: 'Dallas, TX', lat: 32.78, lng: -96.8, ...extra,
})

const PLAN = {
  locations: { current: dallas, pickup: dallas, dropoff: { ...dallas, label: 'Abilene, TX', short: 'Abilene, TX' } },
  route: { geometry: [[32.78, -96.8], [32.45, -99.73]], miles: 182 },
  summary: {
    start: '2026-10-01T08:00', arrival: '2026-10-01T13:15', miles: 182,
    driving_hours: 3, total_hours: 5.25, fuel_stops: 0, breaks: 0, rests: 0, restarts: 0,
    cycle_used_end: 17.25,
  },
  timeline: [
    stop('pre_trip', 'on_duty', '2026-10-01T08:00', 15),
    stop('pickup', 'on_duty', '2026-10-01T08:15', 60),
    stop('driving', 'driving', '2026-10-01T09:15', 180, { miles: 182 }),
    stop('dropoff', 'on_duty', '2026-10-01T12:15', 60, { location: 'Abilene, TX' }),
  ],
  stops: [
    stop('pickup', 'on_duty', '2026-10-01T08:15', 60),
    stop('dropoff', 'on_duty', '2026-10-01T12:15', 60, { location: 'Abilene, TX' }),
  ],
  logs: [{
    day: 1, date: '2026-10-01', miles: 182, from: 'Dallas, TX', to: 'Abilene, TX',
    entries: [
      { status: 'off_duty', start: 0, end: 480 },
      { status: 'on_duty', start: 480, end: 555 },
      { status: 'driving', start: 555, end: 735 },
      { status: 'on_duty', start: 735, end: 795 },
      { status: 'off_duty', start: 795, end: 1440 },
    ],
    totals: { off_duty: 18.75, sleeper_berth: 0, driving: 3, on_duty: 2.25 },
    remarks: [{ minute: 480, status: 'on_duty', location: 'Dallas, TX', note: 'Pre-trip inspection' }],
    recap: { on_duty_today: 5.25, cycle_used: 17.25, cycle_available: 52.75 },
  }],
}

function respond(status, body) {
  const fetch = vi.fn(async () => ({ ok: status < 400, status, json: async () => body }))
  vi.stubGlobal('fetch', fetch)
  return fetch
}

async function fill(label, text) {
  await userEvent.type(screen.getByLabelText(label), text)
}

afterEach(() => vi.unstubAllGlobals())

describe('App', () => {
  it('plans a trip and draws the route, the stops and the log sheets', async () => {
    const fetch = respond(200, PLAN)
    const { container } = render(<App />)

    await userEvent.click(screen.getByRole('button', { name: /Fill in an example/ }))

    const [url, request] = fetch.mock.calls[0]
    expect(url).toBe('/api/trips/plan/')
    expect(JSON.parse(request.body)).toMatchObject({
      current_location: 'Chicago, IL',
      pickup_location: 'Dallas, TX',
      dropoff_location: 'Los Angeles, CA',
      current_cycle_used: 32,
    })

    const summary = await screen.findByRole('region', { name: 'Trip summary' })
    expect(within(summary).getByText('182 mi')).toBeTruthy()
    expect(within(summary).getByText(/No rest or fuel stops needed/)).toBeTruthy()
    expect(screen.getByText('Drive 182 mi to Abilene, TX')).toBeTruthy()
    expect(screen.getByText(/1 sheet, one per/)).toBeTruthy()
    expect(screen.getByRole('img', { name: /Driver's daily log for 2026-10-01/ })).toBeTruthy()
    // start, pickup and drop-off on the map (jsdom gives the map no size, so no route line)
    expect([...container.querySelectorAll('.pin')].map((pin) => pin.textContent)).toEqual(['A', 'P', 'D'])
  })

  it('says the plan is out of date once the trip is edited', async () => {
    respond(200, PLAN)
    render(<App />)
    await userEvent.click(screen.getByRole('button', { name: /Fill in an example/ }))
    await screen.findByRole('region', { name: 'Trip summary' })
    expect(screen.queryByText(/trip details have changed/)).toBeNull()

    await fill('Cycle hours used', '5')
    expect(screen.getByText(/trip details have changed/)).toBeTruthy()

    // the carrier's name is on the sheets but is not part of the plan
    await userEvent.clear(screen.getByLabelText('Cycle hours used'))
    await fill('Cycle hours used', '32')
    await fill('Carrier name', 'Test Carrier')
    expect(screen.queryByText(/trip details have changed/)).toBeNull()
    expect(screen.getByRole('img', { name: /Driver's daily log/ }).textContent).toContain('Test Carrier')
  })

  it('shows why a trip could not be planned, until the form is edited', async () => {
    respond(422, { detail: 'No drivable route connects those locations.' })
    render(<App />)
    await userEvent.click(screen.getByRole('button', { name: /Fill in an example/ }))

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe('No drivable route connects those locations.')
    expect(screen.queryByRole('region', { name: 'Trip summary' })).toBeNull()

    await fill('Cycle hours used', '1')
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
