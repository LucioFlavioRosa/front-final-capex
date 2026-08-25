import { describe, expect, it } from 'vitest'
import { MINUTOS_ATE_ESTRANHAR, decorrido, demorandoDemais } from '@/rodada/domain/espera'

/** Um instante fixo, para o teste não depender do relógio da máquina. */
const AGORA = new Date('2026-08-11T15:00:00Z').getTime()
const atras = (ms: number) => new Date(AGORA - ms).toISOString()

const SEG = 1000
const MIN = 60 * SEG
const HORA = 60 * MIN

describe('decorrido', () => {
  it('conta em segundos no primeiro minuto', () => {
    // A diferença entre 5s e 50s é justamente o que diz se algo está acontecendo;
    // arredondar tudo para "há 0 min" apagaria o único sinal desse trecho.
    expect(decorrido(atras(5 * SEG), AGORA)).toBe('há 5s')
    expect(decorrido(atras(59 * SEG), AGORA)).toBe('há 59s')
  })

  it('vira minutos, e depois horas com os minutos junto', () => {
    expect(decorrido(atras(MIN), AGORA)).toBe('há 1 min')
    expect(decorrido(atras(59 * MIN), AGORA)).toBe('há 59 min')
    expect(decorrido(atras(HORA + 5 * MIN), AGORA)).toBe('há 1h05')
    expect(decorrido(atras(3 * HORA), AGORA)).toBe('há 3h00')
  })

  it('devolve vazio quando não há data, ou quando ela não é data', () => {
    // A tela concatena o resultado numa frase. String vazia some sozinha; um
    // "NaN" ou "Invalid Date" apareceria em produção ao lado do motivo da fila.
    expect(decorrido(null, AGORA)).toBe('')
    expect(decorrido(undefined, AGORA)).toBe('')
    expect(decorrido('ontem de manhã', AGORA)).toBe('')
  })

  it('relógio adiantado no servidor não vira tempo negativo', () => {
    expect(decorrido(new Date(AGORA + 10 * SEG).toISOString(), AGORA)).toBe('há 0s')
  })
})

describe('demorandoDemais', () => {
  it('só depois do limite — o segundo exato ainda é espera normal', () => {
    const limite = MINUTOS_ATE_ESTRANHAR * MIN
    expect(demorandoDemais(atras(limite - SEG), AGORA)).toBe(false)
    expect(demorandoDemais(atras(limite), AGORA)).toBe(false)
    expect(demorandoDemais(atras(limite + SEG), AGORA)).toBe(true)
  })

  it('sem data não afirma nada', () => {
    // Servidor anterior ao `pedidaEm` não manda o campo. "Não sei" não pode virar
    // um alerta laranja dizendo que a rodada travou.
    expect(demorandoDemais(null, AGORA)).toBe(false)
    expect(demorandoDemais('', AGORA)).toBe(false)
    expect(demorandoDemais('ontem de manhã', AGORA)).toBe(false)
  })
})
