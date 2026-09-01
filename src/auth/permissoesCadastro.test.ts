import { describe, expect, it } from 'vitest'
import { podeEditarCampoCadastro } from './permissoesCadastro'
import { ADMIN_UNIDADE, FINANCEIRO_HOLDING, GERENCIADOR_USUARIOS, USUARIO_UNIDADE } from './papeis'

/**
 * Espelho, no front, do que `app/cadastro/routes.py::salvar_cadastro` já
 * decide no servidor. Isto é PREVENÇÃO — a permissão de
 * verdade é o 403 do servidor —, mas os três ramos têm que concordar, senão
 * a tela deixa preencher o que o servidor vai recusar.
 */
describe('podeEditarCampoCadastro', () => {
  it('administrador edita qualquer campo, WACC ou não', () => {
    expect(podeEditarCampoCadastro([ADMIN_UNIDADE], 'unidade-regional', 'wacc_medio')).toBe(true)
    expect(podeEditarCampoCadastro([ADMIN_UNIDADE], 'componentes-subbacias-capex', 'quantidade')).toBe(true)
  })

  it('financeiro edita os quatro campos de WACC', () => {
    expect(podeEditarCampoCadastro([FINANCEIRO_HOLDING], 'unidade-regional', 'wacc_medio')).toBe(true)
    expect(podeEditarCampoCadastro([FINANCEIRO_HOLDING], 'componentes-subbacias-capex', 'wacc')).toBe(true)
    expect(podeEditarCampoCadastro([FINANCEIRO_HOLDING], 'ete-capex', 'wacc')).toBe(true)
    expect(podeEditarCampoCadastro([FINANCEIRO_HOLDING], 'componentes-cts-capex', 'wacc')).toBe(true)
  })

  it('financeiro NÃO edita nada fora do WACC', () => {
    expect(podeEditarCampoCadastro([FINANCEIRO_HOLDING], 'componentes-subbacias-capex', 'quantidade')).toBe(false)
    expect(podeEditarCampoCadastro([FINANCEIRO_HOLDING], 'unidade-regional', 'outro_campo')).toBe(false)
  })

  it('usuário comum e gerenciador não editam nada', () => {
    expect(podeEditarCampoCadastro([USUARIO_UNIDADE], 'unidade-regional', 'wacc_medio')).toBe(false)
    expect(podeEditarCampoCadastro([GERENCIADOR_USUARIOS], 'ete-capex', 'wacc')).toBe(false)
  })

  it('sem papel nenhum, nada é editável', () => {
    expect(podeEditarCampoCadastro([], 'unidade-regional', 'wacc_medio')).toBe(false)
  })
})
