/**
 * "E SE EU INVESTIR MAIS CAPEX POR ANO?" — o teto e a curva.
 *
 * A tela responde em duas camadas, e a ordem entre elas é o desenho:
 *
 * 1. O TETO, de graça e imediato. Quantas das sub-bacias fora do plano o
 *    dinheiro a mais poderia comprar no melhor caso imaginável. Não precisa de
 *    solver nenhum e serve para DESCARTAR: se com +50% cabem quatro de mil,
 *    ninguém precisa gastar execução para descobrir que a curva é plana.
 * 2. A CURVA, um ponto por vez. Cada ponto é uma otimização de verdade.
 *
 * O teto vem primeiro na tela porque é a pergunta anterior. Pôr a curva no topo
 * convidaria a disparar cinco execuções antes de saber se há o que ganhar.
 *
 * TRÊS QUADROS, E NÃO UM COM TRÊS SÉRIES. Percentual, contagem e reais não
 * cabem num eixo só, e forçá-los produziria o erro clássico de dois eixos y —
 * onde duas curvas se cruzam por causa da escala escolhida e o leitor conclui
 * algo que o dado não diz. Pequenos múltiplos compartilham o eixo x, que é o que
 * de fato têm em comum.
 *
 * NÃO HÁ INTERPOLAÇÃO ENTRE OS PONTOS. A resposta do otimizador não é suave no
 * orçamento — dez por cento a mais pode destravar uma cadeia inteira ou não
 * mover nada —, e uma curva estimada aqui seria número inventado com cara de
 * análise numa tela de decisão de CAPEX. O que se barateia é o TEMPO DE SOLVER,
 * não o método: ver `domain/sensibilidade.ts`.
 *
 * O ponto de 0% é a rodada que a pessoa está olhando. Ele ancora a leitura: sem
 * ele a curva começaria no ar, e "quanto sobe" não teria de onde subir.
 */
import { useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Link } from 'react-router-dom'
import { QuadroGrafico } from '@/rodada/components/QuadroGrafico'
import { Tag, type Tom } from '@/rodada/components/pecas'
import { useDispararVariacao, useSensibilidade, useStatusDaRodada } from '@/rodada/api/queries'
import type { ModoDaVariacao } from '@/rodada/api/endpoints'
import {
  MAXIMO_DE_INTERMEDIARIOS,
  VARREDURA_PADRAO,
  comparativoDeObras,
  curvaPronta,
  degrausDaVarredura,
  dinheiroDoDegrau,
  emVooDaBase,
  faixaDaVarredura,
  faltouTempoDeSolver,
  fatorDoDegrau,
  melhorPorDegrau,
  pontosEmVoo,
  problemaDaVarredura,
  situacaoDaVarredura,
  type EstadoDoDegrau,
  type SituacaoDoDegrau,
  type Varredura,
  vezesOOrcamento,
  type ComparativoDeObras,
  type PontoDaCurva,
  type TetoDeSensibilidade,
} from '@/rodada/domain/sensibilidade'
import { brlMi, inteiro, pct, vazao } from '@/rodada/lib/formato'
import { corDoComponente } from '@/rodada/components/cores'
import type { RunMeta } from '@/rodada/domain/resultado'

interface Medida {
  chave: 'cobertura' | 'metas' | 'vpl'
  titulo: string
  nota: string
  valor: (p: PontoDaCurva) => number | null
  formatar: (v: number) => string
  cor: string
  /**
   * A largura reservada para os rótulos do eixo y, em pixels.
   *
   * POR MEDIDA, e não uma só para as três: "R$ 180,0 Mi" e "60,0%" não ocupam o
   * mesmo espaço, e o valor que servia às três era o da menor. Na largura cheia
   * o eixo do VPL quebrava cada rótulo em três linhas empilhadas, ilegíveis e
   * sobrepostas — um defeito que só apareceu quando os quadros deixaram de
   * dividir a linha e o rótulo passou a caber menos, não mais.
   */
  larguraEixo: number
  /** Contagem não tem meia unidade: sem isto o eixo oferece "0,5 meta". */
  eixoInteiro?: boolean
}

/**
 * As três perguntas, nesta ordem — e a ordem é a do que se decide.
 *
 * Cobertura primeiro porque é o compromisso com o contrato; metas depois porque
 * é o mesmo compromisso contado em obrigações; VPL por último porque ele é a
 * conta que diz se vale a pena, e ela só faz sentido depois de saber o que se
 * ganha. A cor de cada um vem da rampa da casa (`--viz-*` em `index.css`).
 */
const MEDIDAS: Medida[] = [
  {
    chave: 'cobertura',
    titulo: 'Cobertura ao fim',
    nota: 'quanto da população fica atendida no fim do horizonte',
    valor: (p) => p.coberturaFimPct,
    formatar: (v) => pct(v),
    cor: '#2e4ec9',
    larguraEixo: 56,
  },
  {
    chave: 'metas',
    titulo: 'Metas cumpridas',
    nota: 'contagem, dentro da janela de CAPEX',
    valor: (p) => p.metasAtingidas,
    formatar: (v) => inteiro(v),
    cor: '#10908C',
    larguraEixo: 40,
    eixoInteiro: true,
  },
  {
    chave: 'vpl',
    titulo: 'VPL do plano',
    nota: 'mais CAPEX não garante mais VPL — é isto que a curva mostra',
    valor: (p) => (p.vpl === null ? null : p.vpl / 1_000_000),
    formatar: (v) => brlMi(v * 1_000_000),
    cor: '#0D6B6F',
    larguraEixo: 84,
  },
]

export function PainelSensibilidade({ meta }: { meta: RunMeta }) {
  /**
   * A VARREDURA: do acréscimo mínimo ao máximo, com até três pontos no meio.
   *
   * A pessoa diz a faixa e quantos pontos quer entre os extremos, dá o play, e
   * TODOS os degraus vão para a fila de uma vez — os dois extremos e os do meio.
   * Os gráficos abaixo vão se preenchendo conforme cada um responde: a consulta
   * da curva já escuta a cada 8 s enquanto houver ponto em voo.
   *
   * A VARREDURA VIVE NA TELA, e não no servidor: é uma pergunta em aberto, não
   * uma propriedade da rodada. Sair da tela perde os números digitados e nada
   * além disso: os pontos que rodaram estão no banco e voltam TODOS na consulta,
   * independentemente do que estiver nos campos — a curva ACUMULA, e é o gráfico
   * que guarda a análise, não o formulário.
   */
  const [varredura, setVarredura] = useState<Varredura>(VARREDURA_PADRAO)
  const problema = problemaDaVarredura(varredura)
  const varreduraOk = problema === null
  const degrausPedidos = degrausDaVarredura(varredura)
  const consulta = useSensibilidade(
    meta.runId,
    faixaDaVarredura(varreduraOk ? varredura : VARREDURA_PADRAO),
  )
  const disparar = useDispararVariacao()
  /** Quantos já foram para a fila neste play — só enquanto o play está em curso. */
  const [enfileirando, setEnfileirando] = useState<{ feito: number; total: number } | null>(null)
  /**
   * OS PONTOS QUE JÁ EXISTIAM NA CURVA DE OUTRA RODADA, acumulados durante o play.
   *
   * `useMutation` guarda só a ÚLTIMA resposta: com três pedidos em sequência, um
   * `naCurva: false` no primeiro seria sobrescrito pelo sucesso do segundo, e a
   * explicação de por que aquele ponto não apareceu se perderia. Aqui cada uma
   * fica, e a lista zera no próximo play.
   */
  const [foraDaCurva, setForaDaCurva] = useState<{ degrau: number; runId: string }[]>([])

  /**
   * A ANÁLISE RODA EM MODO RÁPIDO, e isso não é escolha na tela.
   *
   * Quase toda análise de sensibilidade termina em "a curva é plana" ou "sobe
   * pouco", e gastar oitenta minutos de cluster para chegar lá é desperdício que
   * ninguém percebe estar fazendo. O que a curva responde é a INCLINAÇÃO, e 60s de
   * solver bastam para ela.
   *
   * A ÚNICA exceção é automática, por degrau: quando um degrau falhou por falta
   * de tempo de solver, repetir em 60s reproduz a falha — aquele degrau sobe
   * para completo sozinho no próximo play, e a tela diz isso.
   */
  const modo: ModoDaVariacao = 'rapido'

  const teto = consulta.data?.teto ?? null
  const melhor = melhorPorDegrau(consulta.data?.pontos ?? [])
  const situacao = situacaoDaVarredura(melhor, degrausPedidos)

  /**
   * A BASE VEM DO SERVIDOR, como `degrau: 0`, e não é montada aqui a partir de
   * `meta`. Ela precisa das mesmas grandezas dos outros pontos — inclusive a
   * contagem de obras por componente, que `meta` não tem —, e montar meio ponto
   * de um lado e a outra metade do outro criava duas definições do mesmo objeto.
   */
  const todos = consulta.data?.pontos ?? []
  const baseDoServidor = todos.find((p) => p.degrau === 0) ?? null
  /**
   * A CURVA MOSTRA TUDO O QUE RODOU; A FAIXA DIZ O QUE AINDA FALTA RODAR.
   *
   * São duas perguntas e dois lugares, e confundi-las já errou nas duas
   * direções. Primeiro a lista de degraus somava os já executados aos pedidos, e
   * definir "de 5 a 20" devolvia o cenário antigo de volta — a faixa parecia
   * ignorada. Depois a curva passou a mostrar só a faixa, e aí uma rodada de
   * +60% que alguém pagou para executar sumia do gráfico.
   *
   * O corte certo é por PAPEL: os chips são o PLANO (o que a faixa pede, e o que
   * o botão vai disparar) e o gráfico é o RESULTADO (tudo o que existe). Ponto
   * que rodou nunca sai do gráfico — foi execução de verdade, com custo de
   * cluster, e escondê-lo por causa de um filtro de tela seria jogar fora
   * resposta já paga.
   */
  const pontos = [
    ...(baseDoServidor ? [baseDoServidor] : []),
    ...[...melhor.entries()]
      .filter(([degrau]) => degrau > 0)
      .sort((a, b) => a[0] - b[0])
      .map(([, ponto]) => ponto),
  ]
  const pronta = curvaPronta(pontos)
  const temEstimativa = pontos.some((p) => p.estimativa && p.vpl !== null)
  const comparativo = comparativoDeObras(pontos)
  const orcamento = teto?.orcamentoTotal ?? null
  const emReais = (degrau: number) =>
    orcamento === null ? null : dinheiroDoDegrau(orcamento, degrau)

  /**
   * A rodada desta base em voo agora, para o sinal de vida. Ela NÃO bloqueia o
   * play: o pedido do dono do produto é enfileirar a varredura inteira e ir
   * lendo — e a fila é do servidor, que a serve na ordem.
   */
  const emExecucao = emVooDaBase(todos)
  /**
   * O PLANO É O DA FAIXA MAIS O QUE O SERVIDOR TEM EM VOO.
   *
   * Os campos são estado da tela e voltam ao padrão a cada visita; a fila é do
   * servidor e não volta. Quem disparou +30%, +115% e +200%, saiu e voltou,
   * encontrava os campos em 10–30 e o plano dizendo "vai rodar" para degraus
   * que ninguém pediu — enquanto os dois que estavam de fato na fila não
   * apareciam em lugar nenhum até responder. O que está em voo entra no plano
   * SEMPRE, esteja ou não na faixa digitada; só o play continua sendo o da
   * faixa.
   */
  const emVoo = pontosEmVoo(todos)
  const planoNaTela: SituacaoDoDegrau[] = [
    ...situacao,
    ...emVoo
      .filter((p) => !degrausPedidos.includes(p.degrau))
      .map((p) => ({ degrau: p.degrau, ponto: p, estado: 'em voo' as const })),
  ].sort((a, b) => a.degrau - b.degrau)
  /**
   * O PLANO: cada degrau pedido, e o que o play faz com ele. `ausente` e `erro`
   * vão para a fila; `em voo` e `pronto` são pulados — um já está na fila, o
   * outro já respondeu. Repetir um `pronto` seria legítimo (o servidor deduplica
   * e devolve a rodada que existe), mas custaria uma requisição para descobrir
   * o que a curva já mostra.
   */
  const aDisparar = situacao.filter((s) => s.estado === 'ausente' || s.estado === 'erro')
  const falhas = situacao.filter((s) => s.estado === 'erro' && s.ponto?.erro)
  /**
   * A falha foi de TEMPO DE SOLVER numa estimativa? Então repetir em 60s
   * reproduz o mesmo erro. O modo completo é o caminho — e é o que a própria
   * mensagem do motor sugere. Decidido POR DEGRAU, no play.
   */
  const modoDoDegrau = (s: SituacaoDoDegrau): ModoDaVariacao =>
    s.estado === 'erro' && faltouTempoDeSolver(s.ponto) ? 'completo' : modo
  const algumEscala = aDisparar.some((s) => modoDoDegrau(s) === 'completo')
  const soRepeticoes = aDisparar.length > 0 && aDisparar.every((s) => s.estado === 'erro')

  /**
   * O PLAY: cada degrau que falta vai para a fila, UM POST ATRÁS DO OUTRO.
   *
   * Em sequência, e não em paralelo, de propósito: cinco pedidos disparados
   * juntos foi o que saturou o Service Bus e devolveu 503 na primeira tentativa
   * real. Um atrás do outro, o barramento recebe cinco pedidos espaçados; para
   * quem clicou é um play só — a fila do servidor os roda na ordem, e a curva
   * vai se preenchendo.
   *
   * Uma recusa no meio PARA o play ali: os anteriores já estão na fila, o erro
   * fica na tela (`disparar.error`), e o próximo play retoma do que faltou —
   * porque o plano é recalculado do que a curva responde.
   */
  const play = async () => {
    setEnfileirando({ feito: 0, total: aDisparar.length })
    setForaDaCurva([])
    try {
      for (const [i, s] of aDisparar.entries()) {
        const m = modoDoDegrau(s)
        const resposta = await disparar.mutateAsync({
          runId: meta.runId,
          fator: fatorDoDegrau(s.degrau),
          nome: `${m === 'rapido' ? 'estimativa' : 'simulação'} +${s.degrau}% de CAPEX`,
          modo: m,
        })
        if (resposta.jaExistia && resposta.naCurva === false) {
          setForaDaCurva((lista) => [...lista, { degrau: s.degrau, runId: resposta.runId }])
        }
        setEnfileirando({ feito: i + 1, total: aDisparar.length })
      }
    } catch {
      // O erro já está em `disparar.error`; o play para aqui.
    } finally {
      // O BOTÃO SÓ VOLTA DEPOIS QUE A CURVA SOUBE DOS PEDIDOS. Sem isto havia
      // uma janela de segundos em que os POSTs já tinham voltado 201, mas a
      // consulta ainda dizia "vai rodar" para os três — e o botão, habilitado
      // sobre dado velho, aceitava um segundo play da mesma varredura.
      await consulta.refetch()
      setEnfileirando(null)
    }
  }

  const dinheiroDaVarredura = (() => {
    if (aDisparar.length === 0) return null
    const menor = emReais(aDisparar[0].degrau)
    const maior = emReais(aDisparar[aDisparar.length - 1].degrau)
    if (!menor || !maior) return null
    return aDisparar.length === 1
      ? `+${brlMi(menor.aMais)} no plano`
      : `+${brlMi(menor.aMais)} a +${brlMi(maior.aMais)} no plano`
  })()

  const rotuloDoPlay = enfileirando
    ? `Enfileirando ${Math.min(enfileirando.feito + 1, enfileirando.total)} de ${enfileirando.total}…`
    : !varreduraOk
      ? 'Rodar'
      : aDisparar.length === 0
        ? // Em voo DENTRO ou FORA da faixa: dizer "curva completa" com um
          // "+115% · rodando" logo abaixo contradiria o próprio plano.
          situacao.some((s) => s.estado === 'em voo') || emVoo.length > 0
          ? 'Na fila — a curva vai se completando'
          : 'Curva completa nesta faixa'
        : `${soRepeticoes ? 'Tentar de novo' : 'Rodar'} ${aDisparar.length} ${
            aDisparar.length === 1 ? 'ponto' : 'pontos'
          }${algumEscala ? ' · completo' : ''}${dinheiroDaVarredura ? ` · ${dinheiroDaVarredura}` : ''}`

  return (
    <div className="flex flex-col gap-4">
      <div className="carta p-5">
        {/* UMA LINHA SÓ: o campo e o botão lado a lado. Com o texto fora, a coluna
            à direita que existia para não brigar com o parágrafo perdeu a razão —
            e empilhados eles liam como dois passos separados, quando são um. */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {/* O TÍTULO É SÓ PARA LEITOR DE TELA (`sr-only`), e a razão é estrutura:
              este é o primeiro cabeçalho depois do `h1` do nível, e sumir com ele
              faria quem navega por títulos pular direto do nível para o gráfico,
              como se a seção não existisse. Visualmente a tela não precisa dele —
              a aba já se chama Sensibilidade, e o campo diz o que faz.

              A CONVENÇÃO DO DINHEIRO sobrevive onde ela é lida: o botão diz
              "+R$ 126,0 Mi NO PLANO". Sem esse qualificador, "+35%" ao lado de um
              valor em reais convida a ler o dinheiro como verba anual — erro de um
              fator igual ao número de anos do plano. */}
          <h2 className="sr-only">Sensibilidade ao CAPEX</h2>
          <SeletorDeVarredura
            varredura={varredura}
            aoTrocar={setVarredura}
            problema={problema}
            desabilitado={!!enfileirando}
          />
          <button
            type="button"
            onClick={() => void play()}
            disabled={!varreduraOk || !!enfileirando || aDisparar.length === 0}
            className="rounded-full bg-water-600 px-4 py-2 text-[13px] font-bold text-white transition-colors duration-hover ease-saida hover:bg-water-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {rotuloDoPlay}
          </button>
        </div>

        {/* O PLANO, degrau a degrau: o que vai rodar, o que já está na fila, o
            que já respondeu. É a resposta a "o que o play vai fazer?" antes do
            clique, e "o que falta?" depois dele. */}
        {varreduraOk && <PlanoDaVarredura situacao={planoNaTela} />}

        {disparar.error && (
          <p role="alert" className="mt-3 rounded-xl border border-danger/25 bg-warning/10 px-3.5 py-2.5 text-[12.5px] text-ink-700">
            O servidor recusou um dos pedidos: {disparar.error.message} Os anteriores já
            estão na fila; o próximo play retoma do que faltou.
          </p>
        )}

        {/* O TETO SÓ ENQUANTO NÃO HÁ CURVA.
            Ele responde a pergunta ANTERIOR — "vale a pena gastar execução com
            isto?" —, e essa pergunta se fecha no instante em que o primeiro
            degrau publica. Depois disso ele é uma tabela de estimativas
            competindo com medições, e meia página de teto entre o cabeçalho e o
            primeiro gráfico empurraria para baixo justamente o que a pessoa veio
            ver. */}
        {teto && !pronta && <Teto teto={teto} />}

        {/* POR QUE O DEGRAU FALHOU, na tela.
            Ele aparecia como "erro" e mais nada. Quem olhava não tinha como
            saber se valia tentar de novo, mudar de modo ou desistir — e a
            resposta estava gravada no banco, com a frase que o próprio motor
            escreveu dizendo o que fazer. Uma explicação que só existe no banco
            vira pergunta para outra pessoa. */}
        {falhas.map((f) => (
          <div
            key={f.degrau}
            className="mt-3 rounded-xl border border-warning/40 bg-warning/10 px-3.5 py-3"
          >
            <p className="text-[12.5px] leading-relaxed text-ink-700">
              <strong className="font-semibold">+{f.degrau}% não completou.</strong>{' '}
              {f.ponto?.erro}
            </p>
            {modoDoDegrau(f) === 'completo' && (
              /* A SUGESTÃO É TROCAR DE MODO, e não repetir. Tentar de novo em 60s
                 reproduz a falha e gasta cluster para chegar ao mesmo lugar: o
                 motor tem um defeito conhecido que aparece quando o solver não
                 tem tempo para a janela, e nas unidades grandes 60s bastam para
                 provocá-lo. */
              <p className="mt-1.5 text-[12px] text-ink-600">
                Foi uma estimativa de 60s. Nesta unidade o solver precisa de mais
                tempo — no próximo play este degrau roda como{' '}
                <strong className="font-semibold text-ink-800">simulação completa</strong>.
              </p>
            )}
          </div>
        ))}

        {/* A VARIAÇÃO EXISTIA, MAS NÃO É DESTA CURVA.
            O servidor deduplica por PARÂMETROS: se o mesmo orçamento escalado já
            tinha sido rodado e já pertence à curva de outra rodada, ele devolve
            aquela em vez de abrir uma nova. Sem esta linha, o clique respondia
            "deu certo" e o ponto continuava faltando no gráfico, sem explicação. */}
        {foraDaCurva.map((f) => (
          <p
            key={f.degrau}
            className="mt-3 rounded-xl border border-ink-200 bg-ink-50 px-3.5 py-2.5 text-[12.5px] text-ink-600"
          >
            +{f.degrau}% já foi simulado, mas é ponto da curva de outra rodada — por isso
            não entra neste gráfico. Abra{' '}
            <Link
              to={`/resultados/${f.runId}`}
              className="font-semibold text-water-700 underline underline-offset-2"
            >
              o resultado dele
            </Link>
            .
          </p>
        ))}

        {emExecucao?.ponto && (
          <SinalDeVida
            runId={emExecucao.ponto.runId}
            degrau={emExecucao.degrau}
            estimativa={emExecucao.ponto.estimativa}
          />
        )}
      </div>

      {pronta && (
        <>
          {/* OS QUATRO QUADROS NA MESMA PÁGINA, UM POR LINHA.
              Eram três lado a lado numa aba e o de obras noutra. As duas
              escolhas vinham de quando isto morava dentro do Plano e disputava
              espaço; com a aba própria, as duas custam mais do que rendem.

              A aba interna cobrava um clique para ver metade da análise, e a
              metade escondida é justamente a que responde "o que foi construído
              a mais" — a pergunta que a operação faz depois de ver a curva.

              Três num terço da largura davam ~330px para seis pontos: a
              inclinação, que é o assunto inteiro, virava um traço. Largura
              cheia e mais altura é o que torna 43,8% → 44,7% legível como
              subida em vez de linha reta. */}
          {MEDIDAS.map((m) => (
            <Curva key={m.chave} medida={m} pontos={pontos} orcamento={orcamento} />
          ))}

          {temEstimativa && (
            /* IDENTIDADE NUNCA SÓ PELA COR NEM SÓ PELA FORMA: o ponto vazado
               marca a estimativa no desenho, e esta linha a nomeia por escrito.
               Sem ela, quem lê a curva não tem como saber que um dos pontos
               parou no relógio em vez de fechar a prova. */
            <p className="text-[12px] text-ink-water">
              Os pontos vazados (○) são{' '}
              <strong className="font-semibold text-ink-700">estimativas rápidas</strong>: a mesma
              otimização com 60s de solver em vez de 1000s. Servem para ler a inclinação. Para
              decidir sobre um degrau, rode-o em modo completo.
            </p>
          )}

          {comparativo && <QuadroDeObras comparativo={comparativo} orcamento={orcamento} />}
        </>
      )}
    </div>
  )
}

/**
 * A VARREDURA — mínimo, máximo e quantos pontos entre eles.
 *
 * Três controles, e a frase abaixo diz o que eles rendem ("4 pontos: +10%, +20%,
 * +30%, +40%") ANTES do play: faixa estreita rende menos degraus que os pedidos
 * (inteiros, sem repetição), e a pessoa vê isso aqui, não no gráfico.
 *
 * A RECUSA ACONTECE ANTES DO SERVIDOR: faixa fora de 1% a 200%, máximo menor
 * que o mínimo, mais de três intermediários — nada disso vira requisição, e a
 * frase diz o que consertar em vez de devolver um 422.
 */
function SeletorDeVarredura({
  varredura,
  aoTrocar,
  problema,
  desabilitado,
}: {
  varredura: Varredura
  aoTrocar: (v: Varredura) => void
  problema: string | null
  desabilitado: boolean
}) {
  const degraus = degrausDaVarredura(varredura)
  /* `text` COM `inputMode="numeric"`, e nao `type="number"`: o campo de numero
     vem com setinhas que aqui nao servem, e com o cursor sobre ele a RODA DO
     MOUSE muda o valor — rolar a pagina alteraria o que vai ser rodado. O
     filtro deixa passar so digito: colar "35%" resulta em 35. */
  const campo = (
    rotulo: string,
    valor: number,
    aoMudar: (n: number) => void,
    largura = 'w-[4.5rem]',
  ) => (
    <input
      type="text"
      inputMode="numeric"
      value={valor === 0 ? '' : String(valor)}
      disabled={desabilitado}
      onChange={(e) => aoMudar(Number(e.target.value.replace(/\D/g, '')) || 0)}
      className={`${largura} rounded-lg border border-ink-200 bg-white px-2 py-1 text-right font-mono text-[12.5px] tabular-nums text-ink-800 focus:border-water-500 focus:outline-none disabled:opacity-50`}
      aria-label={rotulo}
    />
  )
  return (
    <div className="flex flex-col gap-1.5 text-[12.5px] text-ink-600">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="flex items-center gap-1.5">
          <span>CAPEX anual de</span>
          <span className="font-mono text-ink-800">+</span>
          {campo('Acréscimo mínimo de CAPEX por ano, em %', varredura.minimo, (minimo) =>
            aoTrocar({ ...varredura, minimo }),
          )}
          <span>%</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span>a</span>
          <span className="font-mono text-ink-800">+</span>
          {campo('Acréscimo máximo de CAPEX por ano, em %', varredura.maximo, (maximo) =>
            aoTrocar({ ...varredura, maximo }),
          )}
          <span>%</span>
        </span>
        <label className="flex items-center gap-1.5">
          <span>com</span>
          <select
            value={varredura.intermediarios}
            disabled={desabilitado || varredura.minimo === varredura.maximo}
            onChange={(e) => aoTrocar({ ...varredura, intermediarios: Number(e.target.value) })}
            className="rounded-lg border border-ink-200 bg-white px-2 py-1 font-mono text-[12.5px] tabular-nums text-ink-800 focus:border-water-500 focus:outline-none disabled:opacity-50"
            aria-label="Pontos entre o mínimo e o máximo"
          >
            {Array.from({ length: MAXIMO_DE_INTERMEDIARIOS + 1 }, (_, n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <span>{varredura.intermediarios === 1 ? 'ponto entre' : 'pontos entre'}</span>
        </label>
      </div>
      {problema ? (
        <span className="text-[12px] font-semibold text-amber-700">{problema}</span>
      ) : (
        <span className="text-[12px] text-ink-water">
          {degraus.length} {degraus.length === 1 ? 'ponto' : 'pontos'}:{' '}
          {degraus.map((d) => `+${d}%`).join(', ')}
        </span>
      )}
    </div>
  )
}

const TOM_DO_ESTADO: Record<EstadoDoDegrau, Tom> = {
  ausente: 'neutro',
  'em voo': 'azul',
  pronto: 'teal',
  erro: 'vermelho',
}

const ROTULO_DO_ESTADO: Record<EstadoDoDegrau, string> = {
  ausente: 'vai rodar',
  'em voo': 'na fila',
  pronto: 'pronto',
  erro: 'falhou',
}

/** "Em voo" são dois estados do servidor, e a tela diz qual: na fila ou rodando. */
function rotuloDoDegrau(s: SituacaoDoDegrau): string {
  if (s.estado === 'em voo' && s.ponto?.status === 'RODANDO') return 'rodando'
  return ROTULO_DO_ESTADO[s.estado]
}

/**
 * O PLANO, degrau a degrau. A palavra ao lado do número diz o que o play faz
 * com ele — e é ela, não a cor, que carrega a informação.
 */
function PlanoDaVarredura({ situacao }: { situacao: SituacaoDoDegrau[] }) {
  return (
    <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Plano da varredura">
      {situacao.map((s) => (
        <li key={s.degrau}>
          <Tag tom={TOM_DO_ESTADO[s.estado]}>
            <span className="font-mono tabular-nums">+{s.degrau}%</span>
            <span className="font-normal opacity-80">
              {' '}· {rotuloDoDegrau(s)}
              {s.estado === 'pronto' && s.ponto?.estimativa ? ' ○' : ''}
            </span>
          </Tag>
        </li>
      ))}
    </ul>
  )
}

/**
 * O TETO — a resposta que não custa execução.
 *
 * É um LIMITE SUPERIOR, e a palavra é literal: o servidor resolve um problema de
 * propósito mais fácil que o real (só a restrição de dinheiro, sem precedência,
 * ETE ou janela), e relaxar restrição só pode aumentar o ótimo. Serve para
 * descartar — "nem no melhor caso dá" —, nunca para prometer.
 *
 * A frase de escala vem antes da tabela porque é ela que decide se a tabela
 * importa. "Trazer todas custaria 18× o orçamento" já responde à pergunta na
 * maioria das unidades.
 */
function Teto({ teto }: { teto: TetoDeSensibilidade }) {
  const vezes = vezesOOrcamento(teto)
  const maiorDegrau = teto.degraus[teto.degraus.length - 1]
  const fracaoMaxima = teto.subbaciasFora
    ? (maiorDegrau?.subbaciasNoMaximo ?? 0) / teto.subbaciasFora
    : 0

  return (
    <div className="mt-4 rounded-2xl border border-ink-200 bg-ink-50/60 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-[13px] font-bold text-ink-800">Antes de simular: o teto</h4>
        <span className="text-[11.5px] text-ink-water">
          limite superior — precedência e ETE só reduzem
        </span>
      </div>

      <p className="mt-2 text-[12.5px] leading-relaxed text-ink-600">
        <strong className="font-semibold text-ink-800">{inteiro(teto.subbaciasFora)}</strong>{' '}
        sub-bacias ficaram fora do plano, prendendo{' '}
        <strong className="font-semibold text-ink-800">{vazao(teto.vazaoTotalPresa)}</strong>.
        Trazer todas custaria {brlMi(teto.capexParaTodas)}
        {vezes !== null && (
          <>
            {' '}
            — <strong className="font-semibold text-ink-800">
              {vezes.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}×
            </strong>{' '}
            o
            orçamento desta rodada
          </>
        )}
        . Com +{maiorDegrau?.degrau ?? 50}%, no máximo{' '}
        <strong className="font-semibold text-ink-800">
          {inteiro(maiorDegrau?.subbaciasNoMaximo ?? 0)}
        </strong>{' '}
        delas ({pct(fracaoMaxima * 100)}) caberiam no dinheiro a mais —{' '}
        {brlMi(maiorDegrau?.folga ?? 0)} somados os{' '}
        {teto.anosDoPlano > 0 ? `${teto.anosDoPlano} anos` : 'anos'} do plano.
        {teto.subbaciasSemCapexProprio > 0 && (
          <>
            {' '}
            Dessas, {inteiro(teto.subbaciasSemCapexProprio)} não têm obra própria pendente:
            no teto elas entram sem custo, mas o que as prende é precedência ou capacidade —
            orçamento sozinho não as resolve.
          </>
        )}
      </p>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[420px] border-collapse text-[12px] tabular-nums">
          <caption className="sr-only">
            Teto por degrau de orçamento: o orçamento do plano com o acréscimo, o máximo de
            sub-bacias e o máximo de vazão que esse dinheiro poderia destravar.
          </caption>
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-ink-water">
              <th scope="col" className="pb-1.5 pr-3 font-semibold">
                CAPEX por ano
              </th>
              <th scope="col" className="pb-1.5 pr-3 text-right font-semibold">
                orçamento do plano
              </th>
              <th scope="col" className="pb-1.5 pr-3 text-right font-semibold">
                sub-bacias, no máx.
              </th>
              <th scope="col" className="pb-1.5 text-right font-semibold">
                vazão, no máx.
              </th>
            </tr>
          </thead>
          <tbody>
            {teto.degraus.map((d) => (
              <tr key={d.degrau} className="border-t border-ink-200/70">
                <th
                  scope="row"
                  className="py-1.5 pr-3 text-left font-mono font-semibold text-ink-700"
                >
                  +{d.degrau}%
                </th>
                {/* O TOTAL NOVO E O ACRÉSCIMO, juntos. `folga` é o dinheiro a
                    mais NO PLANO INTEIRO (a soma dos anos), e não por ano —
                    mostrar só ele ao lado de "+10%" convidava a lê-lo como
                    valor anual, errando por um fator igual ao número de anos. */}
                <td className="py-1.5 pr-3 text-right text-ink-600">
                  {brlMi(teto.orcamentoTotal + d.folga)}
                  <span className="ml-1.5 text-ink-water">(+{brlMi(d.folga)})</span>
                </td>
                <td className="py-1.5 pr-3 text-right font-semibold text-ink-800">
                  {inteiro(d.subbaciasNoMaximo)}
                </td>
                <td className="py-1.5 text-right text-ink-600">{vazao(d.vazaoNoMaximo)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/**
 * O QUE O DINHEIRO A MAIS CONSTRÓI — obras por tipo, a cada degrau.
 *
 * A curva diz que a cobertura sobe 0,4 ponto; ela não diz o que foi construído
 * para isso. Esta é a leitura FÍSICA do mesmo resultado, e é nela que a operação
 * consegue discutir o plano: "mais dois troncos e um módulo de ETE" é uma frase
 * que alguém verifica em campo; "+0,4 p.p." não é.
 *
 * BARRA EMPILHADA POR COMPONENTE, o mesmo desenho do cronograma de obras, e de
 * propósito: é a mesma grandeza (obras contadas por tipo) e as cores são as
 * mesmas da casa — azul é "Rede coletora" aqui como em qualquer outro quadro.
 * O eixo mostra o valor ABSOLUTO, e não o delta, porque um plano de 87 obras com
 * 10 a mais é uma leitura diferente de um plano de 10 obras com 10 a mais.
 *
 * A VARIAÇÃO VIVE NA LEGENDA, e não num segundo gráfico. Ela é o assunto, e a
 * legenda é obrigatória de qualquer forma: juntá-las dá a identidade da série e
 * a resposta no mesmo lugar, em vez de obrigar o olho a ir e voltar.
 */
function QuadroDeObras({
  comparativo,
  orcamento,
}: {
  comparativo: ComparativoDeObras
  orcamento: number | null
}) {
  const ultimo = comparativo.porDegrau[comparativo.porDegrau.length - 1]
  const dinheiro = orcamento === null ? null : dinheiroDoDegrau(orcamento, ultimo.degrau)

  return (
    <QuadroGrafico
      titulo="Obras construídas por tipo"
      subtitulo={`${inteiro(comparativo.totalHoje)} hoje → ${inteiro(ultimo.total)} com +${ultimo.degrau}%${dinheiro ? ` (${brlMi(dinheiro.aMais)} a mais)` : ''}`}
      nota="obra construída pela concessão, sem as de terceiro — a mesma regra do total de obras no cabeçalho da rodada"
      escopo="plano inteiro"
      tabela={{
        colunas: [
          'Componente',
          'hoje',
          ...comparativo.porDegrau.filter((d) => d.degrau > 0).map((d) => `+${d.degrau}%`),
        ],
        linhas: [
          ...comparativo.linhas.map((l) => [
            l.nome,
            l.hoje,
            /* Contagem e variação na MESMA célula: são a resposta e o seu
               contexto, e separá-las em duas colunas por degrau dobraria a
               largura da tabela para dizer o mesmo. */
            ...l.celulas.map((c) => `${c.construidas} (${sinal(c.delta)})`),
          ]),
          [
            'Total',
            comparativo.totalHoje,
            ...comparativo.porDegrau
              .filter((d) => d.degrau > 0)
              .map((d) => `${d.total} (${sinal(d.delta)})`),
          ],
        ],
      }}
    >
      <div className="viz-root h-[360px] px-1">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={comparativo.porDegrau} margin={{ top: 12, right: 14, bottom: 4, left: 4 }}>
            <CartesianGrid stroke="var(--viz-grid)" vertical={false} />
            <XAxis
              dataKey="rotulo"
              tick={{ fontSize: 11, fill: 'var(--viz-ink-muted)' }}
              axisLine={{ stroke: 'var(--viz-axis)' }}
              tickLine={false}
            />
            <YAxis
              width={40}
              allowDecimals={false}
              tick={{ fontSize: 11, fill: 'var(--viz-ink-muted)' }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              cursor={{ fill: 'color-mix(in srgb, var(--viz-ink) 4%, transparent)' }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null
                const col = comparativo.porDegrau.find((d) => d.rotulo === label)
                return (
                  <div className="rounded-xl border border-ink-200 bg-white px-3 py-2 shadow-elev">
                    <div className="mb-1 text-[11px] font-bold text-ink-800">
                      {label} · {inteiro(col?.total)} obras
                      {col && col.degrau > 0 ? ` (${sinal(col.delta)})` : ''}
                    </div>
                    <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
                      {payload
                        .filter((s) => Number(s.value) > 0)
                        .map((s) => (
                          <li key={String(s.name)} className="flex items-center gap-2 text-[11px]">
                            <span
                              aria-hidden="true"
                              className="h-2 w-2 shrink-0 rounded-sm"
                              style={{ background: s.color }}
                            />
                            <span className="text-ink-water">{s.name}</span>
                            <span className="ml-auto font-mono font-semibold tabular-nums text-ink-800">
                              {inteiro(Number(s.value))}
                            </span>
                          </li>
                        ))}
                    </ul>
                  </div>
                )
              }}
            />
            {comparativo.componentes.map((nome) => (
              <Bar
                key={nome}
                dataKey={nome}
                stackId="obras"
                fill={corDoComponente(nome)}
                maxBarSize={54}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* LEGENDA E VARIAÇÃO NO MESMO LUGAR. Ver o cabeçalho deste componente. */}
      <ul className="mt-3 flex list-none flex-wrap gap-x-5 gap-y-1.5 p-0 text-[12px]">
        {comparativo.linhas.map((l) => {
          const d = l.celulas[l.celulas.length - 1]?.delta ?? 0
          return (
            <li key={l.nome} className="flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="h-2.5 w-2.5 shrink-0 rounded-sm"
                style={{ background: corDoComponente(l.nome) }}
              />
              <span className="text-ink-600">{l.nome}</span>
              <span
                className={`font-mono font-semibold tabular-nums ${
                  d > 0 ? 'text-aegea-700' : d < 0 ? 'text-amber-700' : 'text-ink-water'
                }`}
              >
                {sinal(d)}
              </span>
            </li>
          )
        })}
      </ul>
      <p className="mt-2 text-[11.5px] leading-relaxed text-ink-water">
        A variação é contra o plano de hoje, no maior degrau já rodado (+{ultimo.degrau}%). Um
        componente pode aparecer com <span className="font-mono">−1</span>: com mais orçamento o
        otimizador <strong className="font-semibold text-ink-600">rearranja</strong>, e trocar uma
        rede por um tronco pode render mais vazão por real.
      </p>
    </QuadroGrafico>
  )
}

/** "+2", "−1", "0" — o sinal explícito, porque a coluna é de VARIAÇÃO. */
function sinal(n: number): string {
  if (n > 0) return `+${n}`
  if (n < 0) return `−${Math.abs(n)}`
  return '0'
}

function Curva({
  medida,
  pontos,
  orcamento,
}: {
  medida: Medida
  pontos: PontoDaCurva[]
  orcamento: number | null
}) {
  const dados = pontos
    .filter((p) => medida.valor(p) !== null)
    .sort((a, b) => a.degrau - b.degrau)
    .map((p) => ({
      degrau: p.degrau,
      valor: medida.valor(p) as number,
      estimativa: p.estimativa,
    }))

  const base = dados.find((d) => d.degrau === 0)?.valor ?? null
  const ultimo = dados[dados.length - 1]
  /** Quanto muda entre a rodada atual e o maior degrau já rodado. */
  const variacao = base !== null && ultimo ? ultimo.valor - base : null

  return (
    <QuadroGrafico
      titulo={medida.titulo}
      subtitulo={
        variacao === null
          ? medida.nota
          : `${medida.formatar(base as number)} → ${medida.formatar(ultimo.valor)} com +${ultimo.degrau}%${
              orcamento === null
                ? ''
                : ` (${brlMi(dinheiroDoDegrau(orcamento, ultimo.degrau).aMais)} a mais)`
            }`
      }
      nota={medida.nota}
      escopo="plano inteiro"
      /* O desenho é `aria-hidden`; esta tabela É a leitura para quem não o vê —
         e também para quem quer o número exato em vez do ponto. A coluna de
         origem existe pela mesma razão do ponto vazado: sem ela, a tabela
         apagaria a diferença entre estimativa e simulação. */
      tabela={{
        colunas: ['CAPEX por ano', 'orçamento do plano', medida.titulo, 'origem'],
        linhas: dados.map((d) => [
          d.degrau === 0 ? 'orçamento de hoje' : `+${d.degrau}%`,
          orcamento === null
            ? '—'
            : brlMi(dinheiroDoDegrau(orcamento, d.degrau).novoTotal),
          medida.formatar(d.valor),
          d.estimativa ? 'estimativa (60s)' : 'simulação',
        ]),
      }}
    >
      {/* MAIS ALTO do que era dentro do Plano: a aba é só desta análise,
          e altura é o que uma curva de seis pontos precisa para a inclinação
          aparecer. Espremida em 190px, uma variação de 0,9 ponto de cobertura
          virava uma linha reta. */}
      <div className="viz-root h-[300px] px-1">
        <ResponsiveContainer width="100%" height="100%">
          {/* `right: 26`: o rótulo do último degrau é centrado no ponto, que
              fica na borda — com margem menor, metade de "+50%" some. */}
          <LineChart data={dados} margin={{ top: 12, right: 26, bottom: 4, left: 4 }}>
            <CartesianGrid stroke="var(--viz-grid)" vertical={false} />
            <XAxis
              dataKey="degrau"
              tickFormatter={(d: number) => (d === 0 ? 'hoje' : `+${d}%`)}
              tick={{ fontSize: 11, fill: 'var(--viz-ink-muted)' }}
              axisLine={{ stroke: 'var(--viz-axis)' }}
              tickLine={false}
            />
            <YAxis
              width={medida.larguraEixo}
              allowDecimals={!medida.eixoInteiro}
              tick={{ fontSize: 11, fill: 'var(--viz-ink-muted)' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => medida.formatar(v)}
            />
            <Tooltip
              formatter={(v) => [medida.formatar(Number(v)), medida.titulo] as [string, string]}
              labelFormatter={(d) => {
                const g = Number(d)
                if (g === 0) return 'orçamento de hoje'
                const r = orcamento === null ? null : dinheiroDoDegrau(orcamento, g)
                return `+${g}% ao ano${r ? ` · ${brlMi(r.aMais)} a mais no plano` : ''}`
              }}
              contentStyle={{
                borderRadius: 10,
                border: '1px solid var(--viz-grid)',
                fontSize: 12,
              }}
            />
            {/* Marca em cada ponto de propósito: cada um é uma otimização que
                alguém pagou para rodar — escondê-los faria a curva parecer
                contínua, que é justamente o que ela não é. O ponto VAZADO é a
                estimativa, e a forma carrega essa distinção sem depender de cor. */}
            <Line
              type="monotone"
              dataKey="valor"
              stroke={medida.cor}
              strokeWidth={2}
              dot={(props: unknown) => {
                const { cx, cy, payload, index } = props as {
                  cx: number
                  cy: number
                  index: number
                  payload: { estimativa: boolean }
                }
                return (
                  <circle
                    key={index}
                    cx={cx}
                    cy={cy}
                    r={3.5}
                    fill={payload.estimativa ? '#ffffff' : medida.cor}
                    stroke={medida.cor}
                    strokeWidth={payload.estimativa ? 1.6 : 0}
                  />
                )
              }}
              activeDot={{ r: 5 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </QuadroGrafico>
  )
}

/**
 * O SINAL DE VIDA DA RODADA EM CURSO.
 *
 * Existe por causa de uma falha observada: cinco rodadas foram disparadas, a
 * tela não disse nada sobre nenhuma delas, e quem esperava concluiu que estava
 * travado e apagou as cinco. Nada estava travado — havia UM executor de
 * capacidade 1 processando a primeira, com as outras na fila.
 *
 * Então o que falta não é velocidade, é notícia. E a notícia útil não é
 * "processando": é a POSIÇÃO NA FILA e o motivo, que o backend já calcula e
 * ninguém consumia — incluindo o caso "nenhum executor está ativo", que é
 * indistinguível de "fila cheia" para quem só vê uma barra girando.
 */
function SinalDeVida({
  runId,
  degrau,
  estimativa,
}: {
  runId: string
  degrau: number
  estimativa: boolean
}) {
  const status = useStatusDaRodada(runId, true)
  const d = status.data

  if (!d) {
    return <p className="mt-3 text-[12px] text-ink-water">Consultando a rodada de +{degrau}%…</p>
  }

  const fila = d.fila
  const semExecutor = fila?.vivos === 0
  return (
    <div
      className={`mt-3 rounded-xl border px-3.5 py-2.5 ${
        semExecutor || fila?.atencao ? 'border-warning/30 bg-warning/10' : 'border-ink-200 bg-ink-50'
      }`}
    >
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[12.5px]">
        <span className="font-semibold text-ink-800">
          <span className="font-mono">+{degrau}%</span> · {d.status.toLowerCase()}
        </span>
        <span className="text-ink-water">
          {estimativa ? 'estimativa · 60s' : 'simulação completa'}
        </span>
        {d.progresso > 0 && d.status === 'RODANDO' && (
          <span className="font-mono text-ink-600">{d.progresso}%</span>
        )}
        {fila?.motivo && <span className="text-ink-600">{fila.motivo}</span>}
      </div>
      {d.status === 'RODANDO' && (
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-ink-200">
          <div
            className="h-full rounded-full bg-water-600 transition-[width] duration-mover ease-saida"
            style={{ width: `${Math.max(3, d.progresso)}%` }}
          />
        </div>
      )}
      <p className="mt-1.5 text-[11.5px] text-ink-water">
        A curva se completa sozinha quando ela publicar — dá para sair desta tela.
      </p>
    </div>
  )
}
