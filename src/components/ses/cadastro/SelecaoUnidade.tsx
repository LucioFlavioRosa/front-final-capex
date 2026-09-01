import { useEffect } from 'react'
import { useAuth } from '../../../auth/AuthContext'
import { ehAdministrador } from '../../../auth/papeis'
import { useCadastro } from './CadastroContext'
import { Button } from '../../ui/Button'
import { Band } from '../../ui/Band'
import { useToast } from '../../ui/Toaster'
import { useRegionais, useUnidade, useUnidades } from '../../../lib/organizacaoApi'

export function SelecaoUnidade() {
  const { state, selecionarRegional, selecionarUnidade, iniciarCadastro } = useCadastro()
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
  const unidades = useUnidades(restrito ? restrito.regionalId : regional || undefined)

  const REGIONAIS = restrito
    ? restrito.regionalId
      ? [restrito.regionalId]
      : []
    : (regionais.data ?? []).map((r) => r.id)
  const nomeRegional = Object.fromEntries((regionais.data ?? []).map((r) => [r.id, r.nome]))
  const listaUnidades = restrito
    ? unidadeRestrita.data
      ? [unidadeRestrita.data]
      : []
    : (unidades.data ?? [])

  const regionalAtual = REGIONAIS.find((r) => r === state.regionalId) ?? ''
  const unidadeId = state.unidade?.id ?? ''

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
  useEffect(() => {
    if (restrito || !state.regionalId || state.unidade) return
    const primeira = unidades.data?.[0]
    if (primeira) selecionarUnidade(primeira.id, primeira.nome, primeira.regionalId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.regionalId, unidades.data])

  useEffect(() => {
    if (!restrito || !unidadeRestrita.data) return
    const { id, nome, regionalId } = unidadeRestrita.data
    selecionarRegional(regionalId)
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
          : 'A análise é feita por unidade operacional. Escolha a regional e a unidade para abrir as abas da base.'}
      </p>

      <div className="mt-6 grid max-w-[900px] gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(260px,1fr))]">
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
          {!restrito && regionalAtual && unidades.data?.length === 0 && (
            <p className="text-[12.5px] text-ink-water">Nenhuma unidade nesta regional.</p>
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
