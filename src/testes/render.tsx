import type { ReactElement } from 'react'
import { render } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ToastProvider } from '@/components/ui/Toaster'

/**
 * Render das telas de rodada em teste.
 *
 * `retry: false` no cliente de query é obrigatório aqui, e não preferência: com
 * retry ligado, um teste do estado de ERRO espera as tentativas antes de o
 * componente entrar em `isError`, e ele estoura o timeout em vez de falhar pelo
 * motivo real. É a armadilha clássica de testar react-query.
 *
 * Cada chamada cria um QueryClient NOVO — cache compartilhado entre testes faria
 * o segundo teste ler o dado que o primeiro buscou, e ele passaria mesmo com o
 * handler quebrado.
 */
export function renderizar(
  ui: ReactElement,
  { rota = '/', caminho }: { rota?: string; caminho?: string } = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false },
    },
  })

  return render(
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <MemoryRouter initialEntries={[rota]}>
          {caminho ? (
            <Routes>
              <Route path={caminho} element={ui} />
            </Routes>
          ) : (
            ui
          )}
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  )
}
