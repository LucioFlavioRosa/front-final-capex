import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderizar } from '@/testes/render'
import { servidor, UNIDADES_R4 } from '@/testes/servidor'
import { Simular } from '@/rodada/pages/Simular'

beforeAll(() => servidor.listen({ onUnhandledRequest: 'error' }))
afterEach(() => servidor.resetHandlers())
afterAll(() => servidor.close())

/** Os dois selects encadeados: a unidade só existe depois que a regional
 *  responde, então cada passo espera a lista chegar. */
async function escolherUnidade(id: string) {
  const regional = screen.getByLabelText('Regional')
  await waitFor(() =>
    expect(
      within(regional)
        .getAllByRole('option')
        .some((o) => (o as HTMLOptionElement).value),
    ).toBe(true),
  )
  await userEvent.selectOptions(regional, 'R4')

  const unidade = screen.getByLabelText('Unidade')
  await waitFor(() =>
    expect(
      within(unidade)
        .getAllByRole('option')
        .some((o) => (o as HTMLOptionElement).value === id),
    ).toBe(true),
  )
  await userEvent.selectOptions(unidade, id)
}

/** O cartão do resumo, para as buscas não pegarem o formulário por engano. */
function resumo() {
  return screen.getByText('Resumo').closest('div')!.parentElement!
}

/**
 * O RESUMO FIXO — a última leitura antes de um clique irreversível.
 *
 * A rodada cria um `run_id` que existe para sempre no histórico, e o formulário
 * tem cinco blocos: quem chega ao botão já rolou por todos. O cartão junta os
 * onze valores num lugar só, e é isso que estes testes protegem.
 */
describe('Simular — o resumo mostra o que vai ser disparado', () => {
  it('lista os parâmetros do formulário, e acompanha quem os muda', async () => {
    renderizar(<Simular />)

    // Os valores padrão, que são os que a equipe roda hoje.
    expect(resumo()).toHaveTextContent('curva S')
    // 560 = a soma do cronograma padrão (60+60+50×4+40×2+30×3+20×3+10), que é
    // o que a equipe roda hoje. O resumo SOMA o cronograma, e não repete um
    // campo digitado — se alguém trocar o padrão, este número acompanha.
    expect(resumo()).toHaveTextContent('R$ 560 Mi')

    // Sem abrir nada: "Parâmetros do motor" nasce aberto.
    await userEvent.click(screen.getByRole('radio', { name: 'Linear' }))

    expect(resumo()).toHaveTextContent('linear')
  })

  it('sem unidade escolhida, a linha da unidade AVISA em vez de mentir um nome', () => {
    renderizar(<Simular />)
    expect(resumo()).toHaveTextContent('—')
  })

  it('o PORTE vem de /unidades/{id}: tamanho e as três categorias de obra', async () => {
    renderizar(<Simular />)
    await escolherUnidade('56')

    expect(await screen.findByText(/21 cidades · 148 sistemas/)).toBeInTheDocument()
    // CTS aparece MESMO SENDO ZERO: se a unidade não tem, ligar `USAR_CTS` não
    // muda nada, e é melhor descobrir aqui do que depois da rodada.
    expect(screen.getByText(/0 CTS · 148 ETEs/)).toBeInTheDocument()
    // Três categorias, e não um total: um número só esconderia as 1.520 linhas
    // que não são obra nenhuma.
    expect(
      screen.getByText('1.914 Aegea · 176 de terceiros · 1.520 sem obra'),
    ).toBeInTheDocument()
  })

  it('servidor SEM os contadores não derruba o resumo — só omite as duas linhas', async () => {
    // O caso real: um servidor anterior a esta mudança devolve a unidade sem
    // `resumo`. Os outros nove valores continuam, e a tela não estoura tentando
    // formatar `undefined`.
    servidor.use(
      http.get('/api/unidades/:id', ({ params }) =>
        HttpResponse.json(UNIDADES_R4.find((u) => u.id === params.id)),
      ),
    )
    renderizar(<Simular />)
    await escolherUnidade('56')

    expect(await screen.findByText('ÁGUAS DO RIO 01')).toBeInTheDocument()
    expect(screen.queryByText(/cidades ·/)).not.toBeInTheDocument()
    expect(resumo()).toHaveTextContent('Janela de CAPEX')
  })
})
