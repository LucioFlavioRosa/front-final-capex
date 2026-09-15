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
    // `findByText` da posição, e não do `role`: o "Consultando a fila…" também é
    // `status`, e apareceria antes da resposta.
    const frase = await screen.findByText('Próxima a entrar')
    expect(frase.parentElement?.className).toContain('bg-warning/10')
    expect(screen.getByText(/NENHUM executor/)).toBeInTheDocument()
  })

  it('rodando: mostra o progresso com semântica de barra, não a posição', async () => {
    status({ status: 'RODANDO', progresso: 42, fila: { posicao: 0, motivo: 'Em execução.', atencao: false, vivos: 1 } })
    renderizar(<NoticiaDaFila runId="run_1" status="RODANDO" />)
    expect(await screen.findByText('42%')).toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '42')
    expect(screen.queryByText(/na fila|Próxima/)).not.toBeInTheDocument()
  })

  it('o MODO segue a etiqueta da lista, não a resposta: PENDENTE na lista e RODANDO no sinal ainda mostra a posição', async () => {
    // Um ciclo de polling em que `/status` já avançou e a lista não: a tela não
    // pode dizer "na fila" ao lado de "executando 42%". A posição fica, e a lista
    // é pedida de novo.
    status({ status: 'RODANDO', progresso: 42, fila: { posicao: 0, motivo: 'Em execução.', atencao: false, vivos: 1 } })
    renderizar(<NoticiaDaFila runId="run_1" status="PENDENTE" />)
    expect(await screen.findByText('Próxima a entrar')).toBeInTheDocument()
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  })

  it('erro ao consultar: diz que a fila não pôde ser lida, sem esconder a rodada', async () => {
    servidor.use(http.get('/api/runs/:runId/status', () => HttpResponse.json({ detail: 'x' }, { status: 500 })))
    renderizar(<NoticiaDaFila runId="run_1" status="PENDENTE" />)
    expect(await screen.findByText(/Não foi possível consultar a fila/)).toBeInTheDocument()
  })

  it('rodada terminada não consulta nada', () => {
    renderizar(<NoticiaDaFila runId="run_1" status="OPTIMAL" />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
