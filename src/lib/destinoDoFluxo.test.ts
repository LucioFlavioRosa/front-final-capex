/**
 * PARA ONDE UM COMPONENTE PODE ESCOAR — a lista que o Fluxo oferece.
 *
 * A regra é a do servidor, e não uma escolha de tela: o jusante aponta para
 * dentro do MESMO sistema, e não para o próprio componente. O que estiver fora
 * disso ele recusa com 422.
 *
 * Duas listas erradas viviam aqui, as duas herdadas do modelo em que a CTS não
 * tinha sistema: origem sub-bacia não podia escolher uma CTS como destino, e
 * origem CTS não tinha filtro nenhum — a lista atravessava sistemas.
 */
import { describe, expect, it } from 'vitest'
import { opcoesDestino, sistemaDoNo, type Dados } from './cadastroFluxo'

/**
 * Dois sistemas, cada um com sub-bacias, uma CTS e uma ETE.
 *
 * A CTS vem COLOCADA (`sistema_id` preenchido na topologia), que é como ela
 * existe hoje — a tela do Fluxo escreve essa coluna ao adicioná-la.
 */
const DADOS: Dados = {
  'cidade-sistema': [
    { sistema_id: 's01', sistema_name: 'Alegria', cidade_id: 'c1' },
    { sistema_id: 's02', sistema_name: 'Pavuna', cidade_id: 'c2' },
  ],
  'subbacia-operacional': [
    { sub_bacia_id: 'b1', sub_bacia_name: 'Canal', sistema_id: 's01', sistema_name: 'Alegria' },
    { sub_bacia_id: 'b2', sub_bacia_name: 'Timbó', sistema_id: 's01', sistema_name: 'Alegria' },
    { sub_bacia_id: 'b9', sub_bacia_name: 'Acari', sistema_id: 's02', sistema_name: 'Pavuna' },
  ],
  'cts-operacional': [
    { cts_id: 't1', cts_name: 'CTS Alegria' },
    { cts_id: 't9', cts_name: 'CTS Pavuna' },
  ],
  'ete-capex': [
    { ete_id: 'e01', ete_name: 'ETE Alegria', sistema_id: 's01' },
    { ete_id: 'e02', ete_name: 'ETE Pavuna', sistema_id: 's02' },
  ],
  'sistema-topologia': [
    { sistema_id: 's01', componente_sistema_id: 'b1', componente_tipo: 'sub-bacia', componente_sistema_id_jusante: '' },
    { sistema_id: 's01', componente_sistema_id: 'b2', componente_tipo: 'sub-bacia', componente_sistema_id_jusante: 'e01' },
    { sistema_id: 's01', componente_sistema_id: 't1', componente_tipo: 'cts', componente_sistema_id_jusante: '' },
    { sistema_id: 's01', componente_sistema_id: 'e01', componente_tipo: 'ete', componente_sistema_id_jusante: '' },
    { sistema_id: 's02', componente_sistema_id: 'b9', componente_tipo: 'sub-bacia', componente_sistema_id_jusante: '' },
    { sistema_id: 's02', componente_sistema_id: 't9', componente_tipo: 'cts', componente_sistema_id_jusante: '' },
    { sistema_id: 's02', componente_sistema_id: 'e02', componente_tipo: 'ete', componente_sistema_id_jusante: '' },
  ],
  'componentes-subbacias-capex': [],
}

const ids = (origem: string) =>
  opcoesDestino(DADOS, { componente_sistema_id: origem }).map(([id]) => id)

describe('opcoesDestino — qualquer componente do mesmo sistema', () => {
  it('uma sub-bacia pode escoar para a CTS do sistema', () => {
    // Era o buraco: a lista trazia sub-bacias e ETEs, e não havia como declarar
    // que a sub-bacia escoa para o coletor.
    expect(ids('b1')).toContain('t1')
  })

  it('a lista traz os três tipos do sistema, e nada além', () => {
    expect(new Set(ids('b1'))).toEqual(new Set(['b2', 't1', 'e01']))
  })

  it('nenhum componente de OUTRO sistema entra', () => {
    for (const alheio of ['b9', 't9', 'e02']) {
      expect(ids('b1')).not.toContain(alheio)
    }
  })

  it('a CTS também é filtrada pelo sistema dela', () => {
    // Antes este ramo não filtrava nada: a CTS podia apontar para outro sistema,
    // e o servidor recusaria na hora de salvar.
    expect(new Set(ids('t1'))).toEqual(new Set(['b1', 'b2', 'e01']))
  })

  it('o próprio componente nunca aparece', () => {
    expect(ids('b2')).not.toContain('b2')
  })

  it('origem sem sistema herda a lista completa, em vez de um select vazio', () => {
    // É o estado de uma CTS recém-cadastrada, ainda não colocada em sistema.
    const solta = ids('desconhecido')
    expect(solta.length).toBeGreaterThan(3)
  })
})

describe('sistemaDoNo — a topologia manda', () => {
  it('a CTS colocada tem o sistema DELA, e não o do destino', () => {
    // A derivação antiga seguia o jusante; sem jusante, a CTS ficava sem
    // sistema mesmo estando num.
    expect(sistemaDoNo(DADOS, 't1')).toMatchObject({ id: 's01' })
  })

  it('a CTS do outro sistema não é confundida com a primeira', () => {
    expect(sistemaDoNo(DADOS, 't9')).toMatchObject({ id: 's02' })
  })
})
