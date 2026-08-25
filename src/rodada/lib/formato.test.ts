import { describe, expect, it } from 'vitest'
import {
  VAZIO,
  brl,
  brlMi,
  dataCurta,
  dataHora,
  deTotal,
  duracao,
  inteiro,
  pct,
  vazao,
} from '@/rodada/lib/formato'

/**
 * Teste que a origem não tinha, e que existe por causa de um defeito real do
 * NOSSO `lib/format.ts`: `reais(null)` devolvia a string `"R$ NaN"`.
 *
 * O `—` aparece em seis das sete telas de rodada. Se cada formatador decidir
 * sozinho o que fazer com nulo, "não existe" ganha várias aparências e a de
 * algumas delas é um número — que é a única aparência que ele não pode ter.
 *
 * Por isso o primeiro bloco varre TODAS as funções numéricas com a mesma
 * bateria, em vez de testar uma a uma: a regra é da família, não de cada uma.
 */
describe('nulo nunca vira número', () => {
  const numericas = { brl, brlMi, pct, vazao, inteiro }

  for (const [nome, fn] of Object.entries(numericas)) {
    it(`${nome} devolve o traço para null, undefined e NaN`, () => {
      expect(fn(null)).toBe(VAZIO)
      expect(fn(undefined)).toBe(VAZIO)
      expect(fn(Number.NaN)).toBe(VAZIO)
    })

    it(`${nome} NÃO confunde zero com ausente`, () => {
      // O caso que motivou a regra: ocupação de ETE com capacidade zero.
      // "0%" afirma que a ETE está vazia; ausente diz que a conta não existe.
      expect(fn(0)).not.toBe(VAZIO)
    })
  }
})

describe('brl', () => {
  it('não mostra centavos em agregado', () => {
    // Centavo em cima de R$ 184 milhões é ruído, e sugere uma precisão que a
    // rodada não tem.
    expect(brl(184216430.37)).not.toContain(',')
  })

  it('formata em pt-BR', () => {
    expect(brl(1234567)).toMatch(/^R\$\s?1\.234\.567$/)
  })
})

describe('brlMi', () => {
  it('encolhe para milhões acima de 1 mi', () => {
    expect(brlMi(184_216_430)).toBe('R$ 184,2 Mi')
  })

  it('abaixo de 1 milhão cai para o valor cheio', () => {
    // "R$ 0,3 Mi" esconde a ordem de grandeza de quem lê rápido.
    expect(brlMi(300_000)).not.toContain('Mi')
  })

  it('preserva o sinal, que importa em fluxo de escoamento', () => {
    expect(brlMi(-12_400_000)).toContain('-')
  })
})

describe('deTotal', () => {
  it('monta o par', () => {
    expect(deTotal(28, 31)).toBe('28 de 31')
  })

  it('basta uma metade ausente para o par inteiro sumir', () => {
    // Meio par ("28 de —") diz menos que nada: sugere que o total existe.
    expect(deTotal(28, null)).toBe(VAZIO)
    expect(deTotal(null, 31)).toBe(VAZIO)
  })
})

describe('duracao', () => {
  it('mostra segundos abaixo de um minuto', () => {
    expect(duracao(42)).toBe('42s')
  })

  it('promove para minutos, e omite o zero de segundos', () => {
    expect(duracao(100)).toBe('1m 40s')
    expect(duracao(120)).toBe('2m')
  })
})

describe('datas', () => {
  it('data inválida vira traço, e não "Invalid Date"', () => {
    expect(dataHora('nao-e-data')).toBe(VAZIO)
    expect(dataCurta('nao-e-data')).toBe(VAZIO)
    expect(dataHora(null)).toBe(VAZIO)
    expect(dataCurta(undefined)).toBe(VAZIO)
  })

  it('dataCurta omite o ano, para desempatar rodadas na mesma linha', () => {
    const curta = dataCurta('2026-08-14T16:20:00Z')
    expect(curta).not.toContain('2026')
    expect(curta).toMatch(/^\d{2}\/\d{2}/)
  })
})
