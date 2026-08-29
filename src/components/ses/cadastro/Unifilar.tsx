/**
 * O DESENHO DO FLUXO — a vista que fica AO LADO da tabela, na mesma aba.
 *
 * Nasceu como aba própria (item 34, pedido de 04/08/2026). Wagner perguntou onde o
 * unifilar tinha ido parar (13:27: *"sei que posso estar mudando aqui a tela um
 * pouco, mas aquele unifilar vai ficar onde?"*), Lúcio respondeu que ele era coisa
 * do resultado (13:40), e Wagner insistiu com o motivo (14:19): *"lembra que a
 * gente tinha uma validação [de topologia]? Então eu acho que essa demonstração
 * deveria estar aqui no cadastro também."* O formato saiu de Lúcio (16:50): *"criar
 * uma aba só para mostrar a representação… e daí vai lá na outra, você digita qual
 * cidade, qual sistema você quer mostrar."*
 *
 * AS DUAS ABAS VIRARAM UMA em 20/08/2026, e é a mudança que dá sentido ao resto
 * deste arquivo. O que a separação custava era exatamente o que ela prometia: quem
 * preenchia numa não via o efeito na outra, e conferir era navegar. Juntas, com o
 * desenho ao lado da grade, o efeito de escolher um destino aparece na mesma tela
 * em que ele é escolhido.
 *
 * Daí as três decisões que sobraram, e a quarta que a fusão trouxe:
 *
 *   SÓ LEITURA. Não há uma célula editável aqui. O que estiver errado se conserta
 *   na tabela ao lado — e o clique no nó leva o foco até a linha dele, o que é o
 *   "não misturar assunto" do Lúcio virado do avesso: os dois assuntos coexistem,
 *   cada um no seu lado, ligados por um clique nos dois sentidos.
 *
 *   UM SISTEMA POR VEZ, escolhido na barra de escopo acima. Não é preferência de
 *   layout: uma unidade tem dezenas de sistemas (a unidade sintética uA1 tem 17) e
 *   cada um é um fluxo de escoamento independente, que termina na própria ETE.
 *   Desenhar todos juntos seria empilhar grafos sem relação — e é por isso que
 *   "Todos os sistemas" na barra recorta a TABELA mas não desenha nada.
 *
 *   O QUE NÃO ESTÁ NO FLUXO DE ESCOAMENTO SAI DO DESENHO e vira lista. Ver
 *   `soltos` em `unifilarDoSistema`: hoje o cadastro real da unidade 56 tem 120
 *   origens e NENHUM destino escolhido, então não há uma seta para desenhar. Como
 *   caixas, seriam 18 retângulos lado a lado dizendo nada; como lista, são o recado
 *   certo — "estas ainda não têm para onde escoar".
 *
 *   O DESTAQUE ACOMPANHA A LINHA EM FOCO. Ele é um anel, e não uma cor de
 *   preenchimento, de propósito: a paleta das caixas é SEMÂNTICA (turquesa é CTS,
 *   âmbar é falta destino, vermelho é ciclo) e "onde está o cursor" não é
 *   informação sobre o dado. Pintar a caixa apagaria o que ela diz.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowsHorizontal, Path } from '@phosphor-icons/react'
import { dec } from '../../../lib/format'
import {
  type Dados,
  sistemasDoFluxo,
  unifilarDoSistema,
  type NoUnifilar,
  type UnifilarSistema,
} from '../../../domain/fluxo'

const BOX_H = 56
const GAP_Y = 50
const PAD = 22

/**
 * A CAIXA TEM DOIS PORTES, e a escolha é pela largura do nível mais cheio.
 *
 * 168px é a medida original: cabe um nome de 22 caracteres a 11,5px mais o código
 * embaixo. Ela é a certa enquanto o nível mais cheio tem até três nós.
 *
 * De quatro nós para cima, 168px deixa o grafo mais largo que qualquer coluna que
 * esta tela possa dar a ele (cinco nós pedem 988px), e a saída seria encolher o
 * SVG inteiro — o que reduz a FONTE junto: a 988→624 o nome sai a 7,2px. Com a
 * caixa estreita o mesmo grafo pede 776px, encolhe menos, e o nome sai a 9,2px.
 *
 * Ou seja: estreitar a caixa é o que troca "menos texto legível" por "texto menor
 * mas ainda legível" — e de quebra tira a rolagem lateral na largura em que a aba
 * de fato roda. O nome perde caracteres (16 em vez de 22), e é o preço explícito:
 * o nome inteiro continua no `title` da caixa e na linha da tabela ao lado.
 */
const LARGO_A_PARTIR_DE = 4
const CAIXA = {
  ampla: { w: 168, gap: 26, corte: 22 },
  estreita: { w: 132, gap: 18, corte: 16 },
} as const

/**
 * Abaixo disto o desenho não é mais legível, e quem decide o LAYOUT precisa
 * saber: exportada para o `CadastroWizard` medir se a coluna que sobra comporta
 * o desenho antes de escolher lado a lado. Ver `GAP_DAS_COLUNAS` lá.
 */
export const LARGURA_MINIMA = 460

/**
 * O QUANTO O DESENHO ACEITA ENCOLHER para caber na coluna, antes de passar a
 * rolar de lado.
 *
 * Ele fica ao lado de uma tabela de largura fixa, então a coluna dele é o que
 * sobra — e o que sobra raramente é a largura natural do grafo (um nível com 3
 * caixas já pede 600px). Até 20/08/2026 o SVG saía no tamanho natural dentro de
 * um `overflow-x-auto`: cabia, mas aparecia CORTADO na borda, e caixa cortada lê
 * como tela quebrada, não como "tem mais para o lado".
 *
 * Encolher resolve porque o SVG tem `viewBox`: ele reescala inteiro, sem perder
 * nó nenhum. O limite existe porque encolher é reduzir a FONTE junto — a 0,75 o
 * nome do nó sai a ~8,6px, que ainda se lê; abaixo disso rolar é melhor que
 * apertar os olhos.
 */
const ENCOLHIMENTO_MAXIMO = 0.75

/**
 * A largura que o desenho PEDE, e o mínimo com que ele ainda se lê.
 *
 * Exportadas porque o layout de duas colunas precisa saber quanto reservar antes
 * de decidir se cabe. Reservar um número fixo não serve: a largura depende do
 * nível mais cheio DO SISTEMA escolhido, e um sistema de cinco nós pede quase o
 * dobro de um de dois. Foi o que sobrou de arraste depois da primeira correção —
 * a coluna reservava o mínimo genérico (460) para um desenho cujo piso era 582.
 *
 * Mesma conta que o `layout` usa, e é por isso que ela mora aqui: dois lugares
 * calculando a largura do mesmo desenho é um número que vai discordar de si.
 */
export function larguraNaturalDoDesenho(uni: UnifilarSistema): number {
  const porNivel = new Map<number, number>()
  for (const no of uni.nos) porNivel.set(no.nivel, (porNivel.get(no.nivel) ?? 0) + 1)
  const maiorFaixa = Math.max(1, ...porNivel.values())
  const caixa = maiorFaixa >= LARGO_A_PARTIR_DE ? CAIXA.estreita : CAIXA.ampla
  return Math.max(LARGURA_MINIMA, maiorFaixa * caixa.w + (maiorFaixa - 1) * caixa.gap + PAD * 2)
}

/**
 * A moldura do painel em volta do SVG: `p-1` dos dois lados mais a borda de 1px.
 * Some na conta porque o que a coluna precisa comportar é o painel, não o
 * desenho — reservar só o SVG deixava 9px de rolagem, que é rolagem do mesmo
 * jeito.
 */
const CROMO_DO_PAINEL = 10

/** O mínimo que a coluna do desenho precisa ter para ele não rolar de lado. */
export function larguraMinimaDoDesenho(uni: UnifilarSistema): number {
  return Math.round(larguraNaturalDoDesenho(uni) * ENCOLHIMENTO_MAXIMO) + CROMO_DO_PAINEL
}

/**
 * QUANDO O DESENHO AINDA TRANSBORDA depois de encolher, ele precisa PARECER que
 * transborda.
 *
 * Um grafo com cinco nós num nível pede 988px, e nem a aba mais larga do cadastro
 * tem tanto para dar ao lado da tabela. Rolar de lado é a saída certa — o que
 * estava errado era o desenho terminar numa borda reta, com meia caixa cortada:
 * isso lê como tela quebrada, não como "tem mais para cá".
 *
 * O esmaecimento na borda direita é o que troca a leitura, e ele só aparece
 * quando há de fato o que ver — daí a medição em vez de um gradiente fixo.
 */
function useTransbordo(larguraNatural: number) {
  const ref = useRef<HTMLDivElement>(null)
  const [transborda, setTransborda] = useState(false)

  /**
   * DUAS COISAS mudam a resposta, e cada uma é coberta por um mecanismo:
   *
   *   a largura da COLUNA — muda com a janela, e quem avisa é o `ResizeObserver`
   *     (a caixa do container muda de tamanho).
   *   a largura do DESENHO — muda ao trocar de sistema, e o observer NÃO avisa:
   *     a caixa do container continua igual, só o conteúdo dentro dela cresceu.
   *     Daí `larguraNatural` na dependência do efeito.
   */
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const medir = () => setTransborda(el.scrollWidth > el.clientWidth + 1)
    medir()
    const ro = new ResizeObserver(medir)
    ro.observe(el)
    return () => ro.disconnect()
  }, [larguraNatural])

  return { ref, transborda }
}

/** Nome de nó cortado no que cabe na caixa — SVG não tem ellipsis. */
const cortar = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

interface Estilo {
  fill: string
  stroke: string
  tracejado?: string
  texto: string
  codigo: string
}

/**
 * A gramática visual é a das células da grade (ver `AbaCell`), e de propósito: o
 * turquesa é a CTS em toda a tela, âmbar é "falta algo", vermelho é problema. Só
 * a ETE muda de registro — ela é sólida porque é o destino, não um nó a mais.
 */
function estiloDoNo(no: NoUnifilar): Estilo {
  if (no.emCiclo) {
    return { fill: '#fef2f2', stroke: '#dc2626', texto: '#991b1b', codigo: '#b91c1c' }
  }
  if (no.tipo === 'ete') {
    return {
      fill: 'rgb(var(--color-primary))',
      stroke: 'rgb(var(--color-primary))',
      texto: '#ffffff',
      codigo: 'rgba(255,255,255,.72)',
    }
  }
  const base: Estilo =
    no.tipo === 'cts'
      ? { fill: '#F1FDFC', stroke: '#10908C', texto: '#0A4A56', codigo: '#10908C' }
      : no.tipo === 'subbacia'
        ? { fill: '#ffffff', stroke: 'rgb(var(--color-primary))', texto: '#0f172a', codigo: '#64748b' }
        // Tipo desconhecido: o código não existe em nenhuma aba de entidade. É o
        // que a validação chama de "destino que não existe" — desenhado neutro e
        // tracejado, nunca omitido.
        : { fill: '#f8fafc', stroke: '#cbd5e1', tracejado: '4 3', texto: '#475569', codigo: '#94a3b8' }

  return no.pontaSolta ? { ...base, stroke: '#d97706', tracejado: '5 4' } : base
}

const TIPO_LABEL: Record<NoUnifilar['tipo'], string> = {
  subbacia: 'Sub-bacia',
  cts: 'CTS',
  ete: 'ETE',
  desconhecido: 'Código não encontrado no cadastro',
}

/** A origem e o destino da linha em foco na tabela. */
export interface DestaqueUnifilar {
  origem: string
  destino: string
}

interface UnifilarProps {
  dados: Dados
  /**
   * O sistema escolhido na barra de escopo. `''` é "Todos os sistemas" — recorte
   * legítimo para a tabela, e nada que se possa desenhar (ver o topo do arquivo).
   */
  sistemaId: string
  destaque?: DestaqueUnifilar | null
  /** Clique numa caixa: leva o foco para a linha daquela origem, na tabela ao lado. */
  onFocarOrigem: (id: string) => void
}

export function Unifilar({ dados, sistemaId, destaque, onFocarOrigem }: UnifilarProps) {
  const { sistemas, semSistema } = useMemo(() => sistemasDoFluxo(dados), [dados])

  const sistema = sistemas.find((s) => s.id === sistemaId)

  const uni = useMemo(
    () => (sistemaId ? unifilarDoSistema(dados, sistemaId) : null),
    [dados, sistemaId],
  )

  if (!sistemas.length) {
    return (
      <Vazio>
        Nenhuma linha da tabela tem sistema ainda. É dela que este desenho nasce — o
        sistema de uma sub-bacia vem da própria linha, e o de uma CTS vem do destino
        que ela escolhe.
      </Vazio>
    )
  }

  /**
   * "TODOS OS SISTEMAS" NÃO DESENHA, e o texto diz por quê em vez de mostrar uma
   * caixa vazia. Cada sistema termina na própria ETE: empilhados, seriam grafos
   * sem relação um sobre o outro.
   */
  if (!sistemaId) {
    return (
      <Vazio>
        Escolha <strong className="font-semibold">um sistema</strong> na barra acima para ver o
        desenho. Cada sistema escoa até a ETE dele, então não há um desenho que valha para
        todos ao mesmo tempo.
      </Vazio>
    )
  }

  if (!uni) return null

  return (
    <div className="space-y-4">
      <Desenho uni={uni} destaque={destaque} onFocarOrigem={onFocarOrigem} />
      <Legenda />
      {uni.soltos.length > 0 && (
        <Soltos
          nos={uni.soltos}
          sistema={sistema?.nome || sistemaId}
          destaque={destaque}
          onFocarOrigem={onFocarOrigem}
        />
      )}

      {/* O recado das CTS sem sistema fica FORA do bloco do sistema escolhido: ele
          não é sobre o desenho, é sobre o que nenhum desenho pode conter ainda. */}
      {semSistema > 0 && (
        <p className="text-[11.5px] leading-snug text-ink-500">
          <strong className="font-semibold text-ink-700">
            {semSistema} {semSistema === 1 ? 'origem ainda não aparece' : 'origens ainda não aparecem'} em
            desenho nenhum.
          </strong>{' '}
          São CTS sem destino escolhido: o sistema de uma CTS é o do destino dela, então até a escolha
          ela não pertence a nenhum sistema. Escolher o destino na tabela já a coloca no desenho.
        </p>
      )}
    </div>
  )
}

function Vazio({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 rounded-2xl border border-ink-200 bg-ink-50 p-4">
      <Path weight="fill" className="mt-0.5 shrink-0 text-lg text-ink-400" />
      <p className="text-[12.5px] leading-snug text-ink-600">{children}</p>
    </div>
  )
}

function Desenho({
  uni,
  destaque,
  onFocarOrigem,
}: {
  uni: UnifilarSistema
  destaque?: DestaqueUnifilar | null
  onFocarOrigem: (id: string) => void
}) {
  /**
   * A escala é POR SISTEMA, e não global da unidade.
   *
   * O desenho mostra um sistema por vez, e a pergunta que ele responde é "onde
   * está o volume DENTRO deste sistema". Uma escala global faria o sistema
   * pequeno aparecer com todas as ligações no piso — verdadeiro em relação à
   * unidade, e inútil para quem está montando aquele sistema.
   */
  const espessura = useMemo(() => escalaDeVazao(uni.arestas), [uni.arestas])

  const layout = useMemo(() => {
    const porNivel = new Map<number, NoUnifilar[]>()
    for (const no of uni.nos) {
      const lista = porNivel.get(no.nivel) ?? []
      lista.push(no)
      porNivel.set(no.nivel, lista)
    }

    const maiorFaixa = Math.max(1, ...[...porNivel.values()].map((l) => l.length))
    const caixa = maiorFaixa >= LARGO_A_PARTIR_DE ? CAIXA.estreita : CAIXA.ampla
    const largura = larguraNaturalDoDesenho(uni)
    const altura = PAD * 2 + uni.niveis * BOX_H + Math.max(0, uni.niveis - 1) * GAP_Y

    const pos = new Map<string, { x: number; y: number }>()
    for (const [nivel, lista] of porNivel) {
      const faixa = lista.length * caixa.w + (lista.length - 1) * caixa.gap
      const inicio = (largura - faixa) / 2
      lista.forEach((no, i) => {
        pos.set(no.id, {
          x: inicio + i * (caixa.w + caixa.gap),
          y: PAD + (nivel - 1) * (BOX_H + GAP_Y),
        })
      })
    }
    return { pos, largura, altura, caixa }
  }, [uni])

  const { ref, transborda } = useTransbordo(layout.largura)

  if (!uni.nos.length) {
    return (
      <Vazio>
        Nenhuma linha deste sistema tem destino escolhido, então não há fluxo de escoamento para
        desenhar. O destino é a única informação da aba que não vem de fonte nenhuma — é o que a
        unidade informa.
      </Vazio>
    )
  }

  const { pos, largura, altura, caixa } = layout

  return (
    <div className="relative min-w-0">
      {transborda && (
        <>
          {/*
            O ESMAECIMENTO USA A COR EXATA DO FUNDO DO PAINEL, e não um cinza
            aproximado: ele existe para DISSOLVER a caixa cortada na borda, e um
            tom quase igual deixa a borda navy do nó aparecer nítida por baixo —
            que é justamente a leitura de "tela quebrada" que se quer evitar. Por
            isso o painel virou `bg-ink-50` sólido: com `/40` não há cor de
            gradiente que case.

            `aria-hidden` e sem captura de clique: é acabamento de leitura, não
            pode ficar entre o ponteiro e a caixa que ele cobre.
          */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-px right-px z-10 w-20 rounded-r-2xl bg-gradient-to-l from-ink-50 via-ink-50/80 to-transparent"
          />
          {/* A dica fica DENTRO da caixa, no canto de baixo: a coluna da direita é
              `overflow-y-auto` no layout de duas colunas, e qualquer coisa
              posicionada acima do topo do painel some recortada. */}
          <span className="pointer-events-none absolute bottom-2.5 right-3 z-20 inline-flex items-center gap-1 rounded-full border border-ink-200 bg-white/90 px-2 py-0.5 text-[10.5px] font-medium text-ink-500 shadow-sm">
            <ArrowsHorizontal weight="bold" className="text-[11px]" />
            arraste para ver o resto
          </span>
        </>
      )}
      <div
        ref={ref}
        className="min-w-0 overflow-x-auto rounded-2xl border border-ink-200 bg-ink-50 p-1"
      >
      {/*
        `w-full` + `h-auto` + `viewBox` é o que faz o desenho CABER na coluna em
        vez de vazar dela. Os dois limites em volta são o que impede os dois
        excessos: `maxWidth` para um sistema de dois nós não esticar até 900px e
        virar caricatura, `minWidth` para um sistema largo não encolher além do
        legível — daí para baixo o container rola, como antes.
      */}
      <svg
        viewBox={`0 0 ${largura} ${altura}`}
        className="h-auto w-full"
        style={{ minWidth: Math.round(largura * ENCOLHIMENTO_MAXIMO), maxWidth: largura }}
        fontFamily="Manrope, system-ui, sans-serif"
        role="img"
        aria-label="Representação unifilar do fluxo de escoamento do sistema"
      >
        {/* SEM PONTA DE SETA. O desenho é estritamente de cima para baixo — o
            nível de cada caixa vem da ordenação topológica, e toda ligação desce
            —, então a direção já está dita pelo layout. Numa linha fina a seta
            ajudava; num cano de 11px ela vira um bico deformado na juntada. */}
        {uni.arestas.map((a) => {
          const largura = espessura ? espessura.largura(a.vazao) : 3
          const cor = espessura ? espessura.cor(a.vazao) : COR_SEM_DADO
          const de = pos.get(a.de)
          const para = pos.get(a.para)
          if (!de || !para) return null
          // A ligação em foco é a que a célula "destino" daquela linha acabou de
          // escolher — o dado que está sendo editado agora.
          const focada = !!destaque && a.de === destaque.origem && a.para === destaque.destino
          const x1 = de.x + caixa.w / 2
          const y1 = de.y + BOX_H
          const x2 = para.x + caixa.w / 2
          const y2 = para.y
          const meio = (y1 + y2) / 2
          const curva = `M${x1},${y1} C${x1},${meio} ${x2},${meio} ${x2},${y2}`
          return (
            <g key={`${a.de}->${a.para}`}>
              {/* A CAMISA DO CANO. Dois traços na mesma curva: este, mais largo e
                  na cor do painel, e o de cima com a cor da vazão. Serve para o
                  cruzamento — sem ele, dois canos que se cruzam viram uma mancha
                  só e não dá para seguir nenhum dos dois com o olho. É o mesmo
                  recurso de mapa de metrô. Em foco a camisa vira navy, e aí ela
                  também é o anel de seleção. */}
              <path
                d={curva}
                fill="none"
                stroke={focada ? 'rgb(var(--color-primary))' : '#f8fafc'}
                strokeWidth={largura + (focada ? 5 : 3.5)}
                strokeLinecap="round"
              />
            <path
              d={curva}
              fill="none"
              stroke={cor}
              strokeWidth={largura}
              strokeLinecap="round"
            >
              {/* O número por trás da espessura. Espessura ordena; só o valor
                  responde "quanto", e o desenho não tem espaço para rotular
                  toda ligação. */}
              <title>
                {/* A QUANTIDADE VEM PRIMEIRO, e os códigos depois. É a ordem
                    útil — o desenho já mostra QUEM liga a quem, e o que ele não
                    consegue dizer é QUANTO. E evita que o texto do balão comece
                    com um código: consulta ancorada por id passava a encontrar
                    a ligação além da caixa, o que já quebrou um teste de tela. */}
                {a.vazao == null
                  ? 'Vazão ainda não preenchida'
                  : `${dec(a.vazao, 1)} L/s passando por aqui`}
                {` · ${a.de} → ${a.para}`}
              </title>
            </path>
            </g>
          )
        })}

        {uni.nos.map((no) => {
          const p = pos.get(no.id)
          if (!p) return null
          const e = estiloDoNo(no)
          const focado = destaque?.origem === no.id
          const titulo = `${TIPO_LABEL[no.tipo]} · ${no.nome || no.id}${
            no.pontaSolta ? ' — sem destino declarado' : ''
          }${no.emCiclo ? ' — cadeia que volta sobre si mesma' : ''} · clique para ir à linha na tabela`
          return (
            <g
              key={no.id}
              onClick={() => onFocarOrigem(no.id)}
              className="cursor-pointer transition-[filter] duration-hover ease-saida hover:[filter:drop-shadow(0_4px_8px_rgba(15,23,42,.16))]"
            >
              <title>{titulo}</title>
              {/* O ANEL DE FOCO É UM RETÂNGULO A MAIS, por fora — nunca uma troca
                  de `fill` ou de `stroke` da caixa: esses dois carregam a
                  semântica do nó (ver `estiloDoNo`), e sobrescrevê-los apagaria
                  "é CTS" ou "está em ciclo" justamente na linha que se está
                  editando. */}
              {focado && (
                <rect
                  x={p.x - 4}
                  y={p.y - 4}
                  width={caixa.w + 8}
                  height={BOX_H + 8}
                  rx={16}
                  fill="none"
                  stroke="rgb(var(--color-primary))"
                  strokeWidth={2.5}
                  opacity={0.5}
                />
              )}
              <rect
                x={p.x}
                y={p.y}
                width={caixa.w}
                height={BOX_H}
                rx={12}
                fill={e.fill}
                stroke={e.stroke}
                strokeWidth={no.tipo === 'ete' ? 2 : 1.5}
                strokeDasharray={e.tracejado}
              />
              <text x={p.x + 14} y={p.y + 23} fontSize={11.5} fontWeight={700} fill={e.texto}>
                {cortar(no.nome || no.id, caixa.corte)}
              </text>
              <text
                x={p.x + 14}
                y={p.y + 40}
                fontSize={9.5}
                fontFamily="'IBM Plex Mono', monospace"
                fill={e.codigo}
              >
                {no.id}
                {no.tipo === 'ete' ? ' · ETE' : no.tipo === 'cts' ? ' · CTS' : ''}
              </text>
              {(no.pontaSolta || no.emCiclo) && (
                <>
                  <circle
                    cx={p.x + caixa.w - 13}
                    cy={p.y + 13}
                    r={7.5}
                    fill={no.emCiclo ? '#dc2626' : '#d97706'}
                  />
                  <text
                    x={p.x + caixa.w - 13}
                    y={p.y + 17}
                    fontSize={10}
                    fontWeight={800}
                    fill="#fff"
                    textAnchor="middle"
                  >
                    !
                  </text>
                </>
              )}
            </g>
          )
        })}
        </svg>
      </div>
    </div>
  )
}

/**
 * AS LIGAÇÕES SÃO CANOS, e o cano diz quanta água passa por ele.
 *
 * Duas codificações do MESMO número, de propósito: a espessura e a cor. Chama-se
 * codificação redundante, e não é desperdício — a espessura ordena bem quando as
 * linhas estão lado a lado, e a cor sobrevive quando estão longe uma da outra ou
 * quando a diferença de largura é pequena demais para o olho.
 *
 * A RAMPA É A SEQUENCIAL DA CASA (`--viz-seq-1..5`, azul claro → azul de marca),
 * a mesma que o resto do produto usa para magnitude. Uma matiz só, do claro ao
 * escuro: é a regra de escala sequencial, e arco-íris aqui inventaria categorias
 * onde só existe "mais" e "menos".
 *
 * NÃO HÁ MAIS TRACEJADO. A vazão desconhecida virava linha pontilhada, e o
 * pontilhado disputava atenção com o desenho e ainda parecia defeito. Ela agora é
 * um cano CINZA, cheio, na largura do piso: fora da rampa azul, ninguém o
 * confunde com pouca vazão — e é a mesma leitura sem o ruído.
 *
 * LINEAR na largura (convenção de diagrama de fluxo). O piso de 2px existe para
 * o cano pequeno continuar clicável; o teto de 11px porque acima disso ele
 * compete com as caixas.
 */
const CANO_MIN = 2
const CANO_MAX = 11
const CANO_SEM_DADO = 2.5
/** A rampa sequencial da casa — `--viz-seq-1..5` em `index.css`. */
const RAMPA = ['#b8c3ed', '#8a9ce1', '#5c75d5', '#2e4ec9', '#01209b']
/** Fora da rampa de propósito: "não sei" não é um degrau de "quanto". */
const COR_SEM_DADO = '#cbd5e1'

interface EscalaDoCano {
  largura: (v: number | null) => number
  cor: (v: number | null) => string
}

function escalaDeVazao(arestas: { vazao: number | null }[]): EscalaDoCano | null {
  const conhecidas = arestas.map((a) => a.vazao).filter((v): v is number => v != null && v > 0)
  if (!conhecidas.length) return null
  const min = Math.min(...conhecidas)
  const max = Math.max(...conhecidas)
  /** 0 quando é a menor vazão do sistema, 1 quando é a maior. */
  const posicao = (v: number) => (max === min ? 0.5 : (v - min) / (max - min))
  return {
    largura: (v) => (v == null || v <= 0 ? CANO_SEM_DADO : CANO_MIN + posicao(v) * (CANO_MAX - CANO_MIN)),
    cor: (v) =>
      v == null || v <= 0
        ? COR_SEM_DADO
        : RAMPA[Math.min(RAMPA.length - 1, Math.round(posicao(v) * (RAMPA.length - 1)))],
  }
}

function Legenda() {
  const itens = [
    { cor: 'rgb(var(--color-primary))', fundo: '#ffffff', texto: 'Sub-bacia' },
    { cor: '#10908C', fundo: '#F1FDFC', texto: 'CTS' },
    { cor: 'rgb(var(--color-primary))', fundo: 'rgb(var(--color-primary))', texto: 'ETE (destino final)' },
    { cor: '#d97706', fundo: '#ffffff', texto: 'sem destino declarado', tracejado: true },
    { cor: '#dc2626', fundo: '#fef2f2', texto: 'cadeia que volta sobre si mesma' },
  ]
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {itens.map((i) => (
        <li key={i.texto} className="flex items-center gap-1.5 text-[11px] text-ink-500">
          <span
            className="h-[11px] w-[16px] rounded-[3px]"
            style={{
              background: i.fundo,
              border: `1.5px ${i.tracejado ? 'dashed' : 'solid'} ${i.cor}`,
            }}
          />
          {i.texto}
        </li>
      ))}

      {/* O CANO É UMA CODIFICAÇÃO, e codificação sem legenda é ornamento: quem
          não sabe que o cano grosso e escuro quer dizer mais vazão lê o desenho
          como estilo. A amostra mostra a rampa inteira, do menor ao maior do
          SISTEMA — a escala é relativa a ele, não à unidade. */}
      <li className="flex items-center gap-1.5 text-[11px] text-ink-500">
        <span className="inline-flex items-center gap-[2px]" aria-hidden="true">
          {RAMPA.map((c, i) => (
            <span
              key={c}
              className="rounded-full"
              style={{ background: c, width: 6, height: 2 + i * 2 }}
            />
          ))}
        </span>
        cano = vazão que passa (do menor ao maior do sistema)
      </li>
      <li className="flex items-center gap-1.5 text-[11px] text-ink-500">
        <span
          className="rounded-full"
          style={{ background: COR_SEM_DADO, width: 16, height: 2.5 }}
          aria-hidden="true"
        />
        sem vazão informada
      </li>
    </ul>
  )
}

/**
 * As origens que não entram em fluxo de escoamento nenhum — nem recebem, nem escoam.
 *
 * Lista, e não caixa no desenho: ver o comentário no topo do arquivo. O clique leva
 * o foco para a linha, que é onde o destino se escolhe — a única coisa que resolve.
 */
function Soltos({
  nos,
  sistema,
  destaque,
  onFocarOrigem,
}: {
  nos: NoUnifilar[]
  sistema: string
  destaque?: DestaqueUnifilar | null
  onFocarOrigem: (id: string) => void
}) {
  const MOSTRAR = 24
  const extras = nos.length - MOSTRAR

  return (
    <div className="rounded-2xl border border-warning/25 bg-warning/[.06] p-4">
      <h3 className="text-[12.5px] font-bold tracking-tight text-ink-900">
        {nos.length} fora do fluxo de escoamento de {sistema}
      </h3>
      <p className="mt-0.5 text-[11.5px] leading-snug text-ink-600">
        Não escoam para lugar nenhum e nada escoa para elas. Enquanto ficarem assim, não entram em
        nenhum caminho até a ETE — a obra delas entra no CAPEX e a receita nunca vem.
      </p>
      <ul className="mt-2.5 flex flex-wrap gap-1.5">
        {nos.slice(0, MOSTRAR).map((no) => {
          const focado = destaque?.origem === no.id
          return (
            <li key={no.id}>
              <button
                type="button"
                onClick={() => onFocarOrigem(no.id)}
                title={`${TIPO_LABEL[no.tipo]} · ir à linha para escolher o destino`}
                className={`rounded-lg border bg-white px-2 py-1 text-[11px] text-ink-700 transition-colors duration-hover ease-saida hover:border-warning hover:bg-warning/10 ${
                  focado ? 'border-water-600 ring-2 ring-water-600/30' : 'border-warning/40'
                }`}
              >
                <span className="font-mono text-[10px] text-ink-500">{no.id}</span>{' '}
                {cortar(no.nome || '', 18)}
              </button>
            </li>
          )
        })}
        {extras > 0 && (
          <li className="self-center text-[11px] text-ink-500">e mais {extras}</li>
        )}
      </ul>
    </div>
  )
}
