import { describe, expect, it } from 'vitest'
import { NAV_ITEMS, navItemsVisiveis } from './navigation'
import {
  ADMIN_UNIDADE,
  FINANCEIRO_HOLDING,
  GERENCIADOR_USUARIOS,
  USUARIO_REGIONAL,
} from '../auth/papeis'

/**
 * N4 — quem vê o quê no menu/rodapé/Home. A matriz do documento de perfis diz:
 * financeiro só lê Cadastro; gerenciador não vê nenhum dos três módulos
 * atuais (o dele — Usuários — ainda não existe, N6).
 */
describe('navItemsVisiveis', () => {
  it('administrador (qualquer nível) vê os três módulos', () => {
    expect(navItemsVisiveis([ADMIN_UNIDADE]).map((i) => i.path)).toEqual([
      '/cadastro',
      '/simular',
      '/resultados',
    ])
  })

  it('usuário comum (qualquer nível) também vê os três — a restrição dele é de ESCOPO, não de módulo', () => {
    expect(navItemsVisiveis([USUARIO_REGIONAL]).map((i) => i.path)).toEqual([
      '/cadastro',
      '/simular',
      '/resultados',
    ])
  })

  it('financeiro só vê Cadastro — não submete simulação nem lê resultado', () => {
    expect(navItemsVisiveis([FINANCEIRO_HOLDING]).map((i) => i.path)).toEqual(['/cadastro'])
  })

  it('gerenciador de usuários não vê nenhum dos três módulos atuais', () => {
    expect(navItemsVisiveis([GERENCIADOR_USUARIOS])).toEqual([])
  })

  it('sem papel nenhum, lista vazia', () => {
    expect(navItemsVisiveis([])).toEqual([])
  })

  it('todo item declarado tem ao menos um papel — nenhum módulo fica órfão de permissão', () => {
    for (const item of NAV_ITEMS) {
      expect(item.papeis.length).toBeGreaterThan(0)
    }
  })
})
