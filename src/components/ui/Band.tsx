import type { ReactNode } from 'react'

interface BandProps {
  children: ReactNode
  className?: string
  /** Linha de fluxo animada no fundo — motivo de marca sutil (ligadura do logo). */
  flow?: boolean
  as?: 'div' | 'aside'
}

/** Superfície navy-gradiente para KPIs em destaque — a "direção gráfica" do redesign. */
export function Band({ children, className = '', flow = true, as: Tag = 'div' }: BandProps) {
  return (
    <Tag
      className={`band-surface band-line relative overflow-hidden rounded-2xl border shadow-band ${className}`}
    >
      {flow && (
        <svg
          viewBox="0 0 900 300"
          preserveAspectRatio="none"
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 h-full w-full opacity-50"
        >
          <path
            d="M-20 250 C 180 250 200 120 380 120 C 520 120 540 60 760 60 L 920 60"
            fill="none"
            stroke="#17E3CB"
            strokeWidth={2}
            strokeDasharray={1600}
            strokeDashoffset={1600}
            className="animate-draw"
          />
        </svg>
      )}
      <div className="relative">{children}</div>
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
