import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { renderizar } from '@/testes/render'
import { RequirePapel, RotaPadrao } from './RequirePapel'
import {
  ADMIN_UNIDADE,
  FINANCEIRO_HOLDING,
  GERENCIADOR_USUARIOS,
  PAPEIS_CADASTRO,
  PAPEIS_OPERACIONAIS,
  type Papel,
} from '@/auth/papeis'
import type { User } from '@/auth/AuthContext'

/**
 * N5 — a guarda de rota por papel, e o destino de "caminho desconhecido" /
 * "sem papel nenhum". `useAuth` é mockado porque estes componentes só leem
 * `user.papeis` — testar a resolução de sessão é assunto de `RequireAuth`.
 */

const { useAuthMock } = vi.hoisted(() => ({ useAuthMock: vi.fn() }))
vi.mock('@/auth/AuthContext', () => ({ useAuth: useAuthMock }))

function usuarioCom(papeis: Papel[]): User {
  return { name: 'X', email: 'x@aegea', role: '', papeis, unidades: [], tudo: false, initials: 'X' }
}

function montar(papeisExigidos: readonly Papel[]) {
  return renderizar(
    <Routes>
      <Route element={<RequirePapel papeis={papeisExigidos} />}>
        <Route path="/alvo" element={<div>conteúdo protegido</div>} />
      </Route>
    </Routes>,
    { rota: '/alvo' },
  )
}

describe('RequirePapel', () => {
  it('papel autorizado vê o conteúdo', () => {
    useAuthMock.mockReturnValue({ user: usuarioCom([ADMIN_UNIDADE]) })
    montar(PAPEIS_OPERACIONAIS)
    expect(screen.getByText('conteúdo protegido')).toBeInTheDocument()
  })

  it('papel fora da lista vê "sem acesso", não o conteúdo', () => {
    useAuthMock.mockReturnValue({ user: usuarioCom([FINANCEIRO_HOLDING]) })
    montar(PAPEIS_OPERACIONAIS)
    expect(screen.queryByText('conteúdo protegido')).not.toBeInTheDocument()
    expect(screen.getByText(/nenhum módulo disponível/i)).toBeInTheDocument()
  })

  it('sem usuário (ainda carregando) não vaza o conteúdo', () => {
    useAuthMock.mockReturnValue({ user: null })
    montar(PAPEIS_CADASTRO)
    expect(screen.queryByText('conteúdo protegido')).not.toBeInTheDocument()
  })
})

describe('RotaPadrao', () => {
  function montarRotaPadrao() {
    return renderizar(
      <Routes>
        <Route path="/cadastro" element={<div>tela de cadastro</div>} />
        <Route path="*" element={<RotaPadrao />} />
      </Routes>,
      { rota: '/um/caminho/que/nao/existe' },
    )
  }

  it('manda para o primeiro módulo que o papel alcança', () => {
    useAuthMock.mockReturnValue({ user: usuarioCom([ADMIN_UNIDADE]) })
    montarRotaPadrao()
    expect(screen.getByText('tela de cadastro')).toBeInTheDocument()
  })

  it('gerenciador de usuários (nenhum módulo hoje) vê "sem acesso", não um redirect para Cadastro', () => {
    useAuthMock.mockReturnValue({ user: usuarioCom([GERENCIADOR_USUARIOS]) })
    montarRotaPadrao()
    expect(screen.queryByText('tela de cadastro')).not.toBeInTheDocument()
    expect(screen.getByText(/nenhum módulo disponível/i)).toBeInTheDocument()
  })
})
