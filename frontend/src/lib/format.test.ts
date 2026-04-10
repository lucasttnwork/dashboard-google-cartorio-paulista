import { describe, it, expect } from 'vitest'
import {
  toTitleCase,
  formatNumber,
  formatDecimal,
  formatPercent,
  formatDateBR,
  MONTHS_PT,
} from './format'

describe('toTitleCase', () => {
  it('converts UPPERCASE to Title Case', () => {
    expect(toTitleCase('LETICIA ANDREZA DA SILVA')).toBe('Leticia Andreza da Silva')
  })

  it('lowercases PT-BR prepositions', () => {
    expect(toTitleCase('MARIA DE FATIMA DOS SANTOS')).toBe('Maria de Fatima dos Santos')
  })

  it('capitalizes first word even if preposition', () => {
    expect(toTitleCase('DA SILVA PEREIRA')).toBe('Da Silva Pereira')
  })

  it('handles empty string', () => {
    expect(toTitleCase('')).toBe('')
  })

  it('handles single word', () => {
    expect(toTitleCase('CARLOS')).toBe('Carlos')
  })

  it('handles already mixed case', () => {
    expect(toTitleCase('ana clara')).toBe('Ana Clara')
  })
})

describe('formatNumber', () => {
  it('formats with PT-BR locale', () => {
    const result = formatNumber(1234)
    // PT-BR uses dot as thousands separator
    expect(result).toMatch(/1\.?234/)
  })
})

describe('formatDecimal', () => {
  it('formats with 2 decimal places', () => {
    const result = formatDecimal(4.7)
    expect(result).toMatch(/4[,.]70/)
  })
})

describe('formatPercent', () => {
  it('appends % sign', () => {
    expect(formatPercent(72.5)).toContain('%')
  })
})

describe('formatDateBR', () => {
  it('formats ISO date to dd/mm/aaaa', () => {
    const result = formatDateBR('2026-04-10T12:00:00Z')
    expect(result).toMatch(/10\/04\/2026/)
  })
})

describe('MONTHS_PT', () => {
  it('has 12 entries', () => {
    expect(MONTHS_PT).toHaveLength(12)
  })

  it('starts with Jan', () => {
    expect(MONTHS_PT[0]).toBe('Jan')
  })

  it('ends with Dez', () => {
    expect(MONTHS_PT[11]).toBe('Dez')
  })
})
