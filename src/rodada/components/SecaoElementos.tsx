import { useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { QuadroGrafico } from '@/rodada/components/QuadroGrafico'
import { TituloSecao } from '@/rodada/components/pecas'
import { COR, COR_COMPONENTE, corDoComponente } from '@/rodada/components/cores'
import { VAZIO, brl, brlMi, compacto, inteiro } from '@/rodada/lib/formato'
import type { ElementoDoAno } from '@/rodada/domain/resultado'

/**
 * "Elementos e preço unitário" — panorama de componentes, e o detalhe de um.
 *
 * ## Por que o desenho mudou
 *
 * A seção era um par de gráficos (`GraficoElementosPorAno` +
 * `GraficoPrecoUnitarioPorAno`) que, no estado "Todos", se abria em UM quadro
 * por unidade física — porque metro não empilha com unidade, e essa regra não
 * está em discussão. Só que os dois viviam lado a lado num `grid` de duas
 * colunas, e o grid preenche linha a linha: com três unidades físicas a ordem
 * saía `elem, elem / elem, preço / preço, preço`. O par NUNCA ficava pareado
 * justamente no estado que abria a tela. Não era excesso de informação, era a
 * informação desmontada.
 *
 * A raiz é que "Todos" é um estado que aqueles dois gráficos não conseguiam
 * honrar: com a regra da unidade física, "todos os componentes" nunca pode ser
 * um gráfico — só N gráficos. E a visão agregada legítima já existe logo acima
 * na página, em `GraficoCapexComponente`, onde a unidade é R$ e empilhar tem
 * significado.
 *
 * ## O que existe agora
 *
 * Duas vistas, uma de cada vez:
 *
 *   PANORAMA — uma grade de mini-gráficos, um por componente, com EIXOS
 *              INDEPENDENTES. É o mapa: onde tem obra, em que anos, e qual a
 *              forma da curva. Nenhum eixo é compartilhado entre cards, então
 *              nenhuma comparação de altura entre cards é possível — por isso
 *              cada card carrega o seu próprio máximo escrito por extenso, que
 *              é a única comparação honesta entre eles.
 *   DETALHE  — um componente, dois painéis empilhados com o MESMO eixo de anos:
 *              quantidade em cima, preço unitário embaixo. Com um componente
 *              só, a unidade física é sempre única e o problema de agrupamento
 *              que motivava o código antigo simplesmente não existe.
 *
 * ## As três lentes do panorama
 *
 * `quantidade × preço unitário = CAPEX` — a identidade que a constraint
 * `capex_e_derivado` (migração 0012) garante no cadastro. Poder trocar a lente
 * sem sair do lugar é o que responde "o CAPEX daquele ano subiu por volume ou
 * por preço?", que é a pergunta de diagnóstico inteira desta seção.
 *
 * A lente de CAPEX é a única SEM buraco: `capex` vem preenchido mesmo no ano em
 * que a unidade física não é única (reais somam entre unidades diferentes), ao
 * contrário de `quantidade` e `precoUnitario`, que ficam nulos ali. Um ano
 * vazio nas duas primeiras lentes e cheio na terceira não é bug — é cadastro
 * com unidade misturada, e o panorama deixa isso visível em vez de esconder.
 *
 * As regras de honestidade herdadas de `graficos.tsx` continuam de pé: `null`
 * NUNCA vira 0 no traçado, e ausência de linha no ano (nada construído) é o
 * único zero legítimo — só na contagem, nunca no preço.
 */

type Metrica = 'quantidade' | 'preco' | 'capex'

const METRICAS: { value: Metrica; label: string }[] = [
  { value: 'quantidade', label: 'Quantidade' },
  { value: 'preco', label: 'Preço unitário' },
  { value: 'capex', label: 'CAPEX' },
]

/** Um componente, já achatado para as três séries que as duas vistas consomem. */
interface SerieComponente {
  componente: string
  /** A unidade física, quando ela é única em TODOS os anos. `null` se varia. */
  unidade: string | null
  pontos: {
    ano: number
    quantidade: number | null
    preco: number | null
    capex: number | null
  }[]
  /** CAPEX somado — a ordenação do panorama, e o subtítulo do detalhe. */
  capexTotal: number
}

const eixoBase = {
  stroke: COR.eixo,
  tick: { fill: COR.mudo, fontSize: 10, fontFamily: 'IBM Plex Mono, monospace' },
  tickLine: false,
}

/**
 * Achata `elementosPorAno` (ano → componentes) em componente → anos.
 *
 * A inversão é o trabalho todo: as duas vistas são POR COMPONENTE, e o payload
 * vem por ano. Todo componente recebe a lista COMPLETA de anos do recorte, para
 * os mini-gráficos do panorama terem todos o mesmo eixo X — sem isso, dois
 * cards com curvas de larguras diferentes sugeririam cronogramas diferentes.
 *
 * Ano sem linha do componente vira `quantidade: 0` (nada construído é zero de
 * verdade numa contagem) e `preco: null` (não há o que dividir). É a mesma
 * assimetria que o código antigo já aplicava.
 */
function porComponente(anos: ElementoDoAno[]): SerieComponente[] {
  const todosOsAnos = anos.map((a) => a.ano)
  const nomes: string[] = []
  const unidades = new Map<string, Set<string>>()
  for (const a of anos) {
    for (const c of a.porComponente) {
      if (!nomes.includes(c.componente)) nomes.push(c.componente)
      if (c.unidade) {
        unidades.set(c.componente, (unidades.get(c.componente) ?? new Set()).add(c.unidade))
      }
    }
  }

  // A ordem do mapa de cores é a canônica — a mesma que decide a cor de cada
  // série. Reaproveitada aqui para o panorama não trocar de ordem entre rodadas
  // por causa da ordem em que os componentes aparecem no payload.
  const ordem = Object.keys(COR_COMPONENTE)
  const posicao = (n: string) => (ordem.indexOf(n) === -1 ? ordem.length : ordem.indexOf(n))

  return nomes
    .sort((a, b) => posicao(a) - posicao(b))
    .map((componente) => {
      const us = unidades.get(componente)
      const pontos = todosOsAnos.map((ano) => {
        const achado = anos
          .find((a) => a.ano === ano)
          ?.porComponente.find((c) => c.componente === componente)
        return {
          ano,
          quantidade: achado === undefined ? 0 : achado.quantidade,
          preco: achado?.precoUnitario ?? null,
          capex: achado?.capex ?? null,
        }
      })
      return {
        componente,
        unidade: us && us.size === 1 ? [...us][0] : null,
        pontos,
        capexTotal: pontos.reduce((s, p) => s + (p.capex ?? 0), 0),
      }
    })
}

/** O rótulo da métrica no contexto de um componente — leva a unidade junto. */
function rotuloMetrica(m: Metrica, unidade: string | null): string {
  const u = unidade ?? VAZIO
  if (m === 'quantidade') return `quantidade construída (${u})`
  if (m === 'preco') return `preço unitário médio (R$/${u})`
  return 'CAPEX do ano (R$)'
}

function valorDe(p: SerieComponente['pontos'][number], m: Metrica): number | null {
  return m === 'quantidade' ? p.quantidade : m === 'preco' ? p.preco : p.capex
}

function formatar(v: number | null, m: Metrica, unidade: string | null): string {
  if (v === null) return VAZIO
  if (m === 'quantidade') return `${inteiro(v)} ${unidade ?? ''}`.trim()
  if (m === 'preco') return `${brl(v)}/${unidade ?? VAZIO}`
  return brlMi(v)
}

// ===========================================================================
//  Panorama — a grade de mini-gráficos
// ===========================================================================

/** Altura do desenho no card, sem contar a faixa que o rótulo ocupa. */
const ALTURA_CARD = 76

/**
 * A geometria do rótulo sobre a barra, EXPLÍCITA — ela é usada para decidir se
 * o rótulo cabe, e um valor herdado implicitamente do CSS deixaria a decisão
 * errada sem ninguém perceber.
 *
 * `LARGURA_CARACTERE` é a largura de um dígito na IBM Plex Mono no corpo usado
 * aqui. Mono, e não a sans do app, exatamente para essa conta existir: numa
 * fonte proporcional a largura dependeria de QUAIS dígitos são, e a medida
 * teria de ser feita no DOM a cada render.
 */
const CORPO_ROTULO = 9
const LARGURA_CARACTERE = 5.45
const FOLGA_ROTULO = 4

/**
 * Um card do panorama.
 *
 * É um `<button>` inteiro, e não um card com um link dentro: o alvo de clique
 * ser o card todo é o que faz a grade parecer um índice navegável em vez de uma
 * parede de gráficos. O desenho é `aria-hidden` (como em todo quadro do app) e
 * quem lê por leitor de tela ouve o rótulo do botão — o detalhe, com a tabela
 * completa, está a um Enter de distância.
 *
 * ## O eixo Y não existe; o rótulo sobre a barra ocupa o lugar dele
 *
 * Card nenhum compartilha escala com o vizinho, então uma faixa de marcas em Y
 * convidaria exatamente a comparação que a escala independente não sustenta.
 * Sem eixo, porém, o desenho sozinho só diz FORMA — daí o rótulo direto sobre
 * cada barra, que é o que devolve o valor à leitura sem exigir hover.
 *
 * ## O rótulo é MEDIDO antes de ser desenhado
 *
 * A regra do método de dataviz é que rótulo direto funciona porque é
 * econômico, e que um rótulo que não cabe não é encolhido nem cortado — ele não
 * é desenhado. Aqui a conta é possível porque a fonte é monoespaçada: a largura
 * do texto é `nº de caracteres × LARGURA_CARACTERE`, e a faixa disponível é a
 * largura da barra mais o vão até a vizinha, que o recharts entrega em
 * `props.width` de cada rótulo.
 *
 * Quando não cabe, sobra UM rótulo: o do pico. É o extremo, que é justamente o
 * que a regra manda rotular quando só um pode aparecer — e é ele que ancora a
 * escala do card, já que o rodapé repete o mesmo valor com precisão cheia e com
 * a unidade por extenso.
 *
 * Consequência que vale saber: num recorte com muitos anos e a grade em três
 * colunas, o card mostra só o pico. Não é um modo degradado — é o mesmo card
 * respeitando o espaço que tem.
 */
function CardPanorama({
  serie,
  metrica,
  onAbrir,
}: {
  serie: SerieComponente
  metrica: Metrica
  onAbrir: () => void
}) {
  const cor = corDoComponente(serie.componente)
  const dados = serie.pontos.map((p) => ({ ano: p.ano, v: valorDe(p, metrica) }))
  const valores = dados.map((d) => d.v).filter((v): v is number => v !== null)
  const maximo = valores.length ? Math.max(...valores) : null
  const vazio = valores.length === 0

  return (
    <button
      type="button"
      onClick={onAbrir}
      aria-label={`${serie.componente} — abrir o detalhe ano a ano`}
      // A cor do componente entra na MOLDURA (filete no topo e lavagem de
      // fundo), não em mais nenhuma marca do desenho: quem carrega identidade
      // no gráfico é a barra, e tingir duas coisas com a mesma cor faria a
      // moldura parecer que também codifica algo.
      style={{
        borderTopColor: cor,
        background: `color-mix(in srgb, ${cor} 4%, white)`,
      }}
      className="carta group flex flex-col gap-2 border-t-[3px] p-3.5 text-left transition-shadow duration-hover ease-saida hover:shadow-elev focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-water-500"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-[13px] font-bold text-ink-800">{serie.componente}</span>
        <span className="shrink-0 text-[11px] text-ink-400 opacity-0 transition-opacity duration-hover group-hover:opacity-100">
          abrir →
        </span>
      </div>

      <div aria-hidden="true" style={{ height: ALTURA_CARD }}>
        {vazio ? (
          <div className="flex h-full items-center text-[11px] text-ink-400">
            sem valor nesta leitura
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={dados}
              // A margem do topo é a faixa do rótulo. Sem ela o rótulo da barra
              // mais alta sai pela borda do gráfico e é cortado.
              margin={{ top: 13, right: 2, bottom: 0, left: 2 }}
              barCategoryGap="16%"
            >
              <XAxis dataKey="ano" hide />
              {/* A linha de base é a única régua do card: ela ancora as barras
                  e diz onde é o zero. Hairline e sólida — nunca tracejada. E é
                  uma `ReferenceLine`, e não o traço do `XAxis`: `hide` no eixo
                  esconde o eixo INTEIRO, a linha junto. */}
              <ReferenceLine y={0} stroke={COR.eixo} />
              {/* Folga no topo do domínio para o rótulo respirar sobre a barra
                  mais alta. É cálculo de EIXO, não de série: não muda traçado. */}
              <YAxis hide domain={[0, (max: number) => max * 1.02]} />
              <Tooltip
                cursor={{ fill: 'rgba(1,32,155,.05)' }}
                content={({ active, payload, label }) =>
                  active && payload?.length ? (
                    <div className="rounded-lg border border-ink-200 bg-white px-2 py-1 text-[11px] shadow-elev">
                      <span className="text-ink-500">{label}</span>{' '}
                      <span className="font-mono font-semibold tabular-nums text-ink-800">
                        {formatar(
                          payload[0].value === null || payload[0].value === undefined
                            ? null
                            : Number(payload[0].value),
                          metrica,
                          serie.unidade,
                        )}
                      </span>
                    </div>
                  ) : null
                }
              />
              <Bar
                dataKey="v"
                fill={cor}
                isAnimationActive={false}
                maxBarSize={24}
                radius={[4, 4, 0, 0]}
              >
                <LabelList
                  dataKey="v"
                  content={(props) => {
                    const { x, y, width, value } = props as {
                      x?: number
                      y?: number
                      width?: number
                      value?: number | null
                    }
                    if (
                      value === null ||
                      value === undefined ||
                      x === undefined ||
                      y === undefined ||
                      width === undefined
                    ) {
                      return null
                    }
                    const texto = compacto(value)
                    const cabe =
                      texto.length * LARGURA_CARACTERE + FOLGA_ROTULO <= width + FOLGA_ROTULO * 2
                    if (!cabe && value !== maximo) return null
                    return (
                      <text
                        x={x + width / 2}
                        y={y - 4}
                        textAnchor="middle"
                        // Cor de TEXTO, nunca a da série: o azul-claro de um
                        // componente é ilegível como texto sobre o branco, e a
                        // identidade já está na barra logo abaixo do rótulo.
                        fill="var(--ink-700)"
                        fontSize={CORPO_ROTULO}
                        fontFamily="IBM Plex Mono, monospace"
                        fontWeight={value === maximo ? 700 : 500}
                      >
                        {texto}
                      </text>
                    )
                  }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="flex items-baseline justify-between gap-2 border-t border-ink-100 pt-2 text-[10.5px] text-ink-500">
        <span className="font-mono tabular-nums">
          {dados[0]?.ano ?? VAZIO}–{dados[dados.length - 1]?.ano ?? VAZIO}
        </span>
        {/* O máximo com precisão cheia e a unidade por extenso: é ele que
            traduz o rótulo compacto ("5,5k") e dá a escala do card, que a
            ausência de eixo Y tirou. */}
        <span className="truncate font-mono tabular-nums">
          máx {formatar(maximo, metrica, serie.unidade)}
        </span>
      </div>
    </button>
  )
}

// ===========================================================================
//  Detalhe — um componente, dois painéis com o mesmo eixo de anos
// ===========================================================================

/**
 * O alinhamento entre os dois painéis é mantido à mão: `LARGURA_EIXO` e a
 * margem são idênticas nos dois, e só o de baixo desenha as marcas de ano. Um
 * dos dois com largura de eixo diferente deslocaria as barras, e o ano lido no
 * painel de cima deixaria de ser o ano lido no de baixo.
 */
const LARGURA_EIXO = 52
const MARGEM = { top: 12, right: 12, bottom: 0, left: 4 }

/**
 * Quantidade e preço unitário do componente, empilhados sob o mesmo eixo X.
 *
 * Dois painéis e não um eixo duplo: aqui as duas séries são de NATUREZAS
 * diferentes (contagem física e R$ por unidade), e a distância vertical entre
 * elas não significaria nada. É a mesma razão pela qual o EBITDA só ganhou eixo
 * duplo depois de o design pedir explicitamente — lá as duas séries são do
 * mesmo recorte financeiro; aqui não são.
 */
/**
 * Um painel de UMA métrica, de UM componente.
 *
 * A peça que as três variantes em avaliação compartilham — é ela que garante
 * que a comparação entre elas seja sobre o ARRANJO da tela, e não sobre
 * diferenças acidentais de formatação de eixo ou de tooltip.
 *
 * `comEixoX` existe porque no painel duplo só o de baixo desenha as marcas de
 * ano: o de cima empresta o eixo do de baixo, e desenhar as duas faixas de
 * números criaria uma divisória no meio de um gráfico que é para ser lido como
 * um só.
 */
function PainelMetrica({
  serie,
  metrica,
  comEixoX,
  altura,
  rotulo = true,
}: {
  serie: SerieComponente
  metrica: Metrica
  comEixoX: boolean
  altura: number
  rotulo?: boolean
}) {
  return (
    <div>
      {rotulo && (
        <p className="mb-0.5 px-1 text-[11px] font-semibold text-ink-500">
          {rotuloMetrica(metrica, serie.unidade)}
        </p>
      )}
      <ResponsiveContainer width="100%" height={altura}>
        <BarChart data={serie.pontos} margin={MARGEM}>
          <CartesianGrid stroke={COR.grid} vertical={false} />
          <XAxis
            dataKey="ano"
            {...eixoBase}
            height={comEixoX ? 22 : 0}
            tick={comEixoX ? eixoBase.tick : false}
          />
          <YAxis
            {...eixoBase}
            width={LARGURA_EIXO}
            tickFormatter={(v: number) =>
              metrica === 'quantidade'
                ? inteiro(v)
                : Math.abs(v) >= 1e6
                  ? `${Math.round(v / 1e6)} Mi`
                  : inteiro(v)
            }
          />
          <Tooltip
            cursor={{ fill: 'rgba(1,32,155,.05)' }}
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <div className="rounded-xl border border-ink-200 bg-white px-3 py-2 shadow-elev">
                  <div className="mb-1 text-[11px] font-bold text-ink-800">{label}</div>
                  <div className="flex items-center gap-2 text-[11px]">
                    <span className="text-ink-500">{rotuloMetrica(metrica, serie.unidade)}</span>
                    <span className="ml-auto font-mono font-semibold tabular-nums text-ink-800">
                      {formatar(
                        payload[0].value === null || payload[0].value === undefined
                          ? null
                          : Number(payload[0].value),
                        metrica,
                        serie.unidade,
                      )}
                    </span>
                  </div>
                </div>
              ) : null
            }
          />
          <Bar
            dataKey={metrica}
            fill={corDoComponente(serie.componente)}
            maxBarSize={40}
            isAnimationActive={false}
            radius={[3, 3, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/**
 * A tabela equivalente de um componente — as TRÊS colunas, sempre.
 *
 * Não acompanha a métrica escolhida na tela, e é de propósito: a tabela é o
 * caminho de quem lê por leitor de tela e o alívio de contraste que o
 * `QuadroGrafico` exige, então ela não pode oferecer menos do que o conjunto do
 * dado. É também onde a identidade `quantidade × preço = CAPEX` fica
 * conferível número a número, coisa que gráfico nenhum das três variantes faz.
 */
function tabelaDe(serie: SerieComponente) {
  const u = serie.unidade ?? VAZIO
  return {
    colunas: ['Ano', `Quantidade (${u})`, `Preço unitário (R$/${u})`, 'CAPEX'],
    linhas: serie.pontos.map((p) => [
      p.ano,
      p.quantidade === null ? VAZIO : inteiro(p.quantidade),
      p.preco === null ? VAZIO : brl(p.preco),
      p.capex === null ? VAZIO : brlMi(p.capex),
    ]),
  }
}

const NOTA_PRECO = (
  <>
    O preço unitário é o <strong>CAPEX do ano dividido pela quantidade daquele ano</strong> — não é
    o preço de tabela do cadastro. Onde ele se descola, a diferença é <strong>mix</strong> (que
    obras entraram naquele ano) ou erro de cadastro. Ano vazio é ausência de resposta, nunca preço
    zero.
  </>
)

function PainelDetalhe({ serie }: { serie: SerieComponente }) {
  return (
    <QuadroGrafico
      titulo={serie.componente}
      subtitulo={`ano a ano, em ${serie.unidade ?? VAZIO} · CAPEX total ${brlMi(serie.capexTotal)}`}
      nota={
        <>
          {NOTA_PRECO} Os dois painéis dividem o eixo de anos, mas não a escala vertical: comparar
          altura entre eles não significa nada.
        </>
      }
      tabela={tabelaDe(serie)}
    >
      <div className="flex flex-col">
        <PainelMetrica serie={serie} metrica="quantidade" comEixoX={false} altura={150} />
        <PainelMetrica serie={serie} metrica="preco" comEixoX altura={130} />
      </div>
    </QuadroGrafico>
  )
}

// ===========================================================================
//  A vista — panorama de componentes, e o detalhe de um
// ===========================================================================

/**
 * O arranjo escolhido, entre os três que ficaram no ar para avaliação.
 *
 * É o único com visão de conjunto: a grade responde "onde tem obra e em que
 * anos" sem nenhum clique, e a métrica troca a lente dos cards todos de uma
 * vez. O que ele cobra em troca é um passo a mais para a leitura precisa (abrir
 * o componente) e uma regra que o usuário precisa entender — eixos
 * independentes entre cards —, daí o máximo escrito em cada card e a nota ao
 * lado do seletor de métrica.
 */
function VistaPanorama({ series }: { series: SerieComponente[] }) {
  const [metrica, setMetrica] = useState<Metrica>('quantidade')
  const [aberto, setAberto] = useState<string | null>(null)
  const detalhe = series.find((s) => s.componente === aberto) ?? null

  return (
    <>
      {detalhe ? (
        <div className="flex flex-col gap-2.5">
          <button
            type="button"
            onClick={() => setAberto(null)}
            className="self-start text-[12px] font-semibold text-water-700 hover:text-water-800"
          >
            ← todos os componentes
          </button>
          <PainelDetalhe serie={detalhe} />
        </div>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <SegmentedControl
              options={METRICAS}
              value={metrica}
              onChange={setMetrica}
              aria-label="Métrica do panorama"
            />
            <span className="text-[11px] text-ink-400">
              cada card tem escala própria — compare pelo máximo, não pela altura
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {series.map((s) => (
              <CardPanorama
                key={s.componente}
                serie={s}
                metrica={metrica}
                onAbrir={() => setAberto(s.componente)}
              />
            ))}
          </div>
        </>
      )}
    </>
  )
}

// ===========================================================================
//  A seção inteira — o que as quatro granularidades montam
// ===========================================================================

/**
 * Global, Cidade, Sistema e Sub-bacia montavam este bloco com cinco elementos
 * copiados (título, filtro, estado do filtro e os dois gráficos). Agora montam
 * um. A duplicação não era só verbosidade: era a chance de as quatro telas
 * divergirem sobre uma decisão de leitura que tem de ser a mesma nas quatro,
 * exatamente como `_elementos_por_ano` já garante do lado do backend.
 */
export function SecaoElementos({ anos }: { anos: ElementoDoAno[] }) {
  const series = useMemo(() => porComponente(anos), [anos])
  if (series.length === 0) return null

  return (
    <>
      <TituloSecao nota="clique num componente para abrir">Elementos e preço unitário</TituloSecao>
      <VistaPanorama series={series} />
    </>
  )
}

