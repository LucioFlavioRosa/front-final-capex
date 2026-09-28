import { describe, expect, it } from 'vitest'
import {
  VAZIO,
  brl,
  brlSinal,
  compacto,
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
  const numericas = { brl, brlSinal, compacto, pct, vazao, inteiro }

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

describe('não há abreviação em nenhum valor de dinheiro', () => {
  /*
   * A REGRA DO DONO DO PRODUTO (28/09/2026): sempre em reais, por extenso.
   *
   * Nasceu de uma usuária conferir a receita à mão e não reconhecer o número da
   * simulação. "R$ 2,3 bi" ao lado de uma conta feita em milhões exige que quem
   * lê carregue a escala de cabeça, e numa tela de decisão de investimento essa
   * troca não se paga. O teste varre as ordens de grandeza que apareciam
   * abreviadas até aqui — mil, milhão, bilhão.
   */
  const SUFIXOS = [/Mi/, /mi/, /bi/, /Bi/, /k/, /M/, /mil/]

  for (const valor of [1_234, 300_000, 184_216_430, 2_274_759_738, -404_900_000]) {
    it(`${valor} sai por extenso, sem sufixo de escala`, () => {
      for (const fn of [brl, brlSinal, compacto]) {
        const texto = fn(valor)
        for (const sufixo of SUFIXOS) expect(texto).not.toMatch(sufixo)
      }
    })
  }

  it('o bilhão aparece inteiro, com separador de milhar', () => {
    expect(brl(2_274_759_738)).toMatch(/^R\$\s?2\.274\.759\.738$/)
  })

  it('o valor abaixo de mil não ganha enfeite', () => {
    expect(brl(742)).toMatch(/^R\$\s?742$/)
  })

  it('brlSinal marca quem tira dinheiro, e o sinal não substitui o R$', () => {
    expect(brlSinal(7_200_000)).toMatch(/^\+R\$\s?7\.200\.000$/)
    expect(brlSinal(-404_900_000)).toMatch(/^−R\$\s?404\.900\.000$/)
    expect(brlSinal(0)).toMatch(/^R\$\s?0$/)
  })

  it('compacto é contagem por extenso — não leva R$ nem sufixo', () => {
    expect(compacto(5_500)).toMatch(/^5\.500$/)
    expect(compacto(1_200_000)).toMatch(/^1\.200\.000$/)
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
