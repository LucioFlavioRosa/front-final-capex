/**
 * EDITAR É UM ATO DECLARADO, e tirar CTS do sistema é uma ação de linha.
 *
 * Dois comportamentos que a grade não tinha:
 *
 *   1. Ela nascia sempre editável. Numa tabela de mil linhas isso é uma tela
 *      permanentemente armada — um clique fora de lugar altera cadastro sem
 *      intenção declarada, e o Salvar manda a alteração junto com o trabalho
 *      legítimo, sem ninguém notar.
 *
 *   2. Não havia como tirar uma CTS do sistema. Adicionar existia; desfazer,
 *      não — e desfazer é o que separa um cadastro de um caminho sem volta.
 */
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AbaGrid } from './AbaGrid'
import { SCHEMA } from '@/data/cadastroUnidade/schema'
import type { Dados } from '@/lib/cadastroFluxo'
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

const DADOS = {
  'cidade-sistema': [{ sistema_id: 's1', sistema_name: 'Alegria', cidade_id: 'c1' }],
  'subbacia-operacional': [
    { sub_bacia_id: 'b1', sub_bacia_name: 'Canal', sistema_id: 's1', sistema_name: 'Alegria' },
  ],
  'cts-operacional': [{ cts_id: 't1', cts_name: 'CTS Leste' }, { cts_id: 't2', cts_name: 'CTS Livre' }],
  'ete-capex': [{ ete_id: 'e1', ete_name: 'ETE Alegria', sistema_id: 's1' }],
  'sistema-topologia': [
    { sistema_id: 's1', componente_sistema_id: 'b1', componente_tipo: 'sub-bacia', componente_sistema_id_jusante: '' },
    { sistema_id: 's1', componente_sistema_id: 't1', componente_tipo: 'cts', componente_sistema_id_jusante: '' },
    { sistema_id: 's1', componente_sistema_id: 'e1', componente_tipo: 'ete', componente_sistema_id_jusante: '' },
    // CTS ainda NÃO colocada: não deve ganhar o botão de tirar.
    { sistema_id: '', componente_sistema_id: 't2', componente_tipo: 'cts', componente_sistema_id_jusante: '' },
  ],
  'componentes-subbacias-capex': [],
} as unknown as Dados

const aba = SCHEMA.find((a) => a.key === 'sistema-topologia')!
const linhas = (DADOS as unknown as Record<string, Row[]>)['sistema-topologia']
const nada = () => {}
const ehCtsColocada = (row: Row) => row.componente_tipo === 'cts' && !!row.sistema_id

function montar(props: { editando: boolean; onAcao?: (ri: number) => void }) {
  return render(
    <AbaGrid
      aba={aba}
      rows={linhas}
      cidades={[]}
      dados={DADOS}
      onCell={nada}
      onAddRow={nada}
      onDelRow={nada}
      onCells={nada}
      onAviso={nada}
      edicaoLiberada={props.editando}
      acaoRotulo="tirar do sistema"
      acaoVisivelEm={ehCtsColocada}
      onAcaoLinha={props.onAcao ?? nada}
    />,
  )
}

describe('modo de edição', () => {
  it('fechado, os seletores ficam desabilitados', () => {
    montar({ editando: false })
    const selects = screen.getAllByRole('combobox')
    expect(selects.length).toBeGreaterThan(0)
    expect(selects.every((s) => (s as HTMLSelectElement).disabled)).toBe(true)
  })

  it('aberto, eles aceitam escolha', () => {
    montar({ editando: true })
    const selects = screen.getAllByRole('combobox')
    expect(selects.some((s) => !(s as HTMLSelectElement).disabled)).toBe(true)
  })
})

describe('tirar do sistema', () => {
  it('o botão aparece só na CTS que ESTÁ num sistema', () => {
    montar({ editando: true })
    // Três componentes no sistema (sub-bacia, CTS, ETE) e uma CTS solta.
    // Só a CTS colocada ganha o botão.
    const botoes = screen.getAllByRole('button', { name: 'tirar do sistema' })
    expect(botoes).toHaveLength(1)
  })

  it('clicar avisa a tela com o índice da linha', () => {
    const cliques: number[] = []
    montar({ editando: true, onAcao: (ri) => cliques.push(ri) })
    screen.getByRole('button', { name: 'tirar do sistema' }).click()
    // A CTS colocada é a linha de índice 1 no array.
    expect(cliques).toEqual([1])
  })
})
