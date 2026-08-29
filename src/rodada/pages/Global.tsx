import { useParams } from 'react-router-dom'
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
import { SecaoPorQue } from '@/rodada/components/SecaoPorQue'
import {
  GraficoCapexComponente,
  GraficoFluxoEscoamento,
  GraficoDesembolso,
  GraficoEbitda,
} from '@/rodada/components/graficos'
import { GraficoCronogramaObras } from '@/rodada/components/GraficoCronogramaObras'
import { GraficoMetaCobertura } from '@/rodada/components/GraficoMetaCobertura'
import { CartoesCidades } from '@/rodada/components/CartoesCidades'
import { useCidades, useEbitda, useExplicabilidade, usePainel, useRunMeta } from '@/rodada/api/queries'
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
  const cidades = useCidades(runId)
  const explicabilidade = useExplicabilidade(runId)
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
              subtitulo={m.statusTexto}
              acoes={
                <>
                  <BotaoParametros meta={meta.data} />
                  <BotaoExportar />
                </>
              }
              destaque={{
                rotulo: 'VPL do plano',
                valor: brlMi(m.kpis.vpl),
                ajuda: 'VPL_PLANO',
              }}
              itens={[
                { rotulo: 'CAPEX total', valor: brlMi(m.kpis.capexTotal), ajuda: 'CAPEX_TOTAL' },
                { rotulo: 'OPEX total', valor: brlMi(m.kpis.opexTotal), ajuda: 'OPEX_TOTAL' },
                {
                  /**
                   * A BASE VAI NO RÓTULO (item 16 do feedback de 26/08).
                   *
                   * Ela já estava na tela — no rodapé, a três linhas daqui —,
                   * mas o número dizia só "Receita", e arrecadada e faturada
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
                },
                {
                  rotulo: 'Sub-bacias que passam a faturar',
                  valor: deTotal(m.kpis.subbaciasFaturando, m.kpis.subbaciasTotal),
                  ajuda: 'SUBBACIAS_FATURANDO',
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
                   * as de fora. "Metas atingidas" fazia o denominador parecer o
                   * contrato inteiro; "Metas na janela" corrigiu isso e virou
                   * jargao interno — a Aegea leu e nao entendeu a que se referia
                   * (item 6 de 26/08).
                   *
                   * Agora o titulo diz o que se conta e a restricao de janela
                   * vive no verbete, que e onde cabe uma frase inteira. Alargar
                   * o denominador para o contrato continua fora de questao:
                   * faria toda rodada de janela curta parecer fracasso.
                   */
                  rotulo: 'Metas contratuais cumpridas',
                  valor: deTotal(m.kpis.metasAtingidas, m.kpis.metasTotal),
                  ajuda: 'METAS_CUMPRIDAS',
                },
                {
                  /**
                   * A OITAVA CÉLULA, que antes era um retângulo cinza vazio.
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
                  <ItemRodape rotulo="CTS" valor={m.parametros.usarCts ? 'sim' : 'não'} />
                  <ItemRodape rotulo="Objetivo" valor={m.parametros.focoCobertura} />
                  <ItemRodape rotulo="Criada por" valor={m.autor} />
                  <ItemRodape rotulo="Em" valor={dataHora(m.dataHora)} />
                </>
              }
            />

            {/* Quadro próprio: vem de outro endpoint, carrega e falha sozinho.
                Sem `vazio` — a ausência de dado é o próprio sinal de "sem
                nada a explicar" (100% fatura), e `SecaoPorQue` já trata isso
                devolvendo `null`. */}
            <Estado
              consulta={explicabilidade}
              rotulo="Carregando a explicabilidade…"
              tituloErro="Não foi possível carregar a explicabilidade desta rodada."
            >
              {(ex) => <SecaoPorQue dados={ex} runId={runId} />}
            </Estado>

            {/* "SINTO FALTA DE DUAS INFORMAÇÕES COM DESTAQUE" — itens 3 e 4 do
                feedback de 26/08, nas leituras corrigidas em 27/08:

                  3. o CRONOGRAMA de obras (aqui), e não uma lista ordenada;
                  4. a cobertura CONTRA META por cidade, num quadro só com
                     filtro (logo abaixo, junto das cidades a que ela pertence).

                Os dois carregam e falham por conta própria — cada um vem de um
                endpoint diferente do painel. */}
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
                      duas colunas para tudo. Fluxo de escoamento, Desembolso, EBITDA e
                      CAPEX por componente são largura cheia: a Curva S saiu
                      como quadro próprio (decisão de 18/08, incorporada ao
                      Desembolso) e não deixou par para o EBITDA dividir a
                      linha — cada um destes tem seis+ categorias ou duas
                      séries com eixo duplo, e em meia largura os rótulos
                      colidem. */}
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

                    <GraficoCapexComponente itens={p.capexPorComponente} />
                  </div>

                  <SecaoElementos anos={p.elementosPorAno} />
                </>
              )}
            </Estado>

            <TituloSecao nota="clique para descer um nível">Cidades</TituloSecao>
            <Estado
              consulta={cidades}
              rotulo="Carregando as cidades…"
              tituloErro="Não foi possível carregar a lista de cidades."
              vazio={{
                checar: (c) => c.length === 0,
                titulo: 'Nenhuma cidade nesta rodada',
                texto: 'A rodada não tem cidades com resultado — não é filtro, é ausência de dado.',
              }}
            >
              {(lista) => (
                <div className="flex flex-col gap-4">
                  {/* O QUADRO DE META VEM ANTES DOS CARTÕES, e dentro do mesmo
                      `Estado`: ele lê a MESMA lista (`cidades`), então separá-lo
                      numa seção própria abriria um segundo estado de carga para
                      o mesmo payload — e os dois piscariam fora de sincronia. */}
                  <GraficoMetaCobertura cidades={lista} />
                  <CartoesCidades runId={runId} cidades={lista} />
                </div>
              )}
            </Estado>
          </>
        )}
      </Estado>
    </section>
  )
}
