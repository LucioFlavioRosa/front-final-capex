import { memo, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { ArrowRight, X } from '@phosphor-icons/react'
import { useCidade } from '@/rodada/api/queries'
import { brlMi, deTotal, inteiro, pct } from '@/rodada/lib/formato'
import { CAMADAS } from '@/rodada/mapa/camadas'
import type { Camada, Contexto, FormaDoGrafico } from '@/rodada/mapa/camadas'
import {
  GraficoCapexDoCartao,
  GraficoComposicaoDoCartao,
  GraficoCoberturaDoCartao,
  GraficoDistribuicaoDoCartao,
  SemSerie,
  COR_A,
  COR_B,
} from '@/rodada/mapa/graficosDoCartao'
import type { PontoDaDistribuicao } from '@/rodada/mapa/graficosDoCartao'
import type { AncoraNoMapa } from '@/rodada/mapa/MapaCidades'
import type { CidadeLinha } from '@/rodada/domain/resultado'

/**
 * O CARTÃO DE UMA CIDADE — a prévia sobreposta, e por que ela não contradiz a
 * regra do nível 0.
 *
 * O comentário no topo de `ResultadosRefactor.tsx` diz que dado de UMA cidade
 * é nível 2, e que o mapa é porta de entrada e não filtro. O que aquela regra
 * recusou foi REESCOPAR OS QUADROS DA PÁGINA para a cidade clicada — porque
 * isso reconstrói um nível 2 que já existe e cria um estado ambíguo em que o
 * mesmo quadro fala do plano ou de uma cidade conforme algo que o leitor não
 * vê.
 *
 * Este cartão não faz nada disso. Os quadros de baixo continuam falando do
 * plano, sempre. O que é da cidade vive numa superfície que (a) se fecha, (b)
 * traz o nome da cidade no topo, e (c) está literalmente ancorada ao polígono
 * de que fala. A regra ganha uma frase, não uma exceção:
 *
 *   **dado de uma cidade só aparece no nível 0 em superfície que se fecha e
 *   que nomeia de qual cidade fala.**
 *
 * ## O SELETOR DO CARTÃO É O SELETOR DO MAPA
 *
 * Não há um "dado do cartão" separado do "dado do mapa": escolher aqui repinta
 * os dezenove polígonos, e clicar numa pílula da ilha troca o gráfico daqui. É
 * uma decisão contra a alternativa óbvia (cada superfície com o seu), e o
 * motivo é o mesmo que já governa `ativa`: dois estados que dizem a mesma
 * coisa divergem, e quando divergem o usuário lê "VPL" na legenda e um gráfico
 * de cobertura logo abaixo sem nada explicando a diferença.
 *
 * A forma muda com o espaço: na ilha são PÍLULAS (cabem, e o mapa se
 * beneficia de ver todas as leituras disponíveis de uma vez); aqui é um
 * `<select>` (não cabem, e um nativo resolve teclado e toque de graça). Dois
 * gestos para um estado é fim; dois estados para um gesto é bug.
 */

const LARGURA = 372

/**
 * MEMOIZADO, E ISSO NÃO É OTIMIZAÇÃO PREVENTIVA.
 *
 * O cartão vive dentro da ilha do mapa, e `ativa` — o realce de hover, que
 * muda dezenas de vezes por segundo — mora em `Bancada`, acima dos dois. Sem
 * `memo`, cada pixel de mouse sobre um polígono reconciliaria os gráficos de
 * recharts daqui: exatamente o travamento que `BlocoDaRodada` já foi separado
 * para evitar (ver o comentário no ponto de uso dele).
 *
 * `memo` só cumpre a promessa porque nenhuma prop muda com o hover, e é uma
 * condição que se quebra fácil: as quatro funções vêm de `useCallback` em
 * `estadoNaUrl.ts`, `todas`/`faixa`/`ctx` são objetos memoizados, e
 * `aoAbrirDetalhes` é embrulhado em `useCallback` no ponto de uso. Uma arrow
 * inline em qualquer uma delas anula tudo isto em silêncio — sem erro, sem
 * aviso, só a tela voltando a engasgar.
 */
export const CartaoDaCidade = memo(function CartaoDaCidade({
  runId,
  cidade,
  comparada,
  todas,
  camada,
  ctx,
  faixa,
  aoEscolherCamada,
  aoCompararCom,
  aoFechar,
  aoAbrirDetalhes,
}: {
  runId: string
  cidade: CidadeLinha
  comparada: CidadeLinha | null
  todas: CidadeLinha[]
  camada: Camada
  ctx: Contexto
  /** A MESMA faixa que pintou o mapa — ver `posicaoNaFaixa` abaixo. */
  faixa: { min: number; max: number }
  aoEscolherCamada: (chave: string) => void
  aoCompararCom: (cidade: string | null) => void
  aoFechar: () => void
  aoAbrirDetalhes: () => void
}) {
  /**
   * A REQUISIÇÃO SAI SEMPRE, MESMO QUANDO O GRÁFICO NÃO PRECISA DELA.
   *
   * Só a composição do VPL consome `detalhe`. Disparar mesmo assim é
   * deliberado: este é o payload do NÍVEL 2, e o botão "Exibir mais detalhes"
   * está a um clique daqui. Quando ele for clicado, a tela de cidade abre com
   * o cache quente — resultado publicado é imutável e o react-query o guarda
   * para sempre (ver o topo de `domain/resultado.ts`). É a diferença entre um
   * drill-down que pisca e um que troca.
   */
  const detalhe = useCidade(runId, cidade.id)

  /**
   * A vista é PEGAJOSA entre camadas, de propósito: quem trocou para "comparar
   * com as 19" está numa pergunta ("onde esta cidade cai?") que sobrevive à
   * troca do dado. Zerar a cada pílula obrigaria a reescolher a vista a cada
   * leitura.
   */
  const [vista, setVista] = useState<'propria' | 'distribuicao'>('propria')

  const forma = formaEfetiva(camada.grafico, vista, !!comparada)

  /**
   * OS PONTOS DA DISTRIBUIÇÃO SAEM DAQUI, MAS A FAIXA VEM DE FORA.
   *
   * Recalcular a faixa localmente daria uma régua que por acaso quase sempre
   * bate com a do mapa — e que discordaria dele exatamente nas camadas
   * divergentes, onde a faixa é simétrica em torno do zero e não `[min, max]`.
   * Uma régua no cartão diferente da rampa do mapa é o pior defeito possível
   * aqui: os dois desenhos afirmariam posições diferentes para o mesmo número.
   */
  const pontos: PontoDaDistribuicao[] = useMemo(
    () =>
      todas
        .map((c) => ({ id: c.id, nome: c.nome, valor: camada.valor(c, ctx) }))
        .filter((p): p is PontoDaDistribuicao => p.valor != null),
    [todas, camada, ctx],
  )

  const posicao = useMemo(() => {
    if (camada.forma === 'repouso') return null
    const ordem = [...pontos].sort((a, b) =>
      camada.inverter ? a.valor - b.valor : b.valor - a.valor,
    )
    const i = ordem.findIndex((p) => p.id === cidade.id)
    return i < 0 ? null : { posicao: i + 1, de: ordem.length }
  }, [pontos, camada, cidade.id])

  const semDadoNaCamada = camada.forma !== 'repouso' && camada.valor(cidade, ctx) == null

  return (
    <div
      role="dialog"
      aria-label={`Resumo de ${cidade.nome}`}
      style={{ width: LARGURA, maxWidth: '100%' }}
      className="carta flex max-h-full flex-col overflow-hidden shadow-elev"
    >
      <Cabecalho
        cidade={cidade}
        comparada={comparada}
        camada={camada}
        posicao={posicao}
        aoFechar={aoFechar}
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <Resumo cidade={cidade} comparada={comparada} />

        <div className="flex flex-col gap-2.5 border-t border-ink-100 px-4 py-3">
          <div className="flex items-center gap-2">
            <label className="shrink-0 font-mono text-[10px] uppercase tracking-[.12em] text-ink-400">
              dado
            </label>
            <SeletorDeDado chave={camada.chave} aoEscolher={aoEscolherCamada} />
          </div>

          <div className="flex items-center gap-2">
            <label className="shrink-0 font-mono text-[10px] uppercase tracking-[.12em] text-ink-400">
              versus
            </label>
            <SeletorDeComparacao
              todas={todas}
              excluir={cidade.id}
              atual={comparada?.id ?? null}
              aoEscolher={aoCompararCom}
            />
          </div>

          {camada.forma !== 'repouso' && camada.grafico !== 'distribuicao' && (
            <AlternadorDeVista
              vista={forma === 'distribuicao' ? 'distribuicao' : 'propria'}
              travado={camada.grafico === 'composicaoVpl' && !!comparada}
              aoTrocar={setVista}
            />
          )}

          <AreaDoGrafico
            forma={forma}
            cidade={cidade}
            comparada={comparada}
            camada={camada}
            ctx={ctx}
            faixa={faixa}
            pontos={pontos}
            semDado={todas.length - pontos.length}
            detalhe={detalhe}
          />

          {semDadoNaCamada && (
            <p className="rounded-md bg-ink-50 px-2.5 py-2 text-[11px] leading-relaxed text-ink-500">
              {cidade.nome} <strong className="font-semibold">não tem valor</strong> em “
              {camada.rotulo}” nesta rodada — é por isso que o município aparece hachurado no mapa.
              Não é zero.
            </p>
          )}

          <RessalvaDeUnidade cidade={cidade} comparada={comparada} camada={camada} />
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-ink-100 bg-ink-50 px-4 py-2.5">
        {/* Curto porque o rodapé divide a linha com o botão: a versão longa
            ("ancorado no município · ↑↓ troca de cidade") era truncada no meio
            da própria dica de teclado, que é a única informação nova ali. */}
        <span className="min-w-0 truncate font-mono text-[10.5px] text-ink-400">
          ↑↓ troca de cidade
        </span>
        <button
          type="button"
          onClick={aoAbrirDetalhes}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-water-600 px-3 py-1.5 text-[12px] font-semibold text-white transition-colors duration-hover ease-saida hover:bg-water-700"
        >
          Exibir mais detalhes
          <ArrowRight weight="bold" className="text-[12px]" />
        </button>
      </div>
    </div>
  )
})

/**
 * QUAL GRÁFICO DE FATO SAI, dadas a camada, a vista escolhida e a comparação.
 *
 * Uma função e não um encadeamento de ternários no JSX porque ela tem uma
 * regra que precisa ser lida: **o fluxo de escoamento não tem versão comparada
 * e por isso cede o lugar**. Duas somas encadeadas no mesmo eixo deixam de ser
 * fluxo (ver `GraficoComposicaoDoCartao`), então fixar uma segunda cidade
 * enquanto se olha o VPL troca para a distribuição — que compara os dois VPL
 * sem mentir sobre a forma. O alternador fica travado nesse estado, com o
 * motivo escrito, em vez de oferecer um botão que não faz nada.
 */
function formaEfetiva(
  daCamada: FormaDoGrafico,
  vista: 'propria' | 'distribuicao',
  comparando: boolean,
): FormaDoGrafico {
  if (daCamada === 'nenhum') return 'nenhum'
  if (daCamada === 'distribuicao') return 'distribuicao'
  if (vista === 'distribuicao') return 'distribuicao'
  if (daCamada === 'composicaoVpl' && comparando) return 'distribuicao'
  return daCamada
}

function AreaDoGrafico({
  forma,
  cidade,
  comparada,
  camada,
  ctx,
  faixa,
  pontos,
  semDado,
  detalhe,
}: {
  forma: FormaDoGrafico
  cidade: CidadeLinha
  comparada: CidadeLinha | null
  camada: Camada
  ctx: Contexto
  faixa: { min: number; max: number }
  pontos: PontoDaDistribuicao[]
  semDado: number
  detalhe: ReturnType<typeof useCidade>
}) {
  if (forma === 'nenhum') {
    return (
      <SemSerie>
        Escolha um dado acima — o mesmo gesto pinta os dezenove municípios e desenha a leitura
        desta cidade aqui.
      </SemSerie>
    )
  }

  if (forma === 'coberturaMetas') {
    return <GraficoCoberturaDoCartao a={cidade} b={comparada} />
  }

  if (forma === 'capexPorAno') {
    return <GraficoCapexDoCartao a={cidade} b={comparada} anoEmFoco={ctx.ano} />
  }

  if (forma === 'composicaoVpl') {
    // O ÚNICO gráfico do cartão que espera rede — e o estado de espera é uma
    // barra pulsando do tamanho final, não um spinner: o cartão já está aberto
    // e tudo em volta dele já é dado real.
    if (detalhe.isPending) {
      return <div className="h-[148px] animate-pulse rounded-lg bg-ink-100" aria-hidden />
    }
    if (detalhe.isError || !detalhe.data) {
      return <SemSerie>Não foi possível carregar a decomposição do VPL de {cidade.nome}.</SemSerie>
    }
    return <GraficoComposicaoDoCartao parcelas={detalhe.data.cascata} nome={cidade.nome} />
  }

  return (
    <GraficoDistribuicaoDoCartao
      pontos={pontos}
      faixa={faixa}
      camada={camada}
      idA={cidade.id}
      nomeA={cidade.nome}
      idB={comparada?.id}
      nomeB={comparada?.nome}
      semDado={semDado}
    />
  )
}

function Cabecalho({
  cidade,
  comparada,
  camada,
  posicao,
  aoFechar,
}: {
  cidade: CidadeLinha
  comparada: CidadeLinha | null
  camada: Camada
  posicao: { posicao: number; de: number } | null
  aoFechar: () => void
}) {
  return (
    <div className="flex items-start gap-2 px-4 pb-2 pt-3.5">
      <span
        className="mt-[5px] h-2.5 w-2.5 shrink-0 rounded-full"
        style={{ background: COR_A }}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <strong className="block truncate text-[14.5px] font-bold leading-tight text-ink-800">
          {cidade.nome}
        </strong>
        <span className="mt-0.5 block truncate text-[11.5px] text-ink-500">
          {camada.forma === 'repouso' ? (
            `${inteiro(cidade.sistemas)} ${cidade.sistemas === 1 ? 'sistema' : 'sistemas'}`
          ) : posicao ? (
            /* O rótulo entra COMO ESTÁ no catálogo. `toLowerCase()` parecia
               melhorar a frase e produzia "1ª de 19 em vpl do plano" — uma
               sigla desmontada em três letras minúsculas. */
            <>
              <strong className="font-semibold text-ink-700">
                {posicao.posicao}ª de {posicao.de}
              </strong>{' '}
              em {camada.rotulo}
            </>
          ) : (
            <>sem valor em {camada.rotulo}</>
          )}
        </span>
        {comparada && (
          <span className="mt-1 inline-flex max-w-full items-center gap-1.5 truncate text-[11.5px] text-ink-500">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: COR_B }}
              aria-hidden
            />
            <span className="truncate">contra {comparada.nome}</span>
          </span>
        )}
      </div>
      <button
        type="button"
        onClick={aoFechar}
        aria-label="Fechar o resumo desta cidade"
        className="-mr-1 -mt-1 shrink-0 rounded-lg p-1.5 text-ink-400 transition-colors duration-hover ease-saida hover:bg-ink-100 hover:text-ink-700"
      >
        <X weight="bold" className="text-[13px]" />
      </button>
    </div>
  )
}

/**
 * OS NÚMEROS FIXOS — os mesmos cinco, sempre, independentes da camada.
 *
 * Trocá-los conforme o dado escolhido faria o cartão perder a função de
 * fichário: a razão de abrir Itaboraí olhando VPL costuma ser justamente
 * conferir se o CAPEX e a cobertura acompanham. Quem varia é o GRÁFICO; a
 * ficha é constante, e é o que permite comparar dois cartões abertos em
 * momentos diferentes.
 */
function Resumo({ cidade, comparada }: { cidade: CidadeLinha; comparada: CidadeLinha | null }) {
  const linhas: { rotulo: string; a: string; b: string | null }[] = [
    { rotulo: 'VPL', a: brlMi(cidade.vpl), b: comparada ? brlMi(comparada.vpl) : null },
    { rotulo: 'CAPEX', a: brlMi(cidade.capex), b: comparada ? brlMi(comparada.capex) : null },
    {
      rotulo: 'Cobertura final',
      a: pct(cidade.coberturaFimPct),
      b: comparada ? pct(comparada.coberturaFimPct) : null,
    },
    {
      rotulo: 'Metas',
      a: deTotal(cidade.metasAtingidas, cidade.metasTotal),
      b: comparada ? deTotal(comparada.metasAtingidas, comparada.metasTotal) : null,
    },
    {
      rotulo: 'Ligações novas',
      a: inteiro(cidade.ligacoesNovas),
      b: comparada ? inteiro(comparada.ligacoesNovas) : null,
    },
  ]

  return (
    <dl className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-baseline gap-x-3 gap-y-1 px-4 pb-3">
      {linhas.map((l) => (
        <div key={l.rotulo} className="contents">
          <dt className="truncate text-[11.5px] text-ink-500">{l.rotulo}</dt>
          <dd className="m-0 text-right font-mono text-[12px] font-semibold tabular-nums text-ink-800">
            {l.a}
          </dd>
          {/* A coluna da comparada existe SEMPRE no grid, vazia quando não há
              comparação: sem isso a ficha reflui inteira ao fixar a segunda
              cidade, e os cinco números saltam de posição no momento exato em
              que o usuário quer compará-los.

              TINGIDA com a cor de B, e não em cinza: cinza lê como "valor
              secundário/desabilitado", quando estes números são metade da
              comparação. A cor é a mesma da linha tracejada no gráfico e do
              anel no polígono — é o que amarra as três representações. */}
          <dd
            className="m-0 min-w-[56px] text-right font-mono text-[12px] font-semibold tabular-nums"
            style={{ color: comparada ? COR_B : undefined }}
          >
            {l.b ?? ''}
          </dd>
        </div>
      ))}
    </dl>
  )
}

function SeletorDeDado({
  chave,
  aoEscolher,
}: {
  chave: string
  aoEscolher: (chave: string) => void
}) {
  return (
    <select
      value={chave}
      onChange={(e) => aoEscolher(e.target.value)}
      aria-label="Dado mostrado no mapa e neste cartão"
      className="min-w-0 flex-1 rounded-lg border border-ink-200 bg-white px-2 py-1.5 text-[12px] font-semibold text-ink-800 transition-colors duration-hover ease-saida hover:border-ink-300"
    >
      {CAMADAS.map((c) => (
        <option key={c.chave} value={c.chave}>
          {c.rotulo}
        </option>
      ))}
    </select>
  )
}

function SeletorDeComparacao({
  todas,
  excluir,
  atual,
  aoEscolher,
}: {
  todas: CidadeLinha[]
  excluir: string
  atual: string | null
  aoEscolher: (cidade: string | null) => void
}) {
  const opcoes = useMemo(
    () => todas.filter((c) => c.id !== excluir).sort((a, b) => a.nome.localeCompare(b.nome)),
    [todas, excluir],
  )
  return (
    <select
      value={atual ?? ''}
      onChange={(e) => aoEscolher(e.target.value || null)}
      aria-label="Segunda cidade, para comparar"
      className="min-w-0 flex-1 rounded-lg border border-ink-200 bg-white px-2 py-1.5 text-[12px] text-ink-700 transition-colors duration-hover ease-saida hover:border-ink-300"
    >
      <option value="">nenhuma — só esta cidade</option>
      {opcoes.map((c) => (
        <option key={c.id} value={c.id}>
          {c.nome}
        </option>
      ))}
    </select>
  )
}

function AlternadorDeVista({
  vista,
  travado,
  aoTrocar,
}: {
  vista: 'propria' | 'distribuicao'
  travado: boolean
  aoTrocar: (v: 'propria' | 'distribuicao') => void
}) {
  if (travado) {
    return (
      <p className="text-[10.5px] leading-relaxed text-ink-400">
        Com duas cidades fixadas, o VPL sai como distribuição: um fluxo de escoamento é uma soma
        encadeada, e duas somas no mesmo eixo deixam de ser um fluxo.
      </p>
    )
  }
  return (
    <div
      role="tablist"
      aria-label="Como ver este dado"
      className="inline-flex gap-1 self-start rounded-lg bg-ink-100 p-[3px]"
    >
      {(
        [
          ['propria', 'Trajetória'],
          ['distribuicao', 'Entre as cidades'],
        ] as const
      ).map(([v, texto]) => (
        <button
          key={v}
          type="button"
          role="tab"
          aria-selected={vista === v}
          onClick={() => aoTrocar(v)}
          className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors duration-hover ease-saida ${
            vista === v ? 'bg-white text-ink-800 shadow-sm' : 'text-ink-500 hover:text-ink-700'
          }`}
        >
          {texto}
        </button>
      ))}
    </div>
  )
}

/**
 * A ressalva de unidade, AQUI e não só embaixo do mapa.
 *
 * Ela já existe em `AvisoDeUnidade`, no rodapé do painel — longe do número.
 * No cartão ela é obrigatória e mais específica: comparar duas cidades medidas
 * em unidades diferentes (uma em ligações, outra em economias) na mesma
 * cobertura é exatamente a leitura errada que o cartão facilita ao pôr as duas
 * lado a lado. O aviso só aparece quando as duas condições estão dadas — há
 * comparação, e as unidades divergem —, porque em rodada uniforme não há o que
 * ressalvar.
 */
function RessalvaDeUnidade({
  cidade,
  comparada,
  camada,
}: {
  cidade: CidadeLinha
  comparada: CidadeLinha | null
  camada: Camada
}) {
  if (!comparada || camada.forma !== 'percentual') return null
  const ua = cidade.unidadeCobertura
  const ub = comparada.unidadeCobertura
  if (!ua || !ub || ua === ub) return null
  return (
    <p className="flex items-start gap-2 rounded-r-md border-l-2 border-warning bg-warning/10 px-2.5 py-2 text-[11px] leading-relaxed text-warning">
      <span aria-hidden>⚠</span>
      <span>
        {cidade.nome} mede cobertura em <strong>{ua}</strong> e {comparada.nome} em{' '}
        <strong>{ub}</strong>. As duas curvas não são diretamente comparáveis.
      </span>
    </p>
  )
}

/**
 * A POSIÇÃO DO CARTÃO SOBRE O MAPA.
 *
 * Ancorado no polígono, e não num canto fixo, porque a pergunta que o cartão
 * responde é sobre AQUELE município — e num mapa de dezenove peças, um painel
 * no canto obriga o olho a refazer a associação a cada abertura.
 *
 * O grampeamento nas bordas é o que impede o defeito clássico: São Francisco
 * de Itabapoana fica no extremo nordeste da malha, e um cartão de 372px
 * ancorado nele sairia inteiro para fora da ilha. O cálculo é feito em
 * pixels da própria caixa do mapa, que `MapaCidades` mede no clique.
 *
 * SEM ÂNCORA — cartão aberto pelo ranking, pelo teclado ou por um link colado
 * — ele assenta no canto superior direito da ilha. É o único canto que não
 * cobre nem o seletor de camada (topo à esquerda) nem a legenda (rodapé).
 */
const MARGEM = 12

/**
 * A CAIXA QUE POSICIONA O CARTÃO — e ela MEDE em vez de estimar.
 *
 * A primeira versão usava uma altura fixa presumida (420px). O cartão tem
 * ~540 e cresce mais com a cascata deitada, e o erro tinha uma consequência
 * concreta que o Playwright pegou: o cálculo concluía "cabe acima", colocava
 * o topo em `y - 434`, e os 540px reais desciam de volta até `y + 106` — em
 * cima do próprio polígono. O mapa sumia justamente da cidade que se estava
 * lendo, e o gesto de clicar de novo para fechar ficava sob o cartão.
 *
 * Estimativa não conserta isso: a altura muda com a camada (o fluxo de
 * escoamento tem uma barra por parcela), com a comparação e com o texto das
 * ressalvas. `ResizeObserver` acompanha as três.
 *
 * `useLayoutEffect` e não `useEffect`: ele roda ANTES da pintura, então a
 * correção da primeira medida não chega a aparecer como um salto.
 */
export function CartaoFlutuante({
  ancora,
  children,
}: {
  ancora: AncoraNoMapa | null
  children: ReactNode
}) {
  const caixa = useRef<HTMLDivElement>(null)
  const [altura, setAltura] = useState(0)

  useLayoutEffect(() => {
    const el = caixa.current
    if (!el) return
    const medir = () => setAltura(el.getBoundingClientRect().height)
    medir()
    const ro = new ResizeObserver(medir)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <div
      ref={caixa}
      className="absolute z-20"
      style={{
        ...posicionar(ancora, altura),
        // O teto e a rolagem interna são o que impede o cartão de ultrapassar
        // a ilha numa janela baixa — sem eles, `posicionar` seria obrigado a
        // escolher entre vazar em cima ou vazar embaixo.
        maxHeight: `calc(100% - ${MARGEM * 2}px)`,
      }}
    >
      {children}
    </div>
  )
}

/**
 * ONDE O CARTÃO ASSENTA, dada a âncora e a altura JÁ MEDIDA.
 *
 * SEM ÂNCORA — cartão aberto pelo ranking, pelo teclado ou por um link colado
 * — ele vai para o canto superior direito da ilha: é o único que não cobre nem
 * o seletor de camada (topo à esquerda) nem a legenda (rodapé).
 *
 * `altura === 0` é o render anterior à primeira medida. Trata-se como "não
 * cabe acima", que é o palpite conservador: o cartão nasce ao lado e, se
 * couber acima, sobe antes da pintura.
 */
function posicionar(ancora: AncoraNoMapa | null, altura: number): React.CSSProperties {
  if (!ancora) return { top: MARGEM, right: MARGEM }

  const acima = ancora.y - altura - 14

  // CABE ACIMA: centrado no município, como qualquer popover.
  if (altura > 0 && acima >= MARGEM) {
    const maxEsq = Math.max(MARGEM, ancora.largura - LARGURA - MARGEM)
    return { left: Math.min(maxEsq, Math.max(MARGEM, ancora.x - LARGURA / 2)), top: acima }
  }

  /**
   * NÃO CABE ACIMA: VAI PARA O LADO, e não para baixo.
   *
   * Descer é o reflexo, e é o que punha o cartão sobre o polígono — ver o
   * comentário de `CartaoFlutuante`. Indo para a METADE OPOSTA da ilha, o
   * município continua visível ao lado do cartão, que é a única razão de ele
   * flutuar sobre o mapa em vez de viver num painel fixo.
   */
  const lado = ancora.x < ancora.largura / 2 ? { right: MARGEM } : { left: MARGEM }
  const topoMaximo = Math.max(MARGEM, ancora.altura - altura - MARGEM)
  return { ...lado, top: Math.max(MARGEM, Math.min(topoMaximo, ancora.y - 120)) }
}
