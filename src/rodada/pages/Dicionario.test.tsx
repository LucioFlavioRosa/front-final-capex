import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderizar } from '@/testes/render'
import { servidor } from '@/testes/servidor'
import { Simular } from '@/rodada/pages/Simular'

beforeAll(() => servidor.listen({ onUnhandledRequest: 'error' }))
afterEach(() => servidor.resetHandlers())
afterAll(() => servidor.close())

/**
 * Objetivo, receita, curva, penalidade e os dois interruptores vivem sob
 * "Parâmetros do motor", que NASCE ABERTO desde o item 1 do feedback de 26/08
 * — a Aegea disse que são os controles mais usados, e uma gaveta fechada
 * escondia justamente os que mudam o resultado de quem só clica Iniciar.
 *
 * A função ficou como asserção em vez de sumir: se o bloco voltar a nascer
 * fechado, o teste falha AQUI, com o motivo escrito, em vez de falhar cinco
 * linhas depois com "não achei o botão de ajuda".
 */
function conferirParametrosDoMotorAbertos() {
  expect(screen.getByRole('button', { name: /parâmetros do motor/i })).toHaveAttribute(
    'aria-expanded',
    'true',
  )
}

/**
 * O "?" e o painel de verbete — o mesmo gesto do dicionário do Cadastro, do
 * outro lado do produto.
 *
 * O que estes testes protegem, e por que cada um existe:
 *
 *  1. O NOME TÉCNICO NÃO É O NOME ACESSÍVEL. Ele aparece na tela ao lado do
 *     rótulo, mas fora do `<label>` — dentro, o leitor de tela anunciaria
 *     "Unidade UNIDADE". Isto já quebrou uma vez, e em silêncio: o campo
 *     continuava funcionando com o mouse.
 *  2. O "?" É UM ALTERNADOR. Clicar duas vezes no mesmo fecha, que é o gesto de
 *     quem já leu.
 *  3. ESC FECHA. O painel não rouba o foco ao abrir, então sem `Esc` quem abriu
 *     pelo teclado ficaria com um painel que não sabe fechar.
 */
describe('Simular — o "?" abre o dicionário do parâmetro', () => {
  it('o técnico aparece na tela, mas FORA do nome acessível do campo', () => {
    renderizar(<Simular />)

    // Visível para quem compara com o notebook…
    expect(screen.getByText('UNIDADE')).toBeInTheDocument()
    // …e ausente do nome do campo, que continua sendo só "Unidade".
    expect(screen.getByLabelText('Unidade')).toBeInTheDocument()
    expect(screen.queryByLabelText('Unidade UNIDADE')).not.toBeInTheDocument()
  })

  it('abre o verbete com as três seções e os selos de origem e tipo', async () => {
    renderizar(<Simular />)
    conferirParametrosDoMotorAbertos()

    expect(screen.queryByRole('complementary', { name: 'Dicionário de dados' })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'O que é "Estratégia de cobertura"?' }))

    const painel = await screen.findByRole('complementary', { name: 'Dicionário de dados' })
    expect(painel).toHaveTextContent('PENALIDADE_COBERTURA')
    expect(painel).toHaveTextContent('você escolhe')
    expect(painel).toHaveTextContent('O que é')
    expect(painel).toHaveTextContent('Por que o modelo usa')
    expect(painel).toHaveTextContent('meta + cobertura')
  })

  it('o "?" alterna: o segundo clique no mesmo parâmetro fecha', async () => {
    renderizar(<Simular />)
    conferirParametrosDoMotorAbertos()

    const botao = screen.getByRole('button', { name: 'O que é "Base de receita"?' })
    await userEvent.click(botao)
    expect(await screen.findByRole('complementary', { name: 'Dicionário de dados' })).toBeInTheDocument()

    await userEvent.click(botao)
    await waitFor(() =>
      expect(
        screen.queryByRole('complementary', { name: 'Dicionário de dados' }),
      ).not.toBeInTheDocument(),
    )
  })

  it('trocar de parâmetro TROCA o verbete, sem fechar o painel', async () => {
    renderizar(<Simular />)
    conferirParametrosDoMotorAbertos()

    await userEvent.click(screen.getByRole('button', { name: 'O que é "Base de receita"?' }))
    const painel = await screen.findByRole('complementary', { name: 'Dicionário de dados' })
    expect(painel).toHaveTextContent('BASE_RECEITA')

    await userEvent.click(screen.getByRole('button', { name: 'O que é "Curva de adesão"?' }))
    await waitFor(() => expect(painel).toHaveTextContent('CURVA_ADOCAO'))
    expect(painel).not.toHaveTextContent('BASE_RECEITA')
  })

  it('Esc fecha — o painel não rouba o foco, então precisa da saída pelo teclado', async () => {
    renderizar(<Simular />)
    conferirParametrosDoMotorAbertos()

    await userEvent.click(screen.getByRole('button', { name: 'O que é "Usar CTS"?' }))
    expect(await screen.findByRole('complementary', { name: 'Dicionário de dados' })).toBeInTheDocument()

    await userEvent.keyboard('{Escape}')
    await waitFor(() =>
      expect(
        screen.queryByRole('complementary', { name: 'Dicionário de dados' }),
      ).not.toBeInTheDocument(),
    )
  })
})
