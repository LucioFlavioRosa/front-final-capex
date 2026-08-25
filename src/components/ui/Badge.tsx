import type { ReactNode } from 'react'

type Tone = 'aegea' | 'water' | 'ink' | 'success' | 'warning' | 'danger'

const tones: Record<Tone, string> = {
  aegea: 'bg-aegea-50 border-aegea-100 text-aegea-700',
  water: 'bg-water-50 border-water-100 text-water-700',
  ink: 'bg-ink-100 border-ink-200 text-ink-600',
  success: 'bg-green-50 border-green-200 text-success',
  warning: 'bg-warning/10 border-warning/25 text-warning',
  danger: 'bg-red-50 border-danger/20 text-danger',
}

const dots: Record<Tone, string> = {
  aegea: 'bg-aegea-500',
  water: 'bg-water-600',
  ink: 'bg-ink-400',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
}

interface BadgeProps {
  tone?: Tone
  children: ReactNode
  className?: string
  /** Bolinha colorida antes do texto — usado nos chips de status. */
  dot?: boolean
}

export function Badge({ tone = 'ink', children, className = '', dot = false }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${tones[tone]} ${className}`}
    >
      {dot && <span className={`h-1.5 w-1.5 rounded-full ${dots[tone]}`} />}
      {children}
    </span>
  )
}
