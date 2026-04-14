import { useMemo } from 'react'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { CHART_COLORS } from '@/lib/chart-config'
import { MONTHS_PT, toTitleCase } from '@/lib/format'
import type { CollaboratorMention } from '@/types/metrics'
import { CustomTooltip as PremiumTooltip } from '@/components/charts/CustomTooltip'

/**
 * Recharts-friendly row: `{ label: 'Jan/25', month: '2025-01', <name>: n, ... }`.
 * Each selected collaborator contributes one `dataKey` column whose value is the
 * monthly mention count (0 when the collaborator has no row for that month).
 */
type CompareRow = {
  month: string
  label: string
  [collaboratorName: string]: number | string
}

interface CollaboratorCompareChartProps {
  collaborators: CollaboratorMention[]
}

/** Stable color rotation for up to 4 collaborators, per AC-3.7.11. */
const SERIES_COLORS = [
  CHART_COLORS.blue,
  CHART_COLORS.amber,
  CHART_COLORS.green,
  CHART_COLORS.red,
] as const

function formatMonth(isoDate: string): string {
  const d = new Date(isoDate)
  return `${MONTHS_PT[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`
}

/**
 * Merge `monthly[]` arrays from N collaborators into a single array of rows
 * keyed by ISO month, aligning entries across collaborators and padding
 * missing months with 0 so the line chart never interrupts its own domain.
 */
function buildCompareRows(collaborators: CollaboratorMention[]): CompareRow[] {
  const monthSet = new Set<string>()
  for (const c of collaborators) {
    for (const m of c.monthly) {
      monthSet.add(m.month)
    }
  }
  const months = Array.from(monthSet).sort()
  const byMonth = new Map<string, CompareRow>()

  for (const month of months) {
    byMonth.set(month, { month, label: formatMonth(month) })
  }

  for (const c of collaborators) {
    const name = toTitleCase(c.full_name)
    for (const month of months) {
      const row = byMonth.get(month)!
      const entry = c.monthly.find((m) => m.month === month)
      row[name] = entry?.mentions ?? 0
    }
  }

  return months.map((m) => byMonth.get(m)!)
}

/**
 * Line chart overlaying monthly mention counts for up to 4 collaborators.
 * One line per collaborator, cycling through the `SERIES_COLORS` palette.
 */
export function CollaboratorCompareChart({
  collaborators,
}: CollaboratorCompareChartProps) {
  const rows = useMemo(() => buildCompareRows(collaborators), [collaborators])
  const names = useMemo(
    () => collaborators.map((c) => toTitleCase(c.full_name)),
    [collaborators],
  )

  return (
    <ResponsiveContainer width="100%" height={320}>
      <LineChart data={rows} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_COLORS.gridLine} />
        <XAxis dataKey="label" tick={{ fontSize: 12 }} tickLine={false} />
        <YAxis
          tick={{ fontSize: 12 }}
          tickLine={false}
          allowDecimals={false}
          label={{
            value: 'Menções',
            angle: -90,
            position: 'insideLeft',
            style: { fontSize: 12, fill: 'var(--color-muted-foreground)' },
          }}
        />
        <Tooltip content={<PremiumTooltip />} />
        <Legend />
        {names.map((name, idx) => (
          <Line
            key={name}
            type="monotone"
            dataKey={name}
            name={name}
            stroke={SERIES_COLORS[idx % SERIES_COLORS.length]}
            strokeWidth={2}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}
