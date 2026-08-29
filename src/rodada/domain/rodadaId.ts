/**
 * O NOME CURTO DE UMA RODADA — e por que ele vem do FIM do id.
 *
 * O id é `run_20260814_153913_40e1e8` (ver `app/dominio/run_id.py` no backend):
 * prefixo, data, hora, e seis hexadecimais aleatórios. O aleatório existe porque
 * duas rodadas podem ser disparadas no mesmo segundo.
 *
 * A tela cortava com `runId.slice(0, 8)`, que devolve `run_2026` — IGUAL PARA
 * TODA RODADA DO ANO. O histórico exibia essa string em todas as linhas, ao lado
 * da data, como se identificasse alguma coisa. Não identificava nada, e é pior
 * que não mostrar: parece id, então duas rodadas diferentes pareciam a mesma.
 *
 * O que distingue é o sufixo. A data já aparece formatada ao lado em todos os
 * lugares onde o curto é usado, então repeti-la no código seria dizer duas vezes
 * a mesma coisa e ainda esconder a parte útil.
 */

/** `run_20260814_153913_40e1e8` → `40e1e8`. */
export function idCurtoDaRodada(runId: string): string {
  const partes = (runId ?? '').split('_')
  // Um id fora da forma esperada (importado, renomeado à mão) não deve virar
  // string vazia: cai no começo, que é o comportamento antigo.
  const ultima = partes.length >= 3 ? partes[partes.length - 1] : ''
  return ultima || (runId ?? '').slice(0, 8)
}
