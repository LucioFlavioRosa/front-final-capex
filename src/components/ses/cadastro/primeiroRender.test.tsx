/**
 * O RECORTE VALE JÁ NO PRIMEIRO RENDER.
 *
 * O recorte inicial existia, e mesmo assim a aba demorava a abrir: ele era
 * aplicado num `useEffect`, e efeito roda DEPOIS da pintura. A grade montava
 * com a lista inteira — 3.755 linhas na aba de obras — e só então remontava
 * recortada. O usuário pagava o render que o recorte existia para evitar.
 *
 * Este teste conta as linhas que o DOM tem logo depois de montar. É a única
 * forma de pegar isso: qualquer verificação feita depois de um `await` já vê o
 * segundo render, e passaria com o defeito no lugar.
 */
import { describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { AbaGrid } from './AbaGrid'
import { SCHEMA } from '@/data/cadastroUnidade/schema'
import type { Dados } from '@/lib/cadastroFluxo'
import type { Row } from '@/data/cadastroUnidade/types'

const SESSAO = { user: { papeis: ['admin_holding'] } }
vi.mock('@/auth/AuthContext', () => ({ useAuth: () => SESSAO }))

globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver

const LINHAS = 800
const DO_SISTEMA = 's7'

const aba = SCHEMA.find((a) => a.key === 'sistema-topologia')!

const rows: Row[] = Array.from({ length: LINHAS }, (_, i) => {
  const r: Row = {}
  for (const c of aba.cols) r[c.coluna] = ''
  r.componente_sistema_id = `c${i}`
  r.componente_tipo = 'sub-bacia'
  r.sistema_id = `s${i % 40}`
  return r
})

const dados = { 'sistema-topologia': rows } as unknown as Dados
const nada = () => {}

describe('a grade monta já recortada', () => {
  it('renderiza só as linhas do escopo, e não as 800', () => {
    const { container } = render(
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
        // O predicado chega JUNTO com as linhas, como o wizard agora faz ao
        // derivar o escopo no render.
        filtroEscopo={(row) => row.sistema_id === DO_SISTEMA}
      />,
    )

    const montadas = container.querySelectorAll('tbody tr').length
    const esperadas = rows.filter((r) => r.sistema_id === DO_SISTEMA).length

    expect(esperadas).toBeGreaterThan(0)
    expect(esperadas).toBeLessThan(LINHAS / 10)
    expect(montadas).toBe(esperadas)
  })

  it('sem recorte, monta tudo — é o custo que o recorte evita', () => {
    const { container } = render(
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
    expect(container.querySelectorAll('tbody tr').length).toBe(LINHAS)
  })
})
