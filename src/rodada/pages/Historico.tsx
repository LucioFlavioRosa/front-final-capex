import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Star, MagnifyingGlass, ArrowsLeftRight } from '@phosphor-icons/react'
import { PageHeader } from '@/components/ui/PageHeader'
import { Button } from '@/components/ui/Button'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { useToast } from '@/components/ui/Toaster'
import { Estado } from '@/rodada/components/Estado'
import { DetalhesDaSimulacao } from '@/rodada/components/DetalhesDaSimulacao'
import { CompararSimulacoes } from '@/rodada/components/CompararSimulacoes'
import { Aviso, Tag, TagStatus, Tile } from '@/rodada/components/pecas'
import {
  useAlternarFavorita,
  useComentarDaRodada,
  useExcluirRun,
  useRuns,
} from '@/rodada/api/queries'
import { brlMi, dataCurta, dataHora, deTotal, duracao } from '@/rodada/lib/formato'
import type { RunResumo, StatusRodada } from '@/rodada/domain/resultado'

/**
 * Nível 0 — a única tela do pacote que não é de uma rodada: é DO USUÁRIO.
 *
 * O problema de produto que este layout resolve, e que o inventário da fase 7
 * marcou como o mais fácil de perder na tradução: **favoritar é seu, comentar é
 * de todos**. Os dois são visualmente parecidos e semanticamente opostos, e
 * desenhá-los como dois ícones vizinhos na mesma linha garantiria que alguém
 * escrevesse um comentário achando que era anotação privada.
 *
 * Então eles não são vizinhos:
 *   - A ESTRELA é a primeira coluna da tabela. O gesto é o de marcar uma linha
 *     para si, que é a convenção do e-mail.
 *   - O COMENTÁRIO é um bloco rotulado no rodapé do painel lateral, com a
 *     etiqueta "Compartilhado" e a frase que diz para quem.
 *   - EXCLUIR fica no pé do painel, e nunca na linha da tabela: é a única
 *     mutação destrutiva do pacote e não pode ser alcançável por engano
 *     durante uma varredura da lista.
 *
 * Layout portado do design de 19/08 ("Historico SES Aegea"): tabela larga mais
 * painel fixo de 372px à direita, no lugar dos cards empilhados.
 */

type Ordem = 'recentes' | 'vpl' | 'nome'

/**
 * O que dizer quando NÃO há resultado.
 *
 * Cada estado sem número ganha frase própria porque o traço no lugar do VPL não
 * distingue "ainda não rodou" de "rodou e não existe plano possível" — e as
 * duas pedem ações opostas de quem está lendo. Um texto genérico ("sem
 * resultado") empurraria essa distinção para o usuário adivinhar.
 */
const SEM_RESULTADO: Partial<
  Record<StatusRodada, { texto: string; tom: 'azul' | 'vermelho' | 'neutro'; acao?: string }>
> = {
  RODANDO: {
    texto:
      'A rodada ainda está no solver. Nenhum número foi produzido — o traço marca ausência de resultado, não resultado zero.',
    tom: 'azul',
  },
  PENDENTE: {
    texto: 'A rodada está na fila e ainda não começou a rodar.',
    tom: 'azul',
  },
  INFEASIBLE: {
    texto:
      'O solver não encontrou nenhum plano que respeitasse as restrições. Não há resultado para abrir; revise orçamento, janela ou metas e rode de novo.',
    tom: 'vermelho',
    acao: 'Ajustar e rodar de novo',
  },
  ERRO: {
    texto:
      'A execução foi interrompida por erro antes de produzir resultado. Os parâmetros seguem salvos e a rodada pode ser disparada de novo.',
    tom: 'vermelho',
    acao: 'Ajustar e rodar de novo',
  },
  CANCELADA: {
    texto: 'A execução foi cancelada antes de terminar.',
    tom: 'neutro',
    acao: 'Ajustar e rodar de novo',
  },
}

export function Historico() {
  const consulta = useRuns()
  const navegar = useNavigate()

  return (
    <section className="max-w-content mx-auto animate-fade-in px-4 py-8 md:px-6">
      <Estado
        consulta={consulta}
        rotulo="Carregando simulações…"
        tituloErro="Não foi possível carregar o histórico de simulações."
        vazio={{
          checar: (d) => d.length === 0,
          titulo: 'Nenhuma simulação ainda',
          texto:
            'Não há rodadas registradas para as unidades a que você tem acesso. A primeira você dispara em Simular.',
          acao: (
            <Button pill onClick={() => navegar('/simular')}>
              <Plus weight="bold" /> Nova simulação
            </Button>
          ),
        }}
      >
        {(runs) => <Lista runs={runs} />}
      </Estado>
    </section>
  )
}

function Lista({ runs }: { runs: RunResumo[] }) {
  const navegar = useNavigate()
  const { toast } = useToast()
  const [busca, setBusca] = useState('')
  const [ordem, setOrdem] = useState<Ordem>('recentes')
  const [soFavoritas, setSoFavoritas] = useState(false)
  const [selecionadaId, setSelecionadaId] = useState<string | null>(runs[0]?.runId ?? null)

  /**
   * COMPARAR SIMULAÇÕES — item 2 do feedback, definido em 27/08.
   *
   * `modoComparar` liga as caixas de seleção na tabela; `paraComparar` guarda
   * os ids escolhidos. São dois estados e não um (`Set` vazio = modo desligado)
   * porque entrar no modo e ainda não ter escolhido nada é um estado legítimo,
   * com UI própria — a barra explicando "escolha ao menos 2".
   *
   * Guarda ID e não a rodada inteira: a lista se repesca sozinha enquanto há
   * rodada em voo, e guardar o objeto deixaria a seleção apontando para uma
   * versão velha do card.
   */
  const [modoComparar, setModoComparar] = useState(false)
  const [paraComparar, setParaComparar] = useState<Set<string>>(new Set())
  const [comparando, setComparando] = useState(false)

  const alternarComparar = (runId: string) =>
    setParaComparar((atual) => {
      const novo = new Set(atual)
      if (novo.has(runId)) novo.delete(runId)
      else novo.add(runId)
      return novo
    })

  const alternarFavorita = useAlternarFavorita()

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase()
    const filtradas = runs.filter((r) => {
      if (soFavoritas && !r.favorita) return false
      if (!q) return true
      return (
        r.nome.toLowerCase().includes(q) ||
        r.runId.toLowerCase().includes(q) ||
        r.unidadeNome.toLowerCase().includes(q)
      )
    })
    const ordenadas = [...filtradas]
    if (ordem === 'recentes') {
      ordenadas.sort((a, b) => b.dataHora.localeCompare(a.dataHora))
    } else if (ordem === 'nome') {
      ordenadas.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    } else {
      // VPL: rodada sem métrica (em voo, falhada) vai para o fim — ordenar por
      // um número que não existe colocaria as inacabadas no topo.
      ordenadas.sort((a, b) => (b.metricas?.vpl ?? -Infinity) - (a.metricas?.vpl ?? -Infinity))
    }
    return ordenadas
  }, [runs, busca, ordem, soFavoritas])

  // A ORDEM DAS COLUNAS É A DA LISTA VISÍVEL, e não a de clique: quem ordenou
  // por VPL espera ler as colunas na mesma ordem em que acabou de vê-las.
  const runsComparadas = useMemo(
    () => visiveis.filter((r) => paraComparar.has(r.runId)),
    [visiveis, paraComparar],
  )

  const selecionada = visiveis.find((r) => r.runId === selecionadaId) ?? visiveis[0]
  const comResultado = runs.filter((r) => r.metricas).length

  return (
    <>
      <PageHeader
        eyebrow="Minhas rodadas"
        title="Histórico de simulações"
        subtitle={`${runs.length} rodada(s) · ${comResultado} com resultado`}
        actions={
          <Button pill onClick={() => navegar('/simular')} sweep>
            <Plus weight="bold" /> Nova simulação
          </Button>
        }
      />

      <div className="mb-[18px] flex flex-wrap items-center gap-3">
        <label className="relative min-w-[220px] max-w-[420px] flex-1">
          <MagnifyingGlass className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400" />
          <span className="sr-only">Buscar rodada</span>
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, id ou unidade…"
            className="w-full rounded-full border border-ink-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none transition-colors duration-hover ease-saida focus:border-water-600 focus:ring-2 focus:ring-water-600/25"
          />
        </label>
        <SegmentedControl
          className="!rounded-full !bg-white !p-1 ring-1 ring-ink-200"
          aria-label="Ordenar as rodadas"
          value={ordem}
          onChange={(v) => setOrdem(v as Ordem)}
          options={[
            { value: 'recentes', label: 'Mais recentes' },
            { value: 'vpl', label: 'Maior VPL' },
            { value: 'nome', label: 'Nome' },
          ]}
        />
        <Button
          pill
          variant={soFavoritas ? 'primary' : 'secondary'}
          onClick={() => setSoFavoritas((v) => !v)}
          aria-pressed={soFavoritas}
        >
          <Star weight={soFavoritas ? 'fill' : 'regular'} /> Só favoritas
        </Button>
        <Button
          pill
          variant={modoComparar ? 'primary' : 'secondary'}
          aria-pressed={modoComparar}
          onClick={() => {
            // Sair do modo LIMPA a seleção: reentrar com quatro rodadas ainda
            // marcadas de dez minutos atrás é uma surpresa, não uma memória útil.
            setModoComparar((v) => !v)
            if (modoComparar) setParaComparar(new Set())
          }}
        >
          <ArrowsLeftRight weight="bold" /> Comparar simulações
        </Button>
      </div>

      {/* A BARRA DE COMPARAÇÃO só existe no modo — e explica o mínimo (2) em vez
          de só desabilitar o botão sem dizer por quê. */}
      {modoComparar && (
        <div className="mb-[18px] flex flex-wrap items-center gap-3 rounded-[14px] border border-water-300 bg-water-50 px-4 py-3">
          <span className="text-[12.5px] text-ink-700">
            {paraComparar.size === 0
              ? 'Marque ao menos 2 simulações na lista para comparar.'
              : paraComparar.size === 1
                ? '1 simulação marcada — falta pelo menos mais uma.'
                : `${paraComparar.size} simulações marcadas.`}
          </span>
          <div className="ml-auto flex items-center gap-2">
            {paraComparar.size > 0 && (
              <Button pill variant="secondary" onClick={() => setParaComparar(new Set())}>
                Limpar seleção
              </Button>
            )}
            <Button pill disabled={paraComparar.size < 2} onClick={() => setComparando(true)}>
              Comparar {paraComparar.size >= 2 ? `(${paraComparar.size})` : ''}
            </Button>
          </div>
        </div>
      )}

      {visiveis.length === 0 ? (
        <div className="carta p-14 text-center">
          <p className="text-base font-bold text-ink-800">Nenhuma rodada com esses filtros</p>
          <p className="mx-auto mt-2 max-w-[380px] text-sm leading-relaxed text-ink-500">
            Existem {runs.length} rodadas no total — o que está escondendo as demais é o filtro,
            não a ausência de dado.
          </p>
          <Button
            pill
            variant="secondary"
            className="mt-5"
            onClick={() => {
              setBusca('')
              setSoFavoritas(false)
            }}
          >
            Limpar filtros
          </Button>
        </div>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_372px]">
          <div className="carta carta-tabela min-w-0 overflow-x-auto">
            <table>
              <caption className="sr-only">Rodadas de simulação</caption>
              <thead>
                <tr>
                  {modoComparar && (
                    <th scope="col" className="w-9">
                      <span className="sr-only">Comparar</span>
                    </th>
                  )}
                  <th scope="col" className="w-9">
                    <span className="sr-only">Favorita</span>
                  </th>
                  <th scope="col">Simulação</th>
                  <th scope="col">Unidade</th>
                  <th scope="col">Status</th>
                  <th scope="col" data-r>
                    VPL
                  </th>
                  <th scope="col" data-r>
                    CAPEX
                  </th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map((r) => (
                  <tr
                    key={r.runId}
                    data-sel={r.runId === selecionada?.runId ? '1' : undefined}
                    onClick={() => (modoComparar ? alternarComparar(r.runId) : setSelecionadaId(r.runId))}
                    className="cursor-pointer"
                  >
                    {modoComparar && (
                      <td className="pr-0">
                        <input
                          type="checkbox"
                          checked={paraComparar.has(r.runId)}
                          onChange={() => alternarComparar(r.runId)}
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`Comparar ${r.nome || r.runId.slice(0, 8)}`}
                          className="h-4 w-4 rounded border-ink-300 text-water-600 focus:ring-water-600/25"
                        />
                      </td>
                    )}
                    <td className="pr-0">
                      {/* A ESTRELA, na coluna que é dela. Update otimista: vira
                          antes da resposta; se o servidor recusar, o onError do
                          hook a devolve e sobe um toast. */}
                      <button
                        type="button"
                        aria-pressed={r.favorita}
                        aria-label={
                          r.favorita
                            ? `Desmarcar ${r.nome} como favorita`
                            : `Marcar ${r.nome} como favorita`
                        }
                        title="Favorita — só você vê"
                        onClick={(e) => {
                          e.stopPropagation()
                          alternarFavorita.mutate(
                            { runId: r.runId, favorita: !r.favorita },
                            {
                              onError: () =>
                                toast(
                                  'Não foi possível mudar a favorita. Tente de novo.',
                                  'warning',
                                ),
                            },
                          )
                        }}
                        className="rounded-md p-1 transition-colors duration-hover ease-saida hover:bg-ink-100"
                      >
                        <Star
                          weight={r.favorita ? 'fill' : 'regular'}
                          className={r.favorita ? 'text-aegea-500' : 'text-ink-300'}
                        />
                      </button>
                    </td>
                    <td>
                      <span className="block font-semibold text-ink-800">
                        {r.nome || 'Sem nome'}
                      </span>
                      <span className="mt-0.5 block font-mono text-[11px] tabular-nums text-ink-400">
                        {r.runId.slice(0, 8)} · {dataHora(r.dataHora)}
                      </span>
                    </td>
                    <td className="text-[13px] text-ink-600">{r.unidadeNome}</td>
                    <td>
                      <TagStatus status={r.status} />
                    </td>
                    {/* `brlMi` devolve '—' para ausente: rodada em voo não
                        mostra "R$ 0", que seria um resultado. */}
                    <td data-m className={r.metricas ? 'text-aegea-700' : 'text-ink-300'}>
                      {brlMi(r.metricas?.vpl)}
                    </td>
                    <td data-m className={r.metricas ? '' : 'text-ink-300'}>
                      {brlMi(r.metricas?.capex)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {selecionada && (
            <PainelDaRodada
              key={selecionada.runId}
              run={selecionada}
              aoAbrir={() => navegar(`/resultados/${selecionada.runId}`)}
              aoExcluir={() => setSelecionadaId(null)}
            />
          )}
        </div>
      )}

      {comparando && runsComparadas.length >= 2 && (
        <CompararSimulacoes runs={runsComparadas} aoFechar={() => setComparando(false)} />
      )}
    </>
  )
}

/** O painel lateral: onde vivem o comentário compartilhado e a exclusão. */
function PainelDaRodada({
  run,
  aoAbrir,
  aoExcluir,
}: {
  run: RunResumo
  aoAbrir: () => void
  aoExcluir: () => void
}) {
  const navegar = useNavigate()
  const { toast } = useToast()
  const comentar = useComentarDaRodada()
  const excluir = useExcluirRun()
  const [confirmando, setConfirmando] = useState(false)
  const [detalhando, setDetalhando] = useState(false)

  const comentario = run.comentario?.texto ?? ''
  // Remonta a cada rodada selecionada (a `key` no chamador), então o rascunho
  // nasce com o texto da rodada certa em vez de vazar o da anterior.
  const [rascunho, setRascunho] = useState(comentario)
  const sujo = rascunho !== comentario

  const nota = SEM_RESULTADO[run.status]

  return (
    <aside className="carta sticky top-6 overflow-hidden">
      <div className="border-b border-ink-200 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[17px] font-bold leading-snug text-ink-800">
              {run.nome || run.runId.slice(0, 8)}
            </div>
            <div className="mt-1 font-mono text-[11px] tabular-nums text-ink-400">
              {run.runId.slice(0, 8)} · {run.unidadeNome}
            </div>
          </div>
          <TagStatus status={run.status} />
        </div>
      </div>

      <div className="p-5">
        <div className="text-[11.5px] font-semibold uppercase tracking-[.05em] text-ink-water">
          VPL do plano
        </div>
        <div
          className={`mt-1.5 font-mono text-[40px] font-semibold leading-none tracking-tight tabular-nums ${
            run.metricas ? 'text-aegea-700' : 'text-ink-300'
          }`}
        >
          {brlMi(run.metricas?.vpl)}
        </div>

        {run.metricas ? (
          <>
            <div className="tiles mt-5 grid-cols-2">
              <Tile rotulo="CAPEX total" valor={brlMi(run.metricas.capex)} />
              <Tile
                rotulo="Obras construídas"
                valor={deTotal(run.metricas.obrasConstruidas, run.metricas.obrasTotal)}
              />
              <Tile rotulo="Tempo do solver" valor={duracao(run.duracaoS)} />
              <Tile rotulo="Criada em" valor={dataCurta(run.dataHora)} />
            </div>

            {/* O aviso do FEASIBLE. Sem ele, "apenas viável" é só uma cor
                diferente na etiqueta — e a diferença entre um plano provado
                ótimo e um plano apenas válido é o que decide se vale rodar de
                novo com mais tempo de solver. */}
            {run.status === 'FEASIBLE' && (
              <div className="mt-3.5">
                <Aviso tom="ambar">
                  O solver atingiu o limite de tempo antes de provar que esta é a melhor solução.
                  Os números são de um plano válido, não necessariamente o ótimo.
                </Aviso>
              </div>
            )}

            <Button pill className="mt-[18px] w-full" onClick={aoAbrir}>
              Abrir resultados
            </Button>
            <BotaoDetalhes aoAbrir={() => setDetalhando(true)} />
          </>
        ) : (
          <>
            <div className="mt-3">
              <Aviso tom={nota?.tom ?? 'neutro'}>
                {nota?.texto ??
                  'Esta rodada não tem resultado publicado. O traço marca ausência de resultado, não resultado zero.'}
              </Aviso>
            </div>
            {/* O detalhe importa MAIS aqui do que na rodada que deu certo: sem
                resultado para abrir, o pedido é a única coisa que explica o que
                foi tentado — e o que mudar antes de rodar de novo. */}
            <BotaoDetalhes aoAbrir={() => setDetalhando(true)} />
            {nota?.acao && (
              <Button
                pill
                variant="secondary"
                className="mt-4 w-full"
                /* Leva para Simular, e o rótulo diz "ajustar": o pedido da
                   rodada NÃO é pré-carregado lá, e prometer "executar de novo"
                   faria a tela abrir em branco depois de dizer o contrário. */
                onClick={() => navegar('/simular')}
              >
                {nota.acao}
              </Button>
            )}
          </>
        )}
      </div>

      <div className="border-t border-ink-200 bg-ink-50 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11.5px] font-semibold uppercase tracking-[.05em] text-ink-water">
            Comentário da equipe
          </span>
          <Tag tom="azul" className="!text-[11px]">
            Compartilhado
          </Tag>
        </div>
        <label className="sr-only" htmlFor="comentario">
          Comentário da rodada
        </label>
        <textarea
          id="comentario"
          rows={3}
          value={rascunho}
          onChange={(e) => setRascunho(e.target.value)}
          placeholder="Visível para todos com acesso a esta unidade."
          className="mt-2.5 min-h-[74px] w-full resize-y rounded-[10px] border border-ink-200 bg-white p-3 text-[13px] leading-relaxed outline-none transition-colors duration-hover ease-saida focus:border-water-600 focus:ring-2 focus:ring-water-600/25"
        />
        {sujo ? (
          /* Salvar é explícito de propósito. Este campo é COMPARTILHADO: gravar
             a cada tecla mandaria uma escrita por caractere para um texto que
             outra pessoa pode estar lendo naquele instante. */
          <div className="mt-2 flex gap-2">
            <Button
              pill
              size="sm"
              disabled={comentar.isPending}
              onClick={() =>
                comentar.mutate(
                  { runId: run.runId, texto: rascunho },
                  { onError: () => toast('Não foi possível salvar o comentário.', 'warning') },
                )
              }
            >
              {comentar.isPending ? 'Salvando…' : 'Salvar comentário'}
            </Button>
            <Button pill size="sm" variant="ghost" onClick={() => setRascunho(comentario)}>
              Descartar
            </Button>
          </div>
        ) : (
          <p className="mt-2 text-[12px] leading-snug text-ink-500">
            {run.comentario?.autor
              ? `Última edição por ${run.comentario.autor}${
                  run.comentario.atualizadoEm ? ` · ${dataHora(run.comentario.atualizadoEm)}` : ''
                }`
              : 'Nenhum comentário ainda.'}{' '}
            <span className="text-ink-400">
              Todos que acessam esta unidade leem e editam. Não é anotação privada — para marcar
              algo só para você, use a estrela.
            </span>
          </p>
        )}
      </div>

      {confirmando ? (
        <div className="border-t border-danger/20 bg-red-50 p-5">
          <div className="text-sm font-bold text-danger">Excluir esta simulação?</div>
          <p className="mt-1.5 text-[13px] leading-relaxed text-danger/90">
            Apaga o resultado desta rodada. Os dados de{' '}
            <strong className="font-bold">cadastro da unidade permanecem</strong>, e a simulação
            pode ser disparada de novo com os mesmos parâmetros.
          </p>
          <div className="mt-3 flex gap-2">
            <Button
              pill
              size="sm"
              disabled={excluir.isPending}
              className="!bg-danger !text-white hover:brightness-110"
              onClick={() =>
                excluir.mutate(run.runId, {
                  onSuccess: () => {
                    toast('Rodada excluída.', 'success')
                    setConfirmando(false)
                    aoExcluir()
                  },
                  onError: () => toast('Não foi possível excluir. Tente de novo.', 'warning'),
                })
              }
            >
              Excluir
            </Button>
            <Button pill size="sm" variant="secondary" onClick={() => setConfirmando(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : (
        /* O gatilho da exclusão é um link discreto, e não um botão de ação:
           ele divide o painel com "Abrir resultados", e dois botões de peso
           igual fariam a varredura confundir o destrutivo com o normal. */
        <div className="border-t border-ink-200 px-5 py-3.5">
          <button
            type="button"
            onClick={() => setConfirmando(true)}
            className="text-[13px] text-ink-400 transition-colors duration-hover ease-saida hover:text-danger"
          >
            Excluir simulação
          </button>
        </div>
      )}

      {detalhando && <DetalhesDaSimulacao run={run} aoFechar={() => setDetalhando(false)} />}
    </aside>
  )
}

/**
 * O gatilho de "ver detalhes" — link discreto, e não botão.
 *
 * O painel já tem UM botão de peso ("Abrir resultados", ou "Ajustar e rodar de
 * novo"): um segundo botão ao lado faria a varredura hesitar entre dois
 * caminhos que não são equivalentes. Ver os parâmetros é uma consulta, e abrir
 * o resultado é o destino.
 */
function BotaoDetalhes({ aoAbrir }: { aoAbrir: () => void }) {
  return (
    <button
      type="button"
      onClick={aoAbrir}
      className="mt-2.5 w-full text-center text-[13px] text-ink-500 transition-colors duration-hover ease-saida hover:text-water-600"
    >
      Ver detalhes da simulação
    </button>
  )
}
