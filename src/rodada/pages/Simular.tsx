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
  rotuloFoco,
  validar,
  type BaseReceita,
  type CurvaAdocao,
  type DerivadoOrcamento,
  type EstadoSimulacao,
  type ItemChecklist,
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
  const [avancado, setAvancado] = useState(false)

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
                <span className="mb-1.5 block text-[10.5px] font-bold uppercase tracking-[.075em] text-ink-500">
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
                  className={`${SELECT} disabled:cursor-not-allowed disabled:bg-ink-50 disabled:text-ink-400`}
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
                  className={`${SELECT} disabled:cursor-not-allowed disabled:bg-ink-50 disabled:text-ink-400`}
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

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <span className="mb-1.5 block text-[10.5px] font-bold uppercase tracking-[.075em] text-ink-500">
                  Total do cronograma
                </span>
                <div className="rounded-lg border-[1.5px] border-transparent bg-ink-50 px-3 py-2 font-mono text-[13px] font-semibold tabular-nums text-ink-700">
                  R$ {derivado.total.toLocaleString('pt-BR')} Mi
                </div>
                <p className="mt-1 text-[10.5px] text-ink-400">Soma dos anos com verba.</p>
              </div>
              <div>
                <span className="mb-1.5 block text-[10.5px] font-bold uppercase tracking-[.075em] text-ink-500">
                  Janela de CAPEX ƒ
                </span>
                {/* DERIVADA. O estado é o mesmo `calc` do cadastro: fundo cinza,
                    semibold, sem borda. E não há campo para ela em lugar nenhum. */}
                <div className="rounded-lg border-[1.5px] border-transparent bg-ink-50 px-3 py-2 font-mono text-[13px] font-semibold tabular-nums text-ink-700">
                  {derivado.janelaTexto}
                </div>
                <p className="mt-1 text-[10.5px] text-ink-400">
                  Derivada dos anos com verba. Não se digita.
                </p>
              </div>
            </div>

            {estado.modoOrcamento === 'unico' ? (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <CampoNumero
                  rotulo="Verba total do plano (R$ Mi)"
                  valor={estado.orcamentoValor}
                  aoMudar={(v) => despachar({ tipo: 'set', patch: { orcamentoValor: v } })}
                />
                <CampoNumero
                  rotulo="Horizonte (anos)"
                  valor={estado.horizonte}
                  aoMudar={(v) => despachar({ tipo: 'set', patch: { horizonte: v } })}
                />
              </div>
            ) : (
              <div className="mt-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[12px] font-bold text-ink-800">Cronograma anual</span>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => despachar({ tipo: 'addLinha' })}
                  >
                    <Plus weight="bold" /> Ano
                  </Button>
                </div>
                <div className="max-h-[320px] overflow-y-auto rounded-xl border border-ink-200">
                  <table>
                    <caption className="sr-only">Cronograma de verba por ano</caption>
                    <thead>
                      <tr>
                        <th scope="col">Ano</th>
                        <th scope="col" data-r>
                          Teto de CAPEX (R$ Mi)
                        </th>
                        <th scope="col" className="w-10">
                          <span className="sr-only">Remover</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {estado.orcamento.map((l, i) => (
                        <tr key={i}>
                          <td>
                            <CelulaNumero
                              rotulo={`Ano da linha ${i + 1}`}
                              valor={l.ano}
                              aoMudar={(v) =>
                                despachar({ tipo: 'linha', i, chave: 'ano', valor: v })
                              }
                              largura="w-24"
                            />
                          </td>
                          <td className="text-right">
                            <CelulaNumero
                              rotulo={`Verba do ano ${l.ano || i + 1}`}
                              valor={l.valor}
                              aoMudar={(v) =>
                                despachar({ tipo: 'linha', i, chave: 'valor', valor: v })
                              }
                              largura="w-32"
                            />
                          </td>
                          <td className="text-right">
                            <button
                              type="button"
                              aria-label={`Remover o ano ${l.ano || i + 1}`}
                              onClick={() => despachar({ tipo: 'delLinha', i })}
                              className="rounded-md p-1 text-ink-400 transition-colors duration-hover ease-saida hover:bg-ink-100 hover:text-danger"
                            >
                              <X weight="bold" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-1.5 text-[10.5px] leading-snug text-ink-400">
                  Campo tracejado está esperando valor. Vírgula é decimal
                  (<code className="font-mono">1.234,5</code> = 1234,5); sem vírgula, o ponto é
                  decimal (<code className="font-mono">0.35</code>).
                </p>
              </div>
            )}
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
            <p className="mt-1 text-[11.5px] leading-snug text-ink-500">
              Os valores padrão são os que a equipe roda hoje — mudar um deles muda o resultado de
              quem só clicar Iniciar.
            </p>

            {avancado && (
              <div className="mt-3.5 grid gap-3 sm:grid-cols-2">
                <div>
                  <RotuloParametro
                    texto={`Objetivo — ${rotuloFoco(numOuNulo(estado.foco) ?? 0)}`}
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
                  <RotuloParametro texto="Penalidade" tecnico="PENALIDADE_COBERTURA" />
                  <SegmentedControl
                    aria-label="Penalidade de cobertura"
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
              <p className="mt-1.5 text-center text-[11px] text-ink-500">
                Resolva o que está marcado acima para liberar.
              </p>
            )}
          </div>

          {prontidao.data && (
            <Cartao>
              <div className="text-[10.5px] font-bold uppercase tracking-[.09em] text-ink-400">
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
                <span className="text-[11.5px] text-ink-500">campos pendentes</span>
              </div>
              <p className="mt-2 text-[11px] leading-snug text-ink-400">
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
      <div className="text-[10.5px] font-bold uppercase tracking-[.09em] text-ink-400">Resumo</div>
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
          rotulo="Foco em cobertura"
          valor={`${foco.toFixed(2).replace('.', ',')} · ${rotuloFoco(foco)}`}
        />
        <Item rotulo="Penalidade" valor={estado.penalidade} />
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
      <dt className="text-[12px] text-ink-500">{rotulo}</dt>
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
      <span className="mb-1.5 block text-[10.5px] font-bold uppercase tracking-[.075em] text-ink-500">
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

function CelulaNumero({
  rotulo,
  valor,
  aoMudar,
  largura,
}: {
  rotulo: string
  valor: string
  aoMudar: (v: string) => void
  largura: string
}) {
  return (
    <>
      <span className="sr-only">{rotulo}</span>
      <input
        aria-label={rotulo}
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        inputMode="decimal"
        className={`${classeCampo(valor)} ${largura} text-right`}
      />
    </>
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
