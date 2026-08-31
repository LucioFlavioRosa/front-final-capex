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
  ExplicabilidadeGlobal,
  Fluxo,
  ObraDetalhe,
  CronogramaDeObras,
  ObrasPagina,
  PainelEbitda,
  PainelGlobal,
  RunMeta,
  RunResumo,
  SubBaciaDetalhe,
} from '@/rodada/domain/resultado'
import type { CorpoNovaRodada, Prontidao } from '@/rodada/domain/simulacao'
import type { Faixa, Sensibilidade } from '@/rodada/domain/sensibilidade'

/**
 * `rapido` é o padrão da análise: solver de 60s, resultado marcado como
 * estimativa e fora do histórico. `completo` é uma simulação como qualquer
 * outra, com os 1000s de sempre, e entra no histórico.
 */
export type ModoDaVariacao = 'rapido' | 'completo'

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
   * Onde a rodada está AGORA — status, progresso e posição na fila.
   *
   * O pacote inteiro tratava resultado como imutável e nunca consultava isto, e
   * o efeito era uma rodada em execução que não dava sinal de vida. Numa análise
   * de sensibilidade isso é fatal: são simulações completas, levam minutos, e sem
   * o sinal a tela parece travada — foi exatamente o que aconteceu na primeira
   * tentativa, e a reação (certa) foi excluir as rodadas.
   */
  status: (runId: string) =>
    api.get<{
      runId: string
      status: string
      progresso: number
      fila?: { posicao: number; motivo: string; atencao: boolean; vivos: number }
    }>(`${BASE}/${runId}/status`),

  /**
   * A MESMA simulação com o orçamento escalado — um ponto da curva de
   * sensibilidade. O clone acontece no SERVIDOR: aqui só vai o fator.
   *
   * Idempotente pelo backend (`abrir_rodada` devolve a rodada existente quando o
   * pedido é idêntico), então repetir a varredura não gasta cluster —
   * `jaExistia` diz qual dos dois aconteceu.
   *
   * `modo` escolhe quanto tempo o solver tem: `rapido` põe teto de 60s no lugar
   * dos 1000s de uma simulação. É a MESMA otimização — mesmos dados, mesmas
   * restrições —, e o que muda é até onde ela vai na prova de otimalidade. A
   * inclinação da curva aparece muito antes disso. O preço é dito: o resultado
   * pode ser subótimo, e por isso a rodada rápida é marcada como estimativa e
   * NÃO aparece no histórico.
   */
  /**
   * O TETO e os PONTOS da curva de sensibilidade, num payload só.
   *
   * Uma rota para as duas metades porque a tela não consegue usar uma sem a
   * outra: o teto responde na hora e diz se vale disparar alguma coisa; os
   * pontos são as variações que já rodaram. Os pontos saem da LINHAGEM gravada
   * no servidor (`run_request.base_run_id`) — a versão anterior os procurava
   * pelo rótulo da rodada, que é livre e editável, então renomear desmanchava a
   * curva em silêncio.
   */
  sensibilidade: (runId: string, faixa: Faixa) =>
    api.get<Sensibilidade>(
      `${BASE}/${runId}/sensibilidade?de=${faixa.de}&ate=${faixa.ate}&pontos=${faixa.pontos}`,
    ),

  variacao: (runId: string, fator: number, nome: string, modo: ModoDaVariacao) =>
    api.post<{
      runId: string
      status: string
      jaExistia: boolean
      /** `false` quando a rodada devolvida já é ponto da curva de OUTRA base. */
      naCurva: boolean
    }>(
      `${BASE}/${runId}/variacao`,
      { fator, nome, modo },
    ),

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

  /** Resumo agregado de "por que não fatura", por motivo — nível global. */
  explicabilidade: (runId: string) =>
    api.get<ExplicabilidadeGlobal>(`${BASE}/${runId}/explicabilidade`),

  /**
   * O mesmo resumo, recortado por cidade — "sub-bacias fora do plano" do
   * nível 2 (item 10 de 26/08). Endpoint próprio, e não um `?cidade=` no de
   * cima: a URL de cidade já tem `/cidades/{id}`, e colar o recorte nela
   * segue o mesmo padrão de `cidade()` logo abaixo.
   */
  explicabilidadeDaCidade: (runId: string, cidadeId: string) =>
    api.get<ExplicabilidadeGlobal>(`${BASE}/${runId}/cidades/${cidadeId}/explicabilidade`),

  /** Nível 2: cobertura, metas, fluxo de escoamento, paridade e sistemas da cidade. */
  cidade: (runId: string, cidadeId: string) =>
    api.get<CidadeDetalhe>(`${BASE}/${runId}/cidades/${cidadeId}`),

  /**
   * Lista de obras por ordem de execução, nível 1 (item 3 de 26/08). Paginada:
   * uma unidade grande publica milhares de linhas em `otim_obra`.
   */
  obras: (
    runId: string,
    filtro?: {
      situacao?: string
      cidadeId?: string
      ano?: number
      recorte?: string
      pagina?: number
      tamanho?: number
      ordenar?: string
    },
  ) => {
    const q = new URLSearchParams()
    if (filtro?.situacao) q.set('situacao', filtro.situacao)
    if (filtro?.cidadeId) q.set('cidade', filtro.cidadeId)
    if (filtro?.ano) q.set('ano', String(filtro.ano))
    // 'todas' nao vira parametro: e a ausencia de recorte, e mandar a palavra
    // criaria uma segunda chave de cache para a mesma lista.
    if (filtro?.recorte && filtro.recorte !== 'todas') q.set('recorte', filtro.recorte)
    if (filtro?.pagina) q.set('pagina', String(filtro.pagina))
    if (filtro?.tamanho) q.set('tamanho', String(filtro.tamanho))
    if (filtro?.ordenar) q.set('ordenar', filtro.ordenar)
    const qs = q.toString()
    return api.get<ObrasPagina>(`${BASE}/${runId}/obras${qs ? `?${qs}` : ''}`)
  },

  /**
   * O cronograma de obras do plano — quantas de cada componente por ano.
   * Item 3 na leitura corrigida em 27/08: o gráfico do plano de execução.
   */
  cronogramaDeObras: (runId: string) =>
    api.get<CronogramaDeObras>(`${BASE}/${runId}/obras/cronograma`),

  /** Nível 3: nós, componentes, arestas de jusante e a ETE do sistema.
   *  A URL continua `/topologia` — é o contrato do backend, e mexer nela é
   *  mudança de API, não de rótulo de tela. */
  fluxo: (runId: string, sistemaId: string) =>
    api.get<Fluxo>(`${BASE}/${runId}/sistemas/${sistemaId}/topologia`),

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
