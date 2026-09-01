import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useComentarDaRodada } from '@/rodada/api/queries'
import { Button } from '@/components/ui/Button'
import { TagStatus } from '@/rodada/components/pecas'
import { ordenarParametros, rotuloDoParametro, valorDoParametro } from '@/rodada/domain/pedido'
import { dataHora } from '@/rodada/lib/formato'
import type { RunResumo } from '@/rodada/domain/resultado'

/**
 * OS METADADOS DA SIMULAÇÃO, antes de abrir o resultado.
 *
 * Responde "qual dessas rodadas é a que eu quero?" sem sair da lista: quem fez,
 * quando, em que unidade, e com que variáveis ela foi pedida. Duas saídas, e
 * nada mais — abrir o resultado, ou fechar.
 *
 * O PAINEL LATERAL do histórico mostra o resultado (VPL, CAPEX, obras); este
 * modal mostra o PEDIDO (as vinte e tantas variáveis). São perguntas
 * diferentes, e a segunda é longa demais para caber no painel sem empurrar o
 * comentário para fora da tela.
 *
 * ## Acessibilidade
 *
 * `Esc` fecha, o foco entra no card, fica preso enquanto ele estiver aberto e
 * volta ao elemento de origem ao fechar. Sem o retorno de foco, o teclado volta
 * ao início da página — e a lista de rodadas é longa.
 *
 * O foco inicial vai em **Fechar**, e não em "Ver resultados": o modal é uma
 * parada para ler, e Enter logo após abrir não pode navegar para fora antes de
 * a pessoa ter lido o que pediu para ver.
 */
export function DetalhesDaSimulacao({ run, aoFechar }: { run: RunResumo; aoFechar: () => void }) {
  const navegar = useNavigate()
  const cardRef = useRef<HTMLDivElement>(null)
  const fecharRef = useRef<HTMLButtonElement>(null)
  const origemRef = useRef<HTMLElement | null>(null)

  const semResultado = !run.publicada || run.status === 'INFEASIBLE'

  useEffect(() => {
    origemRef.current = document.activeElement as HTMLElement | null
    fecharRef.current?.focus()
    return () => {
      const origem = origemRef.current
      // A origem pode ter saído do DOM (a lista recarregou enquanto o modal
      // estava aberto); aí o foco vai para o conteúdo, e não para lugar nenhum.
      if (origem?.isConnected) origem.focus()
      else document.getElementById('main-content')?.focus()
    }
  }, [])

  const aoTeclar = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        aoFechar()
        return
      }
      if (e.key !== 'Tab') return
      // `textarea` entra na lista: o comentário é editável aqui dentro, e um
      // campo que o Tab pula é um campo que o teclado não alcança.
      const focaveis = cardRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], textarea',
      )
      if (!focaveis?.length) return
      const primeiro = focaveis[0]
      const ultimo = focaveis[focaveis.length - 1]
      if (e.shiftKey && document.activeElement === primeiro) {
        e.preventDefault()
        ultimo.focus()
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault()
        primeiro.focus()
      }
    },
    [aoFechar],
  )

  useEffect(() => {
    document.addEventListener('keydown', aoTeclar)
    return () => document.removeEventListener('keydown', aoTeclar)
  }, [aoTeclar])

  const parametros = run.pedido ? ordenarParametros(run.pedido) : []

  return (
    <div
      role="presentation"
      onClick={aoFechar}
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-800/40 p-4 animate-fade-in"
    >
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="detalhes-titulo"
        onClick={(e) => e.stopPropagation()}
        className="carta flex max-h-[min(88vh,760px)] w-full max-w-[620px] flex-col overflow-hidden shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-ink-200 p-5">
          <div className="min-w-0">
            <h2 id="detalhes-titulo" className="text-[19px] font-bold leading-snug text-ink-800">
              {run.nome || 'Simulação sem nome'}
            </h2>
            <div className="mt-1 font-mono text-[11px] tabular-nums text-ink-water">{run.runId}</div>
          </div>
          <TagStatus status={run.status} />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <dl className="grid gap-x-4 gap-y-1.5">
            <Linha rotulo="Quem fez" valor={run.autor || '—'} />
            <Linha rotulo="Quando" valor={dataHora(run.dataHora)} />
            <Linha rotulo="Unidade" valor={run.unidadeNome || run.unidadeId || '—'} />
            <Linha
              rotulo="Situação"
              valor={run.publicada ? `solver ${run.status}` : String(run.status)}
            />
          </dl>

          <h3 className="mt-6 text-[11.5px] font-semibold uppercase tracking-[.05em] text-ink-water">
            Variáveis usadas nesta simulação
          </h3>
          {parametros.length > 0 ? (
            <dl className="mt-2 divide-y divide-ink-100">
              {parametros.map(([chave, valor]) => (
                <div
                  key={chave}
                  className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2"
                >
                  <dt className="text-[13px] text-ink-600">
                    {rotuloDoParametro(chave)}{' '}
                    <code className="font-mono text-[10px] uppercase text-ink-water">{chave}</code>
                  </dt>
                  <dd className="text-right text-[13px] font-semibold tabular-nums text-ink-800">
                    {valorDoParametro(chave, valor)}
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            /* Rodada publicada direto pelo pacote de produção não passou pela
               fila, e por isso não tem pedido gravado. Dizer isso é melhor que
               uma lista vazia, que se lê como "rodou sem parâmetro nenhum". */
            <p className="mt-2 text-[13px] leading-relaxed text-ink-water">
              Esta rodada não tem o pedido registrado — ela foi publicada sem passar pela fila, e as
              variáveis não ficaram guardadas.
            </p>
          )}

          <Comentario run={run} />
        </div>

        <div className="flex justify-end gap-2 border-t border-ink-200 bg-ink-50 p-4">
          <Button pill variant="secondary" ref={fecharRef} onClick={aoFechar}>
            Fechar
          </Button>
          <Button
            pill
            disabled={semResultado}
            title={semResultado ? 'Esta rodada não tem resultado para abrir.' : undefined}
            onClick={() => navegar(`/resultados/${run.runId}`)}
          >
            Ver resultados →
          </Button>
        </div>
      </div>
    </div>
  )
}

/** Teto do texto — o mesmo que o backend recusa acima (`_MAX_COMENTARIO`). */
const MAX = 4000

/**
 * A ANOTAÇÃO DA RODADA, escrita depois de ver o resultado.
 *
 * É o MESMO texto do painel lateral do histórico, e não uma cópia: os dois
 * chamam `useComentarDaRodada`, e a invalidação da lista faz um refletir o
 * outro. Está aqui porque quem abre "ver detalhes" está reconstruindo o que
 * esta rodada foi — e a conclusão que alguém anotou é metade dessa resposta.
 *
 * É COMPARTILHADO: qualquer pessoa que enxerga a rodada pode reescrever. Por
 * isso o rodapé mostra quem escreveu por último e quando — sem isso, um texto
 * que mudou sozinho aos olhos de quem já tinha lido não teria explicação.
 *
 * Salvar fica DESABILITADO sem mudança, como no cadastro: um botão que aceita
 * clique sem ter o que gravar ensina que salvar não significa nada.
 */
function Comentario({ run }: { run: RunResumo }) {
  const salvo = run.comentario?.texto ?? ''
  const [texto, setTexto] = useState(salvo)
  const comentar = useComentarDaRodada()
  const id = useId()

  // Se o servidor trouxer outra versão (outra pessoa escreveu, ou a lista
  // recarregou), o campo acompanha — MAS só quando não há edição local
  // pendente, senão o refetch apagaria o que está sendo digitado agora.
  //
  // Ajuste DURANTE O RENDER, e não num efeito: é o padrão do React para estado
  // derivado de prop, e roda antes da pintura — o efeito faria a tela mostrar o
  // texto velho por um quadro.
  const [salvoVisto, setSalvoVisto] = useState(salvo)
  if (salvo !== salvoVisto) {
    setSalvoVisto(salvo)
    if (texto === '' || texto === salvoVisto) setTexto(salvo)
  }

  const mudou = texto.trim() !== salvo.trim()

  return (
    <>
      <h3 className="mt-6 text-[11.5px] font-semibold uppercase tracking-[.05em] text-ink-water">
        Comentário
      </h3>
      <p id={`${id}-ajuda`} className="mt-1 text-[12px] leading-snug text-ink-water">
        Anotação sobre esta rodada — o que ela mostrou, por que ela importa. Todo mundo que vê a
        rodada lê e pode editar.
      </p>
      <textarea
        id={id}
        rows={3}
        value={texto}
        maxLength={MAX}
        aria-label="Comentário da rodada"
        aria-describedby={`${id}-ajuda`}
        placeholder="Ex.: melhor cenário até agora — o pico de CAPEX de 2029 desaparece."
        onChange={(e) => setTexto(e.target.value)}
        className="mt-2 min-h-[74px] w-full resize-y rounded-[10px] border border-ink-200 bg-white p-3 text-[13px] leading-relaxed outline-none transition-colors duration-hover ease-saida focus:border-water-600 focus:ring-2 focus:ring-water-600/25"
      />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-[12px] text-ink-water">
          {run.comentario?.autor
            ? `Última edição de ${run.comentario.autor}, ${dataHora(run.comentario.atualizadoEm)}`
            : 'Ninguém anotou esta rodada ainda.'}
        </span>
        <Button
          pill
          size="sm"
          variant="secondary"
          disabled={!mudou || comentar.isPending}
          onClick={() => comentar.mutate({ runId: run.runId, texto: texto.trim() })}
        >
          {comentar.isPending ? 'Salvando…' : 'Salvar comentário'}
        </Button>
      </div>
      {/* Pessimista: o texto na tela só é o do servidor depois que ele aceita.
          `role="alert"` porque a falha acontece longe do olho — o botão fica no
          rodapé e a pessoa pode já estar lendo os parâmetros acima. */}
      {comentar.isError && (
        <p role="alert" className="mt-1.5 text-[12px] text-danger">
          Não foi possível salvar o comentário. O texto continua aqui — tente de novo.
        </p>
      )}
    </>
  )
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4">
      <dt className="text-[13px] text-ink-water">{rotulo}</dt>
      <dd className="text-right text-[13px] font-semibold text-ink-800">{valor}</dd>
    </div>
  )
}
