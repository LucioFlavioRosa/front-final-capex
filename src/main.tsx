import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from './auth/AuthContext'
import { ToastProvider } from './components/ui/Toaster'
import { router } from './router'
import './index.css'

/**
 * O cliente de query das telas de rodada.
 *
 * `retry: 1` e não o default de 3: as leituras de resultado são de uma rodada
 * IMUTÁVEL, então um erro raramente é transitório — 403 sem concessão de acesso
 * e 404 de rodada excluída não melhoram na terceira tentativa, e três rodadas
 * de retry só atrasam a tela de erro que já sabe o que dizer.
 *
 * `refetchOnWindowFocus: false` no default pelo mesmo motivo: resultado
 * publicado não muda. A exceção é a prontidão do cadastro, que liga o refetch
 * explicitamente no próprio hook — ela é o dado mais volátil do app.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
)
