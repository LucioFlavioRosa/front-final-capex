/**
 * A CURVA — escolher a rodada certa de cada degrau, e o que a tela oferece.
 *
 * O que se prende aqui é o que erraria em silêncio, com números plausíveis dos
 * dois lados: trocar uma simulação completa por uma estimativa mais recente,
 * tratar uma rodada que falhou como se ainda fosse chegar (o botão trava para
 * sempre), e tratar uma rodada concluída sem resultado publicado como erro (a
 * mesma trava, com o resultado pronto no banco).
 */
import { describe, expect, it } from 'vitest'
import {
  FAIXA_PADRAO,
  MAIOR_DEGRAU,
  MAXIMO_DE_PONTOS,
  comparativoDeObras,
  curvaPronta,
  dinheiroDoDegrau,
  fatorDoDegrau,
  melhorPorDegrau,
  emVooDaBase,
  proximoDegrau,
  faixaValida,
  pontosDaFaixa,
  situacaoDaVarredura,
  vezesOOrcamento,
  type PontoDaCurva,
  type TetoDeSensibilidade,
} from './sensibilidade'

const ponto = (p: Partial<PontoDaCurva> & { degrau: number; runId: string }): PontoDaCurva => ({
  status: 'SUCESSO',
  estimativa: false,
  vpl: 100,
  coberturaFimPct: 40,
  metasAtingidas: 1,
  metasTotal: 3,
  capexTotal: 90,
  tempoS: 12,
  obras: [],
  ...p,
})

/** Atalho: `{ 'Tronco': 3 }` vira a lista que o servidor manda. */
const obras = (m: Record<string, number>) =>
  Object.entries(m).map(([nome, construidas]) => ({ componente: nome, nome, construidas }))

const semResultado = (p: Partial<PontoDaCurva> & { degrau: number; runId: string }) =>
  ponto({ ...p, vpl: null, coberturaFimPct: null })

/** Os cinco degraus da faixa padrão, que era a lista fixa de antes. */
// A varredura de cinco pontos que estes testes exercitam. NAO sai de `FAIXA_PADRAO`:
// o padrao da tela virou UM ponto, e amarrar os dois faria esta suite mudar de assunto
// junto com o formulario.
const PADRAO = pontosDaFaixa({ de: 10, ate: 50, pontos: 5 })

describe('melhorPorDegrau', () => {
  it('a simulação completa vence a estimativa, mesmo a estimativa sendo mais recente', () => {
    // É a troca errada que a ordem por relógio faria: o número menos confiável
    // apagando o mais confiável do gráfico porque chegou por último.
    const melhor = melhorPorDegrau([
      ponto({ degrau: 10, runId: 'estimativa-nova', estimativa: true }),
      ponto({ degrau: 10, runId: 'completa-velha' }),
    ])
    expect(melhor.get(10)?.runId).toBe('completa-velha')
  })

  it('estimativa com resultado vence rodada em voo e rodada que falhou', () => {
    const melhor = melhorPorDegrau([
      semResultado({ degrau: 20, runId: 'falhou', status: 'ERRO' }),
      semResultado({ degrau: 20, runId: 'rodando', status: 'RODANDO' }),
      ponto({ degrau: 20, runId: 'estimativa', estimativa: true }),
    ])
    expect(melhor.get(20)?.runId).toBe('estimativa')
  })

  it('em voo vence a que falhou — uma ainda responde, a outra não', () => {
    const melhor = melhorPorDegrau([
      semResultado({ degrau: 30, runId: 'falhou', status: 'ERRO' }),
      semResultado({ degrau: 30, runId: 'rodando', status: 'PENDENTE' }),
    ])
    expect(melhor.get(30)?.runId).toBe('rodando')
  })
})

describe('situacaoDaVarredura', () => {
  it('rodada que FALHOU não bloqueia a análise — ela volta para a fila do que rodar', () => {
    // O defeito que isto prende: tratar "sem resultado" como "em execução". Uma
    // rodada em ERRO nunca publica, então ela travaria o botão para sempre.
    const s = situacaoDaVarredura(melhorPorDegrau([semResultado({ degrau: 10, runId: 'r1', status: 'ERRO' })]), PADRAO)
    expect(s[0].estado).toBe('erro')
    expect(proximoDegrau(s)).toBe(10)
  })

  it('rodada CONCLUÍDA cujo resultado ainda não chegou é espera, e nunca erro', () => {
    // Perguntar pelos KPIs antes do status fazia uma rodada `SUCESSO` recém
    // publicada cair no ramo do erro — e como ela nunca volta a ser PENDENTE,
    // ficava assim para sempre, com o resultado pronto no banco.
    const s = situacaoDaVarredura(melhorPorDegrau([semResultado({ degrau: 10, runId: 'r1', status: 'SUCESSO' })]), PADRAO)
    expect(s[0].estado).toBe('em voo')
    // E ela BLOQUEIA o disparo, ainda que +20% siga sendo o próximo da lista:
    // são duas perguntas diferentes, e é o bloqueio que respeita a capacidade 1.
    expect(emVooDaBase([semResultado({ degrau: 10, runId: 'r1', status: 'SUCESSO' })])?.degrau).toBe(10)
    expect(proximoDegrau(s)).toBe(20)
  })

  it('em voo bloqueia — a fila tem capacidade 1', () => {
    const emVoo = [semResultado({ degrau: 10, runId: 'r1', status: 'RODANDO' })]
    expect(situacaoDaVarredura(melhorPorDegrau(emVoo), PADRAO)[0].estado).toBe('em voo')
    expect(emVooDaBase(emVoo)?.degrau).toBe(10)
  })

  it('uma que falhou NÃO bloqueia — ela nunca vai publicar', () => {
    expect(emVooDaBase([semResultado({ degrau: 10, runId: 'r1', status: 'ERRO' })])).toBeNull()
  })

  it('devolve os cinco degraus, com e sem rodada', () => {
    const s = situacaoDaVarredura(melhorPorDegrau([ponto({ degrau: 10, runId: 'a' }), ponto({ degrau: 30, runId: 'b' })]), PADRAO)
    expect(s.map((x) => x.degrau)).toEqual([10, 20, 30, 40, 50])
    expect(s.map((x) => x.estado)).toEqual(['pronto', 'ausente', 'pronto', 'ausente', 'ausente'])
    // O próximo é o MENOR que falta, e não o primeiro da lista de tudo.
    expect(proximoDegrau(s)).toBe(20)
  })

  it('sem nada para rodar, não há próximo', () => {
    const todos = melhorPorDegrau(
      [10, 20, 30, 40, 50].map((degrau) => ponto({ degrau, runId: `r${degrau}` })),
    )
    expect(proximoDegrau(situacaoDaVarredura(todos, PADRAO))).toBeNull()
  })
})

describe('detalhes que o backend espera', () => {
  it('o degrau vira fator multiplicativo', () => {
    expect(fatorDoDegrau(10)).toBeCloseTo(1.1)
    expect(fatorDoDegrau(50)).toBeCloseTo(1.5)
  })

  it('um ponto só não é curva', () => {
    expect(curvaPronta([ponto({ degrau: 0, runId: 'base' })])).toBe(false)
    expect(
      curvaPronta([ponto({ degrau: 0, runId: 'base' }), ponto({ degrau: 10, runId: 'r' })]),
    ).toBe(true)
  })

  it('rodada disparada mas ainda sem resultado não conta como ponto', () => {
    expect(
      curvaPronta([
        ponto({ degrau: 0, runId: 'base' }),
        semResultado({ degrau: 10, runId: 'r', status: 'RODANDO' }),
      ]),
    ).toBe(false)
  })
})

describe('o teto em escala', () => {
  const teto = (over: Partial<TetoDeSensibilidade>): TetoDeSensibilidade => ({
    orcamentoTotal: 110_000_700,
    anosDoPlano: 2,
    subbaciasFora: 1099,
    subbaciasSemCapexProprio: 1,
    capexParaTodas: 1_956_341_969,
    vazaoTotalPresa: 29_533,
    degraus: [],
    ...over,
  })

  it('diz quantas vezes o orçamento seria preciso', () => {
    expect(vezesOOrcamento(teto({}))).toBeCloseTo(17.78, 1)
  })

  it('orçamento zero não vira divisão por zero', () => {
    // Rodada publicada sem orçamento existe (carga direta pelo pacote), e um
    // `Infinity` na tela seria pior que a ausência da frase.
    expect(vezesOOrcamento(teto({ orcamentoTotal: 0 }))).toBeNull()
  })
})


describe('dinheiroDoDegrau', () => {
  it('traduz o degrau em reais, e o total novo', () => {
    const d = dinheiroDoDegrau(110_000_700, 10)
    expect(d.aMais).toBeCloseTo(11_000_070, 2)
    expect(d.novoTotal).toBeCloseTo(121_000_770, 2)
  })

  it('escala linear em todos os degraus', () => {
    expect(dinheiroDoDegrau(100, 50).aMais).toBe(50)
    expect(dinheiroDoDegrau(100, 50).novoTotal).toBe(150)
  })
})

describe('comparativoDeObras', () => {
  const hoje = ponto({
    degrau: 0,
    runId: 'base',
    obras: obras({ 'Rede coletora': 13, Tronco: 10, 'ETE (módulo)': 23 }),
  })

  it('o delta NEGATIVO aparece — mais orçamento rearranja, não só acrescenta', () => {
    // Dado real desta unidade: +10% constrói uma rede A MENOS e um tronco a
    // mais. Clampar em zero esconderia justamente o que explica a curva.
    const c = comparativoDeObras([
      hoje,
      ponto({
        degrau: 10,
        runId: 'r10',
        obras: obras({ 'Rede coletora': 12, Tronco: 11, 'ETE (módulo)': 24 }),
      }),
    ])!
    const rede = c.linhas.find((l) => l.nome === 'Rede coletora')!
    expect(rede.celulas[0].delta).toBe(-1)
    expect(c.linhas.find((l) => l.nome === 'Tronco')!.celulas[0].delta).toBe(1)
  })

  it('componente que só aparece num degrau vale ZERO no outro, e não some', () => {
    // Sem isto a barra empilhada perderia um pedaço numa coluna e não na outra,
    // e a comparação entre colunas passaria a comparar coisas diferentes.
    const c = comparativoDeObras([
      hoje,
      ponto({
        degrau: 10,
        runId: 'r10',
        obras: obras({ 'Rede coletora': 13, Tronco: 10, 'ETE (módulo)': 23, EEE: 4 }),
      }),
    ])!
    expect(c.componentes).toContain('EEE')
    const eee = c.linhas.find((l) => l.nome === 'EEE')!
    expect(eee.hoje).toBe(0)
    expect(eee.celulas[0].delta).toBe(4)
    // E a linha do gráfico tem a chave em TODAS as colunas.
    expect(c.porDegrau.every((d) => typeof d['EEE'] === 'number')).toBe(true)
    expect(c.porDegrau[0]['EEE']).toBe(0)
  })

  it('degrau em execução não vira coluna de zeros', () => {
    // Uma coluna vazia no meio da série seria lida como "com mais dinheiro,
    // nada é construído".
    const c = comparativoDeObras([
      hoje,
      ponto({ degrau: 10, runId: 'r10', obras: obras({ Tronco: 11 }) }),
      semResultado({ degrau: 20, runId: 'r20', status: 'RODANDO' }),
    ])!
    expect(c.porDegrau.map((d) => d.degrau)).toEqual([0, 10])
  })

  it('a base que não construiu NADA continua sendo base', () => {
    // Uma rodada publicada com zero obras devolve `obras: []`, igual a uma que
    // ainda não publicou. Descartá-la pelo tamanho da lista sumia com o quadro
    // inteiro — justamente quando ele teria mais a dizer: partindo de zero, tudo
    // o que o dinheiro a mais compra é ganho.
    const c = comparativoDeObras([
      ponto({ degrau: 0, runId: 'base', obras: [] }),
      ponto({ degrau: 10, runId: 'r10', obras: obras({ Tronco: 4, 'Rede coletora': 2 }) }),
    ])!
    expect(c).not.toBeNull()
    expect(c.totalHoje).toBe(0)
    expect(c.porDegrau.map((d) => d.rotulo)).toEqual(['hoje', '+10%'])
    expect(c.linhas.find((l) => l.nome === 'Tronco')!.hoje).toBe(0)
    expect(c.linhas.find((l) => l.nome === 'Tronco')!.celulas[0].delta).toBe(4)
  })

  it('quando NENHUM degrau constrói nada, não há quadro', () => {
    // Seis colunas de altura zero sob um título que promete obras. As curvas
    // acima já dizem que nada muda.
    expect(
      comparativoDeObras([
        ponto({ degrau: 0, runId: 'base', obras: [] }),
        ponto({ degrau: 10, runId: 'r10', obras: [] }),
      ]),
    ).toBeNull()
  })

  it('sem a rodada de hoje não há comparação', () => {
    expect(comparativoDeObras([ponto({ degrau: 10, runId: 'r', obras: obras({ Tronco: 1 }) })]))
      .toBeNull()
  })

  it('só a rodada de hoje também não é comparação', () => {
    expect(comparativoDeObras([hoje])).toBeNull()
  })

  it('o total de cada coluna fecha com a soma dos componentes', () => {
    const c = comparativoDeObras([
      hoje,
      ponto({
        degrau: 20,
        runId: 'r20',
        obras: obras({ 'Rede coletora': 12, Tronco: 12, 'ETE (módulo)': 25, EEE: 9 }),
      }),
    ])!
    for (const col of c.porDegrau) {
      const soma = c.componentes.reduce((s, nome) => s + (col[nome] as number), 0)
      expect(soma).toBe(col.total)
    }
    expect(c.totalHoje).toBe(46)
    expect(c.porDegrau[1].delta).toBe(58 - 46)
  })

  it('as colunas saem em ordem de degrau, mesmo o servidor mandando fora de ordem', () => {
    const c = comparativoDeObras([
      ponto({ degrau: 20, runId: 'r20', obras: obras({ Tronco: 12 }) }),
      hoje,
      ponto({ degrau: 10, runId: 'r10', obras: obras({ Tronco: 11 }) }),
    ])!
    expect(c.porDegrau.map((d) => d.rotulo)).toEqual(['hoje', '+10%', '+20%'])
  })
})

describe('a faixa é de quem analisa', () => {
  it('as duas pontas sempre entram, de dois pontos para cima', () => {
    // São elas que a pessoa escolheu; os intermediários mostram o meio. Uma
    // varredura que não passasse pelos extremos responderia outra pergunta.
    // De DOIS para cima: um ponto só não tem "duas pontas" — ele é a resposta
    // inteira, e `ate` é ignorado.
    for (let pontos = 2; pontos <= MAXIMO_DE_PONTOS; pontos++) {
      const p = pontosDaFaixa({ de: 10, ate: 50, pontos })
      expect(p[0]).toBe(10)
      expect(p[p.length - 1]).toBe(50)
    }
  })

  it('dois pontos são só as pontas; cinco reproduzem a faixa padrão', () => {
    expect(pontosDaFaixa({ de: 10, ate: 50, pontos: 2 })).toEqual([10, 50])
    expect(pontosDaFaixa({ de: 10, ate: 50, pontos: 5 })).toEqual([10, 20, 30, 40, 50])
  })

  it('os intermediários são igualmente espaçados', () => {
    expect(pontosDaFaixa({ de: 10, ate: 50, pontos: 3 })).toEqual([10, 30, 50])
    expect(pontosDaFaixa({ de: 5, ate: 20, pontos: 4 })).toEqual([5, 10, 15, 20])
  })

  it('faixa estreita rende menos pontos que os pedidos, e não repetidos', () => {
    // Rodar duas vezes o mesmo orçamento gastaria cluster para desenhar o mesmo
    // ponto duas vezes.
    expect(pontosDaFaixa({ de: 10, ate: 12, pontos: 5 })).toEqual([10, 11, 12])
  })

  it('a mesma conta do backend, nos mesmos casos', () => {
    // Se as duas divergirem, o teto vem para degraus que a tela não vai rodar —
    // com os dois números plausíveis e nada denunciando.
    //
    // O caso de 1 a 100 cai em 50.5 no meio exato, e foi ele que pegou a
    // divergência: `Math.round` arredonda para cima (51) e o `round` do Python
    // arredondava para o PAR (50). O backend passou a usar `floor(x + 0.5)`.
    expect(pontosDaFaixa({ de: 1, ate: 100, pontos: 5 })).toEqual([1, 26, 51, 75, 100])
    expect(pontosDaFaixa({ de: 15, ate: 25, pontos: 3 })).toEqual([15, 20, 25])
  })

  it('faixa que não sobe, ou fora dos limites, não vira varredura', () => {
    expect(faixaValida({ de: 50, ate: 50, pontos: 3 })).toBe(false)
    expect(faixaValida({ de: 50, ate: 10, pontos: 3 })).toBe(false)
    expect(faixaValida({ de: 0, ate: 50, pontos: 3 })).toBe(false)
    expect(faixaValida({ de: 10, ate: MAIOR_DEGRAU + 1, pontos: 3 })).toBe(false)
    // UM PONTO E VALIDO, e e o pedido comum da tela: `ate` e ignorado.
    expect(faixaValida({ de: 10, ate: 50, pontos: 1 })).toBe(true)
    expect(pontosDaFaixa({ de: 10, ate: 50, pontos: 1 })).toEqual([10])
    expect(pontosDaFaixa({ de: 25, ate: 25, pontos: 1 })).toEqual([25])
    // e continua sujeito aos limites
    expect(faixaValida({ de: 0, ate: 0, pontos: 1 })).toBe(false)
    expect(faixaValida({ de: 10, ate: 0, pontos: 1 })).toBe(false)
    expect(faixaValida({ de: MAIOR_DEGRAU + 1, ate: MAIOR_DEGRAU + 1, pontos: 1 })).toBe(false)
    expect(faixaValida({ de: 10, ate: 50, pontos: 6 })).toBe(false)
    expect(faixaValida(FAIXA_PADRAO)).toBe(true)
  })
})

describe('A FAIXA É A PERGUNTA — ponto fora dela é resposta de outra', () => {
  const JA_RODOU = [
    ponto({ degrau: 10, runId: 'r10' }),
    ponto({ degrau: 30, runId: 'r30' }),
    ponto({ degrau: 50, runId: 'r50' }),
  ]
  const ESTREITA = pontosDaFaixa({ de: 5, ate: 20, pontos: 4 })

  it('a lista tem EXATAMENTE os degraus pedidos, e nada mais', () => {
    // O defeito que isto prende: somar os já executados aos pedidos. Numa base
    // que rodou +10% a +50%, pedir "de 5 a 20 em 4" devolvia
    // +5 +10 +15 +20 +30 +40 +50 — o cenário antigo de volta, com o controle de
    // faixa parecendo ignorado. Duas análises no mesmo gráfico não são uma
    // análise mais completa: são duas perguntas somadas.
    const s = situacaoDaVarredura(melhorPorDegrau(JA_RODOU), ESTREITA)
    expect(s.map((x) => x.degrau)).toEqual([5, 10, 15, 20])
  })

  it('o que está DENTRO da faixa e já rodou continua pronto', () => {
    // Estreitar a faixa não manda rodar de novo o que já existe.
    const s = situacaoDaVarredura(melhorPorDegrau(JA_RODOU), ESTREITA)
    expect(s.filter((x) => x.estado === 'pronto').map((x) => x.degrau)).toEqual([10])
    expect(proximoDegrau(s)).toBe(5)
  })

  it('o que ficou fora da faixa NÃO some da curva — a faixa é o plano, não o resultado', () => {
    // Os dois papéis, e o corte entre eles. Os chips são o PLANO: o que a faixa
    // pede e o botão vai disparar. O gráfico é o RESULTADO: tudo o que existe.
    // Ponto que rodou foi execução paga, e escondê-lo por causa de um filtro de
    // tela jogaria fora resposta já comprada.
    const melhor = melhorPorDegrau(JA_RODOU)
    // o plano fica na faixa…
    expect(situacaoDaVarredura(melhor, ESTREITA).map((x) => x.degrau)).toEqual([5, 10, 15, 20])
    // …e o resultado continua inteiro, com os degraus de fora dentro do mapa.
    expect([...melhor.keys()].sort((a, b) => a - b)).toEqual([10, 30, 50])
  })

})

describe('o bloqueio segue a FILA, e não a faixa', () => {
  it('degrau em voo FORA da faixa continua bloqueando o disparo', () => {
    // Nasceu da correção da faixa: com a lista limitada ao intervalo pedido, um
    // +50% em execução sumia da situação — e com ele o bloqueio. Quem disparasse
    // +50%, estreitasse para 5–20 e clicasse de novo poria DOIS pedidos numa
    // fila de capacidade 1, que é o que devolveu 503 na primeira tentativa real.
    const pontos = [semResultado({ degrau: 50, runId: 'r50', status: 'RODANDO' })]
    const faixa = pontosDaFaixa({ de: 5, ate: 20, pontos: 4 })
    expect(situacaoDaVarredura(melhorPorDegrau(pontos), faixa).map((s) => s.degrau))
      .toEqual([5, 10, 15, 20])
    expect(emVooDaBase(pontos)?.degrau).toBe(50)
  })

  it('a execução não se esconde atrás de um resultado do MESMO degrau', () => {
    // O fluxo normal: ver a estimativa e confirmar aquele degrau em modo
    // completo. `melhorPorDegrau` colapsa os dois no mais confiável — a
    // estimativa publicada —, e a rodada em voo desaparecia do mapa. Por isso o
    // bloqueio olha os pontos CRUS.
    const pontos = [
      ponto({ degrau: 20, runId: 'estimativa', estimativa: true }),
      semResultado({ degrau: 20, runId: 'completa', status: 'RODANDO' }),
    ]
    expect(melhorPorDegrau(pontos).get(20)?.runId).toBe('estimativa')
    expect(emVooDaBase(pontos)?.ponto.runId).toBe('completa')
  })

  it('a rodada base nunca é o que está em voo', () => {
    // Ela vem como `degrau: 0` e sem KPIs enquanto o `meta` não chega; contá-la
    // travaria o painel antes de qualquer disparo.
    expect(emVooDaBase([semResultado({ degrau: 0, runId: 'base', status: 'SUCESSO' })])).toBeNull()
  })

  it('com dois em voo, devolve o de MENOR degrau', () => {
    const pontos = [
      semResultado({ degrau: 40, runId: 'r40', status: 'RODANDO' }),
      semResultado({ degrau: 20, runId: 'r20', status: 'PENDENTE' }),
    ]
    expect(emVooDaBase(pontos)?.degrau).toBe(20)
  })
})

describe('o zero não é degrau', () => {
  it('a rodada base não entra na lista de degraus', () => {
    // O servidor devolve a base junto dos outros pontos, como `degrau: 0`. Sem
    // filtrá-la, ela entrava como se fosse um degrau executado: a tela contava a
    // base duas vezes, dava a curva por pronta com um ponto só e escondia o
    // teto — que é justamente a resposta de quem ainda não rodou nada.
    const melhor = melhorPorDegrau([ponto({ degrau: 0, runId: 'base' })])
    const s = situacaoDaVarredura(melhor, PADRAO)
    expect(s.map((x) => x.degrau)).toEqual([10, 20, 30, 40, 50])
    expect(s.every((x) => x.estado === 'ausente')).toBe(true)
  })
})
