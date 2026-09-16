import { describe, expect, it } from 'vitest'
import type { CidadeDetalhe, CidadeLinha } from '@/rodada/domain/resultado'
import { capexPorAnoDe, completarComDetalhe } from '@/rodada/mapa/completarCidades'

/** A linha como o backend daqui a manda: só o que a listagem sempre teve. */
const LINHA = {
  id: 'Italva',
  nome: 'Italva',
  vpl: 10,
  capex: 20,
  coberturaFimPct: 90,
  metasAtingidas: 1,
  metasTotal: 1,
  sistemas: 1,
} as unknown as CidadeLinha

const DETALHE = {
  id: 'Italva',
  nome: 'Italva',
  ligacoesNovas: 3162,
  coberturaBasePct: 41.5,
  cobertura: [
    { ano: 2026, coberturaPct: 41.5 },
    { ano: 2027, coberturaPct: 60 },
  ],
  metas: [{ ano: 2037, alvoPct: 82, realizadoPct: null, atingida: null, dentroDaJanela: false }],
  elementosPorAno: [
    {
      ano: 2027,
      porComponente: [
        { componente: 'EEE', capex: 1 },
        { componente: 'Rede coletora', capex: 2 },
      ],
    },
    { ano: 2026, porComponente: [{ componente: 'ETE (módulo)', capex: 18, quantidade: null }] },
  ],
} as unknown as CidadeDetalhe

describe('completarComDetalhe — o que a listagem não traz vem do detalhe', () => {
  it('preenche curva, metas, ligações, cobertura de partida e CAPEX por ano', () => {
    const c = completarComDetalhe(LINHA, DETALHE)
    expect(c.cobertura).toHaveLength(2)
    expect(c.metas).toHaveLength(1)
    expect(c.ligacoesNovas).toBe(3162)
    expect(c.coberturaBasePct).toBe(41.5)
    expect(c.capexPorAno).toEqual([
      { ano: 2026, capex: 18 },
      { ano: 2027, capex: 3 },
    ])
    // E o que a linha já tinha continua igual.
    expect(c.vpl).toBe(10)
    expect(c.coberturaFimPct).toBe(90)
  })

  it('o que a listagem JÁ manda ganha do detalhe — o servidor novo não é sobrescrito', () => {
    const jaCompleta = {
      ...LINHA,
      ligacoesNovas: 1,
      coberturaBasePct: 2,
      cobertura: [{ ano: 2030, coberturaPct: 3 }],
      metas: [{ ano: 2031, alvoPct: 4, realizadoPct: 4, atingida: true, dentroDaJanela: true }],
      capexPorAno: [{ ano: 2032, capex: 5 }],
    } as CidadeLinha
    const c = completarComDetalhe(jaCompleta, DETALHE)
    expect(c.ligacoesNovas).toBe(1)
    expect(c.coberturaBasePct).toBe(2)
    expect(c.cobertura).toEqual([{ ano: 2030, coberturaPct: 3 }])
    expect(c.metas?.[0].ano).toBe(2031)
    expect(c.capexPorAno).toEqual([{ ano: 2032, capex: 5 }])
  })

  it('sem detalhe ainda, a linha volta como está — o mapa não espera', () => {
    expect(completarComDetalhe(LINHA, undefined)).toBe(LINHA)
  })
})

describe('capexPorAnoDe — a soma dos componentes, ano a ano, em ordem', () => {
  it('soma e ordena', () => {
    expect(capexPorAnoDe(DETALHE)).toEqual([
      { ano: 2026, capex: 18 },
      { ano: 2027, capex: 3 },
    ])
  })

  it('sem elementos, sem anos — e não zeros', () => {
    expect(capexPorAnoDe({ elementosPorAno: [] })).toEqual([])
  })
})
