import { Cartao, CelulaLink, TituloSecao } from '@/rodada/components/pecas'
import type { ExplicabilidadeGlobal } from '@/rodada/domain/resultado'
import { inteiro, vazao } from '@/rodada/lib/formato'

/**
 * Rótulo acentuado + explicação em linguagem corrente para cada categoria que
 * o otimizador devolve (ver `_motivo_obra` em `dashboard_otimizador_v2.py`,
 * no backend). O backend guarda a categoria sem acento (é um código, não um
 * texto de tela) — a chave aqui é normalizada (sem acento, minúscula) para
 * casar com ela e devolver a versão correta para exibição.
 *
 * A categoria por si só ("Perdeu a disputa pelo orçamento") é um rótulo de
 * quem já conhece o modelo — para quem não conhece, ela não diz se o problema
 * é a sub-bacia, o orçamento ou uma obra vizinha. A explicação é o que a
 * categoria significa em português, sem jargão de otimização.
 */
const CATEGORIAS: Record<string, { rotulo: string; explicacao: string }> = {
  'perdeu a disputa pelo orcamento': {
    rotulo: 'Perdeu a disputa pelo orçamento',
    explicacao:
      'Ela se pagaria, mas o CAPEX foi para outras obras com mais retorno por real investido.',
  },
  'compartilhada nao acionada': {
    rotulo: 'Compartilhada não acionada',
    explicacao:
      'Depende de uma obra compartilhada que nenhuma sub-bacia acionou — sem elas, o custo da obra não se paga.',
  },
  'nao se paga': {
    rotulo: 'Não se paga',
    explicacao:
      'Mesmo dividindo o custo com as vizinhas, a receita não cobre o investimento — só entraria por obrigação contratual.',
  },
  'so se paga em conjunto': {
    rotulo: 'Só se paga em conjunto',
    explicacao:
      'Sozinha não cobre o custo, mas se pagaria se entrasse em bloco com as vizinhas que usam as mesmas obras.',
  },
  'terceiro (pre-requisito)': {
    rotulo: 'Terceiro (pré-requisito)',
    explicacao:
      'Pré-requisito que será executado por terceiro, sem consumir CAPEX da Aegea — mas a cadeia depende do prazo dele.',
  },
  'construida sem receita (cadeia incompleta)': {
    rotulo: 'Construída, mas sem receita',
    explicacao:
      'A obra dela foi executada e mesmo assim ela não fatura: falta outra obra da cadeia até a ETE. É o CAPEX que já saiu e ainda não virou receita.',
  },
  'travada por obra da cadeia': {
    rotulo: 'Travada por obra da cadeia',
    explicacao: 'O plano já construiu parte da cadeia, mas falta pelo menos uma obra para ela faturar.',
  },
  'compartilhada - habilita sub-bacias': {
    rotulo: 'Compartilhada — habilita sub-bacias',
    explicacao:
      'Obra compartilhada que, uma vez construída, libera a receita de outras sub-bacias além dela mesma.',
  },
  'proibida no banco': {
    rotulo: 'Proibida no banco',
    explicacao: 'Cadastrada como proibida — o otimizador nunca pode escolhê-la.',
  },
  'obrigatoria fora da janela de capex': {
    rotulo: 'Obrigatória fora da janela de CAPEX',
    explicacao: 'Era obrigatória, mas o ano exigido não cabe na janela de CAPEX da rodada.',
  },
  'nao cabe na janela de capex': {
    rotulo: 'Não cabe na janela de CAPEX',
    explicacao: 'Início mínimo mais prazo de obra não conclui dentro da janela de CAPEX da rodada.',
  },
}

function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[—–]/g, '-')
    .toLowerCase()
    .trim()
}

function categoriaExibida(categoria: string) {
  return CATEGORIAS[normalizar(categoria)] ?? { rotulo: categoria, explicacao: undefined }
}

/**
 * "Por que não fatura 100%" — a porta de entrada da explicabilidade, no nível 1.
 *
 * A explicabilidade de verdade (categoria + narrativa + contrafactual) mora na
 * sub-bacia (nível 4, `PainelExplicacao` em `SubBacia.tsx`) e continua lá — ela
 * é o raciocínio de UM caso, e o agregado abaixo não o substitui. O que faltava
 * era um resumo ANTES de descer quatro níveis: quais motivos aparecem mais no
 * plano, e quais obras travam mais sub-bacias. Usuários reportaram que chegar
 * até o nível 4 só para entender "por quê" não é intuitivo — este bloco é a
 * resposta a isso, logo abaixo da faixa de KPIs.
 *
 * Sem seção nenhuma quando 100% fatura: nada a explicar não é omissão, é o
 * resultado — mostrar um card vazio ali confundiria mais do que ajudaria.
 */
export function SecaoPorQue({
  dados,
  runId,
  titulo = 'Por que nem tudo fatura',
}: {
  dados: ExplicabilidadeGlobal
  runId: string | undefined
  /**
   * Nível 2 (item 10 do feedback de 26/08) reaproveita este bloco COM RECORTE
   * DE CIDADE — mesma consulta, mesmo componente, só o título muda para "sub-
   * bacias fora do plano", que é como o pedido foi feito ("quais sistemas e
   * sub-bacias estão sendo priorizados e quais ficaram de fora"). O padrão
   * global fica "Por que nem tudo fatura".
   */
  titulo?: string
}) {
  if (dados.naoFaturando === 0) return null

  return (
    <>
      <TituloSecao nota="resumo do otimizador — o detalhe de cada caso está na sub-bacia">
        {titulo}
      </TituloSecao>
      <div className="grid gap-4 lg:grid-cols-2">
        <Cartao titulo="Motivos, por sub-bacia">
          <p className="-mt-1 mb-3 text-[11px] leading-snug text-ink-500">
            {inteiro(dados.naoFaturando)} de {inteiro(dados.totalSubbacias)} sub-bacias não
            faturam nesta rodada — agrupadas abaixo pelo motivo que o otimizador registrou
            para cada uma.
          </p>
          <ul className="flex flex-col gap-2">
            {dados.categorias.map((c) => {
              const { rotulo, explicacao } = categoriaExibida(c.categoria)
              return (
                <li
                  key={c.categoria}
                  className="rounded-xl border border-ink-100 bg-ink-50 px-3 py-2"
                >
                  <details className="group">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
                      <span className="min-w-0 truncate text-[12.5px] font-medium text-ink-700">
                        {rotulo}
                      </span>
                      <span className="flex shrink-0 items-center gap-1.5 font-mono text-[11.5px] tabular-nums text-ink-500">
                        {inteiro(c.subbacias)} sub-bacia{c.subbacias === 1 ? '' : 's'} ·{' '}
                        {vazao(c.vazaoPresa)} presa
                        <span className="text-ink-400 transition-transform duration-hover ease-saida group-open:rotate-180">
                          ⌄
                        </span>
                      </span>
                    </summary>
                    {explicacao && (
                      <p className="mt-1 text-[11px] leading-snug text-ink-500">{explicacao}</p>
                    )}
                    {c.itens.length > 0 && (
                      <ul className="mt-2 flex flex-col gap-1 border-t border-ink-200 pt-2">
                        {c.itens.map((i) => (
                          <li
                            key={i.subBaciaId}
                            className="flex items-center justify-between gap-3 text-[11.5px]"
                          >
                            <span className="min-w-0 truncate">
                              <CelulaLink to={`/resultados/${runId}/sub-bacias/${i.subBaciaId}`}>
                                <span className="font-mono">{i.subBaciaId}</span>
                              </CelulaLink>{' '}
                              <span className="text-ink-500">
                                · {i.cidadeId} · sistema {i.sistemaId}
                              </span>
                            </span>
                            <span className="shrink-0 font-mono tabular-nums text-ink-500">
                              {vazao(i.vazaoPresa)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </details>
                </li>
              )
            })}
          </ul>
        </Cartao>

        {/* "OBRAS QUE TRAVAM MAIS GENTE" ERA O TÍTULO, e a Aegea perguntou o
            que ele significava (item 15 de 26/08). O novo diz a ação em vez do
            problema: quem lê a lista está procurando onde investir, não onde
            reclamar. A ORDENAÇÃO ainda é por contagem de sub-bacias travadas, e
            passa a ser por vazão liberada junto com o redesenho do bloco — é a
            metade que precisa de backend. */}
        <Cartao
          titulo="Obras que, se construídas, liberam mais sub-bacias"
          nota="clique para abrir a obra"
          ajuda="ELO_QUE_TRAVA"
        >
          <p className="-mt-1 mb-3 text-[11px] leading-snug text-ink-500">
            Obras não construídas cuja falta, sozinha, tira outras sub-bacias do plano —
            ordenadas pela vazão que cada uma libera se entrar no orçamento.
          </p>
          {dados.elos.length === 0 ? (
            <p className="text-[11.5px] text-ink-400">Nenhum elo concentra mais de um caso.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {dados.elos.map((e) => (
                <li
                  key={e.obraId}
                  className="flex items-center justify-between gap-3 rounded-xl border border-ink-100 px-3 py-2"
                >
                  <span className="min-w-0 truncate text-[12.5px]">
                    <CelulaLink to={`/resultados/${runId}/obras/${e.obraId}`}>
                      <span className="font-mono">{e.obraId}</span>
                    </CelulaLink>{' '}
                    <span className="text-ink-500">· {e.componente}</span>
                  </span>
                  {/* VAZÃO LIBERADA, e não a contagem "trava N" (item 15 do
                      feedback de 26/08) — a contagem sozinha deixava o cartão
                      parecendo irrelevante, porque o topo é quase sempre
                      "trava 1" ou "trava 2"; a vazão é a grandeza que muda
                      dependendo de QUEM está preso, não de QUANTOS. */}
                  <span className="shrink-0 text-right">
                    <span className="block font-mono text-[11.5px] tabular-nums text-ink-700">
                      {vazao(e.vazaoLiberada)}
                    </span>
                    <span className="block text-[9.5px] text-ink-400">
                      libera {inteiro(e.bloqueia)}{' '}
                      {e.bloqueia === 1 ? 'sub-bacia' : 'sub-bacias'}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Cartao>
      </div>
      <ComoIstoECalculado />
    </>
  )
}

/**
 * "SÃO CLASSIFICAÇÕES OU INTERPRETAÇÃO DE IA?" — a pergunta da Aegea em 26/08
 * (item 24), respondida na própria tela.
 *
 * Ela vai voltar: um bloco que escreve frases em português sobre o porquê de
 * cada decisão parece saída de modelo de linguagem, e num app que sustenta
 * decisão de investimento a diferença entre "uma regra decidiu" e "um modelo
 * achou" é a diferença entre auditável e não auditável. Responder no e-mail
 * resolve uma vez; responder na tela resolve para quem abrir daqui a um ano.
 *
 * O `<details>` fechado é deliberado: quem já sabe não relê, e quem desconfia
 * encontra sem procurar. Fica ao pé do bloco inteiro, e não dentro de um dos
 * dois cartões, porque a resposta vale para os dois.
 */
function ComoIstoECalculado() {
  return (
    <details className="group mt-3 rounded-xl border border-ink-100 bg-ink-50 px-3.5 py-2.5">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[11.5px] font-semibold text-ink-600 [&::-webkit-details-marker]:hidden">
        Como isto é calculado
        <span
          aria-hidden="true"
          className="text-ink-400 transition-transform duration-hover ease-saida group-open:rotate-180"
        >
          ⌄
        </span>
      </summary>
      <div className="mt-2 flex flex-col gap-2 border-t border-ink-200 pt-2 text-[11.5px] leading-relaxed text-ink-600">
        <p>
          <b className="font-semibold text-ink-800">São classificações determinísticas, não IA.</b>{' '}
          Não há nenhuma chamada a modelo de linguagem em nenhuma parte do produto.
        </p>
        <p>
          Para cada obra, o otimizador percorre uma sequência fixa de regras sobre o próprio estado
          da rodada — a obra é necessária? é executada por terceiro? entrou no plano? está proibida
          no banco? cabe na janela de CAPEX? falta alguma predecessora, e qual? — e a primeira regra
          que se aplica define a categoria. A frase é montada com os números daquela rodada.
        </p>
        <p>
          Duas consequências práticas: a mesma rodada produz sempre exatamente o mesmo texto, e cada
          categoria é rastreável a uma linha de código (<code className="font-mono">_motivo_obra</code>,
          em <code className="font-mono">dashboard_otimizador_v2.py</code>).
        </p>
      </div>
    </details>
  )
}
