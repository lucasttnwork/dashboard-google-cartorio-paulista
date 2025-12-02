import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CardKPIProps {
  title: string
  value: string | number
  change?: {
    value: number
    period: string
  }
  hint?: string
  icon?: React.ReactNode
  className?: string
}

export function CardKPI({
  title,
  value,
  change,
  hint,
  icon,
  className
}: CardKPIProps) {
  const getChangeIcon = () => {
    if (!change) return null

    if (change.value > 0) {
      return <TrendingUp className="h-3 w-3 text-[hsl(var(--success))]" />
    } else if (change.value < 0) {
      return <TrendingDown className="h-3 w-3 text-[hsl(var(--destructive))]" />
    } else {
      return <Minus className="h-3 w-3 text-[hsl(var(--muted-foreground))]" />
    }
  }

  const getChangeColor = () => {
    if (!change) return ''

    if (change.value > 0) return 'text-[hsl(var(--success))]'
    if (change.value < 0) return 'text-[hsl(var(--destructive))]'
    return 'text-[hsl(var(--muted-foreground))]'
  }

  return (
    <Card className={cn("rounded-2xl", className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-xs md:text-sm text-[hsl(var(--muted-foreground))]">
          {title}
        </CardTitle>
        {icon && (
          <div className="h-4 w-4 text-[hsl(var(--muted-foreground))]">
            {icon}
          </div>
        )}
      </CardHeader>
      <CardContent>
        <div className="text-4xl md:text-5xl font-extrabold tracking-tight text-[hsl(var(--foreground))]">
          {value}
        </div>
        {change && (
          <div className="flex items-center gap-2 mt-2">
            {getChangeIcon()}
            <span className={cn("rounded-full px-2 py-0.5 text-xs bg-white/[0.04] border border-[hsl(var(--border))]", getChangeColor())}>
              {change.value > 0 ? '+' : ''}{change.value}% {change.period}
            </span>
          </div>
        )}
        {hint && (
          <p className="text-xs text-[hsl(var(--subtle-foreground))] mt-1">
            {hint}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
