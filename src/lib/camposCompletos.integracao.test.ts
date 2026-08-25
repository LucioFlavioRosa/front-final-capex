/**
 * TODO CAMPO QUE O SERVIDOR MANDA TEM COLUNA NA TELA.
 *
 * A ficha chegava completa e a grade mostrava parte: faltavam o recorte
 * residencial (4 campos), o ticket médio e a janela da obra (ano obrigatório,
 * proibida até). O efeito era mudo — a gravação preservava o que não era exibido
 * (`ultimaLeitura`), então nada se perdia, mas ninguém conseguia CONFERIR nem
 * CORRIGIR dado que decide meta e sequência de obra.
 *
 * O teste compara contra o backend de verdade, e não contra uma lista fixa: uma
 * lista aqui envelheceria em silêncio no dia em que o servidor ganhasse um campo
 * — que é exatamente como o buraco anterior nasceu.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { lerCadastro } from './cadastroApi'
import { SCHEMA } from '@/data/cadastroUnidade/schema'

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
const UNIDADE = 'uB1'

let noAr = false
let dados: Record<string, Record<string, string>[]>

beforeAll(async () => {
  try {
    noAr = (await fetch(`${BASE}/readyz`)).ok
  } catch {
    noAr = false
  }
  if (!noAr) return
  dados = (await lerCadastro(UNIDADE)).dados as Record<string, Record<string, string>[]>
}, 120_000)

const colunasDa = (aba: string) =>
  new Set(SCHEMA.find((a) => a.key === aba)!.cols.map((c) => c.coluna))

/** As colunas que a leitura preencheu com valor — o que o servidor de fato manda. */
function preenchidas(aba: string): string[] {
  const linhas = dados[aba] ?? []
  const vistas = new Set<string>()
  for (const l of linhas) for (const k of Object.keys(l)) vistas.add(k)
  return [...vistas]
}

describe('paridade entre o que o servidor manda e o que a tela mostra', () => {
  it('sub-bacia: nenhum campo fica sem coluna', () => {
    if (!noAr) return console.log('backend fora do ar — pulado')

    const cols = colunasDa('subbacia-operacional')
    const orfaos = preenchidas('subbacia-operacional').filter((c) => !cols.has(c))
    expect(orfaos).toEqual([])

    // E os que motivaram este teste estão lá, nomeados:
    for (const c of [
      'universo_ligacoes_residencial',
      'ligacoes_atuais_residencial',
      'universo_economias_residencial',
      'economias_atuais_residencial',
      'ticket_medio',
    ]) {
      expect(cols.has(c)).toBe(true)
    }
  }, 120_000)

  it('obras de sub-bacia: a janela da obra tem coluna', () => {
    if (!noAr) return console.log('backend fora do ar — pulado')

    const cols = colunasDa('componentes-subbacias-capex')
    expect(preenchidas('componentes-subbacias-capex').filter((c) => !cols.has(c))).toEqual([])
    expect(cols.has('obra_obrigatoria_ano')).toBe(true)
    expect(cols.has('obra_proibida_ate')).toBe(true)
  }, 120_000)

  it('CTS usa a MESMA lista de campos da sub-bacia', () => {
    if (!noAr) return console.log('backend fora do ar — pulado')

    // As duas compartilham `colsOperacionalComercial`: o que entra numa entra na
    // outra, e é isso que impede a CTS de ficar para trás na próxima mudança.
    const sub = colunasDa('subbacia-operacional')
    const cts = colunasDa('cts-operacional')
    const comerciais = [...sub].filter((c) => !['sistema_id', 'sistema_name'].includes(c))
    const soNaSub = comerciais.filter((c) => !cts.has(c) && !c.startsWith('sub_bacia'))
    expect(soNaSub).toEqual([])
  }, 120_000)
})
