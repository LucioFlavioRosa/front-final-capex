import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'
import type { PainelGlobal, RunResumo } from '@/rodada/domain/resultado'
import type { Prontidao } from '@/rodada/domain/simulacao'

/**
 * Servidor falso das telas de rodada.
 *
 * Intercepta na camada de rede (msw), e não no módulo de endpoints, de
 * propósito: assim o teste exercita `lib/api.ts` de verdade — inclusive a
 * leitura do corpo `{"erro": …}` e o tratamento de 204 —, que é justamente
 * onde a integração com o backend novo pode quebrar.
 */

export const RUNS: RunResumo[] = [
  {
    runId: '4a7f0000-0000-0000-0000-000000000001',
    nome: 'Orçamento base 2031',
    unidadeId: '56',
    unidadeNome: 'ÁGUAS DO RIO 01',
    dataHora: '2026-08-14T16:20:00Z',
    autor: 'murilo.caires',
    duracaoS: 100,
    status: 'OPTIMAL',
    favorita: true,
    publicada: true,
    comentario: {
      texto: 'Base aprovada na reunião de 14/08.',
      autor: 'wagner',
      atualizadoEm: '2026-08-14T18:00:00Z',
    },
    metricas: {
      vpl: 1_240_000_000,
      capex: 184_216_430,
      usoOrcamentoPct: 92.1,
      obrasConstruidas: 1284,
      obrasTotal: 1400,
      coberturaFimPct: 92.4,
      metasAtingidas: 3,
      metasTotal: 4,
      ebitdaTotal: 412_700_000,
    },
    // As variáveis com que a rodada foi PEDIDA — o que "ver detalhes" mostra.
    // Fora de ordem de propósito: a tela reordena, e um fixture já ordenado
    // deixaria a reordenação sem prova.
    pedido: {
      MAX_TIME_S: 500,
      USAR_CTS: true,
      ORCAMENTO: { 2026: 60_000_000, 2027: 60_000_000 },
      BASE_RECEITA: 'arrecadada',
      FOCO_COBERTURA: 1,
      CURVA_ADOCAO: 'scurve',
      PENALIDADE_COBERTURA: 'meta+cobertura',
    },
  },
  {
    runId: '9c110000-0000-0000-0000-000000000002',
    nome: 'Teto reduzido 20%',
    unidadeId: '56',
    unidadeNome: 'ÁGUAS DO RIO 01',
    dataHora: '2026-08-14T15:02:00Z',
    autor: 'murilo.caires',
    duracaoS: null,
    status: 'RODANDO',
    favorita: false,
    publicada: false,
    comentario: null,
    // Rodada em voo NÃO tem métricas — o campo é OPCIONAL no contrato, então
    // ele simplesmente não vem. É o caso que prova que a tabela mostra '—' e
    // não "R$ 0": `metricas` ausente é diferente de métricas zeradas.
    progresso: 42,
  },
]

export const PAINEL: PainelGlobal = {
  anos: [
    { ano: 2031, capex: 25_000_000, opex: 3_000_000, receita: 1_000_000, tetoCapex: 25_000_000 },
    { ano: 2032, capex: 24_000_000, opex: 4_200_000, receita: 6_000_000, tetoCapex: 25_000_000 },
    // Ano FORA da janela: teto nulo. É o dado que prova a regra do `null`.
    { ano: 2033, capex: 0, opex: 5_100_000, receita: 12_000_000, tetoCapex: null },
  ],
  cascata: [
    { rotulo: 'Receita', valor: 900_000_000, tipo: 'entra' },
    { rotulo: 'CAPEX', valor: -184_216_430, tipo: 'sai' },
    { rotulo: 'VPL', valor: 715_783_570, tipo: 'total' },
  ],
  capexPorComponente: [
    {
      componente: 'Rede coletora',
      capex: 69_400_000,
      pctDoTotal: 37.7,
      obras: 420,
      unidadesConstruidas: 14_823,
      unidade: 'm',
      modulosConstruidos: null,
    },
    {
      // Sem quantidade: a célula tem de mostrar '—', nunca 0.
      componente: 'ETE (módulo)',
      capex: 27_800_000,
      pctDoTotal: 15.1,
      obras: 9,
      unidadesConstruidas: null,
      unidade: null,
      modulosConstruidos: null,
    },
  ],
  elementosPorAno: [
    {
      ano: 2031,
      porComponente: [
        {
          componente: 'Rede coletora',
          quantidade: 3_600,
          unidade: 'm',
          precoUnitario: 19_277.78,
          capex: 69_400_008,
        },
      ],
    },
    {
      ano: 2032,
      porComponente: [
        {
          componente: 'Rede coletora',
          quantidade: 5_400,
          unidade: 'm',
          precoUnitario: 19_277.78,
          capex: 104_100_012,
        },
      ],
    },
  ],
  fimCapex: 2033,
}

export const PRONTIDAO_COM_PENDENCIA: Prontidao = {
  unidadeId: '56',
  unidadeNome: 'ÁGUAS DO RIO 01',
  pendencias: 38,
  faltando: [
    {
      tipo: 'sub-bacia',
      id: 'b012',
      componente: 'Ligação de esgoto',
      detalhe: 'linha ausente na ficha',
    },
  ],
}

export const PRONTIDAO_LIMPA: Prontidao = {
  unidadeId: '57',
  unidadeNome: 'ÁGUAS DO RIO 02',
  pendencias: 0,
  faltando: [],
}

/**
 * Organização — mesma forma de `/api/regionais` e `/api/regionais/{id}/unidades`
 * (`app/api/organizacao.py`, lidos de `input.unidade_regional`). As duas
 * unidades espelham o banco local real: 56 e 57, ambas na R4.
 */
export const REGIONAIS = [{ id: 'R4', nome: 'R4' }]
export const UNIDADES_R4 = [
  { id: '56', nome: 'ÁGUAS DO RIO 01', regionalId: 'R4' },
  { id: '57', nome: 'ÁGUAS DO RIO 04', regionalId: 'R4' },
]

/**
 * O PORTE, só no detalhe — como o servidor faz.
 *
 * `/regionais/{id}/unidades` NÃO traz `resumo` (são oito `count(*)` sobre a
 * topologia por unidade listada, para números que o `<select>` não mostra), e
 * `/unidades/{id}` traz. O mock respeita a diferença: se ele devolvesse o
 * resumo nos dois, um resumo que só funcionasse com a lista carregada passaria
 * no teste e falharia na tela.
 */
export const RESUMO_56 = {
  cidades: 21,
  sistemas: 148,
  subBacias: 722,
  cts: 0,
  etes: 148,
  obras: 2090,
  obrasAegea: 1914,
  obrasTerceiros: 176,
  semObra: 1520,
}

export const handlers = [
  http.get('/api/regionais', () => HttpResponse.json(REGIONAIS)),
  http.get('/api/regionais/:regionalId/unidades', ({ params }) =>
    HttpResponse.json(params.regionalId === 'R4' ? UNIDADES_R4 : []),
  ),
  http.get('/api/unidades/:id', ({ params }) => {
    const achada = UNIDADES_R4.find((u) => u.id === params.id)
    if (!achada) return HttpResponse.json({ erro: 'Unidade não encontrada.' }, { status: 404 })
    // Só a 56 tem contadores: a 57 é o servidor que ainda não os calcula, e o
    // resumo tem de continuar mostrando os outros nove valores sem ela.
    return HttpResponse.json(achada.id === '56' ? { ...achada, resumo: RESUMO_56 } : achada)
  }),
  http.get('/api/runs', () => HttpResponse.json(RUNS)),
  http.get('/api/runs/:runId/meta', ({ params }) =>
    HttpResponse.json({
      runId: params.runId,
      nome: 'Orçamento base 2031',
      unidadeId: '56',
      unidadeNome: 'ÁGUAS DO RIO 01',
      dataHora: '2026-08-14T16:20:00Z',
      autor: 'murilo.caires',
      status: 'OPTIMAL',
      statusTexto: 'Ótimo encontrado',
      parametros: {
        baseReceita: 'arrecadada',
        usarCts: true,
        janelaCapex: 8,
        orcamento: 184_216_430,
        focoCobertura: 1,
        coberturaSoResidencial: false,
      },
      kpis: {
        vpl: 1_240_000_000,
        capexTotal: 184_216_430,
        opexTotal: 40_000_000,
        receitaTotal: 900_000_000,
        obrasConstruidas: 1284,
        obrasTotal: 1400,
        obrigatoriasConstruidas: 12,
        obrigatoriasTotal: 12,
        subbaciasFaturando: 862,
        subbaciasTotal: 1047,
        coberturaFimPct: 92.4,
        metasAtingidas: 3,
        metasTotal: 4,
      },
    }),
  ),
  http.get('/api/runs/:runId/painel', () => HttpResponse.json(PAINEL)),
  http.get('/api/runs/:runId/ebitda', () =>
    HttpResponse.json({
      anos: [
        { ano: 2031, ebitda: -2_000_000, margemPct: null },
        { ano: 2032, ebitda: 1_800_000, margemPct: 30 },
      ],
      total: 412_700_000,
      anoViraPositivo: 2032,
      fimCapex: 2033,
    }),
  ),
  http.get('/api/runs/:runId/obras/cronograma', () =>
    HttpResponse.json({
      anos: [
        {
          ano: 2028,
          obras: 2,
          capex: 500_366,
          obrasTerceiro: 0,
          porComponente: [
            { componente: 'Ligação de esgoto', obras: 1, capex: 310_024 },
            { componente: 'Rede coletora', obras: 1, capex: 190_342 },
          ],
        },
      ],
    }),
  ),
  http.get('/api/runs/:runId/obras', () =>
    HttpResponse.json({
      total: 1,
      itens: [
        {
          obraId: 'rede_b2b27_1_2',
          componente: 'Rede coletora',
          situacao: 'construida',
          cidadeId: 'Belford Roxo',
          sistemaId: 'Sistema 27',
          subBaciaId: 'b2b27_1_2',
          capex: 190_342,
          quantidade: 383,
          unidade: 'm',
          anoInicio: 2028,
          prazoMeses: 9,
        },
      ],
    }),
  ),
  http.get('/api/runs/:runId/cidades', () =>
    HttpResponse.json([
      {
        id: 'c001',
        nome: 'Belford Roxo',
        vpl: 418_300_000,
        capex: 62_100_000,
        coberturaFimPct: 92.4,
        metasAtingidas: 2,
        metasTotal: 2,
        sistemas: 3,
        cobertura: [
          { ano: 2031, coberturaPct: 71.2 },
          { ano: 2032, coberturaPct: 92.4 },
        ],
        metas: [
          {
            ano: 2032,
            alvoPct: 90,
            realizadoPct: 92.4,
            atingida: true,
            dentroDaJanela: true,
          },
        ],
      },
    ]),
  ),
  http.get('/api/runs/:runId/cidades/:cidadeId/explicabilidade', () =>
    HttpResponse.json({ naoFaturando: 0, totalSubbacias: 0, categorias: [], elos: [] }),
  ),
  http.get('/api/runs/:runId/explicabilidade', () =>
    HttpResponse.json({
      naoFaturando: 185,
      totalSubbacias: 1047,
      categorias: [
        {
          categoria: 'Sem orçamento na janela',
          subbacias: 120,
          vazaoPresa: 340.5,
          itens: [
            { subBaciaId: 'SB-001', cidadeId: 'Aperibe', sistemaId: 'S1', vazaoPresa: 12.4 },
            { subBaciaId: 'SB-002', cidadeId: 'Aperibe', sistemaId: 'S1', vazaoPresa: 9.8 },
          ],
        },
        {
          categoria: 'Depende de transporte não construído',
          subbacias: 65,
          vazaoPresa: 210.2,
          itens: [
            { subBaciaId: 'SB-030', cidadeId: 'Cambuci', sistemaId: 'S2', vazaoPresa: 15.1 },
          ],
        },
      ],
      elos: [
        {
          obraId: 'tro-0042',
          componente: 'Tronco',
          cidadeId: 'c001',
          sistemaId: 's001',
          subBaciaId: 'b001',
          bloqueia: 12,
        },
      ],
    }),
  ),
  http.put('/api/runs/:runId/favorita', () => new HttpResponse(null, { status: 204 })),
  http.delete('/api/runs/:runId/favorita', () => new HttpResponse(null, { status: 204 })),
  http.put('/api/runs/:runId/comentario', () => new HttpResponse(null, { status: 204 })),
  http.delete('/api/runs/:runId', () => new HttpResponse(null, { status: 204 })),
  http.get('/api/unidades/:id/prontidao', ({ params }) =>
    HttpResponse.json(params.id === '57' ? PRONTIDAO_LIMPA : PRONTIDAO_COM_PENDENCIA),
  ),
  http.post('/api/runs', () =>
    HttpResponse.json(
      { runId: 'nova-0000-0000-0000-000000000003', status: 'PENDENTE' },
      { status: 201 },
    ),
  ),
]

export const servidor = setupServer(...handlers)
