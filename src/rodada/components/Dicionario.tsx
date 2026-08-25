import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { X } from '@phosphor-icons/react'
import { Tag } from '@/rodada/components/pecas'
import { DICIONARIO_RODADA, tomDaOrigem, type Verbete } from '@/rodada/domain/dicionario'

/**
 * O "?" DE CADA PARÂMETRO, e o painel que ele abre.
 *
 * Três peças que só fazem sentido juntas, e por isso moram no mesmo arquivo:
 * o contexto que guarda a chave aberta, o botão que a define, e o painel que a
 * lê. Separá-las em três arquivos daria três importações para um gesto só.
 *
 * O CONTEXTO EXISTE PORQUE O "?" NÃO É VIZINHO DO PAINEL. Ele nasce ao lado de
 * um rótulo, no meio de um formulário aninhado, e o painel vive na borda da
 * tela; passar `aoAbrir` por props atravessaria cinco níveis de componente que
 * não têm nada a ver com dicionário.
 *
 * O provider fica em `Simular`, e não no shell do app: hoje só aquela tela tem
 * parâmetros para explicar, e um provider global anunciaria um recurso que as
 * outras telas não têm.
 */

interface Contexto {
  chave: string | null
  abrir: (chave: string) => void
  fechar: () => void
}

const Ctx = createContext<Contexto | null>(null)

export function ProvedorDicionario({ children }: { children: ReactNode }) {
  const [chave, setChave] = useState<string | null>(null)
  const fechar = useCallback(() => setChave(null), [])
  // `abrir` na MESMA chave fecha: o "?" é um alternador, e clicar duas vezes no
  // mesmo ponto de interrogação querendo fechar o painel é o gesto natural.
  const abrir = useCallback((k: string) => setChave((atual) => (atual === k ? null : k)), [])
  const valor = useMemo(() => ({ chave, abrir, fechar }), [chave, abrir, fechar])
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>
}

/**
 * Fora do provider o "?" simplesmente não aparece — em vez de estourar.
 *
 * O botão é enfeite informativo: uma tela que reusar um campo destes sem querer
 * o dicionário não deve quebrar por causa disso.
 */
function useDicionario(): Contexto | null {
  return useContext(Ctx)
}

/**
 * O "?" ao lado de um rótulo.
 *
 * FORA do `<label>`: é um controle próprio, e não parte do nome do campo —
 * dentro, o leitor de tela anunciaria "Foco em cobertura ?".
 */
export function BotaoAjuda({ chave, texto }: { chave: string; texto: string }) {
  const dict = useDicionario()
  if (!dict) return null
  const aberto = dict.chave === chave
  return (
    <button
      type="button"
      aria-label={`O que é "${texto}"?`}
      aria-expanded={aberto}
      onClick={() => dict.abrir(chave)}
      className={`inline-flex h-[17px] w-[17px] shrink-0 items-center justify-center rounded-full border text-[10.5px] font-bold leading-none transition-colors duration-hover ease-saida focus:outline-none focus:ring-2 focus:ring-water-600/25 ${
        aberto
          ? 'border-water-600 bg-water-600 text-white'
          : 'border-ink-300 text-ink-400 hover:border-water-600 hover:text-water-600'
      }`}
    >
      ?
    </button>
  )
}

/**
 * Rótulo de um parâmetro: nome humano, NOME TÉCNICO em mono e o "?".
 *
 * O nome técnico não é enfeite — é rastreabilidade. Quem conhece o notebook
 * reconhece `FOCO_COBERTURA` e sabe exatamente o que o controle mexe; sem ele, a
 * tradução para linguagem de negócio viraria adivinhação.
 *
 * MAS ELE FICA FORA DO `<label>`, junto com o "?". O `<label>` define o NOME
 * ACESSÍVEL do campo, e o técnico ali dentro faria o leitor de tela anunciar
 * "Unidade UNIDADE" — e faria `getByLabelText('Unidade')` deixar de achar o
 * campo, que foi exatamente como isto apareceu. O técnico é anotação visual
 * sobre o campo, não parte do nome dele.
 *
 * SÓ VIRA `<label>` QUANDO RECEBE `htmlFor`. Sem ele, o campo já está envolvido
 * por um `<label>` de fora (o padrão desta tela: `<label className="block">`
 * abraçando rótulo e `<select>`), e um segundo `<label>` aninhado ali dentro
 * rouba a associação — o `<select>` fica sem nome acessível nenhum, que foi o
 * segundo jeito de a mesma linha quebrar.
 */
export function RotuloParametro({
  texto,
  tecnico,
  htmlFor,
}: {
  texto: string
  tecnico: string
  htmlFor?: string
}) {
  const Nome = htmlFor ? 'label' : 'span'
  return (
    <span className="mb-1.5 flex items-center gap-1.5">
      <Nome
        htmlFor={htmlFor}
        className="text-[10.5px] font-bold uppercase tracking-[.075em] text-ink-500"
      >
        {texto}
      </Nome>
      <code
        aria-hidden="true"
        className="font-mono text-[9.5px] font-medium normal-case tracking-normal text-ink-400"
      >
        {tecnico}
      </code>
      <BotaoAjuda chave={tecnico} texto={texto} />
    </span>
  )
}

/**
 * O PAINEL, fixo na borda direita.
 *
 * Não rouba o foco ao abrir — a pessoa continua no campo que estava lendo —,
 * mas `Esc` fecha e o verbete é anunciado por `aria-live`: abrir o painel pelo
 * teclado sem isso não dava retorno nenhum.
 */
export function PainelDicionario({
  verbetes = DICIONARIO_RODADA,
}: {
  verbetes?: Record<string, Verbete>
}) {
  const dict = useDicionario()
  const aberto = !!dict?.chave

  useEffect(() => {
    if (!aberto || !dict) return
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dict.fechar()
    }
    document.addEventListener('keydown', aoTeclar)
    return () => document.removeEventListener('keydown', aoTeclar)
  }, [aberto, dict])

  if (!dict?.chave) return null

  const v = verbetes[dict.chave]

  return (
    <aside
      role="complementary"
      aria-label="Dicionário de dados"
      aria-live="polite"
      className="carta fixed right-4 top-24 bottom-6 z-40 flex w-[340px] max-w-[calc(100vw-2rem)] flex-col overflow-y-auto p-5 shadow-xl animate-fade-in"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="text-[10.5px] font-bold uppercase tracking-[.09em] text-ink-400">
          Dicionário de dados
        </span>
        <button
          type="button"
          onClick={dict.fechar}
          aria-label="Fechar o dicionário de dados"
          className="-m-1 rounded p-1 text-ink-400 transition-colors duration-hover ease-saida hover:text-ink-700"
        >
          <X weight="bold" />
        </button>
      </div>

      {!v ? (
        /* Chave sem verbete é bug de quem escreveu o "?", não do usuário — mas
           quem está na tela precisa de uma frase, e não de um painel vazio. */
        <p className="mt-4 text-[13px] leading-relaxed text-ink-500">
          Verbete “{dict.chave}” ainda não cadastrado no dicionário.
        </p>
      ) : (
        <>
          <div className="mt-2 flex flex-wrap items-baseline gap-2">
            <span className="text-[17px] font-bold leading-snug text-ink-800">{v.rotulo}</span>
            <code className="rounded bg-ink-100 px-1.5 py-0.5 font-mono text-[10.5px] text-ink-500">
              {v.tec}
            </code>
          </div>

          <div className="mt-2.5 flex flex-wrap gap-1.5">
            <Tag tom={tomDaOrigem(v.origem)}>{v.origem}</Tag>
            <Tag tom="neutro">{v.tipo}</Tag>
          </div>

          <Secao titulo="O que é">{v.oque}</Secao>
          <Secao titulo="Por que o modelo usa">{v.porque}</Secao>

          <div className="mt-5 rounded-[10px] border border-ink-200 bg-ink-50 p-3.5">
            <div className="text-[10.5px] font-bold uppercase tracking-[.09em] text-ink-400">
              Exemplo
            </div>
            <div className="mt-1 text-[14px] font-semibold text-ink-800">{v.exemplo}</div>
          </div>
        </>
      )}
    </aside>
  )
}

function Secao({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="mt-5">
      <div className="text-[11.5px] font-semibold uppercase tracking-[.05em] text-ink-water">
        {titulo}
      </div>
      <p className="mt-1 text-[13px] leading-relaxed text-ink-700">{children}</p>
    </div>
  )
}
