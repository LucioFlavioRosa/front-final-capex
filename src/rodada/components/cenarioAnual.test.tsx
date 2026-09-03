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
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderizar } from '@/testes/render'
import { CENARIO_ANUAL, servidor } from '@/testes/servidor'
import { CenarioAnualDeCapex } from './CenarioAnualDeCapex'
import type { CenarioAnual } from '@/rodada/domain/resultado'

// O SERVIDOR PRECISA ESTAR DE PE: a lista de obras de uma fatia vem de uma
// chamada, e sem ela o modal abre com o cabecalho certo e ZERO obras — que era
// como estes testes passavam sem afirmar nada sobre o recorte pedido.
beforeAll(() => servidor.listen({ onUnhandledRequest: 'error' }))
afterEach(() => servidor.resetHandlers())
afterAll(() => servidor.close())

const abrir = () => renderizar(<CenarioAnualDeCapex dados={CENARIO_ANUAL as CenarioAnual} runId="r1" />)

describe('o cenário anual de CAPEX', () => {
  it('diz o mesmo número em duas réguas: o fator e os anos', async () => {
    // Um fator de 11,7x é abstrato para quem não lida com orçamento todo dia;
    // "mais 64 anos" não é. Ter só um dos dois perde metade das pessoas.
    //
    // "× O DE HOJE", e não "× maior": "N vezes maior" tem duas leituras que
    // divergem justamente quando o fator é pequeno — com 1,1, uma diz +10% e a
    // outra diz +110%.
    abrir()
    expect(await screen.findByText(/11,7× o de hoje/)).toBeInTheDocument()
    expect(screen.getByText(/64 anos/)).toBeInTheDocument()
  })

  it('a legenda fica FORA do bloco aria-hidden do desenho', async () => {
    // O desenho é `aria-hidden` de propósito — o equivalente textual é a aba
    // Tabela. Os chips não podem ficar lá dentro: cada um abre a lista de obras
    // do seu tipo, e botão focável dentro de `aria-hidden` é o pior dos dois
    // mundos — alcançável pelo Tab e mudo no leitor de tela.
    const { container } = abrir()
    const chip = [...container.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Tronco'),
    )!
    expect(chip).toBeDefined()
    expect(chip.closest('[aria-hidden="true"]')).toBeNull()
  })

  it('diz "1 ano" no singular, e nunca "0 anos"', async () => {
    // `Math.round` cai em 1 com frequência nas rodadas pequenas, e a frase saía
    // "seriam mais 1 anos". Arredondar para zero seria pior que feio: "mais 0
    // anos" nega a própria frase.
    const quase = {
      ...CENARIO_ANUAL,
      queSePaga: { ...CENARIO_ANUAL.queSePaga, anosAoRitmoDeHoje: 1.2 },
    } as CenarioAnual
    const { unmount } = renderizar(<CenarioAnualDeCapex dados={quase} runId="r1" />)
    // O texto é buscado no `<strong>` — a frase inteira atravessa elementos.
    expect(await screen.findByText('1 ano')).toBeInTheDocument()
    unmount()

    const nenhum = {
      ...CENARIO_ANUAL,
      queSePaga: { ...CENARIO_ANUAL.queSePaga, anosAoRitmoDeHoje: 0.3 },
    } as CenarioAnual
    renderizar(<CenarioAnualDeCapex dados={nenhum} runId="r1" />)
    expect(await screen.findByText(/menos de 1 ano/)).toBeInTheDocument()
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

    expect(await screen.findByText(/18,4× o de hoje/)).toBeInTheDocument()
    expect(screen.getByText(/104 anos/)).toBeInTheDocument()
    expect(screen.queryByText(/11,7× o de hoje/)).not.toBeInTheDocument()
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

  it('a barra mostra SÓ o que ficou fora — o plano é referência, não fatia', async () => {
    // A barra dividida obrigava a subtrair de olho para achar o número que a
    // pergunta pede. O plano não sumiu: virou a linha tracejada.
    abrir()
    await userEvent.click(screen.getByRole('tab', { name: 'Tabela' }))

    expect(await screen.findByText('Faltaria investir')).toBeInTheDocument()
    expect(screen.queryByText('Total do ano')).not.toBeInTheDocument()
  })

  it('a barra é dividida por tipo de elemento, e as fatias somam o total', async () => {
    // Dois anos que precisam do mesmo dinheiro podem ser planos completamente
    // diferentes: um ano de tronco e ETE não é um ano de ligação. A altura
    // sozinha não distingue os dois.
    //
    // A SOMA É O QUE ESTE TESTE GUARDA. O rateio por ano é aplicado a cada
    // componente separadamente; se um deles escapar da conta, a pilha fica mais
    // baixa que o número que o próprio quadro anuncia — e ninguém percebe,
    // porque nada quebra.
    abrir()
    await userEvent.click(screen.getByRole('tab', { name: 'Tabela' }))

    expect(await screen.findByText('Tronco')).toBeInTheDocument()
    expect(screen.getByText('Rede coletora')).toBeInTheDocument()
    expect(screen.getByText('ETE (módulo)')).toBeInTheDocument()

    const ano = CENARIO_ANUAL.anos[0]
    const soma = ano.porComponente.reduce((t, c) => t + c.todas, 0)
    expect(Math.abs(soma - ano.faltaTodas) / ano.faltaTodas).toBeLessThan(0.01)
  })

  it('a referência é o TETO de cada ano, e não a média nem o gasto', async () => {
    // A média (R$ 50 Mi) achatava o que varia. E o GASTO não serve de régua: é
    // atribuído ao ano em que a obra COMEÇA, e a obra consome orçamento ao longo
    // da execução — por isso 2027 aparece com R$ 72,7 Mi gastos contra um teto
    // de R$ 60,0 Mi. O teto é o que barrou as obras da barra.
    abrir()
    await userEvent.click(screen.getByRole('tab', { name: 'Tabela' }))

    expect(await screen.findByText('Teto do ano')).toBeInTheDocument()
    expect(screen.getByText('R$ 60,0 Mi')).toBeInTheDocument()
    expect(screen.getByText('R$ 40,0 Mi')).toBeInTheDocument()
  })
})

/**
 * CLICAR NUMA FATIA ABRE AS OBRAS DELA — e "dela" tem três partes.
 *
 * O escopo do controle no topo, o ano da barra e o tipo da fatia. Foi um
 * defeito real enquanto não era assim: o chip dizia R$ 514,5 Mi ("só o que se
 * paga") e a planilha vinha com as 876 obras e R$ 1.210,8 Mi de "todas".
 *
 * O ano existe porque cada obra fora do plano é ATRIBUÍDA a um ano — antes era
 * rateio, e um rateio não seleciona obra nenhuma para baixar.
 */
describe('as obras de uma fatia', () => {
  // A BUSCA É PELO CONTAINER DO RENDER, e não por `screen`: neste ambiente as
  // consultas por `role` sobre o `document.body` não enxergam estes botões,
  // embora eles estejam lá (`container.querySelectorAll('button')` acha os
  // seis). O que o teste afirma é o comportamento, não o mecanismo da busca.
  const chipDe = (container: HTMLElement, nome: string) =>
    [...container.querySelectorAll('button')].find((b) => b.textContent?.includes(nome))!

  it('o chip abre a janela inteira do tipo, no escopo escolhido', async () => {
    const { container } = abrir()
    await userEvent.click(chipDe(container, 'Tronco'))

    expect(await screen.findByText('Tronco fora do plano')).toBeInTheDocument()
    // O `obraId` do servidor de teste ecoa o que a chamada pediu — e esperar
    // por ELE, e não pelo subtítulo, é de propósito: o subtítulo já aparece com
    // "0 obras" enquanto a lista está em voo, e passaria sem a resposta chegar.
    expect(await screen.findByText(/tro\/paga\/janela/)).toBeInTheDocument()
    expect(screen.getByText(/com VPL positivo, na janela inteira/)).toBeInTheDocument()
  })

  it('trocar o escopo troca a lista, e não só os números do quadro', async () => {
    // O CHIP MOSTRA UM NÚMERO E A PLANILHA LEVAVA OUTRO. Este é o teste do
    // defeito: se o escopo parar de chegar na chamada, a lista volta a ser a de
    // "todas" embaixo de um chip que diz "obras com VPL positivo".
    const { container } = abrir()
    await userEvent.click(screen.getByRole('radio', { name: 'Todas as obras' }))
    await userEvent.click(chipDe(container, 'Tronco'))

    expect(await screen.findByText(/tro\/todas\/janela/)).toBeInTheDocument()
    expect(screen.getByText(/todas as obras, na janela inteira/)).toBeInTheDocument()
  })

  it('a planilha existe, e o nome do arquivo carrega o recorte', async () => {
    const { container } = abrir()
    await userEvent.click(chipDe(container, 'Tronco'))

    expect(await screen.findByText('Tronco fora do plano')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Baixar planilha' })).toBeInTheDocument()
  })

  it('os tipos são alcançáveis por teclado — a fatia da barra não é', async () => {
    // A fatia empilhada funciona no mouse e mede 29 px; a lista de obras não
    // pode depender disso. O chip é o mesmo gesto com foco visível.
    const { container } = abrir()
    const chip = chipDe(container, 'Rede coletora') as HTMLButtonElement
    chip.focus()
    expect(chip).toHaveFocus()
  })
})
