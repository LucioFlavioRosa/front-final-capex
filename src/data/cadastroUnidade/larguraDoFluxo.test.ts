/**
 * A ABA DO FLUXO CABE NA TELA, com o botão de ação visível.
 *
 * Duas coisas a empurravam para fora e viraram rolagem lateral:
 *
 *   1. `sistema_id` e `sistema_name` ocupavam largura repetindo, linha após
 *      linha, o sistema que a barra acima já diz — a aba trabalha um por vez.
 *   2. `larguraDaGrade` só somava a coluna de ações quando a aba criava linhas.
 *      O Fluxo não cria, mas tem ação por linha (tirar a CTS do sistema), então
 *      a conta saía 44px curta e o botão nascia fora da área visível.
 */
import { describe, expect, it } from 'vitest'
import { SCHEMA, larguraDaGrade, LARGURA_ACOES } from './schema'

const fluxo = SCHEMA.find((a) => a.key === 'sistema-topologia')!

/** Largura útil num monitor comum, descontando o resto da tela do wizard. */
const TELA_ESTREITA = 1024

describe('a grade do Fluxo', () => {
  it('não mostra o sistema em coluna — ele está na barra de escopo', () => {
    const colunas = fluxo.cols.map((c) => c.coluna)
    expect(colunas).not.toContain('sistema_id')
    expect(colunas).not.toContain('sistema_name')
  })

  it('mas o DADO continua na linha — é ele que a tela escreve', () => {
    // A coluna saiu da grade, não do modelo: `escopoInicial`, `casaComEscopo`, o
    // unifilar e a gravação leem `row.sistema_id`.
    expect(fluxo.escopo?.sistema).toBe('fluxo')
  })

  it('a largura conta a coluna de ações, mesmo sem "adicionar linha"', () => {
    expect(fluxo.addRow).toBeFalsy()
    const semAcoes = larguraDaGrade(fluxo, false)
    const comAcoes = larguraDaGrade(fluxo, true)
    expect(comAcoes - semAcoes).toBe(LARGURA_ACOES)
  })

  it('cabe numa tela estreita, com o botão dentro', () => {
    const largura = larguraDaGrade(fluxo, true)
    expect(largura).toBeLessThan(TELA_ESTREITA)
  })
})
