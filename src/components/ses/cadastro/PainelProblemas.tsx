/**
 * Consistência do cadastro — a outra metade do antigo `PainelProntidao`.
 *
 * Mora na Revisão desde 30/07/2026, e não mais ao lado de cada aba do cadastro.
 * Duas razões:
 *
 *   1. Um problema aqui nunca é local. "Referência de sub-bacia inexistente"
 *      nasce da relação entre DUAS abas — mostrá-lo enquanto a pessoa digita
 *      preço unitário interrompe sem oferecer nada acionável.
 *   2. É a tela que decide se pode rodar. Completude respondia "quantos campos
 *      foram digitados"; a pergunta que importa antes de rodar é outra: **este
 *      cadastro produz um plano confiável?** Um cadastro 100% preenchido com uma
 *      PK duplicada gera CAPEX dobrado; um a 80% pode rodar perfeitamente.
 *
 * Por isso os problemas críticos agora BLOQUEIAM a ida para a simulação — ver
 * `RevisaoCadastro`. Ver ANALISE-MUDANCAS-AEGEA-30-07.md, item 15.
 */

import { CheckCircle, WarningCircle, XCircle } from '@phosphor-icons/react'
import type { Problema } from '../../../domain/validacao'

interface PainelProblemasProps {
  problemas: Problema[]
  /** Leva o usuário até a aba onde o problema está. */
  onIrParaAba?: (abaKey: string) => void
}

export function PainelProblemas({ problemas, onIrParaAba }: PainelProblemasProps) {
  const criticos = problemas.filter((p) => p.nivel === 'critico')
  const avisos = problemas.filter((p) => p.nivel === 'aviso')

  return (
    <div
      className={`rounded-2xl border p-5 ${
        criticos.length > 0
          ? 'border-danger/25 bg-red-50/40'
          : avisos.length > 0
            ? 'border-warning/25 bg-warning/[.06]'
            : 'border-ink-200 bg-white'
      }`}
    >
      <Cabecalho criticos={criticos.length} avisos={avisos.length} />

      {problemas.length > 0 && (
        <ul className="mt-4 space-y-2">
          {problemas.map((p, i) => (
            <ItemProblema key={`${p.abaKey}-${i}`} problema={p} onIr={onIrParaAba} />
          ))}
        </ul>
      )}
    </div>
  )
}

function Cabecalho({ criticos, avisos }: { criticos: number; avisos: number }) {
  if (criticos > 0) {
    return (
      <div className="flex items-start gap-2.5">
        <XCircle weight="fill" className="mt-0.5 shrink-0 text-xl text-danger" />
        <div>
          <h3 className="text-[14px] font-bold tracking-tight text-ink-900">
            {criticos} problema{criticos === 1 ? '' : 's'} que corrompe{criticos === 1 ? '' : 'm'} o plano
          </h3>
          <p className="mt-0.5 text-[12.5px] text-ink-500">
            A rodada até executaria, mas o resultado sairia errado sem acusar erro. Por isso a
            simulação fica bloqueada até que estes pontos sejam resolvidos.
          </p>
        </div>
      </div>
    )
  }
  if (avisos > 0) {
    return (
      <div className="flex items-start gap-2.5">
        <WarningCircle weight="fill" className="mt-0.5 shrink-0 text-xl text-warning" />
        <div>
          <h3 className="text-[14px] font-bold tracking-tight text-ink-900">
            Consistente, com {avisos} ponto{avisos === 1 ? '' : 's'} de atenção
          </h3>
          <p className="mt-0.5 text-[12.5px] text-ink-500">
            Nada corrompe o plano e nada bloqueia a rodada. Confira os pontos abaixo para saber o
            que a simulação vai assumir.
          </p>
        </div>
      </div>
    )
  }
  return (
    <div className="flex items-start gap-2.5">
      <CheckCircle weight="fill" className="mt-0.5 shrink-0 text-xl text-success" />
      <div>
        <h3 className="text-[14px] font-bold tracking-tight text-ink-900">Cadastro consistente</h3>
        <p className="mt-0.5 text-[12.5px] text-ink-500">
          Sem duplicatas e sem elo quebrado na hierarquia.
        </p>
      </div>
    </div>
  )
}

function ItemProblema({
  problema, onIr,
}: { problema: Problema; onIr?: (abaKey: string) => void }) {
  const critico = problema.nivel === 'critico'
  return (
    <li
      className={`rounded-xl border px-3.5 py-2.5 ${
        critico ? 'border-danger/20 bg-red-50' : 'border-warning/25 bg-warning/10'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <p className={`text-[12.5px] font-semibold ${critico ? 'text-danger' : 'text-ink-800'}`}>
          {problema.titulo}
        </p>
        {onIr && (
          <button
            type="button"
            onClick={() => onIr(problema.abaKey)}
            className="shrink-0 whitespace-nowrap text-[11.5px] font-semibold text-water-700 hover:underline"
          >
            Corrigir no cadastro
          </button>
        )}
      </div>
      <p className="mt-1 text-[12px] leading-snug text-ink-600">{problema.detalhe}</p>
    </li>
  )
}
