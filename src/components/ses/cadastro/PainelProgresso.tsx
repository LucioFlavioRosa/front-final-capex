/**
 * Progresso do preenchimento — chip no topo que expande.
 *
 * Este arquivo é metade do antigo `PainelProntidao`, que juntava progresso e
 * problemas de consistência na mesma coluna. A separação é da sessão de
 * 30/07/2026 com a Aegea: dentro do cadastro a pergunta é "quanto falta e onde",
 * e um alerta de duplicata ao lado do campo que a pessoa está digitando
 * interrompe sem ser acionável — a duplicata está em OUTRA aba, e resolvê-la
 * agora significa abandonar o que se estava fazendo.
 *
 * Os problemas foram para a Revisão (ver `PainelProblemas`), que é a tela onde a
 * pergunta certa é "este cadastro produz um plano confiável?" — e onde um
 * problema crítico bloqueia a rodada.
 *
 * ---
 * DE SIDEBAR PARA CHIP (07/08/2026). Era uma coluna fixa de 336px à direita da
 * grade; virou um chip no bloco de topo que abre um popover com a mesma
 * informação, agora agrupada pelos blocos do wizard (`ListaAbasProgresso`).
 *
 * A troca vale porque 336px de cromo permanente eram caros numa tela cuja aba
 * mais larga tem 22 colunas — a grade os usa melhor. O custo é um clique, e o
 * chip colapsado já responde a "quanto falta" sem precisar dele.
 *
 * POPOVER, e não painel que empurra conteúdo: a tela é one-page e densa, e
 * deslocar a grade que a pessoa está editando para abrir um resumo é pior que
 * cobri-la. Vai em portal por herança do mesmo problema do `Tooltip` — a grade
 * rola dentro de `overflow-x-auto`, e um eixo com overflow != visible faz o
 * navegador tratar o outro como `auto`, recortando qualquer coisa absoluta.
 */

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CaretDown, X } from '@phosphor-icons/react'
import type { Row } from '../../../data/cadastroUnidade/types'
import { totalGeral } from '../../../lib/cadastroCalc'
import { progressoPorBloco } from '../../../data/cadastroUnidade/blocos'
import { ListaAbasProgresso } from './ListaAbasProgresso'

interface ChipProgressoProps {
  dados: Record<string, Row[]>
  /** Leva o usuário até a aba clicada — e fecha o popover. */
  onIrParaAba?: (abaKey: string) => void
  /** Abre a tela de Revisão (o link do rodapé do popover). */
  onIrParaRevisao?: () => void
}

export function ChipProgresso({ dados, onIrParaAba, onIrParaRevisao }: ChipProgressoProps) {
  const [aberto, setAberto] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const chipRef = useRef<HTMLButtonElement>(null)
  const painelRef = useRef<HTMLDivElement>(null)

  const geral = totalGeral(dados)
  // Quantas abas ainda seguram o cadastro — a informação que o número global
  // esconde: 90% pode ser uma aba inteira vazia.
  const incompletas = progressoPorBloco(dados)
    .flatMap((b) => b.abas)
    .filter((a) => !a.pronta).length

  function abrir() {
    const r = chipRef.current?.getBoundingClientRect()
    if (!r) return
    setPos({
      top: r.bottom + 10,
      // Alinha a borda direita do painel com a do chip, sem sair da janela.
      left: Math.min(Math.max(r.right - 420, 12), Math.max(window.innerWidth - 432, 12)),
    })
    setAberto(true)
  }

  // Esc fecha e devolve o foco ao chip; clique fora fecha.
  useEffect(() => {
    if (!aberto) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setAberto(false)
        chipRef.current?.focus()
      }
    }
    function onDown(e: MouseEvent) {
      const alvo = e.target as Node
      if (painelRef.current?.contains(alvo) || chipRef.current?.contains(alvo)) return
      setAberto(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [aberto])

  function irParaAba(abaKey: string) {
    setAberto(false)
    onIrParaAba?.(abaKey)
  }

  return (
    <>
      <button
        ref={chipRef}
        type="button"
        onClick={() => (aberto ? setAberto(false) : abrir())}
        aria-expanded={aberto}
        aria-haspopup="dialog"
        title="Ver progresso por aba"
        className="group flex items-end gap-3.5 rounded-2xl border border-transparent px-3 py-2 text-left transition-colors duration-hover ease-saida hover:border-ink-200 hover:bg-ink-50"
      >
        <Numero pct={geral.pct} />
        <div className="flex w-[224px] flex-col gap-2 pb-1">
          <span className="flex items-center gap-1.5 text-[13px] font-semibold text-ink-600">
            Cadastro preenchido
            <CaretDown
              className={`text-[11px] text-ink-400 transition-transform duration-hover ease-saida group-hover:text-water-600 ${
                aberto ? 'rotate-180' : ''
              }`}
            />
          </span>
          <Barra pct={geral.pct} />
          <span className="font-mono text-[11px] tabular-nums text-ink-500">
            {geral.feitos} de {geral.total} campos obrigatórios
            {incompletas > 0 && ` · ${incompletas} aba${incompletas === 1 ? '' : 's'} incompleta${incompletas === 1 ? '' : 's'}`}
          </span>
        </div>
      </button>

      {aberto &&
        createPortal(
          <div
            ref={painelRef}
            role="dialog"
            aria-label="Progresso do cadastro"
            style={{ position: 'fixed', top: pos.top, left: pos.left }}
            className="z-[75] flex max-h-[min(560px,70vh)] w-[420px] flex-col overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-elev"
          >
            {/* O cabeçalho repete o chip: sem isso o número que a pessoa
                clicou desaparece justo quando ela vai comparar com a lista. */}
            <div className="flex items-start justify-between gap-4 border-b border-ink-200 px-5 py-4">
              <div className="flex items-end gap-3.5">
                <Numero pct={geral.pct} />
                <div className="flex w-[180px] flex-col gap-2 pb-1">
                  <span className="text-[13px] font-semibold text-ink-600">Cadastro preenchido</span>
                  <Barra pct={geral.pct} />
                </div>
              </div>
              <button
                type="button"
                onClick={() => setAberto(false)}
                aria-label="Fechar"
                className="rounded-lg p-1 text-ink-400 transition-colors duration-hover ease-saida hover:bg-ink-100 hover:text-ink-700"
              >
                <X weight="bold" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
              <ListaAbasProgresso dados={dados} onIrParaAba={irParaAba} variante="compacta" />
            </div>

            <div className="flex items-center justify-between gap-4 border-t border-ink-200 px-5 py-3">
              <p className="text-[11.5px] leading-snug text-ink-400">
                Duplicatas e elos quebrados são conferidos na revisão.
              </p>
              {onIrParaRevisao && (
                <button
                  type="button"
                  onClick={() => {
                    setAberto(false)
                    onIrParaRevisao()
                  }}
                  className="shrink-0 whitespace-nowrap text-[12.5px] font-semibold text-water-600 transition-colors duration-hover ease-saida hover:text-water-700"
                >
                  Ir para a revisão →
                </button>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}

/** O número grande do chip. Em mono, como todos os números desta base. */
function Numero({ pct }: { pct: number }) {
  return (
    <span className="font-mono text-[34px] font-semibold leading-none tabular-nums text-water-700">
      {pct}%
    </span>
  )
}

function Barra({ pct }: { pct: number }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-ink-200">
      <div
        className="h-full rounded-full bg-gradient-to-r from-water-600 to-aegea-400 transition-[width] duration-mover ease-saida"
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}
