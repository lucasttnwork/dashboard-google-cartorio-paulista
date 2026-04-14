import { describe, it, expect } from 'vitest'
import { kpiDeltas } from './DashboardPage'
import type { MetricsOverview } from '@/types/metrics'

function makeOverview(overrides: Partial<MetricsOverview> = {}): MetricsOverview {
  return {
    total_reviews: 120,
    avg_rating: 4.8,
    five_star_pct: 85,
    one_star_pct: 1,
    total_with_comment: 90,
    total_with_reply: 60,
    reply_rate_pct: 50,
    total_enotariado: 30,
    avg_rating_enotariado: 4.9,
    total_collaborators_active: 10,
    total_mentions: 40,
    rating_distribution: { '1': 1, '2': 1, '3': 3, '4': 15, '5': 100 },
    period_start: '2026-01-01',
    period_end: '2026-04-01',
    previous_period: null,
    ...overrides,
  }
}

describe('kpiDeltas (F5 / AC-3.8.5)', () => {
  it('returns all-null when previous_period is missing', () => {
    const d = kpiDeltas(makeOverview({ previous_period: null }))
    expect(d.total).toBeNull()
    expect(d.avg).toBeNull()
    expect(d.fiveStar).toBeNull()
    expect(d.replyRate).toBeNull()
  })

  it('returns all-null when previous_period has zero reviews', () => {
    const d = kpiDeltas(
      makeOverview({
        previous_period: {
          total_reviews: 0,
          avg_rating: 0,
          five_star_pct: 0,
          one_star_pct: 0,
          reply_rate_pct: 0,
          total_mentions: 0,
          period_start: '2025-10-01',
          period_end: '2026-01-01',
        },
      }),
    )
    expect(d.total).toBeNull()
    expect(d.avg).toBeNull()
    expect(d.fiveStar).toBeNull()
    expect(d.replyRate).toBeNull()
  })

  it('computes signed deltas when previous_period is populated', () => {
    const d = kpiDeltas(
      makeOverview({
        total_reviews: 120,
        avg_rating: 4.8,
        five_star_pct: 85,
        reply_rate_pct: 50,
        previous_period: {
          total_reviews: 100,
          avg_rating: 4.5,
          five_star_pct: 80,
          one_star_pct: 2,
          reply_rate_pct: 45,
          total_mentions: 30,
          period_start: '2025-10-01',
          period_end: '2026-01-01',
        },
      }),
    )
    expect(d.total).toBe(20)
    expect(d.avg).toBeCloseTo(0.3, 5)
    expect(d.fiveStar).toBe(5)
    expect(d.replyRate).toBe(5)
  })
})
