import type { RunResumo, StatusRodada } from '@/rodada/domain/resultado'

/**
 * A CAUSA DA FALHA — o que o executor reportou, e a última palavra do solver.
 *
 * O aviso da rodada diz que houve erro; isto diz QUAL. O servidor já mandava
 * `erro` na lista e só a análise de sensibilidade o lia. `solver` é a última
 * resposta do solver quando a rodada morreu depois dele: o plano existiu, e o
 * número ajuda a decidir se vale rodar de novo.
 *
 * SÓ EM ESTADO TERMINAL SEM RESULTADO (`ERRO`, `CANCELADA`). Fora disso o dado
 * pode ser velho: ao reexecutar, o servidor limpa `erro` mas o diagnóstico do
 * solver da tentativa anterior continua na tabela, e uma rodada `PENDENTE` com
 * "última resposta do solver" leria como "morreu depois do solver" quando está
 * só esperando a vez.
 *
 * ALTURA LIMITADA: a mensagem é texto operacional e pode ter centenas de
 * caracteres; sem teto ela empurraria os botões do painel para fora da tela.
 * Rola em vez de cortar — a causa inteira continua legível.
 */
const TERMINAIS_SEM_RESULTADO = new Set<StatusRodada>(['ERRO', 'CANCELADA'])

export function MotivoDaFalha({ run }: { run: Pick<RunResumo, 'status' | 'erro' | 'solver'> }) {
  if (!TERMINAIS_SEM_RESULTADO.has(run.status)) return null
  if (!run.erro && !run.solver) return null
  return (
    <div className="mt-3 rounded-xl border border-ink-200 bg-ink-50 px-3.5 py-3 text-[12px] leading-snug">
      {run.erro && (
        <>
          <div className="text-[10.5px] font-bold uppercase tracking-[.09em] text-ink-water">Motivo</div>
          <p className="mt-1 max-h-32 overflow-y-auto break-words font-mono text-[11.5px] text-ink-800">
            {run.erro}
          </p>
        </>
      )}
      {run.solver && (
        <>
          <div
            className={`text-[10.5px] font-bold uppercase tracking-[.09em] text-ink-water ${run.erro ? 'mt-2.5' : ''}`}
          >
            Última resposta do solver
          </div>
          <p className="mt-1 max-h-24 overflow-y-auto break-words font-mono text-[11.5px] text-ink-600">
            {run.solver}
          </p>
        </>
      )}
    </div>
  )
}
