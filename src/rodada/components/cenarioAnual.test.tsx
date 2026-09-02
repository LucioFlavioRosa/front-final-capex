/**
 * "SE QUISÉSSEMOS FAZER TUDO NESTA JANELA, o orçamento anual seria este."
 *
 * Este quadro é a terceira tentativa de responder "o que ficou fora", e as duas
 * anteriores morreram por medição, não por gosto:
 *
 *   "sem limite de CAPEX, o que entra em cada ano?"  →  6.085 das 6.765 obras
 *   podem começar no primeiro ano. Uma torre e três anos vazios.
 *
 *   "quantos anos ao ritmo de hoje?"  →  64. Setenta barras não são gráfico.
 *
 * O que estes testes protegem é o que sobrou dessas mortes: a janela FIXA (seis
 * barras), o mesmo número dito em DUAS réguas (fator e anos), e a frase que
 * herda o achado da primeira tentativa.
 */
import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderizar } from '@/testes/render'
import { CENARIO_ANUAL } from '@/testes/servidor'
import { CenarioAnualDeCapex } from './CenarioAnualDeCapex'
import type { CenarioAnual } from '@/rodada/domain/resultado'

const abrir = () => renderizar(<CenarioAnualDeCapex dados={CENARIO_ANUAL as CenarioAnual} />)

describe('o cenário anual de CAPEX', () => {
  it('diz o mesmo número em duas réguas: o fator e os anos', async () => {
    // Um fator de 11,7x é abstrato para quem não lida com orçamento todo dia;
    // "mais 64 anos" não é. Ter só um dos dois perde metade das pessoas.
    abrir()
    expect(await screen.findByText(/11,7× maior/)).toBeInTheDocument()
    expect(screen.getByText(/64 anos/)).toBeInTheDocument()
  })

  it('carrega a frase que a primeira tentativa deixou', async () => {
    abrir()
    expect(
      await screen.findByText(/6\.085 destas 6\.765 obras poderiam começar já no primeiro ano/),
    ).toBeInTheDocument()
  })

  it('trocar o escopo troca os dois números, e não só um', async () => {
    // "Todas as obras" inclui VPL negativo. Se o fator mudasse e os anos não
    // (ou o contrário), a tela estaria misturando dois cenários numa frase.
    abrir()
    await userEvent.click(screen.getByRole('radio', { name: 'Todas as obras' }))

    expect(await screen.findByText(/18,4× maior/)).toBeInTheDocument()
    expect(screen.getByText(/104 anos/)).toBeInTheDocument()
    expect(screen.queryByText(/11,7× maior/)).not.toBeInTheDocument()
  })

  it('a janela tem os anos do plano, e não mais que isso', async () => {
    // A troca de pergunta existiu para caber em seis barras. Se a tabela do
    // quadro voltar a crescer, é porque alguém reintroduziu o prolongamento.
    abrir()
    await userEvent.click(screen.getByRole('tab', { name: 'Tabela' }))
    expect(await screen.findByText('2027')).toBeInTheDocument()
    expect(screen.getByText('2032')).toBeInTheDocument()
    expect(screen.queryByText('2033')).not.toBeInTheDocument()
  })
})
