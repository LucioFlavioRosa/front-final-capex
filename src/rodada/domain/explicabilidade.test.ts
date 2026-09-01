/**
 * O RECORTE POR SISTEMA — o nível 3 sem rota nova.
 *
 * O backend serve explicabilidade da rodada e da cidade, nunca do sistema. Mas
 * os itens e os elos carregam `sistemaId`, então o nível 3 é filtro. Estes
 * testes prendem as três coisas que um filtro ingênuo erraria: recontar, somar
 * de novo a vazão, e não inventar denominador.
 */
import { describe, expect, it } from 'vitest'
import { recortarPorSistema } from './explicabilidade'
import type { ExplicabilidadeGlobal } from './resultado'

const item = (subBaciaId: string, sistemaId: string, vazaoPresa: number) => ({
  subBaciaId,
  cidadeId: 'c1',
  sistemaId,
  vazaoPresa,
})

const DADOS: ExplicabilidadeGlobal = {
  naoFaturando: 5,
  totalSubbacias: 40,
  categorias: [
    {
      categoria: 'Não se paga',
      subbacias: 3,
      vazaoPresa: 60,
      itens: [item('b1', 's1', 10), item('b2', 's2', 20), item('b3', 's1', 30)],
    },
    {
      categoria: 'Perdeu a disputa pelo orçamento',
      subbacias: 2,
      vazaoPresa: 15,
      itens: [item('b4', 's2', 5), item('b5', 's2', 10)],
    },
  ],
  elos: [
    { obraId: 'o1', componente: 'Tronco', cidadeId: 'c1', sistemaId: 's1', subBaciaId: 'b1', bloqueia: 2, vazaoLiberada: 40 },
    { obraId: 'o2', componente: 'Rede', cidadeId: 'c1', sistemaId: 's2', subBaciaId: 'b4', bloqueia: 1, vazaoLiberada: 5 },
  ],
}

describe('recortarPorSistema', () => {
  it('mantém só os itens do sistema, e RECONTA — não repassa a contagem antiga', () => {
    const s1 = recortarPorSistema(DADOS, 's1', 12)
    const naoSePaga = s1.categorias.find((c) => c.categoria === 'Não se paga')!
    expect(naoSePaga.itens.map((i) => i.subBaciaId)).toEqual(['b1', 'b3'])
    // 3 era a contagem da cidade inteira; aqui são 2.
    expect(naoSePaga.subbacias).toBe(2)
  })

  it('soma a vazão presa de novo, em vez de herdar a da cidade', () => {
    const s1 = recortarPorSistema(DADOS, 's1', 12)
    // 10 + 30 do sistema, e não os 60 da cidade.
    expect(s1.categorias[0].vazaoPresa).toBe(40)
  })

  it('categoria sem ninguém no sistema sai da lista', () => {
    // "Perdeu a disputa" só tem sub-bacias de s2 — mostrá-la com zero afirmaria
    // que o motivo existe aqui, e ele não existe.
    const s1 = recortarPorSistema(DADOS, 's1', 12)
    expect(s1.categorias.map((c) => c.categoria)).toEqual(['Não se paga'])
  })

  it('os elos também são recortados', () => {
    expect(recortarPorSistema(DADOS, 's1', 12).elos.map((e) => e.obraId)).toEqual(['o1'])
    expect(recortarPorSistema(DADOS, 's2', 20).elos.map((e) => e.obraId)).toEqual(['o2'])
  })

  it('o total vem de FORA, porque o payload não sabe o tamanho do sistema', () => {
    // Sem isso o denominador seria "as que ficaram de fora", e a frase viraria
    // "2 de 2 não faturam" num sistema de doze.
    const s1 = recortarPorSistema(DADOS, 's1', 12)
    expect(s1.naoFaturando).toBe(2)
    expect(s1.totalSubbacias).toBe(12)
  })

  it('sistema sem nenhuma exclusão devolve lista vazia, e não a da cidade', () => {
    const limpo = recortarPorSistema(DADOS, 's9', 7)
    expect(limpo.categorias).toEqual([])
    expect(limpo.elos).toEqual([])
    expect(limpo.naoFaturando).toBe(0)
  })
})
