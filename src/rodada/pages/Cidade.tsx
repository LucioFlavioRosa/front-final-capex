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
  GraficoFluxoEscoamento,
  GraficoCobertura,
  GraficoEbitda,
} from '@/rodada/components/graficos'
import { useCidade, useEbitda, useRunMeta } from '@/rodada/api/queries'
import { useCrumbs } from '@/rodada/state/Crumbs'
import { useTrilhaCompleta } from '@/rodada/layout/CascaResultado'
import { VAZIO, brlMi, inteiro, pct } from '@/rodada/lib/formato'

/**
 * Nível 2 — uma cidade da rodada.
 *
 * Mesmo kit do nível global, um degrau abaixo. A diferença que o desenho tem de
 * carregar é semântica, e o inventário a marcou: `/ebitda?cidade={id}` é
 * **o mesmo endpoint do nível global com recorte** — o mesmo indicador em outro
 * escopo, não outro indicador.
 *
 * Por isso Fluxo de escoamento e EBITDA recebem `escopo` com o nome da cidade em negrito.
 * Sem ele, um print desta tela é indistinguível de um print do global, e a
 * diferença é o que o número significa.
 */
export function Cidade() {
  const { runId, cidadeId } = useParams<{ runId: string; cidadeId: string }>()
  const meta = useRunMeta(runId)
  const cidade = useCidade(runId, cidadeId)
  const ebitda = useEbitda(runId, cidadeId)

  // Esta página declara o seu degrau; a casca cuida dos dois de cima.
  useCrumbs(cidade.data ? [{ rotulo: cidade.data.nome }] : [])
  const trilha = useTrilhaCompleta(runId, meta.data?.nome)

  return (
    <section className="animate-fade-in">
      <Estado
        consulta={cidade}
        rotulo="Carregando a cidade…"
        tituloErro="Não foi possível carregar esta cidade."
      >
        {(c) => (
          <>
            <Trilha itens={trilha} />

            <FaixaKpi
              nivel="Nível 2 · Cidade"
              titulo={c.nome}
              acoes={<BotaoExportar />}
              destaque={{ rotulo: 'VPL da cidade', valor: brlMi(c.vpl) }}
              itens={[
                { rotulo: 'CAPEX', valor: brlMi(c.capexTotal) },
                { rotulo: 'Cobertura base', valor: pct(c.coberturaBasePct) },
                { rotulo: 'Cobertura final', valor: pct(c.coberturaFinalPct) },
                { rotulo: 'Ligações novas', valor: inteiro(c.ligacoesNovas) },
              ]}
              rodape={
                <>
                  <ItemRodape rotulo="Fim da concessão" valor={c.fimConcessao} />
                  <ItemRodape rotulo="Fim do CAPEX" valor={c.fimCapex} />
                  <ItemRodape
                    rotulo="Paridade"
                    valor={`${c.paridade.paridadeInicial} → ${c.paridade.paridadeFinal}`}
                  />
                  {c.paridade.houveDegrau && (
                    <ItemRodape
                      rotulo="Efeito da base"
                      valor={`${brlMi(c.paridade.vpEfeitoBase)} · ${pct(
                        c.paridade.pctDoVplDaCidade,
                      )} do VPL`}
                    />
                  )}
                </>
              }
            />

            <TituloSecao>Quadros da cidade</TituloSecao>
            <div className="grid gap-4 lg:grid-cols-2">
              <GraficoFluxoEscoamento parcelas={c.cascata} escopo={c.nome} />
              <GraficoCobertura cobertura={c.cobertura} metas={c.metas} escopo={c.nome} />
              <div className="lg:col-span-2">
                <Estado
                  consulta={ebitda}
                  rotulo="Carregando o EBITDA da cidade…"
                  tituloErro="Não foi possível carregar o EBITDA desta cidade."
                  vazio={{
                    checar: (e) => e.anos.length === 0,
                    titulo: 'Sem anos de EBITDA para esta cidade',
                    texto: 'Não há anos materializados neste recorte.',
                  }}
                >
                  {(e) => <GraficoEbitda anos={e.anos} total={e.total} escopo={c.nome} />}
                </Estado>
              </div>
            </div>

            <SecaoElementos anos={c.elementosPorAno} />

            <TituloSecao nota="clique para descer um nível">Sistemas da cidade</TituloSecao>
            {c.sistemas.length === 0 ? (
              <div className="rounded-2xl border-[1.5px] border-dashed border-ink-300 bg-white p-8 text-center">
                <p className="text-sm font-semibold text-ink-800">Nenhum sistema nesta cidade</p>
                <p className="mt-1 text-[12.5px] text-ink-500">
                  A cidade existe na rodada, mas não tem sistema com resultado.
                </p>
              </div>
            ) : (
              <Cartao tabela>
                <div className="min-w-0 overflow-x-auto">
                  <table>
                    <caption className="sr-only">Sistemas da cidade {c.nome}</caption>
                    <thead>
                      <tr>
                        <th scope="col">Sistema</th>
                        <th scope="col" data-r>
                          Sub-bacias
                        </th>
                        <th scope="col" data-r>
                          Faturando
                        </th>
                        <th scope="col" data-r>
                          CAPEX
                        </th>
                        <th scope="col" data-r>
                          Ocupação da ETE
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {c.sistemas.map((s) => (
                        <tr key={s.id}>
                          <td>
                            <CelulaLink to={`/resultados/${runId}/sistemas/${s.id}`}>
                              {s.nome}
                            </CelulaLink>
                          </td>
                          <td data-m>{inteiro(s.subbacias)}</td>
                          <td data-m>{inteiro(s.faturando)}</td>
                          <td data-m>{brlMi(s.capex)}</td>
                          {/* Ocupação nula é o caso que motivou a regra do '—':
                              ETE com capacidade zero não tem ocupação de 0%,
                              tem ocupação INEXISTENTE. */}
                          <td data-m>{s.ocupacaoPct === null ? VAZIO : pct(s.ocupacaoPct)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Cartao>
            )}
          </>
        )}
      </Estado>
    </section>
  )
}
