/**
 * Contrato HTTP das telas de rodada — leitura dos resultados e disparo da
 * simulação. Um método por endpoint; nenhuma regra de negócio, porque quem
 * interpreta o payload são as telas.
 *
 * Portado de `resultado/api/endpoints.ts` e `simulacao/api/endpoints.ts` do
 * repo do Lucio, com duas adaptações:
 *
 *   1. **Prefixo `/api`.** Lá o `BASE_URL` já vinha do `config`; aqui as rotas
 *      são montadas em `app/main.py` com `include_router(..., prefix="/api")`,
 *      e o Vite faz proxy de `/api` para o backend em dev. Conferido rota a
 *      rota contra `app/api/resultados.py` e `app/api/simulacao.py`.
 *   2. **O cliente é o nosso** (`@/lib/api`), que manda o cookie de sessão em
 *      vez do Bearer do MSAL deles.
 *
 * Escopo: tudo é por `run_id`. A unidade NÃO entra na URL de propósito — uma
 * rodada pertence a exatamente uma unidade (`run_meta.unidade`), então o
 * `run_id` já determina o recorte. Filtrar de novo por unidade seria redundante
 * e abriria a porta para os dois discordarem.
 */
import { api } from '@/lib/api'
import type {
  CidadeDetalhe,
  CidadeLinha,
  ObraDetalhe,
  PainelEbitda,
  PainelGlobal,
  RunMeta,
  RunResumo,
  SubBaciaDetalhe,
  Topologia,
} from '@/rodada/domain/resultado'
import type { CorpoNovaRodada, Prontidao } from '@/rodada/domain/simulacao'

const BASE = '/api/runs'

export const resultados = {
  /** Histórico de simulações (nível 0). Filtra por unidade e/ou autor. */
  listar: (filtro?: { unidadeId?: string; usuario?: string }) => {
    const q = new URLSearchParams()
    if (filtro?.unidadeId) q.set('unidade', filtro.unidadeId)
    if (filtro?.usuario) q.set('usuario', filtro.usuario)
    const qs = q.toString()
    return api.get<RunResumo[]>(`${BASE}${qs ? `?${qs}` : ''}`)
  },

  /** KPIs + parâmetros + status. Alimenta o cabeçalho em TODOS os níveis. */
  meta: (runId: string) => api.get<RunMeta>(`${BASE}/${runId}/meta`),

  /**
   * Apaga uma rodada. A ÚNICA mutação destrutiva do pacote inteiro.
   * Não toca no cadastro: o que se apaga é o resultado, não o dado de entrada.
   */
  excluir: (runId: string) => api.del<void>(`${BASE}/${runId}`),

  /**
   * Favorita — a marca é DE QUEM PEDE, e não um atributo da rodada.
   *
   * Os dois verbos são idempotentes de propósito: marcar o que já está marcado
   * e desmarcar o que não está são sucesso, porque o estado pedido é o estado
   * final. Duplo clique não precisa de tratamento, e retry de rede também não.
   */
  favoritar: (runId: string) => api.put<void>(`${BASE}/${runId}/favorita`),
  desfavoritar: (runId: string) => api.del<void>(`${BASE}/${runId}/favorita`),

  /**
   * Comentário da rodada — ao contrário da favorita, é COMPARTILHADO: o texto
   * que esta pessoa grava é o que as outras vão ler.
   *
   * Um verbo só, e não um para criar e outro para editar: reescrever é o caso
   * normal deste campo. Texto vazio APAGA no servidor.
   */
  comentar: (runId: string, texto: string) =>
    api.put<void>(`${BASE}/${runId}/comentario`, { texto }),
  descomentar: (runId: string) => api.del<void>(`${BASE}/${runId}/comentario`),

  /** Os 6 quadros do nível global, num payload só. */
  painel: (runId: string) => api.get<PainelGlobal>(`${BASE}/${runId}/painel`),

  /** EBITDA da unidade, ou de uma cidade quando `cidadeId` vem. */
  ebitda: (runId: string, cidadeId?: string) =>
    api.get<PainelEbitda>(`${BASE}/${runId}/ebitda${cidadeId ? `?cidade=${cidadeId}` : ''}`),

  /** Tabela de cidades do nível global (drill-down). */
  cidades: (runId: string) => api.get<CidadeLinha[]>(`${BASE}/${runId}/cidades`),

  /** Nível 2: cobertura, metas, fluxo de escoamento, paridade e sistemas da cidade. */
  cidade: (runId: string, cidadeId: string) =>
    api.get<CidadeDetalhe>(`${BASE}/${runId}/cidades/${cidadeId}`),

  /** Nível 3: nós, componentes, arestas de jusante e a ETE do sistema. */
  topologia: (runId: string, sistemaId: string) =>
    api.get<Topologia>(`${BASE}/${runId}/sistemas/${sistemaId}/topologia`),

  /** Nível 4: VPL decomposto, série de receita, explicabilidade e elementos. */
  subbacia: (runId: string, subId: string) =>
    api.get<SubBaciaDetalhe>(`${BASE}/${runId}/subbacias/${subId}`),

  /** Nível 5: ficha da obra + quem depende dela (rateio por vazão). */
  obra: (runId: string, obraId: string) => api.get<ObraDetalhe>(`${BASE}/${runId}/obras/${obraId}`),
}

export interface RespostaNovaRodada {
  runId: string
  /**
   * Pode ser `SUCESSO`: quando o servidor deduplica para uma rodada CONCLUÍDA,
   * ele devolve o status REAL dela. Dizer `PENDENTE` faria a tela abrir o modal
   * de acompanhamento de algo que terminou ontem.
   */
  status: 'PENDENTE' | 'RODANDO' | 'SUCESSO'
  /**
   * O servidor não criou rodada: devolveu uma que já existia, com o mesmo
   * pedido e do mesmo usuário — em voo (duplo clique, retry) ou concluída.
   *
   * Vem no CORPO, e não pelo código 200 vs 201, porque o cliente devolve o JSON
   * e descarta o status. Ler o código exigiria mudar o transporte inteiro para
   * saber o que o corpo já diz.
   *
   * Opcional: ausência significa "não sei", que a tela trata como caminho
   * normal.
   */
  jaExistia?: boolean
}

export const simulacao = {
  /**
   * Pendências do cadastro da unidade — o que bloqueia a rodada.
   *
   * Endpoint próprio, e não um campo em `/unidades/{id}`, porque a resposta é
   * volátil: ela muda a cada campo preenchido no cadastro, e esta tela precisa
   * do número do momento em que se clica Iniciar.
   */
  prontidao: (unidadeId: string) => api.get<Prontidao>(`/api/unidades/${unidadeId}/prontidao`),

  criar: (corpo: CorpoNovaRodada) => api.post<RespostaNovaRodada>('/api/runs', corpo),

  /** Desiste de uma rodada que ainda não terminou. `204`, sem corpo. */
  cancelar: (runId: string) => api.post<void>(`${BASE}/${runId}/cancelar`),
}
