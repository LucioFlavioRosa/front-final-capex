import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderizar } from '@/testes/render'
import { RUNS, servidor } from '@/testes/servidor'
import { Historico } from '@/rodada/pages/Historico'

beforeAll(() => servidor.listen({ onUnhandledRequest: 'error' }))
afterEach(() => servidor.resetHandlers())
afterAll(() => servidor.close())

async function abrirDetalhes() {
  renderizar(<Historico />)
  await screen.findByRole('table', { name: /rodadas de simulação/i })
  await userEvent.click(await screen.findByRole('button', { name: /ver detalhes da simulação/i }))
  return screen.findByRole('dialog')
}

/**
 * "VER DETALHES" — o PEDIDO da rodada, que o painel lateral não mostra.
 *
 * O painel responde "o que esta rodada deu"; o modal responde "com o que ela
 * foi pedida". A segunda resposta tem mais de vinte linhas e não caberia no
 * painel sem empurrar o comentário para fora da tela.
 */
describe('Histórico — ver detalhes da simulação', () => {
  it('mostra quem pediu, quando, e as variáveis EM ORDEM DE LEITURA', async () => {
    const dialogo = await abrirDetalhes()

    expect(dialogo).toHaveTextContent('murilo.caires')
    expect(dialogo).toHaveTextContent('ÁGUAS DO RIO 01')

    // A ordem é a do formulário — orçamento primeiro, ajuste de execução por
    // último —, e não a do JSON, que não significa nada. O fixture manda as
    // chaves embaralhadas de propósito.
    const rotulos = within(dialogo)
      .getAllByRole('term')
      .map((t) => t.textContent ?? '')
    const posicao = (chave: string) => rotulos.findIndex((r) => r.includes(chave))
    expect(posicao('ORCAMENTO')).toBeLessThan(posicao('FOCO_COBERTURA'))
    expect(posicao('FOCO_COBERTURA')).toBeLessThan(posicao('MAX_TIME_S'))
  })

  it('traduz o que `String(v)` estragaria: booleano, orçamento e nome técnico', async () => {
    const dialogo = await abrirDetalhes()

    // `true` vira "sim" — "true" é vocabulário de máquina.
    expect(dialogo).toHaveTextContent('sim')
    // O JSON cru do orçamento é ilegível, e é o parâmetro mais consultado.
    expect(dialogo).toHaveTextContent('2026: R$ 60 mi · 2027: R$ 60 mi')
    // O rótulo humano ACOMPANHA o técnico, e não o substitui: quem compara com
    // o notebook precisa de um, quem lê o histórico precisa do outro.
    expect(dialogo).toHaveTextContent('Base de receita')
    expect(dialogo).toHaveTextContent('BASE_RECEITA')
  })

  it('rodada SEM pedido gravado diz isso — em vez de uma lista vazia', async () => {
    // A rodada publicada direto pelo pacote de produção não passou pela fila, e
    // uma lista vazia se leria como "rodou sem parâmetro nenhum".
    servidor.use(
      http.get('/api/runs', () =>
        HttpResponse.json(RUNS.map((r) => ({ ...r, pedido: null }))),
      ),
    )
    const dialogo = await abrirDetalhes()

    expect(dialogo).toHaveTextContent(/não tem o pedido registrado/i)
  })

  it('Esc fecha, e o foco volta para o botão que abriu', async () => {
    await abrirDetalhes()
    const gatilho = screen.getByRole('button', { name: /ver detalhes da simulação/i })

    await userEvent.keyboard('{Escape}')

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    // Sem o retorno de foco, o teclado voltaria ao início da página — e a lista
    // de rodadas é longa.
    expect(gatilho).toHaveFocus()
  })

  it('o foco inicial vai em FECHAR, e não em "Ver resultados"', async () => {
    const dialogo = await abrirDetalhes()

    // O modal é uma parada para ler: Enter logo após abrir não pode navegar
    // para fora antes de a pessoa ter lido o que pediu para ver.
    expect(within(dialogo).getByRole('button', { name: 'Fechar' })).toHaveFocus()
  })

  it('sem resultado publicado, "Ver resultados" fica desabilitado COM motivo', async () => {
    servidor.use(
      http.get('/api/runs', () =>
        HttpResponse.json(RUNS.map((r) => ({ ...r, publicada: false, metricas: undefined }))),
      ),
    )
    const dialogo = await abrirDetalhes()

    const abrir = within(dialogo).getByRole('button', { name: /ver resultados/i })
    expect(abrir).toBeDisabled()
    expect(abrir).toHaveAttribute('title', 'Esta rodada não tem resultado para abrir.')
  })

  it('o comentário do modal é o MESMO do painel — não uma cópia em branco', async () => {
    const dialogo = await abrirDetalhes()

    expect(within(dialogo).getByLabelText('Comentário da rodada')).toHaveValue(
      'Base aprovada na reunião de 14/08.',
    )
    // Salvar fica desabilitado sem mudança: um botão que aceita clique sem ter
    // o que gravar ensina que salvar não significa nada.
    expect(within(dialogo).getByRole('button', { name: /salvar comentário/i })).toBeDisabled()

    await userEvent.type(within(dialogo).getByLabelText('Comentário da rodada'), ' Revisado.')
    expect(within(dialogo).getByRole('button', { name: /salvar comentário/i })).toBeEnabled()
  })
})
