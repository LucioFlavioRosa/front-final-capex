/**
 * OS SELETORES DA GRADE PRECISAM ENXERGAR O CADASTRO.
 *
 * Este arquivo existe por causa de uma regressão real, e do tipo pior: sem erro
 * nenhum. Uma otimização passou a mandar para a célula só a fatia
 * `sistema-topologia` do cadastro, para o `memo` da linha não quebrar a cada
 * tecla. `opcoesDaCelula` monta o catálogo a partir das FICHAS — sem
 * `subbacia-operacional`, `cts-operacional` e `ete-capex` ela não reconhece
 * componente nenhum e devolve lista vazia. O `<select>` de destino do Fluxo
 * abria sem uma única opção, e nada em tela dizia por quê.
 *
 * O teste renderiza a grade de verdade e conta as `<option>`. É o único jeito
 * de pegar isso: a função `opcoesDestino` estava CERTA o tempo todo — quem
 * estava errado era o que a grade lhe entregava.
 */
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AbaGrid } from './AbaGrid'
import { SCHEMA } from '@/data/cadastroUnidade/schema'
import type { Dados } from '@/domain/fluxo'
import type { Row } from '@/data/cadastroUnidade/types'

// O papel REAL, e nao um 'admin' inventado: `podeEditarCampoCadastro` compara
// com as constantes de `auth/papeis`, e um valor que nao existe la reprova em
// silencio — a celula fica travada e o teste mede a trava, nao o componente.
const SESSAO = { user: { papeis: ['admin_holding'] } }
vi.mock('@/auth/AuthContext', () => ({ useAuth: () => SESSAO }))

globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver

/** Um sistema com duas sub-bacias, uma CTS colocada e a ETE. */
const DADOS = {
  'cidade-sistema': [{ sistema_id: 's1', sistema_name: 'Alegria', cidade_id: 'c1' }],
  'subbacia-operacional': [
    { sub_bacia_id: 'b1', sub_bacia_name: 'Canal', sistema_id: 's1', sistema_name: 'Alegria' },
    { sub_bacia_id: 'b2', sub_bacia_name: 'Timbó', sistema_id: 's1', sistema_name: 'Alegria' },
  ],
  'cts-operacional': [{ cts_id: 't1', cts_name: 'CTS Leste' }],
  'ete-capex': [{ ete_id: 'e1', ete_name: 'ETE Alegria', sistema_id: 's1' }],
  'sistema-topologia': [
    { sistema_id: 's1', componente_sistema_id: 'b1', componente_tipo: 'sub-bacia', componente_sistema_id_jusante: '' },
    { sistema_id: 's1', componente_sistema_id: 'b2', componente_tipo: 'sub-bacia', componente_sistema_id_jusante: '' },
    { sistema_id: 's1', componente_sistema_id: 't1', componente_tipo: 'cts', componente_sistema_id_jusante: '' },
    { sistema_id: 's1', componente_sistema_id: 'e1', componente_tipo: 'ete', componente_sistema_id_jusante: '' },
  ],
  'componentes-subbacias-capex': [],
} as unknown as Dados

const aba = SCHEMA.find((a) => a.key === 'sistema-topologia')!
const nada = () => {}

function montar() {
  return render(
    <AbaGrid
      aba={aba}
      rows={(DADOS as unknown as Record<string, Row[]>)['sistema-topologia']}
      cidades={[]}
      dados={DADOS}
      onCell={nada}
      onAddRow={nada}
      onDelRow={nada}
      onCells={nada}
      onAviso={nada}
    />,
  )
}

describe('o seletor de destino do Fluxo', () => {
  it('oferece os componentes do sistema — e não uma lista vazia', () => {
    montar()

    // A primeira linha é `b1`; o `<select>` dela é o do "escoa para".
    const selects = screen.getAllByRole('combobox')
    expect(selects.length).toBeGreaterThan(0)

    const valores = Array.from(selects[0].querySelectorAll('option'))
      .map((o) => (o as HTMLOptionElement).value)
      .filter(Boolean)

    // O que importa: NÃO está vazio, e traz os três tipos do sistema.
    expect(valores.length).toBeGreaterThan(0)
    expect(valores).toContain('b2')
    expect(valores).toContain('t1')
    expect(valores).toContain('e1')
    // E nunca o próprio componente.
    expect(valores).not.toContain('b1')
  })
})
