import { describe, it, expect } from 'vitest'
import { CHART_COLORS, ratingColor, ratingBorderClass } from './chart-config'

describe('CHART_COLORS', () => {
  it('has blue as hex', () => {
    expect(CHART_COLORS.blue).toBe('#3b82f6')
  })

  it('has amber for ratings', () => {
    expect(CHART_COLORS.amber).toBe('#f59e0b')
  })

  it('has green for positive', () => {
    expect(CHART_COLORS.green).toBe('#10b981')
  })
})

describe('ratingColor', () => {
  it('returns green for 5 stars', () => {
    expect(ratingColor(5)).toBe(CHART_COLORS.green)
  })

  it('returns green for 4 stars', () => {
    expect(ratingColor(4)).toBe(CHART_COLORS.green)
  })

  it('returns amber for 3 stars', () => {
    expect(ratingColor(3)).toBe(CHART_COLORS.amber)
  })

  it('returns red for 2 stars', () => {
    expect(ratingColor(2)).toBe(CHART_COLORS.red)
  })

  it('returns red for 1 star', () => {
    expect(ratingColor(1)).toBe(CHART_COLORS.red)
  })

  it('returns gray for null', () => {
    expect(ratingColor(null)).toBe(CHART_COLORS.gray)
  })
})

describe('ratingBorderClass', () => {
  it('returns emerald for high ratings', () => {
    expect(ratingBorderClass(5)).toContain('emerald')
  })

  it('returns amber for rating 3', () => {
    expect(ratingBorderClass(3)).toContain('amber')
  })

  it('returns red for low ratings', () => {
    expect(ratingBorderClass(1)).toContain('red')
  })

  it('returns gray for null', () => {
    expect(ratingBorderClass(null)).toContain('gray')
  })
})
