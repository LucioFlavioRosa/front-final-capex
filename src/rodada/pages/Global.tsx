import { rotuloObjetivo } from '@/rodada/domain/pedido'
import { Link, useParams } from 'react-router-dom'
import { Estado } from '@/rodada/components/Estado'
import { BotaoExportar } from '@/rodada/components/BotaoExportar'
import { BotaoParametros } from '@/rodada/components/PainelParametros'
import {
  FaixaKpi,
  ItemRodape,
  TituloSecao,
  Trilha,
} from '@/rodada/components/pecas'
import { SecaoElementos } from '@/rodada/components/SecaoElementos'
import { CenarioAnualDeCapex } from '@/rodada/components/CenarioAnualDeCapex'
import { PainelSensibilidade } from '@/rodada/components/PainelSensibilidade'
import { useAbaResultado } from '@/rodada/layout/abaResultado'
import {
  GraficoFluxoEscoamento,
  GraficoDesembolso,
  GraficoEbitda,
} from '@/rodada/components/graficos'
import { GraficoCronogramaObras } from '@/rodada/components/GraficoCronogramaObras'
import {
  useCenarioAnual,
  useEbitda,
  usePainel,
  useRunMeta,
} from '@/rodada/api/queries'
import { useCrumbs } from '@/rodada/state/Crumbs'
import { useTrilhaCompleta } from '@/rodada/layout/CascaResultado'
import { brlMi, dataHora, deTotal, inteiro, pct } from '@/rodada/lib/formato'
import { idCurtoDaRodada } from '@/rodada/domain/rodadaId'

/**
 * Nível 1 — a visão geral de uma rodada.
 *
 * Quatro consumos, e a estrutura da tela é o desenho dessa divisão:
 *
 *   `/meta`    → a faixa de KPIs e os parâmetros. Carrega sozinha.
 *   `/painel`  → OS QUADROS DO PLANO NUM PAYLOAD SÓ (fluxo de escoamento, desembolso, CAPEX
 *                por componente e elementos/preço unitário por ano). Carregam
 *                e falham como uma unidade, então têm um cabeçalho e um
 *                estado próprios. Não dá
 *                para desenhar estado de carga por quadro, e a seção existe
 *                justamente para que essa restrição fique visível em vez de
 *                virar uma surpresa na implementação.
 *   `/ebitda`  → quadro próprio.
 *   `/cidades` → a tabela de drill-down.
 *   `/explicabilidade` → o resumo de "por que não fatura 100%", logo após a
 *                faixa de KPIs — usuários reportavam que descer até a
 *                sub-bacia (nível 4) só para entender o motivo do otimizador
 *                não era intuitivo. Quadro próprio, carrega e falha sozinho.
 */
export function Global() {
  const { runId } = useParams<{ runId: string }>()

  // O nível global não tem degrau próprio: a trilha dele é só Histórico › rodada.
  useCrumbs([])

  // `null` = todos os componentes juntos. Compartilhado pelos dois quadros
  // ano a ano — filtrar um sem o outro deixaria a leitura desalinhada.

  const meta = useRunMeta(runId)
  const painel = usePainel(runId)
  const ebitda = useEbitda(runId)
  const cenario = useCenarioAnual(runId)
  const aba = useAbaResultado({ comSensibilidade: true })
  /**
   * O destino dos números de exclusão. Só os "X de Y" recebem: em cada um deles
   * a pergunta seguinte é sobre o RESTO, e o resto mora na outra aba.
   */
  const porQue = `/resultados/${runId}?aba=porque`
  const trilha = useTrilhaCompleta(runId, meta.data?.nome)

  return (
    <section className="animate-fade-in">
      <Estado
        consulta={meta}
        rotulo="Carregando a rodada…"
        tituloErro="Não foi possível carregar esta rodada."
      >
        {(m) => (
          <>
            <Trilha itens={trilha} />

            <FaixaKpi
              nivel="Nível 1 · Geral"
              titulo={m.nome || `Rodada ${idCurtoDaRodada(m.runId)}`}
              /* SEM SUBTÍTULO. Aqui saía o `statusTexto` cru do solver —
                 "OTIMO | obrig 3/9 | lexicografico: min metas_nao=2, 2a
                 prior=cobertura". Dele, a única coisa que respondia a uma
                 pergunta de negócio era a contagem de obrigatórias, que virou
                 KPI abaixo (e sai de campo tipado, não de um `split` desta
                 string). O resto é vocabulário do solver, e continua no payload
                 e no histórico — que é onde ele serve, para explicar uma rodada
                 que morreu entre o solver e a publicação. */
              acoes={
                <>
                  <BotaoParametros meta={meta.data} />
                  <BotaoExportar />
                </>
              }
              /**
               * O NÚMERO EM DESTAQUE MUDA COM A ABA, e é o coração da divisão.
               *
               * No Plano a pergunta é "quanto vale", e o VPL responde. Em Por
               * quê a pergunta é "quanto ficou de fora", e o VPL não responde
               * nada — repeti-lo ali seria dizer que as duas abas olham a mesma
               * coisa, que é exatamente o que a separação veio desfazer.
               */
              destaque={
                /* `!== 'porque'`, e não `=== 'plano'`: a Sensibilidade também
                   quer o VPL em destaque. Ele é o PONTO DE PARTIDA da curva —
                   todo número dela é lido como "quanto isto muda em relação a
                   hoje" —, e trocá-lo pelo destaque do Por quê poria a pergunta
                   errada em cima da tela. */
                aba !== 'porque'
                  ? { rotulo: 'VPL do plano', valor: brlMi(m.kpis.vpl), ajuda: 'VPL_PLANO' }
                  : {
                      // OBRAS, e nao sub-bacias: a aba inteira passou a contar
                      // obra, e um destaque em outra unidade fazia o numero de
                      // cima nao fechar com nada do quadro logo abaixo.
                      rotulo: 'Obras fora do plano',
                      // `deTotal` e nao o absoluto: 7.799 sozinho nao diz se e
                      // muito. "de 8.079" diz, e e a mesma regua do quadro
                      // abaixo — que recorta um pouco mais fino (tira obra de
                      // terceiro e o que nunca foi obra) e por isso conta menos.
                      valor: deTotal(
                        m.kpis.obrasTotal - m.kpis.obrasConstruidas,
                        m.kpis.obrasTotal,
                      ),
                    }
              }
              itens={aba === 'porque' ? [
                {
                  // A SUB-BACIA DESCE DO DESTAQUE PARA CA quando a aba passou a
                  // contar OBRA. Ela continua sendo informacao — quantos nos
                  // ficaram sem faturar —, mas deixou de ser a manchete: o que
                  // entra ou nao no plano e a obra, e era isso que o destaque
                  // precisava dizer.
                  rotulo: 'Sub-bacias que não faturam',
                  valor: deTotal(
                    m.kpis.subbaciasTotal - m.kpis.subbaciasFaturando,
                    m.kpis.subbaciasTotal,
                  ),
                },
                {
                  rotulo: 'Metas contratuais não cumpridas',
                  valor: deTotal(m.kpis.metasTotal - m.kpis.metasAtingidas, m.kpis.metasTotal),
                },
                {
                  rotulo: 'Cobertura que faltou',
                  valor: pct(100 - m.kpis.coberturaFimPct),
                },
                {
                  /**
                   * ORÇAMENTO QUE SOBROU — o número mais diagnóstico da aba.
                   *
                   * Se sobrou dinheiro, o que travou as sub-bacias NÃO foi o
                   * orçamento: foi retorno, obrigação de cadeia ou janela. É a
                   * primeira coisa que alguém pergunta ao ver 1.099 fora, e a
                   * resposta muda inteiramente o que se faz a seguir — pedir
                   * mais CAPEX não adianta quando ele não foi gasto.
                   *
                   * O mesmo dado no Plano se chama "uso do orçamento" e responde
                   * outra pergunta ("coube?"). Mesmo número, leitura invertida —
                   * é o que justifica ele aparecer nas duas abas.
                   */
                  rotulo: 'Orçamento que sobrou',
                  valor: pct(
                    m.parametros.orcamento
                      ? 100 - (m.kpis.capexTotal / m.parametros.orcamento) * 100
                      : null,
                  ),
                },
              ] : [
                { rotulo: 'CAPEX total', valor: brlMi(m.kpis.capexTotal), ajuda: 'CAPEX_TOTAL' },
                { rotulo: 'OPEX total', valor: brlMi(m.kpis.opexTotal), ajuda: 'OPEX_TOTAL' },
                {
                  /**
                   * A BASE VAI NO RÓTULO, e não só no rodapé.
                   *
                   * Um número que diz só "Receita" é ambíguo: arrecadada e faturada
                   * são valores diferentes do mesmo plano: a arrecadada já
                   * desconta inadimplência. Quem printa este card e manda por
                   * e-mail manda um número sem a régua dele.
                   *
                   * Servidor antigo (ou rodada sem `params_extra`) não manda a
                   * base: aí o rótulo volta a ser "Receita" seco, em vez de
                   * afirmar uma das duas.
                   */
                  rotulo: m.parametros.baseReceita
                    ? `Receita (${m.parametros.baseReceita})`
                    : 'Receita',
                  valor: brlMi(m.kpis.receitaTotal),
                  ajuda: 'RECEITA_TOTAL',
                },
                {
                  rotulo: 'Obras priorizadas',
                  valor: deTotal(m.kpis.obrasConstruidas, m.kpis.obrasTotal),
                  ajuda: 'OBRAS_PRIORIZADAS',
                  para: porQue,
                  aoLado: 'e as que não entraram →',
                },
                {
                  /**
                   * O QUE SOBROU DO TEXTO DO SOLVER — e o único pedaço dele que
                   * respondia a uma pergunta de negócio.
                   *
                   * Fica ao lado de "Obras priorizadas" porque é o mesmo tipo de
                   * leitura, com uma diferença que importa: aquelas o otimizador
                   * escolheu, estas o contrato impôs. "3 de 9" com o total menor
                   * que o das priorizadas é o normal — obrigatória é um
                   * subconjunto pequeno, e o que se lê aqui é quantas delas o
                   * plano conseguiu acomodar.
                   */
                  rotulo: 'Obras obrigatórias',
                  valor: deTotal(m.kpis.obrigatoriasConstruidas, m.kpis.obrigatoriasTotal),
                },
                {
                  rotulo: 'Sub-bacias que passam a faturar',
                  valor: deTotal(m.kpis.subbaciasFaturando, m.kpis.subbaciasTotal),
                  ajuda: 'SUBBACIAS_FATURANDO',
                  para: porQue,
                  aoLado: 'e as que não faturam →',
                },
                {
                  rotulo: 'Cobertura final',
                  valor: pct(m.kpis.coberturaFimPct),
                  ajuda: 'COBERTURA_FINAL',
                },
                {
                  /**
                   * O RÓTULO MUDOU DUAS VEZES, A CONTA NENHUMA.
                   *
                   * O numero JA e so da janela de CAPEX: o motor nunca conta
                   * meta com ano >= `anos_capex`, entao `metasTotal` ja exclui
                   * as de fora. "Metas atingidas" faz o denominador parecer o
                   * contrato inteiro; "Metas na janela" corrige isso e vira
                   * jargao interno que ninguem de fora entende.
                   *
                   * O titulo diz o que se conta, e a restricao de janela vive no
                   * verbete, que e onde cabe uma frase inteira. Alargar
                   * o denominador para o contrato continua fora de questao:
                   * faria toda rodada de janela curta parecer fracasso.
                   */
                  rotulo: 'Metas contratuais cumpridas',
                  valor: deTotal(m.kpis.metasAtingidas, m.kpis.metasTotal),
                  para: porQue,
                  aoLado: 'e as que faltaram →',
                  ajuda: 'METAS_CUMPRIDAS',
                },
                {
                  /**
                   * A OITAVA CÉLULA — o uso do orçamento.
                   *
                   * `capexTotal / orcamento` é conta de tela porque os dois
                   * lados já estão no payload — e é a leitura que falta para
                   * interpretar o VPL: perto de 100% a verba foi o gargalo, e
                   * aumentar o teto mudaria o plano. Orçamento ausente ou zero
                   * cai em `pct(null)` → "—", que é o correto: sem teto
                   * informado a razão não existe.
                   */
                  rotulo: 'Uso do orçamento',
                  valor: pct(
                    m.parametros.orcamento ? (m.kpis.capexTotal / m.parametros.orcamento) * 100 : null,
                  ),
                  ajuda: 'USO_ORCAMENTO',
                },
              ]}
              rodape={
                <>
                  <ItemRodape rotulo="Orçamento" valor={brlMi(m.parametros.orcamento)} />
                  {/* A janela é DERIVADA — ela aparece aqui como leitura, e não
                      existe campo para ela em lugar nenhum do app. */}
                  <ItemRodape
                    rotulo="Janela de CAPEX"
                    valor={`${inteiro(m.parametros.janelaCapex)} anos`}
                  />
                  <ItemRodape rotulo="Base de receita" valor={m.parametros.baseReceita} />
                  <ItemRodape
                    rotulo="Coletores de tempo seco"
                    valor={m.parametros.usarCts ? 'orçar à parte' : 'somar à sub-bacia'}
                  />
                  <ItemRodape rotulo="Objetivo" valor={rotuloObjetivo(m.parametros.focoCobertura)} />
                  <ItemRodape rotulo="Criada por" valor={m.autor} />
                  <ItemRodape rotulo="Em" valor={dataHora(m.dataHora)} />
                </>
              }
            />

            {/* DE QUE PLANO ISTO É UMA VARIAÇÃO.
                O rótulo dela diz "+10% de CAPEX" e não diz de quê — e ela aparece
                no histórico ao lado de rodadas comuns, onde essa diferença é
                invisível. Quem abre uma variação pelo histórico precisa saber
                que está vendo um cenário, e ter o caminho de volta para a
                análise que o gerou. */}
            {m.variacaoDe && (
              <div className="carta flex flex-wrap items-center gap-x-2 gap-y-1 px-4 py-3 text-[12.5px] text-ink-600">
                <span className="rounded-full bg-water-50 px-2.5 py-0.5 font-mono text-[12px] font-bold text-water-700">
                  +{m.variacaoDe.degrau}%
                </span>
                <span>
                  {m.variacaoDe.estimativa ? 'Estimativa rápida' : 'Simulação'} com{' '}
                  <strong className="font-semibold text-ink-800">
                    {m.variacaoDe.degrau}% a mais de CAPEX por ano
                  </strong>{' '}
                  sobre{' '}
                  <Link
                    to={`/resultados/${m.variacaoDe.runId}`}
                    className="font-semibold text-water-700 underline underline-offset-2"
                  >
                    {m.variacaoDe.nome || 'a rodada de origem'}
                  </Link>
                  . Todo o resto é idêntico a ela.
                </span>
                <Link
                  to={`/resultados/${m.variacaoDe.runId}?aba=sensibilidade`}
                  className="ml-auto shrink-0 font-semibold text-water-700 underline underline-offset-2"
                >
                  Ver a análise completa
                </Link>
              </div>
            )}

            {/* Quadro próprio: vem de outro endpoint, carrega e falha sozinho.
                A ABA "POR QUE" TEM UM QUADRO SÓ. A seção de categorias
                ("O que ficou fora do plano") saiu daqui: ela respondia por que
                cada obra ficou de fora, e o cenário responde o que fazer a
                respeito — que é a pergunta de quem abre esta aba. Duas leituras
                empilhadas faziam a segunda parecer detalhe da primeira.
                A seção continua nos níveis 2 e 3, onde não há cenário. */}
            {aba === 'porque' && (
              <Estado
                consulta={cenario}
                rotulo="Carregando o cenário anual…"
                tituloErro="Não foi possível carregar o cenário anual desta rodada."
              >
                {(c) => <CenarioAnualDeCapex dados={c} runId={runId} />}
              </Estado>
            )}

            {/* A SENSIBILIDADE EM ABA PRÓPRIA, e não empilhada no Plano.
                Ela fala de um plano que NÃO existe — o que aconteceria com outro
                orçamento —, e disputava espaço com o plano de verdade: três
                curvas, a tabela do teto e o gráfico de obras entre o cronograma
                e o painel da rodada. Quem queria o painel passava por tudo isso;
                quem queria a análise rolava até o meio da tela para achá-la.
                Em aba própria as duas coisas ficam inteiras. */}
            {/* `&& !m.variacaoDe` mesmo com a aba escondida: esconder o botão
                não é a mesma coisa que fechar o caminho, e a aba vive na URL —
                um link antigo ou uma URL editada à mão chegam aqui sem passar
                pela barra de abas. */}
            {aba === 'sensibilidade' && !m.variacaoDe && (
              /* `key` PELO runId: trocar de rodada pelo seletor não desmonta a
                 página — é a mesma rota com outro parâmetro —, então sem isto o
                 painel levava para a rodada nova o estado da anterior: a faixa
                 escolhida, o modo, e pior, uma varredura ligada, que passaria a
                 disparar degraus na rodada errada. */
              <PainelSensibilidade key={m.runId} meta={m} />
            )}

            {aba === 'plano' && (
              <>

                {/* O CRONOGRAMA de obras, e não uma lista ordenada. Carrega e
                    falha por conta própria: vem de um endpoint diferente do
                    painel.

                    A cobertura contra meta POR CIDADE não fica aqui: o nível 1
                    termina no bloco de componentes, e essa leitura é do nível
                    2. */}
                <TituloSecao nota="clique num ano para ver as obras">Plano de obras</TituloSecao>
                <GraficoCronogramaObras runId={runId} />

                <TituloSecao>Painel da rodada</TituloSecao>
                {/* O bloco INTEIRO tem um estado, porque o payload é um só. */}
            <Estado
              consulta={painel}
              rotulo="Carregando os quadros do painel…"
              tituloErro="Não foi possível carregar o painel desta rodada."
              vazio={{
                checar: (p) => p.cascata.length === 0 && p.anos.length === 0,
                titulo: 'Rodada sem quadros materializados',
                texto:
                  'A rodada existe, mas as tabelas de resultado não foram geradas. Isso acontece quando o solver não chegou a publicar.',
              }}
            >
              {(p) => (
                <>
                  {/* A ORDEM E AS LARGURAS SÃO AS DO DESIGN, e não um grid de
                      duas colunas para tudo. Fluxo de escoamento, Desembolso e
                      EBITDA são largura cheia: a Curva S não é quadro próprio
                      (foi incorporada ao Desembolso), então não há par para o
                      EBITDA dividir a linha — e cada um destes tem seis+
                      categorias ou duas séries com eixo duplo, que em meia
                      largura colidem os rótulos.

                      "CAPEX por componente" saiu a pedido: o mesmo número já
                      está em "Componentes e preço unitário", na aba CAPEX de
                      cada card. Dois quadros contando a mesma coisa em telas
                      diferentes convidam a procurar a diferença entre eles. */}
                  <div className="flex flex-col gap-4">
                    <GraficoFluxoEscoamento
                      parcelas={p.cascata}
                      escopo="plano inteiro"
                      baseReceita={m.parametros.baseReceita}
                    />
                    <GraficoDesembolso anos={p.anos} />

                    {/* O EBITDA vem de OUTRO endpoint, então carrega e falha
                        sozinho — daí o `Estado` próprio dentro da célula, em
                        vez de uma seção separada no fim da página. */}
                    <Estado
                      consulta={ebitda}
                      rotulo="Carregando o EBITDA…"
                      tituloErro="Não foi possível carregar o EBITDA."
                      vazio={{
                        checar: (e) => e.anos.length === 0,
                        titulo: 'Sem anos de EBITDA',
                        texto: 'Não há anos de EBITDA materializados para esta rodada.',
                      }}
                    >
                      {(e) => (
                        <GraficoEbitda
                          anos={e.anos}
                          total={e.total}
                          escopo="plano inteiro"
                          baseReceita={m.parametros.baseReceita}
                        />
                      )}
                    </Estado>

                  </div>

                  {/* O ÚLTIMO BLOCO DA PÁGINA, a pedido.
                      Depois dele vinha a seção "Cidades" — o quadro de cobertura
                      × meta por cidade e os cartões para descer de nível —, e ela
                      saiu inteira. Descer para uma cidade continua sendo o que
                      sempre foi: a árvore de escopo, à esquerda, que existe em
                      todos os níveis e não some ao rolar a página. */}
                  <SecaoElementos anos={p.elementosPorAno} />
                </>
              )}
            </Estado>

              </>
            )}
          </>
        )}
      </Estado>
    </section>
  )
}
