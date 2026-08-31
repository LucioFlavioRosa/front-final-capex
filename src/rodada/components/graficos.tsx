import {
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  ComposedChart,
  LabelList,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { Key, ReactNode } from 'react'
import { QuadroGrafico } from '@/rodada/components/QuadroGrafico'
import {
  COR,
  COR_FLUXO_ESCOAMENTO,
  COR_FLUXO,
  COR_META,
} from '@/rodada/components/cores'
import { VAZIO, brlMi, pct, sinalMi } from '@/rodada/lib/formato'
import type {
  AnoFinanceiro,
  EbitdaAno,
  MetaCobertura,
  ParcelaFluxoEscoamento,
  PontoCobertura,
  ReceitaAno,
} from '@/rodada/domain/resultado'

/**
 * Os gráficos do painel global, em recharts.
 *
 * Substituem 1.077 LOC de SVG à mão do repo de origem. O requisito da decisão
 * de 17/08 é "mesma INFORMAÇÃO, nossa identidade" — e "mesma informação" só é
 * verificável contra uma lista, que é a tabela de gráficos do
 * `INVENTARIO-TELAS-SIMULACAO-RESULTADOS.md`. A contagem deixou de ser fixa em
 * "oito" na reunião de validação de 18/08: elementos por ano e preço unitário
 * médio agora abrem um quadro por unidade física (ver `agruparPorUnidade`).
 *
 * As quatro armadilhas daquela lista, e onde cada uma é tratada aqui:
 *
 *   1. `null` NUNCA é plotado como zero. Em recharts isso é passar `null` no
 *      dado e NÃO usar `connectNulls`. O erro a evitar é `?? 0` na montagem da
 *      série — ele só é legítimo no cálculo do domínio do eixo, onde não altera
 *      o traçado.
 *   2. O tooltip pode ter MAIS informação que a série (ver `GraficoDesembolso`,
 *      cujo tooltip mostra o acumulado que a barra do ano não desenha).
 *   3. Unidade física ausente vira `'—'`, nunca 0.
 *   4. `indireta` só existe no ano da conexão — segmento ausente, não zerado.
 *
 * E a decisão de desenho da fase 8: o EBITDA virou DOIS painéis empilhados com
 * o eixo X compartilhado, porque no original ele tinha dois eixos Y.
 */

const ALTURA = 200
const MARGEM = { top: 12, right: 12, bottom: 4, left: 4 }

/**
 * Geometria do grupo de barras do Desembolso, EXPLÍCITA e não herdada do
 * default do recharts: a tampa do teto é desenhada à mão e precisa saber onde o
 * grupo começa. Deixar o `barGap` implícito faria o traço sair de lugar se o
 * default mudasse numa atualização da lib.
 */
const VAO_BARRA = 4
const LARGURA_BARRA = 16

/** Eixo Y de dinheiro: milhões, sem o "R$" repetido em cada marca. */
const tickBrl = (v: number) => (Math.abs(v) >= 1e6 ? `${Math.round(v / 1e6)} Mi` : String(v))

const eixoBase = {
  stroke: COR.eixo,
  tick: { fill: COR.mudo, fontSize: 10, fontFamily: 'IBM Plex Mono, monospace' },
  tickLine: false,
} as const

/**
 * Tooltip único de todos os gráficos.
 *
 * `linhas` é montado por quem chama, e não derivado da série, porque o do
 * Desembolso mostra o acumulado — que tem eixo próprio e não é uma barra do
 * grupo. Derivar do payload padrão do recharts perderia essa leitura.
 */
function Dica({
  ativo,
  titulo,
  linhas,
}: {
  ativo?: boolean
  titulo?: ReactNode
  linhas: { rotulo: string; valor: string; cor?: string }[]
}) {
  if (!ativo) return null
  return (
    <div className="rounded-xl border border-ink-200 bg-white px-3 py-2 shadow-elev">
      {titulo && <div className="mb-1 text-[11px] font-bold text-ink-800">{titulo}</div>}
      <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
        {linhas.map((l) => (
          <li key={l.rotulo} className="flex items-center gap-2 text-[11px]">
            {l.cor && (
              <span
                aria-hidden="true"
                className="h-2 w-2 shrink-0 rounded-sm"
                style={{ background: l.cor }}
              />
            )}
            <span className="text-ink-500">{l.rotulo}</span>
            <span className="ml-auto font-mono font-semibold tabular-nums text-ink-800">
              {l.valor}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Legenda em HTML, e não a do recharts: mesma tipografia do resto do app. */
function Legenda({ itens }: { itens: { rotulo: string; cor: string; traco?: boolean }[] }) {
  return (
    <ul className="m-0 mt-2 flex list-none flex-wrap gap-x-3.5 gap-y-1 p-0">
      {itens.map((i) => (
        <li key={i.rotulo} className="flex items-center gap-1.5 text-[10px] text-ink-500">
          <span
            aria-hidden="true"
            className={i.traco ? 'h-0 w-3 border-t-[1.5px] border-dashed' : 'h-2 w-2 rounded-sm'}
            style={i.traco ? { borderColor: i.cor } : { background: i.cor }}
          />
          {i.rotulo}
        </li>
      ))}
    </ul>
  )
}

// ===========================================================================
//  1 · Fluxo de escoamento — decomposição do VPL (Global, Cidade, Sub-bacia)
// ===========================================================================

/**
 * Fluxo de escoamento de verdade: cada barra flutua sobre a anterior.
 *
 * O truque é a base transparente — uma série empilhada invisível que empurra a
 * barra visível até onde ela começa. Sem isso o "waterfall" vira um gráfico de
 * colunas comum, que é outra leitura: a soma deixa de ser visível.
 *
 * `total` (o VPL) ancora no zero, porque ele não é um passo — é o resultado.
 */
export function GraficoFluxoEscoamento({
  parcelas,
  escopo,
  baseReceita,
}: {
  parcelas: ParcelaFluxoEscoamento[]
  escopo: string
  /**
   * "arrecadada" | "faturada" — a régua da parcela de receita deste quadro.
   *
   * Vem junto com o rótulo do KPI de Receita (item 16 do feedback de 26/08):
   * arrecadada já desconta inadimplência, faturada não, e um quadro que
   * decompõe o VPL sem dizer qual das duas entrou deixa a maior barra sem
   * unidade. Ausente em servidor antigo — aí a nota simplesmente não menciona
   * a base, em vez de afirmar uma das duas.
   */
  baseReceita?: string
}) {
  let acumulado = 0
  const dados = parcelas.map((p) => {
    const ehTotal = p.tipo === 'total'
    const base = ehTotal ? 0 : p.valor >= 0 ? acumulado : acumulado + p.valor
    if (!ehTotal) acumulado += p.valor
    return {
      rotulo: p.rotulo,
      base,
      altura: Math.abs(ehTotal ? p.valor : p.valor),
      valor: p.valor,
      ehTotal,
      cor: ehTotal ? COR_FLUXO_ESCOAMENTO.total : p.valor >= 0 ? COR_FLUXO_ESCOAMENTO.entra : COR_FLUXO_ESCOAMENTO.sai,
      // O texto do rótulo é mais escuro que a barra "entra": ele fica sobre o
      // fundo branco do quadro, não sobre a própria barra turquesa.
      textoCor: ehTotal
        ? COR_FLUXO_ESCOAMENTO.total
        : p.valor >= 0
          ? COR_FLUXO_ESCOAMENTO.entraTexto
          : COR_FLUXO_ESCOAMENTO.sai,
    }
  })

  return (
    <QuadroGrafico
      titulo="Decomposição do VPL"
      escopo={escopo}
      nota={
        <>
          Turquesa é receita <strong>entrando</strong>, azul é <strong>saída</strong> (CAPEX, OPEX,
          impostos) — a cor aqui é direção do caixa, não componente de obra.
          {baseReceita && (
            <>
              {' '}
              A receita é a <strong>{baseReceita}</strong>.
            </>
          )}
        </>
      }
      tabela={{
        colunas: ['Parcela', 'Valor'],
        linhas: parcelas.map((p) => [p.rotulo, brlMi(p.valor)]),
      }}
    >
      <ResponsiveContainer width="100%" height={ALTURA + 28}>
        <BarChart data={dados} margin={{ ...MARGEM, top: 26 }}>
          <CartesianGrid stroke={COR.grid} vertical={false} />
          <XAxis
            dataKey="rotulo"
            {...eixoBase}
            interval={0}
            tick={{ ...eixoBase.tick, fontSize: 9.5, fontFamily: 'Manrope, sans-serif' }}
          />
          <YAxis {...eixoBase} tickFormatter={tickBrl} width={52} />
          <ReferenceLine y={0} stroke={COR.eixo} />
          <Tooltip
            cursor={{ fill: COR.cursor }}
            content={({ active, payload }) => (
              <Dica
                ativo={active}
                titulo={payload?.[0]?.payload?.rotulo}
                linhas={[
                  {
                    rotulo: 'valor',
                    valor: brlMi(payload?.[0]?.payload?.valor),
                    cor: payload?.[0]?.payload?.cor,
                  },
                ]}
              />
            )}
          />
          {/* A base invisível: é ela que faz a barra flutuar. */}
          <Bar dataKey="base" stackId="c" fill="transparent" isAnimationActive={false} />
          {/* UMA série só para barra e ligação, e isto é o ponto delicado.
              A tentação é uma segunda `<Bar dataKey="altura">` só para desenhar
              a ligação — e ela envenena o eixo: com o mesmo `stackId`, o
              recharts soma `altura` DUAS vezes no domínio e a escala dobra
              (um fluxo de escoamento de 669 passa a pedir um eixo de 1400). Então a barra
              e a ligação saem do mesmo `shape`. */}
          <Bar
            dataKey="altura"
            stackId="c"
            maxBarSize={54}
            isAnimationActive={false}
            // O `shape` fica na SÉRIE e não na `<Cell>`: `Cell` não aceita
            // `shape` nesta versão do recharts. O índice vem nos props, e é
            // por ele que a barra acha a sua cor e o seu vizinho.
            shape={(props: {
              x?: string | number
              y?: string | number
              width?: string | number
              height?: string | number
              index?: number
            }) => {
              const x = Number(props.x ?? 0)
              const y = Number(props.y ?? 0)
              const w = Number(props.width ?? 0)
              const h = Number(props.height ?? 0)
              const i = props.index ?? 0
              const d = dados[i]
              if (!d) return <g />
              const proximo = dados[i + 1]
              // O acumulado APÓS este passo: topo da barra quando ela sobe,
              // base quando ela desce.
              const yAcumulado = d.valor >= 0 ? y : y + h
              // Sem próximo, ou entrando no total (que ancora no zero), o
              // degrau termina aqui e não há ligação a desenhar.
              const ligar = !!proximo && !proximo.ehTotal
              return (
                <g>
                  <rect x={x} y={y} width={w} height={Math.max(2, h)} rx={3} fill={d.cor} />
                  {ligar && (
                    <line
                      x1={x + w}
                      y1={yAcumulado}
                      x2={x + w + Math.max(12, w * 1.3)}
                      y2={yAcumulado}
                      stroke={COR.eixo}
                      strokeWidth={1}
                      strokeDasharray="3 3"
                    />
                  )}
                </g>
              )
            }}
          >
            <LabelList
              dataKey="altura"
              position="top"
              content={(props: {
                x?: string | number
                y?: string | number
                width?: string | number
                index?: number
              }) => {
                const x = Number(props.x ?? 0)
                const y = Number(props.y ?? 0)
                const width = Number(props.width ?? 0)
                const d = props.index === undefined ? undefined : dados[props.index]
                if (!d) return null
                return (
                  <text
                    x={x + width / 2}
                    y={y - 8}
                    textAnchor="middle"
                    fontSize={11.5}
                    fontWeight={600}
                    fontFamily="IBM Plex Mono, monospace"
                    fill={d.textoCor}
                  >
                    {/* Em MILHÕES, que é a régua do eixo e do subtítulo. O
                        valor cru (`7215556,1`) não é legível sobre uma barra. */}
                    {sinalMi(d.valor)}
                  </text>
                )
              }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </QuadroGrafico>
  )
}

// ===========================================================================
//  2 · Desembolso por ano — CAPEX/OPEX/receita + teto (Global)
// ===========================================================================

export function GraficoDesembolso({ anos }: { anos: AnoFinanceiro[] }) {
  /**
   * FILTRAR ANTES DE TRAÇAR — a regra número 1 do port.
   *
   * `tetoCapex` nulo significa **ano fora da janela de orçamento**. Plotar 0 ali
   * afirmaria "o teto naquele ano era zero", que é outra coisa e muda a leitura
   * do gráfico. Passando `null` e sem `connectNulls`, a linha simplesmente
   * PARA onde a janela acaba — que é a verdade.
   *
   * `acumulado` é a antiga Curva S, incorporada aqui por decisão da reunião de
   * validação de 18/08 ("essa curva do capex acumulado, ela nem faz sentido
   * ter ela separada assim"). Como a série anual já é a soma do que a Curva S
   * media mês a mês, o acumulado sai de uma soma corrida sobre `capex` — sem
   * pedir nada novo ao backend, e sem que as duas leituras possam discordar
   * sobre quanto já foi gasto.
   */
  let corrido = 0
  const dados = anos.map((a) => {
    corrido += a.capex
    return {
      ano: a.ano,
      capex: a.capex,
      opex: a.opex,
      receita: a.receita,
      teto: a.tetoCapex,
      acumulado: corrido,
    }
  })

  return (
    <QuadroGrafico
      titulo="Desembolso por ano"
      subtitulo="CAPEX, OPEX e receita, nominal · CAPEX acumulado no eixo direito"
      nota={
        <>
          A linha do <strong>teto</strong> some nos anos fora da janela de orçamento — ausente,
          não zero. O <strong>acumulado</strong> (eixo à direita) é a soma corrida do CAPEX anual.
        </>
      }
      tabela={{
        colunas: ['Ano', 'CAPEX', 'OPEX', 'Receita', 'Teto', 'CAPEX acumulado'],
        linhas: anos.map((a, i) => [
          a.ano,
          brlMi(a.capex),
          brlMi(a.opex),
          brlMi(a.receita),
          brlMi(a.tetoCapex),
          brlMi(dados[i].acumulado),
        ]),
      }}
    >
      <ResponsiveContainer width="100%" height={ALTURA}>
        <ComposedChart data={dados} margin={{ ...MARGEM, right: 8 }} barGap={VAO_BARRA}>
          <CartesianGrid stroke={COR.grid} vertical={false} />
          <XAxis dataKey="ano" {...eixoBase} />
          <YAxis yAxisId="reais" {...eixoBase} tickFormatter={tickBrl} width={52} />
          {/* Eixo próprio para o acumulado, pintado na cor da série — mesma
              mitigação do EBITDA para o eixo duplo: cada escala fica
              visivelmente amarrada à sua série, e não à barra do lado. */}
          <YAxis
            yAxisId="acumulado"
            orientation="right"
            {...eixoBase}
            tickFormatter={tickBrl}
            width={52}
            tick={{ ...eixoBase.tick, fill: COR_FLUXO.acumulado }}
          />
          <Tooltip
            cursor={{ fill: COR.cursor }}
            content={({ active, payload, label }) => {
              const d = payload?.[0]?.payload as (typeof dados)[number] | undefined
              return (
                <Dica
                  ativo={active}
                  titulo={label}
                  linhas={[
                    { rotulo: 'CAPEX', valor: brlMi(d?.capex), cor: COR_FLUXO.capex },
                    { rotulo: 'OPEX', valor: brlMi(d?.opex), cor: COR_FLUXO.opex },
                    { rotulo: 'receita', valor: brlMi(d?.receita), cor: COR_FLUXO.receita },
                    // `brl` devolve '—' para nulo: o tooltip diz "não há teto",
                    // e não "teto R$ 0".
                    { rotulo: 'teto', valor: brlMi(d?.teto), cor: COR_FLUXO.teto },
                    { rotulo: 'acumulado', valor: brlMi(d?.acumulado), cor: COR_FLUXO.acumulado },
                  ]}
                />
              )
            }}
          />
          {/* As quatro séries têm o MESMO `maxBarSize` de propósito: a tampa do
              teto calcula onde o grupo começa a partir da largura de uma barra,
              e larguras diferentes desalinhariam a tampa. */}
          <Bar yAxisId="reais" dataKey="capex" fill={COR_FLUXO.capex} radius={[3, 3, 0, 0]} maxBarSize={LARGURA_BARRA} />
          <Bar yAxisId="reais" dataKey="opex" fill={COR_FLUXO.opex} radius={[3, 3, 0, 0]} maxBarSize={LARGURA_BARRA} />
          <Bar yAxisId="reais" dataKey="receita" fill={COR_FLUXO.receita} radius={[3, 3, 0, 0]} maxBarSize={LARGURA_BARRA} />
          {/* O TETO como TAMPA POR ANO, e não como linha contínua.
              Uma `Line` ligando os anos desenha uma escada que atravessa o
              gráfico inteiro e domina a leitura — e afirma uma continuidade
              que o dado não tem: o teto é um limite DAQUELE ano, não uma série
              que evolui. Como shape, cada ano ganha um traço curto sobre o seu
              próprio grupo de barras, que é o desenho do design.
              O `fill` transparente mantém a série fora da pilha visual mas
              dentro do domínio do eixo Y — sem ela, um teto acima da maior
              barra sairia da escala. */}
          <Bar
            yAxisId="reais"
            dataKey="teto"
            fill="transparent"
            maxBarSize={LARGURA_BARRA}
            isAnimationActive={false}
            shape={(props: {
              x?: string | number
              y?: string | number
              width?: string | number
              index?: number
            }) => {
              const x = Number(props.x ?? 0)
              const y = Number(props.y ?? 0)
              const w = Number(props.width ?? 0)
              const d = dados[props.index ?? 0]
              // Ano fora da janela de orçamento: sem teto, sem traço. É a
              // regra nº 1 do port — ausente não é zero.
              if (!d || d.teto === null || d.teto === undefined) return <g />
              /**
               * A TAMPA COBRE O GRUPO, e o `x` que chega aqui é o da QUARTA
               * barra do grupo (o teto é a 4ª série) — não o do grupo.
               * Desenhar a partir dele põe o traço à direita das barras, entre
               * um ano e o seguinte, que é o que estava errado no primeiro
               * corte. Recuar `3 * (largura + vão)` volta ao início do grupo.
               */
              const inicio = x - 3 * (w + VAO_BARRA)
              const fim = inicio + 3 * w + 2 * VAO_BARRA
              return (
                <line
                  x1={inicio - 4}
                  y1={y}
                  x2={fim + 4}
                  y2={y}
                  stroke={COR_FLUXO.teto}
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                />
              )
            }}
          />
          {/* O acumulado no eixo PRÓPRIO — sem ele, a soma corrida (que só
              cresce) puxaria a escala das barras anuais e as achataria. */}
          <Line
            yAxisId="acumulado"
            type="monotone"
            dataKey="acumulado"
            stroke={COR_FLUXO.acumulado}
            strokeWidth={2.5}
            dot={{ r: 3.5, fill: 'var(--viz-surface)', stroke: COR_FLUXO.acumulado, strokeWidth: 2.5 }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
      <Legenda
        itens={[
          { rotulo: 'CAPEX', cor: COR_FLUXO.capex },
          { rotulo: 'OPEX', cor: COR_FLUXO.opex },
          { rotulo: 'Receita', cor: COR_FLUXO.receita },
          { rotulo: 'Teto de CAPEX', cor: COR_FLUXO.teto, traco: true },
          { rotulo: 'CAPEX acumulado (eixo dir.)', cor: COR_FLUXO.acumulado, traco: true },
        ]}
      />
    </QuadroGrafico>
  )
}

// ===========================================================================
//  3 · CAPEX por componente (Global)
// ===========================================================================

export function GraficoEbitda({
  anos,
  total,
  escopo,
  baseReceita,
}: {
  anos: EbitdaAno[]
  total: number
  escopo: string
  /** A régua da receita — ver `GraficoFluxoEscoamento`. A margem é % dela. */
  baseReceita?: string
}) {
  // A margem nula não é plotada — mesmo tratamento do teto de CAPEX.
  const dados = anos.map((a) => ({ ano: a.ano, ebitda: a.ebitda, margem: a.margemPct }))

  return (
    <QuadroGrafico
      titulo="EBITDA e margem por ano"
      subtitulo={`barras em R$ (eixo à esquerda), linha em % da receita${
        baseReceita ? ` ${baseReceita}` : ''
      } (eixo à direita) · total ${brlMi(total)}`}
      escopo={escopo}
      nota={
        <>
          O EBITDA é calculado a partir do plano, mas quem decide o plano é o <strong>VPL</strong>.
          As barras e a linha usam eixos independentes — compare valores pela aba Tabela, não pela
          altura.
        </>
      }
      tabela={{
        colunas: ['Ano', 'EBITDA', 'Margem'],
        linhas: anos.map((a) => [a.ano, brlMi(a.ebitda), pct(a.margemPct)]),
      }}
    >
      <ResponsiveContainer width="100%" height={ALTURA}>
        <ComposedChart data={dados} margin={{ ...MARGEM, right: 8 }}>
          <CartesianGrid stroke={COR.grid} vertical={false} />
          <XAxis dataKey="ano" {...eixoBase} />
          {/* Cada eixo pintado com a COR DA SUA SÉRIE: é o que amarra escala a
              série e impede a leitura cruzada que o eixo duplo convida. */}
          <YAxis
            yAxisId="reais"
            {...eixoBase}
            tickFormatter={tickBrl}
            width={52}
            tick={{ ...eixoBase.tick, fill: 'var(--viz-fluxo-primaria)' }}
          />
          <YAxis
            yAxisId="pct"
            orientation="right"
            {...eixoBase}
            width={44}
            domain={[0, 100]}
            ticks={[0, 25, 50, 75, 100]}
            tickFormatter={(v: number) => `${v}%`}
            tick={{ ...eixoBase.tick, fill: 'var(--viz-fluxo-entra-texto)' }}
          />
          <ReferenceLine yAxisId="reais" y={0} stroke={COR.eixo} />
          <Tooltip
            cursor={{ fill: COR.cursor }}
            content={({ active, payload, label }) => {
              const d = payload?.[0]?.payload as (typeof dados)[number] | undefined
              return (
                <Dica
                  ativo={active}
                  titulo={label}
                  linhas={[
                    {
                      rotulo: 'EBITDA',
                      valor: brlMi(d?.ebitda),
                      cor: 'var(--viz-fluxo-primaria)',
                    },
                    { rotulo: 'margem', valor: pct(d?.margem), cor: 'var(--viz-fluxo-entra)' },
                  ]}
                />
              )
            }}
          />
          <Bar
            yAxisId="reais"
            dataKey="ebitda"
            fill="var(--viz-fluxo-primaria)"
            radius={[3, 3, 0, 0]}
            maxBarSize={34}
            isAnimationActive={false}
          />
          <Line
            yAxisId="pct"
            type="monotone"
            dataKey="margem"
            stroke="var(--viz-fluxo-entra)"
            strokeWidth={2.5}
            dot={{
              r: 3.5,
              fill: 'var(--viz-surface)',
              stroke: 'var(--viz-fluxo-entra)',
              strokeWidth: 2.5,
            }}
            connectNulls={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
      <Legenda
        itens={[
          { rotulo: 'EBITDA (R$, eixo esq.)', cor: 'var(--viz-fluxo-primaria)' },
          { rotulo: 'Margem % (eixo dir.)', cor: 'var(--viz-fluxo-entra)' },
        ]}
      />
    </QuadroGrafico>
  )
}

// ===========================================================================
//  6 · Cobertura realizada × meta (Cidade)
// ===========================================================================

export function GraficoCobertura({
  cobertura,
  metas,
  escopo,
}: {
  cobertura: PontoCobertura[]
  metas: MetaCobertura[]
  escopo: string
}) {
  // METAS FORA DA JANELA DE CAPEX NAO CONTAM NO PLACAR, porque o motor nao as
  // julga: ele ignora meta com ano >= `anos_capex` e a devolve com
  // `atingida: null`. Somar so o que foi avaliado e o unico jeito de o
  // contador nao reprovar o plano por uma meta que ninguem conferiu — mesmo
  // critério do repo de referência (`referencias/repos-lucio/front`).
  const naJanela = metas.filter((m) => m.dentroDaJanela)
  const atingidas = naJanela.filter((m) => m.atingida).length
  const fora = metas.filter((m) => !m.dentroDaJanela)

  /**
   * O eixo X são os ANOS DE META, e não todos os anos do plano.
   *
   * A cobertura é uma série contínua (um ponto por ano); a meta existe só em
   * alguns anos. Plotar os dois no mesmo eixo contínuo espalha cinco barras por
   * vinte e cinco anos e a comparação — que é a razão do quadro — some. Então o
   * eixo é a lista de metas avaliadas, e o realizado vem do ano de cada meta.
   *
   * `realizadoPct` da própria meta é a fonte, e não `cobertura`: é o número que
   * o motor comparou com o alvo. Ler de outro lugar abriria a chance de a barra
   * discordar do "sim/não" da tabela ao lado.
   */
  const dados = naJanela.map((m) => ({
    ano: m.ano,
    alvo: m.alvoPct,
    realizado: m.realizadoPct,
    atingida: !!m.atingida,
  }))

  const metaPorAno = new Map(metas.map((m) => [m.ano, m]))
  const coberturaPorAno = new Map(cobertura.map((p) => [p.ano, p]))

  /**
   * Os anos da tabela são a UNIÃO dos dois conjuntos, e isso não é detalhe.
   *
   * Derivar só de `cobertura` faz um ano de meta SEM ponto de cobertura
   * desaparecer da tabela — e a meta que mais precisa aparecer é justamente a
   * de fora da janela, que costuma ser a mais distante e a que tem menos
   * chance de ter cobertura materializada. Some da tabela = o contrato deixa
   * de ser conferível, que é a omissão que esta tabela existe para impedir.
   */
  const anos = [...new Set([...coberturaPorAno.keys(), ...metaPorAno.keys()])].sort((a, b) => a - b)

  const linhasDaTabela: (string | number)[][] = anos.map((ano) => {
    const p = coberturaPorAno.get(ano)
    const m = metaPorAno.get(ano)
    return [
      ano,
      p ? pct(p.coberturaPct) : VAZIO,
      m ? pct(m.alvoPct) : VAZIO,
      // QUATRO estados, e cada um diz o motivo: não há meta neste ano; há e foi
      // atingida; há e não foi; há mas o motor não a avaliou (fora da janela de
      // CAPEX) — que não é o mesmo que falhar.
      m
        ? m.dentroDaJanela
          ? m.atingida
            ? 'Atingida'
            : 'Não atingida'
          : 'fora da janela'
        : 'Sem meta',
    ]
  })

  return (
    <QuadroGrafico
      titulo="Cobertura realizada × meta"
      subtitulo={`% da população · ${atingidas} de ${naJanela.length} metas na janela atingidas`}
      escopo={escopo}
      nota={
        fora.length > 0 ? (
          <>
            A meta de {fora.map((m) => m.ano).join(', ')} cai <strong>fora da janela de
            investimento</strong> e não foi avaliada — na aba Tabela aparece como{' '}
            <em>fora da janela</em>, não como "não".
          </>
        ) : (
          <>
            Cada ano tem <strong>duas barras</strong> — alvo e realizado. A cor do realizado já é
            o veredito: turquesa atingiu, vermelho não.
          </>
        )
      }
      tabela={{
        colunas: ['Ano', 'Cobertura', 'Alvo', 'Situação'],
        /**
         * A tabela é ANO A ANO, e o gráfico só tem os anos de meta.
         *
         * É de propósito, e é o que impede o porte de perder dado: o desenho
         * do design compara alvo × realizado, e para isso só os anos de meta
         * importam. Mas `cobertura` traz a trajetória inteira, que é
         * informação real — a curva de como se chegou lá. Ela vive aqui, com a
         * meta cruzada por ano quando existe.
         */
        linhas: linhasDaTabela,
      }}
    >
      <ResponsiveContainer width="100%" height={ALTURA}>
        <BarChart data={dados} margin={MARGEM} barGap={2}>
          <CartesianGrid stroke={COR.grid} vertical={false} />
          <XAxis dataKey="ano" {...eixoBase} />
          <YAxis
            {...eixoBase}
            width={40}
            domain={[0, 100]}
            tickFormatter={(v: number) => `${v}%`}
          />
          <Tooltip
            cursor={{ fill: COR.cursor }}
            content={({ active, payload, label }) => {
              const d = payload?.[0]?.payload as (typeof dados)[number] | undefined
              return (
                <Dica
                  ativo={active}
                  titulo={label}
                  linhas={[
                    { rotulo: 'alvo', valor: pct(d?.alvo), cor: COR_META.alvo },
                    {
                      rotulo: 'realizado',
                      valor: pct(d?.realizado),
                      cor: d?.atingida ? COR_META.atingida : COR_META.perdida,
                    },
                    { rotulo: 'situação', valor: d?.atingida ? 'atingida' : 'não atingida' },
                  ]}
                />
              )
            }}
          />
          {/* O ALVO é a barra de referência: cinza-azulado, atrás na leitura.
              Não é resultado da rodada — é premissa contratual —, então não
              disputa cor com o realizado. */}
          <Bar
            dataKey="alvo"
            fill={COR_META.alvo}
            radius={[2, 2, 0, 0]}
            maxBarSize={26}
            isAnimationActive={false}
          />
          <Bar dataKey="realizado" radius={[2, 2, 0, 0]} maxBarSize={26} isAnimationActive={false}>
            {dados.map((d) => (
              <Cell key={d.ano} fill={d.atingida ? COR_META.atingida : COR_META.perdida} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <Legenda
        itens={[
          { rotulo: 'Alvo contratual', cor: COR_META.alvo },
          { rotulo: 'Realizado — atingida', cor: COR_META.atingida },
          { rotulo: 'Realizado — não atingida', cor: COR_META.perdida },
        ]}
      />
    </QuadroGrafico>
  )
}

// ===========================================================================
//  7 · Receita da sub-bacia — direta × indireta (Sub-bacia)
// ===========================================================================

export function GraficoReceitaSubBacia({ anos }: { anos: ReceitaAno[] }) {
  /**
   * `indireta` SÓ EXISTE NO ANO DA CONEXÃO.
   *
   * Uma série empilhada que a mostre como zero nos demais anos está mentindo
   * por omissão — ela afirma "houve receita indireta de zero", quando o fato é
   * que a receita indireta não se aplica àquele ano. Passando `null`, o recharts
   * não desenha segmento nenhum.
   */
  const dados = anos.map((a) => ({
    ano: a.ano,
    direta: a.direta,
    indireta: a.indireta > 0 ? a.indireta : null,
  }))

  return (
    <QuadroGrafico
      titulo="Receita por ano"
      subtitulo="direta e indireta"
      nota={
        <>
          A <strong>indireta</strong> só aparece no ano da conexão — nos demais anos o segmento nem
          existe, porque zero e ausente não são a mesma coisa.
        </>
      }
      tabela={{
        colunas: ['Ano', 'Direta', 'Indireta'],
        linhas: anos.map((a) => [a.ano, brlMi(a.direta), a.indireta > 0 ? brlMi(a.indireta) : VAZIO]),
      }}
    >
      <ResponsiveContainer width="100%" height={ALTURA}>
        <BarChart data={dados} margin={MARGEM}>
          <CartesianGrid stroke={COR.grid} vertical={false} />
          <XAxis dataKey="ano" {...eixoBase} />
          <YAxis {...eixoBase} tickFormatter={tickBrl} width={44} />
          <Tooltip
            cursor={{ fill: COR.cursor }}
            content={({ active, payload, label }) => {
              const d = payload?.[0]?.payload as (typeof dados)[number] | undefined
              return (
                <Dica
                  ativo={active}
                  titulo={label}
                  linhas={[
                    {
                      rotulo: 'direta',
                      valor: brlMi(d?.direta),
                      cor: 'var(--viz-fluxo-primaria)',
                    },
                    {
                      rotulo: 'indireta',
                      valor: brlMi(d?.indireta),
                      cor: 'var(--viz-fluxo-entra)',
                    },
                  ]}
                />
              )
            }}
          />
          <Bar
            dataKey="direta"
            stackId="r"
            fill="var(--viz-fluxo-primaria)"
            maxBarSize={34}
            stroke="var(--viz-surface)"
            strokeWidth={2}
            isAnimationActive={false}
          />
          <Bar
            dataKey="indireta"
            stackId="r"
            fill="var(--viz-fluxo-entra)"
            maxBarSize={34}
            radius={[3, 3, 0, 0]}
            stroke="var(--viz-surface)"
            strokeWidth={2}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
      <Legenda
        itens={[
          { rotulo: 'Receita direta', cor: 'var(--viz-fluxo-primaria)' },
          { rotulo: 'Receita indireta (ano da conexão)', cor: 'var(--viz-fluxo-entra)' },
        ]}
      />
    </QuadroGrafico>
  )
}

/**
 * A CURVA DE COBERTURA DA UNIDADE — item 4 do feedback de 26/08, no nível 1
 * ("a curva de cobertura que aquela simulação atinge").
 *
 * É uma LINHA, e não barras como `GraficoCobertura` (nível 2): lá o eixo X são
 * os ANOS DE META, um punhado de pontos onde faz sentido comparar alvo ×
 * realizado lado a lado. Aqui o eixo é a TRAJETÓRIA inteira do horizonte —
 * a pergunta é "como a cobertura sobe", não "bateu a meta neste ano" —, e
 * barras para vinte e cinco anos ficariam finas demais para ler.
 *
 * NÃO TEM ALVO PLOTADO, de propósito: a meta é contratual POR CIDADE, e uma
 * "meta da unidade" não existe em nenhum contrato — desenhar uma linha de alvo
 * agregado inventaria um número sem base. O que a série tem em vez disso são
 * MARCADORES nos anos com meta avaliada, coloridos por quantas cidades
 * cumpriram a delas naquele ano — a pergunta contratual, sem fingir que ela
 * tem uma resposta única.
 */
export function GraficoCoberturaUnidade({
  coberturaUnidade,
  metasPorAno,
  escopo,
}: {
  coberturaUnidade: PontoCobertura[]
  metasPorAno: { ano: number; atingidas: number; total: number }[]
  escopo: string
}) {
  const metaPorAno = new Map(metasPorAno.map((m) => [m.ano, m]))
  const dados = coberturaUnidade.map((p) => ({
    ano: p.ano,
    coberturaPct: p.coberturaPct,
    meta: metaPorAno.get(p.ano) ?? null,
  }))

  const totalMetas = metasPorAno.reduce((s, m) => s + m.total, 0)
  const totalAtingidas = metasPorAno.reduce((s, m) => s + m.atingidas, 0)

  return (
    <QuadroGrafico
      titulo="Cobertura da unidade"
      subtitulo={
        totalMetas > 0
          ? `% agregado por ligações · ${totalAtingidas} de ${totalMetas} metas contratuais cumpridas na janela`
          : '% agregado por ligações'
      }
      escopo={escopo}
      nota={
        <>
          A trajetória é REAL — ligações cobertas ÷ universo, somadas de todas as cidades. Sem
          alvo desenhado: a meta é <strong>contratual por cidade</strong>, e não existe uma meta
          única da unidade. Os pontos maiores marcam os anos com meta avaliada; passe o mouse para
          ver quantas cidades cumpriram a delas.
        </>
      }
      tabela={{
        colunas: ['Ano', 'Cobertura', 'Metas cumpridas no ano'],
        linhas: dados.map((d) => [
          d.ano,
          pct(d.coberturaPct),
          d.meta ? `${d.meta.atingidas} de ${d.meta.total}` : VAZIO,
        ]),
      }}
    >
      <ResponsiveContainer width="100%" height={ALTURA}>
        <ComposedChart data={dados} margin={MARGEM}>
          <CartesianGrid stroke={COR.grid} vertical={false} />
          <XAxis dataKey="ano" {...eixoBase} />
          <YAxis {...eixoBase} width={40} domain={[0, 100]} tickFormatter={(v: number) => `${v}%`} />
          <Tooltip
            cursor={{ stroke: COR.grid }}
            content={({ active, payload, label }) => {
              const d = payload?.[0]?.payload as (typeof dados)[number] | undefined
              if (!d) return null
              return (
                <Dica
                  ativo={active}
                  titulo={`Ano ${label}`}
                  linhas={[
                    { rotulo: 'cobertura', valor: pct(d.coberturaPct), cor: COR.entra },
                    ...(d.meta
                      ? [
                          {
                            rotulo: 'metas cumpridas',
                            valor: `${d.meta.atingidas} de ${d.meta.total}`,
                          },
                        ]
                      : []),
                  ]}
                />
              )
            }}
          />
          <Line
            type="monotone"
            dataKey="coberturaPct"
            stroke={COR.entra}
            strokeWidth={2}
            dot={(props: {
              cx?: number
              cy?: number
              payload?: (typeof dados)[number]
              key?: Key | null
            }) => {
              const { cx, cy, payload: d, key } = props
              if (cx == null || cy == null || !d) return <g key={key ?? undefined} />
              const temMeta = !!d.meta
              const cumpriuTudo = d.meta ? d.meta.atingidas === d.meta.total : false
              return (
                <circle
                  key={key ?? undefined}
                  cx={cx}
                  cy={cy}
                  r={temMeta ? 4.5 : 2.5}
                  fill={temMeta ? (cumpriuTudo ? COR.entra : COR_META.perdida) : COR.entra}
                  stroke="var(--viz-surface)"
                  strokeWidth={temMeta ? 1.5 : 0}
                />
              )
            }}
            activeDot={{ r: 5 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </QuadroGrafico>
  )
}
