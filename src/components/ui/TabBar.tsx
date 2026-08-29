import { useIndicador } from './useIndicador'

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

/**
 * Barra de abas com sublinhado ativo — Cadastro SES.
 *
 * O sublinhado ESCORREGA até a aba nova em vez de pular direto (`useIndicador`,
 * a mesma técnica do Trilho no cabeçalho) — cada botão carrega uma borda
 * transparente só para reservar o espaço; quem desenha a marca visível é o
 * `<span>` absoluto ao final, medido pelo hook.
 */
export function TabBar<T extends string>({
  options,
  value,
  onChange,
  className = '',
  'aria-label': ariaLabel,
}: TabBarProps<T>) {
  const { containerRef, estilo } = useIndicador<HTMLDivElement>(value)

  return (
    <div
      ref={containerRef}
      role="tablist"
      aria-label={ariaLabel}
      className={`relative flex gap-5 overflow-x-auto border-b border-ink-200 ${className}`}
    >
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={active}
            data-indicador={active ? '1' : undefined}
            onClick={() => onChange(opt.value)}
            className={[
              'whitespace-nowrap border-b-2 border-transparent pb-[11px] text-[13.5px] transition-colors duration-hover ease-saida',
              active ? 'font-bold text-water-700' : 'text-ink-600 hover:text-ink-900',
            ].join(' ')}
          >
            {opt.label}
          </button>
        )
      })}
      {estilo && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute bottom-0 h-0.5 rounded-t-sm bg-water-600 transition-[transform,width] duration-mover ease-saida"
          style={{ width: estilo.width, transform: `translateX(${estilo.left}px)` }}
        />
      )}
    </div>
  )
}
