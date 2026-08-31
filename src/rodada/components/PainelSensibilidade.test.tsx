/**
 * O PAINEL DE SENSIBILIDADE — o que a tela promete e o que ela manda.
 *
 * Os testes de domínio já prendem a matemática. O que só se vê montando o
 * componente é o contrato com quem olha e com quem serve:
 *
 * - o degrau aparece EM DINHEIRO, e não só em porcentagem;
 * - o teto aparece ANTES de existir qualquer variação — é a resposta que não
 *   custa execução, e escondê-la atrás de "rode primeiro" desfaz o propósito;
 * - o botão manda `modo` de verdade, e o padrão é `rapido`;
 * - a aba de obras só abre quando há o que comparar.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { renderizar } from '@/testes/render'
import { servidor } from '@/testes/servidor'
import { PainelSensibilidade } from '@/rodada/components/PainelSensibilidade'
import type { RunMeta } from '@/rodada/domain/resultado'
import { pontosDaFaixa } from '@/rodada/domain/sensibilidade'

beforeAll(() => servidor.listen({ onUnhandledRequest: 'error' }))
afterEach(() => servidor.resetHandlers())
afterAll(() => servidor.close())

const META = {
  runId: 'run_base',
  nome: 'Orçamento base',
  unidadeId: '56',
  status: 'OPTIMAL',
  kpis: {
    vpl: 156_900_000,
    coberturaFimPct: 43.8,
    metasAtingidas: 0,
    metasTotal: 2,
  },
} as unknown as RunMeta

const obras = (m: Record<string, number>) =>
  Object.entries(m).map(([nome, construidas]) => ({ componente: nome, nome, construidas }))

const TETO = {
  orcamentoTotal: 110_000_000,
  anosDoPlano: 2,
  subbaciasFora: 1099,
  subbaciasSemCapexProprio: 1,
  capexParaTodas: 1_956_000_000,
  vazaoTotalPresa: 29_533,
  degraus: [10, 20, 30, 40, 50].map((degrau) => ({
    degrau,
    folga: (110_000_000 * degrau) / 100,
    subbaciasNoMaximo: degrau * 2,
    vazaoNoMaximo: degrau * 100,
  })),
}

const BASE_PONTO = {
  degrau: 0,
  runId: 'run_base',
  status: 'SUCESSO',
  estimativa: false,
  vpl: 156_900_000,
  coberturaFimPct: 43.8,
  metasAtingidas: 0,
  metasTotal: 2,
  capexTotal: 92_800_000,
  tempoS: null,
  obras: obras({ 'Rede coletora': 13, Tronco: 10, 'ETE (módulo)': 23 }),
}

/**
 * O servidor falso RESPEITA A FAIXA da querystring, como o de verdade: o teto é
 * calculado para os degraus pedidos. Um duplo fixo esconderia justamente o que
 * a faixa configurável tem de novo — se a chave da consulta não incluísse a
 * faixa, o teste passaria com a tela mostrando o intervalo anterior.
 */
function servirSensibilidade(corpo: Record<string, unknown>) {
  servidor.use(
    http.get('/api/runs/:runId/sensibilidade', ({ request }) => {
      const q = new URL(request.url).searchParams
      const faixa = {
        de: Number(q.get('de') ?? 10),
        ate: Number(q.get('ate') ?? 50),
        pontos: Number(q.get('pontos') ?? 5),
      }
      const teto = corpo.teto as { degraus: { degrau: number }[] } | null
      if (!teto) return HttpResponse.json(corpo)
      const degraus = pontosDaFaixa(faixa).map((degrau) => ({
        degrau,
        folga: (110_000_000 * degrau) / 100,
        subbaciasNoMaximo: degrau * 2,
        vazaoNoMaximo: degrau * 100,
      }))
      return HttpResponse.json({ ...corpo, teto: { ...teto, degraus } })
    }),
  )
}

function abrir() {
  return renderizar(<PainelSensibilidade meta={META} />)
}

describe('o teto vem antes de qualquer execução', () => {
  it('mostra a escala do problema sem nenhuma variação rodada', async () => {
    servirSensibilidade({ teto: TETO, pontos: [BASE_PONTO] })
    abrir()

    expect(await screen.findByText('Antes de simular: o teto')).toBeInTheDocument()
    // A frase que decide se vale a pena continuar.
    expect(screen.getByText(/17,8×/)).toBeInTheDocument()
    // E a curva NÃO aparece: um ponto só não tem inclinação.
    expect(screen.queryByText('Cobertura ao fim')).not.toBeInTheDocument()
  })

  it('o degrau aparece em dinheiro, e não só em porcentagem', async () => {
    servirSensibilidade({ teto: TETO, pontos: [BASE_PONTO] })
    abrir()

    // No chip do degrau — que é onde a lista de degraus vira uma lista de
    // valores, em vez de cinco porcentagens sem escala.
    const dinheiro = await screen.findByText('+R$ 11,0 Mi')
    expect(dinheiro.closest('li')).toHaveTextContent('+10%')
    // …e no botão, que é onde a pessoa se compromete com o gasto — com o
    // qualificador "no plano", porque o valor é a soma dos anos e não a verba
    // anual.
    expect(
      screen.getByRole('button', { name: /Só \+10% · \+R\$ 11,0 Mi no plano/ }),
    ).toBeInTheDocument()
  })

  it('sem orçamento publicado não há teto, e nenhum valor é inventado', async () => {
    servirSensibilidade({ teto: null, pontos: [BASE_PONTO] })
    abrir()

    expect(await screen.findByRole('button', { name: /Só \+10%/ })).toBeInTheDocument()
    expect(screen.queryByText('Antes de simular: o teto')).not.toBeInTheDocument()
    // O botão fica sem a parte do dinheiro, em vez de mostrar "R$ 0,0 Mi".
    expect(screen.queryByText(/R\$ 0,0 Mi/)).not.toBeInTheDocument()
  })
})

describe('o disparo manda o modo', () => {
  it('o padrão é a estimativa rápida', async () => {
    servirSensibilidade({ teto: TETO, pontos: [BASE_PONTO] })
    let corpo: Record<string, unknown> | null = null
    servidor.use(
      http.post('/api/runs/:runId/variacao', async ({ request }) => {
        corpo = (await request.json()) as Record<string, unknown>
        return HttpResponse.json({ runId: 'novo', status: 'PENDENTE', jaExistia: false })
      }),
    )

    abrir()
    await userEvent.click(await screen.findByRole('button', { name: /Só \+10%/ }))

    expect(corpo).toMatchObject({ modo: 'rapido', fator: 1.1 })
  })

  it('trocar para simulação muda o que é enviado', async () => {
    servirSensibilidade({ teto: TETO, pontos: [BASE_PONTO] })
    let corpo: Record<string, unknown> | null = null
    servidor.use(
      http.post('/api/runs/:runId/variacao', async ({ request }) => {
        corpo = (await request.json()) as Record<string, unknown>
        return HttpResponse.json({ runId: 'novo', status: 'PENDENTE', jaExistia: false })
      }),
    )

    abrir()
    await userEvent.click(await screen.findByRole('radio', { name: 'Simulação' }))
    await userEvent.click(screen.getByRole('button', { name: /Só \+10%/ }))

    expect(corpo).toMatchObject({ modo: 'completo' })
  })
})

describe('o teto vive só enquanto a pergunta dele está aberta', () => {
  it('sem curva, o teto vem ANTES: ele é a resposta', async () => {
    servirSensibilidade({ teto: TETO, pontos: [BASE_PONTO] })
    abrir()
    expect(await screen.findByText('Antes de simular: o teto')).toBeInTheDocument()
    expect(screen.queryByText('O teto, para conferência')).not.toBeInTheDocument()
  })

  it('com a curva pronta, o teto SAI da tela', async () => {
    // A pergunta dele — "vale a pena gastar execução com isto?" — se fecha no
    // instante em que o primeiro degrau publica. Mantê-lo ali seria uma tabela
    // de estimativas competindo com medições, e meia página entre o cabeçalho e
    // o primeiro gráfico.
    servirSensibilidade({
      teto: TETO,
      pontos: [
        BASE_PONTO,
        { ...BASE_PONTO, degrau: 10, runId: 'run_10', vpl: 161_500_000, coberturaFimPct: 44 },
      ],
    })
    abrir()
    // A curva chegou…
    expect(await screen.findByText('Cobertura ao fim')).toBeInTheDocument()
    // …e o teto não está mais na tela, em nenhuma das duas formas.
    expect(screen.queryByText('Antes de simular: o teto')).not.toBeInTheDocument()
    expect(screen.queryByText('O teto, para conferência')).not.toBeInTheDocument()
  })
})

describe('o quadro de obras', () => {
  const COM_DEGRAU = {
    teto: TETO,
    pontos: [
      BASE_PONTO,
      {
        ...BASE_PONTO,
        degrau: 10,
        runId: 'run_10',
        vpl: 161_500_000,
        coberturaFimPct: 44.0,
        obras: obras({ 'Rede coletora': 12, Tronco: 11, 'ETE (módulo)': 24, EEE: 2 }),
      },
    ],
  }

  it('só existe quando há o que comparar', async () => {
    // Com a rodada de hoje e mais nada, não há "a mais": o quadro sairia com
    // uma coluna só, que não é comparação nenhuma.
    servirSensibilidade({ teto: TETO, pontos: [BASE_PONTO] })
    abrir()
    await screen.findByText('Antes de simular: o teto')
    expect(screen.queryByText('Obras construídas por tipo')).not.toBeInTheDocument()
  })

  it('os quatro quadros ficam na MESMA página, sem clique intermediário', async () => {
    // Eram três numa aba e o de obras noutra. A metade escondida era justamente
    // a que responde "o que foi construído a mais" — a pergunta que a operação
    // faz depois de ver a curva.
    servirSensibilidade(COM_DEGRAU)
    abrir()
    expect(await screen.findByText('Cobertura ao fim')).toBeInTheDocument()
    expect(screen.getByText('Metas cumpridas')).toBeInTheDocument()
    expect(screen.getByText('VPL do plano')).toBeInTheDocument()
    expect(screen.getByText('Obras construídas por tipo')).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Obras a mais' })).not.toBeInTheDocument()
  })

  it('mostra a contagem por tipo e a variação, inclusive a NEGATIVA', async () => {
    servirSensibilidade(COM_DEGRAU)
    abrir()

    expect(await screen.findByText('Obras construídas por tipo')).toBeInTheDocument()
    // 46 hoje (13+10+23) → 49 com +10% (12+11+24+2)
    expect(screen.getByText(/46 hoje → 49 com \+10%/)).toBeInTheDocument()

    // A legenda carrega a variação de cada tipo. Rede coletora CAIU de 13 para
    // 12 — é o rearranjo que explica a curva, e escondê-lo seria mentir.
    const rede = screen.getByText('Rede coletora').closest('li')!
    expect(within(rede).getByText('−1')).toBeInTheDocument()
    const tronco = screen.getByText('Tronco').closest('li')!
    expect(within(tronco).getByText('+1')).toBeInTheDocument()
  })

  it('a tabela do quadro traz contagem e variação juntas', async () => {
    servirSensibilidade(COM_DEGRAU)
    abrir()

    // O alternador Gráfico/Tabela é de CADA quadro: sem recortar pelo quadro
    // certo, os quatro respondem ao mesmo nome.
    const quadro = await screen.findByRole('figure', { name: 'Obras construídas por tipo' })
    await userEvent.click(within(quadro).getByRole('tab', { name: 'Tabela' }))

    // Componente que não existia no plano de hoje entra com zero, e não some.
    const linhaEee = within(quadro).getByRole('cell', { name: 'EEE' }).closest('tr')!
    expect(within(linhaEee).getByText('0')).toBeInTheDocument()
    expect(within(linhaEee).getByText('2 (+2)')).toBeInTheDocument()
    // E o total fecha com a soma da coluna.
    const total = within(quadro).getByRole('cell', { name: 'Total' }).closest('tr')!
    expect(within(total).getByText('46')).toBeInTheDocument()
    expect(within(total).getByText('49 (+3)')).toBeInTheDocument()
  })
})

describe('quando um degrau falha, a tela diz por quê', () => {
  const COM_FALHA = (erro: string) => ({
    teto: TETO,
    pontos: [
      BASE_PONTO,
      {
        ...BASE_PONTO,
        degrau: 10,
        runId: 'run_10',
        status: 'ERRO',
        estimativa: true,
        vpl: null,
        coberturaFimPct: null,
        erro,
        obras: [],
      },
    ],
  })

  const POR_TEMPO =
    "O solver falhou ao reparar o teto anual: a cidade 'Araruama Leste1' ficou sem " +
    'coluna selecionada. Tente de novo com MAX_TIME_S maior ou janela de CAPEX menor.'

  it('mostra a frase que o motor escreveu, e não só "erro"', async () => {
    // Ela aparecia como "erro" e mais nada. A resposta estava gravada no banco e
    // a tela não a pedia — o que transforma uma explicação em pergunta para
    // outra pessoa.
    servirSensibilidade(COM_FALHA(POR_TEMPO))
    abrir()
    expect(await screen.findByText(/\+10% não completou/)).toBeInTheDocument()
    expect(screen.getByText(/MAX_TIME_S maior/)).toBeInTheDocument()
  })

  it('falha por falta de tempo ESCALA para o modo completo', async () => {
    // Repetir em 60s reproduziria a mesma falha: o defeito do motor aparece
    // quando o solver não tem tempo para a janela.
    let corpo: Record<string, unknown> | null = null
    servidor.use(
      http.post('/api/runs/:runId/variacao', async ({ request }) => {
        corpo = (await request.json()) as Record<string, unknown>
        return HttpResponse.json({
          runId: 'novo',
          status: 'PENDENTE',
          jaExistia: false,
          naCurva: true,
        })
      }),
    )
    servirSensibilidade(COM_FALHA(POR_TEMPO))
    abrir()

    await userEvent.click(await screen.findByRole('button', { name: /Rodar \+10% completo/ }))
    expect(corpo).toMatchObject({ modo: 'completo', fator: 1.1 })
  })

  it('falha de OUTRA natureza não vira sugestão de trocar de modo', async () => {
    // Só o defeito conhecido do motor tem essa saída. Sugerir "rode completo"
    // para um banco fora do ar mandaria alguém gastar mil segundos de cluster
    // para reencontrar o mesmo problema.
    servirSensibilidade(COM_FALHA('ConnectionError: o banco recusou a conexão.'))
    abrir()

    expect(await screen.findByText(/o banco recusou a conexão/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /completo/ })).not.toBeInTheDocument()
    expect(await screen.findByRole('button', { name: /Tentar de novo \+10%/ })).toBeInTheDocument()
  })
})

describe('a faixa é escolhida na tela', () => {
  it('o padrão é de 10% a 50% em cinco pontos', async () => {
    servirSensibilidade({ teto: TETO, pontos: [BASE_PONTO] })
    abrir()
    await screen.findByText('Antes de simular: o teto')
    expect(screen.getByLabelText('Menor acréscimo de CAPEX, em %')).toHaveValue(10)
    expect(screen.getByLabelText('Maior acréscimo de CAPEX, em %')).toHaveValue(50)
    expect(screen.getByLabelText('Quantos pontos a análise tem')).toHaveValue('5')
  })

  it('estreitar a faixa muda os degraus oferecidos', async () => {
    servirSensibilidade({ teto: TETO, pontos: [BASE_PONTO] })
    abrir()
    await screen.findByText('Antes de simular: o teto')

    const ate = screen.getByLabelText('Maior acréscimo de CAPEX, em %')
    await userEvent.clear(ate)
    await userEvent.type(ate, '20')
    await userEvent.selectOptions(screen.getByLabelText('Quantos pontos a análise tem'), '3')

    // 10 a 20 em três pontos: 10, 15, 20.
    expect(
      await screen.findByRole('button', { name: /Rodar a análise · 3 estimativas/ }),
    ).toBeInTheDocument()
    // A lista de degraus é a régua: o +15% entra e o +30% sai. (`+15%` também
    // aparece na tabela do teto, por isso o recorte pela lista.)
    const chips = screen.getByRole('list')
    expect(within(chips).getByText('+15%')).toBeInTheDocument()
    expect(within(chips).queryByText('+30%')).not.toBeInTheDocument()
    expect(within(chips).getAllByText(/^\+\d+%$/).map((e) => e.textContent)).toEqual([
      '+10%',
      '+15%',
      '+20%',
    ])
  })

  it('faixa estreita avisa quantos pontos distintos vão rodar', async () => {
    // Os degraus são inteiros — a identidade do ponto na curva depende disso —,
    // então de 10 a 12 em cinco sobram três. Mostrar "5" prometeria duas
    // execuções que não vão acontecer.
    servirSensibilidade({ teto: TETO, pontos: [BASE_PONTO] })
    abrir()
    await screen.findByText('Antes de simular: o teto')

    const ate = screen.getByLabelText('Maior acréscimo de CAPEX, em %')
    await userEvent.clear(ate)
    await userEvent.type(ate, '12')

    expect(await screen.findByText(/faixa estreita: 3 pontos distintos/)).toBeInTheDocument()
  })

  it('faixa que não sobe é recusada ANTES de virar requisição', async () => {
    servirSensibilidade({ teto: TETO, pontos: [BASE_PONTO] })
    abrir()
    await screen.findByText('Antes de simular: o teto')

    const ate = screen.getByLabelText('Maior acréscimo de CAPEX, em %')
    await userEvent.clear(ate)
    await userEvent.type(ate, '5')

    expect(await screen.findByText(/o fim precisa ser maior que o início/)).toBeInTheDocument()
  })
})

describe('a estimativa é nomeada, e não só colorida', () => {
  it('o chip e a nota dizem que o ponto veio de solver curto', async () => {
    servirSensibilidade({
      teto: TETO,
      pontos: [
        BASE_PONTO,
        {
          ...BASE_PONTO,
          degrau: 10,
          runId: 'run_10',
          estimativa: true,
          vpl: 161_500_000,
          coberturaFimPct: 44.0,
        },
      ],
    })
    abrir()

    expect(await screen.findByText('· estimativa')).toBeInTheDocument()
    expect(screen.getByText(/estimativas rápidas/)).toBeInTheDocument()
  })
})

describe('a varredura completa — pedir a análise inteira', () => {
  /** Um servidor que muda de resposta a cada busca, como o de verdade. */
  function servirEmEtapas(etapas: Record<string, unknown>[]) {
    let i = 0
    servidor.use(
      http.get('/api/runs/:runId/sensibilidade', () => {
        const corpo = etapas[Math.min(i, etapas.length - 1)]
        i += 1
        return HttpResponse.json(corpo)
      }),
    )
  }

  const RODANDO_10 = {
    ...BASE_PONTO,
    degrau: 10,
    runId: 'run_10',
    status: 'RODANDO',
    estimativa: true,
    vpl: null,
    coberturaFimPct: null,
    obras: [],
  }

  it('UM PEDIDO DE CADA VEZ, e não os cinco de uma vez', async () => {
    // É o defeito que a primeira tentativa real produziu: cinco `POST` juntos
    // saturaram uma fila de capacidade 1 e um deles voltou 503. A varredura é um
    // estado que pede o próximo quando o anterior sai de voo, e não um lote.
    const pedidos: Record<string, unknown>[] = []
    servidor.use(
      http.post('/api/runs/:runId/variacao', async ({ request }) => {
        pedidos.push((await request.json()) as Record<string, unknown>)
        return HttpResponse.json({
          runId: 'run_10',
          status: 'PENDENTE',
          jaExistia: false,
          naCurva: true,
        })
      }),
    )
    // A primeira busca não tem variação; a partir da segunda, +10% está em voo.
    servirEmEtapas([
      { teto: TETO, pontos: [BASE_PONTO] },
      { teto: TETO, pontos: [BASE_PONTO, RODANDO_10] },
    ])

    abrir()
    await userEvent.click(
      await screen.findByRole('button', { name: /Rodar a análise · 5 estimativas/ }),
    )

    // Uma em voo trava o resto: o botão vira "Parar depois desta" e mais nenhum
    // pedido sai enquanto o executor não liberar.
    expect(await screen.findByRole('button', { name: 'Parar depois desta' })).toBeInTheDocument()
    await new Promise((r) => setTimeout(r, 250))
    expect(pedidos).toHaveLength(1)
    expect(pedidos[0]).toMatchObject({ fator: 1.1, modo: 'rapido' })
  })

  it('a varredura para quando o degrau que ELA pediu falha', async () => {
    // Repetir sozinho uma execução que acabou de morrer gasta cluster para
    // reproduzir o mesmo erro, e o laço não teria fim.
    const pedidos: unknown[] = []
    servidor.use(
      http.post('/api/runs/:runId/variacao', async ({ request }) => {
        pedidos.push(await request.json())
        return HttpResponse.json({
          runId: 'run_10',
          status: 'PENDENTE',
          jaExistia: false,
          naCurva: true,
        })
      }),
    )
    servirEmEtapas([
      { teto: TETO, pontos: [BASE_PONTO] },
      { teto: TETO, pontos: [BASE_PONTO, { ...RODANDO_10, status: 'ERRO' }] },
    ])

    abrir()
    await userEvent.click(
      await screen.findByRole('button', { name: /Rodar a análise · 5 estimativas/ }),
    )

    expect(await screen.findByRole('button', { name: /Tentar de novo \+10%/ })).toBeInTheDocument()
    await new Promise((r) => setTimeout(r, 250))
    expect(pedidos).toHaveLength(1)
  })

  it('a varredura PARA quando o servidor devolve uma rodada de outra curva', async () => {
    // A dedupe por parâmetros pode encontrar uma variação idêntica já ligada a
    // OUTRA base. O ponto nunca vai aparecer nesta curva, então `proximo` não
    // avança — e sem a parada a varredura ficaria ligada para sempre esperando
    // em silêncio. Uma trava muda é pior que um erro: não há o que ler na tela.
    const pedidos: unknown[] = []
    servidor.use(
      http.post('/api/runs/:runId/variacao', async ({ request }) => {
        pedidos.push(await request.json())
        return HttpResponse.json({
          runId: 'run_de_outra_base',
          status: 'SUCESSO',
          jaExistia: true,
          naCurva: false,
        })
      }),
    )
    servirEmEtapas([{ teto: TETO, pontos: [BASE_PONTO] }])

    abrir()
    await userEvent.click(
      await screen.findByRole('button', { name: /Rodar a análise · 5 estimativas/ }),
    )

    // Volta ao estado de repouso, com a explicação na tela…
    expect(
      await screen.findByRole('button', { name: /Rodar a análise · 5 estimativas/ }),
    ).toBeInTheDocument()
    expect(screen.getByText(/é ponto da curva de outra rodada/)).toBeInTheDocument()
    // …e não fica pedindo o mesmo degrau em laço.
    await new Promise((r) => setTimeout(r, 250))
    expect(pedidos).toHaveLength(1)
  })

  it('parar interrompe a corrente sem cancelar o que está em voo', async () => {
    servidor.use(
      http.post('/api/runs/:runId/variacao', () =>
        HttpResponse.json({
          runId: 'run_10',
          status: 'PENDENTE',
          jaExistia: false,
          naCurva: true,
        }),
      ),
    )
    servirEmEtapas([{ teto: TETO, pontos: [BASE_PONTO] }])

    abrir()
    await userEvent.click(
      await screen.findByRole('button', { name: /Rodar a análise · 5 estimativas/ }),
    )
    await userEvent.click(await screen.findByRole('button', { name: 'Parar depois desta' }))

    expect(
      await screen.findByRole('button', { name: /Rodar a análise · 5 estimativas/ }),
    ).toBeInTheDocument()
  })
})

describe('a estimativa é explorável a partir da rodada padrão', () => {
  it('o degrau pronto vira link para o resultado dele', async () => {
    // Ela NÃO aparece no histórico de propósito — parou no relógio e não é
    // comparável com uma simulação. Este link é o único caminho até o resultado
    // completo dela, e é o certo: quem chega vem da rodada que a originou.
    servirSensibilidade({
      teto: TETO,
      pontos: [
        BASE_PONTO,
        {
          ...BASE_PONTO,
          degrau: 10,
          runId: 'run_estimativa_10',
          estimativa: true,
          vpl: 161_500_000,
          coberturaFimPct: 44.0,
        },
      ],
    })
    abrir()

    // O nome acessível do link é o próprio conteúdo do chip — degrau, dinheiro
    // e estado —, que é mais informativo para quem navega por teclado do que um
    // "abrir" genérico.
    const link = await screen.findByRole('link', { name: /\+10%.*estimativa/ })
    expect(link).toHaveAttribute('href', '/resultados/run_estimativa_10')
    expect(link).toHaveAttribute('title', 'Abrir o resultado de +10%')
  })

  it('degrau que ainda não rodou não é link', async () => {
    servirSensibilidade({ teto: TETO, pontos: [BASE_PONTO] })
    abrir()
    await screen.findByText('Antes de simular: o teto')
    expect(screen.queryByRole('link', { name: /\+10%/ })).not.toBeInTheDocument()
  })
})

describe('a variação que pertence a outra curva', () => {
  it('diz por que o ponto não apareceu, em vez de fingir que deu certo', async () => {
    // O servidor deduplica por PARÂMETROS. Se o mesmo orçamento escalado já é
    // ponto da curva de outra rodada, ele devolve aquela e `naCurva: false`.
    // Sem esta mensagem, o clique respondia "deu certo" e o gráfico continuava
    // sem o ponto, para sempre e sem explicação.
    servirSensibilidade({ teto: TETO, pontos: [BASE_PONTO] })
    servidor.use(
      http.post('/api/runs/:runId/variacao', () =>
        HttpResponse.json({
          runId: 'run_de_outra_base',
          status: 'SUCESSO',
          jaExistia: true,
          naCurva: false,
        }),
      ),
    )

    abrir()
    await userEvent.click(await screen.findByRole('button', { name: /Só \+10%/ }))

    expect(await screen.findByText(/é ponto da curva de outra rodada/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'o resultado dela' })).toHaveAttribute(
      'href',
      '/resultados/run_de_outra_base',
    )
  })
})
