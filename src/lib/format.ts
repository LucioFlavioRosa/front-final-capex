/** Helpers de formatação pt-BR reutilizados nas telas. */

export const nf = new Intl.NumberFormat('pt-BR')

/** Inteiro com separador de milhar (ex.: 181000 → "181.000"). */
export function int(value: number): string {
  return nf.format(value)
}

/** Número com N casas decimais (ex.: 3.45 → "3,45"). */
export function dec(value: number, digits = 1): string {
  return value.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

/**
 * Valor em R$ MILHÕES, promovendo para bilhões quando aplicável.
 *
 * @deprecated Recebe milhões, não reais. O contrato do otimizador (`otim_*`)
 * entrega tudo em R$ cheios — para esses dados use `reais` ou `reaisCompacto`.
 * Mantida pelas telas antigas, que ainda leem o mock em milhões de `data/ses.ts`.
 */
export function brl(valueMi: number): string {
  if (valueMi >= 1000) return `R$ ${dec(valueMi / 1000, 2)} bi`
  return `R$ ${int(Math.round(valueMi))} M`
}

/** R$ cheios, sem centavos: 184216430 → "R$ 184.216.430". */
export function reais(value: number, casas = 0): string {
  return `R$ ${value.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas })}`
}

/**
 * R$ cheios em escala compacta — a forma usada em KPI, eixo e rótulo de barra.
 * 184216430 → "R$ 184,2 mi" · 1240000000 → "R$ 1,24 bi" · 940000 → "R$ 940 mil"
 * Preserva o sinal, que importa em fluxo de escoamento e histograma.
 */
export function reaisCompacto(value: number, casas?: number): string {
  const s = value < 0 ? '-' : ''
  const a = Math.abs(value)
  if (a >= 1e9) return `${s}R$ ${dec(a / 1e9, casas ?? 2)} bi`
  if (a >= 1e6) return `${s}R$ ${dec(a / 1e6, casas ?? 1)} mi`
  if (a >= 1e3) return `${s}R$ ${int(Math.round(a / 1e3))} mil`
  return `${s}R$ ${int(Math.round(a))}`
}

/** Milhões "nus", para eixo de gráfico onde a unidade já está no rótulo do eixo. */
export function milhoes(value: number, casas = 1): string {
  return dec(value / 1e6, casas)
}

/** Percentual já em 0–100 (como o contrato entrega): 87.42 → "87,4%". */
export function pct(value: number, casas = 1): string {
  return `${dec(value, casas)}%`
}
