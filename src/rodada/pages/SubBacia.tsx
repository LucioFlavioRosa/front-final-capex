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
  TituloSecao,
  Trilha,
} from '@/rodada/components/pecas'
import { SecaoElementos } from '@/rodada/components/SecaoElementos'
import {
  GraficoFluxoEscoamento,
  GraficoReceitaSubBacia,
} from '@/rodada/components/graficos'
import { useRunMeta, useSubBacia } from '@/rodada/api/queries'
import { useAbaResultado } from '@/rodada/layout/abaResultado'
import { useCrumbs } from '@/rodada/state/Crumbs'
import { useTrilhaCompleta } from '@/rodada/layout/CascaResultado'
import { VAZIO, brlMi, inteiro, vazao } from '@/rodada/lib/formato'
import type { Explicacao } from '@/rodada/domain/resultado'

/**
 * Nível 4 — a sub-bacia, e a tela onde mora a EXPLICABILIDADE.
 *
 * É a pergunta "por que esta obra entrou?", e a resposta é um raciocínio, não
 * um número. O domínio descreve a peça como *"o que hoje sai como texto de
 * console e vira UI estruturada"*.
 *
 * O contrato entrega quatro coisas, e o desenho abaixo é o de cada uma:
 *   `categoria`     → a classificação, como chip. É o "tipo de caso".
 *   `elo`           → o elemento que liga esta sub-bacia à rede. Vira link.
 *   `narrativa`     → o texto. É o que saía no console.
 *   `seFosseLigada` → o CONTRAFACTUAL, e é a parte mais informativa: o saldo
 *                     sozinha contra o saldo com rateio. A diferença entre os
 *                     dois é literalmente a resposta de "por que entrou" quando
 *                     a sub-bacia não se paga isolada.
 */
export function SubBacia() {
  const { runId, subId } = useParams<{ runId: string; subId: string }>()
  const meta = useRunMeta(runId)
  const aba = useAbaResultado()
  const sub = useSubBacia(runId, subId)

  useCrumbs(
    sub.data
      ? [
          { rotulo: sub.data.cidadeNome, to: `/resultados/${runId}/cidades/${sub.data.cidadeId}` },
          {
            rotulo: sub.data.sistemaNome,
            to: `/resultados/${runId}/sistemas/${sub.data.sistemaId}`,
          },
          { rotulo: sub.data.id },
        ]
      : [],
  )
  const trilha = useTrilhaCompleta(runId, meta.data?.nome)

  return (
    <section className="animate-fade-in">
      <Estado
        consulta={sub}
        rotulo="Carregando a sub-bacia…"
        tituloErro="Não foi possível carregar esta sub-bacia."
      >
        {(s) => (
          <>
            <Trilha itens={trilha} />

            <FaixaKpi
              nivel={`Nível 4 · ${s.tipo === 'cts' ? 'Coletor de tempo seco' : 'Sub-bacia'}`}
              titulo={s.id}
              subtitulo={
                s.fatura ? undefined : 'Esta estrutura não fatura — a receita é de outro nó.'
              }
              acoes={
                <>
                  <BotaoParametros meta={meta.data} />
                  <BotaoExportar />
                </>
              }
              destaque={{ rotulo: 'VPL', valor: brlMi(s.vpl) }}
              itens={[
                { rotulo: 'Vazão', valor: vazao(s.vazao) },
                { rotulo: 'Componentes', valor: inteiro(s.elementos.length) },
                { rotulo: 'Fatura', valor: s.fatura ? 'sim' : 'não' },
              ]}
              rodape={
                <>
                  <ItemRodape rotulo="Cidade" valor={s.cidadeNome} />
                  <ItemRodape rotulo="Sistema" valor={s.sistemaNome} />
                  {s.pareadaCom && <ItemRodape rotulo="Pareada com" valor={s.pareadaCom} />}
                </>
              }
            />

            {/* O ESCOAMENTO, que era uma linha de metadado com setas dentro de
                uma string. Ele saiu de lá porque não é um atributo da sub-bacia:
                é a cadeia de que ela depende, e cada degrau é uma obra que pode
                travar a que vem depois. Como lista de degraus dá para ver ONDE
                a cadeia está — numa string não dá. */}
            {s.caminho.length > 0 && (
              <div className="mt-5">
                <Cartao titulo="Fluxo de escoamento até a ETE" nota="de montante para jusante">
                  <ol className="m-0 flex list-none flex-wrap items-center gap-2 p-0">
                    {s.caminho.map((no, i) => (
                      <li key={`${no}-${i}`} className="flex items-center gap-2">
                        <span
                          className={`rounded-full px-3 py-1.5 font-mono text-[12px] font-semibold tabular-nums ${
                            no === s.id
                              ? 'bg-aegea-50 text-aegea-700 ring-1 ring-aegea-200'
                              : 'bg-ink-100 text-ink-700'
                          }`}
                        >
                          {no}
                          {no === s.id && (
                            <span className="ml-1.5 font-sans text-[11px] font-normal text-aegea-700">
                              você está aqui
                            </span>
                          )}
                        </span>
                        {i < s.caminho.length - 1 && (
                          <span aria-hidden="true" className="text-ink-300">
                            &rarr;
                          </span>
                        )}
                      </li>
                    ))}
                  </ol>
                </Cartao>
              </div>
            )}

            {/* A EXPLICAÇÃO DEIXOU DE DIVIDIR A LINHA com os gráficos.
                Ela era meia coluna no fim de uma página longa; na aba própria é
                a tela inteira, que é o peso que ela merece — é a única peça do
                produto que responde "por que ESTA sub-bacia", em português, com
                o contrafactual do "se fosse ligada agora" ao lado. */}
            {aba === 'porque' ? (
              <div className="mt-5">
                <PainelExplicacao explicacao={s.explicacao} runId={runId} />
              </div>
            ) : (
              <>
                <div className="mt-5 grid gap-4 lg:grid-cols-2">
                  <GraficoFluxoEscoamento parcelas={s.cascata} escopo={s.id} />
                  <GraficoReceitaSubBacia anos={s.receita} />
                </div>

                <SecaoElementos anos={s.elementosPorAno} />

            <TituloSecao nota="clique para abrir a ficha da obra">Componentes</TituloSecao>
            {s.elementos.length === 0 ? (
              <div className="rounded-2xl border-[1.5px] border-dashed border-ink-300 bg-white p-8 text-center">
                <p className="text-sm font-semibold text-ink-800">Nenhum componente nesta sub-bacia</p>
                <p className="mt-1 text-[12.5px] text-ink-500">
                  Não há obra associada — a rodada não previu construção aqui.
                </p>
              </div>
            ) : (
              <Cartao tabela>
                <div className="min-w-0 overflow-x-auto">
                  <table>
                    <caption className="sr-only">Componentes da sub-bacia {s.id}</caption>
                    <thead>
                      <tr>
                        <th scope="col">Obra</th>
                        <th scope="col">Componente</th>
                        <th scope="col">Situação</th>
                        <th scope="col" data-r>
                          Quantidade
                        </th>
                        <th scope="col" data-r>
                          CAPEX
                        </th>
                        <th scope="col" data-r>
                          Ano
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {s.elementos.map((e) => (
                        <tr key={e.obraId}>
                          <td>
                            <CelulaLink to={`/resultados/${runId}/obras/${e.obraId}`}>
                              {e.obraId}
                            </CelulaLink>
                          </td>
                          <td>{e.componente}</td>
                          <td>
                            <ChipSituacao situacao={e.situacao} />
                          </td>
                          {/* Quantidade sem unidade não vira número solto: os
                              dois vêm juntos ou não vêm. */}
                          <td data-m>
                            {e.quantidade === null || e.unidade === null
                              ? VAZIO
                              : `${inteiro(e.quantidade)} ${e.unidade}`}
                          </td>
                          <td data-m>{brlMi(e.capex)}</td>
                          <td data-m>{e.anoInicio === null ? VAZIO : e.anoInicio}</td>
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

/**
 * A explicabilidade.
 *
 * A ordem dos blocos é a ordem em que a pergunta se responde: primeiro QUE CASO
 * é este (categoria), depois O QUE ACONTECEU (narrativa), e por último A CONTA
 * que sustenta (o contrafactual). Inverter faria a tela abrir com números que o
 * leitor ainda não sabe interpretar.
 */
function PainelExplicacao({
  explicacao,
  runId,
}: {
  explicacao: Explicacao
  runId: string | undefined
}) {
  const { categoria, elo, narrativa, seFosseLigada } = explicacao

  return (
    <div className="min-w-0 rounded-2xl border border-ink-200 bg-white p-4 shadow-soft md:p-5">
      <div>
        <h2 className="text-[13px] font-bold text-ink-800">Por que este resultado</h2>
        <p className="mt-0.5 text-[11.5px] text-ink-500">explicabilidade do otimizador</p>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Badge tone="water" dot>
          {categoria}
        </Badge>
        {elo && (
          <span className="text-[11.5px] text-ink-500">
            elo:{' '}
            <CelulaLink to={`/resultados/${runId}/obras/${elo}`}>
              <span className="font-mono text-[11.5px]">{elo}</span>
            </CelulaLink>
          </span>
        )}
      </div>

      <p className="mt-3 rounded-xl border border-ink-200 bg-ink-50 p-3 text-[12.5px] leading-relaxed text-ink-700">
        {narrativa}
      </p>

      {seFosseLigada ? (
        <>
          <div className="mt-4 text-[10.5px] font-semibold uppercase tracking-[.09em] text-ink-400">
            Se fosse ligada sozinha
          </div>
          <p className="mt-1 text-[11.5px] leading-snug text-ink-500">
            O contrafactual: a mesma sub-bacia, sem dividir o custo da estrutura compartilhada.
          </p>
          <dl className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-2">
            <Linha rotulo="Receita" valor={brlMi(seFosseLigada.receita)} />
            <Linha rotulo="CAPEX sozinha" valor={brlMi(seFosseLigada.capexSozinha)} />
            <Linha rotulo="OPEX" valor={brlMi(seFosseLigada.opex)} />
          </dl>

          {/* A COMPARAÇÃO que responde a pergunta. Os dois saldos lado a lado,
              com o veredito derivado — e não uma frase decorativa: quando o
              saldo sozinha é negativo e o com rateio é positivo, o rateio É a
              razão de a obra existir. */}
          {/* Os dois saldos LADO A LADO, mais a diferença já feita.
              A diferença é uma coluna e não uma conta de cabeça: ela é o
              tamanho exato do efeito do rateio, que é a resposta da pergunta
              desta tela. */}
          <div className="tiles mt-3.5 grid-cols-3">
            <Tile rotulo="Sozinha" valor={brlMi(seFosseLigada.saldoSozinha)} />
            <Tile rotulo="Dividindo a estrutura" valor={brlMi(seFosseLigada.saldoComRateio)} />
            <Tile
              rotulo="Diferença"
              valor={brlMi(seFosseLigada.saldoComRateio - seFosseLigada.saldoSozinha)}
            />
          </div>
          <div className="mt-3 rounded-xl border border-aegea-200 border-l-[3px] border-l-aegea-600 bg-aegea-50 p-3">
            <p className="text-[11.5px] leading-snug text-ink-600">
              {seFosseLigada.saldoSozinha < 0 && seFosseLigada.saldoComRateio >= 0 ? (
                <>
                  Sozinha ela <strong className="font-semibold">não se paga</strong>. O que a torna
                  viável é dividir a estrutura com as outras sub-bacias do sistema.
                </>
              ) : seFosseLigada.saldoComRateio < seFosseLigada.saldoSozinha ? (
                <>
                  Ela <strong className="font-semibold">carrega parte do custo</strong> de estrutura
                  que outras sub-bacias também usam.
                </>
              ) : (
                <>
                  Ela <strong className="font-semibold">se paga por si</strong> — o rateio melhora o
                  saldo, mas não é o que decide.
                </>
              )}
            </p>
          </div>
        </>
      ) : (
        /* Tracejado: esperando alguém. O contrafactual não se aplica a toda
           sub-bacia, e dizer isso é diferente de mostrar uma conta zerada. */
        <p className="mt-4 rounded-xl border-[1.5px] border-dashed border-ink-300 p-3 text-[11.5px] leading-snug text-ink-500">
          Sem contrafactual para esta estrutura. O caso não é de rateio, então não há "se fosse
          ligada sozinha" a comparar.
        </p>
      )}
    </div>
  )
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-ink-100 pb-1.5">
      <dt className="text-[11.5px] text-ink-500">{rotulo}</dt>
      <dd className="m-0 font-mono text-[12px] font-medium tabular-nums text-ink-800">{valor}</dd>
    </div>
  )
}
