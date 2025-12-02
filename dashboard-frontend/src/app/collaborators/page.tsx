"use client"

import * as React from 'react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { DateRange } from 'react-day-picker'

import { AppShell } from '@/components/shell/app-shell'
import { CardKPI } from '@/components/kpi/card-kpi'
import { CollaboratorsTable } from '@/components/CollaboratorsTable'
import { fetchCollaboratorMentionsByRange } from '@/lib/adapters/supabase'
import { PeriodFilter, type PeriodPreset } from '@/components/ui/period-filter'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/label'
import {
  Briefcase,
  MessageSquare,
  Plus,
  Star,
  Users,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

type DurationPreset = Exclude<PeriodPreset, 'custom'>

const presetOffsets: Record<DurationPreset, number> = {
  '7d': 6,
  '30d': 29,
  '90d': 89,
}

const presetLabels: Record<DurationPreset, string> = {
  '7d': 'Últimos 7 dias',
  '30d': 'Últimos 30 dias',
  '90d': 'Últimos 90 dias',
}

const buildRangeFromSelection = (value: PeriodPreset | DateRange) => {
  if (typeof value === 'object') {
    if (!value.from || !value.to) {
      return null
    }
    const startDate = new Date(value.from)
    startDate.setHours(0, 0, 0, 0)
    const endDate = new Date(value.to)
    endDate.setHours(23, 59, 59, 999)
    return { startDate, endDate }
  }

  if (value === 'custom') return null

  const endDate = new Date()
  endDate.setHours(23, 59, 59, 999)
  const startDate = new Date(endDate)
  const offset = presetOffsets[value as DurationPreset] ?? 0
  startDate.setDate(endDate.getDate() - offset)
  return { startDate, endDate }
}

const buildRangeLabel = (value: PeriodPreset | DateRange) => {
  if (typeof value === 'object') {
    if (value.from && value.to) {
      return `${format(value.from, 'dd/MM/yyyy', { locale: ptBR })} - ${format(value.to, 'dd/MM/yyyy', { locale: ptBR })}`
    }
    return 'Período personalizado'
  }
  return presetLabels[value as DurationPreset] ?? 'Período selecionado'
}

interface CollaboratorRow {
  id: number
  full_name: string
  department: string
  position: string
  is_active: boolean
  mentions: number
  avgRating?: number
  latestMention?: string
}

type ModalMode = 'add' | 'edit' | 'remove'

interface CollaboratorFormState {
  full_name: string
  department: string
  position: string
  is_active: boolean
}

const initialFormState: CollaboratorFormState = {
  full_name: '',
  department: '',
  position: '',
  is_active: true,
}

export default function CollaboratorsPage() {
  const [selectedPeriod, setSelectedPeriod] = React.useState<PeriodPreset | DateRange>('30d')
  const [collaborators, setCollaborators] = React.useState<CollaboratorRow[]>([])
  const [isLoading, setIsLoading] = React.useState(false)
  const [statusMessage, setStatusMessage] = React.useState<string | null>('Selecione um período para iniciar.')

  const [modalMode, setModalMode] = React.useState<ModalMode | null>(null)
  const [selectedCollaborator, setSelectedCollaborator] = React.useState<CollaboratorRow | null>(null)
  const [password, setPassword] = React.useState('')
  const [passwordError, setPasswordError] = React.useState('')
  const [formState, setFormState] = React.useState<CollaboratorFormState>({ ...initialFormState })

  const periodRange = React.useMemo(() => buildRangeFromSelection(selectedPeriod), [selectedPeriod])
  const rangeLabel = React.useMemo(() => buildRangeLabel(selectedPeriod), [selectedPeriod])

  const totalMentions = React.useMemo(
    () => collaborators.reduce((sum, collab) => sum + collab.mentions, 0),
    [collaborators],
  )

  const avgRating = React.useMemo(() => {
    if (collaborators.length === 0) {
      return 0
    }
    const total = collaborators.reduce((sum, collab) => sum + (collab.avgRating ?? 0), 0)
    return total / collaborators.length
  }, [collaborators])

  const highlightedDepartment = collaborators[0]?.department ?? '—'

  React.useEffect(() => {
    if (!periodRange) {
      setCollaborators([])
      setIsLoading(false)
      if (selectedPeriod === 'custom') {
        setStatusMessage('Selecione o intervalo de datas para filtrar as menções.')
      } else {
        setStatusMessage('Escolha um período válido para continuar.')
      }
      return
    }

    const { startDate, endDate } = periodRange
    setIsLoading(true)
    setStatusMessage(null)

    fetchCollaboratorMentionsByRange(startDate.toISOString(), endDate.toISOString())
      .then(data => {
        const normalized = (data || []).map((collaborator, index) => ({
          id: index + 1,
          full_name: collaborator.full_name,
          department: collaborator.department || '—',
          position: '—',
          is_active: true,
          mentions: collaborator.mentions,
          avgRating: collaborator.avg_rating_when_mentioned ? Number(collaborator.avg_rating_when_mentioned) : undefined,
          latestMention: collaborator.latest_mention,
        }))
        setCollaborators(normalized)
        if (normalized.length === 0) {
          setStatusMessage('Nenhum colaborador foi mencionado neste intervalo.')
        }
      })
      .catch(error => {
        console.error('Erro ao carregar colaboradores por período:', error)
        setCollaborators([])
        setStatusMessage('Não foi possível carregar os colaboradores no momento.')
      })
      .finally(() => {
        setIsLoading(false)
      })
  }, [periodRange, selectedPeriod])

  const openModal = (mode: ModalMode, collaborator?: CollaboratorRow) => {
    setModalMode(mode)
    setSelectedCollaborator(collaborator ?? null)
    setPassword('')
    setPasswordError('')
    if (mode === 'edit' && collaborator) {
      setFormState({
        full_name: collaborator.full_name,
        department: collaborator.department,
        position: collaborator.position,
        is_active: collaborator.is_active,
      })
      return
    }

    setFormState({ ...initialFormState })
  }

  const closeModal = () => {
    setModalMode(null)
    setSelectedCollaborator(null)
    setPassword('')
    setPasswordError('')
    setFormState({ ...initialFormState })
  }

  const handleModalConfirm = () => {
    if (password !== 'admin') {
      setPasswordError('Senha incorreta')
      return
    }

    if (modalMode === 'add') {
      const newCollaborator: CollaboratorRow = {
        id: Date.now(),
        full_name: formState.full_name || 'Colaborador sem nome',
        department: formState.department || '—',
        position: formState.position || '—',
        is_active: formState.is_active,
        mentions: 0,
        avgRating: undefined,
      }
      setCollaborators(prev => [newCollaborator, ...prev])
    } else if (modalMode === 'edit' && selectedCollaborator) {
      setCollaborators(prev =>
        prev.map(collab =>
          collab.id === selectedCollaborator.id
            ? { ...collab, ...formState }
            : collab,
        ),
      )
    } else if (modalMode === 'remove' && selectedCollaborator) {
      setCollaborators(prev => prev.filter(collab => collab.id !== selectedCollaborator.id))
    }

    closeModal()
  }

  const actionTitle = modalMode === 'add'
    ? 'Adicionar colaborador'
    : modalMode === 'edit'
      ? 'Editar colaborador'
      : modalMode === 'remove'
        ? 'Remover colaborador'
        : ''

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Colaboradores</h1>
            <p className="text-muted-foreground">
              Rankings e métricas filtradas por período.
            </p>
            <p className="text-xs uppercase tracking-wide text-muted-foreground mt-1">{rangeLabel}</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <PeriodFilter
              value={selectedPeriod}
              onChange={setSelectedPeriod}
            />
            <Button variant="secondary" onClick={() => openModal('add')}>
              <Plus className="h-4 w-4" />
              Adicionar colaborador
            </Button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <CardKPI
            title="Total de colaboradores"
            value={collaborators.length.toString()}
            icon={<Users className="h-4 w-4" />}
            hint="Período selecionado"
          />
          <CardKPI
            title="Menções no período"
            value={totalMentions.toString()}
            icon={<MessageSquare className="h-4 w-4" />}
            hint="Avaliações que mencionaram o time"
          />
          <CardKPI
            title="Avaliação média"
            value={avgRating === 0 ? '—' : `${avgRating.toFixed(1)}★`}
            icon={<Star className="h-4 w-4" />}
            hint="Média dos ratings mencionados"
          />
          <CardKPI
            title="Departamento em destaque"
            value={highlightedDepartment}
            icon={<Briefcase className="h-4 w-4" />}
            hint="Equipe mais mencionada no período"
          />
        </div>

        {statusMessage && (
          <div className="rounded-lg border border-[hsl(var(--border))] bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
            {statusMessage}
          </div>
        )}

        <CollaboratorsTable
          collaborators={collaborators}
          isLoading={isLoading}
          onEdit={collaborator => openModal('edit', collaborator)}
          onRemove={collaborator => openModal('remove', collaborator)}
        />
      </div>

      <Dialog open={modalMode !== null} onOpenChange={open => !open && closeModal()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{actionTitle}</DialogTitle>
            <DialogDescription>
              {modalMode === 'remove'
                ? `Informe a senha para confirmar a remoção de ${selectedCollaborator?.full_name}.`
                : 'Digite os dados e confirme com a senha para aplicar a alteração.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {modalMode !== 'remove' && (
              <>
                <div>
                  <Label>Nome completo</Label>
                  <Input
                    value={formState.full_name}
                    onChange={event => setFormState(prev => ({ ...prev, full_name: event.target.value }))}
                    placeholder="Ex.: Ana Souza"
                  />
                </div>
                <div>
                  <Label>Departamento</Label>
                  <Input
                    value={formState.department}
                    onChange={event => setFormState(prev => ({ ...prev, department: event.target.value }))}
                    placeholder="Ex.: E-notariado"
                  />
                </div>
                <div>
                  <Label>Cargo</Label>
                  <Input
                    value={formState.position}
                    onChange={event => setFormState(prev => ({ ...prev, position: event.target.value }))}
                    placeholder="Ex.: Atendente"
                  />
                </div>
                <div>
                  <Label>Status</Label>
                  <select
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                    value={formState.is_active ? 'active' : 'inactive'}
                    onChange={event => setFormState(prev => ({ ...prev, is_active: event.target.value === 'active' }))}
                  >
                    <option value="active">Ativo</option>
                    <option value="inactive">Inativo</option>
                  </select>
                </div>
              </>
            )}

            <div>
              <Label>Senha</Label>
              <Input
                type="password"
                placeholder="admin"
                value={password}
                onChange={event => {
                  setPassword(event.target.value)
                  setPasswordError('')
                }}
              />
              {passwordError && (
                <p className="text-xs text-destructive">{passwordError}</p>
              )}
            </div>
          </div>

          <DialogFooter className="flex flex-wrap gap-2">
            <Button variant="ghost" onClick={closeModal}>Cancelar</Button>
            <Button
              variant={modalMode === 'remove' ? 'destructive' : 'default'}
              onClick={handleModalConfirm}
            >
              {modalMode === 'remove' ? 'Remover' : modalMode === 'edit' ? 'Salvar' : 'Adicionar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  )
}
