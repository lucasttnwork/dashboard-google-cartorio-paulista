import { render, screen } from '@testing-library/react'
import { DeltaBadge } from './DeltaBadge'

describe('DeltaBadge', () => {
  it('renders positive value with emerald color and plus sign', () => {
    render(<DeltaBadge value={0.15} suffix="%" />)

    // Positive renders "+0.15%" — formatDecimal uses 2 decimals by default
    const label = screen.getByText(/\+0[.,]15%/)
    expect(label).toBeInTheDocument()

    // The outer span carries the color class
    const root = label.closest('span.inline-flex') as HTMLElement | null
    expect(root).not.toBeNull()
    expect(root!.className).toMatch(/text-emerald-600/)
    // Accessible label describes direction
    expect(root!.getAttribute('aria-label')).toMatch(/Aumento/i)
  })

  it('renders negative value with red color and U+2212 minus sign', () => {
    render(<DeltaBadge value={-0.3} suffix="%" />)

    // U+2212 MINUS SIGN — NOT ASCII hyphen
    const label = screen.getByText(/\u22120[.,]30%/)
    expect(label).toBeInTheDocument()
    // Sanity: ensure it contains the U+2212 code point, not U+002D
    expect(label.textContent).toContain('\u2212')
    expect(label.textContent).not.toContain('-0')

    const root = label.closest('span.inline-flex') as HTMLElement | null
    expect(root).not.toBeNull()
    expect(root!.className).toMatch(/text-red-600/)
    expect(root!.getAttribute('aria-label')).toMatch(/Queda/i)
  })

  it('renders zero as "Sem alteração" in muted color', () => {
    render(<DeltaBadge value={0} />)

    const label = screen.getByText('Sem alteração')
    expect(label).toBeInTheDocument()

    const root = label.closest('span.inline-flex') as HTMLElement | null
    expect(root).not.toBeNull()
    expect(root!.className).toMatch(/text-muted-foreground/)
    // No colored variant on a neutral badge
    expect(root!.className).not.toMatch(/text-emerald-600/)
    expect(root!.className).not.toMatch(/text-red-600/)
  })

  it('renders null as "Estável" without crashing', () => {
    render(<DeltaBadge value={null} />)

    const label = screen.getByText('Estável')
    expect(label).toBeInTheDocument()

    const root = label.closest('span.inline-flex') as HTMLElement | null
    expect(root).not.toBeNull()
    expect(root!.getAttribute('aria-label')).toMatch(/Sem dados/i)
  })
})
