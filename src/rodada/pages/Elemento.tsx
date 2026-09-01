import { useParams } from 'react-router-dom'
import { Badge } from '@/components/ui/Badge'
import { Estado } from '@/rodada/components/Estado'
import { BotaoExportar } from '@/rodada/components/BotaoExportar'
import { BotaoParametros } from '@/rodada/components/PainelParametros'
import {
  Cartao,
  CelulaLink,
  ChipSituacao,
  FaixaKpi,
  ItemRodape,
  Tile,
  Trilha,
} from '@/rodada/components/pecas'
import { useObra, useRunMeta } from '@/rodada/api/queries'
import { useCrumbs } from '@/rodada/state/Crumbs'
import { useTrilhaCompleta } from '@/rodada/layout/CascaResultado'
import { VAZIO, brl, brlMi, dataCurta, inteiro, pct, vazao } from '@/rodada/lib/formato'
import type { ReactNode } from 'react'
import { useAbaResultado } from '@/rodada/layout/abaResultado'

/**
 * Nível 5 — a folha da árvore. Sem gráfico.
 *
 * É a única tela do pacote cuja tabela SOBE na hierarquia em vez de descer: as
 * sub-bacias listadas em "quem depende desta obra" são irmãs de quem trouxe
 * você até aqui. A linha de total fecha o rateio em 100%, e ela existe para ser
 * conferida — é o que permite ver que a divisão não perdeu nada.
 */
export function Elemento() {
  const { runId, obraId } = useParams<{ runId: string; obraId: string }>()
  const aba = useAbaResultado()
  const meta = useRunMeta(runId)
  const obra = useObra(runId, obraId)

  useCrumbs(
    obra.data
      ? [
          { rotulo: obra.data.cidadeNome, to: `/resultados/${runId}/cidades/${obra.data.cidadeId}` },
          {
            rotulo: obra.data.sistemaNome,
            to: `/resultados/${runId}/sistemas/${obra.data.sistemaId}`,
          },
          {
            rotulo: obra.data.subbaciaId,
            to: `/resultados/${runId}/sub-bacias/${obra.data.subbaciaId}`,
          },
          { rotulo: obra.data.obraId },
        ]
      : [],
  )
  const trilha = useTrilhaCompleta(runId, meta.data?.nome)

  return (
    <section className="animate-fade-in">
      <Estado
        consulta={obra}
        rotulo="Carregando a ficha da obra…"
        tituloErro="Não foi possível carregar esta obra."
      >
        {(o) => {
          const totalVazao = o.dependencias.reduce((s, d) => s + d.vazao, 0)
          const totalRateio = o.dependencias.reduce((s, d) => s + d.fracaoRateio, 0)
          const totalCapex = o.dependencias.reduce((s, d) => s + d.capexRateado, 0)

          return (
            <>
              <Trilha itens={trilha} />

              <FaixaKpi
                nivel="Nível 5 · Obra"
                titulo={o.rotulo || o.obraId}
                subtitulo={o.categoria ? `${o.componente} · ${o.categoria}` : o.componente}
                acoes={
                  <>
                    <ChipSituacao situacao={o.situacao} />
                    {o.obrigatoria && <Badge tone="warning">Obrigatória</Badge>}
                    <BotaoParametros meta={meta.data} />
                    <BotaoExportar />
                  </>
                }
                destaque={{ rotulo: 'CAPEX', valor: brlMi(o.capex) }}
                itens={[
                  { rotulo: 'OPEX anual', valor: brlMi(o.opexAno) },
                  {
                    rotulo: 'Quantidade',
                    valor:
                      o.quantidade === null || o.unidade === null
                        ? VAZIO
                        : `${inteiro(o.quantidade)} ${o.unidade}`,
                  },
                  { rotulo: 'Preço unitário', valor: brl(o.precoUnitario) },
                  { rotulo: 'Prazo', valor: o.prazoMeses === null ? VAZIO : `${o.prazoMeses} m` },
                ]}
                rodape={
                  <>
                    <ItemRodape rotulo="Responsável" valor={o.responsavel} />
                    {/* A origem do WACC é informação, não detalhe: "médio" quer
                        dizer que a unidade não informou o próprio, e o motor
                        herdou o da regional. */}
                    <ItemRodape
                      rotulo="WACC"
                      valor={`${pct(o.wacc)} (${o.waccOrigem === 'proprio' ? 'próprio' : 'médio da regional'})`}
                    />
                    {o.dataInicio && <ItemRodape rotulo="Início" valor={dataCurta(o.dataInicio)} />}
                    {o.dataPronta && <ItemRodape rotulo="Pronta" valor={dataCurta(o.dataPronta)} />}
                  </>
                }
              />

              {aba === 'plano' && (
              <>
              {/* O QUE A OBRA DESTRAVA — promovido de três linhas no meio da
                  ficha para bloco próprio.
                  O domínio já diz por quê: R$ 223 mil é caro ou barato depende
                  de quantas ligações o dinheiro destrava e de quanto cada uma
                  fatura, e `precoPorLigacao` é a razão entre os dois. Enterrado
                  entre "sistema" e "mês mais cedo", esse trio se lia como mais
                  um metadado; aqui ele é a leitura que torna o CAPEX
                  comparável. */}
              <div className="mt-5">
                <Cartao
                  titulo="O que esta obra destrava"
                  nota="base comercial da sub-bacia servida"
                >
                  <div className="tiles grid-cols-1 sm:grid-cols-3">
                    <Tile rotulo="Ligações destravadas" valor={inteiro(o.ligacoesNovas)} />
                    <Tile rotulo="Ticket médio" valor={brl(o.ticketMedio)} />
                    <Tile rotulo="Preço por ligação" valor={brl(o.precoPorLigacao)} />
                  </div>
                </Cartao>
              </div>

              </>
              )}

              {/* A FICHA e QUEM DEPENDE dividiam a linha. Agora cada uma
                  responde numa aba: a ficha é o que a obra É (Plano), a lista de
                  dependentes é quem ficou esperando por ela (Por quê).

                  Esta parte eu propus como "precisa de backend" e estava
                  errado: `o.dependencias` já traz as estruturas que dependem da
                  obra, com vazão e rateio. O nível 5 tem aba Por quê hoje. */}
              <div className={aba === 'plano'
                ? 'mt-4 grid gap-4'
                : 'mt-4 grid gap-4'}>
                {aba === 'plano' && (
                <Cartao titulo="Ficha">
                  <dl className="m-0 grid grid-cols-1 gap-0">
                    <Campo rotulo="Componente" valor={o.componente} />
                    <Campo
                      rotulo="Sub-bacia"
                      valor={
                        <CelulaLink to={`/resultados/${runId}/sub-bacias/${o.subbaciaId}`}>
                          {o.subbaciaId}
                        </CelulaLink>
                      }
                    />
                    <Campo
                      rotulo="Sistema"
                      valor={
                        <CelulaLink to={`/resultados/${runId}/sistemas/${o.sistemaId}`}>
                          {o.sistemaNome}
                        </CelulaLink>
                      }
                    />
                    <Campo rotulo="CAPEX construído" valor={brlMi(o.capexConstruido)} />
                    {/* Todos estes já devolvem '—' sozinhos quando nulos: é o
                        `formato.ts`, e é por isso que a ficha não tem um único
                        `?? 0` espalhado por ela. */}
                    <Campo rotulo="CAPEX que falta" valor={brlMi(o.capexQueFalta)} />
                    <Campo
                      rotulo="Mês mais cedo"
                      valor={o.mesMaisCedo === null ? VAZIO : String(o.mesMaisCedo)}
                    />
                  </dl>
                  {o.narrativa && (
                    <p className="mt-3 rounded-xl border border-ink-200 bg-ink-50 p-3 text-[12px] leading-relaxed text-ink-600">
                      {o.narrativa}
                    </p>
                  )}
                </Cartao>
                )}

                {aba === 'porque' && (
                <Cartao
                  tabela
                  titulo="Quem depende desta obra"
                  nota="rateio do CAPEX por vazão contribuída"
                >
                  {o.dependencias.length === 0 ? (
                    <p className="m-2.5 rounded-xl border-[1.5px] border-dashed border-ink-300 p-4 text-center text-[12px] text-ink-water">
                      Nenhuma outra estrutura depende desta obra — o custo é todo da sub-bacia
                      dela.
                    </p>
                  ) : (
                    <div className="min-w-0 overflow-x-auto">
                      <table>
                        <caption className="sr-only">Dependências da obra {o.obraId}</caption>
                        <thead>
                          <tr>
                            <th scope="col">Sub-bacia</th>
                            <th scope="col" data-r>
                              Vazão
                            </th>
                            <th scope="col" data-r>
                              Rateio
                            </th>
                            <th scope="col" data-r>
                              CAPEX rateado
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {o.dependencias.map((d) => (
                            <tr key={d.subbaciaId}>
                              <td>
                                <CelulaLink to={`/resultados/${runId}/sub-bacias/${d.subbaciaId}`}>
                                  {d.subbaciaId}
                                </CelulaLink>
                                {!d.fatura && (
                                  <span className="ml-1.5 text-[10px] text-ink-water">não fatura</span>
                                )}
                              </td>
                              <td data-m>{vazao(d.vazao)}</td>
                              <td data-m>{pct(d.fracaoRateio * 100)}</td>
                              <td data-m>{brlMi(d.capexRateado)}</td>
                            </tr>
                          ))}
                          <tr>
                            <td className="font-bold text-ink-800">Total</td>
                            <td data-m className="font-bold">
                              {vazao(totalVazao)}
                            </td>
                            <td data-m className="font-bold">
                              {pct(totalRateio * 100)}
                            </td>
                            <td data-m className="font-bold">
                              {brlMi(totalCapex)}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  )}
                </Cartao>
                )}
              </div>
            </>
          )
        }}
      </Estado>
    </section>
  )
}

function Campo({ rotulo, valor }: { rotulo: string; valor: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-ink-100 py-2 last:border-b-0">
      <dt className="text-[12px] text-ink-water">{rotulo}</dt>
      <dd className="m-0 text-right font-mono text-[12.5px] font-medium tabular-nums text-ink-800">
        {valor}
      </dd>
    </div>
  )
}
