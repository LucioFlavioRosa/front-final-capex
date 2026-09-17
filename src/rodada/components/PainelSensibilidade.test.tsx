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

    // NO BOTÃO, que é onde a pessoa se compromete com o gasto — com o
    // qualificador "no plano", porque o valor é a soma dos anos e não a verba
    // anual. "+10%" sozinho não é uma quantia, e quem decide orçamento decide em
    // reais.
    // A varredura padrão é +10% a +30% com um ponto no meio: três pontos, e o
    // botão diz de quanto a quanto dinheiro isso vai.
    expect(
      await screen.findByRole('button', {
        name: /Rodar 3 pontos · \+R\$ 11,0 Mi a \+R\$ 33,0 Mi no plano/,
      }),
    ).toBeInTheDocument()
    expect(screen.getByText(/R\$ 33,0 Mi somados os/)).toBeInTheDocument()
  })

  it('sem orçamento publicado não há teto, e nenhum valor é inventado', async () => {
    servirSensibilidade({ teto: null, pontos: [BASE_PONTO] })
    abrir()

    expect(await screen.findByRole('button', { name: /^Rodar 3 pontos$/ })).toBeInTheDocument()
    expect(screen.queryByText('Antes de simular: o teto')).not.toBeInTheDocument()
    // O botão fica sem a parte do dinheiro, em vez de mostrar "R$ 0,0 Mi".
    expect(screen.queryByText(/R\$ 0,0 Mi/)).not.toBeInTheDocument()
  })
})

describe('o disparo manda o modo', () => {
  it('o padrão é a estimativa rápida — e o play manda a varredura inteira, em ordem', async () => {
    servirSensibilidade({ teto: TETO, pontos: [BASE_PONTO] })
    const corpos: Record<string, unknown>[] = []
    servidor.use(
      http.post('/api/runs/:runId/variacao', async ({ request }) => {
        corpos.push((await request.json()) as Record<string, unknown>)
        return HttpResponse.json({ runId: `novo_${corpos.length}`, status: 'PENDENTE', jaExistia: false })
      }),
    )

    abrir()
    await userEvent.click(await screen.findByRole('button', { name: /Rodar 3 pontos/ }))

    // Os dois extremos e o do meio, do menor ao maior, todos rápidos.
    await waitFor(() => expect(corpos).toHaveLength(3))
    expect(corpos.map((c) => c.fator)).toEqual([1.1, 1.2, 1.3])
    expect(corpos.every((c) => c.modo === 'rapido')).toBe(true)
    expect(String(corpos[1].nome)).toContain('+20%')
  })

  it('um pedido atrás do outro, nunca em paralelo — foi o que saturou o barramento', async () => {
    servirSensibilidade({ teto: TETO, pontos: [BASE_PONTO] })
    let emCurso = 0
    let maximoSimultaneo = 0
    servidor.use(
      http.post('/api/runs/:runId/variacao', async () => {
        emCurso += 1
        maximoSimultaneo = Math.max(maximoSimultaneo, emCurso)
        await new Promise((r) => setTimeout(r, 20))
        emCurso -= 1
        return HttpResponse.json({ runId: 'novo', status: 'PENDENTE', jaExistia: false })
      }),
    )

    abrir()
    await userEvent.click(await screen.findByRole('button', { name: /Rodar 3 pontos/ }))
    await waitFor(() => expect(screen.queryByText(/Enfileirando/)).not.toBeInTheDocument())

    expect(maximoSimultaneo).toBe(1)
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

    // +10% falhou por tempo: no play ele vai completo; +20% e +30%, que nunca
    // rodaram, vão rápidos — a decisão é por degrau.
    const corpos: Record<string, unknown>[] = []
    servidor.use(
      http.post('/api/runs/:runId/variacao', async ({ request }) => {
        const c = (await request.json()) as Record<string, unknown>
        corpos.push(c)
        corpo = c
        return HttpResponse.json({ runId: 'novo', status: 'PENDENTE', jaExistia: false, naCurva: true })
      }),
    )
    await userEvent.click(await screen.findByRole('button', { name: /Rodar 3 pontos · completo/ }))
    await waitFor(() => expect(corpos).toHaveLength(3))
    expect(corpos[0]).toMatchObject({ modo: 'completo', fator: 1.1 })
    expect(corpos[1]).toMatchObject({ modo: 'rapido', fator: 1.2 })
    expect(corpo).not.toBeNull()
  })

  it('falha de OUTRA natureza não vira sugestão de trocar de modo', async () => {
    // Só o defeito conhecido do motor tem essa saída. Sugerir "rode completo"
    // para um banco fora do ar mandaria alguém gastar mil segundos de cluster
    // para reencontrar o mesmo problema.
    servirSensibilidade(COM_FALHA('ConnectionError: o banco recusou a conexão.'))
    abrir()

    expect(await screen.findByText(/o banco recusou a conexão/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /completo/ })).not.toBeInTheDocument()
    // O plano marca o degrau que falhou, e o play o inclui de novo.
    const plano = screen.getByRole('list', { name: 'Plano da varredura' })
    expect(await within(plano).findByText(/falhou/)).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: /^Rodar 3 pontos/ })).toBeInTheDocument()
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

    // O botão fala do PLANO — o que a varredura ainda precisa rodar (+20% e
    // +30%; o +10% já respondeu) —, e não da análise inteira.
    expect(await screen.findByText('Cobertura ao fim')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Rodar 2 pontos/ })).toBeInTheDocument()

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

    // O ponto vazado (○) precisa vir explicado: sem a nota, quem lê a curva não
    // tem como saber que aquele ponto parou no relógio em vez de fechar a prova.
    expect(await screen.findByText(/estimativas rápidas/)).toBeInTheDocument()
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
    await userEvent.click(await screen.findByRole('button', { name: /Rodar 3 pontos/ }))

    // Os três pedidos voltaram "de outra curva": três explicações, uma por
    // degrau — e não só a do último, que é o que `useMutation` guardaria.
    const avisos = await screen.findAllByText(/é ponto da curva de outra rodada/)
    expect(avisos).toHaveLength(3)
    expect(screen.getAllByRole('link', { name: 'o resultado dele' })[0]).toHaveAttribute(
      'href',
      '/resultados/run_de_outra_base',
    )
  })

  it('a explicação do primeiro pedido sobrevive ao sucesso do segundo', async () => {
    servirSensibilidade({ teto: TETO, pontos: [BASE_PONTO] })
    let n = 0
    servidor.use(
      http.post('/api/runs/:runId/variacao', () => {
        n += 1
        return n === 1
          ? HttpResponse.json({ runId: 'de_outra', status: 'SUCESSO', jaExistia: true, naCurva: false })
          : HttpResponse.json({ runId: `novo_${n}`, status: 'PENDENTE', jaExistia: false, naCurva: true })
      }),
    )

    abrir()
    await userEvent.click(await screen.findByRole('button', { name: /Rodar 3 pontos/ }))

    expect(await screen.findByText(/\+10% já foi simulado/)).toBeInTheDocument()
    await waitFor(() => expect(n).toBe(3))
    expect(screen.getAllByText(/é ponto da curva de outra rodada/)).toHaveLength(1)
  })

  it('o botão só volta depois que a curva soube dos pedidos', async () => {
    // Os POSTs voltam 201 antes de a consulta trazer os pontos em fila. Nessa
    // janela o botão dizia "Rodar 3 pontos" de novo, sobre dado velho.
    let pedidos = 0
    servidor.use(
      http.get('/api/runs/:runId/sensibilidade', () =>
        HttpResponse.json({
          teto: TETO,
          pontos:
            pedidos === 0
              ? [BASE_PONTO]
              : [
                  BASE_PONTO,
                  ...[10, 20, 30].map((degrau) => ({
                    ...BASE_PONTO,
                    degrau,
                    runId: `v${degrau}`,
                    status: 'PENDENTE',
                    vpl: null,
                    coberturaFimPct: null,
                  })),
                ],
        }),
      ),
      http.post('/api/runs/:runId/variacao', () => {
        pedidos += 1
        return HttpResponse.json({ runId: `v${pedidos}`, status: 'PENDENTE', jaExistia: false })
      }),
    )

    abrir()
    await userEvent.click(await screen.findByRole('button', { name: /Rodar 3 pontos/ }))

    const botao = await screen.findByRole('button', { name: /Na fila/ })
    expect(botao).toBeDisabled()
    expect(pedidos).toBe(3)
  })
})

/**
 * A VARREDURA — o contrato da tela.
 *
 * A pessoa dá o mínimo, o máximo e quantos pontos entre eles; o play manda
 * TODOS para a fila; a curva ACUMULA o que já rodou, venha de onde vier.
 */
describe('a varredura', () => {
  const campos = async () => ({
    minimo: await screen.findByLabelText(/Variação mínima/i),
    maximo: await screen.findByLabelText(/Variação máxima/i),
    entre: await screen.findByLabelText(/Pontos entre/i),
  })

  it('a frase diz o que vai rodar antes do play — extremos sempre, intermediários no meio', async () => {
    servirSensibilidade({ teto: TETO, pontos: [BASE_PONTO] })
    abrir()
    const { minimo, maximo, entre } = await campos()

    await userEvent.clear(minimo)
    await userEvent.type(minimo, '10')
    await userEvent.clear(maximo)
    await userEvent.type(maximo, '40')
    await userEvent.selectOptions(entre, '2')

    expect(await screen.findByText('4 pontos: +10%, +20%, +30%, +40%')).toBeInTheDocument()
  })

  it('o play leva os números que estão nos campos', async () => {
    servirSensibilidade({ teto: TETO, pontos: [BASE_PONTO] })
    const corpos: Record<string, unknown>[] = []
    servidor.use(
      http.post('/api/runs/:runId/variacao', async ({ request }) => {
        corpos.push((await request.json()) as Record<string, unknown>)
        return HttpResponse.json({ runId: 'novo', status: 'PENDENTE', jaExistia: false })
      }),
    )
    abrir()
    const { minimo, maximo, entre } = await campos()
    await userEvent.clear(minimo)
    await userEvent.type(minimo, '15')
    await userEvent.clear(maximo)
    await userEvent.type(maximo, '35')
    await userEvent.selectOptions(entre, '0')

    await userEvent.click(await screen.findByRole('button', { name: /Rodar 2 pontos/ }))

    await waitFor(() => expect(corpos).toHaveLength(2))
    expect(corpos.map((c) => c.fator)).toEqual([1.15, 1.35])
  })

  it('variação negativa: "-20% a -10%" roda com fator abaixo de 1, e o botão diz o dinheiro a menos', async () => {
    servirSensibilidade({ teto: TETO, pontos: [BASE_PONTO] })
    const corpos: Record<string, unknown>[] = []
    servidor.use(
      http.post('/api/runs/:runId/variacao', async ({ request }) => {
        corpos.push((await request.json()) as Record<string, unknown>)
        return HttpResponse.json({ runId: 'novo', status: 'PENDENTE', jaExistia: false })
      }),
    )
    abrir()
    const { minimo, maximo, entre } = await campos()
    await userEvent.clear(minimo)
    await userEvent.type(minimo, '-20')
    await userEvent.clear(maximo)
    await userEvent.type(maximo, '-10')
    await userEvent.selectOptions(entre, '0')

    expect(await screen.findByText('2 pontos: -20%, -10%')).toBeInTheDocument()
    const botao = await screen.findByRole('button', { name: /Rodar 2 pontos · -R\$ 22,0 Mi a -R\$ 11,0 Mi no plano/ })
    await userEvent.click(botao)

    await waitFor(() => expect(corpos).toHaveLength(2))
    expect(corpos.map((c) => c.fator)).toEqual([0.8, 0.9])
    expect(String(corpos[0].nome)).toContain('-20%')
  })

  it('numa curva só de reduções, a referência é o maior degrau não zero — e não a base', async () => {
    servirSensibilidade({
      teto: TETO,
      pontos: [
        BASE_PONTO,
        { ...BASE_PONTO, degrau: -50, runId: 'm50', coberturaFimPct: 40, obras: obras({ 'Rede coletora': 9, Tronco: 8, 'ETE (módulo)': 20 }) },
        { ...BASE_PONTO, degrau: -10, runId: 'm10', coberturaFimPct: 43, obras: obras({ 'Rede coletora': 12, Tronco: 10, 'ETE (módulo)': 23 }) },
      ],
    })
    abrir()
    expect(await screen.findByText('Cobertura ao fim')).toBeInTheDocument()
    // "43,8% → 43,0% com -10%", e não "hoje → hoje com 0%".
    expect(screen.getByText(/43,0% com -10%/)).toBeInTheDocument()
    expect(screen.queryByText(/com 0%/)).not.toBeInTheDocument()
    expect(screen.getByText(/46 hoje → 45 com -10%/)).toBeInTheDocument()
  })

  it('o teto só fala de dinheiro a mais: numa faixa de reduções, diz que a resposta é a simulação', async () => {
    servirSensibilidade({ teto: TETO, pontos: [BASE_PONTO] })
    abrir()
    const { minimo, maximo, entre } = await campos()
    await userEvent.clear(minimo)
    await userEvent.type(minimo, '-20')
    await userEvent.clear(maximo)
    await userEvent.type(maximo, '-10')
    await userEvent.selectOptions(entre, '0')

    expect(await screen.findByText(/Reduzir o CAPEX não traz sub-bacia nenhuma/)).toBeInTheDocument()
    expect(screen.queryByText(/caberiam no dinheiro a mais/)).not.toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('mínimo igual ao máximo é um ponto só', async () => {
    servirSensibilidade({ teto: TETO, pontos: [BASE_PONTO] })
    abrir()
    const { minimo, maximo } = await campos()
    await userEvent.clear(minimo)
    await userEvent.type(minimo, '25')
    await userEvent.clear(maximo)
    await userEvent.type(maximo, '25')

    expect(await screen.findByText('1 ponto: +25%')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Rodar 1 ponto/ })).toBeInTheDocument()
  })

  it('varredura fora dos limites não vira requisição', async () => {
    servirSensibilidade({ teto: TETO, pontos: [BASE_PONTO] })
    let pediu = false
    servidor.use(
      http.post('/api/runs/:runId/variacao', () => {
        pediu = true
        return HttpResponse.json({ runId: 'x', status: 'PENDENTE', jaExistia: false })
      }),
    )
    abrir()
    const { minimo, maximo } = await campos()

    // Máximo menor que o mínimo: a recusa é da tela, e diz o que consertar.
    await userEvent.clear(maximo)
    await userEvent.type(maximo, '5')
    expect(await screen.findByText(/o máximo precisa ser maior ou igual ao mínimo/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Rodar/ })).toBeDisabled()

    // Mínimo vazio: outra frase, mesmo bloqueio.
    await userEvent.clear(minimo)
    expect(await screen.findByText(/digite o mínimo e o máximo/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Rodar/ })).toBeDisabled()

    // Abaixo do piso.
    await userEvent.type(minimo, '-96')
    await userEvent.clear(maximo)
    await userEvent.type(maximo, '10')
    expect(await screen.findByText(/a menor variação aceita é -95%/)).toBeInTheDocument()
    expect(pediu).toBe(false)
  })

  it('o play pula o que já respondeu e o que já está na fila — e diz isso no plano', async () => {
    servirSensibilidade({
      teto: TETO,
      pontos: [
        BASE_PONTO,
        { ...BASE_PONTO, degrau: 10, runId: 'v10', coberturaFimPct: 44 },
        { ...BASE_PONTO, degrau: 20, runId: 'v20', status: 'PENDENTE', vpl: null, coberturaFimPct: null },
      ],
    })
    abrir()

    const plano = await screen.findByRole('list', { name: 'Plano da varredura' })
    // O plano nasce "vai rodar" e muda quando a curva chega — daí o `find`.
    expect(await within(plano).findByText(/pronto/)).toBeInTheDocument()
    expect(within(plano).getByText(/na fila/)).toBeInTheDocument()
    expect(within(plano).getByText(/vai rodar/)).toBeInTheDocument()
    // Só o +30% falta.
    expect(screen.getByRole('button', { name: /Rodar 1 ponto/ })).toBeInTheDocument()
  })

  it('o que o servidor tem em voo aparece no plano MESMO fora da faixa digitada — na fila ou rodando', async () => {
    // Quem disparou +30/+115/+200, saiu e voltou, encontra os campos no padrão
    // (10–30). O servidor continua servindo a fila: o plano tem de mostrar isso.
    servirSensibilidade({
      teto: TETO,
      pontos: [
        BASE_PONTO,
        { ...BASE_PONTO, degrau: 30, runId: 'v30', coberturaFimPct: 46 },
        { ...BASE_PONTO, degrau: 115, runId: 'v115', status: 'RODANDO', vpl: null, coberturaFimPct: null },
        { ...BASE_PONTO, degrau: 200, runId: 'v200', status: 'PENDENTE', vpl: null, coberturaFimPct: null },
      ],
    })
    abrir()

    const plano = await screen.findByRole('list', { name: 'Plano da varredura' })
    expect(await within(plano).findByText(/rodando/)).toBeInTheDocument()
    const itens = within(plano).getAllByRole('listitem').map((li) => li.textContent ?? '')
    expect(itens.some((t) => t.includes('+115%') && t.includes('rodando'))).toBe(true)
    expect(itens.some((t) => t.includes('+200%') && t.includes('na fila'))).toBe(true)
    // E a faixa digitada continua sendo o plano do play: +10 e +20 faltam.
    expect(screen.getByRole('button', { name: /Rodar 2 pontos/ })).toBeInTheDocument()
  })

  it('com a faixa pronta e ponto em voo FORA dela, o botão não diz "curva completa"', async () => {
    servirSensibilidade({
      teto: TETO,
      pontos: [
        BASE_PONTO,
        { ...BASE_PONTO, degrau: 10, runId: 'a', coberturaFimPct: 44 },
        { ...BASE_PONTO, degrau: 20, runId: 'b', coberturaFimPct: 45 },
        { ...BASE_PONTO, degrau: 30, runId: 'c', coberturaFimPct: 46 },
        { ...BASE_PONTO, degrau: 115, runId: 'v115', status: 'RODANDO', vpl: null, coberturaFimPct: null },
      ],
    })
    abrir()
    expect(await screen.findByRole('button', { name: /Na fila — a curva vai se completando/ })).toBeDisabled()
  })

  it('com tudo pronto, o play não tem o que pedir', async () => {
    servirSensibilidade({
      teto: TETO,
      pontos: [
        BASE_PONTO,
        { ...BASE_PONTO, degrau: 10, runId: 'a', coberturaFimPct: 44 },
        { ...BASE_PONTO, degrau: 20, runId: 'b', coberturaFimPct: 45 },
        { ...BASE_PONTO, degrau: 30, runId: 'c', coberturaFimPct: 46 },
      ],
    })
    abrir()
    const botao = await screen.findByRole('button', { name: /Curva completa nesta faixa/ })
    expect(botao).toBeDisabled()
  })

  it('a curva mostra os pontos que já rodaram, mesmo os que a varredura não pede', async () => {
    // Os campos são a PRÓXIMA pergunta; o gráfico é a análise acumulada. Um
    // ponto de +60% que alguém pagou para executar não some porque a faixa vai
    // até 30.
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
