import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Header } from './Header'
import { Footer } from './Footer'
import { CommandPalette } from '../ui/CommandPalette'

export function AppLayout() {
  const { pathname } = useLocation()
  const [cmdOpen, setCmdOpen] = useState(false)

  // Rola para o topo a cada troca de rota (comportamento do protótipo).
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [pathname])

  // ⌘K / Ctrl+K abre a busca rápida.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setCmdOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="min-h-screen flex flex-col">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 z-50 bg-aegea-600 text-white px-4 py-2 rounded"
      >
        Pular para o conteúdo
      </a>
      <Header onOpenCmd={() => setCmdOpen(true)} />
      <main id="main-content" tabIndex={-1} className="flex-1 w-full animate-fade-in">
        <Outlet />
      </main>
      <Footer />
      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
    </div>
  )
}
