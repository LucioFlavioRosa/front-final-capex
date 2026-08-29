import { useCallback, useMemo, useState } from 'react'
import { Outlet, useNavigate, useParams } from 'react-router-dom'
import { CrumbsProvider, useCrumbsAtuais } from '@/rodada/state/Crumbs'
import { ArvoreEscopo } from '@/rodada/layout/ArvoreEscopo'
import { ProvedorContextoTrilho } from '@/components/layout/ContextoCabecalho'
import { Modal } from '@/components/ui/Modal'
import { PainelDicionario, ProvedorDicionario } from '@/rodada/components/Dicionario'
import { useRunMeta, useRuns } from '@/rodada/api/queries'
import { DICIONARIO_RODADA } from '@/rodada/domain/dicionario'
import { DICIONARIO_RESULTADO } from '@/rodada/domain/dicionarioResultado'
import { dataCurta } from '@/rodada/lib/formato'
import type { Crumb } from '@/rodada/state/Crumbs'

/**
 * OS DOIS DICIONÁRIOS JUNTOS, e não só o de resultado.
 *
 * O rodapé de cada nível mostra os parâmetros com que a rodada foi disparada
 * (orçamento, janela, base de receita, objetivo) — que são verbetes do
 * dicionário da SIMULAÇÃO. Servir só o de resultado deixaria metade da faixa
 * sem "?" possível, e a divisão entre os dois arquivos é de autoria do número,
 * não de tela.
 */
const VERBETES = { ...DICIONARIO_RESULTADO, ...DICIONARIO_RODADA }

/**
 * A casca de `/resultados/*`.
 *
 * Faz três coisas, e as três existem porque as rotas de resultado são PLANAS
 * (`/resultados/:runId/sistemas/:id`, sem ancestralidade no caminho — é o que
 * faz o deep link funcionar):
 *
 *   1. Monta o `CrumbsProvider`. Como a URL não carrega a hierarquia, cada
 *      página DECLARA a sua trilha; a casca só sabe os dois primeiros degraus.
 *   2. Publica o contexto do Trilho — o chip passa a carregar a rodada, e vira
 *      botão de troca.
 *   3. Guarda o seletor de rodada, que é o que aquele botão abre.
 *
 * Desde o redesign de 19/08 ela também monta a ÁRVORE DE ESCOPO à esquerda, e
 * é o único lugar de onde isso pode sair: a árvore precisa sobreviver à
 * navegação entre níveis (senão perde o estado de expansão a cada clique), e a
 * casca é o que não desmonta. Ela só aparece quando há `runId` — o índice de
 * `/resultados` é o histórico, que não é de rodada nenhuma e ocupa a largura
 * inteira.
 */
export function CascaResultado() {
  return (
    <CrumbsProvider>
      <Interna />
    </CrumbsProvider>
  )
}

function Interna() {
  const { runId } = useParams<{ runId: string }>()
  const [seletorAberto, setSeletorAberto] = useState(false)
  const meta = useRunMeta(runId)

  /**
   * O rótulo do chip degrada em três passos, e nenhum deles é vazio.
   *
   * Enquanto o `meta` carrega, o id curto já basta para a pessoa saber que
   * mudou de rodada. Um chip que só aparece depois da resposta faria o
   * cabeçalho "pular" a cada navegação entre níveis.
   */
  const rotulo = useMemo(() => {
    if (!runId) return undefined
    const curto = runId.slice(0, 8)
    if (!meta.data) return `run ${curto}`
    return `${meta.data.nome || `run ${curto}`} · ${dataCurta(meta.data.dataHora)}`
  }, [runId, meta.data])

  const abrir = useCallback(() => setSeletorAberto(true), [])

  const contexto = useMemo(
    () =>
      runId
        ? {
            rotulo: rotulo ?? `run ${runId.slice(0, 8)}`,
            aoClicar: abrir,
            descricao: `Rodada ${meta.data?.nome ?? runId}. Trocar de rodada`,
          }
        : null,
    [runId, rotulo, abrir, meta.data?.nome],
  )

  return (
    <ProvedorContextoTrilho valor={contexto}>
      {/*
        O DICIONÁRIO MORA AQUI, e não em cada nível: o "?" nasce ao lado de um
        KPI no meio da faixa e o painel vive na borda da tela, então o provider
        tem de estar acima dos dois. A casca é também o que não desmonta ao
        navegar entre níveis — com o provider dentro de uma página, descer da
        cidade para o sistema fecharia o verbete aberto.

        O painel só existe quando há rodada: o índice de `/resultados` é o
        histórico, que não tem KPI de resultado para explicar.
      */}
      <ProvedorDicionario>
        {runId ? (
          <div className="max-w-content mx-auto grid items-start gap-6 px-4 py-8 md:px-6 lg:grid-cols-[286px_minmax(0,1fr)]">
            <ArvoreEscopo runId={runId} />
            <div className="min-w-0">
              <Outlet />
            </div>
            <PainelDicionario verbetes={VERBETES} />
          </div>
        ) : (
          <Outlet />
        )}
      </ProvedorDicionario>
      {/*
        SEMPRE montado, e não `{seletorAberto && <SeletorDeRodada />}`: o
        `Modal` só consegue tocar a animação de SAÍDA se ele próprio
        permanecer no DOM enquanto `open` cai para `false` — desmontar o
        wrapper junto com o fechar cortava a saída no mesmo quadro. Quem liga
        e desliga a query é o `enabled` de `useRuns`, lá dentro.
      */}
      <SeletorDeRodada
        aberto={seletorAberto}
        runAtual={runId}
        unidadeId={meta.data?.unidadeId}
        aoFechar={() => setSeletorAberto(false)}
      />
    </ProvedorContextoTrilho>
  )
}

/**
 * Troca de rodada.
 *
 * Filtra pela unidade da rodada ATUAL de propósito: comparar rodadas de
 * unidades diferentes não é uma operação que faça sentido — os números não são
 * do mesmo universo — e oferecer a troca cega convidaria ao erro.
 *
 * A data curta ao lado do nome não é enfeite: reexecutar gera rodada NOVA, e o
 * histórico passa a ter entradas com o mesmo nome e parâmetros quase iguais.
 * Num seletor que mostra só o nome elas ficam indistinguíveis, e trocar às
 * cegas num app de decisão de investimento é pior que não poder trocar.
 */
function SeletorDeRodada({
  aberto,
  runAtual,
  unidadeId,
  aoFechar,
}: {
  aberto: boolean
  runAtual: string | undefined
  unidadeId: string | undefined
  aoFechar: () => void
}) {
  const navegar = useNavigate()
  // Só busca enquanto o seletor está aberto — montar o componente cedo (para
  // o Modal poder animar a saída) não deve significar buscar cedo.
  const runs = useRuns(unidadeId ? { unidadeId } : undefined, { enabled: aberto })

  return (
    <Modal
      open={aberto}
      onClose={aoFechar}
      title="Trocar de rodada"
      subtitle="Só rodadas desta unidade — números de unidades diferentes não se comparam."
      size="sm"
    >
      {runs.isPending && <p className="text-sm text-ink-500">Carregando rodadas…</p>}
      {runs.isError && (
        <p className="text-sm text-danger">Não foi possível carregar a lista de rodadas.</p>
      )}
      {runs.data && runs.data.length === 0 && (
        <p className="text-sm text-ink-500">Esta unidade não tem outras rodadas.</p>
      )}
      {runs.data && runs.data.length > 0 && (
        <ul className="m-0 flex max-h-[50vh] list-none flex-col gap-1.5 overflow-y-auto p-0">
          {runs.data.map((r) => {
            const atual = r.runId === runAtual
            return (
              <li key={r.runId}>
                <button
                  type="button"
                  disabled={atual}
                  onClick={() => {
                    navegar(`/resultados/${r.runId}`)
                    aoFechar()
                  }}
                  className={`w-full rounded-[9px] border px-3 py-2.5 text-left transition-colors duration-hover ease-saida ${
                    atual
                      ? 'cursor-default border-aegea-300 bg-aegea-50'
                      : 'border-ink-200 bg-white hover:border-water-300 hover:bg-water-50'
                  }`}
                >
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-[13px] font-semibold text-ink-800">
                      {r.nome || r.runId.slice(0, 8)}
                    </span>
                    <span className="shrink-0 font-mono text-[10.5px] text-ink-400">
                      {dataCurta(r.dataHora)}
                    </span>
                  </span>
                  <span className="mt-0.5 block font-mono text-[10.5px] text-ink-400">
                    {r.runId.slice(0, 8)}
                    {atual && ' · você está aqui'}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </Modal>
  )
}

/**
 * O cabeçalho de página das telas de rodada.
 *
 * Usa o `PageHeader` do kit, que até agora não tinha nenhum consumidor — as
 * telas de rodada o estreiam. A trilha vem do `CrumbsProvider` e não da URL,
 * mais os dois degraus fixos que a casca conhece.
 */
export function useTrilhaCompleta(runId: string | undefined, nomeDaRodada?: string): Crumb[] {
  const proprios = useCrumbsAtuais()
  return useMemo(() => {
    const base: Crumb[] = [{ rotulo: 'Histórico', to: '/resultados' }]
    if (runId) {
      base.push({
        rotulo: nomeDaRodada || runId.slice(0, 8),
        // O degrau da rodada só é clicável quando NÃO é o atual.
        to: proprios.length > 0 ? `/resultados/${runId}` : undefined,
      })
    }
    return [...base, ...proprios]
  }, [runId, nomeDaRodada, proprios])
}
