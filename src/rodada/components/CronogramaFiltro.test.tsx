import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderizar } from '@/testes/render'
import { servidor } from '@/testes/servidor'
import { GraficoCronogramaObras } from '@/rodada/components/GraficoCronogramaObras'

beforeAll(() => servidor.listen({ onUnhandledRequest: 'error' }))
afterEach(() => servidor.resetHandlers())
afterAll(() => servidor.close())

/**
 * O FILTRO DO CRONOGRAMA — quatro botões sobre uma barra só.
 *
 * A leitura é feita pela aba Tabela do quadro, e não pelo SVG: o recharts não
 * tem geometria em jsdom, e a tabela é o equivalente acessível do gráfico —
 * testar por ela cobre o número que o usuário lê nos dois modos.
 *
 * A fixture de 2028 é 2 escolhidas + 0 obrigatórias + 3 de terceiro.
 */
async function abrirTabela() {
  renderizar(<GraficoCronogramaObras runId="run_x" />)
  const quadro = (await screen.findByText('Cronograma de obras')).closest('figure')!
  await userEvent.click(within(quadro).getByRole('tab', { name: 'Tabela' }))
  return quadro
}

/** A linha de 2028 da tabela, como texto de cada célula. */
function linhaDe2028(quadro: HTMLElement) {
  const tr = within(quadro)
    .getAllByRole('row')
    .find((r) => within(r).queryByText('2028'))!
  return within(tr)
    .getAllByRole('cell')
    .map((c) => c.textContent?.trim())
}

async function escolher(quadro: HTMLElement, rotulo: string) {
  await userEvent.click(within(quadro).getByRole('radio', { name: rotulo }))
}

describe('Cronograma de obras — o filtro de recorte', () => {
  it('abre em "todas as obras", que é a SOMA das três parcelas', async () => {
    const quadro = await abrirTabela()
    // 2 escolhidas + 0 obrigatórias + 3 de terceiro = 5. É a propriedade que
    // torna o filtro legível: o usuário vê o total, filtra, e as partes fecham.
    expect(linhaDe2028(quadro)).toEqual(['2028', '5', 'R$ 0,5 mi'])
  })

  it('cada recorte mostra só a sua parcela', async () => {
    const quadro = await abrirTabela()

    await escolher(quadro, 'De terceiro')
    // CAPEX zero é o que DEFINE obra de terceiro — a coluna sai vazia, e não
    // "R$ 0,0 mi", que sugeriria uma obra barata em vez de uma sem CAPEX nosso.
    expect(linhaDe2028(quadro)).toEqual(['2028', '3', '—'])

    await escolher(quadro, 'Escolhidas')
    expect(linhaDe2028(quadro)).toEqual(['2028', '2', 'R$ 0,5 mi'])

    await escolher(quadro, 'Obrigatórias')
    // O ano continua no eixo mesmo vazio: sem isso, trocar de filtro apagaria
    // anos e as barras restantes mudariam de lugar.
    expect(linhaDe2028(quadro)).toEqual(['2028', '—', '—'])
  })

  it('o subtítulo diz qual recorte está no ar', async () => {
    const quadro = await abrirTabela()
    expect(quadro).toHaveTextContent('5 obras no plano')

    await escolher(quadro, 'De terceiro')
    expect(quadro).toHaveTextContent('3 obras de terceiro')

    await escolher(quadro, 'Obrigatórias')
    expect(quadro).toHaveTextContent('nenhuma obra obrigatórias nesta rodada')
  })

  it('só um botão fica marcado por vez', async () => {
    const quadro = await abrirTabela()
    await escolher(quadro, 'Escolhidas')
    const marcados = within(quadro)
      .getAllByRole('radio')
      .filter((b) => b.getAttribute('aria-checked') === 'true')
      .map((b) => b.textContent)
    expect(marcados).toEqual(['Escolhidas'])
  })
})
