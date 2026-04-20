import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Activity, Loader2, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  fetchCollectionHealth,
  resetDegradedState,
  type CollectionHealthData,
  type CollectionRunHealth,
} from '@/lib/api/collection-health'

function formatDateTime(iso: string | null): string {
  if (!iso) return '-'
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDuration(run: CollectionRunHealth): string {
  if (!run.execution_time_ms && run.execution_time_ms !== 0) {
    if (!run.started_at || !run.completed_at) return '-'
    const ms =
      new Date(run.completed_at).getTime() - new Date(run.started_at).getTime()
    if (ms < 1000) return `${ms}ms`
    return `${(ms / 1000).toFixed(1)}s`
  }
  if (run.execution_time_ms < 1000) return `${run.execution_time_ms}ms`
  return `${(run.execution_time_ms / 1000).toFixed(1)}s`
}

function formatTimeAgo(iso: string | null): string {
  if (!iso) return 'nunca'
  const diff = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(diff / 60000)
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  return `${hours} horas`
}

type HealthLevel = 'ok' | 'warning' | 'error'

function getHealthLevel(lastSuccessAt: string | null): HealthLevel {
  if (!lastSuccessAt) return 'error'
  const hoursAgo =
    (Date.now() - new Date(lastSuccessAt).getTime()) / (1000 * 60 * 60)
  if (hoursAgo < 3) return 'ok'
  if (hoursAgo < 6) return 'warning'
  return 'error'
}

const healthConfig: Record<
  HealthLevel,
  { label: string; variant: 'default' | 'secondary' | 'destructive'; className: string }
> = {
  ok: {
    label: 'Coleta funcionando',
    variant: 'secondary',
    className: 'bg-green-100 text-green-800 hover:bg-green-100',
  },
  warning: {
    label: 'Atenção',
    variant: 'secondary',
    className: 'bg-yellow-100 text-yellow-800 hover:bg-yellow-100',
  },
  error: {
    label: 'Falha',
    variant: 'destructive',
    className: '',
  },
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'completed')
    return (
      <Badge
        variant="secondary"
        className="bg-green-100 text-green-800 hover:bg-green-100"
      >
        Concluído
      </Badge>
    )
  if (status === 'failed')
    return <Badge variant="destructive">Falhou</Badge>
  return <Badge variant="secondary">Em andamento</Badge>
}

function HealthStatusCard({ data }: { data: CollectionHealthData }) {
  const level = getHealthLevel(data.last_success_at)
  const config = healthConfig[level]
  const timeAgo = formatTimeAgo(data.last_success_at)

  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-6">
        <Activity className="size-8 shrink-0 text-muted-foreground" />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <Badge variant={config.variant} className={config.className}>
              {config.label}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {data.last_success_at
              ? `Última execução bem-sucedida há ${timeAgo}`
              : 'Nenhuma execução bem-sucedida registrada'}
          </p>
          {data.consecutive_failures > 0 && (
            <p className="mt-1 text-sm text-destructive">
              {data.consecutive_failures} falha(s) consecutiva(s)
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export default function CollectionHealthPage() {
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['collection-health'],
    queryFn: fetchCollectionHealth,
    refetchInterval: 60000,
  })

  const handleReset = async () => {
    try {
      await resetDegradedState()
      await queryClient.invalidateQueries({ queryKey: ['collection-health'] })
      toast.success('Estado degradado resetado com sucesso')
    } catch {
      toast.error('Erro ao resetar estado degradado')
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
        <Loader2 className="mr-2 size-4 animate-spin" />
        Carregando dados de saúde da coleta...
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Saúde da Coleta
          </h1>
          <p className="text-sm text-muted-foreground">
            Monitoramento das execuções de coleta de avaliações.
          </p>
        </div>
        {data.is_degraded && (
          <Button variant="destructive" onClick={handleReset}>
            <RotateCcw className="mr-2 size-4" />
            Resetar Modo Degradado
          </Button>
        )}
      </div>

      <HealthStatusCard data={data} />

      <Card>
        <CardHeader>
          <CardTitle>Histórico de Execuções</CardTitle>
          <CardDescription>
            Últimas 50 execuções de coleta ordenadas por data.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.runs.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-sm text-muted-foreground">
              <Activity className="size-8" />
              <p>Nenhuma execução registrada.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data/Hora</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Duração</TableHead>
                  <TableHead className="text-right">Novos</TableHead>
                  <TableHead className="text-right">Ignorados</TableHead>
                  <TableHead>Erro</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.runs.map((run) => (
                  <TableRow key={run.id}>
                    <TableCell className="text-sm">
                      {formatDateTime(run.started_at)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={run.status} />
                    </TableCell>
                    <TableCell className="text-sm">
                      {formatDuration(run)}
                    </TableCell>
                    <TableCell className="text-right font-medium text-green-700">
                      {run.reviews_new.toLocaleString('pt-BR')}
                    </TableCell>
                    <TableCell className="text-right">
                      {(run.reviews_found - run.reviews_new).toLocaleString(
                        'pt-BR',
                      )}
                    </TableCell>
                    <TableCell className="max-w-48 truncate text-xs text-muted-foreground">
                      {run.error_message ?? '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
