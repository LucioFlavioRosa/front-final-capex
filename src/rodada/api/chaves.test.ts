import { describe, expect, it } from 'vitest'
import { chaves } from '@/rodada/api/queries'

/**
 * A CHAVE DE CACHE DA LISTA DE OBRAS.
 *
 * Ela é montada CAMPO A CAMPO, e não a partir do objeto de filtro — o que
 * significa que um filtro novo entra no tipo, entra na querystring, e continua
 * fora da chave sem nada reclamar. Foi o que aconteceu com `recorte`: as
 * consultas de rodada usam `staleTime: Infinity` (a rodada é imutável), então
 * abrir 2027 em "todas" e depois em "de terceiro" devolvia as 163 linhas do
 * cache no lugar das 91 — e a exportação para Excel levava junto, porque ela
 * exporta o que a lista tem.
 *
 * O defeito era invisível: nenhuma requisição falhava, nenhum tipo reclamava,
 * e o número na tela simplesmente era o do filtro anterior.
 *
 * O teste abaixo é uma varredura, e não uma lista escrita à mão: ele percorre
 * os campos do filtro e exige que CADA UM mude a chave. Um filtro novo esquecido
 * aqui falha sozinho, sem ninguém lembrar de acrescentar o caso.
 */
describe('chaves.obras — todo filtro precisa entrar na chave', () => {
  const BASE = {
    situacao: 'construida',
    cidadeId: 'Belford Roxo',
    ano: 2027,
    recorte: 'todas',
    pagina: 1,
    tamanho: 500,
    ordenar: 'inicio',
  }

  const OUTRO: Record<keyof typeof BASE, string | number> = {
    situacao: 'terceiro',
    cidadeId: 'Cabo Frio',
    ano: 2028,
    recorte: 'terceiro',
    pagina: 2,
    tamanho: 50,
    ordenar: 'capex',
  }

  it.each(Object.keys(BASE) as (keyof typeof BASE)[])(
    'trocar `%s` produz uma chave diferente',
    (campo) => {
      const a = chaves.obras('run_x', BASE)
      const b = chaves.obras('run_x', { ...BASE, [campo]: OUTRO[campo] })
      expect(JSON.stringify(b)).not.toBe(JSON.stringify(a))
    },
  )

  it('filtros iguais produzem a MESMA chave — senão o cache nunca acerta', () => {
    expect(chaves.obras('run_x', BASE)).toEqual(chaves.obras('run_x', { ...BASE }))
  })

  it('rodadas diferentes nunca compartilham chave', () => {
    expect(chaves.obras('run_a', BASE)).not.toEqual(chaves.obras('run_b', BASE))
  })
})
