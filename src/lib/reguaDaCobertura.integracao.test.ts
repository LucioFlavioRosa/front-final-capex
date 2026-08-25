/**
 * A RÉGUA DA COBERTURA SOBREVIVE À GRAVAÇÃO.
 *
 * `unidade_cobertura` diz em que unidade a meta da cidade é medida — ligações,
 * economias ou população. A tela não tinha a coluna, então a gravação não
 * mandava o campo; e o `PUT` substitui a ficha inteira lendo `cidade.get("cob")`
 * sem default. Resultado: cada vez que alguém salvava a aba de Concessão, a
 * régua daquela cidade virava NULL. Aconteceu com 21 cidades, todas com
 * `ligacoes` — a trilha de auditoria registrou as 21 linhas
 * `cob: ligacoes -> (vazio)`.
 *
 * O teste faz a volta inteira contra o backend de verdade — ler, gravar sem
 * tocar na régua, ler de novo — porque era exatamente aí que o dado sumia: cada
 * ponta funcionava, e a perda estava na costura entre elas.
 *
 * Ele MUDA dado, então restaura o valor original no fim.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { lerCadastro, salvarCadastro } from './cadastroApi'
import { SELECTS } from '@/data/cadastroUnidade/schema'
import type { UnidadeState } from '@/data/cadastroUnidade/types'

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
const UNIDADE = 'uB1'

let noAr = false
let alvo = ''
let original = ''

const concessao = (u: UnidadeState) =>
  (u.data['cidade-operacional'] ?? []) as Record<string, string>[]

/**
 * O estado que o `CadastroContext` manteria — e não só a tabela.
 *
 * `salvarCadastro` recusa gravar sem uma leitura da MESMA sessão
 * (`CadastroSemLeitura`): sem o dado do servidor ela não sabe o que mudou e
 * mandaria fichas inteiras em branco. Passar só a tabela driblaria justamente a
 * proteção que este arquivo existe para exercitar.
 */
async function abrir(): Promise<UnidadeState> {
  const lido = await lerCadastro(UNIDADE)
  return {
    id: lido.unidade_id,
    name: lido.unidade_nome,
    regionalName: lido.regional_nome,
    cidades: [],
    data: lido.dados,
  } as UnidadeState
}

beforeAll(async () => {
  try {
    noAr = (await fetch(`${BASE}/readyz`)).ok
  } catch {
    noAr = false
  }
  if (!noAr) return
  const linha = concessao(await abrir()).find((c) => c.unidade_cobertura)
  if (linha) {
    alvo = linha.cidade_id
    original = linha.unidade_cobertura
  }
}, 120_000)

afterAll(async () => {
  if (!noAr || !alvo) return
  const u = await abrir()
  const l = concessao(u).find((c) => c.cidade_id === alvo)
  if (l) l.unidade_cobertura = original
  await salvarCadastro(u)
}, 120_000)

describe('a régua da cobertura', () => {
  it('as três opções são as que o banco guarda, sem acento', () => {
    // O rótulo é em português; o VALOR é o literal que o backend compara em
    // `COALESCE(unidade_cobertura,'') = 'populacao'`. Gravar 'população' aqui
    // daria uma cidade que parece preenchida e nunca casa com a regra.
    expect(SELECTS.unidade_cobertura.map(([v]) => v)).toEqual([
      'ligacoes',
      'economias',
      'populacao',
    ])
  })

  it('chega do backend na coluna da aba de Concessão', async () => {
    if (!noAr) return console.log('backend fora do ar — pulado')

    const linhas = concessao(await abrir())
    expect(linhas.length).toBeGreaterThan(0)
    expect(Object.keys(linhas[0])).toContain('unidade_cobertura')
    expect(alvo).toBeTruthy() // alguma cidade tem régua definida
  }, 120_000)

  it('NÃO é apagada ao salvar a aba sem tocar nela — era o defeito', async () => {
    if (!noAr || !alvo) return console.log('backend fora do ar — pulado')

    const antes = await abrir()
    const daCidade = (u: UnidadeState) =>
      concessao(u).find((c) => c.cidade_id === alvo)?.unidade_cobertura

    expect(daCidade(antes)).toBe(original)

    // Mexe em OUTRO campo da mesma ficha, para a gravação de fato acontecer:
    // ela só manda a cidade que mudou.
    const linha = concessao(antes).find((c) => c.cidade_id === alvo)!
    const fimAntigo = linha.data_fim_concessao
    linha.data_fim_concessao = String(Number(fimAntigo || 2045) - 1)
    await salvarCadastro(antes)

    expect(daCidade(await abrir())).toBe(original)
  }, 180_000)

  it('em branco vira AUSÊNCIA, e o servidor volta a contar a pendência', async () => {
    if (!noAr || !alvo) return console.log('backend fora do ar — pulado')

    // Esta é a única guarda que existe: o servidor grava `cidade.get("cob")` como
    // veio. Se esta camada mandar `""`, o banco guarda `""`, e a conta de
    // completude — `unidade_cobertura IS NULL` — passa a dar a cidade por
    // preenchida. A simulação liberaria sem ninguém ter escolhido a régua.
    const contrato = async () => {
      const r = await fetch(`${BASE}/api/unidades/${UNIDADE}/prontidao`)
      return ((await r.json()) as { porGrupo: Record<string, number> }).porGrupo.contrato
    }

    const antes = await contrato()

    const u = await abrir()
    concessao(u).find((c) => c.cidade_id === alvo)!.unidade_cobertura = ''
    await salvarCadastro(u)

    // Uma cidade a mais pendente — nem zero (gravou `""` e passou por cheia),
    // nem duas (mexeu em outra coisa junto).
    expect(await contrato()).toBe(antes + 1)

    const volta = await abrir()
    concessao(volta).find((c) => c.cidade_id === alvo)!.unidade_cobertura = original
    await salvarCadastro(volta)
    expect(await contrato()).toBe(antes)
  }, 180_000)

  it('e a mudança de régua persiste', async () => {
    if (!noAr || !alvo) return console.log('backend fora do ar — pulado')

    const outra = original === 'populacao' ? 'economias' : 'populacao'
    const u = await abrir()
    concessao(u).find((c) => c.cidade_id === alvo)!.unidade_cobertura = outra
    await salvarCadastro(u)

    const depois = concessao(await abrir()).find((c) => c.cidade_id === alvo)
    expect(depois?.unidade_cobertura).toBe(outra)
  }, 180_000)
})
