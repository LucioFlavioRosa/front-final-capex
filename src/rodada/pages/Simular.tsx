import { rotuloObjetivo } from '@/rodada/domain/pedido'
import { useMemo, useReducer, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CheckCircle, Play, Plus, XCircle, X } from '@phosphor-icons/react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { useToast } from '@/components/ui/Toaster'
import { Cartao } from '@/rodada/components/pecas'
import { useCriarRodada, useProntidao } from '@/rodada/api/queries'
import { useRegionais, useUnidade, useUnidades, type UnidadeResumo } from '@/lib/organizacaoApi'
import {
  BotaoAjuda,
  PainelDicionario,
  ProvedorDicionario,
  RotuloParametro,
} from '@/rodada/components/Dicionario'
import {
  bloqueado,
  corpoDaRodada,
  derivarOrcamento,
  estadoInicial,
  numOuNulo,
  validar,
  type BaseReceita,
  type CurvaAdocao,
  type DerivadoOrcamento,
  type EstadoSimulacao,
  type ItemChecklist,
  type LinhaOrcamento,
  type ModoOrcamento,
  type Penalidade,
} from '@/rodada/domain/simulacao'

/**
 * A única tela do app que CRIA alguma coisa.
 *
 * As outras leem; o cadastro atualiza (PUT idempotente sobre algo que já
 * existe). Aqui um POST cria uma rodada com um `run_id` que passa a existir
 * para sempre no histórico — e é isso que justifica o checklist barrar em vez
 * de só avisar.
 *
 * Quatro regras que o desenho carrega, e nenhuma delas é estética:
 *
 *  1. NÃO EXISTE CAMPO DE JANELA DE CAPEX. Ela é o intervalo dos anos com
 *     verba, mostrada no estado derivado ao lado do orçamento. Dois campos para
 *     a mesma verdade divergiriam no primeiro ano zerado.
 *  2. O CHECKLIST TEM DOIS ESTADOS, não três. `'avisa'` é declarado no tipo e
 *     `validar()` nunca o emite; desenhar a moldura âmbar seria herdar por
 *     descuido um estado inalcançável. O mapa abaixo mantém `avisa → warning`
 *     para o dia em que o produto voltar a emiti-lo, sem tela dedicada.
 *  3. CADA BLOQUEIO DIZ O QUE FAZER. Um checklist que só nega é uma parede.
 *  4. O PARSER É ESTRITO. `12abc` devolve `null`, não 12 — o cadastro já pagou
 *     por um parser tolerante que contaminava CAPEX em silêncio.
 */

const SELECT =
  'w-full rounded-lg border-[1.5px] border-ink-200 bg-white px-3 py-2 text-sm outline-none transition-colors duration-hover ease-saida focus:border-water-600 focus:ring-2 focus:ring-water-600/25'

type Acao =
  | { tipo: 'campo'; campo: keyof EstadoSimulacao; valor: never }
  | { tipo: 'set'; patch: Partial<EstadoSimulacao> }
  | { tipo: 'linha'; i: number; chave: 'ano' | 'valor'; valor: string }
  | { tipo: 'addLinha' }
  | { tipo: 'delLinha'; i: number }

function redutor(e: EstadoSimulacao, a: Acao): EstadoSimulacao {
  switch (a.tipo) {
    case 'set':
      return { ...e, ...a.patch }
    case 'linha': {
      const orcamento = e.orcamento.map((l, i) =>
        i === a.i ? { ...l, [a.chave]: a.valor } : l,
      )
      return { ...e, orcamento }
    }
    case 'addLinha': {
      const ultimo = e.orcamento[e.orcamento.length - 1]
      const proximo = ultimo ? String((numOuNulo(ultimo.ano) ?? 0) + 1) : ''
      // A linha nova nasce VAZIA no valor, de propósito: ela precisa aparecer
      // tracejada e bloquear até alguém informar a verba. Herdar o valor da
      // anterior criaria orçamento que ninguém digitou.
      return { ...e, orcamento: [...e.orcamento, { ano: proximo, valor: '' }] }
    }
    case 'delLinha':
      return { ...e, orcamento: e.orcamento.filter((_, i) => i !== a.i) }
    default:
      return e
  }
}

export function Simular() {
  const navegar = useNavigate()
  const { toast } = useToast()
  const [estado, despachar] = useReducer(redutor, undefined, estadoInicial)

  /**
   * O MAIOR TETO DO CRONOGRAMA — a régua da barrinha de cada card.
   *
   * A barra é relativa ao maior ano, e não a um valor fixo: o que ela mostra é a
   * FORMA do cronograma (a rampa que desce de 60 para 10), que numa lista de
   * quinze números só aparece se alguém comparar de cabeça. Zero desliga as
   * barras — sem verba nenhuma, régua não existe.
   */
  const tetoDoCronograma = useMemo(
    () => Math.max(0, ...estado.orcamento.map((l) => numOuNulo(l.valor) ?? 0)),
    [estado.orcamento],
  )

  /**
   * OS ANOS REPETIDOS, para marcar os cards culpados.
   *
   * MESMA REGRA de `validar()`, e é ela que bloqueia — aqui só se aponta ONDE.
   * Numa lista rolável o ano repetido era invisível; numa grade de quinze cards
   * seria pior, porque tudo cabe na tela e o erro continua igual aos vizinhos.
   *
   * Só ano VÁLIDO entra: o card de ano em branco já se anuncia tracejado, e
   * pintá-lo de vermelho por "repetido" nomearia o problema errado.
   */
  const anosRepetidos = useMemo(() => {
    const vistos = new Set<number>()
    const repetidos = new Set<number>()
    for (const l of estado.orcamento) {
      const ano = numOuNulo(l.ano)
      if (ano === null) continue
      if (vistos.has(ano)) repetidos.add(ano)
      vistos.add(ano)
    }
    return repetidos
  }, [estado.orcamento])
  /**
   * NASCE ABERTO, e antes do Orçamento na coluna.
   *
   * O argumento para nascer fechado e no fim continua verdadeiro: mudar um
   * destes valores muda o resultado de quem só clica Iniciar. Mas essa proteção
   * supõe um operador, e o usuário é analista de
   * cenário — "esses parâmetros serão bastante usados para brincar com os
   * cenários". Quem usa todo dia não deve ter de abrir uma gaveta todo dia.
   *
   * O que segura o disparo por engano continua de pé: o aviso sobre os defaults
   * logo abaixo do título, e o `ResumoDaRodada` fixo na direita, que mostra os
   * onze valores juntos antes do clique.
   */
  const [avancado, setAvancado] = useState(true)

  const prontidao = useProntidao(estado.unidadeId || undefined)
  const criar = useCriarRodada()
  const regionais = useRegionais()
  const unidades = useUnidades(estado.regionalId || undefined)
  // O PORTE da unidade escolhida. Consulta própria porque a lista do `<select>`
  // não o traz: são oito `count(*)` sobre a topologia, e cobrá-los por unidade
  // listada pagaria caro por números que ninguém vê antes de escolher.
  const unidade = useUnidade(estado.unidadeId || undefined)

  const derivado = useMemo(() => derivarOrcamento(estado), [estado])
  const checklist = useMemo(
    () => validar(estado, prontidao.data),
    [estado, prontidao.data],
  )
  const barrado = bloqueado(checklist)

  function disparar() {
    criar.mutate(corpoDaRodada(estado), {
      onSuccess: (r) => {
        /**
         * `status` MANDA, não o código HTTP.
         *
         * O servidor deduplica: pedido idêntico do mesmo usuário devolve a
         * rodada que já existe. Se ela já CONCLUIU, o status volta `SUCESSO` —
         * e abrir o modal de acompanhamento faria a tela acompanhar algo que
         * terminou ontem. Então vai direto para os resultados.
         */
        if (r.status === 'SUCESSO') {
          toast(
            r.jaExistia
              ? 'Esta rodada já existia e já terminou — abrindo os resultados.'
              : 'Rodada concluída.',
            'success',
          )
          navegar(`/resultados/${r.runId}`)
          return
        }
        // `jaExistia` ausente significa "não sei", e é tratado como caminho
        // normal — servidor antigo não manda o campo.
        toast(
          r.jaExistia
            ? 'Já havia uma rodada igual em execução — acompanhando aquela.'
            : 'Rodada enviada para a fila.',
          'info',
        )
        navegar('/resultados')
      },
      onError: () => toast('Não foi possível iniciar a simulação. Tente de novo.', 'warning'),
    })
  }

  return (
    <ProvedorDicionario>
    <section className="max-w-content mx-auto animate-fade-in px-4 py-8 md:px-6">
      <PainelDicionario />
      <PageHeader
        eyebrow="Nova rodada"
        title="Simular sequenciamento"
        subtitle="Os parâmetros valem só para esta rodada — o cadastro da unidade não muda."
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          <Cartao titulo="Unidade">
            {/* Regional → unidade, encadeados. Trocar a regional LIMPA a
                unidade: manter a anterior deixaria selecionada uma unidade que
                não está mais na lista visível, e a prontidão continuaria
                respondendo por ela. */}
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-[10.5px] font-bold uppercase tracking-[.075em] text-ink-water">
                  Regional
                </span>
                <select
                  value={estado.regionalId}
                  disabled={regionais.isPending}
                  onChange={(e) =>
                    despachar({
                      tipo: 'set',
                      patch: { regionalId: e.target.value, unidadeId: '' },
                    })
                  }
                  className={`${SELECT} disabled:cursor-not-allowed disabled:bg-ink-50 disabled:text-ink-water`}
                >
                  <option value="">
                    {regionais.isPending ? 'Carregando…' : 'Selecione…'}
                  </option>
                  {(regionais.data ?? []).map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.nome}
                    </option>
                  ))}
                </select>
                {regionais.isError && (
                  <p className="mt-1 text-[10.5px] text-danger">
                    Não foi possível carregar as regionais.{' '}
                    <button
                      type="button"
                      onClick={() => regionais.refetch()}
                      className="font-semibold underline"
                    >
                      Tentar de novo
                    </button>
                  </p>
                )}
              </label>
              {/* `htmlFor`/`id` em vez do `<label>` envolvente do campo ao
                  lado: o rótulo do parâmetro carrega o nome técnico, e dentro
                  de um label envolvente ele entraria no NOME ACESSÍVEL do
                  select — "Unidade UNIDADE". */}
              <div className="block">
                <RotuloParametro texto="Unidade" tecnico="UNIDADE" htmlFor="campo-unidade" />
                <select
                  id="campo-unidade"
                  value={estado.unidadeId}
                  disabled={!estado.regionalId || unidades.isPending}
                  onChange={(e) => despachar({ tipo: 'set', patch: { unidadeId: e.target.value } })}
                  className={`${SELECT} disabled:cursor-not-allowed disabled:bg-ink-50 disabled:text-ink-water`}
                >
                  <option value="">
                    {!estado.regionalId
                      ? 'Escolha a regional antes'
                      : unidades.isPending
                        ? 'Carregando…'
                        : 'Selecione…'}
                  </option>
                  {(unidades.data ?? []).map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.id} · {u.nome}
                    </option>
                  ))}
                </select>
                {unidades.isError && (
                  <p className="mt-1 text-[10.5px] text-danger">
                    Não foi possível carregar as unidades.{' '}
                    <button
                      type="button"
                      onClick={() => unidades.refetch()}
                      className="font-semibold underline"
                    >
                      Tentar de novo
                    </button>
                  </p>
                )}
              </div>
            </div>
            <div className="mt-3 block">
              <RotuloParametro texto="Nome da rodada" tecnico="ROTULO" htmlFor="campo-nome" />
              <input
                id="campo-nome"
                value={estado.nome}
                onChange={(e) => despachar({ tipo: 'set', patch: { nome: e.target.value } })}
                placeholder="Orçamento base 2031"
                className="w-full rounded-lg border-[1.5px] border-ink-200 bg-white px-3 py-2 text-sm outline-none transition-colors duration-hover ease-saida focus:border-water-600 focus:ring-2 focus:ring-water-600/25"
              />
            </div>
          </Cartao>

          <Cartao>
            <button
              type="button"
              onClick={() => setAvancado((v) => !v)}
              aria-expanded={avancado}
              className="flex w-full items-center justify-between text-left"
            >
              <span className="text-[13px] font-bold text-ink-800">Parâmetros do motor</span>
              <span className="text-[11.5px] font-semibold text-water-600">
                {avancado ? 'Ocultar' : 'Mostrar'}
              </span>
            </button>
            <p className="mt-1 text-[11.5px] leading-snug text-ink-water">
              Os valores padrão são os que a equipe roda hoje — mudar um deles muda o resultado de
              quem só clicar Iniciar.
            </p>

            {avancado && (
              <div className="mt-3.5 grid gap-3 sm:grid-cols-2">
                <div>
                  <RotuloParametro
                    texto={`Objetivo — ${rotuloObjetivo(numOuNulo(estado.foco) ?? 0)}`}
                    tecnico="FOCO_COBERTURA"
                  />
                  <SegmentedControl
                    aria-label="Objetivo"
                    value={estado.foco}
                    onChange={(v) => despachar({ tipo: 'set', patch: { foco: v } })}
                    /**
                     * ORDEM PEDIDA PELA AEGEA (item 16): Cobertura, Equilíbrio,
                     * Só VPL — o inverso da anterior. Só a ORDEM mudou: os
                     * `value` ('1' | '0.5' | '0') são o que viaja como
                     * `foco_cobertura` e o motor lê como número de 0 a 1, então
                     * mexer neles mudaria o resultado da rodada, não o layout.
                     *
                     * Efeito colateral bem-vindo: o default (`foco: '1'`) passa a
                     * ser a primeira pílula, que é onde se espera encontrá-lo.
                     */
                    options={[
                      { value: '1', label: 'Cobertura' },
                      { value: '0.5', label: 'Equilíbrio' },
                      { value: '0', label: 'Só VPL' },
                    ]}
                  />
                </div>
                <div>
                  <RotuloParametro texto="Base de receita" tecnico="BASE_RECEITA" />
                  <SegmentedControl
                    aria-label="Base de receita"
                    value={estado.baseReceita}
                    onChange={(v) =>
                      despachar({ tipo: 'set', patch: { baseReceita: v as BaseReceita } })
                    }
                    options={[
                      { value: 'arrecadada', label: 'Arrecadada' },
                      { value: 'faturada', label: 'Faturada' },
                    ]}
                  />
                </div>
                <div>
                  <RotuloParametro texto="Curva de adesão" tecnico="CURVA_ADOCAO" />
                  <SegmentedControl
                    aria-label="Curva de adoção"
                    value={estado.curvaAdocao}
                    onChange={(v) =>
                      despachar({ tipo: 'set', patch: { curvaAdocao: v as CurvaAdocao } })
                    }
                    options={[
                      { value: 'scurve', label: 'Curva S' },
                      { value: 'linear', label: 'Linear' },
                    ]}
                  />
                </div>
                <div>
                  <RotuloParametro texto="Estratégia de cobertura" tecnico="PENALIDADE_COBERTURA" />
                  <SegmentedControl
                    aria-label="Estratégia de cobertura"
                    value={estado.penalidade}
                    onChange={(v) =>
                      despachar({ tipo: 'set', patch: { penalidade: v as Penalidade } })
                    }
                    /**
                     * NOMES DO ITEM 15. O `value` decide o que o solver faz
                     * depois de bater a meta contratual — 'meta' para ali
                     * (sobra vira VPL); 'meta+cobertura' usa a sobra para
                     * cobrir ALÉM do contrato (`otimizador_capex_v62.py:556-563`).
                     * Só o `label` mudou; os `value` continuam os mesmos textos
                     * que o motor compara.
                     */
                    options={[
                      { value: 'meta+cobertura', label: 'Contrato + cobertura extra' },
                      { value: 'meta', label: 'Cumprir o contrato' },
                    ]}
                  />
                </div>
                <div className="flex items-center gap-2 sm:col-span-2">
                <label className="flex items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={estado.usarCts}
                    onChange={(e) => despachar({ tipo: 'set', patch: { usarCts: e.target.checked } })}
                    className="h-4 w-4 rounded border-ink-300 text-water-600 focus:ring-water-600/25"
                  />
                  <span className="text-[12.5px] text-ink-700">
                    Considerar coletores de tempo seco (CTS)
                  </span>
                </label>
                {/* O "?" fica FORA do `<label>` do checkbox pelo mesmo motivo
                    de sempre: dentro, ele entraria no nome do campo. */}
                <BotaoAjuda chave="USAR_CTS" texto="Usar CTS" />
                </div>
                <div className="flex items-center gap-2 sm:col-span-2">
                <label className="flex items-center gap-2.5">
                  <input
                    type="checkbox"
                    checked={estado.coberturaSoResidencial}
                    onChange={(e) =>
                      despachar({
                        tipo: 'set',
                        patch: { coberturaSoResidencial: e.target.checked },
                      })
                    }
                    className="h-4 w-4 rounded border-ink-300 text-water-600 focus:ring-water-600/25"
                  />
                  <span className="text-[12.5px] text-ink-700">
                    Contar cobertura só sobre ligações residenciais
                  </span>
                </label>
                <BotaoAjuda
                  chave="COBERTURA_SO_RESIDENCIAL"
                  texto="Medir a meta só em ligações residenciais"
                />
                </div>
              </div>
            )}
          </Cartao>

          <Cartao titulo="Orçamento">
            <div className="mb-3">
              <SegmentedControl
                aria-label="Modo do orçamento"
                value={estado.modoOrcamento}
                onChange={(v) =>
                  despachar({ tipo: 'set', patch: { modoOrcamento: v as ModoOrcamento } })
                }
                options={[
                  { value: 'ano', label: 'Por ano' },
                  { value: 'unico', label: 'Valor único' },
                ]}
              />
            </div>

            {/* OS DOIS QUADROS DERIVADOS (total do cronograma e janela) SAIRAM
                DAQUI. Eles apareciam nos dois modos e repetiam, no modo "por
                ano", o que a propria tabela logo abaixo ja diz — e no modo
                "valor unico" descreviam de volta o que a pessoa acabara de
                digitar. Os dois numeros continuam na tela: o cartao Resumo, que
                e a ultima leitura antes de disparar, mostra "Orcamento total" e
                "Janela de CAPEX". */}
            {estado.modoOrcamento === 'unico' ? (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <CampoNumero
                  rotulo="CAPEX anual (R$ Mi)"
                  valor={estado.capexAnual}
                  aoMudar={(v) => despachar({ tipo: 'set', patch: { capexAnual: v } })}
                />
                <CampoNumero
                  rotulo="Janela de CAPEX (anos)"
                  valor={estado.horizonte}
                  aoMudar={(v) => despachar({ tipo: 'set', patch: { horizonte: v } })}
                />
              </div>
            ) : (
              <div className="mt-4">
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="text-[12px] font-bold text-ink-800">Cronograma anual</span>
                  <span className="text-[10.5px] text-ink-water">
                    Teto de CAPEX por ano, em R$ Mi
                  </span>
                </div>
                <ul role="list" className="grid list-none grid-cols-[repeat(auto-fill,minmax(108px,1fr))] gap-2">
                  {estado.orcamento.map((l, i) => (
                    <CardDoAno
                      key={i}
                      indice={i}
                      linha={l}
                      teto={tetoDoCronograma}
                      repetido={anosRepetidos.has(numOuNulo(l.ano) ?? NaN)}
                      aoMudar={(chave, valor) => despachar({ tipo: 'linha', i, chave, valor })}
                      aoRemover={() => despachar({ tipo: 'delLinha', i })}
                    />
                  ))}
                  <li>
                    {/* O BOTÃO DE ACRESCENTAR É UM CARD, no fim da grade: é onde o
                        ano novo aparece, e é para onde o olho já foi depois do
                        último. Num cabeçalho ele fica longe do efeito que
                        produz. */}
                    <button
                      type="button"
                      aria-label="Acrescentar ano ao cronograma"
                      onClick={() => despachar({ tipo: 'addLinha' })}
                      className="flex h-full min-h-[74px] w-full flex-col items-center justify-center gap-1 rounded-xl border-[1.5px] border-dashed border-ink-300 text-ink-water transition-colors duration-hover ease-saida hover:border-water-600 hover:bg-water-50 hover:text-water-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-water-600/40"
                    >
                      <Plus weight="bold" />
                      <span className="text-[11px] font-semibold">Ano</span>
                    </button>
                  </li>
                </ul>
                <p className="mt-2 text-[10.5px] leading-snug text-ink-water">
                  Card tracejado está esperando valor. Vírgula é decimal
                  (<code className="font-mono">1.234,5</code> = 1234,5); sem vírgula, o ponto é
                  decimal (<code className="font-mono">0.35</code>).
                </p>
              </div>
            )}
          </Cartao>
        </div>

        <aside className="flex min-w-0 flex-col gap-3">
          <ResumoDaRodada
            estado={estado}
            derivado={derivado}
            unidadeNome={prontidao.data?.unidadeNome ?? unidade.data?.nome}
            resumo={unidade.data?.resumo}
          />
          <Checklist itens={checklist} barrado={barrado} />

          <div>
            <Button
              className="w-full justify-center py-2.5"
              disabled={barrado || criar.isPending}
              onClick={disparar}
              sweep={!barrado}
            >
              <Play weight="fill" />
              {criar.isPending ? 'Enviando…' : 'Iniciar simulação'}
            </Button>
            {/* O botão desabilitado EXPLICA. Botão cinza sem motivo faz o
                usuário procurar o problema na tela inteira. */}
            {barrado && (
              <p className="mt-1.5 text-center text-[11px] text-ink-water">
                Resolva o que está marcado acima para liberar.
              </p>
            )}
          </div>

          {prontidao.data && (
            <Cartao>
              <div className="text-[10.5px] font-bold uppercase tracking-[.09em] text-ink-water">
                Prontidão da unidade
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span
                  className={`font-mono text-[26px] font-semibold tabular-nums ${
                    prontidao.data.pendencias > 0 ? 'text-warning' : 'text-success'
                  }`}
                >
                  {prontidao.data.pendencias}
                </span>
                <span className="text-[11.5px] text-ink-water">campos pendentes</span>
              </div>
              <p className="mt-2 text-[11px] leading-snug text-ink-water">
                Lida no instante do clique — muda a cada campo salvo no cadastro, inclusive em
                outra aba.
              </p>
            </Cartao>
          )}
        </aside>
      </div>
    </section>
    </ProvedorDicionario>
  )
}

/**
 * O RESUMO FIXO — o que vai ser disparado, numa coluna só.
 *
 * A rodada é irreversível: o `run_id` passa a existir para sempre no histórico.
 * O formulário tem cinco blocos, e quem chega ao botão já rolou por todos —
 * este cartão é a última chance de ver os onze valores juntos antes do clique,
 * sem precisar subir de volta para conferir cada um.
 *
 * O TAMANHO E AS OBRAS vêm de `/unidades/{id}` e aparecem logo abaixo do nome,
 * porque é o que separa "rodar a Baixada" de "rodar a Serrana": eles qualificam
 * a unidade que se acabou de escolher, e predizem quanto a rodada vai demorar.
 * A ausência deles não esconde o resto — servidor sem os contadores continua
 * mostrando os nove parâmetros, que é o que o formulário sabe sozinho.
 *
 * A JANELA DE CAPEX é derivada, e por isso está aqui e não como campo: são os
 * anos com verba, e dois campos para a mesma verdade divergiriam no primeiro
 * ano zerado.
 */
function ResumoDaRodada({
  estado,
  derivado,
  unidadeNome,
  resumo,
}: {
  estado: EstadoSimulacao
  derivado: DerivadoOrcamento
  unidadeNome?: string
  resumo?: UnidadeResumo
}) {
  const foco = Number(estado.foco)
  return (
    <Cartao>
      <div className="text-[10.5px] font-bold uppercase tracking-[.09em] text-ink-water">Resumo</div>
      <dl className="mt-3 grid gap-y-2">
        <Item
          rotulo="Unidade"
          valor={unidadeNome ?? '—'}
          alerta={!estado.unidadeId}
        />
        {resumo && (
          <>
            <Item rotulo="Tamanho" valor={textoDoTamanho(resumo)} calculado />
            {/* As obras em linha própria, e com as três categorias: é o número
                que prediz o custo da rodada, e o único aqui em que "quanto"
                depende de quem paga. */}
            <Item rotulo="Obras" valor={textoDasObras(resumo)} calculado />
          </>
        )}
        <Item
          rotulo="Orçamento total"
          valor={derivado.total > 0 ? `R$ ${derivado.total.toLocaleString('pt-BR')} Mi` : '—'}
          calculado
        />
        <Item rotulo="Janela de CAPEX" valor={derivado.janelaTexto} calculado />
        <Item
          rotulo="Objetivo"
          valor={rotuloObjetivo(foco)}
        />
        <Item rotulo="Estratégia de cobertura" valor={estado.penalidade} />
        <Item rotulo="Base de receita" valor={estado.baseReceita} />
        <Item
          rotulo="Curva de adesão"
          valor={estado.curvaAdocao === 'scurve' ? 'curva S' : 'linear'}
        />
        <Item rotulo="Usar CTS" valor={estado.usarCts ? 'sim' : 'não'} />
        <Item rotulo="Meta só residencial" valor={estado.coberturaSoResidencial ? 'sim' : 'não'} />
      </dl>
    </Cartao>
  )
}

/**
 * `"21 cidades · 148 sistemas · 722 sub-bacias · 0 CTS · 148 ETEs"` — o porte da
 * unidade, numa linha.
 *
 * A ordem é a da árvore: cidade contém sistema, que contém sub-bacia, que tem
 * CTS pareada; ETEs ao lado.
 *
 * CTS APARECE MESMO QUANDO É ZERO. Ela é esparsa, e "0 CTS" responde uma
 * pergunta que a ausência da palavra deixaria no ar: se a unidade não tem,
 * ligar `USAR_CTS` nos parâmetros não muda nada, e é melhor descobrir aqui.
 *
 * Singular e plural porque "1 cidades" numa tela lida o dia inteiro é o tipo de
 * descuido que faz duvidar do resto dos números. CTS não flexiona.
 */
const nPtBr = (v: number) => v.toLocaleString('pt-BR')
const plural = (v: number, um: string, muitos: string) => `${nPtBr(v)} ${v === 1 ? um : muitos}`

function textoDoTamanho({ cidades, sistemas, subBacias, cts, etes }: UnidadeResumo): string {
  return [
    plural(cidades, 'cidade', 'cidades'),
    plural(sistemas, 'sistema', 'sistemas'),
    plural(subBacias, 'sub-bacia', 'sub-bacias'),
    `${nPtBr(cts)} CTS`,
    plural(etes, 'ETE', 'ETEs'),
  ].join(' · ')
}

/**
 * `"1.914 Aegea · 176 de terceiros · 1.520 sem obra"` — o que há de CAPEX.
 *
 * TRÊS categorias e não um total, porque um número só esconde os dois extremos:
 * o total conta linhas que não são obra nenhuma, e não distingue o que a Aegea
 * paga do que ocupa prazo por conta de terceiros. As três são exaustivas e não
 * se sobrepõem; as duas primeiras são o que o motor considera candidato.
 */
function textoDasObras({ obrasAegea, obrasTerceiros, semObra }: UnidadeResumo): string {
  return [
    `${nPtBr(obrasAegea)} Aegea`,
    `${nPtBr(obrasTerceiros)} de terceiros`,
    `${nPtBr(semObra)} sem obra`,
  ].join(' · ')
}

/**
 * Uma linha do resumo. `calculado` marca o que a tela DERIVOU, e não o que foi
 * digitado — a distinção importa quando o número surpreende.
 */
function Item({
  rotulo,
  valor,
  calculado,
  alerta,
}: {
  rotulo: string
  valor: string
  calculado?: boolean
  alerta?: boolean
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
      <dt className="text-[12px] text-ink-water">{rotulo}</dt>
      <dd
        className={`min-w-0 flex-1 text-right text-[12.5px] font-semibold ${
          alerta ? 'text-warning' : calculado ? 'text-aegea-700' : 'text-ink-800'
        }`}
      >
        {valor}
      </dd>
    </div>
  )
}

/**
 * O checklist, com DOIS estados.
 *
 * `'avisa'` cai em `warning` pelo mapa, sem tela dedicada: o `validar()` nunca
 * o emite hoje, e desenhar um terceiro estado seria implementar e estilizar
 * algo que ninguém vê. Se o produto voltar a emiti-lo, ele nasce coerente.
 */
const ICONE = {
  bloqueia: { Icone: XCircle, cor: 'text-danger' },
  avisa: { Icone: XCircle, cor: 'text-warning' },
  ok: { Icone: CheckCircle, cor: 'text-success' },
} as const

function Checklist({ itens, barrado }: { itens: ItemChecklist[]; barrado: boolean }) {
  const bloqueios = itens.filter((i) => i.severidade === 'bloqueia').length

  return (
    <div
      className={`rounded-2xl border bg-white p-4 shadow-soft ${
        barrado ? 'border-danger/25' : 'border-success/30'
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-[13px] font-bold text-ink-800">Antes de disparar</h2>
        {barrado ? (
          <Badge tone="danger" dot>
            {bloqueios} bloqueio{bloqueios > 1 ? 's' : ''}
          </Badge>
        ) : (
          <Badge tone="success" dot>
            Pronto
          </Badge>
        )}
      </div>

      <ul className="m-0 mt-3 flex list-none flex-col gap-2.5 p-0">
        {itens.map((item, i) => {
          const { Icone, cor } = ICONE[item.severidade]
          const secundario = item.severidade === 'ok'
          return (
            <li key={i} className={`flex gap-2 ${secundario ? 'opacity-75' : ''}`}>
              <Icone weight="fill" className={`mt-px shrink-0 text-[15px] ${cor}`} />
              <span
                className={`text-[11.5px] leading-snug ${
                  secundario ? 'text-ink-600' : 'font-semibold text-ink-800'
                }`}
              >
                {item.texto}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** Campo numérico com a gramática de estado: tracejado quando vazio. */
function CampoNumero({
  rotulo,
  valor,
  aoMudar,
}: {
  rotulo: string
  valor: string
  aoMudar: (v: string) => void
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[10.5px] font-bold uppercase tracking-[.075em] text-ink-water">
        {rotulo}
      </span>
      <input
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        inputMode="decimal"
        className={classeCampo(valor)}
      />
    </label>
  )
}

/**
 * UM ANO DO CRONOGRAMA — o card que substituiu a linha da tabela.
 *
 * A tabela cabia em quinze linhas e a caixa cabia em sete: ver o cronograma
 * inteiro exigia rolar, e rolar dentro de um formulário esconde metade do que se
 * está decidindo. Em grade, os quinze anos cabem em três fileiras.
 *
 * O QUE CADA CARD CARREGA, e por que os três:
 *
 *   O ANO É EDITÁVEL, e não um título fixo: o cronograma pode começar em
 *     qualquer ano, e sem isso mudar o início exigiria apagar e recriar quinze
 *     cards. O campo fica sem moldura até receber foco — dentro do card ele já
 *     lê como o título, e uma segunda caixa competiria com a da verba, que é o
 *     campo que se preenche.
 *   A VERBA usa a mesma gramática de estado do resto da tela (`classeCampo`):
 *     tracejado âmbar enquanto vazio, vermelho quando não é número.
 *   A BARRA é a única coisa que a tabela não dava: a proporção entre um ano e o
 *     maior deles. É redundante com o número ao lado, de propósito — quem lê o
 *     número não perde nada, e quem varre a grade vê a rampa.
 */
function CardDoAno({
  indice,
  linha,
  teto,
  repetido,
  aoMudar,
  aoRemover,
}: {
  indice: number
  linha: LinhaOrcamento
  teto: number
  repetido: boolean
  aoMudar: (chave: 'ano' | 'valor', valor: string) => void
  aoRemover: () => void
}) {
  const valor = numOuNulo(linha.valor)
  const nome = linha.ano || indice + 1

  return (
    <li
      className={`rounded-xl border bg-white p-2 transition-colors duration-hover ease-saida ${
        repetido ? 'border-danger/60 bg-red-50/40' : 'border-ink-200'
      }`}
    >
      <div className="flex items-center gap-1">
        <input
          aria-label={`Ano da linha ${indice + 1}`}
          aria-invalid={repetido || undefined}
          title={repetido ? 'Ano repetido no cronograma' : undefined}
          value={linha.ano}
          onChange={(e) => aoMudar('ano', e.target.value)}
          inputMode="numeric"
          className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1 py-0.5 font-mono text-[12.5px] font-bold tabular-nums text-ink-900 outline-none transition-colors duration-hover ease-saida hover:border-ink-200 focus:border-water-600 focus:bg-white focus:ring-2 focus:ring-water-600/25"
        />
        {/* 24x24 E SEMPRE VISÍVEL: um botão que só aparece no hover não existe
            para o toque nem para quem navega por teclado.
            O GLIFO é menor que a área — 12px repetidos quinze vezes já pesam o
            bastante na grade, e encolher o alvo junto seria trocar ruído visual
            por um botão que ninguém acerta. */}
        <button
          type="button"
          aria-label={`Remover o ano ${nome}`}
          onClick={aoRemover}
          className="grid h-6 w-6 flex-none place-items-center rounded-md text-ink-water transition-colors duration-hover ease-saida hover:bg-ink-100 hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-water-600/40"
        >
          <X weight="bold" size={12} />
        </button>
      </div>
      <input
        aria-label={`Verba do ano ${nome}`}
        value={linha.valor}
        onChange={(e) => aoMudar('valor', e.target.value)}
        inputMode="decimal"
        className={`${classeCampo(linha.valor)} mt-1 text-right`}
      />
      {teto > 0 && (
        <div aria-hidden="true" className="mt-1.5 h-[3px] overflow-hidden rounded-full bg-ink-100">
          <div
            className="h-full rounded-full bg-water-500"
            style={{ width: `${Math.min(100, Math.max(0, ((valor ?? 0) / teto) * 100))}%` }}
          />
        </div>
      )}
    </li>
  )
}

/**
 * A GRAMÁTICA DE ESTADO, e a decisão da fase 8 que ela materializa.
 *
 * Vazio → borda TRACEJADA âmbar. Preenchido → sólida. A cor é a mesma do
 * cadastro (`amber-300/60` sobre `amber-400/10`); o que muda é o traço, e ele
 * é a metade da informação que sobrevive a daltonismo e a impressão em preto e
 * branco — no cadastro os dois estados colapsam em escala de cinza.
 *
 * O `AbaCell` do cadastro NÃO muda: ele fica com a borda sólida que tem hoje.
 * A divergência entre as duas telas é consequência aceita e registrada.
 *
 * O terceiro caso é o texto INVÁLIDO — `12abc`. Ele não é vazio nem preenchido:
 * é erro, e ganha a borda vermelha. Sem isso, o parser estrito devolveria
 * `null` em silêncio e o checklist acusaria "linha inválida" sem que a tela
 * dissesse qual.
 */
function classeCampo(valor: string): string {
  const base =
    'w-full rounded-lg border-[1.5px] bg-white px-2.5 py-1.5 font-mono text-[12.5px] tabular-nums outline-none transition-colors duration-hover ease-saida focus:border-water-600 focus:ring-2 focus:ring-water-600/25'
  if (valor.trim() === '') return `${base} border-dashed border-amber-300/80 bg-amber-400/10`
  if (numOuNulo(valor) === null) return `${base} border-danger/60 bg-red-50`
  return `${base} border-ink-200`
}
