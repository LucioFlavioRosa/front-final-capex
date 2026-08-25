/**
 * MEDIÇÃO — onde vai o tempo ao abrir a aba de Sub-bacias.
 *
 * A aba abre recortada em 1 linha de 751 (`recorteInicial.integracao.test.ts`),
 * então o custo NÃO é montar a grade. Este arquivo cronometra as outras etapas
 * do caminho até a primeira pintura, para dizer qual delas é.
 *
 * Não afirma teto de tempo — só imprime. Teto em milissegundos reprova por carga
 * alheia da máquina, como já aconteceu antes neste repositório.
 */
import { beforeAll, describe, it } from 'vitest'
import { lerCadastro } from '@/lib/cadastroApi'
import { SCHEMA } from '@/data/cadastroUnidade/schema'
import { casaComEscopo, escopoInicial, opcoesEscopo } from '@/lib/cadastroEscopo'
import type { Dados } from '@/lib/cadastroFluxo'
import type { Row } from '@/data/cadastroUnidade/types'

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
const ABA = 'subbacia-operacional'

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
}, 120_000)

const cron = (rotulo: string, fn: () => unknown) => {
  const t = performance.now()
  const r = fn()
  const ms = performance.now() - t
  console.log(`[custo] ${rotulo}: ${ms.toFixed(1)}ms`)
  return { r, ms }
}

describe('abrir a aba de Sub-bacias', () => {
  it('cronometra cada etapa', () => {
    if (!noAr) return console.log('backend fora do ar — pulado')

    const aba = SCHEMA.find((a) => a.key === ABA)!
    const rows = ((dados as unknown as Record<string, Row[]>)[ABA] ?? []) as Row[]
    console.log(`[custo] linhas na aba: ${rows.length}`)

    const { r: opcoes } = cron('opcoesEscopo (monta os dois dropdowns)', () =>
      opcoesEscopo(dados, cidades, aba, rows),
    )
    const { r: escopo } = cron('escopoInicial', () =>
      escopoInicial(opcoes as ReturnType<typeof opcoesEscopo>, true),
    )
    cron('casaComEscopo nas 751 linhas (o filtro da grade)', () =>
      rows.filter((r) => casaComEscopo(dados, aba, r, escopo as never)).length,
    )

    // E o mesmo par para a aba de obras, que é 5x maior — serve de régua: se
    // Sub-bacias custar perto disso com 1/5 das linhas, o custo não é por linha.
    const abaObras = SCHEMA.find((a) => a.key === 'componentes-subbacias-capex')!
    const rowsObras = ((dados as unknown as Record<string, Row[]>)[
      'componentes-subbacias-capex'
    ] ?? []) as Row[]
    console.log(`[custo] --- comparação: obras, ${rowsObras.length} linhas ---`)
    cron('opcoesEscopo (obras)', () => opcoesEscopo(dados, cidades, abaObras, rowsObras))
  }, 180_000)
})
