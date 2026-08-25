/**
 * GRAVAÇÃO do cadastro contra o backend de verdade — o caminho de volta.
 *
 * Ler é metade: a outra é o `PUT` chegar na tabela certa, com o campo certo, e
 * sem apagar o que a tela não mostra. É isso que este arquivo exercita, num
 * ciclo fechado — lê, muda um campo, salva, relê.
 *
 * Usa a **uB1**, que é a unidade de teste de cadastro. Restaura o valor
 * anterior no fim, para a suíte poder rodar duas vezes seguidas.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { lerCadastro, salvarCadastro } from './cadastroApi'
import type { UnidadeState } from '../data/cadastroUnidade/types'

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
const UNIDADE = 'uB1'

let noAr = false
beforeAll(async () => {
  try {
    noAr = (await fetch(`${BASE}/readyz`)).ok
  } catch {
    noAr = false
  }
})

/** O estado que o `CadastroContext` manteria, montado a partir da leitura. */
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

describe('salvarCadastro contra o backend real', () => {
  it('um campo digitado na sub-bacia volta do servidor', async () => {
    if (!noAr) return console.log('backend fora do ar — pulado')

    const antes = await abrir()
    const linha = antes.data['subbacia-operacional'][0]
    const id = linha.sub_bacia_id
    const original = linha.tempo_ramp_up ?? ''
    const novo = original === '7' ? '8' : '7'

    linha.tempo_ramp_up = novo
    await salvarCadastro(antes)

    const depois = await abrir()
    const relida = depois.data['subbacia-operacional'].find((r) => r.sub_bacia_id === id)
    expect(relida?.tempo_ramp_up).toBe(novo)

    // devolve como estava
    relida!.tempo_ramp_up = original
    await salvarCadastro(depois)
    const final = await abrir()
    expect(final.data['subbacia-operacional'].find((r) => r.sub_bacia_id === id)?.tempo_ramp_up).toBe(
      original,
    )
  }, 300_000)

  it('gravar NÃO apaga as colunas que o wizard não mostra', async () => {
    if (!noAr) return console.log('backend fora do ar — pulado')

    // O recorte residencial (`ligURes`…) e as colunas `*_com_cts` existem na
    // ficha e não estão no SCHEMA do wizard. Se a gravação montasse o corpo só
    // com o que a tela tem, elas voltariam nulas — perda silenciosa.
    const u = encodeURIComponent(UNIDADE)
    const antesRaw = await fetch(`${BASE}/api/unidades/${u}/sub-bacias`).then((r) => r.json())
    const id = Object.keys(antesRaw.subs)[0]
    const residencialAntes = antesRaw.subs[id].db.ligURes

    const estado = await abrir()
    estado.data['subbacia-operacional'][0].tempo_ramp_up = '9'
    await salvarCadastro(estado)

    const depoisRaw = await fetch(`${BASE}/api/unidades/${u}/sub-bacias`).then((r) => r.json())
    expect(depoisRaw.subs[id].db.ligURes).toBe(residencialAntes)
  }, 300_000)
})
