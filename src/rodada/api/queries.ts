/**
 * Queries das telas de rodada.
 *
 * A decisão que molda este arquivo: RESULTADO DE RODADA É IMUTÁVEL. Um `run_id`
 * congela na primeira publicação bem-sucedida; reexecutar depois disso gera id
 * novo. Não é convenção — o backend RECUSA (409) execução sobre um `run_id` já
 * publicado, e é isso que torna o cache eterno abaixo correto por construção.
 *
 * Consequências práticas:
 *   - `staleTime: Infinity` em tudo que é de uma rodada: uma vez lido, nunca
 *     mais refetch. Descer e subir os níveis fica instantâneo.
 *   - Não há invalidação a fazer, porque não há escrita que invalide.
 *   - A LISTA do histórico é a exceção: ela muda quando alguém exclui, favorita
 *     ou comenta. Só ela é invalidada.
 *
 * As chaves são todas prefixadas por `['runs', runId]`, então trocar de rodada
 * no Trilho troca a subárvore inteira do cache sem tocar nas outras já lidas.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { resultados, simulacao, type ModoDaVariacao } from '@/rodada/api/endpoints'
import type { RunResumo } from '@/rodada/domain/resultado'
import type { CorpoNovaRodada } from '@/rodada/domain/simulacao'
import type { Faixa } from '@/rodada/domain/sensibilidade'

/**
 * As chaves de cache do react-query.
 *
 * EXPORTADA de propósito, e não só por causa do teste: a chave é o contrato de
 * identidade de cada consulta — é por ela que se invalida e é por ela que duas
 * telas compartilham (ou não) o mesmo dado. Um defeito aqui não falha, não
 * avisa, e devolve o resultado de outro filtro.
 */
export const chaves = {
  /** A lista do histórico. Muda com exclusão/favorita — não é "para sempre". */
  runs: (filtro?: { unidadeId?: string; usuario?: string }) =>
    ['runs', 'lista', filtro?.unidadeId ?? '*', filtro?.usuario ?? '*'] as const,
  meta: (runId: string) => ['runs', runId, 'meta'] as const,
  painel: (runId: string) => ['runs', runId, 'painel'] as const,
  ebitda: (runId: string, cidadeId?: string) =>
    ['runs', runId, 'ebitda', cidadeId ?? 'unidade'] as const,
  cidades: (runId: string) => ['runs', runId, 'cidades'] as const,
  explicabilidade: (runId: string) => ['runs', runId, 'explicabilidade'] as const,
  cenarioAnual: (runId: string) => ['runs', runId, 'cenario-anual'] as const,
  obrasDoCenario: (runId: string, filtro: Record<string, unknown>) =>
    ['runs', runId, 'cenario-anual', 'obras', filtro] as const,
  explicabilidadeDaCidade: (runId: string, cidadeId: string) =>
    ['runs', runId, 'cidades', cidadeId, 'explicabilidade'] as const,
  explicabilidadeDoSistema: (runId: string, sistemaId: string) =>
    ['runs', runId, 'sistemas', sistemaId, 'explicabilidade'] as const,
  cidade: (runId: string, cidadeId: string) => ['runs', runId, 'cidades', cidadeId] as const,
  fluxo: (runId: string, sistemaId: string) => ['runs', runId, 'sistemas', sistemaId] as const,
  subbacia: (runId: string, subId: string) => ['runs', runId, 'subbacias', subId] as const,
  obra: (runId: string, obraId: string) => ['runs', runId, 'obras', obraId] as const,
  /**
   * O filtro inteiro entra na chave: página, ordenação e recorte são cortes
   * DIFERENTES da mesma lista, não a mesma consulta com resultado igual.
   *
   * A CHAVE É MONTADA CAMPO A CAMPO, e não pelo objeto — então todo filtro novo
   * TEM de ser acrescentado aqui também. `recorte` foi esquecido quando entrou,
   * e o defeito era silencioso: `IMUTAVEL` usa `staleTime: Infinity`, então
   * abrir 2027 em "todas" e depois em "de terceiro" servia as 163 linhas do
   * cache no lugar das 91 — inclusive para a exportação, que leva o que a lista
   * tem. Nada reclamava; só o número estava errado.
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
  ) =>
    [
      'runs',
      runId,
      'obras',
      'lista',
      filtro?.situacao ?? '*',
      filtro?.cidadeId ?? '*',
      filtro?.ano ?? '*',
      filtro?.recorte ?? '*',
      filtro?.pagina ?? 1,
      filtro?.tamanho ?? 50,
      filtro?.ordenar ?? 'inicio',
    ] as const,
  cronogramaDeObras: (runId: string) => ['runs', runId, 'obras', 'cronograma'] as const,
  prontidao: (unidadeId: string) => ['prontidao', unidadeId] as const,
}

/** Opções de quem lê uma rodada: leu uma vez, vale para sempre. */
const IMUTAVEL = { staleTime: Infinity, gcTime: Infinity } as const

/** Estados em que a rodada ainda está em voo — o servidor pode mudá-los sozinho. */
const EM_VOO = new Set(['PENDENTE', 'RODANDO'])

export function useRuns(
  filtro?: { unidadeId?: string; usuario?: string },
  opcoes?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: chaves.runs(filtro),
    queryFn: () => resultados.listar(filtro),
    enabled: opcoes?.enabled,
    /**
     * A lista é a única query da rodada em que o dado muda SEM ação do
     * usuário. Enquanto houver rodada em voo ela se repesca sozinha; quando
     * todas terminam, o intervalo volta a `false` e a tela para de bater no
     * servidor.
     */
    refetchInterval: (query) =>
      query.state.data?.some((r) => EM_VOO.has(r.status)) ? 8000 : false,
  })
}

export function useRunMeta(runId: string | undefined) {
  return useQuery({
    queryKey: chaves.meta(runId ?? '—'),
    queryFn: () => resultados.meta(runId as string),
    enabled: !!runId,
    ...IMUTAVEL,
  })
}

export function usePainel(runId: string | undefined) {
  return useQuery({
    queryKey: chaves.painel(runId ?? '—'),
    queryFn: () => resultados.painel(runId as string),
    enabled: !!runId,
    ...IMUTAVEL,
  })
}

export function useEbitda(runId: string | undefined, cidadeId?: string) {
  return useQuery({
    queryKey: chaves.ebitda(runId ?? '—', cidadeId),
    queryFn: () => resultados.ebitda(runId as string, cidadeId),
    enabled: !!runId,
    ...IMUTAVEL,
  })
}

export function useCidades(runId: string | undefined) {
  return useQuery({
    queryKey: chaves.cidades(runId ?? '—'),
    queryFn: () => resultados.cidades(runId as string),
    enabled: !!runId,
    ...IMUTAVEL,
  })
}

export function useCidade(runId: string | undefined, cidadeId: string | undefined) {
  return useQuery({
    queryKey: chaves.cidade(runId ?? '—', cidadeId ?? '—'),
    queryFn: () => resultados.cidade(runId as string, cidadeId as string),
    enabled: !!runId && !!cidadeId,
    ...IMUTAVEL,
  })
}

/** "Sub-bacias fora do plano" do nível 2. */
export function useExplicabilidadeDaCidade(
  runId: string | undefined,
  cidadeId: string | undefined,
) {
  return useQuery({
    queryKey: chaves.explicabilidadeDaCidade(runId ?? '—', cidadeId ?? '—'),
    queryFn: () => resultados.explicabilidadeDaCidade(runId as string, cidadeId as string),
    enabled: !!runId && !!cidadeId,
    ...IMUTAVEL,
  })
}

/**
 * "O que ficou fora" do nível 3.
 *
 * CONSULTA PRÓPRIA, e não recorte do payload global. Enquanto a resposta trazia
 * a lista inteira de sub-bacias — cada uma com o `sistemaId` dela — a tela
 * filtrava sozinha e não pedia nada. A resposta virou AGREGADO por obra, e
 * agregado não se filtra depois: quem sabe somar por sistema é quem tem as
 * linhas. O payload encolheu de 247 KB para 10 KB, então a ida a mais sai bem
 * mais barata do que o que ela substitui.
 */
export function useExplicabilidadeDoSistema(
  runId: string | undefined,
  sistemaId: string | undefined,
) {
  return useQuery({
    queryKey: chaves.explicabilidadeDoSistema(runId ?? '—', sistemaId ?? '—'),
    queryFn: () => resultados.explicabilidadeDoSistema(runId as string, sistemaId as string),
    enabled: !!runId && !!sistemaId,
    ...IMUTAVEL,
  })
}

/** "De quanto teria de ser o orçamento anual" — o cenário do nível 1. */
export function useCenarioAnual(runId: string | undefined) {
  return useQuery({
    queryKey: chaves.cenarioAnual(runId ?? '—'),
    queryFn: () => resultados.cenarioAnual(runId as string),
    enabled: !!runId,
    ...IMUTAVEL,
  })
}

/** Lista de obras por ordem de execução, nível 1. */
export function useObras(
  runId: string | undefined,
  filtro?: {
    situacao?: string
    cidadeId?: string
    ano?: number
    recorte?: string
    pagina?: number
    tamanho?: number
    ordenar?: string
  },
) {
  return useQuery({
    queryKey: chaves.obras(runId ?? '—', filtro),
    queryFn: () => resultados.obras(runId as string, filtro),
    enabled: !!runId,
    // `placeholderData` (e não `keepPreviousData`, removido no v5) segura a
    // página anterior na tela enquanto a nova pagina/filtra — sem isso a
    // tabela pisca vazia a cada clique em "próxima página".
    placeholderData: (anterior) => anterior,
    ...IMUTAVEL,
  })
}

/**
 * As obras de uma fatia do cenário anual — ano, tipo e escopo, os três juntos.
 *
 * O filtro inteiro entra na chave de cache: trocar de escopo ou de ano é outra
 * lista, e servir a anterior seria repetir, em silêncio, o defeito que esta
 * rota veio consertar.
 */
export function useObrasDoCenario(
  runId: string | undefined,
  filtro: { escopo: 'paga' | 'todas'; ano?: number; componente?: string; tamanho?: number },
) {
  return useQuery({
    queryKey: chaves.obrasDoCenario(runId ?? '—', filtro),
    queryFn: () => resultados.obrasDoCenario(runId as string, filtro),
    enabled: !!runId,
    ...IMUTAVEL,
  })
}

/** O cronograma de obras do plano — quantas de cada componente por ano. */
export function useCronogramaDeObras(runId: string | undefined) {
  return useQuery({
    queryKey: chaves.cronogramaDeObras(runId ?? '—'),
    queryFn: () => resultados.cronogramaDeObras(runId as string),
    enabled: !!runId,
    ...IMUTAVEL,
  })
}

export function useFluxo(runId: string | undefined, sistemaId: string | undefined) {
  return useQuery({
    queryKey: chaves.fluxo(runId ?? '—', sistemaId ?? '—'),
    queryFn: () => resultados.fluxo(runId as string, sistemaId as string),
    enabled: !!runId && !!sistemaId,
    ...IMUTAVEL,
  })
}

export function useSubBacia(runId: string | undefined, subId: string | undefined) {
  return useQuery({
    queryKey: chaves.subbacia(runId ?? '—', subId ?? '—'),
    queryFn: () => resultados.subbacia(runId as string, subId as string),
    enabled: !!runId && !!subId,
    ...IMUTAVEL,
  })
}

export function useObra(runId: string | undefined, obraId: string | undefined) {
  return useQuery({
    queryKey: chaves.obra(runId ?? '—', obraId ?? '—'),
    queryFn: () => resultados.obra(runId as string, obraId as string),
    enabled: !!runId && !!obraId,
    ...IMUTAVEL,
  })
}

/**
 * Prontidão do cadastro — o oposto exato do resto deste arquivo.
 *
 * Enquanto resultado de rodada é imutável, a prontidão é o dado mais volátil do
 * app: ela muda a cada campo salvo no cadastro, numa OUTRA aba do navegador.
 * Por isso `staleTime: 0` e refetch ao focar a janela — quem volta do cadastro
 * para o Simular precisa ver o número que acabou de mudar, não o de quando
 * abriu a tela.
 */
export function useProntidao(unidadeId: string | undefined) {
  return useQuery({
    queryKey: chaves.prontidao(unidadeId ?? '—'),
    queryFn: () => simulacao.prontidao(unidadeId as string),
    enabled: !!unidadeId,
    staleTime: 0,
    refetchOnWindowFocus: true,
  })
}

/**
 * Exclusão de rodada — a única mutação destrutiva do pacote.
 *
 * O `onSuccess` fica NO NÍVEL DO HOOK, e não no `mutate(vars, {...})` da
 * página: o callback por chamada não roda quando o observer perde os listeners
 * (o usuário sai da tela antes da resposta), e a lista ficaria mostrando uma
 * rodada que o servidor já apagou.
 */
export function useExcluirRun() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (runId: string) => resultados.excluir(runId),
    onSuccess: (_dados, runId) => {
      void qc.invalidateQueries({ queryKey: ['runs', 'lista'] })
      // O cache daquela rodada não serve mais para nada.
      qc.removeQueries({ queryKey: ['runs', runId] })
    },
  })
}

/**
 * Marca ou desmarca uma rodada como favorita.
 *
 * OTIMISTA, ao contrário do resto do pacote. A estrela é um clique que o
 * usuário repete várias vezes seguidas enquanto organiza a lista, e esperar o
 * servidor a cada uma faria a interface parecer emperrada. O risco é
 * proporcional: se falhar, o que se perde é uma marca, e o `onError` a devolve
 * ao estado anterior.
 *
 * O callback está no NÍVEL DO HOOK, então ele roda mesmo se a tela desmontar, e
 * não há nada que o usuário possa digitar em cima.
 */
export function useAlternarFavorita() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ runId, favorita }: { runId: string; favorita: boolean }) =>
      favorita ? resultados.favoritar(runId) : resultados.desfavoritar(runId),

    onMutate: async ({ runId, favorita }) => {
      // Cancela refetch em voo: uma resposta antiga chegando depois desfaria a
      // marca na tela, e o usuário veria a estrela piscar de volta sozinha.
      await qc.cancelQueries({ queryKey: ['runs', 'lista'] })
      const antes = qc.getQueriesData<RunResumo[]>({ queryKey: ['runs', 'lista'] })
      for (const [chave, lista] of antes) {
        if (!lista) continue
        qc.setQueryData(
          chave,
          lista.map((r) => (r.runId === runId ? { ...r, favorita } : r)),
        )
      }
      return { antes }
    },

    onError: (_e, _vars, ctx) => {
      for (const [chave, lista] of ctx?.antes ?? []) qc.setQueryData(chave, lista)
    },

    // Reconcilia com o servidor no fim, dê certo ou não: a lista tem filtro por
    // favorita, e o recorte depende deste dado estar correto.
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['runs', 'lista'] })
    },
  })
}

/**
 * Grava (ou apaga) o comentário de uma rodada.
 *
 * PESSIMISTA, ao contrário da favorita logo acima, e a diferença não é gosto:
 * ali o usuário clica uma estrela e não há nada em voo que ele possa digitar
 * por cima; aqui ele está DIGITANDO. Um update otimista revertido pelo
 * `onError` apagaria o texto que ele continuou escrevendo durante o voo. O
 * texto só muda na tela depois que o servidor aceita.
 */
export function useComentarDaRodada() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ runId, texto }: { runId: string; texto: string }) =>
      resultados.comentar(runId, texto),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['runs', 'lista'] })
    },
  })
}

/**
 * Dispara a rodada.
 *
 * Invalida a lista do histórico no sucesso — inclusive quando `jaExistia`, que
 * também é um caminho em que a lista pode ter mudado desde a última leitura.
 * Quem decide o que fazer com `status` e `jaExistia` é a tela, porque a decisão
 * é de navegação, não de cache.
 */
export function useCriarRodada() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (corpo: CorpoNovaRodada) => simulacao.criar(corpo),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['runs', 'lista'] })
    },
  })
}

/**
 * A CURVA DE SENSIBILIDADE — teto e pontos, numa consulta só.
 *
 * Repete enquanto houver ponto em voo, e para sozinha quando todos publicarem.
 * A condição olha o STATUS de cada ponto e não a presença de resultado: uma
 * rodada que terminou em ERRO nunca vai ter resultado, e "repetir até ter" seria
 * bater no servidor a cada oito segundos para sempre.
 */
export function useSensibilidade(runId: string | undefined, faixa: Faixa) {
  return useQuery({
    // A FAIXA ENTRA NA CHAVE. O teto é calculado para os degraus pedidos, então
    // mudar a faixa muda a resposta — sem isto, estreitar o intervalo mostraria
    // o teto do intervalo anterior até alguém recarregar a página.
    queryKey: ['runs', runId ?? '—', 'sensibilidade', faixa.de, faixa.ate, faixa.pontos],
    queryFn: () => resultados.sensibilidade(runId as string, faixa),
    enabled: !!runId,
    refetchInterval: (consulta) => {
      const pontos = consulta.state.data?.pontos ?? []
      const emVoo = pontos.some((p) => p.status === 'PENDENTE' || p.status === 'RODANDO')
      return emVoo ? 8_000 : false
    },
  })
}

export function useDispararVariacao() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({
      runId,
      fator,
      nome,
      modo,
    }: {
      runId: string
      fator: number
      nome: string
      modo: ModoDaVariacao
    }) => resultados.variacao(runId, fator, nome, modo),
    onSuccess: (_r, { runId }) => {
      // A CURVA PRIMEIRO, e a lista também. A curva porque é a tela que a pessoa
      // está olhando; a lista porque uma variação em modo COMPLETO é uma rodada
      // do histórico como qualquer outra — a rápida não aparece lá, e o servidor
      // é quem decide isso, não este `invalidate`.
      void qc.invalidateQueries({ queryKey: ['runs', runId, 'sensibilidade'] })
      void qc.invalidateQueries({ queryKey: ['runs', 'lista'] })
    },
  })
}

/**
 * O sinal de vida de uma rodada em execução.
 *
 * `refetchInterval` só enquanto ela NÃO terminou: rodada publicada é imutável, e
 * continuar perguntando por ela seria bater no servidor para receber sempre a
 * mesma resposta. Quando termina, o intervalo vira `false` sozinho — o
 * `refetchInterval` de função recebe a última resposta e decide.
 */
export function useStatusDaRodada(runId: string | undefined, ativo: boolean) {
  return useQuery({
    queryKey: ['runs', runId ?? '—', 'status'],
    queryFn: () => resultados.status(runId as string),
    enabled: !!runId && ativo,
    refetchInterval: (consulta) => {
      const s = consulta.state.data?.status
      return s === 'PENDENTE' || s === 'RODANDO' ? 8_000 : false
    },
  })
}
