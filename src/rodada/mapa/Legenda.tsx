import { NEGATIVO, COR_ZERO, RAMPA } from '@/rodada/mapa/escala'
import type { Camada } from '@/rodada/mapa/camadas'
import type { TemaResultados } from '@/rodada/mapa/temaResultados'

/**
 * A RÉGUA DO MAPA. Sem ela a cor é decorativa: bonita e ilegível.
 *
 * Uma legenda por FORMA, e não uma que se adapta: a rampa de magnitude precisa
 * mostrar os degraus e as duas pontas da faixa, e a de percentual precisa
 * mostrar o que o preenchimento parcial significa. São dois desenhos, e um
 * componente que tentasse ser os dois seria um `if` com dois corpos de qualquer
 * jeito — só que espalhado no meio do JSX em vez de declarado no topo.
 *
 * O QUE AS DUAS COMPARTILHAM é o rodapé com os dois estados que cor nenhuma
 * cobre. Ele fica fora do `if` porque eles existem em toda camada, e esquecê-lo
 * numa delas faria o mesmo mapa significar coisas diferentes conforme a métrica
 * escolhida.
 *
 * `tema` existe porque esta legenda mora dentro da ilha do mapa (`.rr-ilha-mapa`),
 * e a ilha só é escura no tema escuro — no claro ela é branca, e todo
 * `text-white`/`border-white` daqui viraria texto branco sobre fundo branco.
 */
export function Legenda({
  camada,
  faixa,
  semValor = false,
  tema,
}: {
  camada: Camada
  faixa: { min: number; max: number }
  /** Nenhuma cidade tem valor: sem régua, e a legenda diz por quê. */
  semValor?: boolean
  tema: TemaResultados
}) {
  const claro = tema === 'claro'
  const tintaMuda = claro ? 'text-ink-500' : 'text-white/55'
  const tintaMaisMuda = claro ? 'text-ink-400' : 'text-white/40'
  const bordaSuave = claro ? 'border-ink-200' : 'border-white/15'
  const bordaMenosSuave = claro ? 'border-ink-300' : 'border-white/25'
  return (
    <div className={`mt-3 flex flex-col gap-2 text-[11px] ${tintaMuda}`}>
      {camada.forma === 'repouso' ? (
        <LegendaRepouso bordaSuave={bordaSuave} tintaMaisMuda={tintaMaisMuda} />
      ) : semValor ? (
        // Régua nenhuma: uma faixa `0 … 0` afirmaria uma medida que não existe.
        <p className={tintaMaisMuda}>
          Esta rodada não publicou {camada.rotulo.toLowerCase()} por cidade — nenhum município
          tem este dado.
        </p>
      ) : camada.forma === 'percentual' ? (
        <LegendaNivel claro={claro} tintaMaisMuda={tintaMaisMuda} />
      ) : (
        <LegendaMagnitude camada={camada} faixa={faixa} tintaMaisMuda={tintaMaisMuda} />
      )}
      {camada.forma !== 'repouso' && (
        <OsDoisEstados claro={claro} bordaSuave={bordaSuave} bordaMenosSuave={bordaMenosSuave} />
      )}
    </div>
  )
}

/**
 * Magnitude: os cinco degraus, as pontas da faixa, e o aviso de que a altura
 * não é quantidade.
 *
 * Esse último é obrigatório, não cortesia. A elevação é a coisa mais chamativa
 * da tela, e sem a legenda dizendo o que ela codifica o leitor vai supor que é
 * proporcional ao valor — que é exatamente o que ela NÃO é.
 */
function LegendaMagnitude({
  camada,
  faixa,
  tintaMaisMuda,
}: {
  camada: Camada
  faixa: { min: number; max: number }
  tintaMaisMuda: string
}) {
  const passos: string[] = camada.divergente
    ? [...[...NEGATIVO].reverse(), COR_ZERO, ...RAMPA]
    : [...RAMPA]
  // Com `inverter`, a ponta forte da rampa é o MENOR valor — ver o comentário
  // de `inverter` em `camadas.ts`. Trocar a cor e deixar os rótulos no lugar
  // produziria uma legenda que mente com precisão.
  const [esquerda, direita] = camada.inverter
    ? [faixa.max, faixa.min]
    : [faixa.min, faixa.max]
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <span className="shrink-0 font-mono tabular-nums">{camada.escala(esquerda)}</span>
      {/* Vão de 1px entre degraus: sem ele, cinco classes discretas leem como
          um degradê contínuo — o oposto do que a rampa de 5 passos quer dizer. */}
      <span className="flex h-2.5 min-w-[120px] flex-1 gap-px overflow-hidden rounded-full">
        {passos.map((c, i) => (
          <span key={i} className="flex-1" style={{ background: c }} />
        ))}
      </span>
      <span className="shrink-0 font-mono tabular-nums">{camada.escala(direita)}</span>
      <span className={tintaMaisMuda}>
        o número no município é a colocação · a altura segue o ranking, não o valor
      </span>
    </div>
  )
}

/**
 * Repouso: duas amostras e nada mais.
 *
 * Sem os "dois estados" do rodapé, e de propósito: em repouso não existe camada
 * que possa faltar, então "sem dado nesta camada" não descreve nada. Uma
 * legenda que oferece uma classe inexistente ensina o leitor a procurar uma cor
 * que não está lá.
 */
function LegendaRepouso({
  bordaSuave,
  tintaMaisMuda,
}: {
  bordaSuave: string
  tintaMaisMuda: string
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      <span className="inline-flex shrink-0 items-center gap-1.5">
        <span
          className="inline-block h-2.5 w-2.5 rounded-[2px]"
          style={{ background: 'var(--mapa-repouso)' }}
          aria-hidden
        />
        cidades desta unidade
      </span>
      <span className="inline-flex shrink-0 items-center gap-1.5">
        <span
          className={`inline-block h-2.5 w-2.5 rounded-[2px] border ${bordaSuave}`}
          style={{ background: 'var(--mapa-contexto)' }}
          aria-hidden
        />
        resto do estado
      </span>
      <span className={tintaMaisMuda}>escolha um dado acima para comparar as cidades</span>
    </div>
  )
}

/** Percentual: a amostra do medidor, e a ressalva que ela precisa carregar. */
function LegendaNivel({ claro, tintaMaisMuda }: { claro: boolean; tintaMaisMuda: string }) {
  // O quadro de amostra e o traço da linha d'água são SVG cru — o mesmo
  // problema do resto do mapa: `rgba(255,255,255,…)` some sobre a ilha
  // branca. `--mapa-brilho`, e não `--mapa-r5`: r5 é o degrau mais forte NA
  // DIREÇÃO da rampa do tema, e essa direção inverte entre claro e escuro
  // (ver `escala.ts`) — o brilho é o destaque fixo, a posição na rampa não é.
  const quadroFill = claro ? 'rgba(15,23,42,.04)' : 'rgba(255,255,255,.05)'
  const quadroStroke = claro ? 'rgba(15,23,42,.28)' : 'rgba(255,255,255,.34)'
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <span className="inline-flex items-center gap-2">
        <svg width="26" height="16" aria-hidden="true">
          <rect x="1" y="1" width="24" height="14" rx="2" fill={quadroFill} stroke={quadroStroke} />
          <rect x="1" y="7" width="24" height="8" rx="2" fill="var(--mapa-r3)" />
          <line x1="1" y1="7" x2="25" y2="7" stroke="var(--mapa-brilho)" strokeWidth="1.6" />
        </svg>
        área preenchida = % do valor
      </span>
      <span className={tintaMaisMuda}>
        o corte é por ÁREA, não por altura · o número no município é a porcentagem
      </span>
    </div>
  )
}

/**
 * Os dois estados que escala de cor nenhuma cobre, e que a legenda tem de
 * separar em toda camada: um município que a unidade opera mas sobre o qual
 * esta camada não sabe nada, e um município que a unidade nem toca. Sem a
 * distinção, os dois viram "aqui não tem nada" — e o primeiro é um buraco no
 * resultado.
 */
function OsDoisEstados({
  claro,
  bordaSuave,
  bordaMenosSuave,
}: {
  claro: boolean
  bordaSuave: string
  bordaMenosSuave: string
}) {
  const hachura = claro
    ? 'repeating-linear-gradient(45deg,rgba(15,23,42,.22) 0 1.5px,rgba(15,23,42,.04) 1.5px 4px)'
    : 'repeating-linear-gradient(45deg,rgba(255,255,255,.26) 0 1.5px,rgba(255,255,255,.05) 1.5px 4px)'
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      <span className="inline-flex shrink-0 items-center gap-1.5">
        <span
          className={`inline-block h-2.5 w-2.5 rounded-[2px] border ${bordaMenosSuave}`}
          style={{ backgroundImage: hachura }}
          aria-hidden
        />
        sem dado nesta camada
      </span>
      <span className="inline-flex shrink-0 items-center gap-1.5">
        <span
          className={`inline-block h-2.5 w-2.5 rounded-[2px] border ${bordaSuave}`}
          style={{ background: 'var(--mapa-contexto)' }}
          aria-hidden
        />
        fora da unidade
      </span>
    </div>
  )
}
