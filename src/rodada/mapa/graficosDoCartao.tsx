import { useMemo } from 'react'
import {
  Bar,
  BarChart,
  Cell,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { COR, COR_META } from '@/rodada/components/cores'
import { VAZIO, brMi, brlMi, inteiro, pct } from '@/rodada/lib/formato'
import type { CidadeLinha } from '@/rodada/domain/resultado'
import type { ParcelaFluxoEscoamento } from '@/rodada/domain/resultado'
import type { Camada } from '@/rodada/mapa/camadas'

/**
 * OS GRÁFICOS DO CARTÃO — pequenos de propósito, e NÃO os `QuadroGrafico` da
 * página encolhidos.
 *
 * A tentação era reusar `GraficoCobertura` e `GraficoFluxoEscoamento`, que
 * desenham exatamente estas séries. Não dá, por duas razões que não se
 * resolvem com prop:
 *
 *   1. Aqueles componentes JÁ SÃO um cartão — `QuadroGrafico` traz moldura,
 *      título, alternador Gráfico/Tabela e rodapé de nota. Dentro de um cartão
 *      flutuante isso vira cartão dentro de cartão, com dois títulos
 *      competindo e ~140px de cromo antes do primeiro pixel de dado.
 *   2. Nenhum deles desenha DUAS CIDADES. A comparação é a razão de o cartão
 *      existir, e ela muda a forma de cada série, não só a quantidade.
 *
 * O que se reusa — e é o que importa para as duas telas não divergirem — são
 * os TOKENS (`cores.ts`, `--viz-*`) e os formatadores (`lib/formato`). Cor e
 * casas decimais continuam saindo de um lugar só.
 *
 * ## O DESENHO É `aria-hidden`, E A TABELA OCULTA É O EQUIVALENTE
 *
 * Mesma regra do `QuadroGrafico` (ver o comentário de `tabela` lá): o SVG não
 * é lido por leitor de tela, então cada gráfico daqui carrega um `<table>`
 * `sr-only` com a mesma série. Sem isso o cartão seria a única superfície da
 * tela com dado inacessível.
 */

/**
 * As duas cidades, e por que estas duas cores.
 *
 * Turquesa e azul são o par que a rota inteira já usa para separar duas
 * coisas (`--viz-fluxo-entra` / `--viz-fluxo-sai`), e os dois já trocam de
 * valor sozinhos entre os temas. Aqui eles NÃO significam entra/sai — numa
 * comparação entre municípios não há direção de caixa —, e nenhum gráfico
 * deste arquivo mistura as duas leituras no mesmo eixo, então não há
 * ambiguidade a desfazer.
 */
export const COR_A = 'var(--viz-fluxo-entra)'
export const COR_B = 'var(--viz-fluxo-sai)'

const ALTURA = 148
/**
 * `top: 14` não é folga estética: as metas de cobertura são `ReferenceLine`
 * com rótulo em `position: 'top'`, e o rótulo desenha PARA CIMA da área de
 * plotagem. Com a margem apertada, "43,5%" saía cortado ao meio.
 *
 * `left: 0` pelo motivo oposto ao do resto do app: nos quadros da página a
 * margem esquerda é negativa para colar o eixo no cartão, e aqui isso comia o
 * primeiro dígito de "100,0 mi". Quem controla a largura do eixo é o `width`
 * de cada `YAxis`, que muda com o formato do número.
 */
const MARGEM = { top: 14, right: 8, bottom: 0, left: 0 }

const eixo = {
  tick: { fontSize: 10, fill: COR.mudo },
  axisLine: { stroke: COR.eixo },
  tickLine: false,
} as const

/**
 * Milhões SEM o "R$" — só no eixo VERTICAL, e só no cartão.
 *
 * "R$ 40,0 mi" precisa de ~72px a 10px de corpo, e o eixo Y do cartão tem
 * ~64: o recharts quebra o tick em duas linhas e os rótulos passam a se
 * encavalar. A moeda não some da leitura — ela está no cabeçalho ("CAPEX
 * R$ 62,4 Mi"), na dica de cada barra e na tabela oculta. É o eixo, o único
 * lugar onde ela se repete cinco vezes, que abre mão dela.
 */
const mi = (v: number) => brMi(v).replace('R$', '').trim()

/** O par de cidades que todo gráfico daqui recebe. `b` é opcional — sem comparação. */
export interface Par {
  a: CidadeLinha
  b?: CidadeLinha | null
}

/** Estado vazio uniforme: "não sei" nunca é desenhado como zero. */
export function SemSerie({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex min-h-[112px] items-center justify-center rounded-lg border border-dashed border-ink-200 px-4 text-center text-[11.5px] leading-relaxed text-ink-500">
      {children}
    </p>
  )
}

/**
 * A tabela `sr-only`. Não é `<caption>`+`<table>` gerada por cada gráfico à
 * mão porque os quatro têm a mesma forma: um rótulo de linha e N colunas.
 */
function TabelaOculta({
  titulo,
  colunas,
  linhas,
}: {
  titulo: string
  colunas: string[]
  linhas: (string | number)[][]
}) {
  return (
    <table className="sr-only">
      <caption>{titulo}</caption>
      <thead>
        <tr>
          {colunas.map((c) => (
            <th key={c} scope="col">
              {c}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {linhas.map((l, i) => (
          <tr key={i}>
            {l.map((celula, j) => (
              <td key={j}>{celula}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** A caixinha do recharts, uniforme nos quatro gráficos. */
function Dica({
  ativo,
  rotulo,
  itens,
}: {
  ativo?: boolean
  rotulo?: string | number
  itens: { nome: string; texto: string; cor: string }[]
}) {
  if (!ativo || itens.length === 0) return null
  return (
    <div className="rounded-md border border-ink-200 bg-white px-2.5 py-1.5 text-[11px] shadow-elev">
      <div className="font-semibold text-ink-800">{rotulo}</div>
      {itens.map((i) => (
        <div key={i.nome} className="flex items-center gap-1.5 text-ink-600">
          <span
            className="inline-block h-2 w-2 shrink-0 rounded-[2px]"
            style={{ background: i.cor }}
            aria-hidden
          />
          <span className="truncate">{i.nome}</span>
          <span className="ml-auto pl-2 font-mono tabular-nums text-ink-800">{i.texto}</span>
        </div>
      ))}
    </div>
  )
}

// ===========================================================================
//  1 · Cobertura × metas — a trajetória
// ===========================================================================

/**
 * A curva de cobertura, com as metas de A marcadas como pontos.
 *
 * AS METAS SÃO SÓ DE `a`, mesmo em comparação, e é decisão de leitura: cada
 * cidade tem o próprio contrato, então dois conjuntos de alvo no mesmo eixo
 * produzem quatro séries onde a pergunta era "esta cidade está cumprindo o
 * que prometeu, e a outra vai mais rápido ou mais devagar?". O alvo da
 * comparada não responde nenhuma das duas metades.
 *
 * Metas FORA DA JANELA de CAPEX não viram ponto: o motor não as julga (ver
 * `MetaCobertura.atingida`), e um ponto colorido de vermelho ali reportaria
 * uma falha que ninguém apurou.
 */
export function GraficoCoberturaDoCartao({ a, b }: Par) {
  const { dados, temSerie } = useMemo(() => {
    const porAno = new Map<number, { ano: number; a: number | null; b: number | null }>()
    const garantir = (ano: number) => {
      let l = porAno.get(ano)
      if (!l) porAno.set(ano, (l = { ano, a: null, b: null }))
      return l
    }
    for (const p of a.cobertura ?? []) garantir(p.ano).a = p.coberturaPct
    for (const p of b?.cobertura ?? []) garantir(p.ano).b = p.coberturaPct
    const lista = [...porAno.values()].sort((x, y) => x.ano - y.ano)
    return { dados: lista, temSerie: lista.length > 1 }
  }, [a, b])

  const metas = useMemo(
    () => (a.metas ?? []).filter((m) => m.dentroDaJanela),
    [a],
  )

  if (!temSerie) {
    return <SemSerie>Esta rodada não publicou a curva de cobertura de {a.nome}.</SemSerie>
  }

  return (
    <>
      <div aria-hidden className="viz-root">
        <ResponsiveContainer width="100%" height={ALTURA}>
          <ComposedChart data={dados} margin={MARGEM}>
            <CartesianGrid stroke={COR.grid} vertical={false} />
            <XAxis dataKey="ano" {...eixo} />
            <YAxis
              {...eixo}
              width={34}
              domain={[0, 100]}
              ticks={[0, 50, 100]}
              tickFormatter={(v: number) => `${v}%`}
            />
            <Tooltip
              cursor={{ stroke: COR.eixo }}
              content={({ active, label, payload }) => (
                <Dica
                  ativo={active}
                  rotulo={label as number}
                  itens={(payload ?? [])
                    .filter((p) => p.value != null)
                    .map((p) => ({
                      nome: p.dataKey === 'a' ? a.nome : (b?.nome ?? ''),
                      texto: pct(p.value as number),
                      cor: p.dataKey === 'a' ? COR_A : COR_B,
                    }))}
                />
              )}
            />
            {/* AS METAS ANTES DAS LINHAS: desenhadas depois, os pontos de meta
                ficariam por cima da curva justamente no ano em que se quer ver
                se a curva passou por cima do alvo. */}
            {metas.map((m) => (
              <ReferenceLine
                key={m.ano}
                x={m.ano}
                stroke={m.atingida ? COR_META.atingida : COR_META.perdida}
                strokeDasharray="3 3"
                strokeOpacity={0.55}
                label={{
                  value: pct(m.alvoPct),
                  position: 'top',
                  fontSize: 9,
                  fill: m.atingida ? COR_META.atingida : COR_META.perdida,
                }}
              />
            ))}
            {b && (
              <Line
                type="monotone"
                dataKey="b"
                stroke={COR_B}
                strokeWidth={2}
                strokeDasharray="5 3"
                dot={false}
                connectNulls={false}
                isAnimationActive={false}
              />
            )}
            <Line
              type="monotone"
              dataKey="a"
              stroke={COR_A}
              strokeWidth={2.4}
              dot={false}
              connectNulls={false}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <TabelaOculta
        titulo={`Cobertura por ano — ${a.nome}${b ? ` e ${b.nome}` : ''}`}
        colunas={['Ano', a.nome, ...(b ? [b.nome] : []), 'Meta do ano']}
        linhas={dados.map((d) => {
          const m = metas.find((x) => x.ano === d.ano)
          return [
            d.ano,
            d.a == null ? VAZIO : pct(d.a),
            ...(b ? [d.b == null ? VAZIO : pct(d.b)] : []),
            m ? `${pct(m.alvoPct)} · ${m.atingida ? 'atingida' : 'não atingida'}` : VAZIO,
          ]
        })}
      />
    </>
  )
}

// ===========================================================================
//  2 · CAPEX por ano — o desembolso
// ===========================================================================

/**
 * As barras de CAPEX, com o ano do cronograma destacado.
 *
 * `anoEmFoco` vem do mesmo estado que recorta o mapa: clicar em 2032 no
 * cronograma lá embaixo escurece a barra de 2032 aqui. É o que faz o cartão
 * obedecer à linha do tempo em vez de ignorá-la — sem isso, o mapa mostraria
 * "CAPEX de 2032" e o cartão da cidade clicada mostraria o plano inteiro, com
 * dois números diferentes na mesma tela e nada explicando a diferença.
 */
export function GraficoCapexDoCartao({
  a,
  b,
  anoEmFoco,
}: Par & { anoEmFoco: number | null }) {
  const dados = useMemo(() => {
    const porAno = new Map<number, { ano: number; a: number | null; b: number | null }>()
    const garantir = (ano: number) => {
      let l = porAno.get(ano)
      if (!l) porAno.set(ano, (l = { ano, a: null, b: null }))
      return l
    }
    for (const p of a.capexPorAno ?? []) garantir(p.ano).a = p.capex
    for (const p of b?.capexPorAno ?? []) garantir(p.ano).b = p.capex
    const todos = [...porAno.values()].sort((x, y) => x.ano - y.ano)

    /**
     * AS PONTAS VAZIAS SAEM — e é o que torna o quadro legível num cartão.
     *
     * A série vem do fim da concessão (2051 na rodada de referência), mas a
     * janela de CAPEX tem quinze anos: mais de um terço do eixo é ano sem
     * obra. Num quadro de página isso é só espaço sobrando; nos ~300px do
     * cartão, as barras que sobram ficam com um pixel de largura e o gráfico
     * vira uma linha vertical.
     *
     * Aparar só as PONTAS, e não todo ano zerado: um buraco no meio do plano
     * é informação (a cidade parou de receber e voltou), e comprimi-lo faria
     * anos não contíguos parecerem contíguos — o eixo do tempo deixaria de ser
     * um eixo do tempo.
     */
    const temObra = (l: (typeof todos)[number]) => (l.a ?? 0) > 0 || (l.b ?? 0) > 0
    const inicio = todos.findIndex(temObra)
    if (inicio < 0) return todos
    let fim = todos.length - 1
    while (fim > inicio && !temObra(todos[fim])) fim--
    return todos.slice(inicio, fim + 1)
  }, [a, b])

  // `capexPorAno` ausente é SERVIDOR ANTIGO, não cidade sem investimento — a
  // mesma distinção que faz o mapa hachurar em vez de pintar zero.
  if (a.capexPorAno == null) {
    return (
      <SemSerie>
        Este servidor não publica o CAPEX ano a ano por cidade. O total de {a.nome} é{' '}
        {brlMi(a.capex)}.
      </SemSerie>
    )
  }
  if (dados.length === 0) {
    return <SemSerie>O plano não aloca CAPEX em nenhum ano para {a.nome}.</SemSerie>
  }

  /**
   * O ANO EM FOCO SÓ ESMAECE OS OUTROS SE ELE ESTIVER AQUI.
   *
   * O cronograma recorta o plano INTEIRO, e uma cidade pequena costuma
   * receber obra em três dos vinte e cinco anos. Escolher 2030 lá embaixo
   * fazia todas as barras desta cidade caírem para 28% de opacidade ao mesmo
   * tempo — um gráfico inteiro apagado, que se lê como falha de renderização e
   * não como "esta cidade não tem CAPEX em 2030". A nota abaixo diz a coisa
   * certa, e as barras continuam legíveis.
   */
  const focoPresente = anoEmFoco != null && dados.some((d) => d.ano === anoEmFoco)
  const opacidade = (ano: number) => (!focoPresente || ano === anoEmFoco ? 1 : 0.28)

  return (
    <>
      <div aria-hidden className="viz-root">
        <ResponsiveContainer width="100%" height={ALTURA}>
          <BarChart data={dados} margin={MARGEM} barCategoryGap="18%">
            <CartesianGrid stroke={COR.grid} vertical={false} />
            <XAxis dataKey="ano" {...eixo} />
            <YAxis {...eixo} width={50} tickFormatter={mi} />
            <Tooltip
              cursor={{ fill: COR.cursor }}
              content={({ active, label, payload }) => (
                <Dica
                  ativo={active}
                  rotulo={label as number}
                  itens={(payload ?? [])
                    .filter((p) => p.value != null)
                    .map((p) => ({
                      nome: p.dataKey === 'a' ? a.nome : (b?.nome ?? ''),
                      texto: brlMi(p.value as number),
                      cor: p.dataKey === 'a' ? COR_A : COR_B,
                    }))}
                />
              )}
            />
            <Bar dataKey="a" fill={COR_A} radius={[2, 2, 0, 0]} isAnimationActive={false}>
              {/* O ano em foco fica opaco e os outros desbotam: destacar
                  ACENDENDO um exigiria uma cor a mais na paleta para dizer o
                  que a própria ausência de esmaecimento já diz. */}
              {dados.map((d) => (
                <Cell key={d.ano} fillOpacity={opacidade(d.ano)} />
              ))}
            </Bar>
            {b && (
              <Bar dataKey="b" fill={COR_B} radius={[2, 2, 0, 0]} isAnimationActive={false}>
                {dados.map((d) => (
                  <Cell key={d.ano} fillOpacity={opacidade(d.ano)} />
                ))}
              </Bar>
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>
      {anoEmFoco != null && !focoPresente && (
        <p className="text-[10.5px] leading-relaxed text-ink-400">
          O cronograma está recortado em <strong className="font-semibold">{anoEmFoco}</strong>, e{' '}
          {a.nome} não recebe CAPEX nesse ano — o quadro mostra os anos em que recebe.
        </p>
      )}
      <TabelaOculta
        titulo={`CAPEX por ano — ${a.nome}${b ? ` e ${b.nome}` : ''}`}
        colunas={['Ano', a.nome, ...(b ? [b.nome] : [])]}
        linhas={dados.map((d) => [
          d.ano,
          d.a == null ? VAZIO : brlMi(d.a),
          ...(b ? [d.b == null ? VAZIO : brlMi(d.b)] : []),
        ])}
      />
    </>
  )
}

// ===========================================================================
//  3 · Composição do VPL — o fluxo de escoamento, compacto
// ===========================================================================

/**
 * A decomposição do VPL da cidade. Uma cidade só, sempre.
 *
 * NÃO EXISTE VERSÃO COMPARADA deste quadro, e o cartão nem tenta: um fluxo de
 * escoamento é uma soma encadeada — cada barra parte de onde a anterior parou
 * —, e duas somas encadeadas no mesmo eixo deixam de ser fluxo nenhum. Quando
 * há cidade comparada, o cartão troca para a distribuição (ver
 * `formaEfetiva` em `CartaoDaCidade.tsx`), que compara os dois VPL de um jeito
 * que continua verdadeiro.
 *
 * Mesma matemática de `GraficoFluxoEscoamento` — a base transparente que
 * empurra a barra visível. Duplicada aqui, e não extraída: são doze linhas, e
 * extrair criaria um acoplamento entre um quadro de página e um gráfico de
 * cartão que não têm mais nada em comum.
 */
export function GraficoComposicaoDoCartao({
  parcelas,
  nome,
}: {
  parcelas: ParcelaFluxoEscoamento[]
  nome: string
}) {
  const dados = useMemo(() => {
    let acumulado = 0
    return parcelas.map((p) => {
      const ehTotal = p.tipo === 'total'
      const base = ehTotal ? 0 : p.valor >= 0 ? acumulado : acumulado + p.valor
      if (!ehTotal) acumulado += p.valor
      return {
        rotulo: p.rotulo,
        base,
        altura: Math.abs(p.valor),
        valor: p.valor,
        cor: ehTotal ? 'var(--viz-fluxo-total)' : p.valor >= 0 ? COR_A : COR_B,
      }
    })
  }, [parcelas])

  if (dados.length === 0) {
    return <SemSerie>Esta rodada não publicou a decomposição do VPL de {nome}.</SemSerie>
  }

  return (
    <>
      {/* O FLUXO SAI DEITADO, e é o único gráfico do cartão que sai.
          Em pé, os rótulos das parcelas ("Receita direta", "Receita indireta",
          "Efeito-base paridade") competem por ~55px de eixo cada um num cartão
          de 372px: truncados a oito caracteres, "Receita direta" e "Receita
          indireta" viravam dois ticks idênticos — o gráfico passava a mostrar
          duas barras diferentes com o mesmo nome. Deitado, cada rótulo tem uma
          linha inteira, e o comprimento do texto deixa de disputar espaço com
          a altura da barra. */}
      <div aria-hidden className="viz-root">
        <ResponsiveContainer width="100%" height={Math.max(132, dados.length * 30)}>
          <BarChart
            data={dados}
            layout="vertical"
            margin={{ top: 4, right: 10, bottom: 0, left: 0 }}
            barCategoryGap="22%"
          >
            <CartesianGrid stroke={COR.grid} horizontal={false} />
            <XAxis type="number" {...eixo} tickFormatter={(v: number) => brMi(v)} />
            <YAxis
              type="category"
              dataKey="rotulo"
              {...eixo}
              width={92}
              interval={0}
              tick={{ fontSize: 9.5, fill: COR.mudo }}
            />
            <Tooltip
              cursor={{ fill: COR.cursor }}
              content={({ active, payload }) => {
                const p = payload?.[0]?.payload as (typeof dados)[number] | undefined
                return (
                  <Dica
                    ativo={active}
                    rotulo={p?.rotulo}
                    itens={p ? [{ nome, texto: brlMi(p.valor), cor: p.cor }] : []}
                  />
                )
              }}
            />
            <Bar dataKey="base" stackId="f" fill="transparent" isAnimationActive={false} />
            <Bar dataKey="altura" stackId="f" radius={[0, 2, 2, 0]} isAnimationActive={false}>
              {dados.map((d) => (
                <Cell key={d.rotulo} fill={d.cor} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <TabelaOculta
        titulo={`Decomposição do VPL — ${nome}`}
        colunas={['Parcela', 'Valor']}
        linhas={dados.map((d) => [d.rotulo, brlMi(d.valor)])}
      />
    </>
  )
}

// ===========================================================================
//  4 · Distribuição — esta cidade contra as outras dezoito
// ===========================================================================

export interface PontoDaDistribuicao {
  id: string
  nome: string
  valor: number
}

/**
 * O STRIP PLOT — dezenove pontos numa régua, e os escolhidos marcados.
 *
 * HTML posicionado em porcentagem, e nem recharts nem SVG. As duas
 * alternativas foram tentadas e as duas custam mais do que valem aqui:
 * `ScatterChart` com um eixo Y falso é mais configuração do que desenho, e o
 * SVG esbarra num defeito específico — a régua precisa esticar com a largura
 * do cartão, o que obriga a `preserveAspectRatio="none"`, e aí os `<circle>`
 * esticam JUNTO e a distribuição vira uma fileira de elipses. Em HTML o ponto
 * é um `div` redondo de tamanho fixo com `left` em porcentagem: a régua
 * estica, o ponto não.
 *
 * A AGLOMERAÇÃO É A INFORMAÇÃO, e é por isso que este desenho ganha de um
 * ranking de barras. A distribuição do CAPEX nesta unidade tem quinze cidades
 * amontoadas numa faixa estreita e o Rio quarenta vezes acima — num ranking
 * ordenado isso vira "dezenove barras, uma grande", que descreve a ordem e
 * esconde o formato. Na régua, o amontoado é literalmente um amontoado, e o
 * outlier é literalmente um ponto isolado lá na ponta.
 *
 * As cidades sem valor nesta camada (`valor == null` na origem) simplesmente
 * não estão em `pontos` — e o rodapé diz quantas são. Colocá-las no zero
 * inventaria um amontoado que não existe.
 */
export function GraficoDistribuicaoDoCartao({
  pontos,
  faixa,
  camada,
  idA,
  nomeA,
  idB,
  nomeB,
  semDado,
}: {
  pontos: PontoDaDistribuicao[]
  faixa: { min: number; max: number }
  camada: Camada
  idA: string
  nomeA: string
  idB?: string | null
  nomeB?: string | null
  /** Quantas cidades da rodada não têm valor nesta camada. */
  semDado: number
}) {
  /** Em % da largura da régua, com folga nas pontas para o ponto não vazar. */
  const posicao = (v: number) => {
    if (faixa.max === faixa.min) return 50
    return 3 + ((v - faixa.min) / (faixa.max - faixa.min)) * 94
  }

  if (pontos.length === 0) {
    return <SemSerie>Nenhuma cidade desta rodada tem valor em “{camada.rotulo}”.</SemSerie>
  }

  const marcados = pontos.filter((p) => p.id === idA || p.id === idB)
  /**
   * A cidade escolhida que NÃO ESTÁ na régua.
   *
   * Acontece de verdade: o Rio de Janeiro não tem "retorno por real" nesta
   * rodada (CAPEX zero, divisão sem denominador), então ele some de `pontos`.
   * Sem esta linha, o cabeçalho do cartão diz "contra RIO DE JANEIRO" e o
   * gráfico mostra um ponto só — a comparação simplesmente evapora, e o leitor
   * não tem como saber se o Rio está atrás dos outros pontos ou se ele nem
   * entrou na conta.
   */
  const ausentes = [
    idA && !pontos.some((p) => p.id === idA) ? nomeA : null,
    idB && !pontos.some((p) => p.id === idB) ? (nomeB ?? null) : null,
  ].filter(Boolean) as string[]

  return (
    <>
      {/* `viz-root` é OBRIGATÓRIO aqui, mesmo sem recharts: é a classe que
          define `--viz-axis`, `--viz-ink-muted` e `--viz-surface` (e que os
          reancora no tema escuro). Sem ela os tokens não resolvem e o CSS
          silenciosamente pinta de transparente — a régua e os dezenove pontos
          somem sem erro nenhum, deixando um retângulo vazio no lugar do
          gráfico. Foi exatamente o que aconteceu. */}
      <div aria-hidden className="viz-root flex min-h-[112px] flex-col justify-center gap-2 py-3">
        <div className="relative h-[34px]">
          {/* A régua. */}
          <div
            className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2"
            style={{ background: COR.eixo }}
          />
          {/* O ZERO, quando a faixa o cruza: numa camada divergente ele é a
              fronteira entre "se paga" e "não se paga", e sem a marca o leitor
              não sabe de que lado o ponto caiu. */}
          {faixa.min < 0 && faixa.max > 0 && (
            <div
              className="absolute top-1/2 h-4 w-px -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${posicao(0)}%`, background: COR.mudo }}
            />
          )}
          {/* As dezenove, translúcidas — a sobreposição vira densidade. */}
          {pontos.map((p) => (
            <span
              key={p.id}
              className="absolute top-1/2 h-[7px] w-[7px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-50"
              style={{ left: `${posicao(p.valor)}%`, background: COR.mudo }}
            />
          ))}
          {/* Os marcados por cima, maiores e com anel do chão do cartão para
              não sumirem dentro do amontoado. */}
          {marcados.map((p) => (
            <span
              key={p.id}
              className="absolute top-1/2 h-[11px] w-[11px] -translate-x-1/2 -translate-y-1/2 rounded-full ring-2"
              style={{
                left: `${posicao(p.valor)}%`,
                background: p.id === idA ? COR_A : COR_B,
                // @ts-expect-error — `--tw-ring-color` é a via suportada de
                // passar uma cor de anel dinâmica ao utilitário `ring-2`.
                '--tw-ring-color': 'var(--viz-surface)',
              }}
            />
          ))}
        </div>
        <div className="flex items-baseline justify-between gap-2 font-mono text-[9.5px] tabular-nums text-ink-400">
          <span>{camada.escala(faixa.min)}</span>
          <span>{camada.escala(faixa.max)}</span>
        </div>
      </div>

      <ul className="flex flex-col gap-0.5 text-[11px]">
        {marcados.map((p) => (
          <li key={p.id} className="flex items-baseline gap-1.5">
            <span
              className="inline-block h-2 w-2 shrink-0 rounded-full"
              style={{ background: p.id === idA ? COR_A : COR_B }}
              aria-hidden
            />
            <span className="min-w-0 truncate text-ink-600">{p.nome}</span>
            <span className="ml-auto shrink-0 font-mono tabular-nums text-ink-800">
              {camada.escala(p.valor)}
            </span>
            <span className="shrink-0 font-mono text-[10px] text-ink-400">
              {ordinal(pontos, p, camada)}
            </span>
          </li>
        ))}
        {ausentes.map((nome) => (
          <li key={nome} className="flex items-baseline gap-1.5 text-ink-400">
            <span
              className="inline-block h-2 w-2 shrink-0 rounded-full border border-dashed border-ink-400"
              aria-hidden
            />
            <span className="min-w-0 truncate">{nome}</span>
            <span className="ml-auto shrink-0 text-[10px]">sem valor nesta camada</span>
          </li>
        ))}
        {semDado > 0 && (
          <li className="pt-0.5 text-[10.5px] text-ink-400">
            {inteiro(semDado)} {semDado === 1 ? 'cidade fica de fora' : 'cidades ficam de fora'} —
            sem dado nesta camada, não no zero.
          </li>
        )}
      </ul>

      <TabelaOculta
        titulo={`${camada.rotulo} — todas as cidades da rodada`}
        colunas={['Posição', 'Cidade', camada.rotulo]}
        linhas={ordenar(pontos, camada).map((p, i) => [i + 1, p.nome, camada.escala(p.valor)])}
      />
    </>
  )
}

/** Mesma ordem do ranking ao lado do mapa — inclusive o `inverter`. */
function ordenar(pontos: PontoDaDistribuicao[], camada: Camada) {
  return [...pontos].sort((x, y) => (camada.inverter ? x.valor - y.valor : y.valor - x.valor))
}

function ordinal(pontos: PontoDaDistribuicao[], p: PontoDaDistribuicao, camada: Camada) {
  const i = ordenar(pontos, camada).findIndex((x) => x.id === p.id)
  return i < 0 ? '' : `${i + 1}ª de ${pontos.length}`
}
