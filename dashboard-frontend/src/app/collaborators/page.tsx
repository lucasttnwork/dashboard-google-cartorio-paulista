"use client"

import * as React from 'react'
import { AppShell } from '@/components/shell/app-shell'
import { CardKPI } from '@/components/kpi/card-kpi'
import { CollaboratorsTable } from '@/components/CollaboratorsTable'
import { fetchCollaboratorMentions } from '@/lib/adapters/supabase'
import { Users, UserCheck, UserX, Briefcase } from 'lucide-react'

export default function CollaboratorsPage() {
  const [collaborators, setCollaborators] = React.useState<any[]>([])
  const [stats, setStats] = React.useState<any>(null)

  React.useEffect(() => {
    const load = async () => {
      const mentions = await fetchCollaboratorMentions()
      const tableRows = (mentions || []).map((m, idx) => ({
        id: idx + 1,
        full_name: m.full_name,
        department: m.department || '—',
        position: '—',
        is_active: true,
        mentions: m.mentions,
        avgRating: m.avg_rating_when_mentioned ? Number(m.avg_rating_when_mentioned) : undefined,
      }))
      setCollaborators(tableRows)
      setStats({
        total_collaborators: tableRows.length,
        active_collaborators: tableRows.length, // sem status real no momento
        inactive_collaborators: 0,
        top_department: 'E-notariado'
      })
    }
    load()
  }, [])

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
