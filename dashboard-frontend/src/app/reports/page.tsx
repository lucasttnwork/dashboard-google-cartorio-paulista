"use client"

import { AppShell } from '@/components/shell/app-shell'
import { FileText, Download, Calendar, Filter } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CardKPI } from '@/components/kpi/card-kpi'

const mockReports = [
  {
    id: "1",
    name: "Relatório Mensal - Agosto 2025",
    type: "Mensal",
    period: "01/08/2025 - 31/08/2025",
    status: "Pronto",
    createdAt: "2025-09-01T08:00:00Z",
    size: "2.4 MB"
  },
  {
    id: "2",
    name: "Relatório Semanal - Semana 35",
    type: "Semanal",
    period: "25/08/2025 - 31/08/2025",
    status: "Processando",
    createdAt: "2025-08-31T18:30:00Z",
    size: "-"
  },
  {
    id: "3",
    name: "Relatório de Colaboradores",
    type: "Especial",
    period: "Julho - Agosto 2025",
    status: "Pronto",
    createdAt: "2025-08-30T14:15:00Z",
    size: "1.8 MB"
  }
]

export default function ReportsPage() {
  const handleGenerateReport = () => {
    console.log("Gerando relatório...")
  }

  const handleDownloadReport = (reportId: string) => {
    console.log("Baixando relatório:", reportId)
  }

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Relatórios</h1>
            <p className="text-muted-foreground">
              Geração e download de relatórios de performance
            </p>
          </div>
          <Button onClick={handleGenerateReport}>
            <FileText className="mr-2 h-4 w-4" />
            Gerar Relatório
          </Button>
        </div>

        {/* KPI Cards */}
        <div className="grid gap-4 md:grid-cols-3">
          <CardKPI
            title="Relatórios Gerados"
            value="24"
            icon={<FileText className="h-4 w-4" />}
            hint="Total de relatórios criados"
          />

          <CardKPI
            title="Downloads Este Mês"
            value="156"
            icon={<Download className="h-4 w-4" />}
            hint="Relatórios baixados pelos usuários"
          />

          <CardKPI
            title="Relatórios Automáticos"
            value="8"
            icon={<Calendar className="h-4 w-4" />}
            hint="Relatórios agendados mensalmente"
          />
        </div>

        {/* Reports List */}
        <div className="rounded-2xl border bg-card p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold">Relatórios Disponíveis</h3>
            <Button variant="outline" size="sm">
              <Filter className="mr-2 h-4 w-4" />
              Filtrar
            </Button>
          </div>

          <div className="space-y-4">
            {mockReports.map((report) => (
              <div key={report.id} className="flex items-center justify-between p-4 rounded-lg border bg-background/50">
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                    <FileText className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h4 className="font-semibold">{report.name}</h4>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span>{report.type}</span>
                      <span>•</span>
                      <span>{report.period}</span>
                      <span>•</span>
                      <span>{report.size}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                      report.status === 'Pronto'
                        ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300'
                        : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300'
                    }`}>
                      {report.status}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {new Date(report.createdAt).toLocaleDateString('pt-BR')}
                    </div>
                  </div>
                  {report.status === 'Pronto' && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDownloadReport(report.id)}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </AppShell>
  )
}
