/**
 * A CTS FORA DE SISTEMA NÃO CONTA NA COMPLETUDE.
 *
 * A leitura traz as CTS livres (`incluirLivres`), e a aba da CTS tem linhas
 * com tudo em branco que o motor nunca leria. Se contassem, a Revisão travaria
 * a rodada. Aqui se prende que a régua segue a TOPOLOGIA — colocada conta,
 * livre não — nas duas abas de CTS, no total geral e no portão da Revisão.
 */
import { describe, expect, it } from 'vitest'
import { contarAba, linhasQueContam, totalGeral } from './calc'
import { validarTopologia } from './validacao'
import { progressoAba, progressoPorBloco } from '../data/cadastroUnidade/blocos'
import { SCHEMA } from '../data/cadastroUnidade/schema'
import { unidadeDeTeste } from '../testes/cadastroDePlanilha'

const abaCts = SCHEMA.find((a) => a.key === 'cts-operacional')!
const abaObras = SCHEMA.find((a) => a.key === 'componentes-cts-capex')!

describe('a CTS livre e a completude', () => {
  it('só as CTS colocadas num sistema entram na conta, nas duas abas', () => {
    const { data } = unidadeDeTeste()
    expect(linhasQueContam('cts-operacional', data['cts-operacional'], data).map((r) => r.cts_id)).toEqual(['cts_001'])
    expect(linhasQueContam('componentes-cts-capex', data['componentes-cts-capex'], data).map((r) => r.cts_id)).toEqual(['cts_001'])
    // nas outras abas nada muda
    expect(linhasQueContam('subbacia-operacional', data['subbacia-operacional'], data)).toBe(data['subbacia-operacional'])
  })

  it('sem o cadastro à mão, conta tudo', () => {
    const { data } = unidadeDeTeste()
    const semDados = contarAba('cts-operacional', data['cts-operacional'])
    const comDados = contarAba('cts-operacional', data['cts-operacional'], data)
    expect(semDados.total).toBeGreaterThan(comDados.total)
  })

  it('a CTS livre com tudo em branco não segura a rodada; colocada, segura', () => {
    const { data } = unidadeDeTeste()
    // cts_001 está completa (população é opcional); cts_002, com preço em branco, não conta
    expect(progressoAba(abaCts, data['cts-operacional'], data).pronta).toBe(true)
    expect(progressoAba(abaCts, data['cts-operacional']).pronta).toBe(false) // sem a régua, seguraria
    expect(progressoAba(abaObras, data['componentes-cts-capex'], data).pronta).toBe(true)

    // colocada, passa a contar — e a aba deixa de estar pronta
    const colocada: typeof data = {
      ...data,
      'sistema-topologia': data['sistema-topologia'].map((t) =>
        t.componente_sistema_id === 'cts_002' ? { ...t, sistema_id: 's2', sistema_name: 'Sistema Dois' } : t,
      ),
    }
    expect(progressoAba(abaCts, colocada['cts-operacional'], colocada).pronta).toBe(false)
    expect(progressoAba(abaObras, colocada['componentes-cts-capex'], colocada).pronta).toBe(false)
    expect(totalGeral(colocada).total).toBeGreaterThan(totalGeral(data).total)
  })

  it('a CTS livre não é "origem sem destino": ela não está no fluxo', () => {
    const { data } = unidadeDeTeste()
    expect(validarTopologia(data).filter((p) => p.titulo.startsWith('Origem sem destino'))).toEqual([])
    // colocada e ainda sem jusante, aí sim é a folha que a regra existe para pegar
    const colocada = {
      ...data,
      'sistema-topologia': data['sistema-topologia'].map((t) =>
        t.componente_sistema_id === 'cts_002' ? { ...t, sistema_id: 's2', sistema_name: 'Sistema Dois' } : t,
      ),
    }
    expect(validarTopologia(colocada).map((p) => p.titulo)).toContain('Origem sem destino no fluxo')
  })

  it('o progresso por bloco usa a mesma régua', () => {
    const { data } = unidadeDeTeste()
    const cts = progressoPorBloco(data).flatMap((b) => b.abas).find((a) => a.aba.key === 'componentes-cts-capex')!
    expect(cts.total).toBe(contarAba('componentes-cts-capex', data['componentes-cts-capex'], data).total)
  })
})
