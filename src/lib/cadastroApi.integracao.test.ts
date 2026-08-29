/**
 * Leitura do cadastro contra o BACKEND DE VERDADE.
 *
 * Não é teste unitário: ele bate no Otimizador rodando em `localhost:8000` e
 * confere que as 15 abas do wizard saem montadas do que as cinco rotas
 * devolvem. É o que um mock não pode responder — se o payload mudar de forma no
 * servidor, o mock continuaria passando e a tela quebraria.
 *
 * PULA SOZINHO quando o backend não está no ar, para não reprovar o build de
 * quem só quer rodar a suíte. Ligue com `VITE_API_URL=http://localhost:8000`.
 *
 * RODA CONTRA AS DUAS UNIDADES da base de teste, e não só a uB1. Toda a suíte de
 * integração usava a uB1, e a uB2 — a maior, com 930 sub-bacias, 186 CTS e a
 * única com topologia em rede de verdade — nunca era exercitada. Isso é o tipo
 * de ponto cego que deixa um defeito grande conviver com uma suíte verde.
 *
 * Só a LEITURA roda nas duas. Os testes que gravam continuam na uB1 de propósito:
 * eles mexem em dado real e o restauram no fim, e dobrar isso na unidade grande
 * dobraria o risco sem dobrar a informação.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { lerCadastro } from './cadastroApi'

const BASE = process.env.VITE_API_URL ?? 'http://localhost:8000'
/**
 * As unidades de teste. `UNIDADE_TESTE` continua sobrepondo, para apontar a
 * suíte para uma base diferente sem editar código.
 */
const UNIDADES = process.env.UNIDADE_TESTE ? [process.env.UNIDADE_TESTE] : ['uB1', 'uB2']

let noAr = false

beforeAll(async () => {
  try {
    const r = await fetch(`${BASE}/readyz`)
    noAr = r.ok
  } catch {
    noAr = false
  }
})

describe.each(UNIDADES)('lerCadastro contra o backend real — %s', (UNIDADE) => {
  it('monta as 15 abas do wizard a partir das 5 rotas', async () => {
    if (!noAr) return console.log('backend fora do ar — pulado')

    const lido = await lerCadastro(UNIDADE)
    const abas = Object.keys(lido.dados)

    expect(abas).toHaveLength(15)
    expect(lido.unidade_id).toBe(UNIDADE)
    expect(lido.unidade_nome).not.toBe('')

    // A hierarquia: uma linha de unidade, e a topologia com componentes.
    expect(lido.dados['unidade-regional']).toHaveLength(1)
    expect(lido.dados['unidade-regional'][0].regional_id).not.toBe('')
    expect(lido.dados['sistema-topologia'].length).toBeGreaterThan(0)

    // A ficha de coleta chega com os dois blocos traduzidos para as colunas do
    // wizard: `db` (Databricks) e `params` (a Regional preenche).
    const sub = lido.dados['subbacia-operacional'][0]
    expect(sub).toBeDefined()
    expect(sub.sub_bacia_id).not.toBe('')
    expect(sub).toHaveProperty('receita_faturada_media_mensal')
    expect(sub).toHaveProperty('preco_por_ligacao')
    expect(sub).toHaveProperty('potencial_crescimento')

    // Uma obra por componente, com o nome vindo do servidor.
    const obra = lido.dados['componentes-subbacias-capex'][0]
    expect(obra.componente).not.toBe('')
    expect(obra).toHaveProperty('preco_unitario')
    expect(obra.sub_bacia_id).not.toBe('')

    expect(lido.dados['ete-capex'].length).toBeGreaterThan(0)
    expect(lido.dados['ete-capex'][0].ete_id).not.toBe('')
  }, 60_000)

  it('CTS fora de sistema aparece na topologia com sistema em branco', async () => {
    if (!noAr) return console.log('backend fora do ar — pulado')

    // uB1 é a unidade onde as CTS ainda não foram colocadas em sistema nenhum.
    const lido = await lerCadastro('uB1')
    const soltas = lido.dados['sistema-topologia'].filter((t) => t.sistema_id === '')

    expect(soltas.length).toBeGreaterThan(0)
    expect(soltas[0].componente_sistema_id).not.toBe('')
    // Nome preservado: é ele que permite escolher a CTS numa lista.
    expect(soltas[0].componente_sistema_nome).not.toBe('')
  }, 60_000)
})
