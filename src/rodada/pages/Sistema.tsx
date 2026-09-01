import { Fragment, useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { CaretRight } from '@phosphor-icons/react'
import { Estado } from '@/rodada/components/Estado'
import { BotaoExportar } from '@/rodada/components/BotaoExportar'
import { BotaoParametros } from '@/rodada/components/PainelParametros'
import {
  Cartao,
  CelulaLink,
  ChipSituacao,
  FaixaKpi,
  ItemRodape,
  TituloSecao,
  Trilha,
  ValorOcupacao,
} from '@/rodada/components/pecas'
import { SecaoElementos } from '@/rodada/components/SecaoElementos'
import { SecaoPorQue } from '@/rodada/components/SecaoPorQue'
import { recortarPorSistema } from '@/rodada/domain/explicabilidade'
import { useAbaResultado } from '@/rodada/layout/abaResultado'
import { useExplicabilidadeDaCidade, useFluxo, useRunMeta } from '@/rodada/api/queries'
import { useCrumbs } from '@/rodada/state/Crumbs'
import { useTrilhaCompleta } from '@/rodada/layout/CascaResultado'
import { VAZIO, brlMi, deTotal, inteiro, ocupacaoEte, vazao } from '@/rodada/lib/formato'
import type { EteFluxo, Fluxo, NoFluxo } from '@/rodada/domain/resultado'

/**
 * Nível 3 — o sistema, que é um GRAFO e não uma tabela.
 *
 * É a única tela do pacote sem nenhum dos oito gráficos originais.
 *
 * O desenho do grafo é em colunas, e não em força/física: o escoamento tem uma
 * direção só (montante → jusante → ETE), e um layout dirigido faria o mesmo
 * sistema aparecer diferente a cada visita — num app de decisão, isso destrói a
 * memória visual de quem compara duas rodadas.
 */
export function Sistema() {
  const { runId, sistemaId } = useParams<{ runId: string; sistemaId: string }>()
  const meta = useRunMeta(runId)
  const aba = useAbaResultado()
  const fluxo = useFluxo(runId, sistemaId)
  /**
   * A explicabilidade do nível 3 vem da CIDADE e é recortada aqui — não há rota
   * de sistema, e não precisa haver: os itens já trazem `sistemaId`. Só busca
   * quando a aba pede, para o Plano não pagar por um payload que ele não usa.
   */
  const explicabilidade = useExplicabilidadeDaCidade(
    aba === 'porque' ? runId : undefined,
    aba === 'porque' ? fluxo.data?.cidadeId : undefined,
  )

  useCrumbs(
    fluxo.data
      ? [
          {
            rotulo: fluxo.data.cidadeNome,
            to: `/resultados/${runId}/cidades/${fluxo.data.cidadeId}`,
          },
          { rotulo: fluxo.data.sistemaNome },
        ]
      : [],
  )
  const trilha = useTrilhaCompleta(runId, meta.data?.nome)

  return (
    <section className="animate-fade-in">
      <Estado
        consulta={fluxo}
        rotulo="Carregando o fluxo do sistema…"
        tituloErro="Não foi possível carregar o fluxo deste sistema."
      >
        {(t) => (
          <>
            <Trilha itens={trilha} />

            <FaixaKpi
              nivel="Nível 3 · Sistema"
              titulo={t.sistemaNome}
              subtitulo={`${inteiro(t.subbacias)} sub-bacias · escoa para ${t.ete.nome}`}
              acoes={
                <>
                  <BotaoParametros meta={meta.data} />
                  <BotaoExportar />
                </>
              }
              /**
               * SEM DINHEIRO NESTE NÍVEL, de propósito. O sistema não é unidade
               * econômica — quem se paga ou não é a sub-bacia, e o CAPEX deste
               * sistema já aparece na tabela de sistemas da cidade, na linha de
               * onde a pessoa clicou para chegar aqui. A natureza do nível 3 é
               * hidráulica: capacidade, vazão, quem escoa para onde.
               */
              itens={[
                { rotulo: 'Sub-bacias', valor: inteiro(t.subbacias) },
                {
                  /* "FATURANDO" SOZINHO NÃO DIZ DE QUÊ: num
                     cabeçalho de sistema, ao lado de "Sub-bacias" e "CAPEX", o
                     gerúndio solto parece um estado do sistema, não uma
                     contagem de sub-bacias. */
                  rotulo: 'Sub-bacias com receita no plano',
                  valor: inteiro(t.faturando),
                  ajuda: 'SISTEMA_FATURANDO',
                },
                {
                  /* "OCUPAÇÃO" descrevia o número sem dizer a conta (item 20).
                     "Uso da capacidade" já sugere a razão entre duas grandezas,
                     e a fórmula inteira vive no verbete. */
                  rotulo: 'Uso da capacidade da ETE',
                  valor: <ValorOcupacao pct={t.ete.ocupacaoPct} />,
                  ajuda: 'OCUPACAO_ETE',
                },
              ]}
              rodape={
                <>
                  <ItemRodape rotulo="Capacidade" valor={vazao(t.ete.capacidade)} />
                  <ItemRodape rotulo="Vazão conectada" valor={vazao(t.ete.vazaoConectada)} />
                  <ItemRodape rotulo="Não atendida" valor={vazao(t.ete.vazaoNaoAtendida)} />
                </>
              }
            />

            {aba === 'plano' ? (
              <>
                <TituloSecao nota="clique num nó para descer">Fluxo de escoamento</TituloSecao>
                <Diagrama fluxo={t} runId={runId} />

                <div className="mt-4">
                  <TabelaSubBacias nos={t.nos} sistemaNome={t.sistemaNome} runId={runId} />
                </div>

                <SecaoElementos anos={t.elementosPorAno} />
              </>
            ) : (
              explicabilidade.data && (
                <SecaoPorQue
                  dados={recortarPorSistema(explicabilidade.data, t.sistemaId, t.subbacias)}
                  runId={runId}
                  titulo="Sub-bacias deste sistema fora do plano"
                />
              )
            )}
          </>
        )}
      </Estado>
    </section>
  )
}

/**
 * A TABELA DE SUB-BACIAS, COM OS COMPONENTES DE CADA UMA — todos eles,
 * construídos ou não.
 *
 * NÃO BASTA a contagem ("5") nem o par parte/total ("2 de 5"): os dois dizem
 * QUANTOS entraram, não QUAIS. E o denominador engana, porque não é fixo — a
 * ficha de uma sub-bacia tem os componentes que ela tem (4, 2 e 2 no mesmo
 * sistema), não sempre cinco.
 *
 * LINHA EXPANSÍVEL, e não colunas por componente: a matriz de cinco colunas
 * mostraria tudo de uma vez, mas alargaria a tabela para além do cartão e não
 * teria onde pôr quantidade, CAPEX e ano de cada componente — que é o que
 * transforma "não construída" em algo acionável ("não construída, e custaria
 * R$ 1,9 Mi"). O clique paga por si: quem quer comparar sub-bacias fica na
 * linha de cima; quem quer entender uma abre uma.
 *
 * O ESTADO É LOCAL E POR ID, e não um "único aberto": comparar dois componentes
 * de duas sub-bacias vizinhas é o gesto que motivou o pedido, e um acordeão
 * exclusivo fecharia a primeira ao abrir a segunda.
 */
function TabelaSubBacias({
  nos,
  sistemaNome,
  runId,
}: {
  nos: NoFluxo[]
  sistemaNome: string
  runId: string | undefined
}) {
  const [abertas, setAbertas] = useState<Set<string>>(new Set())

  const alternar = (id: string) =>
    setAbertas((atual) => {
      const novo = new Set(atual)
      if (novo.has(id)) novo.delete(id)
      else novo.add(id)
      return novo
    })

  return (
    <Cartao tabela titulo="Sub-bacias do sistema" nota="clique na linha para ver os componentes">
      <div className="max-h-[420px] min-w-0 overflow-auto">
        <table>
          <caption className="sr-only">Sub-bacias do sistema {sistemaNome}</caption>
          <thead>
            <tr>
              <th scope="col" className="w-8">
                <span className="sr-only">Expandir</span>
              </th>
              <th scope="col">Sub-bacia</th>
              <th scope="col" data-r>
                Vazão
              </th>
              <th scope="col" data-r>
                Componentes no plano
              </th>
              <th scope="col" data-r>
                CAPEX
              </th>
            </tr>
          </thead>
          <tbody>
            {nos.map((n) => {
              const aberta = abertas.has(n.id)
              const noPlano = n.componentes.filter(
                (c) => c.situacao === 'construida' || c.situacao === 'terceiro',
              ).length
              return (
                <Fragment key={n.id}>
                  <tr
                    onClick={() => alternar(n.id)}
                    className="cursor-pointer"
                    data-sel={aberta ? '1' : undefined}
                  >
                    <td className="pr-0">
                      {/* Um `<button>` de verdade, e não só a linha clicável: a
                          linha inteira reage ao clique por conveniência, mas o
                          teclado precisa de um alvo com nome e estado. */}
                      <button
                        type="button"
                        aria-expanded={aberta}
                        aria-label={`${aberta ? 'Recolher' : 'Expandir'} os componentes de ${n.id}`}
                        onClick={(e) => {
                          e.stopPropagation()
                          alternar(n.id)
                        }}
                        className="grid h-6 w-6 place-items-center rounded-md text-ink-water transition-colors duration-hover ease-saida hover:bg-ink-100 hover:text-ink-600"
                      >
                        <CaretRight
                          weight="bold"
                          className={`text-[10px] transition-transform duration-hover ease-saida ${
                            aberta ? 'rotate-90' : ''
                          }`}
                        />
                      </button>
                    </td>
                    <td>
                      <CelulaLink to={`/resultados/${runId}/sub-bacias/${n.id}`}>{n.id}</CelulaLink>
                      {n.tipo === 'cts' && (
                        <span className="ml-1.5 font-mono text-[9.5px] uppercase tracking-wide text-aegea-700">
                          cts
                        </span>
                      )}
                      {!n.fatura && (
                        <span className="ml-1.5 text-[10px] text-ink-water">não fatura</span>
                      )}
                    </td>
                    <td data-m>{vazao(n.vazao)}</td>
                    <td data-m>{deTotal(noPlano, n.componentes.length)}</td>
                    <td data-m>{brlMi(n.componentes.reduce((s, c) => s + c.capex, 0))}</td>
                  </tr>

                  {aberta && (
                    <tr>
                      {/* `colSpan` cobre a tabela inteira: a lista aninhada tem
                          colunas próprias (quantidade, ano) que não existem na
                          de cima, e encaixá-la nas mesmas cinco colunas faria
                          uma delas significar duas coisas diferentes. */}
                      <td colSpan={5} className="!py-0">
                        <ComponentesDaSubBacia no={n} runId={runId} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </Cartao>
  )
}

/**
 * TODOS os componentes de uma sub-bacia — construídos ou não, e é esse "ou não"
 * que o comentário da Aegea pediu.
 *
 * Ordenados pela ORDEM DO ESCOAMENTO (montante → jusante), e não por CAPEX ou
 * por situação: a ficha de uma sub-bacia é uma cadeia física, e ler ligação →
 * rede → tronco → EEE → linha de recalque é o que permite ver ONDE a cadeia
 * parou. Ordenar por dinheiro embaralharia justamente essa leitura.
 */
function ComponentesDaSubBacia({ no, runId }: { no: NoFluxo; runId: string | undefined }) {
  const ordenados = useMemo(
    () =>
      [...no.componentes].sort(
        (a, b) => posicaoNaCadeia(a.nome) - posicaoNaCadeia(b.nome),
      ),
    [no.componentes],
  )

  if (ordenados.length === 0) {
    return (
      <p className="py-3 text-[11.5px] text-ink-water">
        Esta sub-bacia não tem componente de obra cadastrado na ficha — não é filtro, é ausência
        de dado.
      </p>
    )
  }

  return (
    <div className="my-1 overflow-hidden rounded-xl border border-ink-200 bg-ink-50">
      <table className="!bg-transparent">
        <caption className="sr-only">Componentes de {no.id}</caption>
        <thead>
          <tr>
            <th scope="col">Componente</th>
            <th scope="col">Obra</th>
            <th scope="col">Situação</th>
            <th scope="col" data-r>
              Quantidade
            </th>
            <th scope="col" data-r>
              CAPEX
            </th>
            <th scope="col" data-r>
              Início
            </th>
          </tr>
        </thead>
        <tbody>
          {ordenados.map((c) => (
            <tr key={c.obraId ?? c.nome}>
              <td className="text-[12.5px]">{c.nome}</td>
              <td>
                {/* `obraId` nulo é elemento SEM obra: existe na topologia e não
                    gera CAPEX. Prometer um link que dá 404 é pior que não
                    prometer nenhum — a mesma regra do contrato §3.8. */}
                {c.obraId ? (
                  <CelulaLink to={`/resultados/${runId}/obras/${c.obraId}`}>
                    <span className="font-mono text-[11.5px]">{c.obraId}</span>
                  </CelulaLink>
                ) : (
                  <span className="text-[11px] text-ink-water">{VAZIO}</span>
                )}
              </td>
              <td>
                <ChipSituacao situacao={c.situacao} />
              </td>
              <td data-m>
                {c.quantidade == null
                  ? VAZIO
                  : `${inteiro(c.quantidade)}${c.unidade ? ` ${c.unidade}` : ''}`}
              </td>
              <td data-m>{brlMi(c.capex)}</td>
              {/* Sem ano de início a obra não entrou no plano — e o traço aqui
                  é a mesma informação que o chip de situação ao lado, dita pela
                  ausência em vez de por um rótulo. */}
              <td data-m>{c.anoInicio ?? VAZIO}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * A posição de um componente na cadeia de escoamento. Componente fora da lista
 * canônica vai para o fim, em vez de estourar — o cadastro pode ganhar um tipo
 * novo antes desta tela saber dele.
 */
const CADEIA = [
  'Ligação de esgoto',
  'Rede coletora',
  'Coletor de tempo seco',
  'Tronco',
  'EEE',
  'Linha de recalque',
  'ETE',
  'ETE (módulo)',
]

function posicaoNaCadeia(nome: string): number {
  const i = CADEIA.indexOf(nome)
  return i < 0 ? CADEIA.length : i
}

/**
 * Componentes que representam TRANSPORTE, e nunca sub-bacia — a mesma lista
 * canônica de `domain/resultado.ts`, só que usada aqui para decidir o PAPEL de
 * um nó no desenho: quem tem um destes construído (ou de terceiro) na própria
 * ficha é um nó de junção — Tronco, EEE ou Linha de recalque —, e não uma
 * sub-bacia comum.
 */
const COMPONENTES_TRANSPORTE = ['Tronco', 'EEE', 'Linha de recalque']

interface NoGrafo extends NoFluxo {
  /** Distância até a ETE, contando saltos de `jusante` — 1 = liga direto nela. */
  nivel: number
  papel: 'subbacia' | 'transporte'
  /** Componente que define o papel, quando `papel === 'transporte'`. */
  transporte: NoFluxo['componentes'][number] | null
}

/**
 * Monta o grafo com NÍVEL DE VERDADE — distância até a ETE — e não em duas
 * colunas fixas (montante/miolo).
 *
 * Achatar em duas colunas esconde a ORDEM do escoamento, que é a própria razão
 * de existir do diagrama: uma sub-bacia que vem depois de outra aparece ao lado
 * dela. Com o nível calculado por distância, uma cadeia de N saltos abre N
 * colunas, e a sequência real fica visível mesmo quando ela é mais funda que
 * "sub-bacia → transporte → ETE".
 */
function construirGrafo(nos: NoFluxo[]): NoGrafo[] {
  const porId = new Map(nos.map((n) => [n.id, n]))
  const cache = new Map<string, number>()
  // Guarda contra ciclo no cadastro (a → b → a): sem ela a recursão trava.
  function nivel(id: string, visitando: Set<string>): number {
    if (cache.has(id)) return cache.get(id)!
    if (visitando.has(id)) return 1
    visitando.add(id)
    const no = porId.get(id)
    const jus = no?.jusante
    const n = jus && porId.has(jus) ? 1 + nivel(jus, visitando) : 1
    cache.set(id, n)
    return n
  }
  return nos.map((no) => {
    const transporte = no.componentes.find((c) => COMPONENTES_TRANSPORTE.includes(c.nome)) ?? null
    return {
      ...no,
      nivel: nivel(no.id, new Set()),
      papel: transporte ? ('transporte' as const) : ('subbacia' as const),
      transporte,
    }
  })
}

/** Um nó de transporte cujo componente não chegou a ser construído — o gargalo. */
function bloqueado(no: NoGrafo): boolean {
  return no.papel === 'transporte' && no.transporte!.situacao !== 'construida' && no.transporte!.situacao !== 'terceiro'
}

/**
 * Uma aresta (nó → jusante, ou nó → ETE) é o traçado real do escoamento.
 *
 * Ela é dada como NÃO CONSTRUÍDA quando QUALQUER ponta é um transporte
 * bloqueado — a origem (nada sai dali) ou o destino (nada chega). É a mesma
 * regra que faz duas arestas consecutivas ficarem tracejadas quando uma EEE no
 * meio do caminho não foi construída: a de antes dela E a de depois, porque a
 * água não atravessa o nó que falta.
 */
function arestaConstruida(a: NoGrafo, b: NoGrafo | null): boolean {
  return !bloqueado(a) && !(b && bloqueado(b))
}

const BOX_W = 132
const BOX_H = 50
const GAP_X = 56
const GAP_Y = 14
const PAD = 18

/**
 * O TEMPLATE DO DIAGRAMA: colunas por nível de escoamento (sub-bacias →
 * transporte → destino), espessura do traço proporcional à vazão, e tracejado
 * vermelho onde o plano não construiu o elo.
 * O rodapé de explicabilidade (quantidade e motivo da não escolha) sai calculado
 * do próprio grafo: não precisa de um campo
 * novo no contrato, porque a razão do gargalo já está na situação de cada
 * componente de transporte.
 */
function Diagrama({ fluxo, runId }: { fluxo: Fluxo; runId: string | undefined }) {
  const { nos, ete } = fluxo

  const layout = useMemo(() => {
    const grafo = construirGrafo(nos)
    const porId = new Map(grafo.map((n) => [n.id, n]))
    const maxNivel = Math.max(1, ...grafo.map((n) => n.nivel))

    const porColuna = new Map<number, NoGrafo[]>()
    for (const no of grafo) {
      const col = maxNivel - no.nivel
      porColuna.set(col, [...(porColuna.get(col) ?? []), no])
    }
    const colunaEte = maxNivel

    const maiorColuna = Math.max(1, ...[...porColuna.values()].map((l) => l.length))
    const largura = PAD * 2 + (colunaEte + 1) * BOX_W + colunaEte * GAP_X
    const altura = PAD * 2 + maiorColuna * BOX_H + Math.max(0, maiorColuna - 1) * GAP_Y

    const pos = new Map<string, { x: number; y: number }>()
    for (const [col, lista] of porColuna) {
      const faixa = lista.length * BOX_H + (lista.length - 1) * GAP_Y
      const inicio = (altura - faixa) / 2
      lista.forEach((no, i) => {
        pos.set(no.id, { x: PAD + col * (BOX_W + GAP_X), y: inicio + i * (BOX_H + GAP_Y) })
      })
    }
    const posEte = { x: PAD + colunaEte * (BOX_W + GAP_X), y: (altura - BOX_H) / 2 }

    const maxVazao = Math.max(1, ...grafo.map((n) => n.vazao))
    const arestas = grafo.map((no) => {
      const destino = no.jusante ? porId.get(no.jusante) ?? null : null
      return {
        de: no.id,
        para: destino?.id ?? null,
        construida: arestaConstruida(no, destino),
        largura: Math.max(1.5, Math.min(9, (no.vazao / maxVazao) * 9)),
      }
    })

    // Nomeia a coluna pelo que ela predominantemente contém — a leitura do
    // template ("SUB-BACIAS / TRANSPORTE / DESTINO") generalizada para
    // sistemas com mais de três saltos.
    const rotuloColuna = (col: number) => {
      if (col === colunaEte) return 'DESTINO'
      if (col === 0) return 'SUB-BACIAS'
      const lista = porColuna.get(col) ?? []
      return lista.every((n) => n.papel === 'transporte') ? 'TRANSPORTE' : 'JUSANTE'
    }
    const colunas = [...porColuna.keys()].sort((x, y) => x - y)

    // As notas de explicabilidade: um transporte bloqueado tira do jogo tudo
    // que dependia dele — e a soma da vazão presa é o número que aparece.
    const notas: string[] = []
    for (const no of grafo) {
      if (!bloqueado(no)) continue
      const presos = grafo.filter((n) => n.jusante === no.id)
      const vazaoPresa = presos.reduce((s, n) => s + n.vazao, 0)
      const quem = presos.length ? presos.map((n) => n.id).join(', ') : 'a montante deste elo'
      notas.push(
        `${quem} não ${presos.length === 1 ? 'foi atendida' : presos.length > 1 ? 'foram atendidos' : 'é atendido'} por causa do elo à jusante: ${no.transporte!.nome} (${no.id}) não entrou no plano${
          vazaoPresa > 0 ? `, e sem ela ${vazao(vazaoPresa)} não alcançam a ETE` : ''
        }.`,
      )
    }
    const folga =
      ete.capacidade != null && ete.vazaoConectada != null ? ete.capacidade - ete.vazaoConectada : null
    if (notas.length > 0 && folga !== null && folga > 0) {
      notas.push(`A ETE tem folga de ${vazao(folga)} — a capacidade não é o gargalo, o transporte é.`)
    }

    return { grafo, pos, posEte, largura, altura, arestas, colunas, rotuloColuna, notas }
  }, [nos, ete])

  const { grafo, pos, posEte, largura, altura, arestas, colunas, rotuloColuna, notas } = layout

  return (
    <Cartao titulo="Escoamento até a ETE">
      <p className="-mt-1.5 mb-3 text-[11px] leading-snug text-ink-water">
        A espessura de cada fluxo é a vazão em L/s. A leitura é da esquerda para a direita,
        montante para jusante.
      </p>
      <div className="mb-2 flex items-center justify-end gap-3">
        <LegendaConstrucao />
      </div>

      <div className="viz-root min-w-0 overflow-x-auto">
        <svg
          viewBox={`0 0 ${largura} ${altura}`}
          width="100%"
          height={altura}
          preserveAspectRatio="xMinYMid meet"
          style={{ minWidth: largura }}
          fontFamily="Manrope, system-ui, sans-serif"
          role="img"
          aria-label="Escoamento das sub-bacias até a ETE do sistema"
        >
          {[...colunas, colunas.length].map((c) => (
            <text
              key={c}
              x={PAD + c * (BOX_W + GAP_X)}
              y={10}
              fontSize={9.5}
              fontWeight={700}
              letterSpacing="0.09em"
              fill="var(--viz-ink-muted)"
              style={{ textTransform: 'uppercase' }}
            >
              {rotuloColuna(c)}
            </text>
          ))}
          {arestas.map((a) => {
            const de = pos.get(a.de)
            if (!de) return null
            const destino = a.para ? pos.get(a.para) : posEte
            if (!destino) return null
            const x1 = de.x + BOX_W
            const y1 = de.y + BOX_H / 2
            const x2 = destino.x
            const y2 = destino.y + BOX_H / 2
            const meio = (x1 + x2) / 2
            return (
              <path
                key={a.de}
                d={`M${x1},${y1} C${meio},${y1} ${meio},${y2} ${x2},${y2}`}
                fill="none"
                stroke={a.construida ? 'var(--viz-good)' : 'var(--viz-critical)'}
                strokeWidth={a.largura}
                strokeDasharray={a.construida ? undefined : '5 4'}
                strokeLinecap="round"
                opacity={a.construida ? 0.55 : 0.7}
              />
            )
          })}

          {grafo.map((no) => {
            const p = pos.get(no.id)
            if (!p) return null
            return <CaixaNo key={no.id} no={no} x={p.x} y={p.y} runId={runId} />
          })}

          <CaixaEte ete={ete} x={posEte.x} y={posEte.y} />
        </svg>
      </div>

      {notas.length > 0 && (
        <div className="mt-3 rounded-xl border border-danger/25 bg-danger/[.05] p-3">
          {notas.map((texto, i) => (
            <p
              key={i}
              className="flex gap-1.5 text-[11px] leading-snug text-ink-700 [&:not(:first-child)]:mt-1.5"
            >
              <span aria-hidden="true" className="text-danger">
                ▲
              </span>
              {texto}
            </p>
          ))}
        </div>
      )}

      <LegendaCaixas />

      <p className="mt-3 text-[10.5px] leading-relaxed text-ink-water">
        Um transporte (Tronco, EEE ou Linha de recalque) não construído tira do plano tudo o que
        dependia dele — a aresta que chega e a que sai dele ficam tracejadas.
      </p>
    </Cartao>
  )
}

/**
 * A LEGENDA DAS ARESTAS — o traço entre duas caixas.
 *
 * Sozinha ela é METADE da informação: as CAIXAS também são coloridas, por um
 * critério diferente (o papel do nó). Sem a legenda das caixas, quem lê deduz o
 * critério a partir da cor das arestas e chega quase lá — e é o "quase" que
 * produz a pergunta errada ("se o roxo é sub-bacia só de transporte, por que
 * ela foi escolhida sem rede a montante?"). Por isso as duas legendas andam
 * juntas.
 */
function LegendaConstrucao() {
  return (
    <ul className="viz-root flex items-center gap-3 text-[10.5px] text-ink-water">
      <li className="flex items-center gap-1.5">
        <span aria-hidden="true" className="h-0 w-4 border-t-2" style={{ borderColor: 'var(--viz-good)' }} />
        Construído
      </li>
      <li className="flex items-center gap-1.5">
        <span
          aria-hidden="true"
          className="h-0 w-4 border-t-2 border-dashed"
          style={{ borderColor: 'var(--viz-critical)' }}
        />
        Não construído
      </li>
    </ul>
  )
}

/** Uma amostra da caixa, com a mesma moldura que o diagrama desenha. */
function AmostraCaixa({
  cor,
  tracejada = false,
  children,
}: {
  cor: string
  tracejada?: boolean
  children: ReactNode
}) {
  return (
    <li className="flex items-center gap-1.5">
      <span
        aria-hidden="true"
        className={`h-3 w-5 shrink-0 rounded-[3px] border-[1.5px] ${tracejada ? 'border-dashed' : ''}`}
        style={{
          borderColor: `var(${cor})`,
          background: `color-mix(in srgb, var(${cor}) 8%, var(--viz-surface))`,
        }}
      />
      {children}
    </li>
  )
}

/**
 * O QUE A COR DE CADA CAIXA SIGNIFICA.
 *
 * Quatro estados, e eles não são graus da mesma coisa — dois falam do PAPEL do
 * nó no escoamento (sub-bacia comum, CTS) e dois falam da DECISÃO do plano
 * sobre o transporte que passa por ele. Por isso a legenda vem em duas frases
 * e não numa fila de quatro chips: a fila sugeriria uma escala.
 *
 * O texto de baixo é a resposta curta ao item 18. A versão longa — por que uma
 * sub-bacia pode ter só o tronco construído — vive no verbete de "Componentes
 * no plano" e, com mais detalhe, na ficha da sub-bacia.
 */
function LegendaCaixas() {
  return (
    <div className="mt-3 rounded-xl border border-ink-100 bg-ink-50 px-3.5 py-2.5">
      <ul className="viz-root flex flex-wrap items-center gap-x-4 gap-y-2 text-[10.5px] text-ink-600">
        <AmostraCaixa cor="--viz-seq-2">Sub-bacia</AmostraCaixa>
        <AmostraCaixa cor="--viz-cts">Coletor de tempo seco (CTS)</AmostraCaixa>
        <AmostraCaixa cor="--viz-good">Transporte construído</AmostraCaixa>
        <AmostraCaixa cor="--viz-critical" tracejada>
          Transporte não construído
        </AmostraCaixa>
        <AmostraCaixa cor="--viz-ete">ETE</AmostraCaixa>
      </ul>
      <p className="mt-2 border-t border-ink-200 pt-2 text-[10.5px] leading-relaxed text-ink-water">
        “Transporte” não é uma entidade à parte: é a própria sub-bacia, mostrada pelo componente
        dela que carrega a vazão de montante — tronco, EEE ou linha de recalque. O plano escolhe
        componente a componente, então uma sub-bacia pode ter só o tronco construído (ele serve às
        vizinhas) e mesmo assim não faturar, porque a rede dela não entrou.
      </p>
    </div>
  )
}

function CaixaNo({
  no,
  x,
  y,
  runId,
}: {
  no: NoGrafo
  x: number
  y: number
  runId: string | undefined
}) {
  const navigate = useNavigate()
  const quebrado = bloqueado(no)
  const cts = no.papel === 'subbacia' && no.tipo === 'cts'

  const cor = quebrado
    ? {
        fill: 'color-mix(in srgb, var(--viz-critical) 8%, var(--viz-surface))',
        stroke: 'var(--viz-critical)',
      }
    : no.papel === 'transporte'
      ? {
          fill: 'color-mix(in srgb, var(--viz-good) 8%, var(--viz-surface))',
          stroke: 'var(--viz-good)',
        }
      : cts
        ? {
            fill: 'color-mix(in srgb, var(--viz-cts) 8%, var(--viz-surface))',
            stroke: 'var(--viz-cts)',
          }
        : { fill: 'var(--viz-surface)', stroke: 'var(--viz-seq-2)' }

  /**
   * TODO NÓ MOSTRA A VAZÃO — nenhum mostra nome de componente.
   *
   * O subtítulo alternava entre duas grandezas: sub-bacia comum mostrava vazão,
   * nó de transporte mostrava "Tronco"/"EEE"/"Não construída". Lado a lado no
   * mesmo diagrama isso lia como se fossem entidades de tipos diferentes,
   * quando são todas sub-bacias — e a coluna "TRANSPORTE" já diz o papel.
   *
   * A vazão é a grandeza que o diagrama inteiro usa (é ela que dá a espessura
   * de cada fluxo), então uniformizar por ela alinha o texto ao desenho.
   *
   * O NOME DO COMPONENTE NÃO SE PERDEU: ele continua no `<title>` logo abaixo,
   * que o navegador mostra no hover, e na tabela de sub-bacias, onde a linha
   * expansível lista todos os componentes com situação e CAPEX.
   */
  const subtitulo = `${vazao(no.vazao)}${no.fatura ? '' : ' · não fatura'}`

  return (
    <g
      onClick={() => navigate(`/resultados/${runId}/sub-bacias/${no.id}`)}
      className="cursor-pointer transition-opacity duration-hover ease-saida hover:opacity-80"
    >
      <title>
        {no.id}
        {no.papel === 'transporte' ? ` · ${no.transporte!.nome}` : ''} · {vazao(no.vazao)}
      </title>
      <rect
        x={x}
        y={y}
        width={BOX_W}
        height={BOX_H}
        rx={10}
        fill={cor.fill}
        stroke={cor.stroke}
        strokeWidth={1.5}
        strokeDasharray={quebrado ? '5 4' : undefined}
      />
      <text x={x + 12} y={y + 21} fontSize={12} fontWeight={700} fill="var(--viz-ink)">
        {no.id}
      </text>
      <text x={x + 12} y={y + 36} fontSize={10} fill="var(--viz-ink-2)">
        {subtitulo}
      </text>
    </g>
  )
}

/**
 * A caixa da ETE é MAIS ALTA que as dos nós, e o centro é o mesmo.
 *
 * Ela carrega três linhas onde as outras carregam duas, e é o único nó do
 * diagrama que não é sub-bacia — a diferença de altura marca isso sem precisar
 * de mais uma cor. O deslocamento para cima mantém o CENTRO alinhado com o `y`
 * que o layout calculou, que é por onde as arestas chegam: mudar a altura sem
 * isso desalinharia todas as pontas do desenho.
 */
const BOX_H_ETE = 62

function CaixaEte({ ete, x, y }: { ete: EteFluxo; x: number; y: number }) {
  const { texto: ocupacao, inconsistente } = ocupacaoEte(ete.ocupacaoPct)
  const topo = y - (BOX_H_ETE - BOX_H) / 2

  return (
    <g>
      {/* O `<title>` guarda o texto LONGO — nome completo do sistema e o aviso
          por extenso —, que é o que não cabe na caixa mas continua sendo o que
          alguém quer ler ao parar o mouse em cima. */}
      <title>
        {ete.nome} · {vazao(ete.vazaoConectada)} de {vazao(ete.capacidade)} conectados
        {ete.ocupacaoPct !== null ? ` · ${ocupacao}` : ''}
        {inconsistente ? ' · acima de 100%: capacidade e vazão inconsistentes' : ''}
      </title>
      <rect
        x={x}
        y={topo}
        width={BOX_W}
        height={BOX_H_ETE}
        rx={10}
        fill="color-mix(in srgb, var(--viz-ete) 8%, var(--viz-surface))"
        stroke={inconsistente ? 'var(--viz-critical)' : 'var(--viz-ete)'}
        strokeWidth={2}
      />

      {/* SÓ "ETE", e não "ETE · Sistema 27 Baixada2": o nome do sistema já está
          no título da página e na trilha, e repetido aqui ele estourava a caixa
          em 30px. O nome completo continua no `<title>`. */}
      <text x={x + 12} y={topo + 19} fontSize={12} fontWeight={700} fill="var(--viz-ink)">
        ETE
      </text>

      {/* "164,0 / 6,0 L/s" no lugar de "164,0 L/s de 6,0 L/s": a unidade
          repetida custava 40px numa caixa que tem 120 úteis, e a barra já lê
          como "de" num par conectado/capacidade. */}
      <text
        x={x + 12}
        y={topo + 34}
        fontSize={10}
        fontFamily="IBM Plex Mono, monospace"
        fill="var(--viz-ink-2)"
      >
        {`${numeroVazao(ete.vazaoConectada)} / ${numeroVazao(ete.capacidade)} L/s`}
      </text>

      {ete.ocupacaoPct !== null && (
        <text
          x={x + 12}
          y={topo + 49}
          fontSize={10}
          fontWeight={inconsistente ? 700 : 400}
          fontFamily="IBM Plex Mono, monospace"
          fill={inconsistente ? 'var(--viz-critical)' : 'var(--viz-ink-2)'}
        >
          {`${ocupacao}${inconsistente ? ' ⚠' : ''}`}
        </text>
      )}
    </g>
  )
}

/** A vazão SEM a unidade — o par da ETE mostra "L/s" uma vez só, no fim. */
function numeroVazao(v: number | null | undefined): string {
  return vazao(v).replace(' L/s', '')
}
