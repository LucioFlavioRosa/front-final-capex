import { useParams } from 'react-router-dom'
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
import {
  GraficoCapexComponente,
  GraficoFluxoEscoamento,
  GraficoDesembolso,
  GraficoEbitda,
} from '@/rodada/components/graficos'
import { useCidades, useEbitda, usePainel, useRunMeta } from '@/rodada/api/queries'
import { useCrumbs } from '@/rodada/state/Crumbs'
import { useTrilhaCompleta } from '@/rodada/layout/CascaResultado'
import { brlMi, dataHora, deTotal, inteiro, pct } from '@/rodada/lib/formato'

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
              titulo={m.nome || `Rodada ${m.runId.slice(0, 8)}`}
              subtitulo={m.statusTexto}
              acoes={<BotaoExportar />}
              destaque={{ rotulo: 'VPL do plano', valor: brlMi(m.kpis.vpl) }}
              itens={[
                { rotulo: 'CAPEX total', valor: brlMi(m.kpis.capexTotal) },
                { rotulo: 'OPEX total', valor: brlMi(m.kpis.opexTotal) },
                { rotulo: 'Receita', valor: brlMi(m.kpis.receitaTotal) },
                {
                  rotulo: 'Obras',
                  valor: deTotal(m.kpis.obrasConstruidas, m.kpis.obrasTotal),
                },
                {
                  rotulo: 'Sub-bacias faturando',
                  valor: deTotal(m.kpis.subbaciasFaturando, m.kpis.subbaciasTotal),
                },
                { rotulo: 'Cobertura final', valor: pct(m.kpis.coberturaFimPct) },
                {
                  // "NA JANELA" e correcao de rotulo, nao de conta: o numero JA
                  // e so da janela de CAPEX. O motor nunca conta meta com ano
                  // >= `anos_capex`, entao `metasTotal` ja exclui as de fora — e
                  // "Metas atingidas" fazia o denominador parecer o contrato
                  // inteiro. Ver o mesmo criterio no gráfico de cobertura.
                  rotulo: 'Metas na janela',
                  valor: deTotal(m.kpis.metasAtingidas, m.kpis.metasTotal),
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
                    <GraficoFluxoEscoamento parcelas={p.cascata} escopo="plano inteiro" />
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
                      {(e) => <GraficoEbitda anos={e.anos} total={e.total} escopo="plano inteiro" />}
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
                <Cartao tabela>
                  <div className="min-w-0 overflow-x-auto">
                    <table>
                      <caption className="sr-only">Cidades da rodada</caption>
                      <thead>
                        <tr>
                          <th scope="col">Cidade</th>
                          <th scope="col" data-r>
                            Cobertura final
                          </th>
                          <th scope="col" data-r>
                            Metas
                          </th>
                          <th scope="col" data-r>
                            CAPEX
                          </th>
                          <th scope="col" data-r>
                            VPL
                          </th>
                          <th scope="col" data-r>
                            Sistemas
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {lista.map((c) => (
                          <tr key={c.id}>
                            <td>
                              <CelulaLink to={`/resultados/${runId}/cidades/${c.id}`}>
                                {c.nome}
                              </CelulaLink>
                            </td>
                            <td data-m>{pct(c.coberturaFimPct)}</td>
                            <td data-m>{deTotal(c.metasAtingidas, c.metasTotal)}</td>
                            <td data-m>{brlMi(c.capex)}</td>
                            <td data-m>{brlMi(c.vpl)}</td>
                            <td data-m>{inteiro(c.sistemas)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Cartao>
              )}
            </Estado>
          </>
        )}
      </Estado>
    </section>
  )
}
