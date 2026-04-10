import { formatNumber, formatDecimal, MONTHS_PT } from '@/lib/format'

interface PayloadEntry {
  name: string
  value: number
  color: string
  dataKey: string
}

interface CustomTooltipProps {
  active?: boolean
  payload?: PayloadEntry[]
  label?: string
}

/**
 * Premium recharts tooltip — card style, PT-BR formatting.
 * Apple-level sobriety: no noise, clean type hierarchy, soft shadow.
 */
export function CustomTooltip({
  active,
  payload,
  label,
}: CustomTooltipProps) {
  if (!active || !payload?.length) return null

  const formattedLabel = formatLabel(label)

  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2.5 shadow-lg">
      <p className="mb-1.5 text-xs font-medium text-muted-foreground">
        {formattedLabel}
      </p>
      <div className="space-y-1">
        {payload.map((entry) => (
          <div key={entry.dataKey} className="flex items-center gap-2 text-sm">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-muted-foreground">{entry.name}</span>
            <span className="ml-auto font-medium tabular-nums text-foreground">
              {formatValue(entry.dataKey, entry.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function formatLabel(label: string | undefined): string {
  if (!label) return ''
  const match = label.match(/^(\d{4})-(\d{2})$/)
  if (match) {
    const monthIdx = parseInt(match[2]!, 10) - 1
    return `${MONTHS_PT[monthIdx]} ${match[1]}`
  }
  return label
}

function formatValue(dataKey: string, value: number): string {
  if (/avg|rating|nota/i.test(dataKey)) return formatDecimal(value)
  return formatNumber(value)
}
