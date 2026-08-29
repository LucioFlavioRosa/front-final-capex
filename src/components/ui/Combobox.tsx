import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { CaretUpDown, MagnifyingGlass } from '@phosphor-icons/react'
import { useSaidaMontada } from './useSaidaMontada'

export interface ComboboxOption {
  value: string
  label: string
}

interface ComboboxProps {
  options: ComboboxOption[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}

/**
 * Select com busca — para listas onde o número de opções é grande ou vem de
 * dados (um `<select>` nativo deixa de ser navegável passado um certo volume).
 */
export function Combobox({ options, value, onChange, placeholder = 'Buscar…', className = '' }: ComboboxProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIdx, setActiveIdx] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const id = useId()
  const listboxId = `${id}-listbox`
  const opcaoId = (i: number) => `${id}-opt-${i}`

  // 160ms: o tempo de `animate-scale-out` abaixo — segura o menu montado até
  // a saída terminar, em vez de sumir no clique/Escape (achado 1.3).
  const { montado, fechando } = useSaidaMontada(open, 160)

  const selected = options.find((o) => o.value === value)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter((o) => o.label.toLowerCase().includes(q))
  }, [options, query])

  useEffect(() => {
    if (!open) return
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  function openList() {
    setOpen(true)
    setQuery('')
    setActiveIdx(Math.max(0, filtered.findIndex((o) => o.value === value)))
  }

  function choose(opt: ComboboxOption) {
    onChange(opt.value)
    setOpen(false)
    setQuery('')
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      if (e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); openList() }
      return
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, filtered.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); if (filtered[activeIdx]) choose(filtered[activeIdx]) }
    else if (e.key === 'Escape') { setOpen(false) }
  }

  return (
    <div ref={rootRef} className={`relative ${className}`} onKeyDown={onKeyDown}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-activedescendant={open && filtered[activeIdx] ? opcaoId(activeIdx) : undefined}
        onClick={() => (open ? setOpen(false) : openList())}
        className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border border-ink-200 bg-white text-left focus:border-water-500 focus:ring-2 focus:ring-water-500/30 outline-none transition duration-hover ease-saida"
      >
        <span className={selected ? 'text-ink-900' : 'text-ink-400'}>{selected?.label ?? placeholder}</span>
        <CaretUpDown className="text-ink-400 flex-shrink-0" />
      </button>

      {montado && (
        // z-40: acima do cabeçalho fixo (z-20/z-30) e da coluna congelada (z-30) da grade
        // que costuma ficar logo abaixo deste combobox — ver AbaGrid.tsx.
        <div
          className={`absolute z-40 mt-1.5 w-full bg-white rounded-xl border border-ink-200 shadow-elev overflow-hidden ${
            fechando ? 'animate-scale-out' : 'animate-scale-in'
          }`}
        >
          <div className="flex items-center gap-2 px-3 py-2 border-b border-ink-100">
            <MagnifyingGlass className="text-ink-400 flex-shrink-0" />
            <input
              autoFocus
              value={query}
              onChange={(e) => { setQuery(e.target.value); setActiveIdx(0) }}
              placeholder={placeholder}
              className="w-full text-sm outline-none"
            />
          </div>
          <ul id={listboxId} className="max-h-56 overflow-y-auto py-1" role="listbox">
            {filtered.map((opt, i) => (
              <li key={opt.value}>
                <button
                  type="button"
                  id={opcaoId(i)}
                  role="option"
                  aria-selected={opt.value === value}
                  onClick={() => choose(opt)}
                  onMouseEnter={() => setActiveIdx(i)}
                  className={`w-full text-left px-3 py-2 text-sm ${
                    i === activeIdx ? 'bg-water-50 text-water-800' : 'text-ink-700'
                  } ${opt.value === value ? 'font-semibold' : ''}`}
                >
                  {opt.label}
                </button>
              </li>
            ))}
            {!filtered.length && <li className="px-3 py-2 text-sm text-ink-400">Nenhum resultado.</li>}
          </ul>
        </div>
      )}
    </div>
  )
}
