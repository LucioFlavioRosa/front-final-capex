/**
 * Formatacao pt-BR das telas de resultado.
 *
 * Duas regras do handoff que estao codificadas aqui, e nao espalhadas pelas
 * telas:
 *
 * 1. R$ SEM CENTAVOS nos agregados. Centavo em cima de R$ 168 milhoes e ruido —
 *    e pior, sugere uma precisao que a rodada nao tem.
 * 2. NULO VIRA "—", NUNCA 0. O caso que motivou: ocupacao de ETE com capacidade
 *    zero. "0%" afirma que a ETE esta vazia; a verdade e que a conta nao existe.
 *    Sao coisas diferentes e a tela nao pode confundi-las.
 */

const BRL = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 0,
})

const NUM1 = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

const INT = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 })

/** O tracao (em dash) de valor ausente. Um lugar so, para nao virar '-' aqui e '--' ali. */
export const VAZIO = '—'

function ausente(v: number | null | undefined): v is null | undefined {
  return v === null || v === undefined || Number.isNaN(v)
}

/** R$ 1.234.567 — agregados, sem centavos. */
export function brl(v: number | null | undefined): string {
  return ausente(v) ? VAZIO : BRL.format(v)
}

/**
 * R$ 168,1 Mi — para eixos e cards onde o numero cheio nao cabe.
 * Abaixo de 1 milhao cai para o formato cheio: "R$ 0,3 Mi" esconde a ordem de
 * grandeza de quem le rapido.
 */
export function brlMi(v: number | null | undefined): string {
  if (ausente(v)) return VAZIO
  if (Math.abs(v) < 1_000_000) return BRL.format(v)
  return `R$ ${NUM1.format(v / 1_000_000)} Mi`
}

/**
 * R$ 146,1 mi — SEMPRE em milhões, sem cair para o formato cheio.
 *
 * Existe ao lado de `brlMi`, e a diferença é o CONTEXTO de uso, não gosto:
 *
 *   `brlMi` é para valor SOLTO (KPI, célula de tabela, tooltip). Ali "R$ 0,3
 *   Mi" esconde a ordem de grandeza de quem lê rápido, então abaixo de um
 *   milhão ele mostra o número cheio.
 *
 *   `brMi` é para valor numa SÉRIE comparável — rótulo sobre a barra da
 *   fluxo de escoamento, coluna de CAPEX da lista por componente. Ali a régua tem de ser a
 *   mesma para todas as linhas: uma lista que alterna "R$ 2,0 mi" e
 *   "R$ 900.000" obriga o leitor a converter de cabeça para comparar duas
 *   linhas vizinhas, e é exatamente a comparação que a lista existe para
 *   permitir.
 */
export function brMi(v: number | null | undefined): string {
  if (ausente(v)) return VAZIO
  const mi = v / 1_000_000
  return `${mi < 0 ? '−R$ ' : 'R$ '}${NUM1.format(Math.abs(mi))} mi`
}

/**
 * O mesmo em milhões, mas só o número com sinal — "+7,2" / "−404,9".
 * É o rótulo sobre a barra do fluxo de escoamento: a unidade já está no subtítulo do
 * quadro, e repetir "R$ … mi" seis vezes sobre seis barras vizinhas empasta a
 * leitura que o rótulo deveria facilitar.
 */
export function sinalMi(v: number | null | undefined): string {
  if (ausente(v)) return VAZIO
  const mi = v / 1_000_000
  const sinal = mi > 0 ? '+' : mi < 0 ? '−' : ''
  return `${sinal}${NUM1.format(Math.abs(mi))}`
}

/** 94,1% — percentuais com 1 casa, como o handoff pede. */
export function pct(v: number | null | undefined): string {
  return ausente(v) ? VAZIO : `${NUM1.format(v)}%`
}

/**
 * A OCUPAÇÃO DE UMA ETE, MARCADA QUANDO PASSA DE 100% (defeito X-02, achado
 * revisando os prints de 26/08 — um print mostrava 2.734,2%).
 *
 * `ocupacaoPct` é `vazaoConectada ÷ capacidadeInstalada`, e as duas vêm de
 * `otim_sistema` sem restrição alguma ligando uma à outra — nada no banco
 * impede que a vazão publicada exceda a capacidade publicada. Isso não é um
 * plano onde a ETE afoga: é sinal de que as duas colunas divergiram na
 * geração do dado (confirmado: acontece na base sintética de demonstração,
 * onde capacidade e vazão são geradas de forma independente).
 *
 * `texto` continua mostrando o número real — escondê-lo esconderia o próprio
 * defeito que a tela existe para expor. `inconsistente` é o que diferencia:
 * quem renderiza decide a cor e o aviso a partir dele, sem duplicar o corte
 * de 100% em cada tela que mostra ocupação.
 */
export function ocupacaoEte(v: number | null | undefined): { texto: string; inconsistente: boolean } {
  if (ausente(v)) return { texto: VAZIO, inconsistente: false }
  return { texto: pct(v), inconsistente: v > 100 }
}

/** 209,7 L/s — vazao com 1 casa. */
export function vazao(v: number | null | undefined): string {
  return ausente(v) ? VAZIO : `${NUM1.format(v)} L/s`
}

/**
 * "5,5k" · "1,2M" · "119" — o numero mais curto que ainda diz a ordem de grandeza.
 *
 * Existe para o ROTULO SOBRE A BARRA de um grafico pequeno, e o requisito e
 * largura: no card do panorama de componentes cada barra tem ~25px de faixa, e
 * so um rotulo de ate quatro caracteres cabe ali sem encostar no vizinho. Por
 * isso "k"/"M" colados e sem espaco, ao contrario de `brMi` — que e para uma
 * COLUNA de valores lidos linha a linha, onde a regua tem de ser a mesma e a
 * unidade por extenso vale o espaco que ocupa.
 *
 * O sufixo vai em cada valor, e nao uma vez no eixo, justamente porque aqui
 * nao ha eixo: o card nao desenha marcas em Y. Cada rotulo tem de se explicar
 * sozinho.
 *
 * Nao carrega "R$": a unidade esta no rodape do card ("max R$ 1.234.567/m"), e
 * repeti-la sobre doze barras vizinhas empasta a leitura que o rotulo deveria
 * facilitar — a mesma razao de `sinalMi` no fluxo de escoamento.
 */
export function compacto(v: number | null | undefined): string {
  if (ausente(v)) return VAZIO
  const abs = Math.abs(v)
  if (abs >= 1_000_000) {
    return `${abs >= 10_000_000 ? INT.format(v / 1_000_000) : NUM1.format(v / 1_000_000)}M`
  }
  if (abs >= 1_000) {
    return `${abs >= 10_000 ? INT.format(v / 1_000) : NUM1.format(v / 1_000)}k`
  }
  return INT.format(v)
}

/** 1.234 — contagens. */
export function inteiro(v: number | null | undefined): string {
  return ausente(v) ? VAZIO : INT.format(v)
}

/** "28 de 31" — o par construidas/total, que aparece em varios cards. */
export function deTotal(
  parte: number | null | undefined,
  total: number | null | undefined,
): string {
  if (ausente(parte) || ausente(total)) return VAZIO
  return `${INT.format(parte)} de ${INT.format(total)}`
}

/** 05/08/2026 14:32 — data/hora do card do historico. */
export function dataHora(iso: string | null | undefined): string {
  if (!iso) return VAZIO
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return VAZIO
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d)
}

/**
 * 05/08 14:32 — data curta, para desempatar rodadas na mesma linha.
 *
 * Existe por causa da regra da §2.1 do CONTRATO: reexecutar gera rodada NOVA, entao
 * o historico passa a ter entradas com o mesmo nome e parametros quase iguais. Num
 * seletor que mostra so o nome, elas ficam indistinguiveis — e trocar de rodada as
 * cegas num app de decisao de investimento e pior que nao poder trocar.
 */
export function dataCurta(iso: string | null | undefined): string {
  if (!iso) return VAZIO
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return VAZIO
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d)
}

/** "1m 40s" — tempo de solver; segundos crus ficam ilegiveis acima de 2 minutos. */
export function duracao(segundos: number | null | undefined): string {
  if (ausente(segundos)) return VAZIO
  if (segundos < 60) return `${INT.format(segundos)}s`
  const min = Math.floor(segundos / 60)
  const s = Math.round(segundos % 60)
  return s === 0 ? `${min}m` : `${min}m ${s}s`
}
