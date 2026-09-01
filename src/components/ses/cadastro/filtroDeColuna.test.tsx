/**
 * O FUNIL DE COLUNA É PREGUIÇOSO — e continua filtrando.
 *
 * A lista de valores distintos de uma coluna era montada em TODO render, com o
 * painel fechado, em TODA coluna filtrável: `Set` mais ordenação por
 * `localeCompare` sobre 751 valores × ~45 colunas. Abrir a aba de Sub-bacias
 * custava 3.084ms para pintar UMA linha; com os funis desligados, 20ms.
 *
 * A correção foi calcular só com o painel aberto. O risco dessa correção é
 * silencioso — um funil que abre vazio, ou que perde a seleção —, e o filtro não
 * tinha teste nenhum. Este arquivo cobre os dois lados: que nada é calculado
 * fechado, e que aberto ele funciona.
 */
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { AbaGrid } from './AbaGrid'
import { SCHEMA } from '@/data/cadastroUnidade/schema'
import type { Dados } from '@/domain/fluxo'
import type { Row } from '@/data/cadastroUnidade/types'

const SESSAO = { user: { papeis: ['admin_holding'] } }
vi.mock('@/auth/AuthContext', () => ({ useAuth: () => SESSAO }))

globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver

const aba = SCHEMA.find((a) => a.key === 'subbacia-operacional')!

/** Acima de `MIN_LINHAS_PARA_FILTRO` (15), senão o funil nem aparece. */
const LINHAS = 30
const COLUNA = 'sub_bacia_name'
const NOMES = ['Alfa', 'Beta', 'Gama']

const rows: Row[] = Array.from({ length: LINHAS }, (_, i) => {
  const r: Row = {}
  for (const c of aba.cols) r[c.coluna] = ''
  r.sub_bacia_id = `b${i}`
  r[COLUNA] = NOMES[i % NOMES.length]
  return r
})

const nada = () => {}

function montar() {
  const dados = { 'subbacia-operacional': rows } as unknown as Dados
  return render(
    <AbaGrid
      aba={aba}
      rows={rows}
      cidades={[]}
      dados={dados}
      onCell={nada}
      onAddRow={nada}
      onDelRow={nada}
      onCells={nada}
      onAviso={nada}
    />,
  )
}

const funilDe = (rotulo: string) =>
  screen.getByRole('button', { name: new RegExp(`^Filtrar ${rotulo}`) })

describe('o funil de coluna', () => {
  it('fechado, não monta a lista de valores', () => {
    montar()

    // O painel vai em portal, então é o `document.body` inteiro que se olha.
    // Se a lista fosse calculada e renderizada fechada, os nomes estariam aqui.
    expect(screen.queryByRole('dialog')).toBeNull()
    for (const n of NOMES) {
      expect(screen.queryByRole('checkbox', { name: n })).toBeNull()
    }
  })

  it('aberto, lista os valores distintos em ordem — e só os distintos', () => {
    montar()
    fireEvent.click(funilDe('Sub-bacia'))

    const painel = screen.getByRole('dialog', { name: /Filtro da coluna/ })
    const itens = within(painel)
      .getAllByRole('checkbox')
      .map((c) => c.closest('label')?.textContent?.trim())

    // `(todos)` primeiro, depois um por valor DISTINTO — 3, e não as 30 linhas.
    expect(itens).toEqual(['(todos)', ...NOMES])
    expect(within(painel).getByText('3 valores')).toBeTruthy()
  })

  it('desmarcar um valor tira as linhas dele da grade', () => {
    const { container } = montar()
    expect(container.querySelectorAll('tbody tr').length).toBe(LINHAS)

    fireEvent.click(funilDe('Sub-bacia'))
    const painel = screen.getByRole('dialog', { name: /Filtro da coluna/ })
    fireEvent.click(within(painel).getByRole('checkbox', { name: 'Beta' }))

    // 30 linhas em 3 nomes = 10 por nome; sem "Beta" sobram 20.
    expect(container.querySelectorAll('tbody tr').length).toBe(LINHAS - LINHAS / NOMES.length)
  })

  it('reabrir o painel recalcula — a lista não fica presa no primeiro cálculo', () => {
    montar()
    const funil = funilDe('Sub-bacia')

    fireEvent.click(funil) // abre
    fireEvent.click(funil) // fecha
    fireEvent.click(funil) // abre de novo

    const painel = screen.getByRole('dialog', { name: /Filtro da coluna/ })
    for (const n of NOMES) {
      expect(within(painel).getByRole('checkbox', { name: n })).toBeTruthy()
    }
  })
})
