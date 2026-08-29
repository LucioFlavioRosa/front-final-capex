/**
 * O QUE A HOME MOSTRA — tudo do backend, nada inventado.
 *
 * Até aqui a Home lia `data/mock.ts`: nome do usuário, unidade, completude e os
 * KPIs da "última simulação" eram literais transcritos do protótipo. Uma tela
 * assim é convincente e mentirosa — ela mostra 94% de cadastro e R$ 1,44 bi de
 * VPL para qualquer base, inclusive uma vazia.
 *
 * A âncora é a ÚLTIMA RODADA (`GET /runs`, que já vem ordenado do mais recente
 * para o mais antigo). Ela é quem diz de que unidade a Home fala — e é a
 * pergunta que a Home responde: "o que aconteceu por último, e o cadastro está
 * pronto para a próxima?".
 *
 * Sem rodada nenhuma, `ultima` vem nula e a tela mostra o estado vazio. É o caso
 * de quem acabou de subir o banco, e ele precisa ser exibido como o que é, em
 * vez de números de exemplo.
 */
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { UnidadeResumo } from '@/lib/organizacaoApi'
import type { CronogramaDeObras, AnoDeObras } from '@/rodada/domain/resultado'

interface RunResumo {
  runId: string
  nome: string | null
  unidadeId: string
  unidadeNome: string
  dataHora: string
  status: string
  publicada?: boolean
}

interface RunMeta {
  kpis: {
    vpl: number
    capexTotal: number
    obrasConstruidas: number
    obrasTotal: number
    subbaciasFaturando: number
    subbaciasTotal: number
    coberturaFimPct: number
  }
  parametros?: Record<string, unknown>
}

interface Unidade {
  id: string
  nome: string
  resumo?: UnidadeResumo
}

/**
 * A COMPLETUDE vem de `/prontidao`, e não de `/unidades/{id}`.
 *
 * Ela é volátil — muda a cada campo preenchido —, e `/unidades/{id}` é o
 * endpoint do PORTE, cacheado por minutos em `organizacaoApi.ts`. Servida de lá,
 * a Home mostraria um percentual velho, que é pior que nenhum: parece atual.
 *
 * `/prontidao` é o endpoint desenhado para isto, e a completude sai da mesma
 * consulta que ele já faz para as pendências — não custa ida a mais ao banco.
 */
interface Prontidao {
  completude: number
}

export interface HomeDados {
  /** A rodada mais recente COM resultado publicado, ou `null` se não houver. */
  ultima: RunResumo | null
  meta: RunMeta | null
  unidade: Unidade | null
  /** Percentual do cadastro preenchido, de `/prontidao`. `null` se não veio. */
  completude: number | null
  /** Quantas rodadas existem no histórico — o rodapé do card. */
  total: number
  /**
   * OS ANOS DO PLANO — a forma do cronograma, que é a abertura da Home.
   *
   * É uma quarta ida ao servidor, e ela se paga: a pergunta que a Home responde
   * deixou de ser "quanto valeu" e passou a ser "como o plano se distribui no
   * tempo", que é o que este produto faz. Vem no mesmo `Promise.all` das outras
   * três, então não acrescenta um passo em série.
   */
  cronograma: AnoDeObras[]
}

const VAZIO: HomeDados = {
  ultima: null,
  meta: null,
  unidade: null,
  completude: null,
  total: 0,
  cronograma: [],
}

export function useHome() {
  return useQuery<HomeDados>({
    queryKey: ['home'],
    queryFn: async () => {
      const runs = await api.get<RunResumo[]>('/api/runs')
      // A rodada que INTERESSA é a última com resultado: uma que falhou não tem
      // KPI para mostrar, e abrir a Home com ela deixaria o painel em branco
      // sem explicar por quê.
      const ultima = runs.find((r) => r.publicada) ?? null
      if (!ultima) return { ...VAZIO, total: runs.length }

      const [meta, unidade, prontidao, cronograma] = await Promise.all([
        api.get<RunMeta>(`/api/runs/${ultima.runId}/meta`),
        api.get<Unidade>(`/api/unidades/${ultima.unidadeId}`),
        api.get<Prontidao>(`/api/unidades/${ultima.unidadeId}/prontidao`),
        api.get<CronogramaDeObras>(`/api/runs/${ultima.runId}/obras/cronograma`),
      ])
      return {
        ultima,
        meta,
        unidade,
        completude: prontidao.completude,
        total: runs.length,
        cronograma: cronograma.anos,
      }
    },
    // A Home é a primeira tela: cinco minutos evitam refetch a cada volta para
    // ela, e o dado dela não muda em segundos.
    staleTime: 5 * 60_000,
  })
}
