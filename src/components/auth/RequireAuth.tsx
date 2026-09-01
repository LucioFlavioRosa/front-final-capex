import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { CircleNotch } from '@phosphor-icons/react'
import { useAuth } from '../../auth/AuthContext'

/** Protege as rotas internas: sem sessão, redireciona para /login guardando a origem. */
export function RequireAuth() {
  const { status } = useAuth()
  const location = useLocation()

  // Sala de espera: enquanto verifica o cookie, não decide nada (evita flicker/loop).
  if (status === 'loading') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-ink-50 text-ink-water">
        <CircleNotch className="text-2xl animate-spin text-aegea-600" />
        <p className="text-sm">Verificando sessão…</p>
      </div>
    )
  }

  if (status !== 'authenticated') {
    return <Navigate to="/login" replace state={{ from: location }} />
  }
  return <Outlet />
}
