/**
 * O RECORTE DA EXPLICABILIDADE POR SISTEMA — o nível 3, sem rota nova.
 *
 * O backend serve explicabilidade em dois recortes: a rodada inteira e uma
 * cidade. O nível 3 (sistema) não tem rota própria, e mesmo assim é onde a
 * pergunta "quais sub-bacias DESTE sistema ficaram fora" aparece naturalmente —
 * é o nível em que alguém está olhando uma ETE e um conjunto de sub-bacias.
 *
 * Dá para responder sem pedir nada ao backend porque os dois payloads já
 * carregam `sistemaId` em cada item e em cada elo. Então o recorte é filtro, e
 * filtro é barato: a cidade mais cheia da base tem 930 sub-bacias, e a maioria
 * esmagadora dos sistemas tem menos de vinte.
 *
 * Devolve o MESMO formato que entrou, e é isso que deixa `SecaoPorQue` ser
 * reusada sem uma linha de mudança — o componente não precisa saber se está
 * mostrando a rodada, uma cidade ou um sistema.
 *
 * `totalSubbacias` vem de FORA porque o payload não sabe quantas sub-bacias o
 * sistema tem no total, só quantas ficaram de fora. Sem esse número o
 * denominador seria "as que ficaram de fora", e a frase viraria "3 de 3 não
 * faturam" num sistema de doze.
 */
import type { ExplicabilidadeGlobal } from '@/rodada/domain/resultado'

export function recortarPorSistema(
  dados: ExplicabilidadeGlobal,
  sistemaId: string,
  totalSubbaciasDoSistema: number,
): ExplicabilidadeGlobal {
  const categorias = dados.categorias
    .map((c) => {
      const itens = c.itens.filter((i) => i.sistemaId === sistemaId)
      return {
        ...c,
        itens,
        subbacias: itens.length,
        vazaoPresa: itens.reduce((s, i) => s + i.vazaoPresa, 0),
      }
    })
    // Categoria que não sobrou ninguém sai da lista: mostrá-la com zero seria
    // afirmar que o motivo existe aqui, e ele não existe.
    .filter((c) => c.itens.length > 0)

  return {
    categorias,
    elos: dados.elos.filter((e) => e.sistemaId === sistemaId),
    naoFaturando: categorias.reduce((s, c) => s + c.subbacias, 0),
    totalSubbacias: totalSubbaciasDoSistema,
  }
}
