/**
 * Formatacao pt-BR das telas de resultado.
 *
 * Tres regras que estao codificadas aqui, e nao espalhadas pelas telas:
 *
 * 1. DINHEIRO SEMPRE EM REAIS, SEM ABREVIACAO. Nao existe "R$ 168,1 Mi", "R$ 2,3
 *    bi" nem "5,5k" em lugar nenhum: todo valor sai por extenso, com separador de
 *    milhar — `R$ 168.123.456`. Decisao do dono do produto em 28/09/2026, depois
 *    de uma usuaria comparar a conta dela com a da simulacao e as duas parecerem
 *    ordens de grandeza diferentes. Abreviar economiza espaco cobrando atencao de
 *    quem le, e numa tela de decisao de investimento essa troca nao se paga.
 *    Antes daqui saiam `brlMi`, `brMi`, `sinalMi` e um `compacto` com "k"/"M".
 * 2. R$ SEM CENTAVOS nos agregados. Centavo em cima de R$ 168 milhoes e ruido —
 *    e pior, sugere uma precisao que a rodada nao tem.
 * 3. NULO VIRA "—", NUNCA 0. O caso que motivou: ocupacao de ETE com capacidade
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

const BRL_CENTAVOS = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const DECIMAL = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 4,
})

/**
 * R$ 392,11 — COM CENTAVOS, ao contrário de `brl`.
 *
 * A regra 2 lá de cima (sem centavos) vale para AGREGADO: centavo em cima de um
 * VPL é ruído. Aqui é o oposto — este formato é para número que o leitor
 * MULTIPLICA. Na lista de obras, `quantidade × preço unitário = CAPEX`, e a
 * conferência é feita à mão, na tela: arredondar as pontas quebra a identidade e
 * o número passa a não bater, que foi exatamente o defeito relatado em
 * 28/09/2026 (2.173 × 392 = 851.816, contra os 852.086 gravados).
 *
 * Use onde a conta tem de fechar; `brl` no resto.
 */
export function brlExato(v: number | null | undefined): string {
  return ausente(v) ? VAZIO : BRL_CENTAVOS.format(v)
}

/**
 * 2.173,08 — quantidade com as casas que ela tem, até quatro.
 *
 * `inteiro` NÃO serve aqui: ele arredonda, e uma EEE de 1,17 unidades vira "1".
 * Multiplicado pelo preço unitário, isso erra o CAPEX em 17%.
 */
export function decimal(v: number | null | undefined): string {
  return ausente(v) ? VAZIO : DECIMAL.format(v)
}

/**
 * R$ 1.234.567 com sinal — "+R$ 7.200.000" / "−R$ 404.900.000".
 *
 * E o rotulo sobre a barra do fluxo de escoamento, onde o que se le e a
 * CONTRIBUICAO de cada parcela: sem o sinal explicito, uma barra que tira
 * dinheiro fica indistinguivel de uma que poe.
 */
export function brlSinal(v: number | null | undefined): string {
  if (ausente(v)) return VAZIO
  const sinal = v > 0 ? '+' : v < 0 ? '−' : ''
  return `${sinal}${BRL.format(Math.abs(v))}`
}

/** 94,1% — percentuais com 1 casa, como o handoff pede. */
export function pct(v: number | null | undefined): string {
  return ausente(v) ? VAZIO : `${NUM1.format(v)}%`
}

/**
 * A OCUPAÇÃO DE UMA ETE, MARCADA QUANDO PASSA DE 100% — a base já produziu
 * 2.734,2%.
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
 * O NUMERO POR EXTENSO, com separador de milhar — era "5,5k"/"1,2M" ate 28/09/2026.
 *
 * Existe para o ROTULO SOBRE A BARRA de um grafico pequeno, e o requisito ERA
 * largura: no card do panorama de componentes cada barra tem ~25px de faixa. Sem
 * abreviacao o rotulo nao cabe na maioria das barras, e quem renderiza JA trata
 * isso — mede o texto contra a largura da barra e omite o que nao cabe, sempre
 * mantendo o da barra maior (ver `SecaoElementos`). Omitir e honesto; abreviar
 * nao era.
 *
 * Nao carrega "R$": a unidade esta no rodape do card, e repeti-la sobre doze
 * barras vizinhas empasta a leitura que o rotulo deveria facilitar.
 */
export function compacto(v: number | null | undefined): string {
  return ausente(v) ? VAZIO : INT.format(v)
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
 * Existe por causa da regra do CONTRATO: reexecutar gera rodada NOVA, entao
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
