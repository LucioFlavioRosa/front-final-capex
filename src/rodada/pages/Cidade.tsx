import { useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { Estado } from '@/rodada/components/Estado'
import { BotaoExportar } from '@/rodada/components/BotaoExportar'
import { BotaoParametros } from '@/rodada/components/PainelParametros'
import {
  Cartao,
  CelulaLink,
  FaixaKpi,
  ItemRodape,
  TituloSecao,
  Trilha,
  ValorOcupacao,
} from '@/rodada/components/pecas'
import { SecaoElementos } from '@/rodada/components/SecaoElementos'
import { SecaoPorQue } from '@/rodada/components/SecaoPorQue'
import { useAbaResultado } from '@/rodada/layout/abaResultado'
import {
  GraficoFluxoEscoamento,
  GraficoCobertura,
  GraficoEbitda,
} from '@/rodada/components/graficos'
import { BotaoAjuda } from '@/rodada/components/Dicionario'
import {
  useCidade,
  useCidades,
  useEbitda,
  useExplicabilidadeDaCidade,
  useRunMeta,
} from '@/rodada/api/queries'
import { useCrumbs } from '@/rodada/state/Crumbs'
import { useTrilhaCompleta } from '@/rodada/layout/CascaResultado'
import { brlMi, inteiro, pct, deTotal, vazao} from '@/rodada/lib/formato'

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
  const aba = useAbaResultado()
  const meta = useRunMeta(runId)
  const cidade = useCidade(runId, cidadeId)
  const ebitda = useEbitda(runId, cidadeId)
  const explicabilidade = useExplicabilidadeDaCidade(runId, cidadeId)

  /**
   * A POSIÇÃO DESTA CIDADE NO RANKING DE VPL.
   *
   * Sai da lista do nível 1, que já traz TODAS as cidades com o VPL de cada
   * uma — não há consulta nova: `useCidades` compartilha a `queryKey` com a
   * árvore de escopo, que já a carregou para desenhar o galho desta cidade.
   *
   * Ordena decrescente e assume que a lista é o universo da rodada. Cidade com
   * VPL negativo cai no fim, e é isso mesmo: a posição descreve onde ela está,
   * não emite juízo — daí ser texto no subtítulo, e não medalha colorida.
   *
   * `null` enquanto a lista não chegou, ou se esta cidade não estiver nela:
   * inventar "1º de 1" a partir de uma lista incompleta seria pior que não
   * mostrar posição nenhuma.
   */
  const cidades = useCidades(runId)
  const ranking = useMemo(() => {
    const lista = cidades.data
    if (!lista?.length || !cidadeId) return null
    const ordenadas = [...lista].sort((a, b) => (b.vpl ?? 0) - (a.vpl ?? 0))
    const pos = ordenadas.findIndex((c) => c.id === cidadeId)
    return pos < 0 ? null : { posicao: pos + 1, total: ordenadas.length }
  }, [cidades.data, cidadeId])

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
              /* A posição vai no SUBTÍTULO e não num tile: como tile ela seria
                 a quinta de uma grade de quatro colunas, deixando três células
                 vazias — o defeito que acabou de ser corrigido no nível 1. */
              subtitulo={
                ranking && (
                  <span className="inline-flex items-center gap-1.5">
                    <span>
                      <b className="font-semibold text-ink-800">{ranking.posicao}º de{' '}
                        {ranking.total}
                      </b>{' '}
                      em VPL entre as cidades desta rodada
                    </span>
                    <BotaoAjuda chave="RANKING_VPL" texto="Posição no ranking de VPL" />
                  </span>
                )
              }
              acoes={
                <>
                  <BotaoParametros meta={meta.data} />
                  <BotaoExportar />
                </>
              }
              /* A faixa segue a aba, como no nível 1: em Por quê o VPL da
                 cidade não responde nada, e o número que responde é quantas
                 sub-bacias dela ficaram fora. */
              destaque={
                aba === 'porque' && explicabilidade.data
                  ? {
                      rotulo: 'Sub-bacias desta cidade fora do plano',
                      valor: deTotal(
                        explicabilidade.data.naoFaturando,
                        explicabilidade.data.totalSubbacias,
                      ),
                    }
                  : { rotulo: 'VPL da cidade', valor: brlMi(c.vpl), ajuda: 'VPL_PLANO' }
              }
              /**
               * SAIU O TILE DE CAPEX, e no lugar entrou a PARTICIPAÇÃO.
               *
               * Repetir o CAPEX aqui faz o nível 2 parecer o nível 1 com
               * números menores, que é a sensação que a reorganização veio
               * tirar. A participação responde outra pergunta — "quanto desta
               * rodada é esta cidade" —, que só existe neste nível.
               *
               * A participação é o número que só existe NESTE nível: quanto do
               * plano inteiro passa por esta cidade. Ela não cabe no nível 1
               * (lá são 27 linhas) nem no 3 (lá não há o total).
               */
              itens={aba === 'porque' && explicabilidade.data ? [
                {
                  rotulo: 'Vazão presa',
                  valor: vazao(
                    explicabilidade.data.categorias.reduce((s, c2) => s + c2.vazaoPresa, 0),
                  ),
                },
                {
                  rotulo: 'Motivos distintos',
                  valor: inteiro(explicabilidade.data.categorias.length),
                },
                {
                  rotulo: 'Obras que destravariam mais',
                  valor: inteiro(explicabilidade.data.elos.length),
                },
                {
                  rotulo: 'Cobertura que faltou',
                  valor: pct(100 - c.coberturaFinalPct),
                },
              ] : [
                {
                  rotulo: 'Participação no plano',
                  valor:
                    meta.data && meta.data.kpis.vpl
                      ? pct((c.vpl / meta.data.kpis.vpl) * 100)
                      : '—',
                },
                { rotulo: 'Cobertura base', valor: pct(c.coberturaBasePct) },
                {
                  rotulo: 'Cobertura final',
                  valor: pct(c.coberturaFinalPct),
                  ajuda: 'COBERTURA_FINAL',
                },
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

            {aba === 'plano' && (
              <>
            <TituloSecao>Quadros da cidade</TituloSecao>
            <div className="grid gap-4 lg:grid-cols-2">
              <GraficoFluxoEscoamento
                parcelas={c.cascata}
                escopo={c.nome}
                baseReceita={meta.data?.parametros.baseReceita}
              />
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
                  {(e) => (
                    <GraficoEbitda
                      anos={e.anos}
                      total={e.total}
                      escopo={c.nome}
                      baseReceita={meta.data?.parametros.baseReceita}
                    />
                  )}
                </Estado>
              </div>
            </div>

            <SecaoElementos anos={c.elementosPorAno} />
              </>
            )}

            {/* "QUAIS SISTEMAS E SUB-BACIAS ESTÃO SENDO PRIORIZADOS E QUAIS
                FICARAM DE FORA" — mesmo bloco do nível 1, recortado por cidade.
                Sem `Estado` de erro/carregando
                próprio de propósito — se a explicabilidade falhar aqui, a
                tela inteira já falhou antes (o mesmo `runId`/`cidadeId`), e
                duplicar o tratamento seria alarme sem informação nova. */}
            {aba === 'porque' && explicabilidade.data && (
              <SecaoPorQue
                dados={explicabilidade.data}
                runId={runId}
                titulo="Sub-bacias fora do plano, por motivo"
              />
            )}

            {aba === 'plano' && (
              <>
            <TituloSecao nota="clique para descer um nível">Sistemas da cidade</TituloSecao>
            {c.sistemas.length === 0 ? (
              <div className="rounded-2xl border-[1.5px] border-dashed border-ink-300 bg-white p-8 text-center">
                <p className="text-sm font-semibold text-ink-800">Nenhum sistema nesta cidade</p>
                <p className="mt-1 text-[12.5px] text-ink-water">
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
                          {/* X-02: acima de 100% é inconsistência de dado, não
                              plano — ver `ocupacaoEte` em `lib/formato.ts`. */}
                          <td data-m>
                            <ValorOcupacao pct={s.ocupacaoPct} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Cartao>
            )}
              </>
            )}
          </>
        )}
      </Estado>
    </section>
  )
}
