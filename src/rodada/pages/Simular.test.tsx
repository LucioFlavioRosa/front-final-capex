import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderizar } from '@/testes/render'
import { servidor } from '@/testes/servidor'
import { Simular } from '@/rodada/pages/Simular'

beforeAll(() => servidor.listen({ onUnhandledRequest: 'error' }))
afterEach(() => servidor.resetHandlers())
afterAll(() => servidor.close())

/**
 * Escolhe regional e unidade — o pré-requisito de quase todo teste daqui.
 *
 * As duas listas vêm de rede agora (`/api/regionais`,
 * `/api/regionais/{id}/unidades`), então cada passo espera a opção aparecer
 * antes de selecionar — sem isso o `selectOptions` agiria sobre o placeholder
 * "Carregando…", que não tem valor.
 */
async function escolherUnidade(id = '56') {
  const regional = screen.getByLabelText('Regional')
  await waitFor(() => {
    expect(within(regional).getAllByRole('option').some((o) => (o as HTMLOptionElement).value)).toBe(true)
  })
  // A unidade 56 é da R4 nos dados reais; o teste descobre a regional pela
  // própria lista em vez de cravá-la, para não quebrar se a base mudar.
  const regionaisComValor = within(regional)
    .getAllByRole('option')
    .filter((o) => (o as HTMLOptionElement).value)

  for (const opcao of regionaisComValor) {
    const valor = (opcao as HTMLOptionElement).value
    await userEvent.selectOptions(regional, valor)
    const unidade = screen.getByLabelText('Unidade')
    // Espera a lista de unidades desta regional carregar — a opção com valor
    // só existe depois que `/api/regionais/{id}/unidades` responde.
    await waitFor(() => {
      const opcoes = within(unidade).getAllByRole('option')
      if (!opcoes.some((o) => (o as HTMLOptionElement).value)) {
        throw new Error('unidades ainda carregando')
      }
    })
    const tem = within(unidade)
      .getAllByRole('option')
      .some((o) => (o as HTMLOptionElement).value === id)
    if (tem) {
      await userEvent.selectOptions(unidade, id)
      return
    }
  }
  throw new Error(`unidade ${id} não encontrada em nenhuma regional`)
}

describe('Simular — a janela de CAPEX é derivada', () => {
  it('NÃO existe campo de janela: ela é leitura, não entrada', () => {
    renderizar(<Simular />)

    const janela = screen.getByText('Janela de CAPEX ƒ')
    expect(janela).toBeInTheDocument()
    // A prova: não há input nem select associado ao rótulo.
    expect(screen.queryByLabelText(/janela de capex/i)).not.toBeInTheDocument()
    expect(screen.getByText('Derivada dos anos com verba. Não se digita.')).toBeInTheDocument()
  })

  it('a janela ACOMPANHA o cronograma — é a mesma verdade, não duas', async () => {
    renderizar(<Simular />)

    // A janela aparece em DOIS lugares — o campo derivado do bloco de
    // orçamento e a linha do resumo lateral — e `getAllBy` é o próprio ponto
    // do teste: sendo a mesma derivação, as duas exibições nunca divergem.
    // Uma delas mostrando um intervalo diferente da outra seria exatamente a
    // segunda verdade que a ausência do campo veio evitar.
    const janelas = () => screen.getAllByText(/^\d{4}–\d{4} \(\d+ anos\)$/)

    // O cronograma padrão vai de 2026 a 2040.
    expect(janelas()).toHaveLength(2)
    for (const j of janelas()) expect(j).toHaveTextContent('2026–2040 (15 anos)')

    // Zerar o primeiro ano tira ele da janela, sem ninguém digitar a janela.
    const verba2026 = screen.getByLabelText('Verba do ano 2026')
    await userEvent.clear(verba2026)
    await userEvent.type(verba2026, '0')

    await waitFor(() => {
      expect(janelas()).toHaveLength(2)
      for (const j of janelas()) expect(j).toHaveTextContent('2027–2040 (14 anos)')
    })
  })
})

describe('Simular — o checklist barra, e diz o que fazer', () => {
  it('sem unidade, bloqueia e o botão fica desabilitado COM motivo', () => {
    renderizar(<Simular />)

    expect(screen.getByText('Selecione a regional e a unidade.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /iniciar simulação/i })).toBeDisabled()
    // Botão cinza sem motivo faz procurar o problema na tela inteira.
    expect(screen.getByText(/Resolva o que está marcado acima/i)).toBeInTheDocument()
  })

  it('cadastro com pendência bloqueia, e nomeia o que falta', async () => {
    renderizar(<Simular />)
    await escolherUnidade('56')

    expect(
      await screen.findByText(/38 campos pendentes no cadastro/i),
    ).toBeInTheDocument()
    // A linha por componente: é a pendência que a pessoa NÃO acha sozinha,
    // porque a linha nem aparece na ficha.
    expect(
      screen.getByText(/falta o componente Ligação de esgoto no cadastro/i),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /iniciar simulação/i })).toBeDisabled()
  })

  it('com o cadastro limpo, libera o disparo', async () => {
    renderizar(<Simular />)
    await escolherUnidade('57')

    expect(await screen.findByText(/completo, sem pendências/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /iniciar simulação/i })).toBeEnabled()
  })

  it('ano repetido bloqueia — só o último iria no payload', async () => {
    renderizar(<Simular />)
    await escolherUnidade('57')
    await screen.findByText(/completo, sem pendências/i)

    const ano2027 = screen.getByLabelText('Ano da linha 2')
    await userEvent.clear(ano2027)
    await userEvent.type(ano2027, '2026')

    expect(await screen.findByText(/Ano repetido no cronograma/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /iniciar simulação/i })).toBeDisabled()
  })
})

describe('Simular — o parser é estrito', () => {
  it('texto inválido não vira número em silêncio: o campo fica vermelho e bloqueia', async () => {
    renderizar(<Simular />)
    await escolherUnidade('57')
    await screen.findByText(/completo, sem pendências/i)

    const verba = screen.getByLabelText('Verba do ano 2026')
    await userEvent.clear(verba)
    await userEvent.type(verba, '12abc')

    // O cadastro já pagou por um parser tolerante: `parseFloat('123abc')`
    // devolvia 123 e contaminava CAPEX em silêncio.
    expect(verba.className).toContain('border-danger/60')
    expect(await screen.findByText(/ano ou valor inválido/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /iniciar simulação/i })).toBeDisabled()
  })

  it('campo vazio é TRACEJADO — a gramática de estado da fase 8', async () => {
    renderizar(<Simular />)

    const verba = screen.getByLabelText('Verba do ano 2026')
    expect(verba.className).not.toContain('border-dashed')

    await userEvent.clear(verba)

    // Vazio → tracejado. É a metade da informação que sobrevive a daltonismo e
    // a impressão em preto e branco.
    expect(verba.className).toContain('border-dashed')
  })
})

describe('Simular — o estado avisa é inalcançável e não foi desenhado', () => {
  it('nenhum item do checklist usa a moldura âmbar de aviso', async () => {
    renderizar(<Simular />)
    await escolherUnidade('57')
    await screen.findByText(/completo, sem pendências/i)

    // O tipo declara três severidades; `validar()` emite duas. Reproduzir a
    // terceira significaria estilizar um estado que ninguém vê.
    const painel = screen.getByText('Antes de disparar').closest('div')!
    expect(painel.className).not.toContain('border-warning')
    expect(screen.queryByText(/as metas serão ignoradas/i)).not.toBeInTheDocument()
  })
})
