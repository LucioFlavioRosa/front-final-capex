import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle, Info, WarningCircle, type Icon } from '@phosphor-icons/react'

type ToastType = 'success' | 'info' | 'warning'

interface Toast {
  id: number
  message: string
  type: ToastType
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

let counter = 0

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const toast = useCallback((message: string, type: ToastType = 'success') => {
    const id = ++counter
    setToasts((t) => [...t, { id, message, type }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200)
  }, [])

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {createPortal(
        <div className="fixed bottom-6 right-6 z-[60] flex flex-col gap-2">
          {toasts.map((t) => {
            const { icon: IconCmp, color } = config[t.type]
            return (
              <div
                key={t.id}
                className="bg-ink-900 text-white px-4 py-3 rounded-xl shadow-elev flex items-center gap-2.5 max-w-sm animate-fade-in-up"
              >
                <IconCmp weight="fill" className={`text-xl flex-shrink-0 ${color}`} />
                <span className="text-sm">{t.message}</span>
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
