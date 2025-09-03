"use client"

import React from 'react'
import { AlertCircle, Wifi, Database, RefreshCw } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/Badge'

interface DataErrorBoundaryProps {
  error?: Error | string
  isLoading?: boolean
  retry?: () => void
  title?: string
  description?: string
  showDetails?: boolean
}

export function DataErrorBoundary({
  error,
  isLoading,
  retry,
  title = "Erro ao carregar dados",
  description = "Não foi possível carregar os dados solicitados.",
  showDetails = false
}: DataErrorBoundaryProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[200px] p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-muted-foreground">Carregando dados...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!error) return null

  const errorMessage = typeof error === 'string' ? error : error.message
  const isNetworkError = errorMessage?.includes('network') || errorMessage?.includes('fetch')
  const isDatabaseError = errorMessage?.includes('database') || errorMessage?.includes('query')

  return (
    <div className="flex items-center justify-center min-h-[300px] p-4">
      <Card className="w-full max-w-md">
        <CardContent className="pt-6">
          <div className="text-center">
            {isNetworkError ? (
              <Wifi className="h-12 w-12 text-orange-500 mx-auto mb-4" />
            ) : isDatabaseError ? (
              <Database className="h-12 w-12 text-blue-500 mx-auto mb-4" />
            ) : (
              <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            )}

            <h3 className="text-lg font-semibold mb-2">{title}</h3>
            <p className="text-muted-foreground mb-4 text-sm">
              {description}
            </p>

            {showDetails && errorMessage && (
              <div className="mb-4 p-3 bg-muted rounded-md text-left">
                <p className="text-xs font-medium mb-1">Detalhes do erro:</p>
                <p className="text-xs text-muted-foreground break-words">
                  {errorMessage}
                </p>
              </div>
            )}

            <div className="flex gap-2 justify-center">
              {retry && (
                <Button onClick={retry} size="sm">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Tentar novamente
                </Button>
              )}
              <Button
                onClick={() => window.location.reload()}
                variant="outline"
                size="sm"
              >
                Recarregar página
              </Button>
            </div>

            <div className="mt-4 flex justify-center">
              <Badge variant="outline" className="text-xs">
                {isNetworkError ? 'Erro de conexão' :
                 isDatabaseError ? 'Erro de banco de dados' :
                 'Erro interno'}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// Hook personalizado para gerenciar estados de erro em dados
export function useDataError() {
  const [error, setError] = React.useState<Error | string | undefined>(undefined)
  const [isLoading, setIsLoading] = React.useState(false)

  const handleError = React.useCallback((err: Error | string) => {
    setError(err)
    setIsLoading(false)
  }, [])

  const handleRetry = React.useCallback(() => {
    setError(undefined)
    setIsLoading(false)
  }, [])

  const handleLoading = React.useCallback((loading: boolean) => {
    setIsLoading(loading)
    if (loading) setError(undefined)
  }, [])

  return {
    error,
    isLoading,
    setError: handleError,
    retry: handleRetry,
    setLoading: handleLoading,
    reset: () => {
      setError(undefined)
      setIsLoading(false)
    }
  }
}

// Wrapper para componentes que precisam de tratamento de erro de dados
export function withDataErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  options?: {
    title?: string
    description?: string
    showDetails?: boolean
  }
) {
  const WrappedComponent = React.forwardRef<HTMLElement, P>((props, ref) => {
    const { error, isLoading, setError, retry, setLoading } = useDataError()

    // Injetar handlers de erro nas props
    const enhancedProps = {
      ...props,
      onError: setError,
      onLoading: setLoading,
      onRetry: retry
    } as P

    return (
      <>
        <Component {...enhancedProps} ref={ref} />
        <DataErrorBoundary
          error={error}
          isLoading={isLoading}
          retry={retry}
          {...options}
        />
      </>
    )
  })

  WrappedComponent.displayName = `withDataErrorBoundary(${Component.displayName || Component.name})`

  return WrappedComponent
}
