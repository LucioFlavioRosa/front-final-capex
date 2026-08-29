/**
 * QUANTO O DESENHO PEDE — a conta que o layout de duas colunas consulta antes de
 * decidir se cabe.
 *
 * Ela existe para não haver DOIS lugares calculando a largura do mesmo desenho:
 * o `Desenho` a usa para o `viewBox`, e o `CadastroWizard` para reservar a
 * coluna. Enquanto o wizard reservava um número fixo (o mínimo genérico de
 * 460px), um sistema largo cujo piso era 582 sobrava para fora e caía na rolagem
 * lateral — que é justamente o que um unifilar não pode pedir, porque ele existe
 * para mostrar o sistema inteiro de uma vez.
 */
import { describe, expect, it } from 'vitest'
import { larguraMinimaDoDesenho, larguraNaturalDoDesenho } from './Unifilar'
import type { NoUnifilar, UnifilarSistema } from '../../../domain/fluxo'

/** Um sistema com `porNivel` nós em cada faixa, de cima para baixo. */
function sistema(porNivel: number[]): UnifilarSistema {
  const nos: NoUnifilar[] = []
  porNivel.forEach((quantos, i) => {
    for (let k = 0; k < quantos; k++) {
      nos.push({
        id: `n${i}_${k}`,
        nome: `no ${i}_${k}`,
        tipo: 'subbacia',
        nivel: i + 1,
        pontaSolta: false,
        emCiclo: false,
        vazao: null,
      })
    }
  })
  return { nos, arestas: [], soltos: [], niveis: porNivel.length }
}

describe('a largura que o desenho pede', () => {
  it('cresce com o nível MAIS CHEIO, que é quem manda na largura', () => {
    const estreito = larguraNaturalDoDesenho(sistema([1, 1, 1]))
    const largo = larguraNaturalDoDesenho(sistema([5, 3, 1]))
    expect(largo).toBeGreaterThan(estreito)
  })

  it('não desce do mínimo legível, por menor que seja o sistema', () => {
    // Um sistema de dois nós não deve virar um desenho minúsculo.
    expect(larguraNaturalDoDesenho(sistema([1, 1]))).toBe(460)
  })

  it('a caixa estreita entra a partir de quatro nós na faixa', () => {
    // De quatro para cima a caixa encolhe (132 em vez de 168), então a largura
    // NÃO cresce proporcionalmente ao número de nós — é o que troca "menos texto
    // legível" por "texto menor mas ainda legível".
    const tres = larguraNaturalDoDesenho(sistema([3]))
    const quatro = larguraNaturalDoDesenho(sistema([4]))
    expect(quatro - tres).toBeLessThan(168)
  })

  it('o mínimo da COLUNA inclui a moldura do painel, e não só o SVG', () => {
    // Reservar só o SVG deixava 9px de rolagem — e rolagem de 9px é rolagem.
    const uni = sistema([5, 3, 1])
    expect(larguraMinimaDoDesenho(uni)).toBeGreaterThan(larguraNaturalDoDesenho(uni) * 0.75)
  })

  it('o mínimo é sempre menor que o natural — senão a coluna nunca caberia', () => {
    for (const faixas of [[1, 1], [3, 2, 1], [5, 4, 3, 2, 1], [8, 1]]) {
      const uni = sistema(faixas)
      expect(larguraMinimaDoDesenho(uni)).toBeLessThan(larguraNaturalDoDesenho(uni))
    }
  })
})
