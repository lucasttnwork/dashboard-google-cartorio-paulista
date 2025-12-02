"use client"

import { AppShell } from '@/components/shell/app-shell'
import { BarChart3, TrendingUp, Users, Clock } from 'lucide-react'
import { CardKPI } from '@/components/kpi/card-kpi'

export default function AnalyticsPage() {
  return (
    <AppShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
            <p className="text-muted-foreground">
              Análises detalhadas e insights das avaliações
            </p>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <CardKPI
            title="Tendência de Rating"
            value="+0.2"
            change={{
              value: 8.5,
              period: "este mês"
            }}
            icon={<TrendingUp className="h-4 w-4" />}
            hint="Melhoria no rating médio"
          />

          <CardKPI
            title="Avaliações por Dia"
            value="12.3"
            change={{
              value: 15.2,
              period: "este mês"
            }}
            icon={<BarChart3 className="h-4 w-4" />}
            hint="Média diária de avaliações"
          />

          <CardKPI
            title="Tempo de Resposta"
            value="2.4h"
            change={{
              value: -12.1,
              period: "este mês"
            }}
            icon={<Clock className="h-4 w-4" />}
            hint="Tempo médio de resposta"
          />

          <CardKPI
            title="Satisfação Geral"
            value="94.2%"
            change={{
              value: 3.1,
              period: "este mês"
            }}
            icon={<Users className="h-4 w-4" />}
            hint="Índice de satisfação geral"
          />
        </div>

        {/* Placeholder Content */}
        <div className="rounded-2xl border bg-card p-12">
          <div className="text-center">
            <BarChart3 className="mx-auto h-12 w-12 text-muted-foreground" />
            <h3 className="mt-4 text-lg font-semibold">Página em Desenvolvimento</h3>
            <p className="mt-2 text-muted-foreground">
              Esta página conterá gráficos avançados de análise de dados,
              tendências e métricas detalhadas das avaliações.
            </p>
          </div>
        </div>
      </div>
    </AppShell>
  )
}
