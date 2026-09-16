import { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { MalhaMunicipal, Municipio } from '@/rodada/mapa/projecao'
import { corteDaFracao, projetar, recortarMalha } from '@/rodada/mapa/projecao'
import { COR_BRILHO, corpoDoRotulo, tintaDoRotulo } from '@/rodada/mapa/escala'
import type { TemaResultados } from '@/rodada/mapa/temaResultados'

/**
 * O MAPA DAS CIDADES DA UNIDADE, sobre o estado inteiro.
 *
 * ## DUAS RAMPAS VALIDADAS, UMA POR TEMA — não um chão fixo
 *
 * Até 30/08/2026 o chão era sempre escuro nos dois temas: a ponta clara de
 * toda rampa Aegea reprova o piso de 2:1 contra o branco, e não havia tema
 * claro de verdade para comparar. Agora há — e a solução não é "manter uma
 * ilha escura escondida"; é uma SEGUNDA rampa, escura-sobre-clara, validada
 * contra branco do mesmo jeito que a primeira foi validada contra `#050D28`.
 * O raciocínio das duas, com os números, está em `escala.ts`.
 *
 * O que este componente faz com isso: os DEGRAUS (`d.cor`) trocam de valor
 * sozinhos, via CSS var escopada por tema — nada aqui muda por causa deles. O
 * que muda aqui é o CROMO ao redor — contorno, véu, hachura, nome do
 * município — porque esse cromo é `rgba(255,255,255,…)` cravado assumindo
 * chão escuro, e precisa de um par claro para não desenhar branco sobre
 * branco. É o objeto `cromo`, logo no topo da função.
 *
 * ## TRÊS TRATAMENTOS, e a distinção entre eles é o desenho
 *
 *   CONTEXTO   município fora da unidade. Quase o chão, com fio de contorno.
 *              Existe porque as 19 cidades da 56 NÃO SÃO CONTÍGUAS — um bloco
 *              na Metropolitana e nos Lagos, outro no Noroeste, e São Francisco
 *              de Itabapoana sozinho no extremo nordeste. Soltas no vazio elas
 *              não se situam. Mostram o nome ao passar o mouse; não têm valor,
 *              cor nem clique.
 *   SEM DADO   município DA unidade que a camada atual não sabe medir.
 *              Hachurado. Não é "valor mínimo": "não sei" e "é o último da
 *              lista" são leituras opostas, e a rampa conta a segunda sozinha.
 *   COM DADO   pintado pela camada — rampa cheia nas de magnitude, parcial nas
 *              de percentual.
 *
 * ## A MALHA ENTRA POR `import()` DINÂMICO
 *
 * São ~107 kB que só esta rota usa. Importada estaticamente, o Vite a funde no
 * bundle principal e toda tela do produto — login, cadastro, histórico — passa
 * a baixar o contorno de Itaboraí.
 *
 * ## O HOVER TEM UMA SUPERFÍCIE PRÓPRIA — desde 31/08/2026
 *
 * As três otimizações abaixo (RAF na dica, memoização da geometria, filtro
 * CSS sem transição) já tiravam o pior caso — recalcular a geometria dos 19
 * municípios a cada `mousemove` — mas deixavam um problema de fundo: `sobre`
 * e `cidadeAtiva` são estado do React, e cada troca deles ainda fazia esta
 * função renderizar E RECONCILIAR os ~230 nós SVG do mapa inteiro (73
 * municípios de contexto, mais os ~140 elementos das 19 cidades da unidade),
 * quando só a cidade que ENTRA e a que SAI de destaque de fato mudam de
 * aparência.
 *
 * `CidadeUnidade`, mais abaixo, é a correção: um componente por município,
 * embrulhado em `memo`. Suas props (`d`, `med`, `caminho`, `nivel`, `cromo`)
 * são todas referências ESTÁVEIS entre um hover e outro — vêm de `useMemo`/
 * `Map.get` sobre estruturas que não mudam com o mouse —, então só as duas
 * props que de fato variam a cada evento (`ativo`, e raramente `selecionado`/
 * `comparado`) fazem `memo` deixar passar o re-render. Na prática, passar o
 * mouse por cima de uma cidade agora reconcilia 1–2 componentes, não 19. O
 * `<defs>` das linhas d'água e o grupo de CONTEXTO seguem o mesmo raciocínio,
 * só que mais simples: nenhuma das duas depende de hover, e por isso saem
 * inteiras para dentro de `useMemo` — o React nem chega a comparar os nós,
 * porque recebe a MESMA referência de array de um render para o outro.
 */

/**
 * ONDE O MUNICÍPIO CLICADO ESTÁ, em pixels da caixa do mapa.
 *
 * O cartão da cidade precisa disto para se ancorar no polígono, e só este
 * componente sabe responder: a conversão passa pela escala corrente do SVG
 * (`viewBox` × largura renderizada), que muda com o tamanho da janela e não
 * existe fora daqui. `largura`/`altura` vão junto porque quem posiciona
 * precisa grampear o cartão dentro da mesma caixa.
 */
export interface AncoraNoMapa {
  x: number
  y: number
  largura: number
  altura: number
}

export interface DadoDaCidade {
  /** A chave: o nome como `otim_cidade.cidade` devolve. */
  cidade: string
  /** O que a dica mostra — já formatado pelo dono da camada. */
  texto: string
  /** A cor do degrau, já escolhida por quem sabe qual é a escala. */
  cor: string
  /**
   * Quanto do município fica preenchido, de 0 a 1 — as camadas percentuais.
   * `undefined` nas de magnitude: elas pintam o município inteiro.
   */
  fracao?: number
  /** Elevação em unidades do `viewBox`. Negativa afunda. */
  elevacao?: number
  /** O que vai escrito DENTRO do município: a colocação ou a porcentagem. */
  rotulo?: string
  /** A cidade em destaque cresce um pouco — é a primeira do ranking. */
  destacada?: boolean
}

/** A geometria medida de um município — ver o comentário de `medidas`, abaixo. */
interface Medida {
  aneis: [number, number][][]
  topo: number
  base: number
  cx: number
  cy: number
  corpo: number
}

/**
 * O CROMO DO MAPA, por tema — tudo que NÃO é a rampa de dado em si.
 *
 * A rampa (`d.cor`) já troca de valor sozinha via CSS var escopada por
 * `.rr-noturno`/`.rr-claro` (ver `escala.ts`). O que este tipo descreve é o
 * resto: contorno, véu do "sem preenchimento", hachura do "sem dado" e o
 * nome do município — tudo assumia um chão escuro (`rgba(255,255,255,…)`)
 * porque, até o tema claro existir, o chão ERA sempre escuro.
 */
interface Cromo {
  contextoStroke: string
  hachuraFundo: string
  hachuraLinha: string
  veuFill: string
  veuStroke: string
  contornoInativo: string
  haloAtivoSombra: string
  skeleton: string
  erroBorda: string
  erroTexto: string
  nomeUnidadeFill: string
  nomeContextoFill: string
  nomeHalo: string
  dicaSeparador: string
}

export function MapaCidades({
  dados,
  cidadesDaRodada,
  aoClicar,
  cidadeAtiva,
  cidadeSelecionada,
  cidadeComparada,
  aoPairar,
  tema,
}: {
  dados: DadoDaCidade[]
  /**
   * TODAS as cidades da rodada, e não só as que a camada pintou: é por elas
   * que a malha decide quem é da unidade (`recortarMalha`). Uma camada sem
   * valor para uma cidade não pode rebaixá-la a contexto.
   */
  cidadesDaRodada: readonly string[]
  aoClicar?: (cidade: string, ancora: AncoraNoMapa) => void
  /** Realce vindo de fora — passar o mouse no ranking acende o polígono. */
  cidadeAtiva?: string | null
  /**
   * A cidade com o CARTÃO ABERTO, e ela é um realce diferente do hover.
   *
   * Sem um estado visual próprio, mover o mouse depois de abrir o cartão faz
   * perder de vista de quem o cartão fala — o halo acompanha o ponteiro e o
   * município clicado volta a parecer com os outros dezoito. O anel da
   * selecionada é permanente e mais grosso; o do hover continua sendo o halo.
   */
  cidadeSelecionada?: string | null
  /** A segunda cidade, fixada para comparação. Anel tracejado. */
  cidadeComparada?: string | null
  aoPairar?: (cidade: string | null) => void
  /** As rampas trocam de VALOR por tema (ver `escala.ts`), mas o cromo em volta
   *  delas — contorno, véu, hachura, halo, nome do município — é hardcoded
   *  aqui, e precisa saber qual tema está no ar para não desenhar branco
   *  sobre branco quando a ilha do mapa vira clara. */
  tema: TemaResultados
}) {
  const claro = tema === 'claro'
  /**
   * `cromo` É MEMOIZADO — e não recriado a cada render.
   *
   * Ele vira prop de `CidadeUnidade` (mais abaixo), e um objeto literal novo
   * a cada chamada desta função anularia o `memo` de todas as 19 cidades em
   * silêncio: `Object.is` compararia duas referências diferentes com os
   * MESMOS valores e concluiria "mudou". `useMemo` com `[claro]` garante que
   * só troca de referência quando o tema de fato troca.
   */
  const cromo = useMemo<Cromo>(
    () =>
      claro
        ? {
            contextoStroke: 'rgba(15,23,42,.15)',
            hachuraFundo: 'rgba(15,23,42,.04)',
            hachuraLinha: 'rgba(15,23,42,.22)',
            veuFill: 'rgba(15,23,42,.035)',
            veuStroke: 'rgba(15,23,42,.28)',
            contornoInativo: 'rgba(15,23,42,.30)',
            haloAtivoSombra: 'rgba(0,113,109,.35)',
            skeleton: 'bg-ink-100',
            erroBorda: 'border-ink-300',
            erroTexto: 'text-ink-500',
            nomeUnidadeFill: '#0B1637',
            nomeContextoFill: 'rgba(15,23,42,.55)',
            nomeHalo: 'rgba(255,255,255,.85)',
            dicaSeparador: 'rgba(15,23,42,.3)',
          }
        : {
            contextoStroke: 'rgba(255,255,255,.09)',
            hachuraFundo: 'rgba(255,255,255,.05)',
            hachuraLinha: 'rgba(255,255,255,.26)',
            veuFill: 'rgba(255,255,255,.05)',
            veuStroke: 'rgba(255,255,255,.34)',
            contornoInativo: 'rgba(255,255,255,.42)',
            haloAtivoSombra: 'rgba(23,227,203,.45)',
            skeleton: 'bg-white/5',
            erroBorda: 'border-white/20',
            erroTexto: 'text-white/70',
            nomeUnidadeFill: '#ffffff',
            nomeContextoFill: 'rgba(255,255,255,.5)',
            nomeHalo: 'rgba(3,20,94,.85)',
            dicaSeparador: 'rgba(255,255,255,.3)',
          },
    [claro],
  )
  const [malhaBruta, setMalha] = useState<MalhaMunicipal | null>(null)
  const [erro, setErro] = useState(false)
  // A malha do arquivo é do estado inteiro; quem diz o que é "da unidade" é a
  // rodada aberta — ver `recortarMalha`.
  const malha = useMemo(
    () => (malhaBruta ? recortarMalha(malhaBruta, cidadesDaRodada) : null),
    [malhaBruta, cidadesDaRodada],
  )
  /**
   * O realce interno é por CÓDIGO IBGE, e não por `cidade`: os municípios de
   * contexto não têm `cidade` e mesmo assim mostram o nome ao passar o mouse.
   * Chavear por `cidade` faria os 73 compartilharem o mesmo `null` e acenderem
   * todos juntos.
   */
  const [sobre, setSobre] = useState<string | null>(null)
  const caixa = useRef<HTMLDivElement>(null)
  /** Só para medir a âncora do cartão: o SVG e a caixa não têm o mesmo retângulo
   *  quando o mapa não preenche a altura disponível. */
  const svgRef = useRef<SVGSVGElement>(null)
  /**
   * A POSIÇÃO DA DICA NÃO É ESTADO DO REACT — é ref, atualizada direto no DOM.
   *
   * Ela mudava a cada pixel de `mousemove`, e `mousemove` dispara dezenas de
   * vezes por segundo. Como estado do React, cada disparo re-renderizava as 19
   * cidades inteiras — e antes da memoização de `niveis` isso incluía refazer
   * a busca binária da linha d'água nas 19, o travamento que se via ao mover o
   * mouse. Com `niveis` memoizado o custo já teria caído, mas o problema de
   * fundo continua: posição do cursor não é informação que o RESTO do mapa
   * precisa saber, só a caixinha da dica — daí ela sair do ciclo de render.
   */
  const dicaRef = useRef<HTMLDivElement>(null)
  /**
   * O QUADRO PENDENTE — o que limita `moverPonteiro` a uma leitura de layout
   * por frame, e não uma por evento.
   *
   * `mousemove` dispara muito mais rápido que 60fps num mouse comum (mais
   * ainda num de alta taxa de amostragem, 1000Hz não é raro), e cada disparo
   * chamava `getBoundingClientRect()` — uma leitura que FORÇA o navegador a
   * assentar qualquer layout pendente antes de responder. Com as transições
   * de `transform`/`clip-path` dos polígonos rodando ao mesmo tempo, isso é o
   * padrão clássico de "layout thrashing": dezenas de reflows síncronos por
   * segundo, cada um brigando com a própria transição que o hover disparou.
   * É a causa mais provável do "travando" que se sente ao passar o mouse.
   *
   * A correção não é debounce (que atrasaria a dica) nem throttle por tempo
   * (que ainda pode cair fora de sincronia com o quadro) — é agregar todos os
   * eventos de um mesmo frame num só `requestAnimationFrame`: a posição do
   * cursor sempre chega a tempo do próximo desenho, e o layout só é lido uma
   * vez por quadro, não uma vez por evento.
   */
  const quadroPendente = useRef(false)
  const ultimoPonteiro = useRef({ x: 0, y: 0 })

  const moverPonteiro = useCallback((e: { clientX: number; clientY: number }) => {
    ultimoPonteiro.current = { x: e.clientX, y: e.clientY }
    if (quadroPendente.current) return
    quadroPendente.current = true
    requestAnimationFrame(() => {
      quadroPendente.current = false
      const r = caixa.current?.getBoundingClientRect()
      if (!r || !dicaRef.current) return
      // Escrita direta no DOM: nenhum `setState`, nenhum re-render do mapa
      // inteiro. É a diferença entre "a dica anda" e "o mapa inteiro
      // recalcula a cada pixel".
      dicaRef.current.style.left = `${ultimoPonteiro.current.x - r.left}px`
      dicaRef.current.style.top = `${ultimoPonteiro.current.y - r.top}px`
    })
  }, [])
  // Os `id` do SVG são globais no documento. Dois mapas na mesma tela — que a
  // comparação de rodadas vai querer — colidiriam nos `clipPath` e um deles
  // pintaria com o recorte do outro.
  const prefixo = useId().replace(/:/g, '')

  useEffect(() => {
    let vivo = true
    import('@/rodada/mapa/municipios-56.geo.json')
      .then((m) => vivo && setMalha(m.default as unknown as MalhaMunicipal))
      .catch(() => vivo && setErro(true))
    return () => {
      vivo = false
    }
  }, [])

  const porCidade = useMemo(() => new Map(dados.map((d) => [d.cidade, d])), [dados])
  const projecao = useMemo(() => (malha ? projetar(malha.features) : null), [malha])

  /**
   * A ORDEM DE DESENHO: contexto primeiro, unidade por cima — e, dentro da
   * unidade, as levantadas por último.
   *
   * Não é preferência, é a regra de sobreposição do SVG. Rio, São Gonçalo, Magé
   * e Itaboraí se encostam: uma cidade levantada desenhada ANTES da vizinha
   * rasteira ficaria com a sombra mordida justamente onde as duas se tocam — e
   * elas se tocam sempre.
   */
  const camadas = useMemo(() => {
    const fs = malha?.features ?? []
    const daUnidade = fs.filter((f) => f.properties.naUnidade)
    daUnidade.sort((a, b) => {
      const ea = Math.abs(porCidade.get(a.properties.cidade ?? '')?.elevacao ?? 0)
      const eb = Math.abs(porCidade.get(b.properties.cidade ?? '')?.elevacao ?? 0)
      return ea - eb
    })
    return { contexto: fs.filter((f) => !f.properties.naUnidade), unidade: daUnidade }
  }, [malha, porCidade])

  /**
   * A GEOMETRIA MEDIDA de cada município da unidade — anéis projetados,
   * extensão vertical, centro do rótulo e o corpo da letra.
   *
   * Calculada uma vez por malha, e não a cada troca de camada: ela não depende
   * do dado. Só o corte da linha d'água depende, e ele é uma busca binária
   * barata sobre estes anéis.
   */
  const medidas = useMemo(() => {
    if (!projecao || !malha) return new Map<string, Medida>()
    const medir = (m: Municipio): Medida => {
      const aneis = projecao.aneisProjetados(m)
      const { topo, base } = projecao.extensaoVertical(m)
      const [cx, cy] = projecao.ancora(m)
      let area = 0
      for (const anel of aneis) {
        let s = 0
        for (let i = 0; i < anel.length - 1; i++) {
          s += anel[i][0] * anel[i + 1][1] - anel[i + 1][0] * anel[i][1]
        }
        area += Math.abs(s / 2)
      }
      return { aneis, topo, base, cx, cy, corpo: corpoDoRotulo(area) }
    }
    return new Map(
      malha.features
        .filter((f) => f.properties.naUnidade && f.properties.cidade)
        .map((f) => [f.properties.cidade as string, medir(f)]),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projecao, malha])

  /**
   * O CAMINHO SVG de cada município, montado UMA VEZ por malha.
   *
   * `projecao.caminho(m)` reconstrói a string do zero a cada chamada — e o
   * JSX a chamava direto, quatro vezes por município da unidade (contorno
   * acima do nível, recorte abaixo do nível, clipPath da linha d'água, mais o
   * `<path>` de contexto) e uma vez por município de contexto. Cerca de 150
   * remontagens de string por render, incluindo em renders disparados só pelo
   * hover — que não muda geometria nenhuma. `caminho` não depende do dado,
   * só da malha, e cabe na mesma memoização de `medidas`.
   */
  const caminhos = useMemo(() => {
    if (!projecao || !malha) return new Map<string, string>()
    return new Map(malha.features.map((f) => [f.properties.codigo, projecao.caminho(f)]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projecao, malha])

  /**
   * O NÍVEL DE CADA CIDADE, calculado UMA VEZ por troca de camada — e não a
   * cada movimento do mouse.
   *
   * `corteDaFracao` é busca binária sobre o polígono (22 iterações, com
   * recorte de todos os anéis a cada uma). Antes desta memoização, ela era
   * chamada dentro do JSX — três vezes por cidade (uma no `clipPath`, duas na
   * linha d'água) —, e o JSX roda de novo a CADA render. Como `onMouseMove`
   * atualizava estado do React a cada pixel, mover o mouse sobre o mapa
   * refazia a busca binária das 19 cidades dezenas de vezes por segundo: é
   * disso que vem o travamento. Só a POSIÇÃO do rótulo e do realce muda com o
   * hover; o nível em si só muda quando a camada muda.
   */
  const niveis = useMemo(() => {
    const mapa = new Map<string, number>()
    for (const m of camadas.unidade) {
      const chave = m.properties.cidade as string
      const med = medidas.get(chave)
      const d = porCidade.get(chave)
      if (!med) continue
      mapa.set(
        chave,
        d?.fracao == null ? med.topo : corteDaFracao(med.aneis, d.fracao, med.topo, med.base),
      )
    }
    return mapa
  }, [camadas.unidade, medidas, porCidade])

  /**
   * As cidades da rodada que a malha não conhece.
   *
   * Elas somem do mapa em silêncio — é o defeito clássico desta camada: alguém
   * cadastra uma cidade nova, o de-para de `scripts/gerar-malha-unidade.mjs`
   * não é atualizado, e a tela passa a mentir por omissão sem quebrar nada.
   */
  const semGeometria = useMemo(() => {
    if (!malha) return []
    const conhecidas = new Set(malha.features.map((f) => f.properties.cidade).filter(Boolean))
    return dados.filter((d) => !conhecidas.has(d.cidade)).map((d) => d.cidade)
  }, [malha, dados])

  /**
   * ONDE O MUNICÍPIO CLICADO ESTÁ — embrulhado em `useCallback`.
   *
   * Vira prop de `CidadeUnidade`, e a mesma razão do `cromo` acima se aplica:
   * uma função nova a cada render quebraria o `memo` das 19 cidades sozinha.
   * Os `.current` dos refs são lidos DENTRO da chamada, não na criação, então
   * `[projecao]` é a única dependência real.
   */
  const ancoraDe = useCallback(
    (m: Municipio): AncoraNoMapa => {
      const r = svgRef.current?.getBoundingClientRect()
      const b = caixa.current?.getBoundingClientRect()
      if (!r || !b || !projecao) return { x: 0, y: 0, largura: 0, altura: 0 }
      const [ax, ay] = projecao.ancora(m)
      const escala = r.width / projecao.largura
      return {
        x: r.left - b.left + ax * escala,
        y: r.top - b.top + ay * escala,
        largura: b.width,
        altura: b.height,
      }
    },
    [projecao],
  )

  /**
   * O `<defs>` DAS LINHAS D'ÁGUA — memoizado, e por isso invisível ao hover.
   *
   * Os `clipPath` de cada cidade dependem só de `niveis`/`medidas` (a camada
   * atual), nunca de `sobre`/`cidadeAtiva`. Sem este `useMemo`, os ~40 nós
   * aqui dentro eram recriados e reconciliados a cada `mousemove` só porque
   * moram no mesmo `return` da função — puro trabalho perdido. Com ele, o
   * React recebe a MESMA referência de array entre um hover e outro e nem
   * chega a olhar para dentro.
   */
  const defsLinhaDagua = useMemo(() => {
    if (!projecao) return null
    return camadas.unidade.map((m) => {
      const chave = m.properties.cidade as string
      const med = medidas.get(chave)
      const y = niveis.get(chave)
      if (!med || y == null) return null
      return (
        <g key={`d-${m.id}`}>
          {/* O retângulo que sobe — é ele que faz o preenchimento parcial. */}
          <clipPath id={`${prefixo}-n-${m.properties.codigo}`}>
            <rect
              x={0}
              y={y}
              width={projecao.largura}
              height={Math.max(0, med.base - y) + 2}
              className="transition-[y,height] duration-entrar ease-saida"
            />
          </clipPath>
          {/* A silhueta da cidade, que recorta a linha d'água: ela é uma
              reta de ponta a ponta do viewBox e sem isto cruzaria o mapa
              inteiro. */}
          <clipPath id={`${prefixo}-p-${m.properties.codigo}`}>
            <path d={caminhos.get(m.properties.codigo)} />
          </clipPath>
        </g>
      )
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projecao, camadas.unidade, medidas, niveis, caminhos, prefixo])

  /**
   * O GRUPO DE CONTEXTO — memoizado pelo mesmo motivo do `<defs>` acima.
   *
   * Nenhum dos 73 municípios fora da unidade muda de aparência com o hover:
   * eles só mostram o nome (que é desenhado à parte, em `nomeados`, lá em
   * baixo) e chamam `setSobre`/`moverPonteiro` — as duas funções ESTÁVEIS
   * entre renders. `[camadas.contexto, caminhos, cromo.contextoStroke]` cobre
   * a única coisa que de fato muda este grupo: a malha carregar, ou o tema
   * trocar.
   */
  const grupoContexto = useMemo(
    () =>
      camadas.contexto.map((m) => (
        <path
          key={m.id}
          d={caminhos.get(m.properties.codigo)}
          fill="var(--mapa-contexto)"
          stroke={cromo.contextoStroke}
          strokeWidth={0.7}
          strokeLinejoin="round"
          onMouseEnter={(e) => {
            setSobre(m.properties.codigo)
            moverPonteiro(e)
          }}
          onMouseMove={(e) => moverPonteiro(e)}
        />
      )),
    [camadas.contexto, caminhos, cromo.contextoStroke, moverPonteiro],
  )

  if (erro) {
    return (
      <div
        className={`flex min-h-[320px] items-center justify-center rounded-xl border border-dashed p-6 text-center text-sm ${cromo.erroBorda} ${cromo.erroTexto}`}
      >
        Não foi possível carregar a malha municipal.
      </div>
    )
  }
  if (!malha || !projecao) {
    return <div className={`min-h-[320px] animate-pulse rounded-xl ${cromo.skeleton}`} aria-hidden />
  }

  const codigoDaAtiva = cidadeAtiva
    ? (camadas.unidade.find((f) => f.properties.cidade === cidadeAtiva)?.properties.codigo ?? null)
    : null
  const destacado = sobre ?? codigoDaAtiva

  /**
   * Os nomes que ficam ESCRITOS mesmo sem o mouse em cima.
   *
   * Um `Set` e não um `destacado` só: com o cartão aberto e uma segunda cidade
   * fixada, há até três municípios que o leitor precisa reconhecer ao mesmo
   * tempo — e o que ele está lendo no cartão é o NOME, não a posição na malha.
   *
   * `sobre` FICA DE FORA quando ele é a fonte do destaque — e é essa exclusão
   * que resolve o nome duplicado: passar o mouse em cima do município já abre
   * a caixinha flutuante com o nome (mais abaixo, perto de `dicaRef`), e até
   * 31/08/2026 o mesmo nome também saía escrito DENTRO do polígono, porque
   * `destacado` (`sobre ?? codigoDaAtiva`) entrava direto na lista. As duas
   * leituras diziam a mesma coisa em dois lugares da tela ao mesmo tempo, sem
   * nenhuma delas acrescentar informação que a outra não tivesse.
   *
   * O gesto que o nome-no-território ainda serve — e por isso não sai de
   * vez — é o hover que vem do RANKING: passar o mouse numa linha da lista
   * acende `cidadeAtiva` sem que o mouse esteja sobre o mapa, e aí não há
   * caixinha nenhuma para duplicar. `codigoDaAtiva` some da lista só quando
   * `sobre` está preenchido (ou seja, quando a caixinha já está cobrindo o
   * mesmo nome); no hover vindo do ranking `sobre` é `null` e o nome
   * continua aparecendo — é o que ajuda a achar a cidade no mapa.
   */
  const codigoDaAtivaSemHover = sobre ? null : codigoDaAtiva
  const porCidadeParaCodigo = (nome: string | null | undefined) =>
    nome
      ? (camadas.unidade.find((f) => f.properties.cidade === nome)?.properties.codigo ?? null)
      : null
  const codigoSelecionada = porCidadeParaCodigo(cidadeSelecionada)
  const codigoComparada = porCidadeParaCodigo(cidadeComparada)
  const nomeados = [
    ...new Set(
      [codigoDaAtivaSemHover, codigoSelecionada, codigoComparada].filter(Boolean) as string[],
    ),
  ]
  const featureSobre = sobre ? malha.features.find((f) => f.properties.codigo === sobre) : undefined
  const dadoSobre = featureSobre?.properties.cidade
    ? porCidade.get(featureSobre.properties.cidade)
    : undefined

  return (
    <div className="flex flex-col gap-2">
      <div ref={caixa} className="relative">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${projecao.largura} ${projecao.altura}`}
          className="h-auto w-full overflow-visible"
          role="img"
          aria-label="Mapa das cidades da unidade, sobre o estado do Rio de Janeiro"
          onMouseLeave={() => {
            setSobre(null)
            aoPairar?.(null)
          }}
        >
          <defs>
            {/*
              Hachura para "sem dado". Um `pattern` e não um tom chapado: sobre o
              chão escuro, qualquer cinza é lido como "o degrau mais fraco de
              todos". A textura sai da escala inteira.
            */}
            <pattern
              id={`${prefixo}-semDado`}
              width="6"
              height="6"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <rect width="6" height="6" fill={cromo.hachuraFundo} />
              <line x1="0" y1="0" x2="0" y2="6" stroke={cromo.hachuraLinha} strokeWidth="1.5" />
            </pattern>
            {defsLinhaDagua}
          </defs>

          <g>{grupoContexto}</g>

          <g>
            {camadas.unidade.map((m) => {
              const chave = m.properties.cidade as string
              return (
                <CidadeUnidade
                  key={m.id}
                  m={m}
                  d={porCidade.get(chave)}
                  med={medidas.get(chave)}
                  caminho={caminhos.get(m.properties.codigo)}
                  nivel={niveis.get(chave)}
                  largura={projecao.largura}
                  ativo={destacado === m.properties.codigo}
                  selecionado={codigoSelecionada === m.properties.codigo}
                  comparado={codigoComparada === m.properties.codigo}
                  tema={tema}
                  cromo={cromo}
                  prefixo={prefixo}
                  setSobre={setSobre}
                  aoPairar={aoPairar}
                  moverPonteiro={moverPonteiro}
                  aoClicar={aoClicar}
                  ancoraDe={ancoraDe}
                />
              )
            })}
          </g>

          {/*
            O nome sai DEPOIS de todos os polígonos: desenhado junto com cada
            município, o polígono do vizinho o cobriria pela metade — e o vizinho
            aqui é literalmente o caso do Rio com São Gonçalo.
          */}
          <g className="pointer-events-none">
            {nomeados.map((codigo) => {
              const m = malha.features.find((f) => f.properties.codigo === codigo)
              if (!m) return null
              const [x, y] = projecao.ancora(m)
              const naUnidade = m.properties.naUnidade
              return (
                <text
                  key={codigo}
                  x={x}
                  y={naUnidade ? y - 16 : y}
                  textAnchor="middle"
                  fontSize={naUnidade ? 13 : 12}
                  fill={naUnidade ? cromo.nomeUnidadeFill : cromo.nomeContextoFill}
                  fontWeight={naUnidade ? 700 : 500}
                  style={{ paintOrder: 'stroke', stroke: cromo.nomeHalo, strokeWidth: 4 }}
                >
                  {m.properties.nome}
                </text>
              )
            })}
          </g>
        </svg>

        {sobre && featureSobre && (
          <div
            /* A CHAVE É O CÓDIGO DO MUNICÍPIO — e é isso que faz a troca de
               cidade REMONTAR a caixinha em vez de só trocar o texto. Sem
               `key`, o conteúdo mudava de um município para o outro no
               mesmo nó, sem transição nenhuma: qualquer folga entre o
               `mouseenter` e o commit do React aparecia como um corte seco,
               que é literalmente o "demora pra sumir e aparecer" que se
               sentia. Remontar dispara `animate-fade-in-dica` (110ms, só
               opacidade — ver `tailwind.config.js`) a cada troca, e um
               desvanecer curto disfarça a folga porque não tem um instante
               único em que precisa "chegar na hora": alguns milissegundos de
               atraso no INÍCIO de um fade continuam lendo como suave. */
            key={featureSobre.properties.codigo}
            ref={dicaRef}
            className="animate-fade-in-dica pointer-events-none absolute left-0 top-0 z-10 -translate-x-1/2 -translate-y-[calc(100%+10px)] whitespace-nowrap rounded-md border border-[#2A3D74] bg-[#0B1637] px-2.5 py-1.5 text-[12px] text-white"
            style={{ boxShadow: '0 16px 40px -12px rgba(0,0,0,.55)' }}
          >
            <span className="font-semibold">{featureSobre.properties.nome}</span>
            {/* O valor só aparece quando existe — no repouso não há o que
                dizer além do nome, e ele já está aqui em cima. Um separador
                seguido de nada seria pior que omiti-lo. */}
            {dadoSobre?.texto && (
              <>
                <span className="mx-1.5 text-white/30">·</span>
                <span className="font-mono tabular-nums text-[var(--mapa-brilho)]">
                  {dadoSobre.texto}
                </span>
              </>
            )}
          </div>
        )}
      </div>

      {semGeometria.length > 0 && (
        <p className="text-[11px] text-warning">
          Sem contorno na malha: {semGeometria.join(', ')}. Acrescente ao de-para em{' '}
          <code>scripts/gerar-malha-unidade.mjs</code> e rode o script de novo.
        </p>
      )}
    </div>
  )
}

/**
 * UM MUNICÍPIO DA UNIDADE — `memo`, e é isso que faz o hover parar de
 * reconciliar as outras dezoito.
 *
 * Todas as props que carregam GEOMETRIA (`d`, `med`, `caminho`, `nivel`,
 * `cromo`) vêm de `Map.get`/`useMemo` sobre estruturas que não mudam com o
 * mouse — a mesma referência atravessa um hover inteiro. As três únicas
 * props que legitimamente mudam a cada evento são `ativo`, e — bem mais rara
 * — `selecionado`/`comparado`. `memo` compara as duas listas e só deixa
 * passar o re-render quando alguma difere: passar o mouse por cima de uma
 * cidade agora reconcilia essa cidade e, no máximo, a que estava ativa antes
 * — não as outras dezessete.
 *
 * A condição para isto continuar valendo é a mesma que o comentário de
 * `CartaoDaCidade` já registra sobre si mesmo: nenhuma das props pode ser uma
 * função ou objeto recriado a cada render do pai. `setSobre` é um setState
 * (estável por definição), `aoPairar` é o `setAtiva` de `Bancada` (idem),
 * `moverPonteiro`/`ancoraDe` são `useCallback`, e `cromo` é `useMemo` — ver
 * os comentários de cada um, acima.
 */
const CidadeUnidade = memo(function CidadeUnidade({
  m,
  d,
  med,
  caminho,
  nivel,
  largura,
  ativo,
  selecionado,
  comparado,
  tema,
  cromo,
  prefixo,
  setSobre,
  aoPairar,
  moverPonteiro,
  aoClicar,
  ancoraDe,
}: {
  m: Municipio
  d: DadoDaCidade | undefined
  med: Medida | undefined
  caminho: string | undefined
  nivel: number | undefined
  largura: number
  ativo: boolean
  selecionado: boolean
  comparado: boolean
  tema: TemaResultados
  cromo: Cromo
  prefixo: string
  setSobre: (codigo: string | null) => void
  aoPairar?: (cidade: string | null) => void
  moverPonteiro: (e: { clientX: number; clientY: number }) => void
  aoClicar?: (cidade: string, ancora: AncoraNoMapa) => void
  ancoraDe: (m: Municipio) => AncoraNoMapa
}) {
  const chave = m.properties.cidade as string
  const dz = d?.elevacao ?? 0
  const tinta = d ? tintaDoRotulo(d.cor, tema) : null
  /**
   * A SOMBRA ERA UM `<filter>` DE SVG (`feDropShadow`), e ele
   * rasteriza na CPU a cada quadro quando o elemento que o usa
   * está em transição de `transform` — a combinação que fazia o
   * hover parecer engasgado. `drop-shadow()` em CSS é composto,
   * como o `transform`, MAS só enquanto o valor do `filter` fica
   * PARADO durante a transição — se ele também estiver na lista
   * de propriedades transicionadas, o navegador tem de interpolar
   * o efeito e voltar a rasterizar a cada quadro, exatamente o
   * custo que a troca para CSS deveria evitar.
   *
   * É por isso que `filter` NÃO entra no `transition-[...]`
   * abaixo (só ficou até 31/08/2026): o halo do hover troca de
   * `''` para `drop-shadow(...)` a cada `mouseenter`, e antes
   * disso essa troca era animada quadro a quadro — em cima da
   * leitura de layout que `moverPonteiro` já fazia a cada evento
   * (ver `quadroPendente`, em `MapaCidades`), formando exatamente o
   * tipo de esteira de trabalho síncrono que faz hover "travar".
   * Sem transição, o halo aparece/desaparece no quadro seguinte,
   * de uma vez — imperceptível a olho nu, e sem custo de
   * interpolação.
   *
   * O HALO TURQUESA no polígono ativo é o vínculo visível com a
   * linha do ranking, agora que o mapa não tem mais uma moldura
   * escura separando os dois.
   */
  const sombra = Math.abs(dz) > 2 ? 'drop-shadow(3px 7px 6px rgba(0,2,18,.62))' : ''
  const halo = ativo || selecionado ? `drop-shadow(0 0 10px ${cromo.haloAtivoSombra})` : ''
  return (
    <g
      className="cursor-pointer transition-transform duration-entrar ease-saida"
      style={{
        // `fill-box` faz o `transform-origin` ser o próprio polígono
        // e não a origem do SVG — sem isso o `scale` joga o
        // município para fora da tela.
        transformBox: 'fill-box',
        transformOrigin: 'center',
        transform: `translateY(${-dz}px) scale(${d?.destacada ? 1.06 : 1})`,
        filter: [sombra, halo].filter(Boolean).join(' ') || undefined,
      }}
      onMouseEnter={(e) => {
        setSobre(m.properties.codigo)
        aoPairar?.(chave)
        moverPonteiro(e)
      }}
      onMouseMove={(e) => moverPonteiro(e)}
      onClick={() => d && aoClicar?.(chave, ancoraDe(m))}
    >
      {/* O município ACIMA do nível: só o contorno e um véu. */}
      <path
        d={caminho}
        fill={d ? cromo.veuFill : `url(#${prefixo}-semDado)`}
        stroke={cromo.veuStroke}
        strokeWidth={0.9}
        strokeLinejoin="round"
      />
      {/* O município ABAIXO do nível, recortado. Nas camadas de
          magnitude o recorte cobre tudo, então ele pinta inteiro. */}
      {d && (
        <path
          d={caminho}
          fill={d.cor}
          clipPath={`url(#${prefixo}-n-${m.properties.codigo})`}
          className="transition-[fill] duration-entrar ease-saida"
        />
      )}
      {/* A linha d'água, no nível exato. `--mapa-brilho`, e não o
          degrau r5 da rampa: r5 é "o mais forte" na direção da
          rampa do tema atual, e essa direção INVERTE entre os dois
          temas (ver `escala.ts`) — no claro r5 é o degrau mais
          ESCURO, e uma linha escura não se destaca sobre um
          preenchimento que já é escuro. `--mapa-brilho` é o
          destaque fixo do tema, não uma posição na rampa. */}
      {d && med && d.fracao != null && d.fracao > 0.02 && d.fracao < 0.985 && (
        <line
          x1={0}
          x2={largura}
          y1={nivel}
          y2={nivel}
          stroke="var(--mapa-brilho)"
          strokeWidth={1.8}
          opacity={0.9}
          clipPath={`url(#${prefixo}-p-${m.properties.codigo})`}
          className="transition-[y1,y2] duration-entrar ease-saida"
        />
      )}
      {/* O CONTORNO PADRÃO — sempre no ar, nunca muda com o hover.
          É o que fica visível quando o anel de destaque, logo abaixo,
          desvanece. */}
      <path
        d={caminho}
        fill="none"
        stroke={cromo.contornoInativo}
        strokeWidth={0.9}
        strokeLinejoin="round"
      />
      {/* O HALO POR BAIXO DO ANEL — e ele é obrigatório, não
          acabamento. `--mapa-brilho` no tema CLARO é o mesmo teal
          da rampa: o anel da comparada, desenhado direto sobre um
          município já pintado de teal, some. Um traço mais largo
          da cor de contraste do tema por baixo garante que os dois
          anéis se leiam sobre qualquer degrau, dos dois temas. O
          tracejado é repetido idêntico para o halo acompanhar as
          lacunas em vez de virar um anel sólido. Só selecionada/
          comparada ganham este halo — são persistentes, e não
          precisam do disfarce de latência que o anel de baixo
          resolve para o hover (ver o comentário dele). */}
      {(selecionado || comparado) && (
        <path
          d={caminho}
          fill="none"
          stroke={cromo.nomeHalo}
          strokeWidth={(selecionado ? 3.2 : 2.4) + 2.4}
          strokeDasharray={comparado && !selecionado ? '5 3.5' : undefined}
          strokeLinejoin="round"
        />
      )}
      {/* O ANEL DE DESTAQUE — TRÊS ESTADOS, e eles não se somam:
          selecionada vence hover, porque enquanto o cartão está aberto a
          pergunta "de quem é este cartão?" tem precedência sobre "onde
          está meu mouse?". A comparada usa a MESMA cor, tracejada — cor
          diferente entraria em conflito com a rampa do dado, que já
          ocupa a paleta inteira.

          SEMPRE MONTADO, e a troca de estado é só `opacity` — não
          `stroke`/`strokeWidth` como era até 31/08/2026. A diferença não
          é estética: opacidade compõe (o navegador só ajusta uma camada
          já rasterizada), enquanto cor e largura de traço obrigam a
          repintar o traçado inteiro a cada troca. Isso abriu espaço para
          uma transição mais longa (`duration-hover`, 140ms) sem reintroduzir
          o custo que a troca para `duration-press` (60ms) evitava — e uma
          transição de opacidade tem uma vantagem que uma troca instantânea
          não tem: ela DISFARÇA a folga entre o clique do mouse e o commit
          do React. Um desvanecer que começa alguns milissegundos atrasado
          ainda lê como "suave"; uma troca instantânea alguns milissegundos
          atrasada lê como "travado, depois pulou". */}
      <path
        d={caminho}
        fill="none"
        stroke={COR_BRILHO}
        strokeWidth={selecionado ? 3.2 : 2.4}
        strokeDasharray={comparado && !selecionado ? '5 3.5' : undefined}
        strokeLinejoin="round"
        style={{ opacity: selecionado || comparado || ativo ? 1 : 0 }}
        className="transition-opacity duration-hover ease-saida"
      />
      {/* O RÓTULO DENTRO DO MUNICÍPIO: a colocação nas camadas de
          magnitude, a porcentagem nas de percentual. */}
      {d?.rotulo && med && tinta && (
        <text
          x={med.cx}
          y={med.cy}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={med.corpo}
          className="pointer-events-none font-mono font-semibold tabular-nums"
          style={{
            // O halo fica ATRÁS do preenchimento; sem `paint-order`
            // ele comeria metade da haste dos dígitos.
            paintOrder: 'stroke',
            strokeLinejoin: 'round',
            fill: tinta.preenche,
            stroke: tinta.halo,
            strokeWidth: Math.max(2, med.corpo / 6),
          }}
        >
          {d.rotulo}
        </text>
      )}
    </g>
  )
})
