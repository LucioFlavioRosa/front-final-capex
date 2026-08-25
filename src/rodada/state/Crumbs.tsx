import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'

/**
 * Trilha do breadcrumb das telas de resultado.
 *
 * Por que um contexto e nao derivar da URL: as rotas de resultado sao PLANAS
 * (`/resultados/:runId/sistemas/:id`), sem a ancestralidade no caminho. Isso e
 * proposital — bate com o contrato de API do handoff, mantem a URL curta e faz o
 * deep link funcionar para quem chega de fora. Mas significa que a pagina do
 * sistema e a unica que sabe a que cidade ele pertence: essa informacao vem no
 * payload, nao na rota.
 *
 * Entao cada pagina DECLARA a sua trilha abaixo da rodada. A casca cuida dos dois
 * primeiros degraus (historico e a rodada), que ela sabe sozinha.
 */
export interface Crumb {
  rotulo: string
  /** Sem `to`, o degrau e o atual (nao clicavel). */
  to?: string
}

interface CrumbsCtx {
  crumbs: Crumb[]
  definir: (c: Crumb[]) => void
}

const Ctx = createContext<CrumbsCtx | null>(null)

export function CrumbsProvider({ children }: { children: ReactNode }) {
  const [crumbs, setCrumbs] = useState<Crumb[]>([])

  // Compara por conteudo antes de gravar: as paginas chamam `useCrumbs` com um
  // array literal, que e novo a cada render. Sem esta guarda, cada set dispara
  // outro render e o efeito entra em laco.
  const definir = useCallback((c: Crumb[]) => {
    setCrumbs((atual) => (mesmaTrilha(atual, c) ? atual : c))
  }, [])

  const valor = useMemo(() => ({ crumbs, definir }), [crumbs, definir])
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>
}

function mesmaTrilha(a: Crumb[], b: Crumb[]): boolean {
  if (a.length !== b.length) return false
  return a.every((x, i) => x.rotulo === b[i].rotulo && x.to === b[i].to)
}

/** Lido pelo breadcrumb da casca. */
// eslint-disable-next-line react-refresh/only-export-components
export function useCrumbsAtuais(): Crumb[] {
  const ctx = useContext(Ctx)
  return ctx?.crumbs ?? []
}

/**
 * Declara a trilha desta pagina, abaixo da rodada. Chamar sem argumento (ou com
 * lista vazia) limpa — e o que o nivel global faz, por nao ter degrau proprio.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function useCrumbs(crumbs: Crumb[]) {
  const ctx = useContext(Ctx)
  const definir = ctx?.definir
  // A dependencia e o CONTEUDO serializado, nao o array: assim uma pagina pode
  // passar literal sem precisar de useMemo em cada chamada.
  const chave = JSON.stringify(crumbs)
  useEffect(() => {
    definir?.(JSON.parse(chave) as Crumb[])
  }, [definir, chave])
}
