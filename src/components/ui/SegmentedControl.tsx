import type { ReactNode } from 'react'

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

/** Grupo de pílulas (toggle) — horizonte, base de receita, densidade, agrupar por ano. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className = '',
  'aria-label': ariaLabel,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={`inline-flex gap-1 rounded-[9px] bg-ink-200 p-[3px] ${className}`}
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="radio"
          aria-checked={opt.value === value}
          onClick={() => onChange(opt.value)}
          className={[
            'rounded-[7px] px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors duration-hover ease-saida',
            opt.value === value
              ? 'bg-white text-ink-900 shadow-soft'
              : 'text-ink-600 hover:text-ink-900',
          ].join(' ')}
        >
          {opt.label}
        </button>
      ))}
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
