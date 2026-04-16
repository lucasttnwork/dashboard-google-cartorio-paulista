import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Upload,
  FileJson,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Clock,
  History,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  uploadDataset,
  fetchCollectionRuns,
  type DatasetUploadResponse,
  type CollectionRun,
} from '@/lib/api/dataset-upload'

type Status = 'idle' | 'uploading' | 'success' | 'error'

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

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function StatusBadge({ status }: { status: string }) {
  const variant = status === 'completed' ? 'default' : status === 'failed' ? 'destructive' : 'secondary'
  const label = status === 'completed' ? 'Concluido' : status === 'failed' ? 'Falhou' : 'Em andamento'
  return <Badge variant={variant === 'default' ? 'secondary' : 'destructive'}
    className={status === 'completed' ? 'bg-green-100 text-green-800 hover:bg-green-100' : undefined}
  >{label}</Badge>
}

export default function DatasetUploadPage() {
  const [status, setStatus] = useState<Status>('idle')
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<DatasetUploadResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [runs, setRuns] = useState<CollectionRun[]>([])
  const [loadingRuns, setLoadingRuns] = useState(true)
  const inputRef = useRef<HTMLInputElement>(null)

  const loadRuns = useCallback(async () => {
    try {
      const data = await fetchCollectionRuns()
      setRuns(data)
    } catch {
      // silent — history is non-critical
    } finally {
      setLoadingRuns(false)
    }
  }, [])

  useEffect(() => {
    loadRuns()
  }, [loadRuns])

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (!file) return
      if (!file.name.endsWith('.json')) {
        toast.error('Formato invalido. Selecione um arquivo .json')
        return
      }
      setSelectedFile(file)
      setStatus('idle')
      setResult(null)
      setError(null)
    },
    [],
  )

  const handleUpload = useCallback(async () => {
    if (!selectedFile) return
    setStatus('uploading')
    setProgress(0)
    setError(null)
    setResult(null)

    try {
      const data = await uploadDataset(selectedFile, setProgress)
      setResult(data)
      setStatus('success')
      toast.success(
        `Importacao concluida: ${data.new_reviews} novos, ${data.updated_reviews} atualizados`,
      )
      loadRuns()
    } catch (err: unknown) {
      setStatus('error')
      let msg = 'Erro desconhecido'
      if (err && typeof err === 'object' && 'response' in err) {
        const resp = (err as { response?: { data?: { detail?: string } } }).response
        msg = resp?.data?.detail ?? msg
      } else if (err instanceof Error) {
        msg = err.message
      }
      const friendlyMessages: Record<string, string> = {
        file_must_be_json: 'O arquivo precisa ser do tipo JSON.',
        file_too_large: 'O arquivo excede o tamanho maximo permitido (100 MB).',
        invalid_json: 'O conteudo do arquivo nao e um JSON valido.',
        empty_dataset: 'O arquivo esta vazio (nenhuma avaliacao encontrada).',
        json_must_be_array: 'O arquivo deve conter uma lista de avaliacoes (array JSON).',
      }
      setError(friendlyMessages[msg] ?? msg)
      toast.error('Falha na importacao do dataset')
    }
  }, [selectedFile, loadRuns])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (!file) return
    if (!file.name.endsWith('.json')) {
      toast.error('Formato invalido. Selecione um arquivo .json')
      return
    }
    setSelectedFile(file)
    setStatus('idle')
    setResult(null)
    setError(null)
  }, [])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
  }, [])

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Importar Dados de Avaliacoes
        </h1>
        <p className="text-sm text-muted-foreground">
          Envie arquivos JSON exportados do Google Maps Reviews Scraper (Apify)
          para atualizar a base de avaliacoes. Dados duplicados sao tratados
          automaticamente.
        </p>
      </div>

      {/* Upload card */}
      <Card>
        <CardHeader>
          <CardTitle>Enviar Arquivo</CardTitle>
          <CardDescription>
            Arraste ou selecione o arquivo JSON do dataset. Avaliacoes que ja
            existem no banco serao atualizadas; novas avaliacoes serao
            adicionadas. Nenhum dado e duplicado.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click()
            }}
            role="button"
            tabIndex={0}
            className="flex cursor-pointer flex-col items-center gap-3 rounded-lg border-2 border-dashed border-muted-foreground/25 p-8 text-center transition-colors hover:border-primary/50 hover:bg-muted/50"
          >
            {selectedFile ? (
              <>
                <FileJson className="size-10 text-primary" />
                <div>
                  <p className="font-medium text-foreground">
                    {selectedFile.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatSize(selectedFile.size)}
                  </p>
                </div>
              </>
            ) : (
              <>
                <Upload className="size-10 text-muted-foreground" />
                <div>
                  <p className="font-medium text-foreground">
                    Arraste o arquivo aqui
                  </p>
                  <p className="text-xs text-muted-foreground">
                    ou clique para selecionar (formato .json)
                  </p>
                </div>
              </>
            )}
            <input
              ref={inputRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={handleFileSelect}
            />
          </div>

          {status === 'uploading' && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Processando avaliacoes... Isso pode levar alguns segundos.
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          <Button
            onClick={handleUpload}
            disabled={!selectedFile || status === 'uploading'}
            className="w-full"
          >
            {status === 'uploading' ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Processando...
              </>
            ) : (
              <>
                <Upload className="mr-2 size-4" />
                Importar Avaliacoes
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Success result */}
      {status === 'success' && result && (
        <Alert>
          <CheckCircle2 className="size-4 text-green-600" />
          <AlertTitle>Importacao concluida</AlertTitle>
          <AlertDescription>
            <div className="mt-2 grid grid-cols-2 gap-x-8 gap-y-1 text-sm">
              <span className="text-muted-foreground">Total processado:</span>
              <span className="font-medium">
                {result.total_processed.toLocaleString('pt-BR')} avaliacoes
              </span>
              <span className="text-muted-foreground">Novas avaliacoes:</span>
              <span className="font-medium text-green-700">
                {result.new_reviews.toLocaleString('pt-BR')}
              </span>
              <span className="text-muted-foreground">Atualizadas:</span>
              <span className="font-medium">
                {result.updated_reviews.toLocaleString('pt-BR')}
              </span>
              <span className="text-muted-foreground">Total no banco:</span>
              <span className="font-medium">
                {result.total_in_database.toLocaleString('pt-BR')}
              </span>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Error */}
      {status === 'error' && error && (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertTitle>Erro na importacao</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="size-5" />
            Historico de Importacoes
          </CardTitle>
          <CardDescription>
            Registro de todas as importacoes manuais realizadas.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingRuns ? (
            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
              <Loader2 className="mr-2 size-4 animate-spin" />
              Carregando historico...
            </div>
          ) : runs.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-sm text-muted-foreground">
              <Clock className="size-8" />
              <p>Nenhuma importacao realizada ainda.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">#</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Processados</TableHead>
                  <TableHead className="text-right">Novos</TableHead>
                  <TableHead className="text-right">Atualizados</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((run) => (
                  <TableRow key={run.id}>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {run.id}
                    </TableCell>
                    <TableCell className="text-sm">
                      {formatDateTime(run.started_at)}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={run.status} />
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {run.reviews_found.toLocaleString('pt-BR')}
                    </TableCell>
                    <TableCell className="text-right text-green-700">
                      {run.reviews_new.toLocaleString('pt-BR')}
                    </TableCell>
                    <TableCell className="text-right">
                      {run.reviews_updated.toLocaleString('pt-BR')}
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
