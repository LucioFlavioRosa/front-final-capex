/**
 * O parser de número da tela — pt-BR, tolerante.
 *
 * Morava em `calc.ts`, e saiu de lá para `fluxo.ts` poder usá-lo: `calc.ts`
 * importa de `fluxo.ts`, então a volta seria import circular. Duplicar três
 * linhas de parser é pior — dois parsers divergem, e este decide dinheiro.
 *
 * TOLERANTE de propósito, ao contrário do parser da GRAVAÇÃO (que é estrito e
 * recusa `"123abc"` com 422). Aqui o valor está sendo lido para DESENHAR: uma
 * célula meio digitada não deve derrubar o cálculo da tela, só não contar.
 */
/** Converte texto pt-BR ("3.214" / "0,091") em número; null se inválido. */
export function toNum(v: string | undefined): number | null {
  if (v == null) return null
  const n = parseFloat(String(v).replace(/\./g, '').replace(',', '.'))
  return isNaN(n) ? null : n
}
