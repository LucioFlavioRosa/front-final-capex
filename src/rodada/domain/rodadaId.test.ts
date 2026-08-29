/**
 * O corte vinha do começo do id, e o começo é igual para todas as rodadas do
 * ano. Este teste prende o lado certo.
 */
import { describe, expect, it } from 'vitest'
import { idCurtoDaRodada } from './rodadaId'

describe('idCurtoDaRodada', () => {
  it('devolve o sufixo, que é a parte que distingue', () => {
    expect(idCurtoDaRodada('run_20260814_153913_40e1e8')).toBe('40e1e8')
  })

  it('duas rodadas do MESMO dia não colidem — era o defeito', () => {
    // Com `slice(0, 8)` as duas viravam `run_2026`, e o histórico mostrava a
    // mesma string em toda linha ao lado da data, como se identificasse.
    const a = idCurtoDaRodada('run_20260814_153913_40e1e8')
    const b = idCurtoDaRodada('run_20260814_160640_9fdf6d')
    expect(a).not.toBe(b)
  })

  it('id fora da forma esperada cai no começo, e não em vazio', () => {
    // Um id importado ou renomeado à mão não deve sumir da tela.
    expect(idCurtoDaRodada('importado-2024')).toBe('importad')
    expect(idCurtoDaRodada('')).toBe('')
  })
})
