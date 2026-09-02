import { useState } from 'react'
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { QuadroGrafico } from '@/rodada/components/QuadroGrafico'
import { COR } from '@/rodada/components/cores'
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
 * "Só o que se paga" é o cenário defensável — 11,7x. "Todas as obras" inclui o
 * que tem VPL negativo, e é 18,4x. Mostrar só um dos dois esconderia metade da
 * decisão; o controle começa no primeiro porque é o que alguém defenderia numa
 * reunião.
 */
export function CenarioAnualDeCapex({ dados }: { dados: CenarioAnual }) {
  const [escopo, setEscopo] = useState<'paga' | 'todas'>('paga')
  const alvo = escopo === 'paga' ? dados.queSePaga : dados.todas

  //: SÓ O QUE FICOU FORA. A barra não é mais dividida entre "o que o plano já
  //: faz" e "o que falta": a pergunta do quadro é quanto FALTA investir, e a
  //: fatia do plano dentro da barra respondia outra — obrigava a subtrair de
  //: olho para achar o número que interessa.
  //:
  //: O plano não some da tela: ele vira a LINHA de referência. Assim a barra diz
  //: uma coisa só, e a distância até a linha continua legível.
  const series = dados.anos.map((a) => ({
    ano: String(a.ano),
    'Faltaria investir': (escopo === 'paga' ? a.faltaQueSePaga : a.faltaTodas) / 1e6,
    'CAPEX do plano': a.noPlano / 1e6,
  }))

  return (
    <QuadroGrafico
      titulo="Se quiséssemos fazer tudo nesta janela"
      nota={`a linha é o CAPEX que o plano gasta em cada ano — ${dados.anosDaJanela} anos de janela`}
      acoes={
        <SegmentedControl
          aria-label="Escopo do cenário"
          value={escopo}
          onChange={(v) => setEscopo(v as 'paga' | 'todas')}
          options={[
            { value: 'paga', label: 'Só o que se paga' },
            { value: 'todas', label: 'Todas as obras' },
          ]}
        />
      }
      tabela={{
        colunas: ['Ano', 'CAPEX do plano', 'Faltaria investir', 'Teto do ano'],
        linhas: dados.anos.map((a) => [
          String(a.ano),
          brlMi(a.noPlano),
          brlMi(escopo === 'paga' ? a.faltaQueSePaga : a.faltaTodas),
          brlMi(a.orcado),
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
        <strong className="font-semibold text-ink-700">
          {alvo.fator.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}× maior
        </strong>{' '}
        — ou, ao ritmo de hoje, seriam mais{' '}
        <strong className="font-semibold text-ink-700">
          {Math.round(alvo.anosAoRitmoDeHoje)} anos
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
            label={{ value: 'R$ Mi', angle: -90, position: 'insideLeft', fontSize: 11 }}
          />
          <Tooltip
            formatter={(v) =>
              `R$ ${Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} Mi`
            }
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="Faltaria investir" fill={COR.total} />
          {/* O CAPEX REAL DO PLANO, ANO A ANO — e não uma linha na média.
              A média (R$ 50 Mi) achatava justamente o que varia: o plano gasta
              R$ 72,7 Mi em 2027 e R$ 29,0 Mi em 2032. Com a linha reta, a
              distância até a barra era a mesma em todo ano; com a linha real,
              cada ano diz a sua própria distância. */}
          <Line
            type="monotone"
            dataKey="CAPEX do plano"
            stroke={COR.entra}
            strokeWidth={2}
            dot={{ r: 3 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </QuadroGrafico>
  )
}
