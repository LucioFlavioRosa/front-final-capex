/**
 * ADICIONAR CTS AO SISTEMA — o caminho que a tela do Fluxo dispara.
 *
 * A tela escreve `sistema_id` na linha da CTS, na aba do Fluxo. Este teste faz o
 * mesmo pelo estado e confere as duas pontas: a CTS sai da lista dos sem
 * sistema, e o servidor passa a devolvê-la dentro do sistema escolhido.
 *
 * Também cobre o caminho de volta — tirar do sistema —, porque é ele que
 * devolve a base ao estado em que estava.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { api } from './api'
import { lerCadastro, salvarCadastro } from './cadastroApi'
import type { UnidadeState } from '../data/cadastroUnidade/types'

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
const UNIDADE = 'uB1'

let noAr = false
let colocada = ''

beforeAll(async () => {
  try {
    noAr = (await fetch(`${BASE}/readyz`)).ok
  } catch {
    noAr = false
  }
})

afterAll(async () => {
  if (!noAr || !colocada) return
  await api.del(`/api/unidades/${UNIDADE}/topologia/${colocada}`)
})

async function abrir(): Promise<UnidadeState> {
  const lido = await lerCadastro(UNIDADE)
  return {
    id: lido.unidade_id,
    name: lido.unidade_nome,
    regionalName: lido.regional_nome,
    cidades: [],
    data: lido.dados,
  }
}

describe('adicionar CTS ao sistema', () => {
  it('a CTS escolhida entra no sistema e sai da lista de disponíveis', async () => {
    if (!noAr) return console.log('backend fora do ar — pulado')

    const estado = await abrir()
    const soltas = estado.data['sistema-topologia'].filter(
      (t) => !t.sistema_id && t.componente_tipo === 'cts',
    )
    expect(soltas.length).toBeGreaterThan(0)

    // Um sistema DESMARCADO, para o limite de uma CTS não interferir.
    const semLimite = estado.data['cidade-sistema'].find((r) => r.usa_sistema_cts !== 'Sim')!
    expect(semLimite).toBeDefined()

    const alvo = soltas[0]
    colocada = alvo.componente_sistema_id
    const disponiveisAntes = soltas.length

    // O QUE A TELA FAZ: escreve o sistema na linha da CTS.
    alvo.sistema_id = semLimite.sistema_id
    alvo.sistema_name = semLimite.sistema_name
    await salvarCadastro(estado)

    const depois = await abrir()
    const linha = depois.data['sistema-topologia'].find(
      (t) => t.componente_sistema_id === colocada,
    )
    expect(linha?.sistema_id).toBe(semLimite.sistema_id)

    // Some da lista que o seletor oferece — um componente está em um sistema só.
    const disponiveisDepois = depois.data['sistema-topologia'].filter(
      (t) => !t.sistema_id && t.componente_tipo === 'cts',
    ).length
    expect(disponiveisDepois).toBe(disponiveisAntes - 1)

    // E aparece no Grupo 05, que só lista as CTS COLOCADAS nesta unidade.
    expect(depois.data['cts-operacional'].some((c) => c.cts_id === colocada)).toBe(true)
  }, 300_000)

  it('tirar do sistema devolve a CTS à lista, com o nome preservado', async () => {
    if (!noAr) return console.log('backend fora do ar — pulado')
    expect(colocada).not.toBe('')

    await api.del(`/api/unidades/${UNIDADE}/topologia/${colocada}`)
    const depois = await abrir()
    const linha = depois.data['sistema-topologia'].find(
      (t) => t.componente_sistema_id === colocada,
    )

    expect(linha?.sistema_id).toBe('')
    // O nome é o que permite escolhê-la de novo numa lista — apagar a linha o
    // perderia, e é por isso que o servidor põe o sistema em nulo em vez de
    // apagar.
    expect(linha?.componente_sistema_nome).not.toBe('')
    colocada = ''
  }, 300_000)
})
