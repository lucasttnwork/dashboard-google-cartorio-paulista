import { describe, it, expect } from 'vitest'
import { pickGranularity } from './period'

describe('pickGranularity', () => {
  it('returns "day" for custom ranges of 60 days or less', () => {
    expect(
      pickGranularity({ dateFrom: '2026-01-01', dateTo: '2026-01-31' }),
    ).toBe('day')
    expect(
      pickGranularity({ dateFrom: '2026-01-01', dateTo: '2026-03-02' }),
    ).toBe('day')
  })

  it('returns "month" for custom ranges above 60 days', () => {
    expect(
      pickGranularity({ dateFrom: '2026-01-01', dateTo: '2026-04-01' }),
    ).toBe('month')
    expect(
      pickGranularity({ dateFrom: '2025-01-01', dateTo: '2026-01-01' }),
    ).toBe('month')
  })

  it('stays monthly for common presets (3/6/12)', () => {
    expect(pickGranularity({ months: 3 })).toBe('month')
    expect(pickGranularity({ months: 6 })).toBe('month')
    expect(pickGranularity({ months: 12 })).toBe('month')
  })

  it('falls back to month on malformed or inverted ranges', () => {
    expect(
      pickGranularity({ dateFrom: '2026-03-01', dateTo: '2026-01-01' }),
    ).toBe('month')
    expect(
      pickGranularity({ dateFrom: 'not-a-date', dateTo: '2026-01-01' }),
    ).toBe('month')
  })
})
