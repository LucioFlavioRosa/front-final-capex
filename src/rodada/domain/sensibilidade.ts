/**
 * A ANÁLISE DE SENSIBILIDADE — "e se eu investir mais CAPEX por ano?".
 *
 * A pergunta é: com +10%, +20%… de orçamento por ano, quanto a cobertura sobe,
 * quantas metas passam a ser cumpridas, e o que acontece com o VPL. A resposta
 * vem em duas camadas, e a ordem entre elas é o desenho inteiro.
 *
 * ## Primeiro o TETO, que não custa nada
 *
 * Antes de qualquer execução, o servidor já sabe dizer quanto dinheiro a mais
 * poderia comprar NO MELHOR CASO — quantas das sub-bacias fora do plano cabem na
 * folga, ignorando precedência, ETE e janela. É um limite superior de verdade
 * (relaxar restrição só aumenta o ótimo), então ele serve para DESCARTAR: se com
 * +50% cabem quatro sub-bacias de mil, ninguém precisa gastar cinco execuções
 * para descobrir que a curva é plana.
 *
 * ## Depois os PONTOS, que são simulações
 *
 * Não dá para estimar a curva a partir de uma rodada só, e é o ponto que decide
 * o resto: a resposta do otimizador não é suave no orçamento — é um MILP com
 * precedência, janela e meta, então dez por cento a mais pode destravar uma
 * cadeia inteira ou não mover nada. Interpolar produziria um número plausível e
 * errado numa tela de decisão de CAPEX.
 *
 * O que dá para baratear é o TEMPO DE SOLVER, e é o que o modo rápido faz: a
 * mesma otimização, com os mesmos dados e as mesmas restrições, com teto de 60s
 * em vez de 1000s. A inclinação da curva aparece muito antes da prova de
 * otimalidade. Por isso a estimativa é marcada na tela e fica fora do histórico —
 * ela orienta, não decide.
 *
 * ## A linhagem vem do SERVIDOR
 *
 * Os pontos saem de `GET /runs/{id}/sensibilidade`, que os encontra por
 * `run_request.base_run_id`. A versão anterior escrevia o degrau no rótulo da
 * rodada e o lia de volta com uma expressão regular — o rótulo é livre, então
 * renomear desmanchava a curva em silêncio, e uma variação que o backend
 * deduplicou sob outro nome nunca era encontrada.
 */

/**
 * A FAIXA PADRÃO da varredura, em % a mais de CAPEX por ano.
 *
 * Padrão, e não regra: "quanto a mais é plausível" é decisão de negócio e muda
 * por unidade — uma concessão em fim de ciclo discute +5% a +15%, e uma curva de
 * +10% a +50% ali gasta cinco execuções para responder fora do intervalo que
 * importa.
 */
export const FAIXA_PADRAO = { de: 10, ate: 50, pontos: 5 } as const

/** Quantos pontos uma varredura pode ter. */
export const MINIMO_DE_PONTOS = 2
export const MAXIMO_DE_PONTOS = 5

/** O maior acréscimo aceito — acima disso a pergunta vira "outro plano". */
export const MAIOR_DEGRAU = 200

export interface Faixa {
  de: number
  ate: number
  pontos: number
}

/**
 * Os degraus de uma varredura: `pontos` valores de `de` até `ate`.
 *
 * AS DUAS PONTAS SEMPRE ENTRAM — são elas que a pessoa escolheu, e os
 * intermediários existem para mostrar o que acontece no meio. Uma varredura que
 * não passasse pelos extremos responderia outra pergunta.
 *
 * INTEIROS, e repetidos são descartados. O degrau é a IDENTIDADE do ponto na
 * curva: é por ele que a tela casa a rodada que voltou com a coluna do gráfico.
 * Fracionário, essa identidade passaria a depender de dois arredondamentos
 * concordarem — o do servidor ao ler o fator gravado e o do cliente ao planejar
 * o ponto —, e um centésimo de diferença faria o ponto sumir do gráfico com a
 * rodada pronta no banco.
 *
 * O preço é faixa estreita render menos pontos que os pedidos: de 10 a 12 em
 * cinco daria 10, 10,5, 11, 11,5, 12, e sobram três inteiros. Devolver três é o
 * certo — rodar duas vezes o mesmo orçamento gastaria cluster para desenhar o
 * mesmo ponto duas vezes. **A tela mostra quantos vão rodar de verdade**, e é
 * a mesma conta do backend (`dominio/teto.pontos_da_faixa`).
 */
export function pontosDaFaixa({ de, ate, pontos }: Faixa): number[] {
  if (pontos < MINIMO_DE_PONTOS || pontos > MAXIMO_DE_PONTOS) return []
  if (de < 1 || ate <= de || ate > MAIOR_DEGRAU) return []
  const passo = (ate - de) / (pontos - 1)
  const brutos = Array.from({ length: pontos }, (_, i) => Math.round(de + passo * i))
  return [...new Set(brutos)]
}

/** A faixa faz sentido? A tela usa para recusar antes de pedir ao servidor. */
export function faixaValida(f: Faixa): boolean {
  return pontosDaFaixa(f).length >= MINIMO_DE_PONTOS
}

/** Quantas obras de um componente a rodada construiu. */
export interface ObrasDoComponente {
  componente: string
  /** O rótulo legível — vem do servidor, que é dono do vocabulário. */
  nome: string
  construidas: number
}

/** Um ponto da curva, como o servidor o devolve. */
export interface PontoDaCurva {
  /** 0 é a rodada base — o ponto de partida da curva, não um degrau. */
  degrau: number
  runId: string
  /** `PENDENTE` | `RODANDO` | `SUCESSO` | `ERRO` | `CANCELADA`. */
  status: string
  /** Rodada de modo rápido: solver de 60s, fora do histórico. */
  estimativa: boolean
  vpl: number | null
  coberturaFimPct: number | null
  metasAtingidas: number | null
  metasTotal: number | null
  capexTotal: number | null
  tempoS: number | null
  /** O motivo da falha, quando `status` é ERRO. A frase costuma dizer o que fazer. */
  erro?: string | null
  /** Vazia enquanto a rodada não publicou: não há plano ainda. */
  obras: ObrasDoComponente[]
}

export interface DegrauDoTeto {
  degrau: number
  /** O dinheiro A MAIS deste degrau — não o orçamento novo. */
  folga: number
  subbaciasNoMaximo: number
  vazaoNoMaximo: number
}

export interface TetoDeSensibilidade {
  /** A SOMA DOS ANOS, e não o valor anual — ver `dinheiroDoDegrau`. */
  orcamentoTotal: number
  /** Quantos anos têm orçamento maior que zero. Entra no rótulo do dinheiro. */
  anosDoPlano: number
  subbaciasFora: number
  /** Presas por outra coisa que não dinheiro — fora da conta, dentro do relato. */
  subbaciasSemCapexProprio: number
  capexParaTodas: number
  vazaoTotalPresa: number
  degraus: DegrauDoTeto[]
}

export interface Sensibilidade {
  teto: TetoDeSensibilidade | null
  pontos: PontoDaCurva[]
}

/** Em que pé está cada degrau da varredura. */
export type EstadoDoDegrau = 'ausente' | 'em voo' | 'pronto' | 'erro'

const EM_VOO = new Set(['PENDENTE', 'RODANDO'])

/**
 * Os únicos status que significam FRACASSO. Todo o resto é rodada que terminou.
 *
 * A lista é a dos que falham, e não a dos que dão certo, de propósito: o
 * vocabulário do backend cresce, e a régua ao contrário transformaria cada
 * status novo num erro inventado. Foi assim que uma rodada concluída cujos KPIs
 * ainda não tinham chegado apareceu na tela como "erro".
 */
const FRACASSO = new Set(['ERRO', 'CANCELADA'])

const temResultado = (p: PontoDaCurva) => p.vpl !== null && p.coberturaFimPct !== null

/**
 * Quando um degrau tem mais de uma rodada, qual delas vale.
 *
 * ACONTECE E É DESEJÁVEL: rodar a estimativa rápida e depois a simulação
 * completa do mesmo degrau é o fluxo normal — a primeira diz se vale a pena, a
 * segunda confirma. E uma tentativa que falhou não some do banco.
 *
 * A ordem de preferência é a da CONFIANÇA, não a do relógio:
 *
 *   1. simulação completa com resultado — a resposta definitiva
 *   2. estimativa com resultado — orienta, e é melhor que nada no gráfico
 *   3. rodada em voo — ainda vai responder
 *   4. rodada que falhou — só sobra ela
 *
 * Pelo relógio, uma estimativa rápida rodada DEPOIS apagaria a simulação
 * completa do gráfico, que é exatamente a troca errada: o número menos confiável
 * substituindo o mais confiável porque chegou por último.
 */
function confianca(p: PontoDaCurva): number {
  if (temResultado(p)) return p.estimativa ? 3 : 4
  if (FRACASSO.has(p.status)) return 1
  return 2
}

/** A melhor rodada de cada degrau. */
export function melhorPorDegrau(pontos: PontoDaCurva[]): Map<number, PontoDaCurva> {
  const melhor = new Map<number, PontoDaCurva>()
  for (const p of pontos) {
    const atual = melhor.get(p.degrau)
    if (!atual || confianca(p) > confianca(atual)) melhor.set(p.degrau, p)
  }
  return melhor
}

export interface SituacaoDoDegrau {
  degrau: number
  ponto: PontoDaCurva | null
  estado: EstadoDoDegrau
}

/**
 * A SITUAÇÃO DE CADA DEGRAU — o que a tela oferece e o que ela bloqueia.
 *
 * `em voo` bloqueia disparar outro: a fila tem CAPACIDADE 1, e pedir o segundo
 * não o faz chegar antes — só faz a espera parecer maior. `erro` NÃO bloqueia, e
 * é o caso que "sem resultado = em voo" quebraria: uma rodada que falhou nunca
 * vai publicar, então ela travaria o botão para sempre.
 */
export function situacaoDaVarredura(
  melhor: Map<number, PontoDaCurva>,
  degraus: readonly number[],
): SituacaoDoDegrau[] {
  // SÓ OS DEGRAUS PEDIDOS. A faixa é a pergunta, e ponto fora dela é resposta de
  // outra.
  //
  // A versão anterior somava os degraus JÁ EXECUTADOS aos pedidos, com o
  // argumento de que aquelas rodadas existem e custaram cluster. O argumento era
  // verdadeiro e a conclusão errada: numa base que já tinha rodado +10% a +50%,
  // pedir "de 5 a 20 em 4 pontos" devolvia +5% +10% +15% +20% +30% +40% +50% —
  // o cenário antigo de volta, com o controle de faixa parecendo ignorado. Duas
  // análises no mesmo gráfico não são uma análise mais completa; são duas
  // perguntas somadas.
  //
  // O que rodou não se perde: continua no banco e reaparece assim que a faixa o
  // cobrir de novo. E a tela diz quantos pontos ficaram de fora, para a
  // diferença ser informação e não sumiço.
  return degraus.map((degrau) => {
    const p = melhor.get(degrau) ?? null
    const estado: EstadoDoDegrau = !p
      ? 'ausente'
      : FRACASSO.has(p.status)
        ? 'erro'
        : // A ORDEM DESTAS PERGUNTAS É O DESENHO. O status decide primeiro; os
          // KPIs só separam "terminou e já dá para ler" de "terminou e ainda
          // está chegando". Perguntar pelos KPIs antes fazia toda rodada
          // concluída cujo resultado ainda não tinha chegado cair no ramo do
          // erro — e como ela nunca volta a ser PENDENTE, ficava assim para
          // sempre.
          EM_VOO.has(p.status) || !temResultado(p)
          ? 'em voo'
          : 'pronto'
    return { degrau, ponto: p, estado }
  })
}

/**
 * A rodada desta base que está em voo agora — no máximo uma, por desenho.
 *
 * É ela que BLOQUEIA o disparo do próximo, e o bloqueio é separado de
 * `proximoDegrau` de propósito: "qual é o próximo" e "dá para pedir agora" são
 * duas perguntas, e juntá-las esconderia a segunda. A fila tem capacidade 1;
 * enfileirar o segundo pedido não o faz chegar antes, só faz a espera parecer
 * maior — e cinco pedidos de uma vez foi o que saturou o Service Bus e devolveu
 * 503 na primeira tentativa real.
 *
 * OLHA TODOS OS DEGRAUS DA BASE, e não só os da faixa pedida. A diferença é
 * exatamente o defeito que a filtragem por faixa introduziu: quem dispara +50%,
 * estreita a faixa para 5–20 e clica de novo teria DOIS pedidos numa fila de
 * capacidade 1 — o disparo em voo some da lista, e com ele o bloqueio.
 *
 * A regra é a da FILA, e não a da pergunta: a fila não sabe qual faixa está na
 * tela.
 *
 * RECEBE OS PONTOS CRUS, e não o mapa de `melhorPorDegrau`. O mapa colapsa cada
 * degrau no ponto mais confiável, e é aí que a execução se esconde: com a
 * estimativa de +20% publicada e a simulação completa do MESMO +20% ainda
 * rodando, o mapa devolve a estimativa e a rodada em voo desaparece. O painel
 * então liberaria +30% com a fila ocupada — e confirmar um degrau em modo
 * completo depois de ver a estimativa é o fluxo NORMAL, não um caso de canto.
 */
export function emVooDaBase(
  pontos: PontoDaCurva[],
): { degrau: number; ponto: PontoDaCurva } | null {
  const voando = pontos
    .filter((p) => p.degrau > 0 && !FRACASSO.has(p.status) && !temResultado(p))
    .sort((a, b) => a.degrau - b.degrau)
  const p = voando[0]
  return p ? { degrau: p.degrau, ponto: p } : null
}

/** O próximo degrau a disparar: o menor que falta — inclusive um que falhou. */
export function proximoDegrau(situacao: { degrau: number; estado: EstadoDoDegrau }[]) {
  return situacao.find((s) => s.estado === 'ausente' || s.estado === 'erro')?.degrau ?? null
}

/** O fator que o backend espera: 10% vira 1.1. */
export const fatorDoDegrau = (degrau: number) => 1 + degrau / 100

/**
 * A curva só se lê com pelo menos dois pontos publicados — a base e um degrau.
 *
 * Com um ponto só não há inclinação, e desenhar um ponto solto sugeriria que a
 * análise terminou.
 */
export function curvaPronta(pontos: PontoDaCurva[]): boolean {
  return pontos.filter(temResultado).length >= 2
}

/**
 * Quantas vezes o orçamento atual seria preciso para trazer TODAS as que ficaram
 * de fora. É a frase que põe o teto em escala: "18× o orçamento" diz mais do que
 * "R$ 1,96 bi" para quem escolhe entre +10% e +20%.
 */
export function vezesOOrcamento(teto: TetoDeSensibilidade): number | null {
  if (!teto.orcamentoTotal) return null
  return teto.capexParaTodas / teto.orcamentoTotal
}


/**
 * O QUE O DEGRAU CUSTA, EM DINHEIRO.
 *
 * "+10%" não é uma quantia, e quem decide orçamento decide em reais. A conta é
 * trivial e é justamente por isso que ela mora aqui: espalhada por chip, botão,
 * tabela e tooltip, ela viraria quatro lugares para o mesmo arredondamento
 * divergir.
 *
 * `orcamentoBase` é o TOTAL DO PLANO (a soma dos anos), que é como
 * `otim_meta.orcamento_total` o grava — então `aMais` é o dinheiro a mais no
 * plano inteiro, e não por ano. A distinção precisa aparecer no rótulo da tela:
 * "+10% ao ano" e "R$ 11,0 Mi a mais" são a mesma decisão contada de dois
 * jeitos, e trocar um pelo outro erra por um fator igual ao número de anos.
 */
export function dinheiroDoDegrau(
  orcamentoBase: number,
  degrau: number,
): { aMais: number; novoTotal: number } {
  const aMais = (orcamentoBase * degrau) / 100
  return { aMais, novoTotal: orcamentoBase + aMais }
}

export interface CelulaDeObras {
  degrau: number
  construidas: number
  /** Diferença para o plano de hoje. PODE SER NEGATIVA — ver `comparativoDeObras`. */
  delta: number
}

export interface LinhaDeObras {
  nome: string
  hoje: number
  celulas: CelulaDeObras[]
}

export interface ComparativoDeObras {
  /** Os componentes, na ordem canônica do servidor (montante → jusante). */
  componentes: string[]
  /** Um registro por degrau publicado, pronto para a barra empilhada. */
  porDegrau: (Record<string, number> & {
    degrau: number
    rotulo: string
    total: number
    delta: number
    estimativa: boolean
  })[]
  linhas: LinhaDeObras[]
  totalHoje: number
}

/**
 * QUANTAS OBRAS DE CADA TIPO O DINHEIRO A MAIS COMPRA.
 *
 * A pergunta que a curva não responde: ela diz que a cobertura sobe 0,4 ponto,
 * e não diz o que foi construído para isso. Aqui a resposta é física — mais
 * dois troncos, mais um módulo de ETE —, que é a forma em que a operação
 * consegue discutir o plano.
 *
 * ## O delta PODE SER NEGATIVO, e escondê-lo seria mentir
 *
 * Com mais orçamento o otimizador não apenas acrescenta: ele REARRANJA. Nos
 * dados desta unidade, +10% constrói uma rede coletora A MENOS e um tronco a
 * mais — trocou capilaridade por transporte, porque destravar a cadeia rende
 * mais vazão por real. Clampar em zero, ou chamar a coluna de "obras a mais" e
 * mostrar só as positivas, esconderia exatamente a informação que explica a
 * curva.
 *
 * ## Componente ausente num degrau vale ZERO, e não "não existe"
 *
 * O servidor omite componente sem obra (um "ETE: 0" ao lado de "ETE (módulo):
 * 23" leria como recusa, e não como representação). Aqui a omissão precisa
 * virar zero: sem isso a barra empilhada perderia um pedaço em um degrau e não
 * em outro, e a comparação entre colunas — que é o assunto do quadro — passaria
 * a comparar coisas diferentes.
 *
 * Só entram pontos COM RESULTADO. Um degrau em execução não tem plano, e uma
 * coluna de zeros no meio da série seria lida como "com mais dinheiro, nada é
 * construído".
 */
export function comparativoDeObras(pontos: PontoDaCurva[]): ComparativoDeObras | null {
  // PELO RESULTADO, e não por ter obras.
  //
  // Era `p.obras.length > 0`, e a diferença aparece num caso que existe: uma
  // rodada publicada que não construiu NADA devolve `obras: []`, igualzinho a
  // uma que ainda não publicou. Se essa rodada for a base — plano de hoje sem
  // obra nenhuma, orçamento apertado —, ela sumia da lista, o `find` do degrau 0
  // não achava nada, e o quadro inteiro desaparecia. Justamente quando ele teria
  // mais a dizer: partindo de zero, tudo o que o dinheiro a mais compra é ganho.
  const publicados = pontos.filter(temResultado).sort((a, b) => a.degrau - b.degrau)
  const base = publicados.find((p) => p.degrau === 0)
  // Sem a rodada de hoje não existe "a mais": o quadro inteiro é comparação.
  if (!base || publicados.length < 2) return null

  const componentes: string[] = []
  for (const p of publicados) {
    for (const o of p.obras) if (!componentes.includes(o.nome)) componentes.push(o.nome)
  }
  // NENHUM ponto construiu nada, em nenhum degrau. Aí não há o que comparar, e o
  // gráfico seria seis colunas de altura zero sob um título que promete obras.
  // As curvas acima já dizem que nada muda.
  if (componentes.length === 0) return null

  const contagem = (p: PontoDaCurva, nome: string) =>
    p.obras.find((o) => o.nome === nome)?.construidas ?? 0

  const totalDe = (p: PontoDaCurva) => p.obras.reduce((s, o) => s + o.construidas, 0)
  const totalHoje = totalDe(base)

  return {
    componentes,
    porDegrau: publicados.map((p) => {
      const linha = {
        degrau: p.degrau,
        rotulo: p.degrau === 0 ? 'hoje' : `+${p.degrau}%`,
        total: totalDe(p),
        delta: totalDe(p) - totalHoje,
        estimativa: p.estimativa,
      } as ComparativoDeObras['porDegrau'][number]
      for (const nome of componentes) linha[nome] = contagem(p, nome)
      return linha
    }),
    linhas: componentes.map((nome) => ({
      nome,
      hoje: contagem(base, nome),
      celulas: publicados
        .filter((p) => p.degrau > 0)
        .map((p) => ({
          degrau: p.degrau,
          construidas: contagem(p, nome),
          delta: contagem(p, nome) - contagem(base, nome),
        })),
    })),
    totalHoje,
  }
}


/**
 * A ESTIMATIVA FALHOU POR FALTA DE TEMPO DE SOLVER?
 *
 * O motor tem um defeito conhecido — documentado em
 * `dev/patches/motor_status_do_solver.md` no backend — que aparece quando o
 * solver não tem tempo para a janela pedida: o reparo do teto anual indexa uma
 * cidade que ficou sem coluna selecionada e a rodada morre. Nas unidades grandes
 * (8.079 obras, 9 anos de janela) os 60s do modo rápido bastam para provocá-lo;
 * nas menores a mesma variação fecha sem problema.
 *
 * Importa porque muda o que oferecer a quem clicou. "Tentar de novo" no mesmo
 * modo reproduz a falha e gasta cluster para chegar ao mesmo lugar; o caminho é
 * a simulação completa, que é o que a própria mensagem do motor sugere.
 *
 * Reconhecer pela FRASE é frágil e está dito: se a mensagem do backend mudar,
 * isto deixa de reconhecer e a tela volta a oferecer o mesmo modo — perde-se a
 * sugestão, não a correção. É o lado seguro de errar.
 */
export function faltouTempoDeSolver(p: PontoDaCurva | null): boolean {
  if (!p || !p.estimativa || !p.erro) return false
  return /MAX_TIME_S maior|sem coluna selecionada/i.test(p.erro)
}


/**
 * Quantos pontos publicados ficam FORA da faixa pedida.
 *
 * Existe para a tela poder dizer "3 pontos fora desta faixa" em vez de
 * simplesmente não os mostrar. Some-se a isso que quem estreita a faixa acabou
 * de ver a leitura anterior: sem a frase, o desaparecimento pareceria perda.
 */
export function pontosForaDaFaixa(
  melhor: Map<number, PontoDaCurva>,
  degraus: readonly number[],
): number[] {
  const pedidos = new Set(degraus)
  return [...melhor.entries()]
        // `temResultado`, e não `vpl !== null`: publicar é um passo com partes, e um
    // ponto pela metade seria contado na frase como "já rodado" sem entrar na
    // curva, que usa o mesmo predicado.
    .filter(([degrau, p]) => degrau > 0 && !pedidos.has(degrau) && temResultado(p))
    .map(([degrau]) => degrau)
    .sort((a, b) => a - b)
}
