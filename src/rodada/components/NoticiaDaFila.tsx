import { useStatusDaRodada } from '@/rodada/api/queries'
import type { StatusRodada } from '@/rodada/domain/resultado'

/**
 * A NOTÍCIA DA FILA — onde a rodada está agora, dita em posição e não em cor.
 *
 * "Na fila" era só uma etiqueta: quem disparava três simulações via três
 * etiquetas iguais e nenhuma dizia qual entrava primeiro nem por quê nenhuma
 * começava. O backend já responde a posição, o motivo e se há executor vivo
 * (`GET /runs/{id}/status`, bloco `fila`); a análise de sensibilidade consumia
 * isso e o histórico não. Este é o mesmo sinal, para a rodada selecionada.
 *
 * A POSIÇÃO É ORDINAL (1ª, 2ª…), e não "quantas na frente": `fila.posicao` conta
 * as que estão à frente, e "0 na frente" lê pior que "próxima a entrar". O motivo
 * do servidor vem junto porque ele carrega o que a posição sozinha não diz —
 * "há 2 vagas livres" ou "nenhum executor está ativo", que são situações opostas
 * com a mesma posição.
 *
 * SÓ EM VOO: fora de `PENDENTE`/`RODANDO` o componente nem consulta — rodada
 * publicada é imutável, e o sinal de vida seria ruído.
 */
export function NoticiaDaFila({ runId, status }: { runId: string; status: StatusRodada }) {
  const emVoo = status === 'PENDENTE' || status === 'RODANDO'
  const consulta = useStatusDaRodada(runId, emVoo)
  if (!emVoo) return null

  const d = consulta.data
  if (!d) {
    return <p className="mt-3 text-[12px] text-ink-water">Consultando a fila…</p>
  }

  const fila = d.fila
  const atencao = !!fila && (fila.atencao || fila.vivos === 0)
  const rodando = d.status === 'RODANDO'

  return (
    <div
      role="status"
      className={`mt-3 rounded-xl border px-3.5 py-3 ${
        atencao ? 'border-warning/30 bg-warning/10' : 'border-ink-200 bg-ink-50'
      }`}
    >
      {rodando ? (
        <>
          <div className="flex items-baseline justify-between text-[12.5px]">
            <span className="font-semibold text-ink-800">Executando</span>
            <span className="font-mono tabular-nums text-ink-600">{d.progresso}%</span>
          </div>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-ink-200">
            <div
              className="h-full rounded-full bg-water-600 transition-[width] duration-mover ease-saida"
              style={{ width: `${Math.max(3, d.progresso)}%` }}
            />
          </div>
        </>
      ) : (
        <div className="text-[12.5px]">
          <span className="font-semibold text-ink-800">
            {fila ? posicaoNaFila(fila.posicao) : 'Na fila'}
          </span>
        </div>
      )}
      {fila?.motivo && <p className="mt-1 text-[12px] leading-snug text-ink-600">{fila.motivo}</p>}
    </div>
  )
}

/** `0` na frente é "próxima a entrar"; `n` na frente é a `(n+1)ª` posição. */
export const posicaoNaFila = (naFrente: number): string =>
  naFrente <= 0 ? 'Próxima a entrar' : `${naFrente + 1}ª na fila`
