"use client"

import { PropsWithChildren, useState } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ThemeProvider } from "@/lib/theme"

export default function Providers({ children }: PropsWithChildren) {
  const [client] = useState(() => new QueryClient({
    defaultOptions: {
      queries: { staleTime: 60_000, refetchOnWindowFocus: false },
    },
  }))

  return (
    <QueryClientProvider client={client}>
      <ThemeProvider defaultTheme="dark" storageKey="dashboard-theme">
        {children}
      </ThemeProvider>
    </QueryClientProvider>
  )
}
