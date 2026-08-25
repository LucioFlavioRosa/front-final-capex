import { createContext, useContext, useMemo, type ReactNode } from 'react'

/**
 * O CHIP DE CONTEXTO DO TRILHO, quando a tela quer dizer outra coisa.
 *
 * O chip é o único elemento do cabeçalho cujo trabalho é dizer a que RECORTE
 * todo número abaixo se refere. No cadastro esse recorte é a unidade em
 * operação, e é o texto fixo que o `Header` sempre teve.
 *
 * Numa tela de resultado o recorte não é a unidade — é a RODADA: imutável,
 * datada e de alguém. Mesmo componente, mesmo slot, mesma mono; só o conteúdo
 * muda, resolvido pela rota.
 *
 * O default é `null` DE PROPÓSITO, e é o que garante o escopo do redesign: sem
 * provider, o `Header` cai no texto que ele já tinha, e a saída renderizada do
 * cadastro é idêntica à de antes desta mudança.
 */
export interface ContextoTrilho {
  /** Texto do chip, em mono. */
  rotulo: string
  /** Quando presente, o chip vira botão — é a troca de rodada. */
  aoClicar?: () => void
  /** Lido por leitor de tela no lugar do rótulo, quando ele é abreviado. */
  descricao?: string
}

const Ctx = createContext<ContextoTrilho | null>(null)

export function ProvedorContextoTrilho({
  valor,
  children,
}: {
  valor: ContextoTrilho | null
  children: ReactNode
}) {
  // `valor` costuma ser um literal montado no render da casca, então memoiza
  // pelo conteúdo — senão todo render do pai reidentifica o contexto e o
  // `Header` inteiro repinta a cada tecla digitada na tela abaixo.
  const memo = useMemo(
    () => valor,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [valor?.rotulo, valor?.descricao, valor?.aoClicar],
  )
  return <Ctx.Provider value={memo}>{children}</Ctx.Provider>
}

export function useContextoTrilho(): ContextoTrilho | null {
  return useContext(Ctx)
}
