import { afterEach, describe, expect, it, vi } from 'vitest'
import { planTrip } from './api'

function respond(status, body) {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: status < 400,
    status,
    json: async () => {
      if (body === undefined) throw new SyntaxError('not json')
      return body
    },
  })))
}

afterEach(() => vi.unstubAllGlobals())

describe('planTrip', () => {
  it('returns the plan', async () => {
    respond(200, { logs: [] })
    await expect(planTrip({})).resolves.toEqual({ logs: [] })
  })

  it('passes on the reason a trip cannot be planned', async () => {
    respond(422, { detail: 'No drivable route connects those locations.' })
    await expect(planTrip({})).rejects.toThrow('No drivable route')
  })

  it('names the field that failed validation', async () => {
    respond(400, { current_cycle_used: ['Ensure this value is less than or equal to 70.'] })
    await expect(planTrip({})).rejects.toThrow('Cycle hours used: Ensure this value')
  })

  it('has a fallback when the server answers with something else', async () => {
    respond(500)
    await expect(planTrip({})).rejects.toThrow('The planner hit a problem')
  })

  it('says so when the planner cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    await expect(planTrip({})).rejects.toThrow('Could not reach the planner')
  })
})
