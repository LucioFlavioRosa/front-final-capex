import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { MagnifyingGlass } from '@phosphor-icons/react'
import { useSaidaMontada } from './useSaidaMontada'

interface CommandPaletteProps {
  open: boolean
  onClose: () => void
}

const ITEMS = [{ label: 'Cadastro SES', to: '/cadastro' }]

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const navigate = useNavigate()

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  const { montado, fechando } = useSaidaMontada(open, 160)
  if (!montado) return null

  function ir(to: string) {
    navigate(to)
    onClose()
  }

  return createPortal(
    <div
      className={`fixed inset-0 z-[60] flex items-start justify-center bg-ink-900/50 pt-[14vh] backdrop-blur-[3px] ${
        fechando ? 'animate-overlay-out' : 'animate-overlay-in'
      }`}
      onClick={onClose}
    >
      <div
        className={`w-full max-w-[520px] overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-elev ${
          fechando ? 'animate-scale-out' : 'animate-scale-in'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 border-b border-ink-200 px-4 py-3.5">
          <MagnifyingGlass className="text-lg text-ink-water" />
          <input
            autoFocus
            placeholder="Buscar sub-bacia, simulação, obra…"
            className="flex-1 border-0 bg-transparent text-sm text-ink-900 outline-none placeholder:text-ink-water"
          />
          <span className="rounded-[5px] border border-ink-200 px-1.5 py-0.5 font-mono text-[10.5px] text-ink-water">
            ESC
          </span>
        </div>
        <div className="p-2">
          <div className="px-2.5 pb-1.5 pt-2 text-[10.5px] font-semibold uppercase tracking-[.09em] text-ink-water">
            Ir para
          </div>
          {ITEMS.map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={() => ir(item.to)}
              className="flex w-full items-center gap-2.5 rounded-[9px] px-2.5 py-2.5 text-left text-[13.5px] text-ink-900 transition-colors duration-hover ease-saida hover:bg-water-50"
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  )
}
