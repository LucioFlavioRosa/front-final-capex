import { useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Estado } from '@/rodada/components/Estado'
import { BotaoExportar } from '@/rodada/components/BotaoExportar'
import {
  Cartao,
  CelulaLink,
  FaixaKpi,
  ItemRodape,
  TituloSecao,
  Trilha,
} from '@/rodada/components/pecas'
import { SecaoElementos } from '@/rodada/components/SecaoElementos'
import { useRunMeta, useTopologia } from '@/rodada/api/queries'
import { useCrumbs } from '@/rodada/state/Crumbs'
import { useTrilhaCompleta } from '@/rodada/layout/CascaResultado'
import { VAZIO, brlMi, inteiro, pct, vazao } from '@/rodada/lib/formato'
import type { EteTopologia, NoTopologia, Topologia } from '@/rodada/domain/resultado'

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
  const topo = useTopologia(runId, sistemaId)

  useCrumbs(
    topo.data
      ? [
          { rotulo: topo.data.cidadeNome, to: `/resultados/${runId}/cidades/${topo.data.cidadeId}` },
          { rotulo: topo.data.sistemaNome },
        ]
      : [],
  )
  const trilha = useTrilhaCompleta(runId, meta.data?.nome)

  return (
    <section className="animate-fade-in">
      <Estado
        consulta={topo}
        rotulo="Carregando a topologia do sistema…"
        tituloErro="Não foi possível carregar a topologia deste sistema."
      >
        {(t) => (
          <>
            <Trilha itens={trilha} />

            <FaixaKpi
              nivel="Nível 3 · Sistema"
              titulo={t.sistemaNome}
              subtitulo={`${inteiro(t.subbacias)} sub-bacias · escoa para ${t.ete.nome}`}
              acoes={<BotaoExportar />}
              itens={[
                { rotulo: 'CAPEX construído', valor: brlMi(t.capexConstruido) },
                { rotulo: 'Sub-bacias', valor: inteiro(t.subbacias) },
                { rotulo: 'Faturando', valor: inteiro(t.faturando) },
                {
                  rotulo: 'Ocupação da ETE',
                  valor: t.ete.ocupacaoPct === null ? VAZIO : pct(t.ete.ocupacaoPct),
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

            <TituloSecao nota="clique num nó para descer">Topologia de escoamento</TituloSecao>
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
              <Diagrama topologia={t} runId={runId} />
              <Cartao tabela titulo="Sub-bacias do sistema">
                <div className="max-h-[420px] min-w-0 overflow-auto">
                  <table>
                    <caption className="sr-only">Sub-bacias do sistema {t.sistemaNome}</caption>
                    <thead>
                      <tr>
                        <th scope="col">Sub-bacia</th>
                        <th scope="col" data-r>
                          Vazão
                        </th>
                        <th scope="col" data-r>
                          Componentes
                        </th>
                        <th scope="col" data-r>
                          CAPEX
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {t.nos.map((n) => (
                        <tr key={n.id}>
                          <td>
                            <CelulaLink to={`/resultados/${runId}/sub-bacias/${n.id}`}>
                              {n.id}
                            </CelulaLink>
                            {n.tipo === 'cts' && (
                              <span className="ml-1.5 font-mono text-[9.5px] uppercase tracking-wide text-aegea-700">
                                cts
                              </span>
                            )}
                            {!n.fatura && (
                              <span className="ml-1.5 text-[10px] text-ink-400">não fatura</span>
                            )}
                          </td>
                          <td data-m>{vazao(n.vazao)}</td>
                          <td data-m>{inteiro(n.componentes.length)}</td>
                          <td data-m>
                            {brlMi(n.componentes.reduce((s, c) => s + c.capex, 0))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Cartao>
            </div>

            <SecaoElementos anos={t.elementosPorAno} />
          </>
        )}
      </Estado>
    </section>
  )
}

/**
 * Componentes que representam TRANSPORTE, e nunca sub-bacia — a mesma lista
 * canônica de `domain/resultado.ts`, só que usada aqui para decidir o PAPEL de
 * um nó no desenho: quem tem um destes construído (ou de terceiro) na própria
 * ficha é um nó de junção — Tronco, EEE ou Linha de recalque —, e não uma
 * sub-bacia comum.
 */
const COMPONENTES_TRANSPORTE = ['Tronco', 'EEE', 'Linha de recalque']

interface NoGrafo extends NoTopologia {
  /** Distância até a ETE, contando saltos de `jusante` — 1 = liga direto nela. */
  nivel: number
  papel: 'subbacia' | 'transporte'
  /** Componente que define o papel, quando `papel === 'transporte'`. */
  transporte: NoTopologia['componentes'][number] | null
}

/**
 * Monta o grafo com NÍVEL DE VERDADE — distância até a ETE — em vez das duas
 * colunas fixas (montante/miolo) da primeira versão.
 *
 * A troca é a da validação de 18/08: Victor apontou que "se a bacia 3 vier
 * depois da B2, aqui não está sendo representada" — o achatamento em duas
 * colunas escondia a ORDEM do escoamento, que é a própria razão de existir do
 * diagrama. Com o nível calculado por distância, uma cadeia de N saltos abre N
 * colunas, e a sequência real fica visível mesmo quando ela é mais funda que
 * "sub-bacia → transporte → ETE".
 */
function construirGrafo(nos: NoTopologia[]): NoGrafo[] {
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
 * O template da reunião de validação de 18/08: colunas por nível de
 * escoamento (sub-bacias → transporte → destino), espessura do traço
 * proporcional à vazão, e tracejado vermelho onde o plano não construiu o elo.
 * O rodapé de explicabilidade (o mesmo pedido de Wagner — "quantidade e motivo
 * da não escolha") sai calculado do próprio grafo: não precisa de um campo
 * novo no contrato, porque a razão do gargalo já está na situação de cada
 * componente de transporte.
 */
function Diagrama({ topologia, runId }: { topologia: Topologia; runId: string | undefined }) {
  const { nos, ete } = topologia

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
      <p className="-mt-1.5 mb-3 text-[11px] leading-snug text-ink-500">
        A espessura de cada fluxo é a vazão em L/s. A leitura é da esquerda para a direita,
        montante para jusante.
      </p>
      <div className="mb-2 flex items-center justify-end gap-3">
        <LegendaConstrucao />
      </div>

      <div className="min-w-0 overflow-x-auto">
        <div
          className="mb-1.5 grid text-[9.5px] font-bold uppercase tracking-[.09em] text-ink-400"
          style={{
            gridTemplateColumns: `repeat(${colunas.length + 1}, ${BOX_W + GAP_X}px)`,
            width: largura,
          }}
        >
          {[...colunas, colunas.length].map((c) => (
            <span key={c} style={{ paddingLeft: c === 0 ? PAD : 0 }}>
              {rotuloColuna(c)}
            </span>
          ))}
        </div>

        <svg
          viewBox={`0 0 ${largura} ${altura}`}
          width={largura}
          height={altura}
          className="max-w-none"
          fontFamily="Manrope, system-ui, sans-serif"
          role="img"
          aria-label="Escoamento das sub-bacias até a ETE do sistema"
        >
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
                stroke={a.construida ? '#16a34a' : '#dc2626'}
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

      <p className="mt-3 text-[10.5px] leading-relaxed text-ink-400">
        Cada nó desce para o seu jusante; sem jusante, escoa direto para a ETE. Um transporte (Tronco,
        EEE ou Linha de recalque) não construído tira do plano tudo o que dependia dele — a aresta que
        chega e a que sai dele ficam tracejadas.
      </p>
    </Cartao>
  )
}

function LegendaConstrucao() {
  return (
    <ul className="flex items-center gap-3 text-[10.5px] text-ink-500">
      <li className="flex items-center gap-1.5">
        <span aria-hidden="true" className="h-0 w-4 border-t-2 border-success" />
        Construído
      </li>
      <li className="flex items-center gap-1.5">
        <span aria-hidden="true" className="h-0 w-4 border-t-2 border-dashed border-danger" />
        Não construído
      </li>
    </ul>
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
    ? { fill: '#fef2f2', stroke: '#dc2626', titulo: '#991b1b', sub: '#b91c1c' }
    : no.papel === 'transporte'
      ? { fill: '#f0fdf4', stroke: '#16a34a', titulo: '#14532d', sub: '#16a34a' }
      : cts
        ? { fill: '#F1FDFC', stroke: '#10908C', titulo: '#0A4A56', sub: '#10908C' }
        : { fill: '#ffffff', stroke: '#8A9CE1', titulo: '#0f172a', sub: '#64748b' }

  const subtitulo =
    no.papel === 'transporte'
      ? quebrado
        ? 'Não construída'
        : no.transporte!.nome
      : `${vazao(no.vazao)}${no.fatura ? '' : ' · não fatura'}`

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
      <text x={x + 12} y={y + 21} fontSize={12} fontWeight={700} fill={cor.titulo}>
        {no.id}
      </text>
      <text x={x + 12} y={y + 36} fontSize={10} fill={cor.sub}>
        {subtitulo}
      </text>
    </g>
  )
}

function CaixaEte({ ete, x, y }: { ete: EteTopologia; x: number; y: number }) {
  return (
    <g>
      <title>
        {ete.nome} · {vazao(ete.vazaoConectada)} de {vazao(ete.capacidade)}
        {ete.ocupacaoPct !== null ? ` · ${pct(ete.ocupacaoPct)}` : ''}
      </title>
      <rect
        x={x}
        y={y}
        width={BOX_W}
        height={BOX_H}
        rx={10}
        fill="#F1FDFC"
        stroke="#10908C"
        strokeWidth={2}
      />
      <text x={x + 12} y={y + 21} fontSize={11.5} fontWeight={700} fill="#0A4A56">
        {ete.nome}
      </text>
      <text x={x + 12} y={y + 36} fontSize={9.5} fill="#10908C">
        {ete.ocupacaoPct === null
          ? `${vazao(ete.vazaoConectada)} de ${vazao(ete.capacidade)}`
          : `${vazao(ete.vazaoConectada)} de ${vazao(ete.capacidade)} · ${pct(ete.ocupacaoPct)}`}
      </text>
    </g>
  )
}
