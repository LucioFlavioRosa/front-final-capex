import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle, Info, WarningCircle, X, type Icon } from '@phosphor-icons/react'

type ToastType = 'success' | 'info' | 'warning'

interface Toast {
  id: number
  message: string
  type: ToastType
  /** Marcado antes de sair da lista — o nó fica no DOM pelos 200ms da saída. */
  saindo?: boolean
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const config: Record<ToastType, { icon: Icon; color: string }> = {
  success: { icon: CheckCircle, color: 'text-aegea-400' },
  info: { icon: Info, color: 'text-water-400' },
  warning: { icon: WarningCircle, color: 'text-warning' },
}

const TEMPO_TELA = 3200
const TEMPO_SAIDA = 200

let counter = 0

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const fechar = useCallback((id: number) => {
    // Marca a saída ANTES de remover: sem os dois tempos, o toast pisca em
    // vez de deslizar para fora.
    setToasts((t) => t.map((x) => (x.id === id ? { ...x, saindo: true } : x)))
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), TEMPO_SAIDA)
  }, [])

  const toast = useCallback(
    (message: string, type: ToastType = 'success') => {
      const id = ++counter
      setToasts((t) => [...t, { id, message, type }])
      setTimeout(() => fechar(id), TEMPO_TELA)
    },
    [fechar],
  )

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {createPortal(
        // `aria-live="polite"`: um toast não interrompe (não é `assertive`),
        // mas precisa ser anunciado — sem isso, "Não foi possível mudar a
        // favorita" (Historico.tsx) nunca chega a quem usa leitor de tela.
        <div aria-live="polite" aria-atomic="false" className="fixed bottom-6 right-6 z-[60] flex flex-col gap-2">
          {toasts.map((t) => {
            const { icon: IconCmp, color } = config[t.type]
            return (
              <div
                key={t.id}
                className={`bg-ink-900 text-white pl-4 pr-2.5 py-3 rounded-xl shadow-elev flex items-center gap-2.5 max-w-sm ${
                  t.saindo ? 'animate-fade-out-down' : 'animate-fade-in-up'
                }`}
              >
                <IconCmp weight="fill" className={`text-xl flex-shrink-0 ${color}`} />
                <span className="text-sm">{t.message}</span>
                <button
                  type="button"
                  onClick={() => fechar(t.id)}
                  aria-label="Fechar notificação"
                  className="ml-1 flex-shrink-0 rounded-md p-1 text-white/60 transition-colors duration-hover ease-saida hover:bg-white/10 hover:text-white"
                >
                  <X weight="bold" className="text-sm" />
                </button>
              </div>
            )
          })}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast deve ser usado dentro de <ToastProvider>')
  return ctx
}
