/**
 * A JANELA DA OBRA EXISTE NAS TRÊS ABAS DE OBRA — e persiste na ETE.
 *
 * `obra_obrigatoria_ano` e `obra_proibida_ate` são as duas únicas restrições de
 * tempo por obra que o motor aceita. Estavam em Sub-bacias e faltavam nas outras
 * duas, por motivos diferentes:
 *
 *   - CTS: as colunas da aba estão VÁRIAS POR LINHA no schema, e o recorte que
 *     inseriu as de sub-bacia ancorava numa linha começando com `{ coluna:
 *     'tempo_execucao'`. Não casou, e a falta passou sem ruído.
 *   - ETE: o backend nem mandava os campos. `input.ete_capex` sempre teve as
 *     colunas e o motor sempre as leu (`otimizador_capex_v62.py:1315`) — faltava
 *     só expor. Junto ia `tempo_predecessoras`: a coluna existia na tela, o
 *     servidor não mandava o campo, e ela chegava eternamente vazia.
 *
 * O efeito era o pior tipo: a restrição VALIA na simulação e nenhuma tela
 * conseguia defini-la.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { lerCadastro, salvarCadastro } from './cadastroApi'
import { SCHEMA } from '@/data/cadastroUnidade/schema'
import type { UnidadeState } from '@/data/cadastroUnidade/types'

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
const UNIDADE = 'uB1'
const JANELA = ['obra_obrigatoria_ano', 'obra_proibida_ate']

let noAr = false

/**
 * O BASELINE É CAPTURADO ANTES DE QUALQUER ESCRITA, e restaurado no fim.
 *
 * A primeira versão lia o "original" dentro do próprio teste que escreve. Quando
 * uma execução falhava no meio, ela deixava o valor alterado — e a execução
 * SEGUINTE tomava esse valor sujo como original, "restaurava" para ele e passava.
 * Verde, com o dado alterado no banco. Foi o que aconteceu: a ETE `d1e1` ficou
 * com 2028/2027/3 e o teste não acusou.
 *
 * Capturar uma vez em `beforeAll` e devolver em `afterAll` fecha isso: o
 * `afterAll` roda mesmo com teste reprovado.
 */
let alvo = ''
let baseline: Record<string, string> = {}

beforeAll(async () => {
  try {
    noAr = (await fetch(`${BASE}/readyz`)).ok
  } catch {
    noAr = false
  }
  if (!noAr) return
  const linha = ((await abrir()).data['ete-capex'] ?? [])[0]
  if (!linha) return
  alvo = linha.ete_id
  baseline = {
    obra_obrigatoria_ano: linha.obra_obrigatoria_ano ?? '',
    obra_proibida_ate: linha.obra_proibida_ate ?? '',
    tempo_predecessoras: linha.tempo_predecessoras ?? '',
  }
}, 120_000)

afterAll(async () => {
  if (!noAr || !alvo) return
  const u = await abrir()
  const l = (u.data['ete-capex'] ?? []).find((e) => e.ete_id === alvo)
  if (!l) return
  Object.assign(l, baseline)
  await salvarCadastro(u)
}, 120_000)

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

const colunasDa = (aba: string) =>
  SCHEMA.find((a) => a.key === aba)!.cols.map((c) => c.coluna)

describe('a janela da obra', () => {
  it('está nas TRÊS abas de obra, não só na de sub-bacia', () => {
    // Sem backend: é comparação de schema, e vale sempre.
    for (const aba of ['componentes-subbacias-capex', 'componentes-cts-capex', 'ete-capex']) {
      const cols = colunasDa(aba)
      for (const c of JANELA) {
        expect(cols, `${aba} não tem ${c}`).toContain(c)
      }
    }
  })

  it('a ETE também tem o prazo das predecessoras, como as outras obras', () => {
    expect(colunasDa('ete-capex')).toContain('tempo_predecessoras')
  })

  it('o servidor MANDA os três campos da ETE — antes chegavam vazios', async () => {
    if (!noAr) return console.log('backend fora do ar — pulado')

    const u = await abrir()
    const etes = u.data['ete-capex'] ?? []
    expect(etes.length).toBeGreaterThan(0)

    // A chave presente na linha é o que prova que a ponte mapeou o campo. Valor
    // vazio é legítimo (ninguém preencheu ainda); chave AUSENTE seria o defeito.
    for (const c of [...JANELA, 'tempo_predecessoras']) {
      expect(Object.keys(etes[0]), `a ficha da ETE não traz ${c}`).toContain(c)
    }
  }, 120_000)

  it('e o que se grava na ETE volta do servidor', async () => {
    if (!noAr) return console.log('backend fora do ar — pulado')

    const antes = await abrir()
    const linha = (antes.data['ete-capex'] ?? []).find((e) => e.ete_id === alvo)!

    /*
     * O VALOR DE TESTE É ESCOLHIDO A PARTIR DO BASELINE, não cravado.
     *
     * Cravar '2028' e afirmar `baseline !== '2028'` transforma um dado legítimo
     * em reprovação: no dia em que alguém marcar de verdade uma ETE como
     * obrigatória em 2028, a suíte quebra sem que nada esteja errado. O que o
     * teste precisa é de um valor DIFERENTE do que está lá — qual ele é não
     * importa.
     */
    const novo =
      baseline.obra_obrigatoria_ano === '2028'
        ? { anoObrig: '2029', proibAte: '2026', tPred: '4' }
        : { anoObrig: '2028', proibAte: '2027', tPred: '3' }

    linha.obra_obrigatoria_ano = novo.anoObrig
    linha.obra_proibida_ate = novo.proibAte
    linha.tempo_predecessoras = novo.tPred
    await salvarCadastro(antes)

    const relida = ((await abrir()).data['ete-capex'] ?? []).find((e) => e.ete_id === alvo)
    // Sem separador de milhar: ano não é quantidade, e `pt_br(2028)` daria
    // "2.028" — o servidor tem `pt_br_ano` justamente para isso.
    expect(relida?.obra_obrigatoria_ano).toBe(novo.anoObrig)
    expect(relida?.obra_proibida_ate).toBe(novo.proibAte)
    expect(relida?.tempo_predecessoras).toBe(novo.tPred)

    // A devolução fica com o `afterAll`, que roda mesmo se isto acima reprovar.
  }, 180_000)

  it('a capacidade ociosa NÃO volta na gravação — é derivada', async () => {
    if (!noAr) return console.log('backend fora do ar — pulado')

    // Espelha a regra do `ticket` da sub-bacia: o motor calcula
    // (nominal − vazão) e avisa quando o gravado discorda. Mandá-la de volta
    // deixaria o cliente responder uma conta que o servidor mesmo faz.
    const cols = colunasDa('ete-capex')
    expect(cols).toContain('capacidade_ociosa')
    const def = SCHEMA.find((a) => a.key === 'ete-capex')!.cols.find(
      (c) => c.coluna === 'capacidade_ociosa',
    )!
    expect(def.origem).toBe('calc')
  }, 120_000)
})
