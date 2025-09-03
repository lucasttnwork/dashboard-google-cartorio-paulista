"use client"

import { AppShell } from '@/components/shell/app-shell'
import { TrendingUp, TrendingDown, Minus, Calendar } from 'lucide-react'
import { CardKPI } from '@/components/kpi/card-kpi'

export default function TrendsPage() {
  return (
    <AppShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Tendências</h1>
            <p className="text-muted-foreground">
              Análise temporal das avaliações e métricas de performance
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Últimos 6 meses</span>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <CardKPI
            title="Crescimento Mensal"
            value="+12.5%"
            change={{
              value: 8.3,
              period: "vs mês anterior"
            }}
            icon={<TrendingUp className="h-4 w-4" />}
            hint="Aumento no volume de avaliações"
          />

          <CardKPI
            title="Rating Médio"
            value="4.97"
            change={{
              value: 0.1,
              period: "este mês"
            }}
            icon={<Minus className="h-4 w-4" />}
            hint="Mantido estável nos últimos meses"
          />

          <CardKPI
            title="Avaliações 5★"
            value="97.2%"
            change={{
              value: 1.5,
              period: "este mês"
            }}
            icon={<TrendingUp className="h-4 w-4" />}
            hint="Consistência nas avaliações perfeitas"
          />

          <CardKPI
            title="Tempo de Resposta"
            value="2.1h"
            change={{
              value: -0.3,
              period: "este mês"
            }}
            icon={<TrendingDown className="h-4 w-4" />}
            hint="Melhoria na agilidade de resposta"
          />
        </div>

        {/* Placeholder Content */}
        <div className="rounded-2xl border bg-card p-12">
          <div className="text-center">
            <TrendingUp className="mx-auto h-12 w-12 text-muted-foreground" />
            <h3 className="mt-4 text-lg font-semibold">Página em Desenvolvimento</h3>
            <p className="mt-2 text-muted-foreground">
              Esta página conterá gráficos de tendência temporal,
              análises comparativas por período e projeções futuras
              baseadas nos dados históricos de avaliações.
            </p>
          </div>
        </div>
      </div>
    </AppShell>
  )
}
