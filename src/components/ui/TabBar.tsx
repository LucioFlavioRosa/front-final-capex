interface TabBarOption<T extends string> {
  value: T
  label: string
}

interface TabBarProps<T extends string> {
  options: TabBarOption<T>[]
  value: T
  onChange: (value: T) => void
  className?: string
  'aria-label'?: string
}

/** Barra de abas com sublinhado ativo — Cadastro SES. */
export function TabBar<T extends string>({
  options,
  value,
  onChange,
  className = '',
  'aria-label': ariaLabel,
}: TabBarProps<T>) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`flex gap-5 overflow-x-auto border-b border-ink-200 ${className}`}
    >
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={[
              'whitespace-nowrap border-b-2 pb-[11px] text-[13.5px] transition-colors duration-hover ease-saida',
              active
                ? 'border-water-600 font-bold text-water-700'
                : 'border-transparent text-ink-600 hover:text-ink-900',
            ].join(' ')}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
