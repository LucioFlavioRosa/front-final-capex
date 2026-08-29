import type { ReactNode } from 'react'
import { useIndicador } from './useIndicador'

interface SegmentedOption<T extends string> {
  value: T
  label: string
}

interface SegmentedControlProps<T extends string> {
  options: SegmentedOption<T>[]
  value: T
  onChange: (value: T) => void
  className?: string
  'aria-label'?: string
}

/**
 * Grupo de pílulas (toggle) — horizonte, base de receita, densidade, agrupar
 * por ano.
 *
 * A pílula branca ESCORREGA até a opção nova (`useIndicador`, a mesma técnica
 * do Trilho) em vez de pular: o fundo/sombra saiu do botão e virou um `<span>`
 * absoluto medido pelo hook; os botões ficam transparentes, com o texto por
 * cima (`z-10`).
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className = '',
  'aria-label': ariaLabel,
}: SegmentedControlProps<T>) {
  const { containerRef, estilo } = useIndicador<HTMLDivElement>(value)

  return (
    <div
      ref={containerRef}
      role="radiogroup"
      aria-label={ariaLabel}
      className={`relative inline-flex gap-1 rounded-[9px] bg-ink-200 p-[3px] ${className}`}
    >
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            data-indicador={active ? '1' : undefined}
            onClick={() => onChange(opt.value)}
            className={[
              'relative z-10 rounded-[7px] px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors duration-hover ease-saida',
              active ? 'text-ink-900' : 'text-ink-600 hover:text-ink-900',
            ].join(' ')}
          >
            {opt.label}
          </button>
        )
      })}
      {estilo && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-[3px] rounded-[7px] bg-white shadow-soft transition-[transform,width] duration-mover ease-saida"
          style={{ width: estilo.width, transform: `translateX(${estilo.left}px)` }}
        />
      )}
    </div>
  )
}

/** Pílula avulsa (chip de filtro) — Histórico. */
export function Chip({
  active,
  onClick,
  children,
}: {
  active?: boolean
  onClick?: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors duration-hover ease-saida',
        active
          ? 'border-water-200 bg-water-50 text-water-700'
          : 'border-ink-200 bg-white text-ink-600 hover:border-ink-300',
      ].join(' ')}
    >
      {children}
    </button>
  )
}
