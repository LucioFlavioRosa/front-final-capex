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
import { useEffect, useRef, useState } from 'react'
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
import { useDispararVariacao, useSensibilidade, useStatusDaRodada } from '@/rodada/api/queries'
import type { ModoDaVariacao } from '@/rodada/api/endpoints'
import {
  FAIXA_PADRAO,
  MAIOR_DEGRAU,
  MAXIMO_DE_PONTOS,
  MINIMO_DE_PONTOS,
  comparativoDeObras,
  curvaPronta,
  dinheiroDoDegrau,
  emVooDaBase,
  faltouTempoDeSolver,
  fatorDoDegrau,
  faixaValida,
  melhorPorDegrau,
  pontosDaFaixa,
  pontosForaDaFaixa,
  proximoDegrau,
  situacaoDaVarredura,
  vezesOOrcamento,
  type ComparativoDeObras,
  type EstadoDoDegrau,
  type Faixa,
  type PontoDaCurva,
  type TetoDeSensibilidade,
} from '@/rodada/domain/sensibilidade'
import { brlMi, inteiro, pct, vazao } from '@/rodada/lib/formato'
import { corDoComponente } from '@/rodada/components/cores'
import type { RunMeta } from '@/rodada/domain/resultado'

/** A cor de cada estado do degrau. `erro` é ÂMBAR, e não vermelho: dá para
 *  tentar de novo ali mesmo, então não é um beco. */
const CHIP: Record<EstadoDoDegrau, string> = {
  ausente: 'border-ink-200 bg-ink-50 text-ink-500',
  'em voo': 'border-water-500/30 bg-water-50 text-water-700',
  pronto: 'border-aegea-500/30 bg-aegea-50 text-aegea-700',
  erro: 'border-warning/40 bg-warning/10 text-amber-800',
}

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
   * A FAIXA VIVE NA TELA, e não no servidor.
   *
   * Ela é uma pergunta em aberto — "e se fosse de 5 a 15?" —, não uma
   * propriedade da rodada, e guardá-la obrigaria a decidir de quem ela é quando
   * duas pessoas olham a mesma rodada com intervalos diferentes. O que persiste
   * são os PONTOS que rodaram, e esses o servidor guarda.
   */
  const [faixa, setFaixa] = useState<Faixa>({ ...FAIXA_PADRAO })
  const degrausPedidos = pontosDaFaixa(faixa)
  const consulta = useSensibilidade(meta.runId, faixaValida(faixa) ? faixa : FAIXA_PADRAO)
  const disparar = useDispararVariacao()

  /**
   * O MODO É ESCOLHA DE QUEM OLHA, e o padrão é a estimativa.
   *
   * O padrão importa mais que o controle: quase toda análise de sensibilidade
   * termina em "a curva é plana" ou "sobe pouco", e gastar oitenta minutos de
   * cluster para chegar lá é desperdício que ninguém percebe estar fazendo. A
   * simulação completa continua a um clique, para o degrau que a pessoa quiser
   * confirmar depois de ver a inclinação.
   */
  const [modo, setModo] = useState<ModoDaVariacao>('rapido')

  const teto = consulta.data?.teto ?? null
  const melhor = melhorPorDegrau(consulta.data?.pontos ?? [])
  const situacao = situacaoDaVarredura(melhor, degrausPedidos)
  /** Pontos que já rodaram e ficaram fora da faixa atual — ver a frase abaixo. */
  const fora = pontosForaDaFaixa(melhor, degrausPedidos)

  /**
   * A BASE VEM DO SERVIDOR, como `degrau: 0`, e não é montada aqui a partir de
   * `meta`. Ela precisa das mesmas grandezas dos outros pontos — inclusive a
   * contagem de obras por componente, que `meta` não tem —, e montar meio ponto
   * de um lado e a outra metade do outro criava duas definições do mesmo objeto.
   */
  const todos = consulta.data?.pontos ?? []
  const baseDoServidor = todos.find((p) => p.degrau === 0) ?? null
  const pontos = [
    ...(baseDoServidor ? [baseDoServidor] : []),
    ...situacao.map((s) => s.ponto).filter((p): p is PontoDaCurva => !!p),
  ]
  const pronta = curvaPronta(pontos)
  const temEstimativa = pontos.some((p) => p.estimativa && p.vpl !== null)
  const comparativo = comparativoDeObras(pontos)
  const orcamento = teto?.orcamentoTotal ?? null
  const emReais = (degrau: number) =>
    orcamento === null ? null : dinheiroDoDegrau(orcamento, degrau)

  // PELA BASE, e não pela faixa: o bloqueio é regra da FILA, e a fila não sabe
  // qual faixa está na tela. Ver `emVooDaBase`.
  const emExecucao = emVooDaBase(todos)
  const proximo = proximoDegrau(situacao)
  const falhou = situacao.find((s) => s.estado === 'erro' && s.degrau === proximo) ?? null
  const jaFalhou = !!falhou
  /**
   * A falha foi de TEMPO DE SOLVER numa estimativa? Então repetir em 60s
   * reproduz o mesmo erro. O modo completo é o caminho — e é o que a própria
   * mensagem do motor sugere.
   */
  const escalar = faltouTempoDeSolver(falhou?.ponto ?? null)
  const modoDoPedido: ModoDaVariacao = escalar ? 'completo' : modo
  const faltam = situacao.filter((s) => s.estado === 'ausente' || s.estado === 'erro').length

  const pedir = (degrau: number, forcado?: ModoDaVariacao) => {
    const m = forcado ?? modo
    disparar.mutate({
      runId: meta.runId,
      fator: fatorDoDegrau(degrau),
      nome: `${m === 'rapido' ? 'estimativa' : 'simulação'} +${degrau}% de CAPEX`,
      modo: m,
    })
  }

  /**
   * A VARREDURA COMPLETA, UMA DE CADA VEZ.
   *
   * A rodada que a pessoa mandou rodar é uma simulação normal, com o tempo de
   * solver de sempre. A ANÁLISE dela é outra coisa: cinco variações de +10% a
   * +50%, em modo rápido, que existem para mostrar a inclinação e não para
   * decidir um plano. Pedir os cinco degraus é o uso esperado — e é justamente
   * por isso que ele não pode virar cinco `POST` de uma vez.
   *
   * A primeira tentativa real fez exatamente isso e mostrou por que é errado por
   * construção: o executor tem CAPACIDADE 1, as cinco viraram uma fila, e uma
   * delas voltou 503 do Service Bus porque cinco pedidos juntos saturaram a
   * fila. Quem olhava a tela via quatro paradas e uma com erro.
   *
   * Então a varredura é um ESTADO, não um lote: com ela ligada, o painel pede o
   * próximo degrau assim que o anterior sai de voo. A fila nunca vê mais de um
   * pedido, e a tela continua podendo ser fechada — ao voltar, a varredura
   * mostra o que já publicou (o estado local se perde; os resultados, não).
   */
  const [varrendo, setVarrendo] = useState(false)

  /** O último degrau que ESTA sessão pediu. Sem ele o efeito abaixo repetiria o
   *  mesmo pedido a cada render enquanto o servidor não confirmasse. */
  const ultimoPedido = useRef<number | null>(null)

  useEffect(() => {
    if (!varrendo) return
    // Terminou: nada mais a pedir.
    if (proximo === null) {
      setVarrendo(false)
      return
    }
    // O PEDIDO em si falhou (rede, 503 da fila): parar é a única saída — repetir
    // sozinho reproduziria o mesmo erro sem fim.
    if (disparar.isError) {
      setVarrendo(false)
      return
    }
    // O SERVIDOR DEVOLVEU UMA RODADA QUE NÃO ENTRA NESTA CURVA.
    //
    // Acontece quando a dedupe por parâmetros encontra uma variação idêntica já
    // ligada a OUTRA base. O ponto nunca vai aparecer, então `proximo` não
    // avança — e sem esta parada a varredura ficaria ligada para sempre,
    // esperando em silêncio por algo que não vem. Uma trava muda é pior que um
    // erro: não há o que ler na tela nem o que tentar de novo.
    if (disparar.data?.naCurva === false) {
      setVarrendo(false)
      return
    }
    if (emExecucao || disparar.isPending) return
    if (ultimoPedido.current === proximo) {
      // NÃO INSISTE NUM DEGRAU QUE ESTA VARREDURA JÁ PEDIU E QUE FALHOU.
      // Repetir automaticamente uma execução que acabou de morrer gasta cluster
      // para reproduzir o mesmo erro, e o laço não teria fim. Um degrau que
      // falhou ANTES da varredura é outro caso: ele é tentado uma vez, porque
      // pedir a análise é justamente pedir que ela se complete.
      if (jaFalhou) setVarrendo(false)
      return
    }
    ultimoPedido.current = proximo
    pedir(proximo)
    // `pedir` e `disparar` mudam de identidade a cada render; a guarda de
    // repetição é `ultimoPedido`, e não a lista de dependências.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    varrendo,
    proximo,
    jaFalhou,
    emExecucao,
    disparar.isPending,
    disparar.isError,
    // `data` ENTRA na lista: é dele que vem `naCurva`, e sem esta dependência a
    // parada por "rodada de outra curva" só aconteceria se algum outro valor
    // mudasse junto — ou seja, nunca, no caso em que ela é necessária.
    disparar.data,
  ])

  const comecarVarredura = () => {
    ultimoPedido.current = null
    setVarrendo(true)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="carta p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 max-w-2xl">
            <h3 className="text-[15px] font-bold tracking-tight text-ink-900">
              E se o CAPEX anual fosse maior?
            </h3>
            <p className="mt-1 text-[12.5px] leading-relaxed text-ink-500">
              O teto abaixo sai do plano atual e não custa execução nenhuma. A curva vem depois,
              e cada ponto dela é{' '}
              <strong className="font-semibold text-ink-700">uma otimização de verdade</strong>,
              com o orçamento de cada ano multiplicado e todo o resto idêntico a esta rodada.
            </p>
            {/* A CONVENÇÃO DITA UMA VEZ, no lugar onde ela é lida primeiro.
                Os percentuais são POR ANO e os valores em reais são a SOMA da
                janela: sem esta frase, "+10%" ao lado de "R$ 11,0 Mi" convida a
                ler o dinheiro como verba anual — erro de um fator igual ao
                número de anos do plano. */}
            {teto && teto.anosDoPlano > 0 && (
              <p className="mt-1.5 text-[12px] text-ink-400">
                Os percentuais são por ano. Os valores em reais são o acréscimo{' '}
                <strong className="font-semibold text-ink-500">
                  somado nos {teto.anosDoPlano} anos do plano
                </strong>
                .
              </p>
            )}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <SeletorDeFaixa
              faixa={faixa}
              aoTrocar={setFaixa}
              /* Trocar a faixa no meio de uma varredura mudaria o alvo com a
                 corrente andando: o próximo degrau seria de outro intervalo, e
                 quem pediu "de 10 a 50" receberia metade de cada. */
              desabilitado={varrendo}
            />
            <SeletorDeModo modo={modo} aoTrocar={setModo} desabilitado={!!emExecucao || varrendo} />
            {proximo !== null &&
              (varrendo ? (
                <button
                  type="button"
                  onClick={() => setVarrendo(false)}
                  className="rounded-full border border-ink-300 px-4 py-2 text-[13px] font-bold text-ink-600 transition-colors duration-hover ease-saida hover:bg-ink-50"
                >
                  Parar depois desta
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  {faltam > 1 && (
                    <button
                      type="button"
                      onClick={comecarVarredura}
                      /* NÃO se desabilita por haver uma rodada em voo, ao
                         contrário do botão de um degrau só. Pedir a análise é
                         justamente dizer "faça o resto por mim": se um degrau já
                         está rodando, a varredura espera e continua a partir
                         dele. Bloquear aqui obrigaria a pessoa a ficar de
                         guarda até a execução terminar para poder pedir. */
                      disabled={disparar.isPending}
                      className="rounded-full bg-water-600 px-4 py-2 text-[13px] font-bold text-white transition-colors duration-hover ease-saida hover:bg-water-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Rodar a análise · {faltam}{' '}
                      {modo === 'rapido' ? 'estimativas' : 'simulações'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => pedir(proximo, modoDoPedido)}
                    /* Enquanto uma está em voo, não se pede outra: a fila tem
                       capacidade 1, e enfileirar a segunda só faria a espera
                       parecer maior sem chegar antes. */
                    disabled={disparar.isPending || !!emExecucao}
                    className={
                      faltam > 1
                        ? 'rounded-full border border-ink-300 px-3.5 py-2 text-[12.5px] font-semibold text-ink-600 transition-colors duration-hover ease-saida hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-50'
                        : 'rounded-full bg-water-600 px-4 py-2 text-[13px] font-bold text-white transition-colors duration-hover ease-saida hover:bg-water-700 disabled:cursor-not-allowed disabled:opacity-50'
                    }
                  >
                    {disparar.isPending
                      ? 'Disparando…'
                      : emExecucao
                        ? 'Aguardando a rodada em curso'
                        : escalar
                          ? `Rodar +${proximo}% completo`
                          : `${jaFalhou ? 'Tentar de novo' : faltam > 1 ? 'Só' : 'Rodar'} +${proximo}%${
                            emReais(proximo)
                              ? ` · +${brlMi(emReais(proximo)!.aMais)} no plano`
                              : ''
                            }`}
                  </button>
                </div>
              ))}
          </div>
        </div>

        {/* O TETO SÓ ENQUANTO NÃO HÁ CURVA.
            Ele responde a pergunta ANTERIOR — "vale a pena gastar execução com
            isto?" —, e essa pergunta se fecha no instante em que o primeiro
            degrau publica. Depois disso ele é uma tabela de estimativas
            competindo com medições, e meia página de teto entre o cabeçalho e o
            primeiro gráfico empurraria para baixo justamente o que a pessoa veio
            ver. */}
        {teto && !pronta && <Teto teto={teto} />}

        {/* O ESTADO DE CADA DEGRAU, sempre visível. Uma rodada leva minutos, e
            sem esta linha a tela ficaria muda entre o clique e o resultado — o
            defeito que a revisão de UX de 25/08 apontou como o de maior impacto
            ("rodada em execução que nunca dá sinal de vida"). */}
        <ul className="mt-4 flex flex-wrap gap-2">
          {situacao.map(({ degrau, estado, ponto }) => {
            const dinheiro = emReais(degrau)
            const conteudo = (
              <>
                <span className="font-mono">+{degrau}%</span>
                {/* O DINHEIRO AO LADO DA PORCENTAGEM. "+10%" não é uma quantia, e
                    quem decide orçamento decide em reais — sem esta parte, cada
                    leitor faz a conta de cabeça. O que "no plano" significa está
                    dito uma vez, no cabeçalho. */}
                {dinheiro && (
                  <span className="ml-2 font-mono font-normal opacity-70">
                    +{brlMi(dinheiro.aMais)}
                  </span>
                )}
                <span className="ml-2 font-normal opacity-80">
                  {estado === 'ausente' ? 'não rodou' : estado}
                </span>
                {ponto?.estimativa && estado === 'pronto' && (
                  <span className="ml-1.5 font-normal opacity-70">· estimativa</span>
                )}
              </>
            )
            const classe = `rounded-full border px-3 py-1 text-[12px] font-semibold ${CHIP[estado]}`
            return (
              <li key={degrau}>
                {/* A ESTIMATIVA É EXPLORÁVEL, e é aqui que ela se abre.
                    Ela não aparece no histórico de propósito — parou no relógio e
                    não é comparável com uma simulação —, mas o resultado dela é
                    completo: plano, obras, explicabilidade. Este link é o único
                    caminho até ele, e é o certo: quem chega vem da rodada que a
                    originou, e não de uma lista onde ela pareceria só mais uma. */}
                {estado === 'pronto' && ponto ? (
                  <Link
                    to={`/resultados/${ponto.runId}`}
                    title={`Abrir o resultado de +${degrau}%`}
                    className={`${classe} inline-block transition-colors duration-hover ease-saida hover:border-water-500 hover:text-water-800`}
                  >
                    {conteudo}
                  </Link>
                ) : (
                  <span className={`${classe} inline-block`}>{conteudo}</span>
                )}
              </li>
            )
          })}
        </ul>

        {/* POR QUE O DEGRAU FALHOU, na tela.
            Ele aparecia como "erro" e mais nada. Quem olhava não tinha como
            saber se valia tentar de novo, mudar de modo ou desistir — e a
            resposta estava gravada no banco, com a frase que o próprio motor
            escreveu dizendo o que fazer. Uma explicação que só existe no banco
            vira pergunta para outra pessoa. */}
        {falhou?.ponto?.erro && (
          <div className="mt-3 rounded-xl border border-warning/40 bg-warning/10 px-3.5 py-3">
            <p className="text-[12.5px] leading-relaxed text-ink-700">
              <strong className="font-semibold">+{falhou.degrau}% não completou.</strong>{' '}
              {falhou.ponto.erro}
            </p>
            {escalar && (
              /* A SUGESTÃO É TROCAR DE MODO, e não repetir. Tentar de novo em 60s
                 reproduz a falha e gasta cluster para chegar ao mesmo lugar: o
                 motor tem um defeito conhecido que aparece quando o solver não
                 tem tempo para a janela, e nas unidades grandes 60s bastam para
                 provocá-lo. */
              <p className="mt-1.5 text-[12px] text-ink-600">
                Foi uma estimativa de 60s. Nesta unidade o solver precisa de mais
                tempo — o botão ao lado repete o degrau como{' '}
                <strong className="font-semibold text-ink-800">simulação completa</strong>.
              </p>
            )}
          </div>
        )}

        {/* O QUE FICOU FORA DA FAIXA, dito em vez de sumido.
            A faixa é a pergunta, e ponto fora dela é resposta de outra — por
            isso não entra na curva. Mas quem estreita a faixa acabou de ver a
            leitura anterior, e o desaparecimento silencioso pareceria perda. Os
            resultados continuam no banco e voltam assim que a faixa os cobrir. */}
        {fora.length > 0 && (
          <p className="mt-3 text-[12px] text-ink-500">
            {fora.length === 1 ? 'Há 1 ponto já rodado fora' : `Há ${fora.length} pontos já rodados fora`}{' '}
            desta faixa ({fora.map((d) => `+${d}%`).join(', ')}). Eles não somem — voltam ao
            gráfico se a faixa os incluir.
          </p>
        )}

        {varrendo && !emExecucao && (
          <p className="mt-3 text-[12px] text-ink-500">
            Varredura ligada — pedindo o próximo degrau…
          </p>
        )}

        {/* A VARIAÇÃO EXISTIA, MAS NÃO É DESTA CURVA.
            O servidor deduplica por PARÂMETROS: se o mesmo orçamento escalado já
            tinha sido rodado e já pertence à curva de outra rodada, ele devolve
            aquela em vez de abrir uma nova. Sem esta linha, o clique respondia
            "deu certo" e o ponto continuava faltando no gráfico, sem explicação. */}
        {disparar.data?.jaExistia && disparar.data.naCurva === false && (
          <p className="mt-3 rounded-xl border border-ink-200 bg-ink-50 px-3.5 py-2.5 text-[12.5px] text-ink-600">
            Essa variação já foi simulada, mas é ponto da curva de outra rodada —
            por isso ela não entra neste gráfico. Abra{' '}
            <Link
              to={`/resultados/${disparar.data.runId}`}
              className="font-semibold text-water-700 underline underline-offset-2"
            >
              o resultado dela
            </Link>
            .
          </p>
        )}

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
            <p className="text-[12px] text-ink-500">
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
 * A FAIXA DA ANÁLISE — de quanto a quanto, em quantos pontos.
 *
 * Era fixa em +10% a +50% de dez em dez. "Quanto a mais é plausível" é decisão
 * de negócio e muda por unidade: uma concessão em fim de ciclo discute +5% a
 * +15%, e a faixa fixa gastava cinco execuções para responder fora do intervalo
 * que importa.
 *
 * O CONTADOR DIZ QUANTOS VÃO RODAR DE VERDADE, e não quantos foram pedidos. Os
 * degraus são inteiros — a identidade do ponto na curva depende disso —, então
 * uma faixa estreita rende menos: de 10 a 12 em cinco sobram três. Mostrar "5"
 * ali prometeria duas execuções que não vão acontecer.
 */
function SeletorDeFaixa({
  faixa,
  aoTrocar,
  desabilitado,
}: {
  faixa: Faixa
  aoTrocar: (f: Faixa) => void
  desabilitado: boolean
}) {
  const degraus = pontosDaFaixa(faixa)
  const valida = degraus.length >= MINIMO_DE_PONTOS
  const menosQuePedidos = valida && degraus.length < faixa.pontos

  const campo =
    'w-[4.5rem] rounded-lg border border-ink-200 bg-white px-2 py-1 text-right font-mono text-[12.5px] tabular-nums text-ink-800 focus:border-water-500 focus:outline-none disabled:opacity-50'

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[12.5px] text-ink-600">
      <label className="flex items-center gap-1.5">
        <span>De</span>
        <input
          type="number"
          min={1}
          max={MAIOR_DEGRAU}
          value={faixa.de}
          disabled={desabilitado}
          onChange={(e) => aoTrocar({ ...faixa, de: Number(e.target.value) })}
          className={campo}
          aria-label="Menor acréscimo de CAPEX, em %"
        />
        <span>%</span>
      </label>
      <label className="flex items-center gap-1.5">
        <span>a</span>
        <input
          type="number"
          min={1}
          max={MAIOR_DEGRAU}
          value={faixa.ate}
          disabled={desabilitado}
          onChange={(e) => aoTrocar({ ...faixa, ate: Number(e.target.value) })}
          className={campo}
          aria-label="Maior acréscimo de CAPEX, em %"
        />
        <span>%</span>
      </label>
      <label className="flex items-center gap-1.5">
        <span>em</span>
        <select
          value={faixa.pontos}
          disabled={desabilitado}
          onChange={(e) => aoTrocar({ ...faixa, pontos: Number(e.target.value) })}
          className="rounded-lg border border-ink-200 bg-white px-2 py-1 text-[12.5px] text-ink-800 focus:border-water-500 focus:outline-none disabled:opacity-50"
          aria-label="Quantos pontos a análise tem"
        >
          {Array.from(
            { length: MAXIMO_DE_PONTOS - MINIMO_DE_PONTOS + 1 },
            (_, i) => MINIMO_DE_PONTOS + i,
          ).map((n) => (
            <option key={n} value={n}>
              {n} pontos
            </option>
          ))}
        </select>
      </label>

      {!valida ? (
        /* A recusa acontece ANTES do servidor: a faixa inválida não vira
           requisição, e a frase diz o que consertar em vez de um 422. */
        <span className="text-[12px] font-semibold text-amber-700">
          o fim precisa ser maior que o início, e ambos entre 1% e {MAIOR_DEGRAU}%
        </span>
      ) : menosQuePedidos ? (
        <span className="text-[12px] text-ink-500">
          faixa estreita: {degraus.length} pontos distintos ({degraus.map((d) => `+${d}%`).join(', ')})
        </span>
      ) : null}
    </div>
  )
}

/**
 * O seletor de modo — duas opções, e a diferença dita por extenso.
 *
 * "Rápido" e "completo" sozinhos não dizem o que muda, e a diferença aqui não é
 * de precisão de exibição: é de quanto tempo o solver teve. Quem escolhe precisa
 * saber que a estimativa pode ser subótima e que ela não vai para o histórico.
 */
function SeletorDeModo({
  modo,
  aoTrocar,
  desabilitado,
}: {
  modo: ModoDaVariacao
  aoTrocar: (m: ModoDaVariacao) => void
  desabilitado: boolean
}) {
  const opcoes: { valor: ModoDaVariacao; rotulo: string; dica: string }[] = [
    {
      valor: 'rapido',
      rotulo: 'Estimativa · 60s',
      dica: 'A mesma otimização com solver curto. Pode ser subótima e não entra no histórico.',
    },
    {
      valor: 'completo',
      rotulo: 'Simulação',
      dica: 'Rodada normal, com o tempo de solver de sempre. Entra no histórico.',
    },
  ]
  return (
    <div
      role="radiogroup"
      aria-label="Modo da variação"
      className="flex rounded-full border border-ink-200 bg-ink-50 p-0.5"
    >
      {opcoes.map((o) => (
        <button
          key={o.valor}
          type="button"
          role="radio"
          aria-checked={modo === o.valor}
          title={o.dica}
          disabled={desabilitado}
          onClick={() => aoTrocar(o.valor)}
          className={`rounded-full px-3 py-1 text-[12px] font-semibold transition-colors duration-hover ease-saida disabled:cursor-not-allowed disabled:opacity-50 ${
            modo === o.valor ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500 hover:text-ink-700'
          }`}
        >
          {o.rotulo}
        </button>
      ))}
    </div>
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
        <span className="text-[11.5px] text-ink-500">
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
            <tr className="text-left text-[11px] uppercase tracking-wide text-ink-500">
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
                  <span className="ml-1.5 text-ink-400">(+{brlMi(d.folga)})</span>
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
                            <span className="text-ink-500">{s.name}</span>
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
                  d > 0 ? 'text-aegea-700' : d < 0 ? 'text-amber-700' : 'text-ink-400'
                }`}
              >
                {sinal(d)}
              </span>
            </li>
          )
        })}
      </ul>
      <p className="mt-2 text-[11.5px] leading-relaxed text-ink-500">
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
    return <p className="mt-3 text-[12px] text-ink-500">Consultando a rodada de +{degrau}%…</p>
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
        <span className="text-ink-500">
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
      <p className="mt-1.5 text-[11.5px] text-ink-500">
        A curva se completa sozinha quando ela publicar — dá para sair desta tela.
      </p>
    </div>
  )
}
