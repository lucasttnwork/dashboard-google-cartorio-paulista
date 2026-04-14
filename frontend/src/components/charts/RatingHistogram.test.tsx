import { render, screen } from '@testing-library/react'
import { RatingHistogram } from './RatingHistogram'
import type { RatingDistribution } from '@/types/metrics'

/**
 * Fetch the inner `<span>` whose inline style encodes the width percentage
 * for a given rating bucket. The component renders 5 rows; each row has a
 * `title` attribute that starts with "`${bucket}★:`" which lets us target it
 * deterministically.
 */
function getBarWidth(bucket: '1' | '2' | '3' | '4' | '5'): string {
  // The `<li>` itself carries the title; the width bar is the absolutely-
  // positioned child inside the track.
  const li = document.querySelector<HTMLLIElement>(`li[title^="${bucket}★:"]`)
  expect(li).not.toBeNull()
  const bar = li!.querySelector<HTMLSpanElement>('span[style*="width"]')
  expect(bar).not.toBeNull()
  return bar!.style.width
}

describe('RatingHistogram', () => {
  it('renders bars proportional to the distribution', () => {
    const distribution: RatingDistribution = {
      '1': 0,
      '2': 0,
      '3': 0,
      '4': 0,
      '5': 100,
    }
    render(<RatingHistogram distribution={distribution} />)

    // 5★ absorbs 100% of the mass
    expect(getBarWidth('5')).toBe('100%')
    // The other rows should be empty
    expect(getBarWidth('4')).toBe('0%')
    expect(getBarWidth('3')).toBe('0%')
    expect(getBarWidth('2')).toBe('0%')
    expect(getBarWidth('1')).toBe('0%')
  })

  it('always renders all 5 rating rows with star labels', () => {
    const distribution: RatingDistribution = {
      '1': 2,
      '2': 3,
      '3': 5,
      '4': 10,
      '5': 20,
    }
    render(<RatingHistogram distribution={distribution} />)

    // Exactly 5 list items, one per rating bucket
    const items = document.querySelectorAll('ul[aria-label="Distribuição de notas"] > li')
    expect(items.length).toBe(5)

    // Each bucket label shows the "N★" text
    expect(screen.getByText('5★')).toBeInTheDocument()
    expect(screen.getByText('4★')).toBeInTheDocument()
    expect(screen.getByText('3★')).toBeInTheDocument()
    expect(screen.getByText('2★')).toBeInTheDocument()
    expect(screen.getByText('1★')).toBeInTheDocument()

    // And the count column renders formatNumber output for non-zero buckets
    expect(screen.getByText('20')).toBeInTheDocument()
    expect(screen.getByText('10')).toBeInTheDocument()
  })

  it('renders without crashing when total is zero', () => {
    const distribution: RatingDistribution = {
      '1': 0,
      '2': 0,
      '3': 0,
      '4': 0,
      '5': 0,
    }
    render(<RatingHistogram distribution={distribution} />)

    // All bars collapse to 0% — no NaN/Infinity leak in inline style
    for (const b of ['1', '2', '3', '4', '5'] as const) {
      const w = getBarWidth(b)
      expect(w).toBe('0%')
      expect(w).not.toMatch(/NaN|Infinity/)
    }

    // Structure is preserved (5 rows still present)
    const items = document.querySelectorAll('ul[aria-label="Distribuição de notas"] > li')
    expect(items.length).toBe(5)
  })
})
