import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info)
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[400px] flex-col items-center justify-center gap-4 text-center">
          <h2 className="text-lg font-semibold text-foreground">
            Algo deu errado
          </h2>
          <p className="max-w-md text-sm text-muted-foreground">
            Ocorreu um erro inesperado. Tente recarregar a página.
          </p>
          <Button
            variant="outline"
            onClick={() => this.setState({ hasError: false })}
          >
            Tentar novamente
          </Button>
        </div>
      )
    }

    return this.props.children
  }
}
