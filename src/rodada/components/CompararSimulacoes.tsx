import { useMemo } from 'react'
import { Modal } from '@/components/ui/Modal'
import {
  ordenarParametros,
  rotuloDoParametro,
  segmentosDoParametro,
} from '@/rodada/domain/pedido'
import { brlMi, dataCurta, deTotal, inteiro, pct, VAZIO } from '@/rodada/lib/formato'
import type { RunResumo } from '@/rodada/domain/resultado'
import { idCurtoDaRodada } from '@/rodada/domain/rodadaId'

/**
 * COMPARAR N SIMULAÇÕES — escolher n>=2 rodadas do histórico e ler lado a lado
 * os resultados e os parâmetros do motor de cada uma.
 *
 * NÃO PRECISA DE BACKEND NENHUM: `GET /runs` já devolve, para cada rodada, as
 * métricas de resultado (`metricas`) e o pedido completo com que ela foi
 * disparada (`pedido`, mais de vinte chaves). O que faltava era a leitura lado
 * a lado.
 *
 * A TABELA É TRANSPOSTA — parâmetros nas LINHAS e cenários nas COLUNAS — e não
 * o contrário. Comparar é ler na horizontal: o olho percorre uma linha
 * procurando o valor que destoa, e isso só funciona se a linha for a mesma
 * grandeza em todos os cenários. Com cenários nas linhas, comparar "orçamento"
 * exigiria pular de coluna em coluna contando posições.
 *
 * O QUE DIFERE VEM MARCADO, e o que é igual pode ser escondido: numa
 * comparação de duas rodadas quase iguais — o caso normal, porque se muda um
 * parâmetro por vez — vinte linhas idênticas afogam as duas que importam.
 */
export function CompararSimulacoes({
  runs,
  aoFechar,
}: {
  runs: RunResumo[]
  aoFechar: () => void
}) {
  const resultado = useMemo(() => linhasDeResultado(runs), [runs])
  const parametros = useMemo(() => linhasDeParametros(runs), [runs])

  const iguaisResultado = resultado.filter((l) => !l.difere).length
  const iguaisParametros = parametros.filter((l) => !l.difere).length

  return (
    <Modal
      open
      onClose={aoFechar}
      title={`Comparar ${runs.length} simulações`}
      subtitle="Resultado e parâmetros lado a lado — as linhas destacadas são as que diferem."
      size="xl"
    >
      <div className="flex flex-col gap-5">
        <Secao
          titulo="Resultado"
          nota={
            iguaisResultado > 0
              ? `${iguaisResultado} de ${resultado.length} métricas são iguais em todos`
              : undefined
          }
          runs={runs}
          linhas={resultado}
        />
        <Secao
          titulo="Parâmetros do motor"
          nota={
            iguaisParametros > 0
              ? `${iguaisParametros} de ${parametros.length} parâmetros são iguais em todos`
              : undefined
          }
          runs={runs}
          linhas={parametros}
        />
      </div>
    </Modal>
  )
}

interface Linha {
  rotulo: string
  /** O nome técnico, quando existe — a rastreabilidade com o notebook. */
  tecnico?: string
  /**
   * Um valor por rodada, e cada valor em PEDAÇOS.
   *
   * Quase todo parâmetro tem um pedaço só. Os de mapa — orçamento por ano,
   * prioridade por cidade — têm um por entrada, e é isso que permite a célula
   * quebrar entre eles sem quebrar nenhum pelo meio.
   */
  valores: string[][]
  difere: boolean
}

function Secao({
  titulo,
  nota,
  runs,
  linhas,
}: {
  titulo: string
  nota?: string
  runs: RunResumo[]
  linhas: Linha[]
}) {
  if (linhas.length === 0) return null
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="text-[13px] font-bold text-ink-800">{titulo}</h3>
        {nota && <span className="text-[11px] text-ink-water">{nota}</span>}
      </div>
      <div className="carta carta-tabela min-w-0 overflow-x-auto">
        <table>
          <caption className="sr-only">{titulo} de cada simulação comparada</caption>
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 z-10 bg-ink-50">
                {titulo === 'Resultado' ? 'Métrica' : 'Parâmetro'}
              </th>
              {runs.map((r) => (
                <th key={r.runId} scope="col" data-r>
                  <span className="block max-w-[180px] truncate">{r.nome || 'Sem nome'}</span>
                  <span className="mt-0.5 block font-mono text-[10px] font-normal normal-case tracking-normal text-ink-water">
                    {idCurtoDaRodada(r.runId)} · {dataCurta(r.dataHora)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.rotulo} className={l.difere ? 'bg-warning/[.06]' : undefined}>
                <th scope="row" className="sticky left-0 z-10 bg-white text-left font-normal">
                  <span className="block text-[12.5px] font-medium text-ink-700">{l.rotulo}</span>
                  {l.tecnico && (
                    <code className="font-mono text-[9.5px] text-ink-water">{l.tecnico}</code>
                  )}
                </th>
                {l.valores.map((segmentos, i) => (
                  <CelulaDeValor
                    key={runs[i].runId}
                    segmentos={segmentos}
                    difere={l.difere}
                  />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

/**
 * As métricas de resultado. Só as que `MetricasCapa` traz — a comparação não
 * abre as rodadas, então ela é limitada ao que a LISTA já tem.
 *
 * Rodada sem métricas (em voo, falhada) mostra "—" na coluna inteira, e não
 * zeros: zero VPL é um resultado, "não houve resultado" é outra coisa. Isso faz
 * a linha "diferir" de propósito — a ausência É a diferença relevante ali.
 */
function linhasDeResultado(runs: RunResumo[]): Linha[] {
  const campos: { rotulo: string; ler: (r: RunResumo) => string }[] = [
    { rotulo: 'VPL do plano', ler: (r) => brlMi(r.metricas?.vpl) },
    { rotulo: 'CAPEX', ler: (r) => brlMi(r.metricas?.capex) },
    { rotulo: 'Uso do orçamento', ler: (r) => pct(r.metricas?.usoOrcamentoPct) },
    { rotulo: 'EBITDA total', ler: (r) => brlMi(r.metricas?.ebitdaTotal) },
    {
      rotulo: 'Obras priorizadas',
      ler: (r) =>
        r.metricas ? deTotal(r.metricas.obrasConstruidas, r.metricas.obrasTotal) : VAZIO,
    },
    { rotulo: 'Cobertura final', ler: (r) => pct(r.metricas?.coberturaFimPct) },
    {
      rotulo: 'Metas contratuais cumpridas',
      ler: (r) => (r.metricas ? deTotal(r.metricas.metasAtingidas, r.metricas.metasTotal) : VAZIO),
    },
    {
      rotulo: 'Tempo de solver',
      ler: (r) => (r.duracaoS == null ? VAZIO : `${inteiro(r.duracaoS)}s`),
    },
  ]
  return campos.map((c) => montar(c.rotulo, undefined, runs.map(c.ler)))
}

/**
 * Os parâmetros do motor — a UNIÃO das chaves de todos os pedidos comparados,
 * e não a interseção.
 *
 * Se uma rodada foi disparada com um parâmetro que a outra não tinha (versão
 * mais nova do formulário, por exemplo), essa ausência é exatamente o tipo de
 * diferença que explica um resultado divergente. Interseção a esconderia.
 */
/**
 * PARÂMETROS QUE A COMPARAÇÃO OMITE ENQUANTO FOREM IGUAIS.
 *
 * A equipe não os varia: a estratégia de cobertura e os dois de execução saem
 * sempre no mesmo valor, e três linhas que nunca mudam empurram para baixo as
 * que mudam — que são o motivo de o modal existir.
 *
 * MAS SÓ ENQUANTO FOREM IGUAIS. Se duas rodadas trouxerem valores diferentes
 * aqui, a linha volta. O pedido aceita qualquer valor e uma rodada montada por
 * script pode divergir — e esta é a única tela feita para revelar divergência.
 * Escondê-la justamente quando ela aconteceu seria o pior momento possível.
 */
const CONSTANTES_NA_PRATICA = new Set([
  'PENALIDADE_COBERTURA',
  'MAX_TIME_S',
  'ANOS_EXTRA_CONCLUSAO',
])

function linhasDeParametros(runs: RunResumo[]): Linha[] {
  const chaves: string[] = []
  for (const r of runs) {
    for (const k of Object.keys(r.pedido ?? {})) {
      if (!chaves.includes(k)) chaves.push(k)
    }
  }
  if (chaves.length === 0) return []

  // `ordenarParametros` é a ordem de leitura do formulário — primeiro o que
  // define o cenário, depois o que ajusta a execução. Reusada aqui para a
  // comparação sair na mesma sequência do painel de parâmetros.
  const ordenadas = ordenarParametros(Object.fromEntries(chaves.map((k) => [k, null]))).map(
    ([k]) => k,
  )

  return ordenadas
    .map((chave) =>
      montarSegmentado(
        rotuloDoParametro(chave),
        chave,
        runs.map((r) =>
          r.pedido && chave in r.pedido ? segmentosDoParametro(chave, r.pedido[chave]) : [VAZIO],
        ),
      ),
    )
    .filter((l) => l.difere || !CONSTANTES_NA_PRATICA.has(l.tecnico ?? ''))
}

/**
 * A CÉLULA DE VALOR — e a razão de ela existir em vez de um `<td>` inline.
 *
 * O `td[data-m]` do kit é `whitespace-nowrap`, e está certo: "R$ 1.234,5"
 * quebrado no meio deixa de ser um número. Mas o orçamento por ano é uma
 * SEQUÊNCIA de números — quinze deles numa rodada típica — e a mesma regra que
 * protege um número forçava o quadro inteiro a rolar de lado para mostrar o
 * décimo quinto. Quem comparava duas rodadas perdia de vista a coluna da
 * primeira ao chegar no fim da linha.
 *
 * Então a proteção desce um nível: quem não pode quebrar é cada PEDAÇO, não a
 * linha. O grupo quebra à vontade, cada "2026: R$ 60 mi" fica inteiro, e a
 * tabela volta a caber na largura do modal.
 *
 * Valor de um pedaço só continua exatamente como era — `data-m` e nada mais.
 */
function CelulaDeValor({ segmentos, difere }: { segmentos: string[]; difere: boolean }) {
  const tom = difere ? 'font-semibold text-ink-800' : 'text-ink-water'

  if (segmentos.length === 1) {
    return (
      <td data-m className={tom}>
        {segmentos[0]}
      </td>
    )
  }

  return (
    // Sem `data-m`: as classes vêm à mão justamente para deixar o `nowrap` de
    // fora, mantendo o resto (mono, tabular, alinhamento à direita).
    <td className={`text-right font-mono text-[12.5px] font-medium ${tom}`}>
      <span className="flex flex-wrap justify-end gap-x-2 gap-y-0.5 tabular-nums">
        {segmentos.map((seg, i) => (
          <span key={`${i}:${seg}`} className="whitespace-nowrap">
            {seg}
          </span>
        ))}
      </span>
    </td>
  )
}

function montar(rotulo: string, tecnico: string | undefined, valores: string[]): Linha {
  return montarSegmentado(rotulo, tecnico, valores.map((v) => [v]))
}

/** O mesmo, para valor que vem repartido. `difere` compara o valor INTEIRO. */
function montarSegmentado(
  rotulo: string,
  tecnico: string | undefined,
  valores: string[][],
): Linha {
  return {
    rotulo,
    tecnico,
    valores,
    difere: new Set(valores.map((v) => v.join(' · '))).size > 1,
  }
}
