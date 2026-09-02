import { useEffect } from 'react'
import { useAuth } from '../../../auth/AuthContext'
import { ehAdministrador } from '../../../auth/papeis'
import { useCadastro } from './CadastroContext'
import { Button } from '../../ui/Button'
import { Band } from '../../ui/Band'
import { useToast } from '../../ui/Toaster'
import { useDiretorias, useRegionais, useUnidade, useUnidades } from '../../../lib/organizacaoApi'

/**
 * O GRUPO DAS UNIDADES SEM DIRETORIA.
 *
 * Não é um id do banco: `diretoria_id` é nulável, e um `null` não serve de chave
 * de seleção. O prefixo `(` garante que ele não colida com id nenhum que a carga
 * possa trazer — ids do de-para não começam com pontuação.
 */
const SEM_DIRETORIA = '(sem-diretoria)'

export function SelecaoUnidade() {
  const { state, selecionarRegional, selecionarDiretoria, selecionarUnidade, iniciarCadastro } =
    useCadastro()
  const { user } = useAuth()
  const { toast } = useToast()

  /**
   * Item 10 — usuário comum só vê/edita a própria unidade.
   *
   * As listas ficam restritas a uma única regional e uma única unidade, e o
   * efeito abaixo já seleciona essa unidade ao entrar, sem exigir clique. Não é
   * um modo "somente leitura": a edição segue igual para os dois perfis — o
   * que muda é o RECORTE de unidades visíveis, não a permissão de campo.
   *
   * O RECORTE vem de `Identidade.unidades`, do backend, com toda concessão por
   * regional já EXPANDIDA em unidades — uma lista plana de ids, sem a regional
   * de cada uma. Restrito é só o caso de
   * escopo estreito o bastante para não precisar de escolha: administrador ou
   * escopo `tudo` sempre veem a lista cheia; escopo de 2+ unidades também —
   * essa pessoa TEM o que escolher, e escolher não é o mesmo que não ter
   * acesso. Só quando sobra exatamente UMA unidade não há nada a escolher.
   */
  const semEscolha =
    !!user && !user.tudo && !ehAdministrador(user.papeis) && user.unidades.length === 1
  const unidadeRestritaId = semEscolha ? user.unidades[0] : undefined

  /**
   * As listas vêm do BANCO — `input.unidade_regional`, via `/api/regionais` e
   * `/api/regionais/{id}/unidades`: unidade que não existe no banco não aparece
   * aqui.
   *
   * A REGIONAL de quem está restrito não vem da concessão — a concessão só
   * conhece unidade — e sim de `/api/unidades/{id}`, a mesma consulta que busca
   * o NOME da unidade.
   */
  const regionais = useRegionais()
  const regional = state.regionalId || ''
  const unidadeRestrita = useUnidade(unidadeRestritaId)
  const restrito = unidadeRestritaId
    ? { unidadeId: unidadeRestritaId, regionalId: unidadeRestrita.data?.regionalId }
    : undefined
  const diretorias = useDiretorias(restrito ? restrito.regionalId : regional || undefined)
  const unidades = useUnidades(restrito ? restrito.regionalId : regional || undefined)

  const REGIONAIS = restrito
    ? restrito.regionalId
      ? [restrito.regionalId]
      : []
    : (regionais.data ?? []).map((r) => r.id)
  const nomeRegional = Object.fromEntries((regionais.data ?? []).map((r) => [r.id, r.nome]))
  const todasUnidades = restrito
    ? unidadeRestrita.data
      ? [unidadeRestrita.data]
      : []
    : (unidades.data ?? [])

  /**
   * A LISTA DE DIRETORIAS INCLUI "Sem diretoria" QUANDO ALGUMA UNIDADE ESTÁ SEM.
   *
   * `/regionais/{id}/diretorias` só devolve diretorias que existem, e a coluna é
   * nulável de propósito — a carga pode trazer a unidade antes do nível acima.
   * Sem esta entrada, essa unidade não apareceria em diretoria nenhuma e sumiria
   * da tela: existiria no banco, seria acessível pela URL, e não teria como ser
   * escolhida. Um grupo a mais é melhor que uma unidade invisível.
   */
  const LISTA_DIRETORIAS = (() => {
    const daApi = (diretorias.data ?? []).map((d) => ({ id: d.id, nome: d.nome ?? d.id }))
    const orfas = todasUnidades.some((u) => !u.diretoriaId)
    return orfas ? [...daApi, { id: SEM_DIRETORIA, nome: 'Sem diretoria' }] : daApi
  })()

  const diretoriaAtual = state.diretoriaId

  /**
   * AS UNIDADES DA DIRETORIA ESCOLHIDA. Sem diretoria escolhida a lista é vazia,
   * e não "todas": a tela é uma cascata, e mostrar tudo no passo do meio faria a
   * escolha da diretoria parecer decorativa.
   *
   * Quem está restrito a uma unidade não passa por filtro nenhum — ele não
   * escolhe, e o efeito abaixo já seleciona a diretoria dela.
   */
  const listaUnidades = restrito
    ? todasUnidades
    : todasUnidades.filter((u) => (u.diretoriaId ?? SEM_DIRETORIA) === diretoriaAtual)

  const regionalAtual = REGIONAIS.find((r) => r === state.regionalId) ?? ''
  const unidadeId = state.unidade?.id ?? ''
  const nomeDiretoria =
    LISTA_DIRETORIAS.find((d) => d.id === diretoriaAtual)?.nome ?? diretoriaAtual

  function pickRegional(r: string) {
    selecionarRegional(r)
  }

  /**
   * Ao trocar de regional, a primeira unidade da lista NOVA é selecionada
   * automaticamente — comportamento preservado do código anterior. Como a
   * lista agora vem de rede, isso só pode acontecer depois que ela chega, daí
   * o efeito reagir a `unidades.data` em vez de calcular a lista na hora do
   * clique.
   */
  /**
   * Escolhida a regional, a PRIMEIRA DIRETORIA dela entra sozinha — o mesmo que
   * já acontecia com a unidade, um nível acima. Sem isto, trocar de regional
   * deixava a tela com duas listas vazias e nada indicando o próximo passo.
   */
  useEffect(() => {
    if (restrito || !state.regionalId || state.diretoriaId) return
    const primeira = LISTA_DIRETORIAS[0]
    if (primeira) selecionarDiretoria(primeira.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.regionalId, state.diretoriaId, diretorias.data, unidades.data])

  useEffect(() => {
    if (restrito || !state.diretoriaId || state.unidade) return
    const primeira = listaUnidades[0]
    if (primeira) selecionarUnidade(primeira.id, primeira.nome, primeira.regionalId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.diretoriaId, unidades.data])

  useEffect(() => {
    if (!restrito || !unidadeRestrita.data) return
    const { id, nome, regionalId, diretoriaId } = unidadeRestrita.data
    selecionarRegional(regionalId)
    // A DIRETORIA VEM DA UNIDADE, e não de uma escolha: quem está restrito não
    // escolhe nenhum dos três níveis, e o cartão do recorte precisa dizer em
    // qual diretoria ela está.
    selecionarDiretoria(diretoriaId ?? SEM_DIRETORIA)
    selecionarUnidade(id, nome, regionalId)
    // roda quando o dado da unidade fixa chega (ou o perfil dev muda) — não a cada render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restrito?.unidadeId, unidadeRestrita.data])

  function handleIniciar() {
    if (!state.unidade) {
      toast('Selecione uma unidade primeiro.', 'warning')
      return
    }
    iniciarCadastro()
  }

  return (
    <section className="max-w-content mx-auto animate-fade-in px-4 py-8 md:px-6">
      <div className="text-[11px] font-semibold uppercase tracking-[.1em] text-water-600/60">
        Cadastro SES · passo 1 de 2
      </div>
      <h1 className="mt-2 text-[28px] font-extrabold leading-[1.12] tracking-tight text-water-600">
        {restrito ? 'Sua unidade de trabalho' : 'Selecione a unidade de trabalho'}
      </h1>
      <p className="mt-2 max-w-[620px] text-water-600/80">
        {restrito
          ? 'Seu acesso é restrito a esta unidade — para editar outra, peça a um administrador.'
          : 'A análise é feita por unidade operacional. Escolha a regional, a diretoria e a unidade para abrir as abas da base.'}
      </p>

      {/* 1180px CABEM OS QUATRO CARTÕES numa linha: 4x260 de mínimo mais os três
          vãos. Eram três até a diretoria entrar, e 900px deixava o cartão do
          recorte sozinho numa segunda linha, com um vão à direita do tamanho de
          dois cartões. O `auto-fit` continua quebrando sozinho em tela estreita. */}
      <div className="mt-6 grid max-w-[1180px] gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(260px,1fr))]">
        <div className="min-w-0 rounded-2xl border border-ink-200 bg-white p-[18px]">
          <div className="mb-2.5 text-[10.5px] font-semibold uppercase tracking-[.09em] text-ink-water">Regional</div>
          {!restrito && regionais.isPending && (
            <p className="text-[12.5px] text-ink-water">Carregando…</p>
          )}
          {!restrito && regionais.isError && (
            <p className="text-[12.5px] text-danger">
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
          {!restrito && regionais.data?.length === 0 && (
            <p className="text-[12.5px] text-ink-water">Nenhuma regional disponível para o seu acesso.</p>
          )}
          <div className="flex flex-col gap-1.5">
            {REGIONAIS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => pickRegional(r)}
                className={`rounded-[9px] border px-3 py-2.5 text-left text-[13px] transition-colors duration-hover ease-saida hover:border-water-200 ${
                  r === regionalAtual ? 'border-water-600 bg-water-50 font-semibold text-water-700' : 'border-ink-200 bg-white'
                }`}
              >
                {nomeRegional[r] ?? r}
              </button>
            ))}
          </div>
        </div>

        <div className="min-w-0 rounded-2xl border border-ink-200 bg-white p-[18px]">
          <div className="mb-2.5 text-[10.5px] font-semibold uppercase tracking-[.09em] text-ink-water">Diretoria</div>
          {!restrito && diretorias.isPending && regionalAtual && (
            <p className="text-[12.5px] text-ink-water">Carregando…</p>
          )}
          {!restrito && diretorias.isError && (
            <p className="text-[12.5px] text-danger">
              Não foi possível carregar as diretorias.{' '}
              <button
                type="button"
                onClick={() => diretorias.refetch()}
                className="font-semibold underline"
              >
                Tentar de novo
              </button>
            </p>
          )}
          {!restrito && regionalAtual && !diretorias.isPending && LISTA_DIRETORIAS.length === 0 && (
            <p className="text-[12.5px] text-ink-water">Nenhuma diretoria nesta regional.</p>
          )}
          <div className="flex max-h-[340px] flex-col gap-1.5 overflow-y-auto">
            {LISTA_DIRETORIAS.map((d) => (
              <button
                key={d.id}
                type="button"
                disabled={!!restrito}
                onClick={() => selecionarDiretoria(d.id)}
                className={`rounded-[9px] border px-3 py-2.5 text-left text-[13px] transition-colors duration-hover ease-saida hover:border-water-200 disabled:cursor-default ${
                  d.id === diretoriaAtual ? 'border-water-600 bg-water-50 font-semibold text-water-700' : 'border-ink-200 bg-white'
                }`}
              >
                {d.nome}
              </button>
            ))}
          </div>
        </div>

        <div className="min-w-0 rounded-2xl border border-ink-200 bg-white p-[18px]">
          <div className="mb-2.5 text-[10.5px] font-semibold uppercase tracking-[.09em] text-ink-water">Unidade</div>
          {!restrito && unidades.isPending && regionalAtual && (
            <p className="text-[12.5px] text-ink-water">Carregando…</p>
          )}
          {!restrito && unidades.isError && (
            <p className="text-[12.5px] text-danger">
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
          {!restrito && diretoriaAtual && !unidades.isPending && listaUnidades.length === 0 && (
            <p className="text-[12.5px] text-ink-water">Nenhuma unidade nesta diretoria.</p>
          )}
          {/* Lista alta: rola dentro do cartão em vez de esticar a página. */}
          <div className="flex max-h-[340px] flex-col gap-1.5 overflow-y-auto">
            {listaUnidades.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => selecionarUnidade(u.id, u.nome, u.regionalId)}
                className={`rounded-[9px] border px-3 py-2.5 text-left text-[13px] transition-colors duration-hover ease-saida hover:border-water-200 ${
                  u.id === unidadeId ? 'border-water-600 bg-water-50 font-semibold text-water-700' : 'border-ink-200 bg-white'
                }`}
              >
                <span className="block">{u.nome}</span>
                {/* O aviso "sem CTS na base" saiu junto com a base comercial do
                    bundle: quem sabe se a unidade tem CTS agora é o banco, e a
                    tela de seleção não consulta a API — descobrir isso aqui
                    custaria uma requisição por unidade listada. */}
                <span className="mt-0.5 block font-mono text-[10.5px] text-ink-water">{u.id}</span>
              </button>
            ))}
          </div>
        </div>

        <Band className="flex min-w-0 flex-col justify-between p-[18px]">
          <div>
            <div className="band-mut mb-3 text-[10.5px] font-semibold uppercase tracking-[.09em]">Recorte selecionado</div>
            {/* Só o que tem fonte real. Contagens de cidade/CTS/sub-bacia saíram
                junto com `hierarquiaReal.ts`: eram lidas de um mapa compilado, e
                sem ele um número aqui seria inventado — pior que número nenhum,
                porque esta tela é onde se confere se a unidade certa foi
                escolhida. */}
            {/* NOME PRIMEIRO, CÓDIGO DEPOIS — e não só o código.
                Este cartão confirma a escolha que acabou de ser feita nos dois
                ao lado, onde tudo é nome ("Regional Litoral", "Unidade
                Baixada"). Responder "rA / uA2" obrigava a conferir a escolha
                por um identificador que ninguém leu para escolher — e é
                justamente aqui que se confere antes de abrir as abas.
                O código continua visível porque ele é o que aparece na URL e
                nos diagnósticos: some a dúvida, sem perder a rastreabilidade. */}
            <Resumo
              label="Regional"
              value={regionalAtual ? nomeRegional[regionalAtual] ?? regionalAtual : '—'}
              codigo={regionalAtual}
            />
            <Resumo
              label="Diretoria"
              value={diretoriaAtual ? nomeDiretoria : '—'}
              codigo={diretoriaAtual === SEM_DIRETORIA ? '' : diretoriaAtual}
            />
            <Resumo
              label="Unidade"
              value={unidadeId ? state.unidade?.name ?? unidadeId : '—'}
              codigo={unidadeId}
              last
            />
          </div>
          <Button onClick={handleIniciar} className="mt-[18px] w-full justify-center">
            Iniciar preenchimento
          </Button>
        </Band>
      </div>
    </section>
  )
}

function Resumo({
  label,
  value,
  codigo,
  last = false,
}: {
  label: string
  value: string
  /** O identificador, ao lado do nome. Omitido quando é igual ao nome. */
  codigo?: string
  last?: boolean
}) {
  return (
    <div className={`flex items-baseline justify-between gap-3 py-[7px] ${last ? '' : 'border-b border-white/15'}`}>
      <span className="band-mut text-[12.5px]">{label}</span>
      <span className="min-w-0 text-right">
        <span className="text-[13px] font-semibold">{value}</span>
        {codigo && codigo !== value && (
          <span className="band-mut ml-1.5 font-mono text-[11px]">{codigo}</span>
        )}
      </span>
    </div>
  )
}
