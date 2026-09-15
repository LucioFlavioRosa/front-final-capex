/**
 * A NOTÍCIA DA FILA diz a posição — e não só "na fila".
 *
 * O caso que motivou: três rodadas disparadas, três etiquetas "Na fila", e
 * ninguém sabia qual entrava primeiro nem se havia executor de pé.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { renderizar } from '@/testes/render'
import { servidor } from '@/testes/servidor'
import { NoticiaDaFila, posicaoNaFila } from '@/rodada/components/NoticiaDaFila'

beforeAll(() => servidor.listen({ onUnhandledRequest: 'error' }))
afterEach(() => servidor.resetHandlers())
afterAll(() => servidor.close())

const status = (corpo: Record<string, unknown>) =>
  servidor.use(http.get('/api/runs/:runId/status', () => HttpResponse.json({ runId: 'run_1', ...corpo })))

describe('NoticiaDaFila', () => {
  it('a posição é ordinal: 0 na frente é "próxima", 2 na frente é a 3ª', () => {
    expect(posicaoNaFila(0)).toBe('Próxima a entrar')
    expect(posicaoNaFila(2)).toBe('3ª na fila')
  })

  it('pendente com duas na frente: diz "3ª na fila" e o motivo do servidor', async () => {
    status({
      status: 'PENDENTE', progresso: 0,
      fila: { posicao: 2, motivo: 'Todas as vagas estão ocupadas. Há 2 simulações na frente desta.', atencao: false, vivos: 1 },
    })
    renderizar(<NoticiaDaFila runId="run_1" status="PENDENTE" />)
    expect(await screen.findByText('3ª na fila')).toBeInTheDocument()
    expect(screen.getByText(/2 simulações na frente/)).toBeInTheDocument()
  })

  it('sem executor vivo, o aviso fica em destaque', async () => {
    status({
      status: 'PENDENTE', progresso: 0,
      fila: { posicao: 0, motivo: 'NENHUM executor está ativo.', atencao: true, vivos: 0 },
    })
    renderizar(<NoticiaDaFila runId="run_1" status="PENDENTE" />)
    const caixa = await screen.findByRole('status')
    expect(caixa.className).toContain('bg-warning/10')
    expect(screen.getByText(/NENHUM executor/)).toBeInTheDocument()
  })

  it('rodando: mostra o progresso, não a posição', async () => {
    status({ status: 'RODANDO', progresso: 42, fila: { posicao: 0, motivo: 'Em execução.', atencao: false, vivos: 1 } })
    renderizar(<NoticiaDaFila runId="run_1" status="RODANDO" />)
    expect(await screen.findByText('42%')).toBeInTheDocument()
    expect(screen.queryByText(/na fila|Próxima/)).not.toBeInTheDocument()
  })

  it('rodada terminada não consulta nada', () => {
    renderizar(<NoticiaDaFila runId="run_1" status="OPTIMAL" />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
