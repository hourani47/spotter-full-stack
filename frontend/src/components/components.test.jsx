import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { searchLocations } from '../api'
import LocationInput from './LocationInput'
import LogSheet from './LogSheet'
import Summary from './Summary'
import Timeline from './Timeline'
import TripForm from './TripForm'

vi.mock('../api', () => ({ searchLocations: vi.fn() }))

// a prop of the wrong type or a React warning fails the test
beforeEach(() => {
  vi.spyOn(console, 'error')
})
afterEach(() => {
  expect(console.error).not.toHaveBeenCalled()
  vi.restoreAllMocks()
})

const EMPTY = { text: '', place: null }
const FORM = {
  current: EMPTY, pickup: EMPTY, dropoff: EMPTY,
  cycle: '32', start: '2026-10-01T07:30',
  driver: '', carrier: '', office: '', truck: '',
}

const segment = (kind, status, start, minutes, extra = {}) => ({
  kind, status, start, minutes, miles: 0, location: 'Dallas, TX', note: kind, lat: 1, lng: 2, ...extra,
})

describe('TripForm', () => {
  it('shows the cycle hours left and submits', async () => {
    const onSubmit = vi.fn()
    const filled = { ...FORM, current: { text: 'a', place: null }, pickup: { text: 'b', place: null }, dropoff: { text: 'c', place: null } }
    render(<TripForm form={filled} setForm={() => {}} onSubmit={onSubmit} onExample={() => {}} loading={false} />)
    expect(screen.getByText('38 of 70 hours left in the 8-day cycle.')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Plan trip' }))
    expect(onSubmit).toHaveBeenCalledOnce()
  })

  it('does not submit with a location missing', async () => {
    const onSubmit = vi.fn()
    render(<TripForm form={FORM} setForm={() => {}} onSubmit={onSubmit} onExample={() => {}} loading={false} />)
    await userEvent.click(screen.getByRole('button', { name: 'Plan trip' }))
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('locks the buttons while a trip is being planned', () => {
    render(<TripForm form={FORM} setForm={() => {}} onSubmit={() => {}} onExample={() => {}} loading />)
    expect(screen.getByRole('button', { name: 'Planning trip…' }).disabled).toBe(true)
  })
})

describe('LocationInput', () => {
  function Field({ onPick }) {
    const [value, setValue] = useState(EMPTY)
    return (
      <LocationInput
        label="Pickup location"
        value={value}
        onChange={(next) => {
          setValue(next)
          if (next.place) onPick(next)
        }}
      />
    )
  }

  it('suggests places and keeps the one that is picked', async () => {
    const dallas = { label: 'Dallas, TX', short: 'Dallas, TX', lat: 32.78, lng: -96.8 }
    searchLocations.mockResolvedValue([dallas, { ...dallas, label: 'Dallas, GA', lat: 33.9 }])
    const onPick = vi.fn()
    render(<Field onPick={onPick} />)

    const input = screen.getByLabelText('Pickup location')
    await userEvent.type(input, 'Dall')
    expect(screen.getByRole('status').textContent).toBe('Looking up places…')

    const options = await screen.findAllByRole('option')
    expect(options.map((o) => o.textContent)).toEqual(['Dallas, TX', 'Dallas, GA'])

    await userEvent.keyboard('{ArrowDown}{Enter}')
    expect(onPick).toHaveBeenCalledWith({ text: 'Dallas, TX', place: dallas })
    expect(input.value).toBe('Dallas, TX')
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull())
  })

  it('does not search for fewer than three letters', async () => {
    searchLocations.mockClear()
    render(<Field onPick={() => {}} />)
    await userEvent.type(screen.getByLabelText('Pickup location'), 'Da')
    await new Promise((resolve) => setTimeout(resolve, 350))
    expect(searchLocations).not.toHaveBeenCalled()
  })
})

describe('Timeline', () => {
  const plan = {
    timeline: [
      segment('pre_trip', 'on_duty', '2026-10-01T07:30', 15),
      segment('driving', 'driving', '2026-10-01T07:45', 240, { miles: 200 }),
      segment('driving', 'driving', '2026-10-01T11:45', 60, { miles: 50 }),
      segment('fuel', 'on_duty', '2026-10-01T12:45', 30, { location: 'Abilene, TX' }),
    ],
  }

  it('shows a stretch of driving split by the planner as one step', () => {
    render(<Timeline plan={plan} onFocus={() => {}} />)
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
    expect(screen.getByText('Drive 250 mi to Abilene, TX')).toBeTruthy()
    expect(screen.getByText('From Dallas, TX, 5 h')).toBeTruthy()
    expect(screen.getByText('1,000 miles since the last fill')).toBeTruthy()
  })

  it('hands the step that was clicked to the map', async () => {
    const onFocus = vi.fn()
    render(<Timeline plan={plan} onFocus={onFocus} />)
    await userEvent.click(screen.getByText('Stop for fuel'))
    expect(onFocus.mock.calls[0][0].kind).toBe('fuel')
  })
})

describe('Summary', () => {
  const summary = {
    miles: 2404.6, driving_hours: 41.92, total_hours: 101.17, arrival: '2026-10-05T12:40',
    fuel_stops: 2, breaks: 1, rests: 0, restarts: 1, cycle_used_end: 8.17,
  }

  it('lists only the stops the trip has', () => {
    render(<Summary plan={{ summary }} />)
    expect(screen.getByText('2,405 mi')).toBeTruthy()
    expect(screen.getByText(/Includes 2 fuel stops, 1 30-minute break, 1 34-hour restart\./)).toBeTruthy()
    expect(screen.getByText(/8\.17 of 70 hours/)).toBeTruthy()
  })

  it('says so when there are none', () => {
    render(<Summary plan={{ summary: { ...summary, fuel_stops: 0, breaks: 0, restarts: 0 } }} />)
    expect(screen.getByText(/No rest or fuel stops needed\./)).toBeTruthy()
  })
})

describe('LogSheet', () => {
  const log = {
    day: 2, date: '2026-10-02', miles: 628, from: 'Carlisle, AR', to: 'Coahoma, TX',
    entries: [
      { status: 'sleeper_berth', start: 0, end: 765 },
      { status: 'on_duty', start: 765, end: 780 },
      { status: 'driving', start: 780, end: 1440 },
    ],
    totals: { off_duty: 0, sleeper_berth: 12.75, driving: 11, on_duty: 0.25 },
    remarks: [
      { minute: 765, status: 'on_duty', location: 'Carlisle, AR', note: 'Pre-trip inspection' },
      { minute: 780, status: 'driving', location: 'Carlisle, AR', note: 'Driving' },
    ],
    recap: { on_duty_today: 11.25, cycle_used: 56, cycle_available: 14 },
  }
  const details = { driver: 'Test Driver', carrier: 'Test Carrier', office: '', truck: 'TRK-1' }

  it('fills in the sheet', () => {
    const { container } = render(<LogSheet log={log} details={details} totalDays={5} />)
    const sheet = screen.getByRole('img', { name: "Driver's daily log for 2026-10-02, day 2 of 5" })
    const text = sheet.textContent
    for (const part of ['Carlisle, AR', 'Coahoma, TX', '628', 'Test Driver', 'TRK-1', '12.75', '=24', 'Sheet 2 of 5']) {
      expect(text).toContain(part)
    }
    // one line through the three duty statuses, starting at midnight on the sleeper row
    expect(container.querySelector('.duty').getAttribute('d')).toMatch(/^M150 316 L/)
    // driving starts where the inspection was, so it gets a tick but no second label
    expect(container.querySelectorAll('.remarks text')).toHaveLength(1)
  })

  it('lists every change of duty status in the table', () => {
    render(<LogSheet log={log} details={details} totalDays={5} />)
    const rows = within(screen.getByRole('table')).getAllByRole('row')
    expect(rows).toHaveLength(3)
    expect(rows[1].textContent).toBe('12:45 PMOn dutyCarlisle, ARPre-trip inspection')
  })

  it('shows markup in a place name as text', () => {
    const markup = '<img src=x onerror=alert(1)>'
    const hostile = {
      ...log,
      from: markup,
      remarks: [{ ...log.remarks[0], location: markup }],
    }
    const { container } = render(<LogSheet log={hostile} details={{ ...details, driver: markup }} totalDays={5} />)
    expect(container.querySelector('img')).toBeNull()
    expect(container.textContent).toContain(markup)
  })

  it('explains a day with no changes', () => {
    render(<LogSheet log={{ ...log, remarks: [] }} details={details} totalDays={5} />)
    expect(screen.getByText(/No change of duty status/)).toBeTruthy()
  })
})
