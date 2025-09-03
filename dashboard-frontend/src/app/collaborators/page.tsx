"use client"

import { AppShell } from '@/components/shell/app-shell'
import { CardKPI } from '@/components/kpi/card-kpi'
import { CollaboratorsTable } from '@/components/CollaboratorsTable'
import { useCollaborators, useCollaboratorsStats } from '@/lib/hooks/use-collaborators'
import { Users, UserCheck, UserX, Briefcase } from 'lucide-react'

export default function CollaboratorsPage() {
  const { data } = useCollaborators({ page: 1, pageSize: 50 })
  const { data: stats } = useCollaboratorsStats()

  const collaborators = (data?.data || []).map(c => ({
    ...c,
    // métricas mock para enriquecer tabela/UX
    mentions: Math.floor(20 + Math.random() * 40),
    avgRating: 4 + Math.random(),
    positiveMentions: Math.floor(Math.random() * 20),
    negativeMentions: Math.floor(Math.random() * 5),
  }))

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Colaboradores</h1>
            <p className="text-muted-foreground">Ranking, métricas e status da equipe</p>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <CardKPI
            title="Total de Colaboradores"
            value={(stats?.total_collaborators ?? collaborators.length).toString()}
            icon={<Users className="h-4 w-4" />}
            hint="Equipe monitorada"
          />

          <CardKPI
            title="Ativos"
            value={(stats?.active_collaborators ?? collaborators.filter(c => c.is_active).length).toString()}
            icon={<UserCheck className="h-4 w-4" />}
            hint="Disponíveis para atendimento"
          />

          <CardKPI
            title="Inativos"
            value={(stats?.inactive_collaborators ?? collaborators.filter(c => !c.is_active).length).toString()}
            icon={<UserX className="h-4 w-4" />}
            hint="Em férias/afastamento"
          />

          <CardKPI
            title="Departamento Destaque"
            value={stats?.top_department ?? 'E-notariado'}
            icon={<Briefcase className="h-4 w-4" />}
            hint="Mais mencionado nas avaliações"
          />
        </div>

        {/* Table */}
        <CollaboratorsTable collaborators={collaborators as any} />
      </div>
    </AppShell>
  )
}
