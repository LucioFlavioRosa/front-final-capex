/**
 * A ORDEM DO SALVAR quando uma CTS entra num sistema e é preenchida na mesma
 * gravação — que é o que a planilha faz numa volta só.
 *
 * A ficha da CTS vai DEPOIS do `PUT /topologia`: com a macrorregião marcada, a
 * ficha da macrorregião só passa a existir quando ela é colocada — gravá-la
 * antes daria 404. O teste lê a unidade por `lerCadastro` com o servidor
 * falso, coloca a CTS livre e preenche o preço, e prende a sequência de
 * requisições. Também prende que a leitura pede as livres (`incluirLivres`).
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { servidor } from '@/testes/servidor'
import { lerCadastro, salvarCadastro } from './cadastroApi'

beforeAll(() => servidor.listen({ onUnhandledRequest: 'bypass' }))
afterEach(() => servidor.resetHandlers())
afterAll(() => servidor.close())

const ficha = (id: string, sisId: string) => ({
  id, nome: id, sisId, sistema: sisId ? 'Sistema Um' : '', jusante: '',
  db: { fat: '1', arr: '1', ligU: '1', ligA: '1', ligN: '0', ecoU: '1', ecoA: '1', ecoN: '0', ligURes: '1', ligARes: '1', ecoURes: '1', ecoARes: '1', ticket: '1' },
  params: { preco: '', tarr: '', ramp: '', vaz: '', popU: '', popA: '', popN: '', pot: '' },
  obrasOverride: { '0': { nome: 'Coletor de tempo seco', qtd: '', un: 'ligacao', preco: '', opex: '', tPred: '', dur: '', anoObrig: '', proibAte: '', wacc: '' } },
  atualizadoEm: '', atualizadoPor: '',
})

describe('a CTS que entra num sistema e é preenchida na mesma gravação', () => {
  it('a leitura pede as livres, e a ficha delas vai depois da topologia', async () => {
    const chamadas: string[] = []
    servidor.use(
      http.get('/api/unidades/:id/hierarquia', ({ request }) => {
        chamadas.push(`GET ${new URL(request.url).pathname}`)
        return HttpResponse.json({
          unidReg: { rid: 'r', rnome: 'R', did: 'd', dnome: 'D', uid: 'uT1', unome: 'U', waccMedio: '0,09', usaCts: 'false' },
          empresas: [{ id: '57', nome: 'E', fimConcessao: '2048' }],
          cidades: [{ id: 'c1', nome: 'C', empId: '57' }],
          sistemas: [{ id: 's1', nome: 'Sistema Um', cidId: 'c1' }],
          topo: [{ sis: 's1', id: 'e1', nome: 'ETE', jus: '', tipo: 'ete' }],
          semSistema: [{ id: 'cts_002', nome: 'CTS 002', tipo: 'cts', cidId: 'c1', empId: '57', macro: 'false' }],
        })
      }),
      http.get('/api/unidades/:id/contrato', () =>
        HttpResponse.json({ cidades: [{ id: 'c1', nome: 'C', empId: '57', empNome: 'E', fim: '2048' }], metas: [], fator: [] }),
      ),
      http.get('/api/unidades/:id/sub-bacias', () => HttpResponse.json({ subs: {} })),
      http.get('/api/unidades/:id/etes', () => HttpResponse.json({ etes: [] })),
      http.get('/api/unidades/:id/cts', ({ request }) => {
        chamadas.push(`GET ${new URL(request.url).pathname}?${new URL(request.url).searchParams}`)
        return HttpResponse.json({ ctss: { cts_002: ficha('cts_002', '') } })
      }),
      http.put('/api/unidades/:id/*', ({ request }) => {
        chamadas.push(`PUT ${new URL(request.url).pathname}`)
        return HttpResponse.json({ ok: true })
      }),
    )

    const lido = await lerCadastro('uT1')
    expect(chamadas).toContain('GET /api/unidades/uT1/cts?incluirLivres=1')
    expect(lido.dados['cts-operacional'][0]).toMatchObject({ cts_id: 'cts_002', sistema_id: '' })

    // coloca a CTS no sistema e preenche o preço — o que a planilha faz numa volta
    const dados = JSON.parse(JSON.stringify(lido.dados)) as typeof lido.dados
    dados['sistema-topologia'] = dados['sistema-topologia'].map((t) =>
      t.componente_sistema_id === 'cts_002' ? { ...t, sistema_id: 's1', sistema_name: 'Sistema Um' } : t,
    )
    dados['cts-operacional'][0] = { ...dados['cts-operacional'][0], sistema_id: 's1', sistema_name: 'Sistema Um', preco_por_ligacao: '950' }

    chamadas.length = 0
    await salvarCadastro({ id: 'uT1', name: 'U', regionalName: 'R', cidades: [], data: dados }, lido.base)
    expect(chamadas).toEqual([
      'PUT /api/unidades/uT1/topologia',
      'PUT /api/unidades/uT1/cts/cts_002',
    ])
  })
})
