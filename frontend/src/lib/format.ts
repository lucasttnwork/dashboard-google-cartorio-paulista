/**
 * Formatting helpers for PT-BR display.
 * Data in the database is NOT modified — these are view-layer only.
 */

/** PT-BR prepositions that stay lowercase in title case */
const LOWERCASE_WORDS = new Set([
  'da', 'de', 'do', 'dos', 'das', 'e', 'em', 'na', 'no', 'nos', 'nas',
  'ao', 'aos', 'com', 'por', 'para', 'sem', 'sob', 'sobre',
])

/**
 * Converts a name to Title Case respecting PT-BR conventions.
 * "LETICIA ANDREZA DA SILVA" → "Letícia Andreza da Silva"
 * First word is always capitalized regardless.
 */
export function toTitleCase(name: string): string {
  if (!name) return ''
  return name
    .toLowerCase()
    .split(/\s+/)
    .map((word, i) =>
      i === 0 || !LOWERCASE_WORDS.has(word)
        ? word.charAt(0).toUpperCase() + word.slice(1)
        : word,
    )
    .join(' ')
}

/** Format number with PT-BR locale (1.234) */
export function formatNumber(n: number): string {
  return n.toLocaleString('pt-BR')
}

/** Format decimal with PT-BR locale (4,72) */
export function formatDecimal(n: number, digits = 2): string {
  return n.toLocaleString('pt-BR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

/** Format percentage with PT-BR locale (72,5%) */
export function formatPercent(n: number, digits = 1): string {
  return `${formatDecimal(n, digits)}%`
}

/** PT-BR abbreviated month names (index 0 = Jan) */
export const MONTHS_PT = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
  'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez',
] as const

/** Format ISO date string to dd/mm/aaaa */
export function formatDateBR(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('pt-BR')
}
