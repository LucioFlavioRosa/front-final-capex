/**
 * O RECORTE COM QUE CADA ABA ABRE, contra o cadastro REAL da uB1.
 *
 * O ganho medido em jsdom é de duas ordens de grandeza — 3.940ms para abrir a
 * aba de obras sem recorte, 24ms recortada num sistema. Este teste garante a
 * causa disso: que o recorte inicial existe e que ele é PEQUENO.
 *
 * Não mede tempo: mede LINHAS, que é o que determina o tempo e não depende da
 * máquina. Um teto em milissegundos aqui reprovaria por carga alheia, como já
 * aconteceu com o teste de render.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { lerCadastro } from '@/lib/cadastroApi'
import { SCHEMA } from '@/data/cadastroUnidade/schema'
import { casaComEscopo, escopoInicial, opcoesEscopo } from '@/domain/escopo'
import type { Dados } from '@/domain/fluxo'
import type { Row } from '@/data/cadastroUnidade/types'

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
}, 120_000)

/** Quantas linhas a grade monta ao ABRIR a aba, com o recorte inicial. */
function linhasAoAbrir(abaKey: string): { total: number; recortada: number } {
  const aba = SCHEMA.find((a) => a.key === abaKey)!
  const rows = ((dados as unknown as Record<string, Row[]>)[abaKey] ?? []) as Row[]
  const temBarra = !!aba.escopo && rows.length >= MIN_LINHAS_PARA_ESCOPO
  const escopo = escopoInicial(opcoesEscopo(dados, cidades, aba, rows), temBarra)
  const recortada = rows.filter((r) => casaComEscopo(dados, aba, r, escopo)).length
  return { total: rows.length, recortada }
}

describe('as abas grandes abrem recortadas', () => {
  it('a de obras de sub-bacia — a maior de todas', () => {
    if (!noAr) return console.log('backend fora do ar — pulado')

    const { total, recortada } = linhasAoAbrir('componentes-subbacias-capex')
    console.log(`[recorte] componentes-subbacias-capex: ${total} -> ${recortada} linhas`)

    expect(total).toBeGreaterThan(1000)
    // O número exato depende do sistema que abre primeiro; o que se afirma é a
    // ORDEM: dezenas, não milhares.
    expect(recortada).toBeLessThan(total / 10)
    expect(recortada).toBeGreaterThan(0)
  }, 120_000)

  it('a de sub-bacias e a de topologia também', () => {
    if (!noAr) return console.log('backend fora do ar — pulado')

    for (const aba of ['subbacia-operacional', 'sistema-topologia']) {
      const { total, recortada } = linhasAoAbrir(aba)
      console.log(`[recorte] ${aba}: ${total} -> ${recortada} linhas`)
      expect(recortada).toBeLessThan(total / 5)
      expect(recortada).toBeGreaterThan(0)
    }
  }, 120_000)

  it('aba pequena NÃO é recortada — recortar sem barra esconderia linhas', () => {
    if (!noAr) return console.log('backend fora do ar — pulado')

    // `cidade-operacional` tem 21 linhas na uB1: acima do mínimo, tem barra.
    // `empresa` tem 8: abaixo, e abre inteira.
    const { total, recortada } = linhasAoAbrir('empresa')
    expect(recortada).toBe(total)
  }, 120_000)
})
