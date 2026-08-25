/**
 * Parametros de uma nova rodada do otimizador.
 *
 * Tudo aqui e FUNCAO PURA — parser, derivacoes e validacao. E o que permite
 * travar as regras chatas (parsing pt-BR, janela derivada, o que bloqueia a
 * rodada) em teste unitario, sem montar tela.
 *
 * Os defaults vem do notebook de teste, e nao de gosto: sao os valores com que a
 * equipe roda hoje. Mudar um deles muda o resultado de quem so clicar "Iniciar".
 */

/** O orcamento e digitado e exibido em MILHOES; o payload vai em reais. */
export const MILHAO = 1_000_000

export type ModoOrcamento = 'ano' | 'unico'
/**
 * `ligacao` SAIU: penalizava por ligacao nao atendida, independente da meta — e a
 * decisao de produto e que a meta e sempre a referencia. O motor continua
 * entendendo o modo; a tela e que nao o oferece.
 */
export type Penalidade = 'meta+cobertura' | 'meta'
export type BaseReceita = 'arrecadada' | 'faturada'
export type CurvaAdocao = 'scurve' | 'linear'

/** Uma linha do cronograma: ano e verba, ambos como TEXTO enquanto se digita. */
export interface LinhaOrcamento {
  ano: string
  valor: string
}

export interface EstadoSimulacao {
  regionalId: string
  unidadeId: string
  nome: string
  modoOrcamento: ModoOrcamento
  orcamento: LinhaOrcamento[]
  /**
   * Modo "valor unico": o TOTAL do orcamento, nao a verba por ano.
   *
   * Ate a validacao de 18/08 este campo ERA a verba anual — decisao invertida
   * na reuniao: "a gente coloca e o valor total. E dai, qual o horizonte que a
   * gente vai gastar? Dai a gente divide por igual ao longo dos anos." Quem
   * digita pensa em "quanto tenho para o plano todo", nao em "quanto por ano".
   */
  orcamentoValor: string
  horizonte: string
  foco: string
  penalidade: Penalidade
  baseReceita: BaseReceita
  curvaAdocao: CurvaAdocao
  usarCts: boolean
  coberturaSoResidencial: boolean
  dataInicio: string
}

/**
 * Cronograma padrao do notebook (em milhoes). Nao e exemplo: e o cronograma com
 * que a equipe roda hoje.
 */
const ORCAMENTO_PADRAO: [number, number][] = [
  [2026, 60],
  [2027, 60],
  [2028, 50],
  [2029, 50],
  [2030, 50],
  [2031, 50],
  [2032, 40],
  [2033, 40],
  [2034, 30],
  [2035, 30],
  [2036, 30],
  [2037, 20],
  [2038, 20],
  [2039, 20],
  [2040, 10],
]

export function estadoInicial(): EstadoSimulacao {
  return {
    regionalId: '',
    unidadeId: '',
    nome: '',
    modoOrcamento: 'ano',
    orcamento: ORCAMENTO_PADRAO.map(([ano, v]) => ({ ano: String(ano), valor: String(v) })),
    orcamentoValor: '50',
    horizonte: '8',
    foco: '1',
    penalidade: 'meta+cobertura',
    baseReceita: 'arrecadada',
    curvaAdocao: 'scurve',
    usarCts: true,
    coberturaSoResidencial: false,
    dataInicio: '',
  }
}

/**
 * Numero em pt-BR, tolerando a notacao do notebook.
 *
 * A regra que resolve a ambiguidade do ponto: SE HA VIRGULA, o ponto e separador
 * de milhar (`1.234,5` = 1234.5). SE NAO HA, o ponto e decimal (`0.35` = 0.35).
 * Sem isso, `0.35` copiado do notebook viraria 35, e `1.234` digitado por um
 * brasileiro viraria 1.234 em vez de 1234.
 */
/** pt-BR: milhar com ponto, decimal com virgula. `1.234,5` · `1234,5` · `1234`. */
const PT_BR = /^-?(\d{1,3}(\.\d{3})+|\d+)(,\d+)?$/
/** Notacao do notebook: ponto decimal. `0.35` · `60.5` · `1234`. */
const NOTEBOOK = /^-?\d+(\.\d+)?$/

/**
 * Numero, ou `null` quando o texto NAO e um numero valido.
 *
 * Estrito de proposito. O projeto de cadastro ja pagou por um parser tolerante:
 * `parseFloat('123abc')` devolvia 123, e o lixo contaminava CAPEX em silencio.
 * Aqui o estrago seria pior — um `12abc` num ano de orcamento viraria verba de
 * R$ 12 milhoes que ninguem digitou.
 *
 * Aceita as DUAS notacoes porque o handoff exige: quem copia do notebook escreve
 * `0.35`, quem digita escreve `0,35`. A regra que desempata o ponto: com virgula
 * no texto, ponto e separador de milhar; sem virgula, ponto e decimal.
 */
export function numOuNulo(v: string | number): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const s = String(v).trim()
  if (s === '') return null
  const ok = s.includes(',') ? PT_BR.test(s) : NOTEBOOK.test(s) || PT_BR.test(s)
  if (!ok) return null
  const n = Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s)
  return Number.isFinite(n) ? n : null
}

/** O mesmo parser, com 0 no lugar de `null` — para somas e derivacoes. */
export function num(v: string | number): number {
  return numOuNulo(v) ?? 0
}

export interface DerivadoOrcamento {
  /** Verba de cada ano, em milhoes, na ordem do cronograma. */
  valores: number[]
  /** Soma, em milhoes. */
  total: number
  /** Anos que efetivamente recebem verba, ordenados. */
  anosComVerba: number[]
  /** "2026–2033 (8 anos)" — a janela e DERIVADA, nunca digitada. */
  janelaTexto: string
  /** Maior verba anual; e o default do teto de execucao. */
  pico: number
}

/**
 * Derivacoes do orcamento.
 *
 * A janela de CAPEX NAO e um campo: ela e o intervalo dos anos com verba. Deixar
 * o usuario digitar a janela E o cronograma criaria duas fontes para a mesma
 * verdade, e elas divergiriam no primeiro ano zerado.
 */
export function derivarOrcamento(e: EstadoSimulacao): DerivadoOrcamento {
  let valores: number[]
  let anosComVerba: number[]

  if (e.modoOrcamento === 'ano') {
    valores = e.orcamento.map((l) => num(l.valor))
    anosComVerba = e.orcamento
      .filter((l) => num(l.valor) > 0)
      .map((l) => num(l.ano))
      .sort((a, b) => a - b)
  } else {
    const anos = Math.max(0, Math.round(num(e.horizonte)))
    // `orcamentoValor` e o TOTAL do plano; a verba por ano e ele dividido pelo
    // horizonte, igualmente — a divisao que a reuniao de 18/08 pediu.
    const porAno = anos > 0 ? num(e.orcamentoValor) / anos : 0
    valores = Array<number>(anos).fill(porAno)
    const base = num(e.orcamento[0]?.ano) || new Date().getFullYear()
    anosComVerba = porAno > 0 ? Array.from({ length: anos }, (_, i) => base + i) : []
  }

  const total = valores.reduce((a, b) => a + b, 0)
  const janelaTexto = anosComVerba.length
    ? `${anosComVerba[0]}–${anosComVerba[anosComVerba.length - 1]} (${anosComVerba.length} anos)`
    : 'sem verba'

  return { valores, total, anosComVerba, janelaTexto, pico: Math.max(0, ...valores) }
}

/** Rotulo do foco, para o usuario ler o numero sem precisar interpretar. */
export function rotuloFoco(v: number): string {
  if (v === 0) return 'só VPL'
  if (v === 1) return 'cobertura em 1º lugar'
  // A tela oferece TRES escolhas (0 · 0,5 · 1), entao so estes tres rotulos
  // ocorrem. Havia "puxando para VPL" e "puxando para cobertura" para traduzir
  // valor digitado no meio da faixa — e a necessidade daquela traducao era o
  // sintoma de que o numero livre nao dizia nada a quem escolhia.
  //
  // O intervalo continua respondendo, e nao com string vazia: o payload aceita
  // qualquer valor entre 0 e 1, e um pedido montado fora da tela nao pode fazer
  // o resumo mentir por omissao.
  return 'equilíbrio'
}

export type Severidade = 'bloqueia' | 'avisa' | 'ok'

export interface ItemChecklist {
  severidade: Severidade
  texto: string
}

/**
 * Componente de obra que a ficha NAO tem — o que a tela nao teria como saber.
 *
 * Campo em branco a tela conta sozinha, a cada tecla (`subPend`/`ctsPend`), e o
 * usuario o encontra: ele esta la, destacado. Componente AUSENTE e de outra
 * natureza — a ficha chega do `GET` com quatro linhas em vez de cinco e nada diz
 * que havia uma quinta.
 *
 * Enquanto havia base literal, a tela preenchia a linha que faltava com numeros
 * de template e mostrava cinco. A base saiu (R1/R2), o `PUT` passou a RECUSAR a
 * ficha incompleta, e sem esta lista a pessoa levaria a recusa sem saber o que
 * corrigir — nem onde, ja que o conserto e no cadastro de origem.
 */
export interface ComponenteFaltando {
  /** `sub-bacia` ou `cts`. */
  tipo: string
  /** Id da ficha — e o que a pessoa procura no rail. */
  id: string
  /** Nome do componente, como o banco o chama. */
  componente: string
  /** Frase pronta do servidor, no padrao do `inconsistencias[]` de `GET /cts`. */
  detalhe: string
}

/**
 * Prontidao do cadastro da unidade — quem manda no bloqueio da rodada.
 *
 * NAO ha `tamanho` aqui, e a ausencia e deliberada. Ele existiu, o backend nunca
 * o implementou, e a linha do resumo simplesmente nao aparecia em producao. O
 * porte da unidade ja viaja em `Unidade.resumo` — no proprio registro da unidade,
 * que a tela carrega para montar o select. Dois contratos para o mesmo fato so
 * teriam divergido.
 */
export interface Prontidao {
  unidadeId: string
  unidadeNome: string
  pendencias: number
  /** Opcional: servidor antigo nao manda, e a tela nao pode quebrar por isso. */
  faltando?: ComponenteFaltando[]
}

/**
 * O checklist e a validacao da tela, na ordem em que o usuario preenche.
 *
 * Bloqueia (✕) so o que impede a rodada de existir: sem unidade, cadastro
 * incompleto, orcamento zerado. Tudo o mais avisa (!) — inclusive coisas que
 * mudam MUITO o resultado, como ignorar as metas. A diferenca importa: bloquear
 * uma escolha legitima porque ela e incomum treina o usuario a ignorar avisos.
 */
/** Quantas linhas de "falta o componente X" o checklist mostra antes de resumir. */
const MAX_FALTANDO = 5

/**
 * As frases de componente faltando, cortadas num numero que se le.
 *
 * Um cadastro recem-carregado pode ter dezenas, e trinta linhas vermelhas viram
 * uma parede que ninguem le — o efeito seria o oposto do pretendido. O corte
 * DIZ que cortou e quantas sobraram: silenciar as demais faria a pessoa corrigir
 * cinco e levar a mesma recusa de novo.
 */
export function resumirFaltando(faltando: ComponenteFaltando[] | undefined): string[] {
  const lista = faltando ?? []
  const frases = lista
    .slice(0, MAX_FALTANDO)
    .map((f) => `${f.tipo} ${f.id} — falta o componente ${f.componente} no cadastro.`)
  const resto = lista.length - frases.length
  if (resto > 0) {
    frases.push(
      `E mais ${resto} componente(s) faltando em outras fichas — a lista completa está em /prontidao.`,
    )
  }
  return frases
}

export function validar(e: EstadoSimulacao, prontidao: Prontidao | undefined): ItemChecklist[] {
  const itens: ItemChecklist[] = []
  const { total, anosComVerba } = derivarOrcamento(e)

  if (!e.unidadeId || !prontidao) {
    itens.push({ severidade: 'bloqueia', texto: 'Selecione a regional e a unidade.' })
  } else if (prontidao.pendencias > 0) {
    itens.push({
      severidade: 'bloqueia',
      texto: `${prontidao.unidadeNome} tem ${prontidao.pendencias} campos pendentes no cadastro — a simulação fica bloqueada até zerar.`,
    })
    // Uma linha POR COMPONENTE que falta, com ficha e nome. O total acima diz
    // quanto falta; estas dizem O QUE falta, e sao as unicas pendencias que a
    // pessoa nao consegue achar sozinha abrindo a ficha — a linha nem aparece la.
    for (const f of resumirFaltando(prontidao.faltando)) {
      itens.push({ severidade: 'bloqueia', texto: f })
    }
  } else {
    itens.push({
      severidade: 'ok',
      texto: `Cadastro de ${prontidao.unidadeNome} completo, sem pendências.`,
    })
  }

  // Linhas que o cronograma nao consegue enviar. BLOQUEIAM porque a alternativa
  // e pior: o rodape somaria um total que o payload nao contem, e o resumo — que
  // existe justamente para ser a conferencia final — estaria mentindo.
  if (e.modoOrcamento === 'ano') {
    const invalidas = e.orcamento.filter(
      (l) => numOuNulo(l.ano) === null || numOuNulo(l.valor) === null || num(l.valor) < 0,
    )
    if (invalidas.length > 0) {
      itens.push({
        severidade: 'bloqueia',
        texto: `${invalidas.length} linha(s) do cronograma com ano ou valor inválido — corrija antes de rodar.`,
      })
    }
    const anos = e.orcamento.map((l) => num(l.ano))
    const repetidos = [...new Set(anos.filter((a, i) => anos.indexOf(a) !== i))]
    if (repetidos.length > 0) {
      // Sem este bloqueio, dois cards de 2026 somariam no rodape mas so o ultimo
      // iria no payload — e a diferenca so apareceria no resultado da rodada.
      itens.push({
        severidade: 'bloqueia',
        texto: `Ano repetido no cronograma (${repetidos.join(', ')}) — só o último seria enviado.`,
      })
    }
  }

  if (total <= 0) {
    itens.push({
      severidade: 'bloqueia',
      texto: 'Informe verba em pelo menos um ano do orçamento.',
    })
  } else {
    itens.push({
      severidade: 'ok',
      texto: `Orçamento de R$ ${total.toLocaleString('pt-BR')} Mi distribuído em ${anosComVerba.length} anos.`,
    })
  }

  return itens
}

export function bloqueado(checklist: ItemChecklist[]): boolean {
  return checklist.some((c) => c.severidade === 'bloqueia')
}

/**
 * Corpo do `POST /runs`, na ordem em que o resumo da tela mostra.
 *
 * Duas conversoes acontecem aqui, e so aqui: milhoes viram reais, e os campos
 * vazios viram `null` em vez de 0 — `TETO_EXECUCAO_ANUAL` vazio significa "usa o
 * pico", que e diferente de "teto zero".
 */
export interface CorpoNovaRodada {
  unidade_id: string
  nome: string | null
  orcamento?: Record<string, number>
  orcamento_anual?: number
  horizonte_capex?: number
  foco_cobertura: number
  penalidade_cobertura: Penalidade
  base_receita: BaseReceita
  curva_adocao: CurvaAdocao
  usar_cts: boolean
  cobertura_so_residencial: boolean
  data_inicio: string | null
}

export function corpoDaRodada(e: EstadoSimulacao): CorpoNovaRodada {
  const base: CorpoNovaRodada = {
    unidade_id: e.unidadeId,
    nome: e.nome.trim() || null,
    foco_cobertura: Math.min(1, Math.max(0, num(e.foco))),
    penalidade_cobertura: e.penalidade,
    base_receita: e.baseReceita,
    curva_adocao: e.curvaAdocao,
    usar_cts: e.usarCts,
    cobertura_so_residencial: e.coberturaSoResidencial,
    data_inicio: e.dataInicio.trim() || null,
  }

  if (e.modoOrcamento === 'ano') {
    base.orcamento = Object.fromEntries(
      e.orcamento
        .filter((l) => num(l.valor) > 0)
        .map((l) => [String(Math.round(num(l.ano))), num(l.valor) * MILHAO] as const),
    )
  } else {
    const anos = Math.max(0, Math.round(num(e.horizonte)))
    // O motor so entende verba ANUAL constante — a divisao do total pelo
    // horizonte acontece aqui, antes do payload sair.
    base.orcamento_anual = anos > 0 ? (num(e.orcamentoValor) * MILHAO) / anos : 0
    base.horizonte_capex = anos
  }
  return base
}

/** Etapas do modal de progresso, na ordem em que o job as executa. */
const ETAPAS = [
  { ate: 20, texto: 'Lendo dados da unidade…' },
  { ate: 45, texto: 'Montando o modelo de otimização…' },
  { ate: 90, texto: 'Resolvendo (solver)…' },
  { ate: 100, texto: 'Materializando as tabelas de resultado…' },
] as const

/**
 * A etapa que o job está executando, pelo progresso.
 *
 * `naFila` existe porque PENDENTE **não é progresso zero** — é ausência de
 * execução. Sem ele, uma rodada que ainda não começou exibia "Lendo dados da
 * unidade…", afirmando uma atividade que não estava acontecendo e contradizendo,
 * na linha logo abaixo, o motivo da fila ("todas as vagas estão ocupadas").
 *
 * O texto daqui não repete o motivo: quem explica a espera é o bloco `fila`, que
 * é o único que conhece executores e posição. Este diz só que não começou.
 */
export function etapaDe(progresso: number, naFila = false): string {
  if (naFila) return 'Ainda não começou — está na fila.'
  if (progresso >= 100) return 'Concluída — disponível no histórico.'
  return ETAPAS.find((e) => progresso < e.ate)?.texto ?? ETAPAS[0].texto
}
