/**
 * QUANTO CUSTA ABRIR UMA ABA — não digitar nela.
 *
 * `AbaGrid.perf.test.tsx` mede a TECLA (re-render com a grade já montada). Esta
 * é a outra metade: o clique no passo do stepper, que monta a grade do zero.
 *
 * Mede com o cadastro REAL da uB1, e não com linhas fabricadas, porque o custo
 * de abrir depende de quanto o recorte inicial corta — e isso depende do dado.
 *
 * Imprime; só reprova no absurdo. Teto apertado em milissegundos reprova por
 * carga alheia da máquina, como já aconteceu neste repositório.
 *
 *     npm run test:perf
 */
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { AbaGrid } from './AbaGrid'
import { SCHEMA } from '@/data/cadastroUnidade/schema'
import { lerCadastro } from '@/lib/cadastroApi'
import { casaComEscopo, escopoInicial, opcoesEscopo } from '@/lib/cadastroEscopo'
import type { Dados } from '@/lib/cadastroFluxo'
import type { Row } from '@/data/cadastroUnidade/types'

const SESSAO = { user: { papeis: ['admin_holding'] } }
vi.mock('@/auth/AuthContext', () => ({ useAuth: () => SESSAO }))

globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
const MIN_LINHAS_PARA_ESCOPO = 15

let noAr = false
let dados: Dados
let cidades: { id: string; name: string }[] = []

beforeAll(async () => {
  try {
    noAr = (await fetch(`${BASE}/readyz`)).ok
  } catch {
    noAr = false
  }
  if (!noAr) return
  const lido = await lerCadastro('uB1')
  dados = lido.dados as unknown as Dados
  cidades = (lido.dados['cidade-operacional'] ?? []).map((c) => ({
    id: c.cidade_id,
    name: c.cidade_name,
  }))
}, 180_000)

const nada = () => {}

/** Monta a aba como o wizard monta, e devolve [ms, linhas pintadas]. */
function abrir(abaKey: string): { ms: number; pintadas: number; total: number } {
  const aba = SCHEMA.find((a) => a.key === abaKey)!
  const rows = ((dados as unknown as Record<string, Row[]>)[abaKey] ?? []) as Row[]
  const temBarra = !!aba.escopo && rows.length >= MIN_LINHAS_PARA_ESCOPO
  const escopo = escopoInicial(opcoesEscopo(dados, cidades, aba, rows), temBarra)
  const filtro = (row: Row) => casaComEscopo(dados, aba, row, escopo)

  const t0 = performance.now()
  const { container, unmount } = render(
    <AbaGrid
      aba={aba}
      rows={rows}
      cidades={cidades as never}
      dados={dados}
      onCell={nada}
      onAddRow={nada}
      onDelRow={nada}
      onCells={nada}
      onAviso={nada}
      filtroEscopo={filtro}
    />,
  )
  const ms = performance.now() - t0
  const pintadas = container.querySelectorAll('tbody tr').length
  unmount()
  return { ms, pintadas, total: rows.length }
}

/**
 * O TETO, e de onde ele veio.
 *
 * Medido nesta máquina: 3.084ms com os funis de coluna refazendo `Set` +
 * ordenação a cada render, 35ms depois de calcularem só com o painel aberto. O
 * teto fica MUITO acima do bom e muito abaixo do defeito — ele existe para
 * acusar a volta do cálculo ansioso, não para perseguir milissegundos numa
 * máquina que pode estar ocupada.
 */
const TETO_ABRIR_MS = 400

describe('abrir a aba', () => {
  it(`Sub-bacias abre em menos de ${TETO_ABRIR_MS}ms`, () => {
    if (!noAr) return console.log('backend fora do ar — pulado')

    abrir('subbacia-operacional') // aquece o módulo
    const { ms, pintadas, total } = abrir('subbacia-operacional')
    console.log(
      `[abrir] subbacia-operacional: ${ms.toFixed(0)}ms · ${pintadas} de ${total} linhas pintadas`,
    )
    // Pintar 1 de 751 e mesmo assim demorar é a assinatura exata do defeito: o
    // custo não estava nas linhas exibidas, e sim no trabalho por COLUNA sobre
    // as linhas todas.
    expect(pintadas).toBeLessThan(total)
    expect(ms).toBeLessThan(TETO_ABRIR_MS)
  }, 180_000)

  it('as outras abas grandes, para comparação', () => {
    if (!noAr) return console.log('backend fora do ar — pulado')

    for (const k of ['componentes-subbacias-capex', 'sistema-topologia', 'cts-operacional']) {
      const { ms, pintadas, total } = abrir(k)
      console.log(`[abrir] ${k}: ${ms.toFixed(0)}ms · ${pintadas} de ${total} linhas`)
    }
  }, 180_000)
})
