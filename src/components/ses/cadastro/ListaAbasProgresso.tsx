/**
 * Lista de abas com progresso, agrupada pelos blocos de navegação.
 *
 * Um componente, duas variantes, porque as duas telas que precisam disso fazem
 * a MESMA pergunta com pesos diferentes:
 *
 *   'compacta' — dentro do popover do chip de progresso. A pergunta é "quanto
 *     falta e onde", e o alvo é navegar: título + % + mini-barra.
 *   'revisao'  — na Revisão. A pergunta é "isto está pronto para rodar", então
 *     entra o selo de estado, a contagem feitos/total e a origem da aba.
 *
 * Antes eram duas listas PLANAS, escritas duas vezes com visuais diferentes: uma
 * no painel lateral do cadastro, outra na Revisão. O agrupamento por bloco é
 * ganho das duas — o mapa mental passa a ser o mesmo da navegação do wizard.
 *
 * PALETA CLARA (07/08/2026): veio da branch do redesign dark reescrito nos
 * tokens desta base. As cores dos selos seguem as dos badges de célula da grade
 * (`AbaGrid`), que é o que faz "âmbar = falta preencher" significar a mesma coisa
 * na lista e na tabela.
 */

import type { Row } from '../../../data/cadastroUnidade/types'
import { progressoPorBloco, rotuloBloco, type EstadoAba, type ProgressoAba } from '../../../data/cadastroUnidade/blocos'

interface Props {
  dados: Record<string, Row[]>
  onIrParaAba?: (abaKey: string) => void
  variante?: 'compacta' | 'revisao'
}

/** Selo de estado — as mesmas quatro cores dos badges de célula da grade. */
const SELO: Record<EstadoAba, { texto: string; cls: string }> = {
  'so-db': {
    texto: 'OK',
    cls: 'border border-aegea-200 text-aegea-700',
  },
  completa: {
    texto: '✓ Completa',
    cls: 'bg-aegea-50 text-aegea-700',
  },
  parcial: {
    texto: 'Em revisão',
    cls: 'bg-amber-50 text-amber-700',
  },
  vazia: {
    texto: 'Pendência',
    cls: 'bg-red-50 text-danger',
  },
}

export function ListaAbasProgresso({ dados, onIrParaAba, variante = 'compacta' }: Props) {
  const blocos = progressoPorBloco(dados)

  return (
    <div className={variante === 'compacta' ? 'space-y-3.5' : 'space-y-5'}>
      {blocos.map((bloco) => (
        <div key={bloco.nome}>
          <h4 className="mb-1.5 text-[12px] font-semibold text-ink-400">{rotuloBloco(bloco.indice)}</h4>
          <ul className={variante === 'compacta' ? 'space-y-1.5' : 'space-y-1'}>
            {bloco.abas.map((p) =>
              variante === 'compacta' ? (
                <ItemCompacto key={p.aba.key} p={p} onIr={onIrParaAba} />
              ) : (
                <ItemRevisao key={p.aba.key} p={p} onIr={onIrParaAba} />
              ),
            )}
          </ul>
        </div>
      ))}
    </div>
  )
}

function ItemCompacto({ p, onIr }: { p: ProgressoAba; onIr?: (k: string) => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onIr?.(p.aba.key)}
        className="group w-full rounded-lg px-2 py-1.5 text-left transition-colors duration-hover ease-saida hover:bg-water-50"
      >
        <div className="flex items-baseline justify-between gap-3">
          <span className="truncate text-[13px] text-ink-700 transition-colors duration-hover ease-saida group-hover:text-water-700">
            {p.aba.titulo}
          </span>
          <span className="shrink-0 font-mono text-[11px] tabular-nums text-ink-500">
            {p.estado === 'so-db' ? '— OK' : `${p.pct}%`}
          </span>
        </div>
        {/* A aba 'so-db' não ganha barra: não há o que preencher, e uma barra
            cheia ali sugeriria trabalho feito que ninguém fez. */}
        {p.estado !== 'so-db' && (
          <div className="mt-1 h-1 overflow-hidden rounded-full bg-ink-100">
            <div
              className={`h-full rounded-full transition-[width] duration-mover ease-saida ${
                p.estado === 'completa' ? 'bg-aegea-500' : 'bg-water-400'
              }`}
              style={{ width: `${p.pct}%` }}
            />
          </div>
        )}
      </button>
    </li>
  )
}

function ItemRevisao({ p, onIr }: { p: ProgressoAba; onIr?: (k: string) => void }) {
  const selo = SELO[p.estado]
  return (
    <li>
      <button
        type="button"
        onClick={() => onIr?.(p.aba.key)}
        className="flex w-full items-center gap-4 rounded-xl border border-ink-200 bg-white px-4 py-3 text-left transition-colors duration-hover ease-saida hover:border-water-400 hover:bg-water-50"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-semibold text-ink-900">{p.aba.titulo}</span>
          {/* "somente Databricks" é o que explica uma aba contar como OK sem
              ter campo preenchido — sem isso o selo parece erro. */}
          <span className="mt-0.5 block text-[12px] text-ink-500">
            {p.estado === 'so-db' ? 'somente Databricks' : 'origem unidade'}
          </span>
        </span>
        <span className="shrink-0 font-mono text-[13px] tabular-nums text-ink-600">
          {p.estado === 'so-db' ? '—' : `${p.feitos}/${p.total}`}
        </span>
        <span className={`shrink-0 rounded-full px-3 py-1 text-[12px] font-semibold ${selo.cls}`}>
          {selo.texto}
        </span>
      </button>
    </li>
  )
}
