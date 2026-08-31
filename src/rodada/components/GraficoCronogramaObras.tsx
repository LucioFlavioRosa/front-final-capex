import { useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { DownloadSimple } from '@phosphor-icons/react'
import { Modal } from '@/components/ui/Modal'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { Button } from '@/components/ui/Button'
import { QuadroGrafico } from '@/rodada/components/QuadroGrafico'
import { COR, corDoComponente } from '@/rodada/components/cores'
import { CelulaLink, ChipSituacao, rotuloSituacao } from '@/rodada/components/pecas'
import { useCronogramaDeObras, useObras } from '@/rodada/api/queries'
import { baixarXlsx } from '@/rodada/lib/xlsx'
import { brMi, brlMi, inteiro, VAZIO } from '@/rodada/lib/formato'
import type { AnoDeObras, ObraLinha } from '@/rodada/domain/resultado'

/**
 * O CRONOGRAMA DE OBRAS DO PLANO — "quais obras serão executadas ano a ano"
 * (item 3, na leitura corrigida pela Aegea em 27/08).
 *
 * A PRIMEIRA VERSÃO DESTE ITEM ERA UMA TABELA paginada ordenada por data de
 * início, e estava errada: uma lista de 370 linhas não responde "como o plano
 * se distribui no tempo" — ela obriga a reconstruir isso de cabeça, página por
 * página. O gráfico responde de uma olhada, e a lista vira o DETALHE de um ano.
 *
 * EMPILHADO POR COMPONENTE, e não uma barra lisa por ano: o que distingue um ano
 * de rede de um ano de ETE é justamente a composição — dois anos com 40 obras
 * cada podem ser planos completamente diferentes.
 *
 * UMA BARRA POR ANO, E UM FILTRO — e não uma barra por recorte. Duas barras
 * lado a lado convidam a comparar altura entre elas, e essa comparação não tem
 * sentido aqui: os recortes não são alternativas do mesmo tipo, e o de terceiro
 * é contado por outra data. O filtro troca o QUE está sendo contado mantendo o
 * eixo e a leitura, que é o que permite comparar um recorte com o outro sem
 * somá-los na cabeça.
 *
 * SÓ OBRAS QUE ENTRAM NO PLANO: as não construídas não têm ano de execução.
 * Um eixo de tempo com obras que nunca serão executadas seria um cronograma
 * que mente sobre o próprio nome.
 */

/**
 * OS QUATRO BOTÕES: "todas" mais a partição por POR QUE a obra está no plano.
 *
 * Não são quatro recortes independentes — três deles somam exatamente o
 * primeiro, e é isso que faz o filtro ser legível: o usuário vê 304, filtra, e
 * as partes fecham. A partição é garantida no servidor (`RECORTE_SQL`), e o
 * teste de contrato cobra a soma.
 *
 * "Escolhida" exclui a obrigatória de propósito: obra imposta por contrato não
 * foi escolhida por ninguém, e contá-la como decisão do otimizador inflaria o
 * mérito do plano.
 */
export type Recorte = 'todas' | 'terceiro' | 'obrigatoria' | 'escolhida'

const RECORTES: { value: Recorte; label: string }[] = [
  { value: 'todas', label: 'Todas as obras' },
  { value: 'terceiro', label: 'De terceiro' },
  { value: 'obrigatoria', label: 'Obrigatórias' },
  { value: 'escolhida', label: 'Escolhidas' },
]

/** O rótulo em prosa, para as frases — "obras · de terceiro", e não "terceiro". */
const ROTULO_DO_RECORTE: Record<Exclude<Recorte, 'todas'>, string> = {
  terceiro: 'de terceiro',
  obrigatoria: 'obrigatórias',
  escolhida: 'escolhidas',
}

/**
 * O mesmo recorte como RÓTULO DE CÉLULA — singular e capitalizado, porque numa
 * coluna cada linha é uma obra, e não um conjunto delas.
 */
const CLASSIFICACAO: Record<Exclude<Recorte, 'todas'>, string> = {
  terceiro: 'De terceiro',
  obrigatoria: 'Obrigatória',
  escolhida: 'Escolhida',
}

/** O que uma barra mostra depois de aplicado o filtro. */
export interface AnoFiltrado {
  ano: number
  obras: number
  capex: number
  porComponente: { componente: string; obras: number; capex: number }[]
}

/**
 * Aplica o recorte. "Todas" SOMA as três parcelas em vez de ler um total pronto
 * do servidor — um total transmitido poderia divergir das partes sem nada
 * acusar, e aqui a soma é a definição.
 */
function aplicarRecorte(a: AnoDeObras, recorte: Recorte): AnoFiltrado {
  const partes =
    recorte === 'todas' ? [a.terceiro, a.obrigatoria, a.escolhida] : [a[recorte]]

  const porComponente: AnoFiltrado['porComponente'] = []
  for (const parte of partes) {
    for (const c of parte.porComponente) {
      // Somar por componente, e não concatenar: em "todas", o mesmo componente
      // aparece uma vez por recorte, e concatenar daria duas fatias do mesmo
      // nome na mesma pilha — duas cores iguais, uma legenda repetida.
      const existente = porComponente.find((x) => x.componente === c.componente)
      if (existente) {
        existente.obras += c.obras
        existente.capex += c.capex
      } else {
        porComponente.push({ ...c })
      }
    }
  }

  return {
    ano: a.ano,
    obras: partes.reduce((s, p) => s + p.obras, 0),
    capex: partes.reduce((s, p) => s + p.capex, 0),
    porComponente,
  }
}

export function GraficoCronogramaObras({ runId }: { runId: string | undefined }) {
  const cronograma = useCronogramaDeObras(runId)
  const [anoAberto, setAnoAberto] = useState<number | null>(null)
  const [recorte, setRecorte] = useState<Recorte>('todas')

  const brutos = cronograma.data?.anos ?? []

  /**
   * O EIXO NÃO ENCOLHE AO FILTRAR: os anos vêm de TODOS os recortes, e o ano
   * que o filtro esvazia continua no eixo, vazio. Sem isto, sair de "todas"
   * para "obrigatórias" apagaria 2026 e 2027 e as barras restantes mudariam de
   * lugar — a troca viraria um salto, e comparar recortes exigiria memória.
   */
  const anos = useMemo(
    () => brutos.map((a) => aplicarRecorte(a, recorte)),
    [brutos, recorte],
  )

  /**
   * A lista de componentes vem de TODOS os anos e de TODOS os recortes, não do
   * recorte visível — assim uma cor não muda de componente ao trocar o filtro.
   * Deriva do dado e não de uma constante: uma unidade sem EEE não ganha uma
   * legenda de EEE vazia, e um componente novo no cadastro aparece sozinho.
   */
  const componentes = useMemo(() => {
    const vistos: string[] = []
    for (const a of brutos) {
      for (const parte of [a.terceiro, a.obrigatoria, a.escolhida]) {
        for (const c of parte.porComponente) {
          if (!vistos.includes(c.componente)) vistos.push(c.componente)
        }
      }
    }
    return vistos
  }, [brutos])

  /** Recharts precisa de uma chave por série na mesma linha — achata o aninhado. */
  const dados = useMemo(
    () =>
      anos.map((a) => {
        const linha: Record<string, number> & { ano: number } = { ano: a.ano }
        for (const c of a.porComponente) linha[c.componente] = c.obras
        return linha
      }),
    [anos],
  )

  const totalObras = anos.reduce((s, a) => s + a.obras, 0)
  const totalCapex = anos.reduce((s, a) => s + a.capex, 0)
  const rotulo = RECORTES.find((r) => r.value === recorte)!.label.toLowerCase()

  return (
    <div className="flex flex-col gap-3">
      <QuadroGrafico
        titulo="Cronograma de obras"
        subtitulo={
          totalObras > 0
            ? // O CAPEX sai da frase quando é zero, pela mesma razão da coluna:
              // em "de terceiro" o zero é a definição do recorte, e "R$ 0"
              // ali leria como um plano sem custo em vez de um plano que não é
              // pago pela Aegea.
              `${inteiro(totalObras)} ${
                recorte === 'todas' ? 'obras no plano' : `obras ${rotulo}`
              }${totalCapex > 0 ? ` · ${brlMi(totalCapex)}` : ''} · clique num ano para ver a lista`
            : `nenhuma obra ${recorte === 'todas' ? 'com ano de execução' : rotulo} nesta rodada`
        }
        escopo="plano inteiro"
        nota={
          <>
            Cada barra é um ano, empilhada por <strong>componente</strong> — a composição é o que
            distingue um ano de rede de um ano de ETE. Só obras que entram no plano: as não
            construídas não têm ano de execução.
            <br />
            O filtro parte o plano por <strong>por que a obra está nele</strong>:{' '}
            <strong>de terceiro</strong> (sem CAPEX da Aegea, entra na cadeia como pré-requisito),{' '}
            <strong>obrigatória</strong> (imposta por contrato) e <strong>escolhida</strong> (o
            otimizador decidiu fazer, e podia não ter feito). Os três somam "todas as obras".
            <br />
            <strong>O ano não quer dizer o mesmo para toda obra:</strong> a da Aegea entra pelo ano
            em que <strong>começa</strong>; a de terceiro, pelo ano em que fica{' '}
            <strong>pronta</strong> — o motor não a sequencia, e essa é a única data que ele calcula
            para ela. É também a data que importa, porque a sub-bacia só passa a faturar quando toda
            a cadeia está pronta, terceiro incluído.
          </>
        }
        /* No slot de filtro, e não dentro do corpo: ali ele sumiria ao trocar
           para Tabela — justamente o modo em que se lê o número exato de cada
           recorte. Mesmo componente e mesmo canto do panorama de "Componentes e
           preço unitário": dois filtros com a mesma função não devem morar em
           lugares diferentes de telas vizinhas. */
        filtro={
          <SegmentedControl
            options={RECORTES}
            value={recorte}
            onChange={(r) => {
              setRecorte(r)
              // Fecha o detalhe junto: a lista aberta é a de um recorte que
              // acabou de deixar de ser o visível, e mantê-la aberta
              // contradiria a barra logo acima dela.
              setAnoAberto(null)
            }}
            aria-label="Recorte do cronograma"
          />
        }
        tabela={{
          colunas: ['Ano', 'Obras', 'CAPEX'],
          linhas: anos.map((a) => [
            a.ano,
            a.obras > 0 ? inteiro(a.obras) : VAZIO,
            // CAPEX zero com obra > 0 só acontece em obra de terceiro, e ali o
            // zero é a DEFINIÇÃO (`capex=0 e prazo>0`), não uma medida. "R$ 0,0
            // mi" leria como obra baratíssima; o traço lê como "não se aplica".
            a.capex > 0 ? brMi(a.capex) : VAZIO,
          ]),
        }}
      >
        <ResponsiveContainer width="100%" height={230}>
          <BarChart
            data={dados}
            margin={{ top: 12, right: 12, bottom: 4, left: 4 }}
            onClick={(e) => {
              // `activeLabel` é o valor do `dataKey` do eixo X no ponto clicado
              // — aqui, o ano. Vem tipado como string pelo recharts mesmo
              // quando o dado é número, daí o `Number(...)`.
              const ano = Number((e as { activeLabel?: string | number } | undefined)?.activeLabel)
              if (Number.isFinite(ano)) setAnoAberto((atual) => (atual === ano ? null : ano))
            }}
          >
            <CartesianGrid stroke={COR.grid} vertical={false} />
            <XAxis
              dataKey="ano"
              stroke={COR.eixo}
              tick={{ fill: COR.mudo, fontSize: 10, fontFamily: 'IBM Plex Mono, monospace' }}
              tickLine={false}
            />
            <YAxis
              stroke={COR.eixo}
              tick={{ fill: COR.mudo, fontSize: 10, fontFamily: 'IBM Plex Mono, monospace' }}
              tickLine={false}
              width={34}
              allowDecimals={false}
            />
            <Tooltip
              cursor={{ fill: COR.cursor }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null
                // `Number(label)`, pelo mesmo motivo do `activeLabel` no clique
                // logo acima: o recharts entrega o valor do eixo ora como numero,
                // ora como string, e a comparacao estrita falhava calada — o
                // tooltip mostrava "— obras · R$ 0,0 mi" sobre uma barra cheia.
                const ano = anos.find((a) => a.ano === Number(label))
                return (
                  <div className="rounded-xl border border-ink-200 bg-white px-3 py-2 shadow-elev">
                    <div className="mb-1 text-[11px] font-bold text-ink-800">
                      {/* O cabeçalho fala só da Aegea: o CAPEX é dela, e somar as
                          duas contagens numa só juntaria obra que COMEÇA com obra
                          que TERMINA. A de terceiro vem na lista abaixo, com o
                          rótulo dizendo qual data é. */}
                      {label}
                      {ano && ano.obras > 0
                        ? ` · ${inteiro(ano.obras)} obras · ${brMi(ano.capex)}`
                        : ' · nenhuma obra da Aegea começa'}
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
            {/* A legenda deixou de ser opcional quando entrou uma segunda série:
                antes a cor só distinguia componentes dentro de uma pilha só, e
                agora ela separa DUAS leituras de data. Identidade por cor
                sozinha não se sustenta aí. */}
            <Legend
              verticalAlign="bottom"
              height={30}
              iconType="square"
              iconSize={9}
              formatter={(v) => (
                <span className="text-[10.5px] text-ink-500">{String(v)}</span>
              )}
            />
            {componentes.map((nome) => (
              <Bar
                key={nome}
                dataKey={nome}
                stackId="obras"
                fill={corDoComponente(nome)}
                maxBarSize={38}
              >
                {/* O ano aberto fica opaco e os outros esmaecem — o clique
                    precisa deixar rastro no gráfico, senão a lista abaixo
                    parece ter surgido do nada. */}
                {dados.map((d) => (
                  <Cell
                    key={d.ano}
                    fillOpacity={anoAberto === null || anoAberto === d.ano ? 1 : 0.35}
                  />
                ))}
              </Bar>
            ))}

          </BarChart>
        </ResponsiveContainer>
      </QuadroGrafico>

      <ModalDoAno
        runId={runId}
        ano={anoAberto}
        recorte={recorte}
        resumo={anos.find((a) => a.ano === anoAberto)}
        aoFechar={() => setAnoAberto(null)}
      />
    </div>
  )
}


/**
 * AS COLUNAS DA EXPORTAÇÃO — deliberadamente mais largas que as da tela.
 *
 * A tabela do modal mostra o que se lê de relance; a planilha existe para o
 * trabalho que vem depois (cruzar com o cadastro, somar por sistema, mandar
 * para quem não tem acesso à ferramenta), e ali cada campo a menos é uma volta
 * ao sistema. Por isso sistema, sub-bacia, quantidade e prazo entram no arquivo
 * mesmo sem aparecer na tela.
 *
 * CAPEX vai em reais CHEIOS e como número, não como "R$ 2,4 Mi": a planilha é
 * feita para ser somada, e milhão arredondado com a unidade grudada no texto
 * não soma.
 */
const COLUNAS_DA_PLANILHA = [
  { titulo: 'Obra', largura: 26 },
  { titulo: 'Componente', largura: 22 },
  { titulo: 'Cidade', largura: 22 },
  { titulo: 'Sistema', largura: 22 },
  { titulo: 'Sub-bacia', largura: 22 },
  { titulo: 'Situação', largura: 16 },
  // A CLASSIFICAÇÃO VAI SEMPRE, inclusive quando a planilha sai de um recorte
  // só e a coluna é constante: o arquivo é levado para fora da ferramenta, onde
  // nada mais diz de qual filtro ele veio. Com ela, uma planilha de "todas as
  // obras" se separa nas três divisões por um filtro do próprio Excel.
  { titulo: 'Classificação', largura: 16 },
  { titulo: 'CAPEX (R$)', largura: 18, formato: 'dinheiro' as const },
  { titulo: 'Quantidade', largura: 14 },
  { titulo: 'Unidade', largura: 12 },
  { titulo: 'Ano de início', largura: 14, formato: 'inteiro' as const },
  // Texto e não número: 'AAAA-MM' é mês, e virar 2026 perderia o mês; virar
  // data do Excel inventaria um dia que o motor não calculou.
  { titulo: 'Conclusão', largura: 12 },
  { titulo: 'Prazo (meses)', largura: 14, formato: 'inteiro' as const },
]

function linhaDaPlanilha(o: ObraLinha) {
  return [
    o.obraId,
    o.componente,
    o.cidadeId,
    o.sistemaId,
    o.subBaciaId,
    rotuloSituacao(o.situacao),
    CLASSIFICACAO[o.recorte],
    o.capex,
    o.quantidade,
    o.unidade,
    o.anoInicio,
    o.dataPronta,
    o.prazoMeses,
  ]
}

/**
 * AS OBRAS DE UM ANO — o detalhe que o clique na barra abre.
 *
 * Era um cartão que crescia abaixo do gráfico, e virou modal por um motivo
 * prático: a lista de um ano cheio empurrava o resto da página para baixo, e
 * quem clicava numa barra alta perdia o gráfico de vista justamente quando
 * queria comparar o ano aberto com os vizinhos. O modal fixa a lista sobre a
 * página e devolve o gráfico intacto ao fechar.
 *
 * SÓ MONTA COM UM ANO ABERTO, e é isso que este invólucro de três linhas
 * garante: enquanto `ano` é `null` o corpo não existe, então o `useObras` lá
 * dentro nunca chega a ser chamado. Uma consulta por ano do plano disparada na
 * montagem seria o custo fixo de abrir a tela de resultados, para um detalhe
 * que a maioria das visitas não abre.
 */
export function ModalDoAno({
  runId,
  ano,
  recorte,
  resumo,
  aoFechar,
}: {
  runId: string | undefined
  ano: number | null
  recorte: Recorte
  resumo: AnoFiltrado | undefined
  aoFechar: () => void
}) {
  if (ano === null) return null
  return (
    <ObrasDoAno
      runId={runId}
      ano={ano}
      recorte={recorte}
      resumo={resumo}
      aoFechar={aoFechar}
    />
  )
}

function ObrasDoAno({
  runId,
  ano,
  recorte,
  resumo,
  aoFechar,
}: {
  runId: string | undefined
  ano: number
  recorte: Recorte
  resumo: AnoFiltrado | undefined
  aoFechar: () => void
}) {
  // Sem paginação: um ano tem dezenas de obras, não milhares — 116 no pior ano
  // da Baixada. 500 é o teto do endpoint, e pedir o teto aqui é de propósito:
  // o botão promete "as obras do ano", então o que a tela tem é o que o arquivo
  // leva. O aviso abaixo cobre o dia em que um ano estourar esse teto, em vez
  // de deixar a planilha mentir por omissão.
  const obras = useObras(runId, { ano, recorte, tamanho: 500, ordenar: 'inicio' })
  const itens = obras.data?.itens ?? []
  const faltando = (obras.data?.total ?? 0) - itens.length
  const vazio = itens.length === 0

  const exportar = () =>
    baixarXlsx(
      {
        nome: `Obras de ${ano}`,
        colunas: COLUNAS_DA_PLANILHA,
        linhas: itens.map(linhaDaPlanilha),
      },
      `obras-${ano}-${runId ?? 'rodada'}.xlsx`,
    )

  return (
    <Modal
      open
      onClose={aoFechar}
      size="2xl"
      title={`Obras de ${ano}`}
      /* O resumo já chega recortado pelo filtro do gráfico, então o subtítulo
         descreve a MESMA coisa que a barra clicada — inclusive o CAPEX, que em
         "de terceiro" é zero por definição e por isso fica de fora. */
      subtitle={
        resumo
          ? `${inteiro(resumo.obras)} obras${
              recorte === 'todas' ? '' : ` · ${ROTULO_DO_RECORTE[recorte]}`
            }${resumo.capex > 0 ? ` · ${brlMi(resumo.capex)}` : ''}`
          : undefined
      }
      footer={
        <>
          {/* `aria-disabled` e não `disabled`, como no botão de exportar do
              topo do nível: desabilitado sai da ordem de tabulação e o leitor
              de tela nunca anuncia que a exportação existe. Assim ele é
              alcançável, anuncia-se indisponível, e o clique não faz nada. */}
          <Button
            variant="secondary"
            aria-disabled={vazio || undefined}
            onClick={vazio ? undefined : exportar}
          >
            <DownloadSimple weight="bold" /> Exportar Excel
          </Button>
          <Button variant="primary" onClick={aoFechar}>
            Fechar
          </Button>
        </>
      }
    >
      {faltando > 0 && (
        <p className="mb-3 rounded-lg bg-warning/10 px-3 py-2 text-[12px] text-ink-700">
          Este ano tem {inteiro(obras.data?.total)} obras e a lista mostra as{' '}
          {inteiro(itens.length)} primeiras — a planilha leva as mesmas {inteiro(itens.length)}.
        </p>
      )}

      <div className="max-h-[58vh] min-w-0 overflow-auto">
        <table>
          <caption className="sr-only">Obras executadas em {ano}</caption>
          {/* O cabeçalho gruda porque a rolagem é da tabela: numa lista de 116
              linhas, saber qual coluna é qual no meio da rolagem vale a regra. */}
          <thead className="sticky top-0 z-10 bg-white">
            <tr>
              <th scope="col">Obra</th>
              <th scope="col">Componente</th>
              <th scope="col">Cidade</th>
              <th scope="col">Sistema</th>
              <th scope="col">Sub-bacia</th>
              <th scope="col">Situação</th>
              {/* Só com o filtro em "todas": nos outros a coluna repetiria o
                  mesmo valor em todas as linhas, e uma coluna constante ocupa
                  largura sem informar. Na planilha ela vai sempre — lá o
                  arquivo sai da ferramenta e precisa dizer de onde veio. */}
              {recorte === 'todas' && <th scope="col">Classificação</th>}
              <th scope="col">Conclusão</th>
              <th scope="col" data-r>
                CAPEX
              </th>
            </tr>
          </thead>
          <tbody>
            {obras.isPending && (
              <tr>
                <td colSpan={recorte === 'todas' ? 9 : 8} className="py-6 text-center text-[12.5px] text-ink-400">
                  Carregando as obras de {ano}…
                </td>
              </tr>
            )}
            {obras.isError && (
              <tr>
                <td colSpan={recorte === 'todas' ? 9 : 8} className="py-6 text-center text-[12.5px] text-danger">
                  Não foi possível carregar as obras deste ano.
                </td>
              </tr>
            )}
            {!obras.isPending && !obras.isError && vazio && (
              <tr>
                <td colSpan={recorte === 'todas' ? 9 : 8} className="py-6 text-center text-[12.5px] text-ink-400">
                  Nenhuma obra com ano de execução em {ano}.
                </td>
              </tr>
            )}
            {itens.map((o) => (
              <tr key={o.obraId}>
                <td>
                  <CelulaLink to={`/resultados/${runId}/obras/${o.obraId}`}>
                    <span className="font-mono">{o.obraId}</span>
                  </CelulaLink>
                </td>
                <td>{o.componente}</td>
                <td>{o.cidadeId}</td>
                <td>{o.sistemaId}</td>
                <td>{o.subBaciaId ?? VAZIO}</td>
                <td>
                  <ChipSituacao situacao={o.situacao} />
                </td>
                {recorte === 'todas' && <td>{CLASSIFICACAO[o.recorte]}</td>}
                {/* A coluna que explica por que uma obra de terceiro está numa
                    lista de 2026: ela não começa em 2026, ela FICA PRONTA. */}
                <td className="font-mono text-[11.5px]">{o.dataPronta ?? VAZIO}</td>
                {/* `brMi` e nao `brlMi`: a regra esta no proprio `formato.ts`
                    — numa COLUNA de 72 linhas a regua tem de ser a mesma, e o
                    `brlMi` cai para o formato cheio abaixo de um milhao, o que
                    alterna "R$ 4,1 Mi" e "R$ 493.774" em linhas vizinhas e
                    obriga a converter de cabeca justamente para comparar. */}
                <td data-m>{brMi(o.capex)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  )
}
