import { useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { QuadroGrafico } from '@/rodada/components/QuadroGrafico'
import { COR, corDoComponente } from '@/rodada/components/cores'
import { CelulaLink, ChipSituacao } from '@/rodada/components/pecas'
import { useCronogramaDeObras, useObras } from '@/rodada/api/queries'
import { brMi, brlMi, inteiro, VAZIO } from '@/rodada/lib/formato'
import type { AnoDeObras } from '@/rodada/domain/resultado'

/**
 * O CRONOGRAMA DE OBRAS DO PLANO — "quais obras serão executadas ano a ano"
 * (item 3, na leitura corrigida pela Aegea em 27/08).
 *
 * A PRIMEIRA VERSÃO DESTE ITEM ERA UMA TABELA paginada ordenada por data de
 * início, e estava errada: uma lista de 370 linhas não responde "como o plano
 * se distribui no tempo" — ela obriga a reconstruir isso de cabeça, página por
 * página. O gráfico responde de uma olhada, e a lista vira o DETALHE de um ano.
 *
 * EMPILHADO POR COMPONENTE, e não uma barra só por ano: o que distingue um ano
 * de rede de um ano de ETE é justamente a composição — dois anos com 40 obras
 * cada podem ser planos completamente diferentes. A ordem do empilhamento é a
 * canônica de montante para jusante, a mesma do painel de CAPEX.
 *
 * SÓ OBRAS QUE ENTRAM NO PLANO: as não construídas não têm ano de execução.
 * Um eixo de tempo com obras que nunca serão executadas seria um cronograma
 * que mente sobre o próprio nome.
 */
export function GraficoCronogramaObras({ runId }: { runId: string | undefined }) {
  const cronograma = useCronogramaDeObras(runId)
  const [anoAberto, setAnoAberto] = useState<number | null>(null)

  const anos = cronograma.data?.anos ?? []

  /**
   * A lista de componentes que aparece EM ALGUM ano vira a lista de séries
   * empilhadas. Deriva do dado e não de uma constante: uma unidade sem EEE não
   * deve ganhar uma legenda de EEE vazia, e um componente novo no cadastro
   * aparece sozinho, sem alterar este arquivo.
   */
  const componentes = useMemo(() => {
    const vistos: string[] = []
    for (const a of anos) {
      for (const c of a.porComponente) {
        if (!vistos.includes(c.componente)) vistos.push(c.componente)
      }
    }
    return vistos
  }, [anos])

  /** Recharts precisa de uma chave por série na mesma linha — achata o aninhado. */
  const dados = useMemo(
    () =>
      anos.map((a) => {
        const linha: Record<string, number> & { ano: number } = { ano: a.ano }
        for (const c of a.porComponente) linha[c.componente] = c.obras
        return linha
      }),
    [anos],
  )

  const totalObras = anos.reduce((s, a) => s + a.obras, 0)
  const totalCapex = anos.reduce((s, a) => s + a.capex, 0)

  return (
    <div className="flex flex-col gap-3">
      <QuadroGrafico
        titulo="Cronograma de obras"
        subtitulo={
          totalObras > 0
            ? `${inteiro(totalObras)} obras no plano · ${brlMi(totalCapex)} · clique num ano para ver a lista`
            : 'nenhuma obra com ano de execução nesta rodada'
        }
        escopo="plano inteiro"
        nota={
          <>
            Cada barra é um ano do plano, empilhada por <strong>componente</strong> — a composição
            é o que distingue um ano de rede de um ano de ETE. Só obras que entram no plano: as não
            construídas não têm ano de execução.
          </>
        }
        tabela={{
          colunas: ['Ano', 'Obras', 'CAPEX', 'De terceiro'],
          linhas: anos.map((a) => [
            a.ano,
            inteiro(a.obras),
            brMi(a.capex),
            a.obrasTerceiro > 0 ? inteiro(a.obrasTerceiro) : VAZIO,
          ]),
        }}
      >
        <ResponsiveContainer width="100%" height={230}>
          <BarChart
            data={dados}
            margin={{ top: 12, right: 12, bottom: 4, left: 4 }}
            onClick={(e) => {
              // `activeLabel` é o valor do `dataKey` do eixo X no ponto clicado
              // — aqui, o ano. Vem tipado como string pelo recharts mesmo
              // quando o dado é número, daí o `Number(...)`.
              const ano = Number((e as { activeLabel?: string | number } | undefined)?.activeLabel)
              if (Number.isFinite(ano)) setAnoAberto((atual) => (atual === ano ? null : ano))
            }}
          >
            <CartesianGrid stroke={COR.grid} vertical={false} />
            <XAxis
              dataKey="ano"
              stroke={COR.eixo}
              tick={{ fill: COR.mudo, fontSize: 10, fontFamily: 'IBM Plex Mono, monospace' }}
              tickLine={false}
            />
            <YAxis
              stroke={COR.eixo}
              tick={{ fill: COR.mudo, fontSize: 10, fontFamily: 'IBM Plex Mono, monospace' }}
              tickLine={false}
              width={34}
              allowDecimals={false}
            />
            <Tooltip
              cursor={{ fill: COR.cursor }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null
                // `Number(label)`, pelo mesmo motivo do `activeLabel` no clique
                // logo acima: o recharts entrega o valor do eixo ora como numero,
                // ora como string, e a comparacao estrita falhava calada — o
                // tooltip mostrava "— obras · R$ 0,0 mi" sobre uma barra cheia.
                const ano = anos.find((a) => a.ano === Number(label))
                return (
                  <div className="rounded-xl border border-ink-200 bg-white px-3 py-2 shadow-elev">
                    <div className="mb-1 text-[11px] font-bold text-ink-800">
                      {label} · {inteiro(ano?.obras)} obras · {brMi(ano?.capex ?? 0)}
                    </div>
                    <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
                      {payload
                        .filter((s) => Number(s.value) > 0)
                        .map((s) => (
                          <li key={String(s.name)} className="flex items-center gap-2 text-[11px]">
                            <span
                              aria-hidden="true"
                              className="h-2 w-2 shrink-0 rounded-sm"
                              style={{ background: s.color }}
                            />
                            <span className="text-ink-500">{s.name}</span>
                            <span className="ml-auto font-mono font-semibold tabular-nums text-ink-800">
                              {inteiro(Number(s.value))}
                            </span>
                          </li>
                        ))}
                    </ul>
                  </div>
                )
              }}
            />
            {componentes.map((nome) => (
              <Bar
                key={nome}
                dataKey={nome}
                stackId="obras"
                fill={corDoComponente(nome)}
                maxBarSize={38}
              >
                {/* O ano aberto fica opaco e os outros esmaecem — o clique
                    precisa deixar rastro no gráfico, senão a lista abaixo
                    parece ter surgido do nada. */}
                {dados.map((d) => (
                  <Cell
                    key={d.ano}
                    fillOpacity={anoAberto === null || anoAberto === d.ano ? 1 : 0.35}
                  />
                ))}
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </QuadroGrafico>

      {anoAberto !== null && (
        <ListaDoAno
          runId={runId}
          ano={anoAberto}
          resumo={anos.find((a) => a.ano === anoAberto)}
          aoFechar={() => setAnoAberto(null)}
        />
      )}
    </div>
  )
}

/** As obras de um ano — o detalhe que o clique na barra abre. */
function ListaDoAno({
  runId,
  ano,
  resumo,
  aoFechar,
}: {
  runId: string | undefined
  ano: number
  resumo: AnoDeObras | undefined
  aoFechar: () => void
}) {
  // Sem paginação: um ano tem dezenas de obras, não milhares — 116 no pior ano
  // da Baixada. O teto de 200 do endpoint cobre isso com folga, e paginar um
  // detalhe que cabe numa rolagem só adiciona cliques.
  const obras = useObras(runId, { ano, tamanho: 200, ordenar: 'inicio' })

  return (
    <div className="carta overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-200 px-[18px] py-3">
        <div className="text-[13px] font-bold text-ink-800">
          Obras de {ano}
          {resumo && (
            <span className="ml-1.5 font-mono text-[11px] font-normal text-ink-400">
              {inteiro(resumo.obras)} · {brlMi(resumo.capex)}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={aoFechar}
          className="text-[11.5px] font-semibold text-water-600 transition-colors duration-hover ease-saida hover:text-water-700"
        >
          Fechar
        </button>
      </div>

      <div className="max-h-[360px] min-w-0 overflow-auto">
        <table>
          <caption className="sr-only">Obras executadas em {ano}</caption>
          <thead>
            <tr>
              <th scope="col">Obra</th>
              <th scope="col">Componente</th>
              <th scope="col">Cidade</th>
              <th scope="col">Situação</th>
              <th scope="col" data-r>
                CAPEX
              </th>
            </tr>
          </thead>
          <tbody>
            {obras.isPending && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-[12.5px] text-ink-400">
                  Carregando as obras de {ano}…
                </td>
              </tr>
            )}
            {obras.isError && (
              <tr>
                <td colSpan={5} className="py-6 text-center text-[12.5px] text-danger">
                  Não foi possível carregar as obras deste ano.
                </td>
              </tr>
            )}
            {obras.data?.itens.map((o) => (
              <tr key={o.obraId}>
                <td>
                  <CelulaLink to={`/resultados/${runId}/obras/${o.obraId}`}>
                    <span className="font-mono">{o.obraId}</span>
                  </CelulaLink>
                </td>
                <td>{o.componente}</td>
                <td>{o.cidadeId}</td>
                <td>
                  <ChipSituacao situacao={o.situacao} />
                </td>
                <td data-m>{brlMi(o.capex)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
