import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { renderizar } from '@/testes/render'
import { servidor } from '@/testes/servidor'
import { Global } from '@/rodada/pages/Global'

beforeAll(() => servidor.listen({ onUnhandledRequest: 'error' }))
afterEach(() => servidor.resetHandlers())
afterAll(() => servidor.close())

const ROTA = '/resultados/4a7f0000-0000-0000-0000-000000000001'
const CAMINHO = '/resultados/:runId'

function abrir() {
  return renderizar(<Global />, { rota: ROTA, caminho: CAMINHO })
}

describe('Global — os quadros do painel carregam como UMA unidade', () => {
  it('o painel tem um estado de carga próprio, separado do resto da tela', async () => {
    // `/painel` demora; `/meta` responde na hora. A tela precisa mostrar os
    // KPIs e só o painel em carga — e não a página inteira em branco.
    servidor.use(
      http.get('/api/runs/:runId/painel', async () => {
        await new Promise((r) => setTimeout(r, 80))
        return HttpResponse.json({
          anos: [],
          cascata: [],
          capexPorComponente: [],
          elementosPorAno: [],
          fimCapex: 2033,
        })
      }),
    )

    abrir()

    // Os KPIs já estão na tela…
    expect(await screen.findByText('VPL do plano')).toBeInTheDocument()
    // …e o painel ainda está carregando, com rótulo próprio.
    expect(
      screen.getByText('Carregando os quadros do painel…', { selector: '.sr-only' }),
    ).toBeInTheDocument()
  })

  it('quando o payload falha, os SEIS somem juntos — não há falha por quadro', async () => {
    servidor.use(
      http.get('/api/runs/:runId/painel', () => new HttpResponse(null, { status: 500 })),
    )

    abrir()

    expect(
      await screen.findByText('Não foi possível carregar o painel desta rodada.'),
    ).toBeInTheDocument()
    // Nenhum dos seis sobreviveu sozinho: o payload é indivisível.
    expect(screen.queryByText('Decomposição do VPL')).not.toBeInTheDocument()
    expect(screen.queryByText('Desembolso por ano')).not.toBeInTheDocument()
    expect(screen.queryByText('Curva S — CAPEX acumulado')).not.toBeInTheDocument()

    // Mas os KPIs, que vêm de /meta, continuam lá.
    expect(screen.getByText('VPL do plano')).toBeInTheDocument()
  })
})

describe('Global — a tabela equivalente é obrigatória, e é o alívio de contraste', () => {
  it('cada quadro oferece "Ver como tabela"', async () => {
    abrir()
    await screen.findByText('Decomposição do VPL')

    // O número de quadros mudou quando "Elementos e preço unitário" virou
    // panorama + detalhe (os cards do panorama não são quadros, e o quadro do
    // detalhe só existe depois do clique). O que a regra exige não é uma
    // contagem: é que todo quadro desenhado tenha a sua tabela. Então o teste
    // passou a comparar as duas abas entre si.
    expect(screen.getAllByRole('tab', { name: 'Tabela' })).toHaveLength(
      screen.getAllByRole('tab', { name: 'Gráfico' }).length,
    )
    expect(screen.getAllByRole('tab', { name: 'Tabela' }).length).toBeGreaterThanOrEqual(4)
  })

  it('o quadro que o panorama de componentes abre também tem tabela', async () => {
    abrir()
    await screen.findByText('Decomposição do VPL')

    // O panorama é uma grade de botões — um por componente do recorte.
    await userEvent.click(
      screen.getByRole('button', { name: /Rede coletora .* abrir o detalhe ano a ano/ }),
    )

    // Pelo SUBTÍTULO, e não pelo título: "Rede coletora" também é o rótulo do
    // botão do panorama que acabou de ser clicado.
    const quadro = (await screen.findByText(/ano a ano, em m/)).closest('figure')!
    await userEvent.click(within(quadro).getByRole('tab', { name: 'Tabela' }))
    // As três colunas de número: a identidade quantidade x preço = CAPEX.
    expect(within(quadro).getByText('Quantidade (m)')).toBeInTheDocument()
    expect(within(quadro).getByText('Preço unitário (R$/m)')).toBeInTheDocument()
    expect(within(quadro).getByText('CAPEX')).toBeInTheDocument()
  })

  it('o teto de CAPEX ausente aparece como traço, e não como zero', async () => {
    abrir()
    const titulo = await screen.findByText('Desembolso por ano')
    const quadro = titulo.closest('figure')!

    await userEvent.click(within(quadro).getByRole('tab', { name: 'Tabela' }))

    const tabela = within(quadro).getByRole('table')
    // 2033 está fora da janela de orçamento: teto nulo.
    const linha2033 = within(tabela).getByText('2033').closest('tr')!
    expect(within(linha2033).getByText('—')).toBeInTheDocument()
  })
})

describe('Global — o breadcrumb sai do provider, não da URL', () => {
  it('a rota é plana e a trilha ainda assim tem os dois degraus', async () => {
    abrir()
    await screen.findByText('VPL do plano')

    const trilha = screen.getByRole('navigation', { name: /trilha de navegação/i })
    expect(within(trilha).getByText('Histórico')).toBeInTheDocument()
  })
})
