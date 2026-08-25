/**
 * HA QUANTO TEMPO a rodada espera, e quando esse tempo deixa de ser normal.
 *
 * Vive em `comum` porque as duas telas que mostram rodada em voo — o modal da
 * nova simulacao e o card do historico — precisam da MESMA regra. Duplicar a
 * conta faria as duas discordarem sobre a mesma rodada, e discordar sobre o
 * relogio e o tipo de divergencia que ninguem consegue explicar depois.
 */

/** Depois de quantos minutos parada a espera deixa de ser normal e vira aviso. */
export const MINUTOS_ATE_ESTRANHAR = 5

/**
 * `"há 3 min"` — quanto tempo a rodada existe.
 *
 * Sem isto, "esperando um executor" com dois segundos e com quarenta minutos são
 * a mesma frase, e o usuário não tem como distinguir lento de travado. Foi
 * exatamente a queixa: "esse gerenciamento não está eficiente, travando sempre".
 *
 * Segundos abaixo de um minuto, porque no começo a diferença entre 5s e 50s é o
 * que diz se algo está acontecendo.
 */
export function decorrido(pedidaEm: string | null | undefined, agora = Date.now()): string {
  if (!pedidaEm) return ''
  const inicio = new Date(pedidaEm).getTime()
  if (Number.isNaN(inicio)) return ''
  const seg = Math.max(0, Math.floor((agora - inicio) / 1000))
  if (seg < 60) return `há ${seg}s`
  const min = Math.floor(seg / 60)
  if (min < 60) return `há ${min} min`
  const h = Math.floor(min / 60)
  return `há ${h}h${String(min % 60).padStart(2, '0')}`
}

/** true quando a rodada está parada tempo demais para o silêncio ser normal. */
export function demorandoDemais(pedidaEm: string | null | undefined, agora = Date.now()): boolean {
  if (!pedidaEm) return false
  const inicio = new Date(pedidaEm).getTime()
  if (Number.isNaN(inicio)) return false
  return agora - inicio > MINUTOS_ATE_ESTRANHAR * 60_000
}
