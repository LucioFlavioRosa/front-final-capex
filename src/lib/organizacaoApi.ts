/**
 * Regionais, diretorias e unidades — a estrutura organizacional da Aegea.
 *
 * A HIERARQUIA COMPLETA, confirmada com o cliente (01/09), é
 * `regional → diretoria → unidade → empresa → cidade → sistema`. Os três
 * primeiros níveis são o que se ESCOLHE antes de abrir o cadastro; os três
 * últimos são o cadastro em si, e vivem em `cadastroApi`.
 *
 * A LISTA VEM DO BANCO, e não de um arquivo compilado no bundle, pela mesma
 * regra que rege o resto do app: **se uma unidade não existe no banco, ela não
 * aparece no front.** Hoje isso significa 1 regional (R4) e 2 unidades (56, 57)
 * — as únicas carregadas em `input.unidade_regional`. O de-para completo (5
 * regionais, 52 unidades) vive em `scripts/hierarquiaReal.ts`, como insumo de
 * carga.
 *
 * Fica em `lib/`, e não em `rodada/`, porque os dois consumidores são de áreas
 * diferentes: o Cadastro (`SelecaoUnidade`, `CadastroContext`) e o Simular
 * (`rodada/pages/Simular.tsx`). Nenhum dos dois deveria importar do outro.
 */
import { useQuery } from '@tanstack/react-query'
import { api } from './api'

export interface Regional {
  id: string
  nome: string
}

/** O nível entre a regional e a unidade. */
export interface Diretoria {
  id: string
  /** `null` quando a carga trouxe a diretoria sem nome — a tela cai para o id. */
  nome: string | null
}

/**
 * O PORTE da unidade, como o servidor o conta.
 *
 * Serve para escolher: 21 cidades e 2.090 componentes não é a mesma decisão que
 * 8 cidades e 710, e a tela de nova simulação usa estes números para dizer se a
 * rodada é de minutos ou de meia hora.
 */
export interface UnidadeResumo {
  cidades: number
  sistemas: number
  subBacias: number
  /** Esparsas: nem toda sub-bacia tem CTS pareada, e zero é comum. */
  cts: number
  etes: number
  /**
   * Candidatas de CAPEX: `obrasAegea + obrasTerceiros` — o mesmo critério do
   * motor (`necess = capex > 0 || tempo_execucao > 0`), e NÃO o total de linhas
   * da ficha.
   */
  obras: number
  /** `capex > 0` — investimento da Aegea. */
  obrasAegea: number
  /** `capex = 0` e prazo > 0: a obra acontece e ocupa a sequência, outro paga. */
  obrasTerceiros: number
  /** `capex = 0` e prazo = 0: o elemento existe na ficha e não gera obra. */
  semObra: number
}

export interface Unidade {
  id: string
  nome: string
  regionalId: string
  /**
   * `null` enquanto a carga não trouxer a diretoria desta unidade.
   *
   * A tela FILTRA por este campo em vez de pedir a lista de unidades da
   * diretoria ao servidor: as unidades já vêm recortadas pela concessão, e uma
   * segunda rota recortada seria uma segunda regra de acesso para manter.
   */
  diretoriaId: string | null
  diretoriaNome: string | null
  /**
   * OPCIONAL porque só `/unidades/{id}` o traz.
   *
   * A lista de `/regionais/{id}/unidades` alimenta um `<select>` que não mostra
   * nenhum destes números, e contá-los por unidade seriam oito `count(*)` sobre
   * a topologia inteira vezes o tamanho da lista. Quem precisa do porte já
   * escolheu uma unidade.
   */
  resumo?: UnidadeResumo
}

const chaves = {
  regionais: ['regionais'] as const,
  diretorias: (regionalId: string) => ['regionais', regionalId, 'diretorias'] as const,
  unidades: (regionalId: string) => ['regionais', regionalId, 'unidades'] as const,
  unidade: (id: string) => ['unidades', id] as const,
}

/**
 * Organização é estável mas não IMUTÁVEL — ao contrário do resultado de uma
 * rodada, uma unidade pode ser cadastrada no meio de uma sessão. `staleTime`
 * de minutos, não `Infinity`.
 */
const ESTAVEL = { staleTime: 5 * 60_000 } as const

export function useRegionais() {
  return useQuery({
    queryKey: chaves.regionais,
    queryFn: () => api.get<Regional[]>('/api/regionais'),
    ...ESTAVEL,
  })
}

export function useDiretorias(regionalId: string | undefined) {
  return useQuery({
    queryKey: chaves.diretorias(regionalId ?? '—'),
    queryFn: () => api.get<Diretoria[]>(`/api/regionais/${regionalId}/diretorias`),
    enabled: !!regionalId,
    ...ESTAVEL,
  })
}

export function useUnidades(regionalId: string | undefined) {
  return useQuery({
    queryKey: chaves.unidades(regionalId ?? '—'),
    queryFn: () => api.get<Unidade[]>(`/api/regionais/${regionalId}/unidades`),
    enabled: !!regionalId,
    ...ESTAVEL,
  })
}

export function useUnidade(id: string | undefined) {
  return useQuery({
    queryKey: chaves.unidade(id ?? '—'),
    queryFn: () => api.get<Unidade>(`/api/unidades/${id}`),
    enabled: !!id,
    ...ESTAVEL,
  })
}
