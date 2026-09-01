import { useState } from 'react'
import { SlidersHorizontal } from '@phosphor-icons/react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import {
  ordenarParametros,
  rotuloDoParametro,
  rotuloObjetivo,
  segmentosDoParametro,
} from '@/rodada/domain/pedido'
import type { RunMeta } from '@/rodada/domain/resultado'
import { idCurtoDaRodada } from '@/rodada/domain/rodadaId'

/**
 * "QUAIS SÃO OS PARÂMETROS DESTA RODADA?" — respondido dentro do resultado.
 *
 * Sem este painel, os mais de vinte parâmetros com que a rodada foi PEDIDA só
 * aparecem no modal do Histórico (`DetalhesDaSimulacao`); no resultado, o rodapé
 * do nível 1 mostra sete campos tipados e os outros níveis nem isso.
 *
 * Este botão + painel abrem em QUALQUER nível — Global, Cidade, Sistema,
 * SubBacia — porque todos já carregam `RunMeta` via `useRunMeta`, e `meta.pedido`
 * é o mesmo campo que `DetalhesDaSimulacao` lê de `RunResumo.pedido`.
 *
 * NÃO REÚNE código com `DetalhesDaSimulacao` de propósito: aquele é o modal
 * do card do histórico — tem `TagStatus`, foco preso, retorno de foco ao
 * elemento de origem, porque a lista por trás dele é longa e a pessoa está
 * comparando cards. Este é um "?" de leitura rápida dentro de uma tela que já
 * tem os KPIs na frente; o `Modal` genérico já resolve Esc e overlay, e
 * duplicar a cerimônia inteira do outro modal aqui seria peso sem função.
 */
export function BotaoParametros({ meta }: { meta: RunMeta | undefined }) {
  const [aberto, setAberto] = useState(false)
  if (!meta) return null

  return (
    <>
      <Button pill variant="secondary" onClick={() => setAberto(true)}>
        <SlidersHorizontal weight="bold" /> Parâmetros
      </Button>
      <Modal
        open={aberto}
        onClose={() => setAberto(false)}
        title="Parâmetros desta rodada"
        subtitle={meta.nome || idCurtoDaRodada(meta.runId)}
        size="md"
      >
        {!meta.pedido ? (
          // Rodada publicada sem passar pela fila (o pacote de produção publica
          // direto) não tem `run_request` — a tela diz isso, e não mostra lista
          // vazia, que se leria como "rodou sem parâmetro nenhum".
          <div className="flex flex-col gap-3">
            <p className="text-[13px] leading-relaxed text-ink-600">
              Esta rodada não tem o pedido completo registrado — foi publicada sem passar pela
              fila. Os parâmetros que temos são estes seis:
            </p>
            <TabelaParametrosTipados meta={meta} />
          </div>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-0 p-0">
            {ordenarParametros(meta.pedido).map(([chave, valor]) => (
              <li
                key={chave}
                className="flex items-baseline justify-between gap-4 border-b border-ink-100 py-2 last:border-b-0"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="text-[13px] font-medium text-ink-700">
                    {rotuloDoParametro(chave)}
                  </span>
                  <code className="font-mono text-[10px] text-ink-water">{chave}</code>
                </span>
                <ValorDoParametro segmentos={segmentosDoParametro(chave, valor)} />
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </>
  )
}

function ValorDoParametro({ segmentos }: { segmentos: string[] }) {
  if (segmentos.length === 1) {
    return (
      <span className="shrink-0 text-right font-mono text-[13px] font-semibold text-ink-800">
        {segmentos[0]}
      </span>
    )
  }

  return (
    <span className="flex max-w-full flex-wrap justify-end gap-x-2 gap-y-0.5 text-right font-mono text-[13px] font-semibold text-ink-800 tabular-nums">
      {segmentos.map((seg, i) => (
        <span key={`${i}:${seg}`} className="whitespace-nowrap">
          {seg}
        </span>
      ))}
    </span>
  )
}

/** Os seis campos tipados de `ParametrosRodada` — o fallback de quem não tem pedido. */
function TabelaParametrosTipados({ meta }: { meta: RunMeta }) {
  const p = meta.parametros
  const linhas: [string, string][] = [
    ['Orçamento', `R$ ${p.orcamento.toLocaleString('pt-BR')}`],
    ['Janela de CAPEX', `${p.janelaCapex} anos`],
    ['Base de receita', p.baseReceita],
    ['Objetivo', rotuloObjetivo(p.focoCobertura)],
    ['CTS', p.usarCts ? 'sim' : 'não'],
    ['Cobertura só residencial', p.coberturaSoResidencial ? 'sim' : 'não'],
  ]
  return (
    <ul className="m-0 flex list-none flex-col gap-0 p-0">
      {linhas.map(([rotulo, valor]) => (
        <li
          key={rotulo}
          className="flex items-baseline justify-between gap-4 border-b border-ink-100 py-2 last:border-b-0"
        >
          <span className="text-[13px] font-medium text-ink-700">{rotulo}</span>
          <span className="shrink-0 font-mono text-[13px] font-semibold text-ink-800">{valor}</span>
        </li>
      ))}
    </ul>
  )
}
