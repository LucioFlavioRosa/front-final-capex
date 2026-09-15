import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
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
 * UMA FONTE SÓ PARA O ESTADO: o modo (fila × executando) segue a prop `status`,
 * que é a mesma que escolhe a etiqueta e o aviso do painel; a resposta de
 * `/status` entra só com os detalhes — posição, motivo, progresso. Se as duas
 * fontes fossem lidas cada uma por um pedaço da tela, um ciclo de polling em que
 * `/status` já diz RODANDO e a lista ainda diz PENDENTE mostraria "está na fila"
 * ao lado de "executando 42%". Quando a resposta discorda da prop, o componente
 * pede a lista de novo em vez de acreditar em uma das duas.
 *
 * SÓ EM VOO: fora de `PENDENTE`/`RODANDO` o componente nem consulta — rodada
 * publicada é imutável, e o sinal de vida seria ruído.
 */
export function NoticiaDaFila({ runId, status }: { runId: string; status: StatusRodada }) {
  const emVoo = status === 'PENDENTE' || status === 'RODANDO'
  const consulta = useStatusDaRodada(runId, emVoo)
  const qc = useQueryClient()
  const d = consulta.data

  // A LISTA APRENDE COM O SINAL: `/status` é consultado a cada 8 s e a lista não;
  // quando o sinal já mudou de estado, é a lista que está atrasada.
  useEffect(() => {
    if (d && d.status !== status) void qc.invalidateQueries({ queryKey: ['runs', 'lista'] })
  }, [d, status, qc])

  if (!emVoo) return null

  const caixa = (atencao: boolean, children: React.ReactNode) => (
    <div
      className={`mt-3 rounded-xl border px-3.5 py-3 text-[12.5px] ${
        atencao ? 'border-warning/30 bg-warning/10' : 'border-ink-200 bg-ink-50'
      }`}
    >
      {children}
    </div>
  )

  if (consulta.isError) {
    return caixa(
      true,
      <p role="status" className="text-ink-600">
        Não foi possível consultar a fila agora. A rodada continua onde estava; a consulta é
        refeita sozinha.
      </p>,
    )
  }
  if (!d) {
    return caixa(false, <p role="status" className="text-ink-water">Consultando a fila…</p>)
  }

  const fila = d.fila
  const atencao = !!fila && (fila.atencao || fila.vivos === 0)

  if (status === 'RODANDO') {
    return caixa(
      atencao,
      <>
        <div className="flex items-baseline justify-between">
          <span className="font-semibold text-ink-800">Executando</span>
          <span className="font-mono tabular-nums text-ink-600">{d.progresso}%</span>
        </div>
        {/* A barra tem semântica de progresso; o percentual ao lado é o texto
            dela. Nada aqui é região live: um anúncio a cada 8 s seria ruído. */}
        <div
          role="progressbar"
          aria-label="Progresso da rodada"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={d.progresso}
          className="mt-2 h-1 overflow-hidden rounded-full bg-ink-200"
        >
          <div
            className="h-full rounded-full bg-water-600 transition-[width] duration-mover ease-saida"
            style={{ width: `${Math.max(3, d.progresso)}%` }}
          />
        </div>
        {fila?.motivo && <p className="mt-1.5 text-[12px] leading-snug text-ink-600">{fila.motivo}</p>}
      </>,
    )
  }

  // PENDENTE. A região live é só a frase da posição — pequena e estável, muda
  // quando a fila anda, e não a cada tick.
  return caixa(
    atencao,
    <>
      <p role="status" className="font-semibold text-ink-800">
        {fila ? posicaoNaFila(fila.posicao) : 'Na fila — o servidor não informou a posição.'}
      </p>
      {fila?.motivo && <p className="mt-1 text-[12px] leading-snug text-ink-600">{fila.motivo}</p>}
    </>,
  )
}

/** `0` na frente é "próxima a entrar"; `n` na frente é a `(n+1)ª` posição. */
export const posicaoNaFila = (naFrente: number): string =>
  naFrente <= 0 ? 'Próxima a entrar' : `${naFrente + 1}ª na fila`
