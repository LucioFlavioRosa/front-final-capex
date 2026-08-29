import { useMemo, useState } from 'react'
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { QuadroGrafico } from '@/rodada/components/QuadroGrafico'
import { COR, COR_META } from '@/rodada/components/cores'
import { pct, VAZIO } from '@/rodada/lib/formato'
import type { CidadeLinha } from '@/rodada/domain/resultado'

/**
 * COBERTURA CONTRA META, NUM QUADRO SÓ, COM FILTRO DE CIDADE — item 4 na
 * leitura corrigida pela Aegea em 27/08.
 *
 * DUAS COISAS FORAM DESFEITAS AQUI, e as duas por pedido explícito:
 *
 *   1. A curva agregada da UNIDADE saiu. Ela não tem meta contra a qual ser
 *      lida — a meta é contratual por cidade —, então era uma trajetória sem
 *      régua, que é justamente o que este quadro precisa ter.
 *   2. Os mini-gráficos POR CIDADE saíram dos cartões. Uma dúzia de sparklines
 *      na mesma tela poluía sem deixar nenhum legível. Um quadro em tamanho de
 *      leitura, com seletor, mostra mais e ocupa menos.
 *
 * DUAS LINHAS, E NÃO BARRAS (a primeira tentativa foi em colunas e foi
 * recusada): cobertura é uma TRAJETÓRIA — um valor por ano ao longo de todo o
 * horizonte —, e barras dão a ela a aparência de medições avulsas, além de
 * espremerem vinte e cinco colunas num quadro de meia largura. Com duas linhas,
 * "o plano está acima ou abaixo da meta" vira o que o olho já sabe fazer: ver
 * qual das duas está por cima, e onde elas se cruzam.
 *
 * A META NÃO É UMA LINHA, e isso foi um erro corrigido: ligar os anos de meta
 * com `connectNulls` desenhava uma diagonal entre eles, sugerindo uma rampa
 * contratual que não existe. Rio das Ostras tem duas metas — 40% em 2036 e 90%
 * em 2037 —, e a diagonal afirmava que o contrato exigia algo em cada mês entre
 * as duas. São COMPROMISSOS PONTUAIS: cada um vira um losango no seu ano.
 *
 * O "acima ou abaixo" é o SEGMENTO VERTICAL entre o losango da meta e a curva
 * do realizado, na cor do veredito. Ele é a distância literal entre o que se
 * prometeu e o que o plano entrega naquele ano — a leitura que a diagonal
 * atrapalhava em vez de ajudar.
 */
export function GraficoMetaCobertura({ cidades }: { cidades: CidadeLinha[] }) {
  // A primeira cidade da lista é a de maior VPL (`cidades()` ordena por VPL
  // desc) — o padrão mais útil para quem abre a tela sem procurar ninguém.
  const [cidadeId, setCidadeId] = useState<string>(() => cidades[0]?.id ?? '')
  const cidade = cidades.find((c) => c.id === cidadeId) ?? cidades[0]

  const { dados, naJanela, atingidas, fora } = useMemo(() => {
    const metas = cidade?.metas ?? []
    const cobertura = cidade?.cobertura ?? []

    /**
     * METAS FORA DA JANELA DE CAPEX NÃO CONTAM NO PLACAR, porque o motor não as
     * julga: ele ignora meta com ano >= `anos_capex` e a devolve com
     * `atingida: null`. Mesma regra do quadro do nível 2 — contar só o que foi
     * avaliado é o que impede o placar de reprovar o plano por uma meta que
     * ninguém conferiu.
     */
    const naJanela = metas.filter((m) => m.dentroDaJanela)
    const metaPorAno = new Map(metas.map((m) => [m.ano, m]))
    const coberturaPorAno = new Map(cobertura.map((p) => [p.ano, p]))

    /**
     * O eixo é a UNIÃO dos dois conjuntos de anos, e não só o da cobertura: um
     * ano de meta sem ponto de cobertura materializado sumiria do gráfico, e a
     * meta mais distante — a que tem menos chance de ter cobertura publicada —
     * é justamente a que não pode desaparecer.
     */
    const anos = [...new Set([...coberturaPorAno.keys(), ...metaPorAno.keys()])].sort(
      (a, b) => a - b,
    )

    return {
      naJanela,
      atingidas: naJanela.filter((m) => m.atingida).length,
      fora: metas.filter((m) => !m.dentroDaJanela),
      dados: anos.map((ano) => {
        const m = metaPorAno.get(ano)
        return {
          ano,
          realizado: coberturaPorAno.get(ano)?.coberturaPct ?? null,
          alvo: m?.alvoPct ?? null,
          /**
           * O VEREDITO E O DESVIO VÊM DA CONTA DO MOTOR (`realizadoPct` da
           * meta), e não da curva — são réguas diferentes de propósito: a
           * curva é a cobertura publicada por ano, e `realizadoPct` é o que o
           * motor comparou com o alvo para decidir `atingida`. Mostrar um
           * veredito que não fosse o do motor faria a tela discordar do
           * resultado da rodada.
           */
          atingida: m?.dentroDaJanela ? !!m.atingida : null,
          desvio:
            m && m.realizadoPct != null && m.alvoPct != null
              ? m.realizadoPct - m.alvoPct
              : null,
        }
      }),
    }
  }, [cidade])

  if (!cidade) return null

  const temSerie = dados.some((d) => d.realizado != null)

  return (
    <QuadroGrafico
      titulo="Cobertura realizada × meta contratual"
      subtitulo={
        naJanela.length > 0
          ? `${atingidas} de ${naJanela.length} metas cumpridas na janela de CAPEX`
          : 'sem meta contratual dentro da janela de CAPEX'
      }
      escopo={cidade.nome}
      acoes={
        <label className="flex items-center gap-2 text-[11.5px] text-ink-500">
          <span className="hidden sm:inline">Cidade</span>
          <select
            value={cidade.id}
            onChange={(e) => setCidadeId(e.target.value)}
            className="max-w-[200px] rounded-lg border-[1.5px] border-ink-200 bg-white px-2 py-1 text-[12px] text-ink-800 outline-none transition-colors duration-hover ease-saida focus:border-water-600 focus:ring-2 focus:ring-water-600/25"
          >
            {cidades.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </label>
      }
      nota={
        <>
          A meta é um <strong>compromisso pontual</strong> em anos específicos do contrato, e não
          uma curva — por isso cada uma é um losango, ligado à cobertura daquele ano pelo vão que
          separa os dois.
          {fora.length > 0 && (
            <>
              {' '}
              A meta de {fora.map((m) => m.ano).join(', ')} cai{' '}
              <strong>fora da janela de investimento</strong> e não foi avaliada — aparece no
              gráfico em cinza, sem veredito.
            </>
          )}
        </>
      }
      tabela={{
        colunas: ['Ano', 'Cobertura', 'Meta', 'Desvio', 'Situação'],
        linhas: dados.map((d) => [
          d.ano,
          d.realizado != null ? pct(d.realizado) : VAZIO,
          d.alvo != null ? pct(d.alvo) : VAZIO,
          d.desvio != null ? sinalPct(d.desvio) : VAZIO,
          d.alvo == null
            ? 'Sem meta'
            : d.atingida == null
              ? 'Fora da janela'
              : d.atingida
                ? 'Atingida'
                : 'Não atingida',
        ]),
      }}
    >
      {!temSerie ? (
        <p className="px-1 py-10 text-center text-[12.5px] text-ink-400">
          {cidade.nome} não tem série de cobertura materializada nesta rodada.
        </p>
      ) : (
        <>
        {/* A LEGENDA É OBRIGATÓRIA AQUI, e a falta dela foi metade do motivo de
            a versão anterior ser lida como defeito: sem chave, o marcador da
            meta e a curva do plano são duas marcas sem nome na mesma área. */}
        <ul className="viz-root mb-1 flex flex-wrap items-center justify-end gap-x-4 gap-y-1 px-1 text-[10.5px] text-ink-500">
          <li className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="h-0 w-4 border-t-2"
              style={{ borderColor: COR.entra }}
            />
            Cobertura do plano
          </li>
          <li className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="h-2 w-2 rotate-45"
              style={{ background: COR_META.alvo }}
            />
            Meta contratual
          </li>
          <li className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="h-3 w-0 border-l-2"
              style={{ borderColor: COR_META.atingida }}
            />
            Acima da meta
          </li>
          <li className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="h-3 w-0 border-l-2"
              style={{ borderColor: COR_META.perdida }}
            />
            Abaixo da meta
          </li>
        </ul>
        <ResponsiveContainer width="100%" height={230}>
          <ComposedChart data={dados} margin={{ top: 22, right: 16, bottom: 4, left: 4 }}>
            <CartesianGrid stroke={COR.grid} vertical={false} />
            <XAxis
              dataKey="ano"
              stroke={COR.eixo}
              tick={{ fill: COR.mudo, fontSize: 10, fontFamily: 'IBM Plex Mono, monospace' }}
              tickLine={false}
              // Com 25 anos no eixo os rótulos colidem; o recharts escolhe
              // quantos cabem em vez de girar o texto, que é pior de ler.
              interval="preserveStartEnd"
              minTickGap={24}
            />
            <YAxis
              stroke={COR.eixo}
              tick={{ fill: COR.mudo, fontSize: 10, fontFamily: 'IBM Plex Mono, monospace' }}
              tickLine={false}
              width={40}
              domain={[0, 100]}
              tickFormatter={(v: number) => `${v}%`}
            />
            <Tooltip
              cursor={{ stroke: COR.grid }}
              content={({ active, payload, label }) => {
                const d = payload?.[0]?.payload as (typeof dados)[number] | undefined
                if (!active || !d) return null
                return (
                  <div className="rounded-xl border border-ink-200 bg-white px-3 py-2 shadow-elev">
                    <div className="mb-1 text-[11px] font-bold text-ink-800">Ano {label}</div>
                    <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
                      <li className="flex items-center gap-3 text-[11px]">
                        <span className="text-ink-500">cobertura</span>
                        <span className="ml-auto font-mono font-semibold tabular-nums text-ink-800">
                          {d.realizado != null ? pct(d.realizado) : VAZIO}
                        </span>
                      </li>
                      {d.alvo != null && (
                        <li className="flex items-center gap-3 text-[11px]">
                          <span className="text-ink-500">meta</span>
                          <span className="ml-auto font-mono font-semibold tabular-nums text-ink-800">
                            {pct(d.alvo)}
                          </span>
                        </li>
                      )}
                      {d.desvio != null && (
                        <li className="flex items-center gap-3 border-t border-ink-100 pt-0.5 text-[11px]">
                          <span className="text-ink-500">
                            {d.atingida == null
                              ? 'não avaliada'
                              : d.atingida
                                ? 'acima da meta'
                                : 'abaixo da meta'}
                          </span>
                          <span
                            className="ml-auto font-mono font-semibold tabular-nums"
                            style={{ color: corDoVeredito(d.atingida) }}
                          >
                            {sinalPct(d.desvio)}
                          </span>
                        </li>
                      )}
                    </ul>
                  </div>
                )
              }}
            />

            {/* O VÃO ENTRE A META E O REALIZADO, ano a ano. Vem ANTES das
                séries para ficar por baixo delas, e usa coordenadas de dado
                (`segment`), então acompanha o eixo sem conta de pixel. */}
            {dados.map((d) =>
              d.alvo == null || d.realizado == null ? null : (
                <ReferenceLine
                  key={`vao-${d.ano}`}
                  segment={[
                    { x: d.ano, y: d.alvo },
                    { x: d.ano, y: d.realizado },
                  ]}
                  stroke={corDoVeredito(d.atingida)}
                  strokeWidth={2}
                  strokeOpacity={0.45}
                  ifOverflow="extendDomain"
                />
              ),
            )}

            {/* A META COMO MARCADOR, e não como linha: `strokeWidth={0}` apaga
                o traço entre os pontos e deixa só os losangos dos anos em que
                existe compromisso contratual. */}
            <Line
              type="linear"
              dataKey="alvo"
              stroke="none"
              strokeWidth={0}
              connectNulls={false}
              dot={<LosangoDaMeta />}
              activeDot={false}
              isAnimationActive={false}
            />

            <Line
              type="monotone"
              dataKey="realizado"
              stroke={COR.entra}
              strokeWidth={2.25}
              connectNulls
              dot={<PontoDoRealizado dados={dados} />}
              activeDot={{ r: 5 }}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
        </>
      )}
    </QuadroGrafico>
  )
}

/**
 * O LOSANGO DA META — um por ano com compromisso contratual.
 *
 * Losango, e não círculo: a curva do realizado já usa círculos, e duas marcas
 * redondas na mesma área se confundem. A forma carrega a distinção sozinha,
 * antes da cor.
 */
function LosangoDaMeta({ cx, cy, value }: { cx?: number; cy?: number; value?: number | null }) {
  if (cx == null || cy == null || value == null) return null
  const r = 4.5
  return (
    <path
      d={`M${cx},${cy - r} L${cx + r},${cy} L${cx},${cy + r} L${cx - r},${cy} Z`}
      fill={COR_META.alvo}
      stroke="var(--viz-surface)"
      strokeWidth={1.5}
    />
  )
}

/**
 * O PONTO DA CURVA DO REALIZADO — miúdo nos anos comuns, com corpo e cor de
 * veredito nos anos de meta, mais o desvio escrito ao lado.
 *
 * Um `dot` custom em vez de duas séries sobrepostas porque a distinção é do
 * PONTO, não da série: são os mesmos números na mesma linha, e só alguns anos
 * carregam um julgamento contratual.
 *
 * O RÓTULO SAI PARA O LADO, e não para cima: metas em anos consecutivos — 2036
 * e 2037 em Rio das Ostras — empilhavam dois textos no mesmo ponto e viravam um
 * borrão. Deslocado na horizontal, e com a altura seguindo o sinal do desvio,
 * dois anos vizinhos com vereditos opostos caem em lados opostos da curva.
 */
function PontoDoRealizado({
  cx,
  cy,
  index,
  dados,
}: {
  cx?: number
  cy?: number
  index?: number
  dados: { atingida: boolean | null; alvo: number | null; desvio: number | null }[]
}) {
  if (cx == null || cy == null || index == null) return null
  const d = dados[index]
  if (!d) return null

  // Ano sem meta: ponto discreto, só para a curva não virar um traço liso.
  if (d.alvo == null) {
    return <circle cx={cx} cy={cy} r={2} fill={COR.entra} />
  }

  const cor = corDoVeredito(d.atingida)
  const acima = (d.desvio ?? 0) >= 0
  return (
    <g>
      <circle cx={cx} cy={cy} r={5} fill={cor} stroke="var(--viz-surface)" strokeWidth={1.5} />
      {d.desvio != null && (
        <text
          x={cx + 9}
          y={acima ? cy - 8 : cy + 15}
          textAnchor="start"
          fontSize={10}
          fontWeight={700}
          fontFamily="IBM Plex Mono, monospace"
          fill={cor}
          stroke="var(--viz-surface)"
          strokeWidth={3}
          paintOrder="stroke"
        >
          {sinalPct(d.desvio)}
        </text>
      )}
    </g>
  )
}

/**
 * Verde cumpriu, vermelho não — e CINZA quando o motor não avaliou (meta fora
 * da janela de CAPEX). O terceiro caso existe porque pintá-lo de vermelho
 * reportaria uma falha que ninguém verificou.
 */
function corDoVeredito(atingida: boolean | null): string {
  if (atingida == null) return COR.mudo
  return atingida ? COR_META.atingida : COR_META.perdida
}

/** "+2,4 p.p." / "−5,1 p.p." — o desvio contra a meta, com sinal explícito. */
function sinalPct(v: number): string {
  const sinal = v > 0 ? '+' : v < 0 ? '−' : ''
  return `${sinal}${Math.abs(v).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} p.p.`
}
