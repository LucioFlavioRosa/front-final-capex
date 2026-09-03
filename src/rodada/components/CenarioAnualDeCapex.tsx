import { useState } from 'react'
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { useObrasDoCenario } from '@/rodada/api/queries'
import { baixarXlsx } from '@/rodada/lib/xlsx'
import { COLUNAS_DA_PLANILHA, linhaDaPlanilha } from '@/rodada/components/GraficoCronogramaObras'
import { QuadroGrafico } from '@/rodada/components/QuadroGrafico'
import { COR, COR_FLUXO, corDoComponente } from '@/rodada/components/cores'
import { brlMi, inteiro } from '@/rodada/lib/formato'
import type { CenarioAnual } from '@/rodada/domain/resultado'

/**
 * "SE QUISÉSSEMOS FAZER TUDO NESTA MESMA JANELA, o orçamento anual seria este."
 *
 * ## Duas perguntas que os dados recusaram antes desta
 *
 * A primeira foi "sem limite de CAPEX, quais obras entrariam em cada ano?".
 * Medida: **6.645 das 7.325 obras podem começar no primeiro ano**. Tirado o
 * dinheiro, não sobra nada segurando obra nenhuma — o gráfico é uma torre e três
 * anos vazios. O achado tem valor (o cronograma do plano é artefato de
 * orçamento, não de engenharia), mas é uma frase, não um gráfico.
 *
 * A segunda foi "quantos anos, ao orçamento de hoje, para fazer tudo que se
 * paga?". Medida: **64**. Setenta barras não são um gráfico.
 *
 * A saída foi FIXAR A JANELA e perguntar do orçamento. Mesmos anos, mesma régua
 * do gráfico de obras por ano — e a resposta cabe em seis barras.
 *
 * ## Empilhado, e não lado a lado
 *
 * A barra inteira é o que o ano CUSTARIA; a parte de baixo é o que o plano já
 * faz nele. Assim a comparação é de altura contra altura dentro da mesma barra,
 * e não entre duas barras vizinhas — e o que o plano cobre aparece como a
 * fatia que é, sem ninguém precisar dividir de cabeça.
 *
 * ## O recorte é uma escolha, e não um default escondido
 *
 * "Obras com VPL positivo" é o cenário defensável — 11,7x. "Todas as obras"
 * inclui o que tem VPL negativo, e é 18,4x. Mostrar só um dos dois esconderia
 * metade da decisão; o controle começa no primeiro porque é o que alguém
 * defenderia numa reunião.
 */
/**
 * "mais 1 ano", e não "mais 1 anos".
 *
 * `Math.round` sobre um número contínuo cai em 1 com frequência nas rodadas
 * pequenas — a frase aparecia errada na tela por causa de um `s` fixo. E
 * arredondar para ZERO seria pior que feio: "seriam mais 0 anos" nega a própria
 * frase, então o piso é o mesmo "menos de 1 ano" que a pessoa entenderia.
 */
function anosEmTexto(anos: number): string {
  const n = Math.round(anos)
  if (n < 1) return 'menos de 1 ano'
  return `${inteiro(n)} ${n === 1 ? 'ano' : 'anos'}`
}

export function CenarioAnualDeCapex({
  dados,
  runId,
}: {
  dados: CenarioAnual
  runId: string | undefined
}) {
  const [escopo, setEscopo] = useState<'paga' | 'todas'>('paga')
  //: A FATIA CLICADA, e não só o tipo. `ano` indefinido é a janela inteira —
  //: é o que o chip mostra, e por isso é o que o chip abre.
  const [fatia, setFatia] = useState<{
    codigo: string
    nome: string
    ano?: number
  } | null>(null)
  const alvo = escopo === 'paga' ? dados.queSePaga : dados.todas

  //: SÓ O QUE FICOU FORA. A barra não é mais dividida entre "o que o plano já
  //: faz" e "o que falta": a pergunta do quadro é quanto FALTA investir, e a
  //: fatia do plano dentro da barra respondia outra — obrigava a subtrair de
  //: olho para achar o número que interessa.
  //:
  //: O plano não some da tela: ele vira a LINHA de referência. Assim a barra diz
  //: uma coisa só, e a distância até a linha continua legível.
  //: OS TIPOS SAIEM DO PRIMEIRO ANO, e não de um `Set` sobre todos: o backend
  //: manda a mesma lista em todos os anos, na mesma ordem (CAPEX decrescente),
  //: justamente para a pilha não trocar de ordem entre uma barra e outra.
  const tipos = (dados.anos[0]?.porComponente ?? []).map((c) => ({
    nome: c.componente,
    codigo: c.codigo,
    // O TOTAL DA JANELA, e não o do primeiro ano: o chip promete "as obras
    // deste tipo", e a lista que ele abre é a do tipo inteiro. Mostrar o valor
    // de um ano ao lado de uma lista de todos seria o mesmo descasamento que a
    // divisão anual já obriga a explicar.
    capex: dados.anos.reduce((t, a) => {
      const daquele = a.porComponente.find((x) => x.codigo === c.codigo)
      return t + (daquele ? (escopo === 'paga' ? daquele.queSePaga : daquele.todas) : 0)
    }, 0),
  }))

  const series = dados.anos.map((a) => {
    const linha: Record<string, string | number> = {
      ano: String(a.ano),
      'Teto do ano': a.orcado / 1e6,
    }
    for (const c of a.porComponente) {
      linha[c.componente] = (escopo === 'paga' ? c.queSePaga : c.todas) / 1e6
    }
    return linha
  })

  return (
    <QuadroGrafico
      titulo="Se quiséssemos fazer tudo nesta janela"
      nota={`a linha é o teto de CAPEX de cada ano — ${dados.anosDaJanela} anos de janela`}
      acoes={
        <SegmentedControl
          aria-label="Escopo do cenário"
          value={escopo}
          onChange={(v) => setEscopo(v as 'paga' | 'todas')}
          options={[
            /* "VPL POSITIVO" é do CONJUNTO que a obra serve, e não da obra.
               Tronco, EEE e linha de recalque não têm receita própria — só
               ligação e CTS têm —, então nenhum deles teria VPL por si. O que o
               backend marca é a obra que serve ao menos uma sub-bacia com saldo
               positivo, e é isso que faz o recorte trazer a cadeia inteira até
               a ETE junto com a ligação que a justifica. */
            { value: 'paga', label: 'Obras com VPL positivo' },
            { value: 'todas', label: 'Todas as obras' },
          ]}
        />
      }
      legenda={
        /* OS CHIPS SÃO A LEGENDA, e não um segundo elenco ao lado dela.
              Havia a legenda do Recharts (alfabética) e esta lista (por CAPEX
              decrescente, que é a ordem da pilha): a mesma informação em duas
              ordens, uma acima da outra. Ficou esta, porque ela é a que serve —
              traz o valor, segue a ordem do empilhamento e é clicável.

              AS FATIAS TAMBÉM SÃO BOTÕES, e não só a barra.
              Clicar na fatia empilhada funciona, mas é um alvo de 29 px que o
              teclado não alcança — e a lista de obras não pode depender de mouse
              preciso. Os chips são o mesmo gesto com nome, número e foco visível,
              e de quebra dizem de que o dinheiro é feito sem passar o mouse. */
        <ul className="mt-3 flex flex-wrap gap-1.5">
          {tipos.map((t) => (
            <li key={t.codigo}>
              <button
                type="button"
                /* SEM ANO: o chip mostra o total da janela, então abre o
                     total da janela. É o mesmo número dos dois lados. */
                onClick={() => setFatia({ codigo: t.codigo, nome: t.nome })}
                className="flex items-baseline gap-1.5 rounded-full border border-ink-200 bg-white px-2.5 py-1 text-[11.5px] text-ink-700 transition-colors duration-hover ease-saida hover:border-water-200 hover:bg-water-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-water-600"
              >
                <span
                  aria-hidden="true"
                  className="inline-block h-2 w-2 shrink-0 rounded-full"
                  style={{ background: corDoComponente(t.nome) }}
                />
                {t.nome}
                <span className="font-mono tabular-nums text-ink-water">{brlMi(t.capex)}</span>
              </button>
            </li>
          ))}
          {/* O TETO NÃO É UM TIPO DE OBRA, e por isso não é botão: não há lista de
                obras por trás dele. Ele entra na fila porque, sem a legenda do
                Recharts, era a única marca do gráfico que ficaria sem nome — e é
                justamente a régua da pergunta "quantas vezes maior". */}
          <li className="flex items-center gap-1.5 px-1 text-[11.5px] text-ink-water">
            <span
              aria-hidden="true"
              className="inline-block h-0.5 w-4 shrink-0 rounded-full"
              style={{ background: COR_FLUXO.teto }}
            />
            Teto do ano
          </li>
        </ul>
      }
      tabela={{
        colunas: [
          'Ano',
          'Teto do ano',
          'Faltaria investir',
          ...tipos.map((t) => t.nome),
          'CAPEX do plano',
        ],
        linhas: dados.anos.map((a) => [
          String(a.ano),
          brlMi(a.orcado),
          brlMi(escopo === 'paga' ? a.faltaQueSePaga : a.faltaTodas),
          ...a.porComponente.map((c) => brlMi(escopo === 'paga' ? c.queSePaga : c.todas)),
          // O GASTO FICA NA TABELA, e não no gráfico: ele é atribuído ao ano de
          // INÍCIO da obra, então não compara direto com o teto do ano.
          brlMi(a.noPlano),
        ]),
      }}
    >
      {/* A NOTA CARREGA O MESMO NÚMERO EM DUAS RÉGUAS. Um fator de 11,7x é
          abstrato para quem não lida com orçamento todo dia; "mais 64 anos ao
          ritmo de hoje" não é. As duas frases dizem a mesma coisa, e ter as duas
          é o que faz a ideia atravessar. */}
      <p className="mb-3 text-[12px] leading-relaxed text-ink-water">
        Faltam <strong className="font-semibold text-ink-700">{inteiro(alvo.obras)} obras</strong>,{' '}
        <strong className="font-semibold text-ink-700">{brlMi(alvo.capex)}</strong>. Cabendo na
        mesma janela, o orçamento anual precisaria ser{' '}
        {/* "1,1× O DE HOJE", e não "1,1× maior". "N vezes maior" tem duas
            leituras — N vezes o valor, ou o valor mais N vezes ele — e elas
            divergem justamente quando o fator é pequeno, que é quando a frase
            mais importa: com 1,1, uma leitura diz +10% e a outra diz +110%. */}
        <strong className="font-semibold text-ink-700">
          {alvo.fator.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}× o de hoje
        </strong>{' '}
        — ou, ao ritmo de hoje, seriam mais{' '}
        <strong className="font-semibold text-ink-700">
          {anosEmTexto(alvo.anosAoRitmoDeHoje)}
        </strong>
        .
      </p>

      {/* A NOTA "B": o achado que nao virou grafico. Fica ACIMA das barras
          porque explica por que elas tem a forma que tem — sem ela, alguem
          poderia ler o cenario como se o cronograma fosse limitado por
          engenharia, e nao por dinheiro. */}
      <p className="mb-3 rounded-lg bg-ink-50 px-3 py-2 text-[11.5px] leading-snug text-ink-600">
        Sem limite de CAPEX,{' '}
        <strong className="font-semibold text-ink-900">
          {inteiro(dados.podemComecarCedo.obras)} destas {inteiro(dados.podemComecarCedo.de)} obras
          poderiam começar já no primeiro ano
        </strong>
        . O que espalha o plano no tempo é o orçamento, não a engenharia.
      </p>

      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={series} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={COR.grid} />
          <XAxis dataKey="ano" tick={{ fontSize: 11 }} />
          <YAxis
            tick={{ fontSize: 11 }}
            width={54}
            label={{
              value: 'R$ Mi',
              angle: -90,
              position: 'insideLeft',
              fontSize: 11,
            }}
          />
          <Tooltip
            formatter={(v) =>
              `R$ ${Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} Mi`
            }
          />
          {/* EMPILHADA POR TIPO DE ELEMENTO, como o cronograma de obras do
              plano — e pela mesma razão: dois anos que precisam do mesmo
              dinheiro podem ser planos completamente diferentes. Um ano de
              tronco e ETE não é um ano de ligação, e a altura sozinha não
              distingue os dois. */}
          {tipos.map((t) => (
            <Bar
              key={t.nome}
              dataKey={t.nome}
              stackId="falta"
              fill={corDoComponente(t.nome)}
              /* CLICAR NA FATIA ABRE AS OBRAS DAQUELE TIPO — o mesmo gesto do
                 cronograma do plano, para não haver dois vocabulários de
                 interação na mesma aba. */
              cursor="pointer"
              /* O ÍNDICE, e não `payload.ano`: `series` e `dados.anos` são a
                 mesma lista na mesma ordem, e o índice sobrevive a mudança de
                 forma do payload do Recharts. */
              onClick={(_, i) =>
                setFatia({
                  codigo: t.codigo,
                  nome: t.nome,
                  ano: dados.anos[i]?.ano,
                })
              }
            />
          ))}
          {/* O TETO DE CADA ANO — e não a média, nem o que o plano gastou.
              A média (R$ 50 Mi) achatava o que varia; e o GASTO não serve de
              referência aqui por uma razão de contabilidade: ele é atribuído ao
              ano em que a obra COMEÇA, e a obra consome orçamento ao longo da
              execução. Por isso o gasto de 2027 aparece como R$ 72,7 Mi contra
              um teto de R$ 60,0 Mi — não é estouro, é régua diferente.

              O teto é a régua da decisão: foi ele que barrou as obras da barra,
              e é dele que a pergunta "quantas vezes maior" fala. */}
          {/* O ANEL DE SUPERFÍCIE DA LINHA, e não decoração: no cenário grande
              a linha do teto corre POR DENTRO das barras, e vermelho sobre o
              laranja do tronco é o pior par que este quadro produz. O traço
              largo da cor do fundo abre uma folga de 2 px de cada lado, e a
              linha volta a se ler sobre qualquer fatia.

              Fora da legenda e fora do tooltip: ela não é uma série, é o
              contorno da que vem logo abaixo. */}
          <Line
            type="monotone"
            dataKey="Teto do ano"
            stroke="var(--viz-surface)"
            strokeWidth={6}
            dot={false}
            activeDot={false}
            legendType="none"
            tooltipType="none"
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="Teto do ano"
            /* `COR_FLUXO.teto`, e NÃO `COR.entra`: os dois tokens resolviam para
               o mesmo #2e4ec9, que é o slot da "Rede coletora". A linha de
               referência e uma série de identidade saíam com a cor idêntica, uma
               ao lado da outra na legenda. O sistema já reserva um vermelho para
               teto de orçamento — é este, e ele não é slot de nenhum componente. */
            stroke={COR_FLUXO.teto}
            strokeWidth={2}
            dot={{ r: 3 }}
          />
        </ComposedChart>
      </ResponsiveContainer>

      {fatia && (
        <ObrasDaFatia
          runId={runId}
          escopo={escopo}
          codigo={fatia.codigo}
          nome={fatia.nome}
          ano={fatia.ano}
          aoFechar={() => setFatia(null)}
        />
      )}
    </QuadroGrafico>
  )
}

/**
 * AS OBRAS DE UMA FATIA que ficou fora do plano — a lista e o arquivo.
 *
 * OS TRÊS RECORTES DA TELA CHEGAM AQUI, e é isso que o quadro promete: o escopo
 * do controle no topo, o ano da barra clicada e o tipo da fatia. Foi um defeito
 * real enquanto não era assim — o chip dizia R$ 514,5 Mi ("VPL positivo") e
 * a planilha vinha com as 876 obras e R$ 1.210,8 Mi de "todas as obras".
 *
 * O ANO É UMA ATRIBUIÇÃO, e não um cronograma. Cada obra fora do plano cai num
 * ano só, dentro das cotas do orçamento, para responder "de quanto teria de
 * ser" — não é a ordem em que a engenharia as faria. O subtítulo diz isso, e o
 * chip continua sendo o caminho para a janela inteira.
 */
function ObrasDaFatia({
  runId,
  escopo,
  codigo,
  nome,
  ano,
  aoFechar,
}: {
  runId: string | undefined
  escopo: 'paga' | 'todas'
  codigo: string
  nome: string
  ano?: number
  aoFechar: () => void
}) {
  // 500 é o teto do endpoint, e pedir o teto é de propósito: o botão promete as
  // obras da fatia, então o que a tela tem é o que o arquivo leva. O aviso
  // abaixo cobre o dia em que uma fatia estourar o teto, em vez de deixar a
  // planilha mentir por omissão.
  const obras = useObrasDoCenario(runId, {
    escopo,
    ano,
    componente: codigo,
    tamanho: 500,
  })
  const itens = obras.data?.itens ?? []
  const total = obras.data?.total ?? 0
  const faltando = total - itens.length
  // "com VPL positivo", e não o rótulo inteiro do controle: o subtítulo já
  // começa com a contagem de obras, e "12 obras — obras com VPL positivo" diria
  // a mesma palavra duas vezes na mesma frase.
  const recorte = escopo === 'paga' ? 'com VPL positivo' : 'todas as obras'
  const quando = ano ? `em ${ano}` : 'na janela inteira'

  return (
    <Modal
      open
      onClose={aoFechar}
      size="2xl"
      title={`${nome} fora do plano${ano ? ` · ${ano}` : ''}`}
      subtitle={`${inteiro(total)} obras — ${recorte}, ${quando}${
        ano ? '; o ano é a distribuição do cenário, não um cronograma' : ''
      }`}
      footer={
        <>
          {faltando > 0 && (
            <span className="mr-auto text-[11.5px] text-warning">
              a planilha leva {inteiro(itens.length)} das {inteiro(total)}
            </span>
          )}
          <Button
            variant="secondary"
            disabled={itens.length === 0}
            onClick={() =>
              baixarXlsx(
                {
                  nome: `${nome} fora do plano`,
                  colunas: COLUNAS_DA_PLANILHA,
                  linhas: itens.map(linhaDaPlanilha),
                },
                // O NOME DO ARQUIVO CARREGA O RECORTE. Duas planilhas do mesmo
                // tipo em anos ou escopos diferentes são arquivos diferentes na
                // pasta de downloads — sem isso, a segunda vira "(1)" e ninguém
                // sabe mais qual é qual.
                `fora-do-plano-${codigo}-${escopo}${ano ? `-${ano}` : ''}-${
                  runId ?? 'rodada'
                }.xlsx`,
              )
            }
          >
            Baixar planilha
          </Button>
          <Button variant="primary" onClick={aoFechar}>
            Fechar
          </Button>
        </>
      }
    >
      {obras.isPending ? (
        <p className="text-[12.5px] text-ink-water">Carregando as obras…</p>
      ) : (
        <ul className="flex max-h-[52vh] flex-col gap-1 overflow-y-auto">
          {itens.map((o) => (
            <li
              key={o.obraId}
              className="flex items-baseline justify-between gap-3 rounded-lg bg-ink-50 px-2.5 py-1.5 text-[12px]"
            >
              <span className="min-w-0 truncate text-ink-700">
                {o.obraId} · {o.cidadeId}
              </span>
              <span className="shrink-0 font-mono text-[11.5px] tabular-nums text-ink-water">
                {brlMi(o.capex)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}
