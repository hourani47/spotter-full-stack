import { describe, expect, it } from 'vitest'
import { formatDuration, formatHours, formatMiles, formatMinute } from './format'

describe('formatDuration', () => {
  it('drops the part that is zero', () => {
    expect(formatDuration(30)).toBe('30 min')
    expect(formatDuration(600)).toBe('10 h')
    expect(formatDuration(2040)).toBe('34 h')
  })

  it('rounds to whole minutes', () => {
    expect(formatDuration(41.92 * 60)).toBe('41 h 55 min')
    expect(formatDuration(59.6)).toBe('1 h')
  })
})

describe('formatMinute', () => {
  it('reads minutes of the day as a 12-hour clock', () => {
    expect(formatMinute(0)).toBe('12:00 AM')
    expect(formatMinute(450)).toBe('7:30 AM')
    expect(formatMinute(720)).toBe('12:00 PM')
    expect(formatMinute(1439)).toBe('11:59 PM')
    expect(formatMinute(1440)).toBe('12:00 AM')
  })
})

describe('formatHours and formatMiles', () => {
  it('trims trailing zeros and groups thousands', () => {
    expect(formatHours(8.5)).toBe('8.5')
    expect(formatHours(24)).toBe('24')
    expect(formatHours(8.17)).toBe('8.17')
    expect(formatMiles(2404.6)).toBe('2,405')
  })
})
