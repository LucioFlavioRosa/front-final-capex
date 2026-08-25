import { forwardRef, type ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  /** Sublinhado turquesa animado — reservar para os poucos CTAs de destaque (login, nova simulação, executar). */
  sweep?: boolean
  /**
   * Pílula em caixa alta — a gramática das telas de rodada (design de 19/08).
   *
   * É opt-in, e não o padrão do kit, porque virar o raio e a caixa de TODO
   * botão redesenharia Cadastro, Simular e Login de carona. Quem quer a
   * gramática nova pede por ela.
   */
  pill?: boolean
}

const base =
  'relative overflow-hidden inline-flex items-center justify-center gap-1.5 font-semibold transition-all duration-hover ease-saida focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-water-500/50 disabled:opacity-60 disabled:cursor-not-allowed active:scale-[.98]'

const variants: Record<Variant, string> = {
  primary: 'bg-water-600 text-white hover:brightness-90',
  secondary: 'bg-white border border-ink-300 text-ink-700 hover:border-water-600',
  ghost: 'text-ink-700 hover:bg-ink-100',
  danger: 'text-danger border border-danger/30 hover:bg-red-50',
}

const sizes: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2.5 text-sm',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', sweep = false, pill = false, className = '', children, ...props },
  ref,
) {
  const forma = pill
    ? 'rounded-full uppercase tracking-[.03em]'
    : 'rounded-lg'
  return (
    <button
      ref={ref}
      className={`${base} ${forma} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
      {sweep && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 animate-sweep bg-gradient-to-r from-transparent via-aegea-400 to-transparent"
        />
      )}
    </button>
  )
})
