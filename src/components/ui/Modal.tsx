import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X, type Icon } from '@phosphor-icons/react'
import { useSaidaMontada } from './useSaidaMontada'

type Size = 'sm' | 'md' | 'lg' | 'xl' | '2xl'

const sizes: Record<Size, string> = {
  sm: 'max-w-md',
  md: 'max-w-xl',
  lg: 'max-w-3xl',
  xl: 'max-w-5xl',
  // Para tabela larga: a lista de obras de um ano tem nove colunas, e em
  // `max-w-5xl` o CAPEX — a última — caía fora da área visível. Rolagem
  // horizontal existe, mas esconder justamente a coluna de dinheiro atrás dela
  // é esconder o que a tabela existe para mostrar.
  '2xl': 'max-w-7xl',
}

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: string
  icon?: Icon
  iconTone?: 'aegea' | 'water' | 'warning'
  size?: Size
  children: ReactNode
  footer?: ReactNode
}

const iconTones = {
  aegea: 'bg-aegea-50 text-aegea-700',
  water: 'bg-water-50 text-water-600',
  warning: 'bg-warning/10 text-warning',
}

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  icon: IconCmp,
  iconTone = 'aegea',
  size = 'md',
  children,
  footer,
}: ModalProps) {
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

  // 160ms: o tempo de `animate-scale-out`/`animate-overlay-out` abaixo —
  // segura o modal montado até a saída terminar, em vez de sumir no clique.
  const { montado, fechando } = useSaidaMontada(open, 160)
  if (!montado) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true">
      <div
        className={`absolute inset-0 bg-ink-900/60 backdrop-blur-sm ${fechando ? 'animate-overlay-out' : 'animate-overlay-in'}`}
        onClick={onClose}
      />
      <div
        className={`relative bg-white rounded-2xl shadow-elev w-full mx-4 max-h-[92vh] overflow-y-auto ${
          fechando ? 'animate-scale-out' : 'animate-scale-in'
        } ${sizes[size]}`}
      >
        <div className="px-6 py-4 border-b border-ink-100 flex items-center justify-between sticky top-0 bg-white/95 backdrop-blur z-10">
          <div className="flex items-center gap-3">
            {IconCmp && (
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${iconTones[iconTone]}`}>
                <IconCmp weight="bold" className="text-xl" />
              </div>
            )}
            <div>
              <h2 className="text-xl font-semibold text-ink-900">{title}</h2>
              {subtitle && <p className="text-xs text-ink-water">{subtitle}</p>}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="p-2 rounded-lg hover:bg-ink-100 text-ink-water transition-colors duration-hover ease-saida"
          >
            <X className="text-xl" />
          </button>
        </div>
        <div className="p-6">{children}</div>
        {footer && (
          <div className="px-6 py-3 border-t border-ink-100 flex justify-end gap-2 sticky bottom-0 bg-white">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
