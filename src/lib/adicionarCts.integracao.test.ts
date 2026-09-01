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
import type { BaseDoCadastro } from './cadastroApi'
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

/**
 * A BASE PAREADA COM O ESTADO QUE VEIO COM ELA.
 *
 * `salvarCadastro` passou a exigir a linha-base como parâmetro — antes ela vinha
 * de um `Map` escondido dentro de `cadastroApi`. Guardar num `let` solto daria
 * certo por sorte (a base do último `abrir` seria a de qualquer salvamento);
 * o `WeakMap` amarra cada base ao seu estado, e aí a ordem das chamadas não
 * importa.
 */
const bases = new WeakMap<UnidadeState, BaseDoCadastro>()

/** Salva o estado com a base que a leitura dele devolveu. */
function salvar(estado: UnidadeState) {
  const base = bases.get(estado)
  if (!base) throw new Error('estado montado sem `abrir()` — não há base para o diff')
  return salvarCadastro(estado, base)
}

async function abrir(): Promise<UnidadeState> {
  const lido = await lerCadastro(UNIDADE)
  const estado: UnidadeState = {
    id: lido.unidade_id,
    name: lido.unidade_nome,
    regionalName: lido.regional_nome,
    cidades: [],
    data: lido.dados,
  }
  bases.set(estado, lido.base)
  return estado
}

describe('adicionar CTS ao sistema', () => {
  it('a CTS escolhida entra no sistema e sai da lista de disponíveis', async () => {
    if (!noAr) return console.log('backend fora do ar — pulado')

    await api.put(`/api/unidades/${UNIDADE}`, { usaCts: false })
    const estado = await abrir()
    const soltas = estado.data['sistema-topologia'].filter(
      (t) => !t.sistema_id && t.componente_tipo === 'cts',
    )
    expect(soltas.length).toBeGreaterThan(0)

    // Unidade desmarcada: o limite de uma CTS por sistema não interfere.
    const semLimite = estado.data['cidade-sistema'][0]
    expect(semLimite).toBeDefined()

    const alvo = soltas[0]
    colocada = alvo.componente_sistema_id
    const disponiveisAntes = soltas.length

    // O QUE A TELA FAZ: escreve o sistema na linha da CTS.
    alvo.sistema_id = semLimite.sistema_id
    alvo.sistema_name = semLimite.sistema_name
    await salvar(estado)

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
