/**
 * `dec` — número com N casas decimais em pt-BR (3.45 → "3,45").
 *
 * É O ÚNICO FORMATADOR DESTE MÓDULO, e de propósito: o vocabulário de formato
 * das telas de resultado vive em `rodada/lib/formato.ts` (`brl`, `brlMi`, `pct`,
 * `inteiro`, `vazao`, `VAZIO`…), que trata ausência de valor e escala. Duas
 * coleções de formatadores fazem a mesma grandeza aparecer de dois jeitos em
 * duas telas — acrescente lá, não aqui.
 *
 * Sobrevive porque o unifilar do CADASTRO precisa de um decimal simples e não
 * importa nada do módulo de rodada.
 */
export function dec(value: number, digits = 1): string {
  return value.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}
