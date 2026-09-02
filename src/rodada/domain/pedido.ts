/**
 * AS VARIÁVEIS COM QUE A RODADA FOI PEDIDA.
 *
 * Vem de `controle.run_request.params` — o pedido, e não o que o motor ecoou.
 * São coisas diferentes: `otim_meta.params_extra` guarda cinco chaves que o job
 * escolheu devolver, e o pedido é o que a pessoa mandou pela tela.
 *
 * Complementa `parametros`, que traz seis campos tipados — os que o card do
 * histórico mostra. O formulário aceita mais de vinte, e quem abre "o que foi
 * usado nesta simulação" está tentando reproduzir ou explicar um resultado.
 */
export type Pedido = Record<string, unknown>

/**
 * Rótulos das chaves do pedido.
 *
 * A tela de simulação mostra o nome técnico ao lado de cada controle, porque a
 * rastreabilidade com o notebook é requisito. Aqui o rótulo humano acompanha o
 * técnico, e não o substitui: quem compara com o notebook precisa de um, quem lê
 * o histórico precisa do outro.
 */
const ROTULOS: Record<string, string> = {
  ORCAMENTO: 'Orçamento por ano',
  ORCAMENTO_TOTAL: 'Orçamento total',
  HORIZONTE_CAPEX: 'Horizonte de CAPEX',
  ETE_FASEADA: 'ETE faseada',
  ETE_FIXO: 'Módulos de ETE fixos',
  METAS_COBERTURA: 'Metas de cobertura',
  PESO_COBERTURA: 'Peso da cobertura',
  FOCO_COBERTURA: 'Objetivo',
  PENALIDADE_COBERTURA: 'Estratégia de cobertura',
  PESO_CIDADE: 'Prioridade por cidade',
  DATA_INICIO: 'Data de início',
  CURVA_ADOCAO: 'Curva de adoção',
  BASE_RECEITA: 'Base de receita',
  USAR_CTS: 'Coletores de tempo seco',
  COBERTURA_SO_RESIDENCIAL: 'Recorte da cobertura',
  ANOS_EXTRA_CONCLUSAO: 'Anos extras para concluir',
  INCLUIR_INDUSTRIAL: 'Incluir indústria',
  MAX_TIME_S: 'Tempo máximo do solver',
  WORKERS: 'Workers',
}

export function rotuloDoParametro(chave: string): string {
  return ROTULOS[chave] ?? chave
}

const MILHOES = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })
const NUM = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 4 })

/**
 * O valor como uma pessoa o lê.
 *
 * Três formas que o pedido usa e que `String(v)` estragaria:
 *
 *   booleano   `true` vira "sim" — "true" é vocabulário de máquina
 *   orçamento  `{2026: 60000000}` vira "2026: R$ 60 mi" — o JSON cru é
 *              ilegível, e é justamente o parâmetro mais consultado
 *   objeto     `{Cabo Frio: 5}` vira "Cabo Frio: 5"
 *
 * `{}` vira "—", e não "nenhum": prioridade vazia e prioridade não informada
 * são a mesma coisa no pedido, e afirmar qual delas foi seria inventar.
 */
/**
 * O OBJETIVO COMO A PESSOA O ESCOLHEU — "Cobertura", e não "1".
 *
 * `foco_cobertura` viaja como número de 0 a 1 porque é isso que o motor lê, e
 * durante um tempo esse número aparecia cru nas telas de resultado: "Objetivo
 * 1". Quem não montou a rodada não tem como saber se 1 é muito ou pouco, nem
 * para que lado ele puxa — e o rótulo estava ali do lado, nos três botões que
 * geraram o número.
 *
 * Os textos são LITERALMENTE os das pílulas da tela de simulação. Se um dia
 * mudarem lá, mudam aqui: é a mesma escolha, vista depois.
 *
 * O valor fora dos três presets não é escondido. O payload aceita qualquer
 * número entre 0 e 1, e um pedido montado fora da tela (script, API) pode
 * trazer 0,7 — chamá-lo só de "Equilíbrio" apagaria a diferença entre ele e o
 * 0,5 que alguém clicou. Então ali, e só ali, o número acompanha.
 */
export function rotuloObjetivo(v: number): string {
  if (v === 0) return 'Só VPL'
  if (v === 1) return 'Cobertura'
  if (v === 0.5) return 'Equilíbrio'
  return `Equilíbrio (${NUM.format(v)})`
}

export function valorDoParametro(chave: string, v: unknown): string {
  return segmentosDoParametro(chave, v).join(' · ')
}

/**
 * O MESMO VALOR, EM PEDAÇOS — para quem precisa quebrar linha.
 *
 * Um parâmetro de mapa (`ORCAMENTO` com 15 anos, `PESO_CIDADE` com 27 cidades)
 * vira uma frase longuíssima quando os pedaços são juntados. Numa célula de
 * tabela isso forçava rolagem horizontal do quadro inteiro — as células de
 * número são `whitespace-nowrap`, e com razão: "R$ 1.234,5" quebrado no meio
 * deixa de ser um número.
 *
 * A saída é não ter que escolher entre as duas coisas. Aqui os pedaços saem
 * separados, e quem desenha decide: uma linha só (`valorDoParametro`, que junta)
 * ou um grupo que quebra entre os pedaços e nunca DENTRO de um. Cada pedaço
 * continua atômico — "2026: R$ 60 mi" não se parte.
 *
 * Devolve sempre pelo menos um elemento, para nenhum chamador precisar tratar
 * lista vazia.
 */
export function segmentosDoParametro(chave: string, v: unknown): string[] {
  if (v === null || v === undefined || v === '') return ['—']
  if (chave === 'USAR_CTS' && typeof v === 'boolean') {
    return [v ? 'orçar à parte' : 'somar à sub-bacia']
  }
  if (chave === 'COBERTURA_SO_RESIDENCIAL' && typeof v === 'boolean') {
    return [v ? 'só residenciais' : 'todas as ligações']
  }
  if (typeof v === 'boolean') return [v ? 'sim' : 'não']

  if (chave === 'ORCAMENTO' && typeof v === 'object') {
    const anos = Object.entries(v as Record<string, number>)
    if (!anos.length) return ['—']
    return anos
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([ano, valor]) => `${ano}: R$ ${MILHOES.format(Number(valor) / 1e6)} mi`)
  }

  if (typeof v === 'object') {
    const itens = Object.entries(v as Record<string, unknown>)
    if (!itens.length) return ['—']
    return itens.map(([k, valor]) => `${k}: ${String(valor)}`)
  }

  if (typeof v === 'number') {
    // Valor em reais vira milhões; o resto vai como número mesmo. `1e6` como
    // corte porque orçamento é o único parâmetro dessa ordem de grandeza.
    if (chave.startsWith('ORCAMENTO') && v >= 1e6) return [`R$ ${MILHOES.format(v / 1e6)} mi`]
    // O objetivo é o único número do pedido que NÃO se lê como número.
    if (chave === 'FOCO_COBERTURA') return [rotuloObjetivo(v)]
    return [NUM.format(v)]
  }
  return [String(v)]
}

/**
 * As chaves do pedido em ordem de leitura, e não a do JSON.
 *
 * A ordem de um objeto JSON não significa nada. Esta é a do formulário: primeiro
 * o que define o cenário, depois o que ajusta a execução. Chave desconhecida vai
 * para o fim, em ordem alfabética — o job pode ganhar parâmetro novo, e escondê-lo
 * seria pior que mostrá-lo sem rótulo.
 */
const ORDEM = [
  'ORCAMENTO',
  'ORCAMENTO_TOTAL',
  'HORIZONTE_CAPEX',
  'ANOS_EXTRA_CONCLUSAO',
  'FOCO_COBERTURA',
  'PENALIDADE_COBERTURA',
  'METAS_COBERTURA',
  'PESO_COBERTURA',
  'PESO_CIDADE',
  'BASE_RECEITA',
  'CURVA_ADOCAO',
  'USAR_CTS',
  'COBERTURA_SO_RESIDENCIAL',
  'INCLUIR_INDUSTRIAL',
  'ETE_FASEADA',
  'ETE_FIXO',
  'DATA_INICIO',
  'MAX_TIME_S',
  'WORKERS',
]

export function ordenarParametros(pedido: Pedido): [string, unknown][] {
  const pos = (k: string) => {
    const i = ORDEM.indexOf(k)
    return i < 0 ? ORDEM.length : i
  }
  return Object.entries(pedido).sort(([a], [b]) => pos(a) - pos(b) || a.localeCompare(b))
}
