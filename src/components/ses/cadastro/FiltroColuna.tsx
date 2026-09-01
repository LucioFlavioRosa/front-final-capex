/**
 * Filtro por coluna, estilo Excel — valores distintos com caixa de seleção.
 *
 * DUAS RESTRIÇÕES definiram o desenho, e nenhuma é estética:
 *
 *   1. NÃO PODE OCUPAR ESPAÇO NO CABEÇALHO. A grade usa `table-fixed` com
 *      larguras de 84/128/168px, e um controle dentro de 84px é o mesmo erro
 *      que já quebrou rótulo no meio da palavra ("PRAZO DAS PREDE/CESSO/RAS").
 *      Daí o funil de 12px que abre um popover em portal: o painel tem 260px,
 *      a coluna não perde um pixel.
 *   2. PRECISA DE BUSCA. `sub_bacia_name` tem 1.047 valores distintos — uma
 *      lista de caixas de seleção sem busca é inutilizável nessa escala.
 *
 * O popover vai em portal por herança do mesmo problema do `Tooltip`: a grade
 * rola dentro de `overflow-x-auto`, e um eixo com overflow != visible faz o
 * navegador tratar o outro como `auto` — um popover em `position: absolute`
 * dentro do `<th>` sairia recortado.
 *
 * PALETA CLARA, nos tokens desta base — `bg-white` + `border-ink-200` +
 * `shadow-elev` no painel, `text-ink-*` no texto, `hover:bg-water-50` na linha.
 * Nada de cor de tema escuro aqui.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Funnel, MagnifyingGlass } from '@phosphor-icons/react'
import type { Row } from '../../../data/cadastroUnidade/types'

/** Identidade estável para "ainda não calculado" — ver `distintos`. */
const VAZIO: string[] = []

interface Props {
  /** Rótulo humano da coluna, para o título do painel. */
  rotulo: string
  /**
   * As LINHAS e a COLUNA, e não a lista de valores já pronta.
   *
   * Recebia `valores: string[]`, e o chamador montava com `rows.map(...)` no
   * corpo do render. Duas consequências, as duas caras:
   *
   *   - um array novo por coluna a cada render (751 strings × ~45 colunas na aba
   *     de Sub-bacias), só para ser descartado;
   *   - o `useMemo` de `distintos` chaveado nesse array NUNCA acertava, porque a
   *     identidade mudava sempre. Resultado: `Set` + ordenação por
   *     `localeCompare` refeitos a cada render, em toda coluna, com o painel
   *     FECHADO.
   *
   * Media 3.084ms para abrir a aba de Sub-bacias — que pinta UMA linha. Com os
   * funis desligados, 20ms. Recebendo `linhas`/`coluna`, a identidade é estável
   * e o trabalho só acontece quando alguém abre o funil.
   */
  linhas: Row[]
  coluna: string
  /** Valores atualmente aceitos. `null` = sem filtro (aceita tudo). */
  selecionados: Set<string> | null
  onChange: (selecionados: Set<string> | null) => void
}

/** Rótulo de um valor na lista — o vazio precisa de nome para ser filtrável. */
const rotuloValor = (v: string) => (v === '' ? '(vazias)' : v)

/**
 * UM colator, criado uma vez.
 *
 * `a.localeCompare(b, 'pt-BR', {numeric:true})` remonta as opções de comparação
 * a cada par. Numa coluna de 751 valores distintos isso é milhares de
 * construções idênticas — o `Intl.Collator` reaproveita a mesma, e é o motivo
 * de ele existir na plataforma.
 */
const ORDEM = new Intl.Collator('pt-BR', { numeric: true })

export function FiltroColuna({ rotulo, linhas, coluna, selecionados, onChange }: Props) {
  const [aberto, setAberto] = useState(false)
  const [busca, setBusca] = useState('')
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const botaoRef = useRef<HTMLButtonElement>(null)
  const painelRef = useRef<HTMLDivElement>(null)

  /**
   * SÓ COM O PAINEL ABERTO. A lista de valores distintos é o conteúdo do
   * popover; com ele fechado ninguém a vê, e calculá-la é trabalho jogado fora —
   * multiplicado pelo número de colunas da aba.
   */
  const distintos = useMemo(() => {
    if (!aberto) return VAZIO
    const set = new Set<string>()
    for (const l of linhas) set.add(l[coluna] ?? '')
    return [...set].sort((a, b) => {
      if (a === '') return -1
      if (b === '') return 1
      return ORDEM.compare(a, b)
    })
  }, [aberto, linhas, coluna])

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    if (!q) return distintos
    return distintos.filter((v) => rotuloValor(v).toLowerCase().includes(q))
  }, [distintos, busca])

  const ativo = selecionados !== null

  function abrir() {
    const r = botaoRef.current?.getBoundingClientRect()
    if (!r) return
    // Alinha o painel à direita do funil e o mantém dentro da janela.
    setPos({
      top: r.bottom + 6,
      left: Math.min(Math.max(r.left - 120, 12), window.innerWidth - 272),
    })
    setBusca('')
    setAberto(true)
  }

  // Esc fecha e devolve o foco; clique fora fecha.
  useEffect(() => {
    if (!aberto) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setAberto(false)
        botaoRef.current?.focus()
      }
    }
    function onDown(e: MouseEvent) {
      const alvo = e.target as Node
      if (painelRef.current?.contains(alvo) || botaoRef.current?.contains(alvo)) return
      setAberto(false)
    }
    document.addEventListener('keydown', onKey, true)
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      document.removeEventListener('mousedown', onDown)
    }
  }, [aberto])

  /** Alterna um valor. Sem filtro ativo, o primeiro clique parte de "tudo aceito". */
  function alternar(v: string) {
    const base = selecionados ?? new Set(distintos)
    const proximo = new Set(base)
    if (proximo.has(v)) proximo.delete(v)
    else proximo.add(v)
    // Nada marcado ou tudo marcado significam a mesma coisa: sem filtro.
    onChange(proximo.size === 0 || proximo.size === distintos.length ? null : proximo)
  }

  const todosVisiveisMarcados = filtrados.every((v) => (selecionados ?? new Set(distintos)).has(v))

  return (
    <>
      <button
        ref={botaoRef}
        type="button"
        onClick={() => (aberto ? setAberto(false) : abrir())}
        aria-expanded={aberto}
        aria-label={`Filtrar ${rotulo}${ativo ? ' (filtro ativo)' : ''}`}
        title={`Filtrar ${rotulo}`}
        className={`ml-0.5 inline-flex align-middle transition-colors duration-hover ease-saida ${
          ativo ? 'text-water-600' : 'text-ink-water hover:text-water-600'
        }`}
      >
        <Funnel weight={ativo ? 'fill' : 'regular'} className="text-[12px]" />
      </button>

      {aberto &&
        createPortal(
          <div
            ref={painelRef}
            role="dialog"
            aria-label={`Filtro da coluna ${rotulo}`}
            style={{ position: 'fixed', top: pos.top, left: pos.left }}
            className="z-[75] w-[260px] overflow-hidden rounded-xl border border-ink-200 bg-white shadow-elev"
          >
            <div className="flex items-center gap-2 border-b border-ink-100 px-3 py-2.5">
              <MagnifyingGlass className="shrink-0 text-[13px] text-ink-water" />
              <input
                autoFocus
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder={`Filtrar ${rotulo}`}
                className="min-w-0 flex-1 border-0 bg-transparent text-[13px] text-ink-900 outline-none placeholder:text-ink-water"
              />
            </div>

            <label className="flex cursor-pointer items-center gap-2.5 border-b border-ink-100 px-3 py-2 text-[13px] text-ink-700 transition-colors duration-hover ease-saida hover:bg-water-50">
              <input
                type="checkbox"
                checked={todosVisiveisMarcados}
                onChange={() =>
                  onChange(
                    todosVisiveisMarcados
                      ? new Set(distintos.filter((v) => !filtrados.includes(v)))
                      : null,
                  )
                }
                className="accent-water-600"
              />
              (todos)
            </label>

            <ul className="max-h-[240px] overflow-y-auto py-1">
              {filtrados.map((v) => (
                <li key={v}>
                  <label className="flex cursor-pointer items-center gap-2.5 px-3 py-1.5 text-[13px] transition-colors duration-hover ease-saida hover:bg-water-50">
                    <input
                      type="checkbox"
                      checked={(selecionados ?? new Set(distintos)).has(v)}
                      onChange={() => alternar(v)}
                      className="shrink-0 accent-water-600"
                    />
                    <span className={`truncate ${v === '' ? 'italic text-ink-water' : 'text-ink-800'}`}>
                      {rotuloValor(v)}
                    </span>
                  </label>
                </li>
              ))}
              {!filtrados.length && (
                <li className="px-3 py-2 text-[12.5px] text-ink-water">Nenhum valor.</li>
              )}
            </ul>

            <div className="flex items-center justify-between border-t border-ink-100 px-3 py-2">
              <span className="text-[11.5px] tabular-nums text-ink-water">
                {distintos.length} {distintos.length === 1 ? 'valor' : 'valores'}
              </span>
              <button
                type="button"
                onClick={() => onChange(null)}
                disabled={!ativo}
                className="text-[12px] font-medium text-water-600 transition-colors duration-hover ease-saida hover:text-water-700 disabled:text-ink-300"
              >
                Limpar
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
