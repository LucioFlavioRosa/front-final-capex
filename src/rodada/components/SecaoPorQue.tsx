import { Cartao, CelulaLink, TituloSecao } from '@/rodada/components/pecas'
import type { ExplicabilidadeGlobal, TopicoDaExplicabilidade } from '@/rodada/domain/resultado'
import { brlMi, inteiro } from '@/rodada/lib/formato'

/**
 * O QUE FICOU FORA DO PLANO — em obras, e em três tópicos.
 *
 * ## Por que obra, e não sub-bacia
 *
 * Esta seção agrupava SUB-BACIAS que não faturam. A troca de unidade não é de
 * rótulo: **a lista antiga não tinha onde pôr 85% do dinheiro que ficou de
 * fora.** Obra de transporte — tronco, elevatória, módulo de ETE — não tem
 * sub-bacia própria, então não cabia numa lista cuja linha é uma sub-bacia. No
 * maior run publicado eram 4.531 obras e R$ 4,4 bi invisíveis nesta tela,
 * contra R$ 773 Mi que ela mostrava.
 *
 * E a pergunta é sobre obra: uma sub-bacia não "entra no plano" — quem entra ou
 * não é a obra que a atende.
 *
 * ## Por que três, e por que estes três
 *
 * O agrupamento é pelo QUE FAZER a respeito, que é o que separa três tópicos
 * úteis de três rótulos. Eram onze categorias do motor, e ninguém lia onze.
 *
 * A LINHA CAI NA RECEITA, e por isso os três são do domínio e não da tela: só
 * ligação e CTS faturam. Os dois primeiros tópicos são obras com receita própria
 * — só elas podem ser julgadas por "não se paga" ou "perdeu o orçamento". O
 * terceiro é quase todo sem receita: existe para o esgoto chegar à ETE, e só
 * entra se o que ele serve entrar.
 *
 * Sem seção nenhuma quando nada ficou fora: não é omissão, é o resultado.
 */

/** O que cada tópico significa, e o que fazer com ele. */
const TOPICOS: Record<string, { rotulo: string; oQueFazer: string }> = {
  orcamento: {
    rotulo: 'Não coube no orçamento',
    oQueFazer:
      'O plano quis estas obras e o teto acabou. É o único grupo que mais orçamento compra — a análise de sensibilidade mostra quanto.',
  },
  nao_se_paga: {
    rotulo: 'Não se pagam',
    oQueFazer:
      'A receita própria não cobre o custo, sozinha ou em conjunto. Mais orçamento não muda isso; preço, custo ou meta mudam.',
  },
  depende: {
    rotulo: 'Dependem de outra obra',
    oQueFazer:
      'Transporte e infraestrutura compartilhada, sem receita própria: levam o esgoto até a ETE. Não foram recusadas por mérito — ninguém as acionou, porque o que elas serviriam não entrou.',
  },
  // VÁLVULA, e não quarto tópico: categoria nova do motor aparece aqui em vez de
  // sumir do agregado e fazer as parcelas não fecharem com o cabeçalho.
  outros: {
    rotulo: 'Outros motivos',
    oQueFazer: 'Motivos que o otimizador registrou e esta tela ainda não agrupa.',
  },
}

export function SecaoPorQue({
  dados,
  runId,
  titulo = 'O que ficou fora do plano',
}: {
  dados: ExplicabilidadeGlobal
  runId: string | undefined
  /** O nível 2 e o 3 reaproveitam o bloco com recorte; só o título muda. */
  titulo?: string
}) {
  if (dados.obrasFora === 0) return null

  return (
    <>
      <TituloSecao nota="resumo do otimizador — o detalhe de cada caso está na sub-bacia">
        {titulo}
      </TituloSecao>

      <p className="-mt-2 mb-3 text-[12px] leading-relaxed text-ink-water">
        <strong className="font-semibold text-ink-700">
          {inteiro(dados.obrasFora)} de {inteiro(dados.obrasCandidatas)} obras
        </strong>{' '}
        ficaram fora, somando <strong className="font-semibold text-ink-700">
          {brlMi(dados.capexFora)}
        </strong>{' '}
        de CAPEX e {inteiro(dados.ligacoesFora)} ligações não conectadas.{' '}
        {inteiro(dados.obrasNoPlano)} entraram.
        {dados.deTerceiros > 0 && (
          <>
            {' '}
            {/* FORA DA CONTA, e dito: obra de terceiro ACONTECE — só que outro
                paga. Somá-la ao "ficou de fora" infla o número com linhas que
                ninguém aqui pode acionar. */}
            Outras {inteiro(dados.deTerceiros)} são de terceiros: acontecem, e quem paga é
            outro — ficam fora desta conta.
          </>
        )}
      </p>

      <div className="grid gap-4">
        {dados.topicos.map((t) => (
          <BlocoDoTopico key={t.topico} topico={t} runId={runId} />
        ))}
      </div>
    </>
  )
}

function BlocoDoTopico({
  topico,
  runId,
}: {
  topico: TopicoDaExplicabilidade
  runId: string | undefined
}) {
  const { rotulo, oQueFazer } = TOPICOS[topico.topico] ?? {
    rotulo: topico.topico,
    oQueFazer: '',
  }

  return (
    <Cartao titulo={rotulo}>
      <p className="-mt-1 mb-3 text-[11.5px] leading-snug text-ink-water">{oQueFazer}</p>

      <div className="mb-3 flex flex-wrap items-baseline gap-x-5 gap-y-1 font-mono text-[12.5px] tabular-nums text-ink-700">
        <span>
          <strong className="font-semibold">{inteiro(topico.obras)}</strong> obras
        </span>
        <span>
          <strong className="font-semibold">{brlMi(topico.capex)}</strong> de CAPEX
        </span>
        {/* LIGAÇÕES SÓ QUANDO EXISTEM. Zero aqui não é "não medimos": é a regra
            do domínio — obra de transporte não fatura. Mostrar "0 ligações"
            convidaria a lê-lo como falha de dado. */}
        {topico.ligacoes > 0 && (
          <span>
            <strong className="font-semibold">{inteiro(topico.ligacoes)}</strong> ligações
          </span>
        )}
      </div>

      {/* POR TIPO DE OBRA — a leitura de dentro do tópico. São seis tipos na base
          inteira, então a lista é curta por natureza, e diz de que o dinheiro é
          feito: um tópico de R$ 4,4 bi em tronco e ETE não é o mesmo que um de
          R$ 4,4 bi em ligação. */}
      <ul className="flex flex-col gap-1">
        {topico.porComponente.map((c) => (
          <li
            key={c.componente}
            className="flex items-baseline justify-between gap-3 rounded-lg bg-ink-50 px-2.5 py-1.5"
          >
            <span className="min-w-0 truncate text-[12px] text-ink-700">{c.componente}</span>
            <span className="shrink-0 font-mono text-[11.5px] tabular-nums text-ink-water">
              {inteiro(c.obras)} · {brlMi(c.capex)}
            </span>
          </li>
        ))}
      </ul>

      {topico.maiores.length > 0 && (
        <details className="group mt-3">
          <summary className="cursor-pointer list-none text-[11.5px] font-medium text-water-700 [&::-webkit-details-marker]:hidden">
            {/* O RÓTULO DIZ QUE É AMOSTRA, e diz de quantas. A lista completa
                seriam 6.765 linhas — mandar tudo trocaria uma tela pesada por
                uma ilegível, e mostrar dez sob um título de "1.142" sem avisar
                faria uma ser lida como a outra. */}
            as {topico.maiores.length} maiores de {inteiro(topico.obras)}, por CAPEX
            <span className="ml-1 inline-block transition-transform duration-hover ease-saida group-open:rotate-180">
              ⌄
            </span>
          </summary>
          <ul className="mt-2 flex flex-col gap-1">
            {topico.maiores.map((o) => (
              <li
                key={o.obraId}
                className="flex items-baseline justify-between gap-3 px-2.5 text-[12px]"
              >
                <span className="min-w-0 truncate text-ink-700">
                  {o.subBaciaId && runId ? (
                    <CelulaLink to={`/resultados/${runId}/sub-bacias/${o.subBaciaId}`}>
                      {o.componente} · {o.subBaciaId}
                    </CelulaLink>
                  ) : (
                    <>
                      {o.componente} · {o.obraId}
                    </>
                  )}
                </span>
                <span className="shrink-0 font-mono text-[11.5px] tabular-nums text-ink-water">
                  {brlMi(o.capex)}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </Cartao>
  )
}
