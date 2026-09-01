import type { ReactNode } from 'react'

interface BandProps {
  children: ReactNode
  className?: string
  as?: 'div' | 'aside'
}

/**
 * Superfície navy para números em destaque.
 *
 * SEM CURVA ANIMADA NO FUNDO, de propósito: num produto sobre ESCOAMENTO, uma
 * onda que não é a topologia de nada é decoração fingindo significado.
 *
 * O turquesa não sumiu do produto: ele passou a carregar dado, na faixa do
 * horizonte da Home. Cor de acento que informa vale mais que cor de acento que
 * enfeita, e gastar as duas coisas no mesmo tom as fazia competir.
 *
 * A animação `animate-draw` continua existindo, usada no Login — lá o traço é o
 * momento institucional da sessão, acontece uma vez, e a doutrina de movimento
 * do projeto reserva exatamente isso para o que acontece uma vez por sessão.
 */
export function Band({ children, className = '', as: Tag = 'div' }: BandProps) {
  return (
    <Tag className={`band-surface band-line rounded-2xl border shadow-band ${className}`}>
      {children}
    </Tag>
  )
}

type StatSize = 'sm' | 'md' | 'lg' | 'hero'

const statSizes: Record<StatSize, string> = {
  sm: 'text-lg',
  md: 'text-[19px]',
  lg: 'text-[26px]',
  hero: 'text-[46px] md:text-[60px]',
}

/** Rótulo + valor mono dentro de um Band. */
export function BandStat({
  label,
  value,
  size = 'md',
  tone,
}: {
  label: string
  value: ReactNode
  size?: StatSize
  tone?: string
}) {
  return (
    <div>
      <div className="band-mut text-[10.5px] font-semibold uppercase tracking-[.09em]">{label}</div>
      <div
        className={`mt-1.5 font-mono font-semibold leading-none tracking-tight ${statSizes[size]} ${tone ?? ''}`}
      >
        {value}
      </div>
    </div>
  )
}

/** Divisor animado (grow) dentro de um Band. */
export function BandDivider({ className = '' }: { className?: string }) {
  return (
    <div
      className={`h-0.5 origin-left animate-grow bg-gradient-to-r from-water-500 to-aegea-400 ${className}`}
    />
  )
}
