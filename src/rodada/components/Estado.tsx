import type { ReactNode } from 'react'
import { ArrowClockwise, Warning, Tray } from '@phosphor-icons/react'
import { Button } from '@/components/ui/Button'

/**
 * Os três estados que TODA tela de leitura de rodada tem.
 *
 * Estão num arquivo só, e não copiados em cada página, porque a tentação é
 * exatamente essa e o resultado é o inventário da fase 7 já previu: o `Vazio` é
 * o mais fácil de esquecer, e quando cada tela decide sozinha ele desaparece de
 * metade delas.
 *
 * A regra que diferencia os três, e que o desenho da fase 8 fixou:
 *   Carregando → rótulo ESPECÍFICO da tela, nunca "Carregando…" genérico.
 *   ErroCarga  → a causa E uma saída. Erro sem `refetch` obriga o usuário a
 *                recarregar a página inteira, perdendo a rodada em que estava.
 *   Vazio      → distingue "não há" de "não achei", e oferece o próximo passo.
 */

/**
 * Esqueleto, e não spinner.
 *
 * O spinner diz "espere"; o esqueleto diz "espere, e o que vem tem esta forma".
 * Numa tela de seis quadros isso é a diferença entre a página parecer travada e
 * parecer montando.
 */
export function Carregando({ rotulo, linhas = 3 }: { rotulo: string; linhas?: number }) {
  return (
    <div role="status" aria-live="polite" className="animate-fade-in">
      <span className="sr-only">{rotulo}</span>
      <div aria-hidden="true" className="flex flex-col gap-3">
        <div className="text-[11px] font-semibold uppercase tracking-[.09em] text-ink-water">
          {rotulo}
        </div>
        {Array.from({ length: linhas }, (_, i) => (
          <div
            key={i}
            className="h-3 animate-pulse rounded-md bg-ink-200"
            style={{ width: `${100 - i * 12}%` }}
          />
        ))}
      </div>
    </div>
  )
}

/**
 * Erro de carga COM saída.
 *
 * `aoRecarregar` não é opcional de propósito: um erro que só informa força o F5,
 * e no drill-down de seis níveis o F5 custa o contexto inteiro.
 */
export function ErroCarga({
  titulo,
  causa,
  aoRecarregar,
}: {
  titulo: string
  causa?: string
  aoRecarregar: () => void
}) {
  return (
    <div
      role="alert"
      className="animate-fade-in rounded-2xl border border-danger/25 bg-white p-5 shadow-soft"
    >
      <div className="flex items-start gap-3">
        <Warning weight="fill" className="mt-0.5 shrink-0 text-lg text-danger" />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink-800">{titulo}</p>
          {causa && <p className="mt-1 text-[12.5px] leading-snug text-ink-water">{causa}</p>}
          <Button variant="secondary" className="mt-3.5" onClick={aoRecarregar}>
            <ArrowClockwise className="text-base" />
            Tentar de novo
          </Button>
        </div>
      </div>
    </div>
  )
}

/**
 * Vazio — o estado que some quando ninguém o desenha.
 *
 * A borda é TRACEJADA, e isso é a gramática da fase 8: tracejado significa
 * "esperando alguém". Um quadro vazio está esperando dado, exatamente como um
 * campo vazio espera digitação.
 */
export function Vazio({
  titulo,
  texto,
  acao,
}: {
  titulo: string
  texto: string
  acao?: ReactNode
}) {
  return (
    <div className="animate-fade-in rounded-2xl border-[1.5px] border-dashed border-ink-300 bg-white p-8 text-center">
      <span className="mx-auto mb-2.5 flex h-11 w-11 items-center justify-center rounded-full bg-ink-100 text-ink-water">
        <Tray weight="fill" className="text-xl" />
      </span>
      <p className="text-sm font-semibold text-ink-800">{titulo}</p>
      <p className="mx-auto mt-1 max-w-[38ch] text-[12.5px] leading-snug text-ink-water">{texto}</p>
      {acao && <div className="mt-4 flex justify-center">{acao}</div>}
    </div>
  )
}

/**
 * O envelope que resolve os três de uma vez.
 *
 * Existe porque a alternativa — `if (isPending) … if (isError) …` em cada
 * página — é onde o `Vazio` se perde: os dois primeiros o compilador cobra, o
 * terceiro ninguém cobra.
 *
 * `vazio` é uma função e não um booleano para que a página diga o que conta
 * como vazio (lista sem itens, série sem pontos), que muda por tela.
 */
export function Estado<T>({
  consulta,
  rotulo,
  tituloErro,
  vazio,
  children,
}: {
  consulta: {
    data: T | undefined
    isPending: boolean
    isError: boolean
    error: unknown
    refetch: () => void
  }
  rotulo: string
  tituloErro: string
  vazio?: { checar: (d: T) => boolean; titulo: string; texto: string; acao?: ReactNode }
  children: (dados: T) => ReactNode
}) {
  if (consulta.isPending) return <Carregando rotulo={rotulo} />

  if (consulta.isError) {
    const e = consulta.error
    return (
      <ErroCarga
        titulo={tituloErro}
        causa={e instanceof Error ? e.message : undefined}
        aoRecarregar={() => consulta.refetch()}
      />
    )
  }

  const dados = consulta.data as T
  if (vazio?.checar(dados)) {
    return <Vazio titulo={vazio.titulo} texto={vazio.texto} acao={vazio.acao} />
  }

  return <>{children(dados)}</>
}
