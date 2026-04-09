import { useEffect, useState } from 'react'

export default function HealthPage() {
  const [backend, setBackend] = useState<string>('checking...')

  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_BASE_URL}/health`)
      .then((r) => r.json())
      .then((d) => setBackend(JSON.stringify(d)))
      .catch((e: unknown) => {
        const message = e instanceof Error ? e.message : String(e)
        setBackend(`error: ${message}`)
      })
  }, [])

  return (
    <main className="min-h-screen flex items-center justify-center">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-semibold mb-4">Cartório Dashboard — Health</h1>
        <p className="text-muted-foreground mb-2">Frontend OK</p>
        <pre className="text-xs bg-muted p-4 rounded">{backend}</pre>
      </div>
    </main>
  )
}
