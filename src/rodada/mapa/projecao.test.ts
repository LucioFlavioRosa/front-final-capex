import { describe, expect, it } from 'vitest'
import malha from '@/rodada/mapa/municipios-56.geo.json'
import { chaveDoNome, corteDaFracao, projetar, recortarMalha } from '@/rodada/mapa/projecao'
import type { MalhaMunicipal } from '@/rodada/mapa/projecao'

const TODOS = (malha as unknown as MalhaMunicipal).features
/** Só os da unidade: são os únicos com rótulo, cor, clique e chave de join. */
const MUNICIPIOS = TODOS.filter((f) => f.properties.naUnidade)

/**
 * O centroide já saiu errado uma vez — por um fator de 2, escrevendo `3 * A`
 * onde a fórmula pede `6 * A`. O sintoma não foi um rótulo torto: as âncoras
 * caíram FORA do `viewBox` e os rótulos sumiram da tela, o que se lê como "essa
 * parte ainda não foi feita". Erro de escala em geometria não se denuncia; ele
 * produz um desenho plausível em outro lugar.
 *
 * Daí um teste sobre PROPRIEDADES, e não sobre coordenadas fixas: coordenada
 * esperada quebraria a cada `TOLERANCIA` ajustada no gerador da malha, e
 * ninguém saberia dizer se quebrou porque piorou ou porque mudou.
 */
describe('projeção do mapa de municípios', () => {
  const LARG = 1000
  const ALT = 700
  const p = projetar(TODOS, LARG, ALT)

  it('a malha tem o estado inteiro, com os 19 da unidade marcados', () => {
    expect(TODOS).toHaveLength(92)
    expect(MUNICIPIOS).toHaveLength(19)
  })

  /**
   * `cidade` é a chave do join com `otim_cidade.cidade`, e ela só pode existir
   * onde há resultado. Um município de contexto com chave convidaria a procurar
   * um valor que nunca vai existir — e um da unidade sem chave sumiria da
   * pintura sem erro nenhum.
   */
  it('só os da unidade têm chave de join', () => {
    for (const m of TODOS) {
      expect(typeof m.properties.cidade === 'string', m.properties.nome).toBe(
        m.properties.naUnidade,
      )
    }
  })

  it('todo município produz um caminho fechado', () => {
    for (const m of TODOS) {
      const d = p.caminho(m)
      expect(d.startsWith('M'), m.properties.nome).toBe(true)
      expect(d.endsWith('Z'), m.properties.nome).toBe(true)
      expect(d).not.toContain('NaN')
    }
  })

  it('toda âncora de rótulo cai dentro do viewBox', () => {
    for (const m of TODOS) {
      const [x, y] = p.ancora(m)
      expect(Number.isFinite(x), m.properties.nome).toBe(true)
      expect(x, m.properties.nome).toBeGreaterThanOrEqual(0)
      expect(x, m.properties.nome).toBeLessThanOrEqual(LARG)
      expect(y, m.properties.nome).toBeGreaterThanOrEqual(0)
      expect(y, m.properties.nome).toBeLessThanOrEqual(ALT)
    }
  })

  /**
   * A orientação, que é o outro erro que não se denuncia: o y do SVG cresce
   * para baixo e a latitude cresce para o norte. Sem a inversão o mapa sai de
   * ponta-cabeça — e um Rio de Janeiro invertido continua parecendo um mapa
   * para quem não conhece a costa.
   */
  it('o norte fica em cima', () => {
    const acha = (nome: string) => {
      const m = MUNICIPIOS.find((f) => f.properties.nome === nome)
      if (!m) throw new Error(`município ausente na malha: ${nome}`)
      return p.ancora(m)
    }
    // Miracema (~21,4° S) é bem ao norte de Maricá (~22,9° S).
    expect(acha('Miracema')[1]).toBeLessThan(acha('Maricá')[1])
    // E o Rio de Janeiro é o mais a OESTE dos dois na baía.
    expect(acha('Rio de Janeiro')[0]).toBeLessThan(acha('São Gonçalo')[0])
  })

  /**
   * O de-para do gerador é a única ponte entre o resultado do motor e a
   * geometria. Uma chave com acento ou minúscula não casaria com
   * `otim_cidade.cidade`, e o município sumiria do mapa sem erro nenhum.
   */
  it('a chave de join está na forma que o motor devolve', () => {
    for (const m of MUNICIPIOS) {
      expect(m.properties.cidade).toBe(m.properties.cidade!.toUpperCase())
      expect(m.properties.cidade).not.toMatch(/[À-ÿ]/)
    }
  })

  /**
   * A LINHA D'ÁGUA — e este é o teste que importa, porque o erro que ele pega
   * é invisível.
   *
   * Cortar a 60% da ALTURA em vez de 60% da ÁREA produz um desenho plausível:
   * o município fica preenchido, a linha fica reta, nada quebra. Só que ele
   * afirma um número diferente do que está escrito ao lado, e a diferença muda
   * de município para município — some numa cidade compacta e chega a mais de
   * dez pontos numa comprida. É por isso que a verificação é sobre a ÁREA
   * medida de volta, e não sobre a posição da linha.
   */
  describe("linha d'água", () => {
    /** Área do polígono recortado por `y >= corte` — a conta independente. */
    const areaAbaixo = (aneis: [number, number][][], corte: number) => {
      let total = 0
      for (const anel of aneis) {
        const rec: [number, number][] = []
        for (let i = 0; i < anel.length - 1; i++) {
          const a = anel[i]
          const b = anel[i + 1]
          const da = a[1] >= corte
          const db = b[1] >= corte
          const cruzar = (): [number, number] => {
            const t = (corte - a[1]) / (b[1] - a[1])
            return [a[0] + (b[0] - a[0]) * t, corte]
          }
          if (da) {
            rec.push(a)
            if (!db) rec.push(cruzar())
          } else if (db) {
            rec.push(cruzar())
          }
        }
        if (rec.length > 2) {
          rec.push(rec[0])
          let s = 0
          for (let i = 0; i < rec.length - 1; i++) {
            s += rec[i][0] * rec[i + 1][1] - rec[i + 1][0] * rec[i][1]
          }
          total += Math.abs(s / 2)
        }
      }
      return total
    }
    const areaTotal = (aneis: [number, number][][]) => areaAbaixo(aneis, -Infinity)

    it('o corte entrega a fração de ÁREA pedida, nas 19 e em toda a faixa', () => {
      for (const m of MUNICIPIOS) {
        const aneis = p.aneisProjetados(m)
        const { topo, base } = p.extensaoVertical(m)
        const total = areaTotal(aneis)
        for (const fracao of [0.1, 0.25, 0.5, 0.75, 0.9]) {
          const y = corteDaFracao(aneis, fracao, topo, base)
          const obtida = areaAbaixo(aneis, y) / total
          expect(Math.abs(obtida - fracao), `${m.properties.nome} @ ${fracao}`).toBeLessThan(
            0.005,
          )
        }
      }
    })

    /**
     * O que este caso protege: 0 e 1 não passam pela busca, e trocá-los
     * deixaria toda cidade de valor zero PREENCHIDA — o pior erro possível
     * numa camada de cobertura.
     */
    it('vazio é a base e cheio é o topo, sem passar pela busca', () => {
      const m = MUNICIPIOS[0]
      const aneis = p.aneisProjetados(m)
      const { topo, base } = p.extensaoVertical(m)
      expect(corteDaFracao(aneis, 0, topo, base)).toBe(base)
      expect(corteDaFracao(aneis, 1, topo, base)).toBe(topo)
    })

    /**
     * A ÁREA VEM DA PROJEÇÃO, não de lon/lat. Em graus² a correção de latitude
     * não entrou, e o polígono medido não é o polígono desenhado — a linha
     * sairia sistematicamente fora do lugar, e mais fora quanto mais alongado
     * o município no eixo leste-oeste.
     */
    it('a metade da área não é a metade da altura', () => {
      // Um município qualquer serve: a igualdade só valeria num retângulo.
      const m = MUNICIPIOS.find((f) => f.properties.nome === 'Rio de Janeiro')!
      const aneis = p.aneisProjetados(m)
      const { topo, base } = p.extensaoVertical(m)
      const meioDaArea = corteDaFracao(aneis, 0.5, topo, base)
      const meioDaAltura = (topo + base) / 2
      expect(Math.abs(meioDaArea - meioDaAltura)).toBeGreaterThan(0.5)
    })
  })
})

/**
 * A MALHA SEGUE A RODADA. O arquivo foi gerado para a unidade 56 com os nomes
 * que o motor devolvia em 2026-08 (`MAGE`); o banco de hoje devolve `Magé`, e
 * as rodadas locais são de outras unidades. Sem o recorte, nada casava.
 */
describe('recortarMalha — quem é da unidade é quem está na rodada', () => {
  const MALHA = malha as unknown as MalhaMunicipal

  it('casa o nome acentuado do banco com o nome oficial do IBGE', () => {
    const r = recortarMalha(MALHA, ['Magé', 'Cachoeiras de Macacu'])
    const daUnidade = r.features.filter((f) => f.properties.naUnidade)
    expect(daUnidade.map((f) => f.properties.nome).sort()).toEqual(['Cachoeiras de Macacu', 'Magé'])
    // A chave de join é o nome EXATO da rodada, que é o que `dados` usa.
    expect(daUnidade.map((f) => f.properties.cidade).sort()).toEqual(['Cachoeiras de Macacu', 'Magé'])
  })

  it('continua casando a chave antiga do motor, inclusive a abreviada do de-para', () => {
    const r = recortarMalha(MALHA, ['MAGE', 'S.FCO.DO ITABAPOANA'])
    const nomes = r.features.filter((f) => f.properties.naUnidade).map((f) => f.properties.nome)
    expect(nomes.sort()).toEqual(['Magé', 'São Francisco de Itabapoana'])
  })

  it('uma cidade de outra unidade do mesmo estado entra — a malha é do estado inteiro', () => {
    const r = recortarMalha(MALHA, ['Angra dos Reis'])
    expect(r.features.filter((f) => f.properties.naUnidade).map((f) => f.properties.nome)).toEqual([
      'Angra dos Reis',
    ])
  })

  it('o que a rodada não tem vira contexto, mesmo que o gerador o tivesse marcado', () => {
    const r = recortarMalha(MALHA, ['Angra dos Reis'])
    const mage = r.features.find((f) => f.properties.nome === 'Magé')!
    expect(mage.properties.naUnidade).toBe(false)
    expect(mage.properties.cidade).toBeNull()
  })

  it('cidade fora do estado fica sem contorno — e é o aviso do mapa que a nomeia', () => {
    const r = recortarMalha(MALHA, ['Campinas'])
    expect(r.features.some((f) => f.properties.naUnidade)).toBe(false)
  })

  it('não muda a malha de entrada', () => {
    const antes = MALHA.features.filter((f) => f.properties.naUnidade).length
    recortarMalha(MALHA, ['Angra dos Reis'])
    expect(MALHA.features.filter((f) => f.properties.naUnidade).length).toBe(antes)
  })
})

describe('chaveDoNome', () => {
  it('iguala acento, caixa e espaços — e nada mais', () => {
    expect(chaveDoNome('Magé')).toBe('MAGE')
    expect(chaveDoNome('  São   Gonçalo ')).toBe('SAO GONCALO')
    expect(chaveDoNome('S.FCO.DO ITABAPOANA')).toBe('S.FCO.DO ITABAPOANA')
  })
})
