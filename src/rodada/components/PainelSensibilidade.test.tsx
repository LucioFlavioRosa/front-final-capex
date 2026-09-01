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
import { screen, waitFor, within } from '@testing-library/react'
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
      screen.getByRole('button', { name: /Rodar \+10% · \+R\$ 11,0 Mi no plano/ }),
    ).toBeInTheDocument()
  })

  it('sem orçamento publicado não há teto, e nenhum valor é inventado', async () => {
    servirSensibilidade({ teto: null, pontos: [BASE_PONTO] })
    abrir()

    expect(await screen.findByRole('button', { name: /Rodar \+10%/ })).toBeInTheDocument()
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
    await userEvent.click(await screen.findByRole('button', { name: /Rodar \+10%/ }))

    expect(corpo).toMatchObject({ modo: 'rapido', fator: 1.1 })
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

describe('a curva mostra tudo o que rodou, mesmo fora da faixa', () => {
  it('um degrau fora da faixa continua no gráfico e na tabela', async () => {
    // Ponto que rodou foi execução paga. Escondê-lo porque um filtro de tela
    // mudou jogaria fora resposta já comprada — e foi o que aconteceu com um
    // +60% e um +90% quando a curva passou a mostrar só a faixa.
    servirSensibilidade({
      teto: TETO,
      pontos: [
        BASE_PONTO,
        { ...BASE_PONTO, degrau: 10, runId: 'r10', coberturaFimPct: 44 },
        { ...BASE_PONTO, degrau: 60, runId: 'r60', coberturaFimPct: 46 },
        { ...BASE_PONTO, degrau: 90, runId: 'r90', coberturaFimPct: 48 },
      ],
    })
    abrir()

      // O chip fala do ALVO — o que o campo pede agora —, e não da análise inteira.
      expect(await screen.findByText('Cobertura ao fim')).toBeInTheDocument()
      const chips = screen.getByRole('list')
      expect(within(chips).getAllByText(/^\+\d+%$/).map((e) => e.textContent)).toEqual(['+10%'])

    // …e a curva mostra os três, inclusive os de fora.
    const quadro = screen.getByRole('figure', { name: 'Cobertura ao fim' })
    await userEvent.click(within(quadro).getByRole('tab', { name: 'Tabela' }))
    const linhas = within(quadro).getAllByRole('row').map((r) => r.textContent ?? '')
    expect(linhas.some((l) => l.includes('+60%'))).toBe(true)
    expect(linhas.some((l) => l.includes('+90%'))).toBe(true)
  })

  it('e a tela não diz mais que eles ficaram "fora"', async () => {
    servirSensibilidade({
      teto: TETO,
      pontos: [BASE_PONTO, { ...BASE_PONTO, degrau: 60, runId: 'r60', coberturaFimPct: 46 }],
    })
    abrir()
    // Com a base e o +60% publicados, a curva já tem dois pontos e aparece.
    await screen.findByText('Cobertura ao fim')
    expect(screen.queryByText(/já rodados? fora desta faixa/)).not.toBeInTheDocument()
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
    await userEvent.click(await screen.findByRole('button', { name: /Rodar \+10%/ }))

    expect(await screen.findByText(/é ponto da curva de outra rodada/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'o resultado dela' })).toHaveAttribute(
      'href',
      '/resultados/run_de_outra_base',
    )
  })
})

/**
 * UM PONTO DE CADA VEZ — o contrato da tela depois que a faixa saiu.
 *
 * O que se perde ao trocar faixa por ponto é a varredura automática; o que NÃO se
 * pode perder é a curva. Estes testes prendem as duas metades: o pedido leva o
 * número digitado, e o gráfico continua mostrando tudo o que já rodou, venha de
 * onde vier.
 */
describe('um acréscimo de cada vez', () => {
  it('o pedido leva o número que está no campo', async () => {
    servirSensibilidade({ teto: TETO, pontos: [BASE_PONTO] })
    let corpo: Record<string, unknown> | null = null
    servidor.use(
      http.post('/api/runs/:runId/variacao', async ({ request }) => {
        corpo = (await request.json()) as Record<string, unknown>
        return HttpResponse.json({ runId: 'novo', status: 'PENDENTE', jaExistia: false })
      }),
    )
    abrir()

    const campo = await screen.findByLabelText(/Acréscimo de CAPEX por ano/i)
    await userEvent.clear(campo)
    await userEvent.type(campo, '35')

    await userEvent.click(await screen.findByRole('button', { name: /Rodar \+35%/ }))

    // 1,35 = +35% sobre o orçamento de cada ano.
    await waitFor(() => expect(corpo).toMatchObject({ fator: 1.35 }))
    expect(String((corpo as unknown as Record<string, unknown>).nome)).toContain('+35%')
  })

  it('acréscimo fora dos limites não vira requisição', async () => {
    servirSensibilidade({ teto: TETO, pontos: [BASE_PONTO] })
    let pediu = false
    servidor.use(
      http.post('/api/runs/:runId/variacao', () => {
        pediu = true
        return HttpResponse.json({ runId: 'x', status: 'PENDENTE', jaExistia: false })
      }),
    )
    abrir()

    const campo = await screen.findByLabelText(/Acréscimo de CAPEX por ano/i)
    await userEvent.clear(campo)
    await userEvent.type(campo, '0')

    // A recusa é da tela, e diz o que consertar em vez de devolver um 422.
    expect(await screen.findByText(/entre 1% e 200%/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Rodar/ })).toBeDisabled()
    expect(pediu).toBe(false)
  })

  it('um ponto que já rodou pode ser rodado de novo', async () => {
    // Repetir é legítimo: o modo pode ter mudado de estimativa para completo. Um
    // botão que sumisse porque o ponto existe deixaria a pessoa sem saída.
    servirSensibilidade({
      teto: TETO,
      pontos: [BASE_PONTO, { ...BASE_PONTO, degrau: 10, runId: 'v10', coberturaFimPct: 44 }],
    })
    abrir()

    expect(await screen.findByRole('button', { name: /Rodar \+10% de novo/ })).toBeInTheDocument()
  })

  it('a curva mostra os pontos que já rodaram, mesmo os que o campo não pede', async () => {
    // O campo é a PRÓXIMA pergunta; o gráfico é a análise acumulada. Um ponto de
    // +60% que alguém pagou para executar não some porque o campo diz 10.
    servirSensibilidade({
      teto: TETO,
      pontos: [
        BASE_PONTO,
        { ...BASE_PONTO, degrau: 10, runId: 'a', coberturaFimPct: 44 },
        { ...BASE_PONTO, degrau: 60, runId: 'b', coberturaFimPct: 51 },
      ],
    })
    abrir()

    expect(await screen.findByText('Cobertura ao fim')).toBeInTheDocument()
    const quadro = screen.getByRole('figure', { name: 'Cobertura ao fim' })
    await userEvent.click(within(quadro).getByRole('tab', { name: 'Tabela' }))
    const linhas = within(quadro).getAllByRole('row').map((r) => r.textContent ?? '')
    expect(linhas.some((l) => l.includes('+60%'))).toBe(true)
  })
})
