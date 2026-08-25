import { describe, expect, it } from 'vitest'
import { PAPEIS_ADMINISTRADORES, TODOS_OS_PAPEIS, ehAdministrador } from './papeis'

/**
 * Paridade com `app/dominio/papeis.py` — cópia hardcoded de propósito.
 *
 * Isto NÃO lê o arquivo Python: é uma lista mantida à mão, e por isso é uma
 * garantia mais fraca que `tests/otimizador/test_papeis.py` (que lê a
 * migration de verdade). Ela pega o caso "esqueci de mexer no TS", não o
 * caso "os dois lados foram editados errado do mesmo jeito". Ver o
 * comentário no topo de `papeis.ts`.
 */
const COPIA_DE_APP_DOMINIO_PAPEIS_PY = [
  'admin_holding',
  'usuario_holding',
  'admin_regional',
  'usuario_regional',
  'admin_unidade',
  'usuario_unidade',
  'financeiro_holding',
  'gerenciador_usuarios',
]

describe('papéis — paridade manual com app/dominio/papeis.py', () => {
  it('a lista de 8 papéis é a mesma, na mesma ordem', () => {
    expect(TODOS_OS_PAPEIS).toEqual(COPIA_DE_APP_DOMINIO_PAPEIS_PY)
  })

  it('nenhum papel se repete', () => {
    expect(new Set(TODOS_OS_PAPEIS).size).toBe(8)
  })
})

describe('ehAdministrador — só os três papéis de nível (não os dois transversais)', () => {
  it('reconhece os três administradores', () => {
    expect(PAPEIS_ADMINISTRADORES.size).toBe(3)
    for (const papel of PAPEIS_ADMINISTRADORES) {
      expect(ehAdministrador([papel])).toBe(true)
    }
  })

  it('usuário comum, financeiro e gerenciador não são administrador', () => {
    expect(ehAdministrador(['usuario_holding'])).toBe(false)
    expect(ehAdministrador(['usuario_regional'])).toBe(false)
    expect(ehAdministrador(['usuario_unidade'])).toBe(false)
    expect(ehAdministrador(['financeiro_holding'])).toBe(false)
    expect(ehAdministrador(['gerenciador_usuarios'])).toBe(false)
  })

  it('lista vazia não é administrador', () => {
    expect(ehAdministrador([])).toBe(false)
  })
})
