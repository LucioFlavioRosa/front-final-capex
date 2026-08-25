import type { ReactNode } from 'react'

interface DataPanelProps {
  children: ReactNode
  className?: string
}

/** Superfície navy para gráficos/diagramas (Pareto, unifilar) — dados como protagonistas. */
export function DataPanel({ children, className = '' }: DataPanelProps) {
  return (
    <div className={`data-surface data-line rounded-2xl border p-5 md:p-6 ${className}`}>{children}</div>
  )
}
