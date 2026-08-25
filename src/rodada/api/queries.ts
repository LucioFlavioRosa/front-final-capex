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
import { resultados, simulacao } from '@/rodada/api/endpoints'
import type { RunResumo } from '@/rodada/domain/resultado'
import type { CorpoNovaRodada } from '@/rodada/domain/simulacao'

const chaves = {
  /** A lista do histórico. Muda com exclusão/favorita — não é "para sempre". */
  runs: (filtro?: { unidadeId?: string; usuario?: string }) =>
    ['runs', 'lista', filtro?.unidadeId ?? '*', filtro?.usuario ?? '*'] as const,
  meta: (runId: string) => ['runs', runId, 'meta'] as const,
  painel: (runId: string) => ['runs', runId, 'painel'] as const,
  ebitda: (runId: string, cidadeId?: string) =>
    ['runs', runId, 'ebitda', cidadeId ?? 'unidade'] as const,
  cidades: (runId: string) => ['runs', runId, 'cidades'] as const,
  cidade: (runId: string, cidadeId: string) => ['runs', runId, 'cidades', cidadeId] as const,
  topologia: (runId: string, sistemaId: string) => ['runs', runId, 'sistemas', sistemaId] as const,
  subbacia: (runId: string, subId: string) => ['runs', runId, 'subbacias', subId] as const,
  obra: (runId: string, obraId: string) => ['runs', runId, 'obras', obraId] as const,
  prontidao: (unidadeId: string) => ['prontidao', unidadeId] as const,
}

/** Opções de quem lê uma rodada: leu uma vez, vale para sempre. */
const IMUTAVEL = { staleTime: Infinity, gcTime: Infinity } as const

export function useRuns(filtro?: { unidadeId?: string; usuario?: string }) {
  return useQuery({
    queryKey: chaves.runs(filtro),
    queryFn: () => resultados.listar(filtro),
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

export function useTopologia(runId: string | undefined, sistemaId: string | undefined) {
  return useQuery({
    queryKey: chaves.topologia(runId ?? '—', sistemaId ?? '—'),
    queryFn: () => resultados.topologia(runId as string, sistemaId as string),
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
