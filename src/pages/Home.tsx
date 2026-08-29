/**
 * A HOME — o que aconteceu por último, e o cadastro está pronto para a próxima?
 *
 * REDESENHADA EM 29/08/2026, e a mudança é de hierarquia antes de ser de forma.
 *
 * A versão anterior abria com "Olá, Fulano." como o maior e mais pesado texto da
 * página, e a resposta que a pessoa veio buscar — em que pé está o trabalho —
 * ficava no parágrafo abaixo, menor e a 80% de opacidade. A hierarquia
 * tipográfica dizia o contrário da hierarquia de informação. A saudação desceu
 * para eyebrow, onde uma cortesia cabe, e o VEREDITO subiu para o h1.
 *
 * O bloco visual de abertura era o VPL a 60px numa faixa navy com uma curva
 * turquesa animada ao fundo. Isso é a abertura de qualquer dashboard; não dizia
 * o que este produto faz, que é ordenar obras no tempo. Virou o horizonte do
 * plano — ver `HorizonteDoPlano`.
 *
 * E as três superfícies brancas da página usavam três raios e três
 * comportamentos de sombra para o que o olho lê como o mesmo objeto. Agora todas
 * são `.carta`, que é a classe que o `index.css` criou exatamente para isso.
 */
import { NavLink, useNavigate } from 'react-router-dom'
import { ArrowRight, Warning } from '@phosphor-icons/react'
import { NAV_ITEMS } from '../config/navigation'
import { Button } from '../components/ui/Button'
import { useAuth } from '../auth/AuthContext'
import { useHome } from './homeDados'
import { HorizonteDoPlano } from './HorizonteDoPlano'
import { dec, int } from '../lib/format'

/** Destaque por módulo. Cadastro lê uma cor editável (--color-mod-cadastro). */
const moduleClasses: Record<string, string> = {
  '/cadastro': 'bg-mod-cadastro/10 text-mod-cadastro',
}

/** `R$ 1,44 bi` para valores grandes, `R$ 312,4 mi` para o resto. */
function dinheiro(v: number): string {
  const mi = v / 1_000_000
  return mi >= 1000 ? `R$ ${dec(mi / 1000, 2)} bi` : `R$ ${dec(mi, 1)} mi`
}

/** `há 2 dias`, `há 3 h`, `agora` — o mesmo que a linha do protótipo dizia. */
function quando(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const h = Math.floor(ms / 3_600_000)
  if (h < 1) return 'agora há pouco'
  if (h < 24) return `há ${h} h`
  const d = Math.floor(h / 24)
  return d === 1 ? 'há 1 dia' : `há ${d} dias`
}

export function Home() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { data, isPending, isError } = useHome()

  const primeiroNome = (user?.name || user?.email || '').split(/[ @.]/)[0]
  const saudacao = primeiroNome
    ? `Olá, ${primeiroNome[0].toUpperCase()}${primeiroNome.slice(1)}`
    : 'Olá'

  const ultima = data?.ultima ?? null
  const kpis = data?.meta?.kpis ?? null
  const unidade = data?.unidade ?? null
  const resumo = unidade?.resumo
  // De `/prontidao`, e nao da unidade — ver o comentario em `homeDados.ts`.
  const completude = data?.completude ?? null
  const pendencias = data?.pendencias ?? null
  // Cadastro FECHADO é zero pendência. O percentual só entra quando o servidor
  // manda um — hoje ele não manda, e era isso que deixava o veredito no ramo
  // mais fraco para toda unidade.
  const fechado = completude === 100 || pendencias === 0
  const nomeUnidade = ultima?.unidadeNome ?? unidade?.nome ?? 'a unidade'

  /**
   * O VEREDITO — o h1.
   *
   * Uma frase que fecha, e não um rótulo: quem abre esta tela quer saber se pode
   * simular. "Faltam 6%" e "está pronta" são respostas; "Cadastro: 94%" é um
   * dado que a pessoa ainda precisa interpretar.
   */
  let veredito = 'Carregando o histórico…'
  if (isError) veredito = 'Não foi possível falar com o servidor.'
  else if (data && !ultima) veredito = 'Nenhuma simulação publicada ainda.'
  else if (ultima) {
    if (fechado) veredito = `A ${nomeUnidade} está pronta para simular.`
    else if (completude != null) veredito = `Faltam ${dec(100 - completude, 0)}% do cadastro da ${nomeUnidade}.`
    else if (pendencias != null)
      veredito =
        pendencias === 1
          ? `Falta 1 campo no cadastro da ${nomeUnidade}.`
          : `Faltam ${int(pendencias)} campos no cadastro da ${nomeUnidade}.`
    else veredito = `A ${nomeUnidade} está cadastrada.`
  }

  let detalhe = ''
  if (isError) detalhe = 'Recarregue a página.'
  else if (data && !ultima) detalhe = 'Comece pelo cadastro da unidade.'
  else if (ultima) detalhe = `Última rodada ${quando(ultima.dataHora)}.`

  return (
    <section className="max-w-content mx-auto px-4 py-8 md:px-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-6">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[.1em] text-ink-water">
            {saudacao}
          </div>
          <h1 className="mt-2 max-w-2xl text-[30px] font-extrabold leading-tight tracking-tight text-water-600">
            {veredito}
          </h1>
          {detalhe && <p className="mt-2 text-[13.5px] text-ink-500">{detalhe}</p>}
        </div>
        <div className="flex gap-2.5">
          <Button sweep onClick={() => navigate('/cadastro')}>
            Revisar cadastro
          </Button>
        </div>
      </div>

      <div
        className="grid items-start gap-4"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}
      >
        <div className="carta col-span-2 min-w-0 p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="text-[11px] font-semibold uppercase tracking-[.09em] text-ink-water">
                Horizonte do plano
              </h2>
              <div className="mt-1.5 flex items-baseline gap-2.5">
                <span className="text-[17px] font-bold tracking-tight text-ink-900">
                  {ultima?.nome || ultima?.unidadeNome || '—'}
                </span>
                <span className="font-mono text-xs text-ink-400">{ultima?.runId ?? ''}</span>
              </div>
            </div>
            {ultima && (
              <span className="flex items-center gap-1.5 rounded-full border border-aegea-500/30 bg-aegea-50 px-2.5 py-1 text-[11.5px] font-semibold text-aegea-700">
                <span className="h-1.5 w-1.5 rounded-full bg-aegea-500" />
                {ultima.status}
              </span>
            )}
          </div>

          {/* FATOS À ESQUERDA, FORMA À DIREITA.
              Empilhados um sob o outro e com a faixa ao lado, os dois dividem a
              largura da carta. Estavam em linha, com a faixa embaixo: a carta é
              larga, a faixa de um plano de dois anos não a preenche, e o que
              sobrava era um bloco solto no meio de muito branco. Os fatos são a
              legenda da forma, não a manchete — daí ficarem menores que ela em
              peso, mas ao lado dela em espaço. */}
          <div className="mt-4 flex flex-wrap items-start gap-x-10 gap-y-6">
            {kpis && (
              <div className="flex flex-col gap-4">
                <Fato rotulo="VPL" valor={dinheiro(kpis.vpl)} />
                <Fato
                  rotulo="CAPEX"
                  valor={dinheiro(kpis.capexTotal)}
                  nota={`cobertura ao fim: ${dec(kpis.coberturaFimPct, 1)}%`}
                />
                <Fato
                  rotulo="Obras sequenciadas"
                  valor={int(kpis.obrasConstruidas)}
                  nota={`de ${int(kpis.obrasTotal)} candidatas · ${int(kpis.subbaciasFaturando)} de ${int(kpis.subbaciasTotal)} sub-bacias faturando`}
                />
              </div>
            )}
            <div className="min-w-[280px] flex-1">
              <HorizonteDoPlano
                anos={data?.cronograma ?? []}
                carregando={isPending}
                runId={ultima?.runId ?? null}
              />
            </div>
          </div>
        </div>

        <div className="carta min-w-0 p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[15px] font-bold tracking-tight text-ink-900">Status do cadastro</h2>
            <span className="font-mono text-xs font-semibold text-aegea-700">
              {completude != null
                ? `${completude}%`
                : pendencias != null
                  ? pendencias === 0
                    ? 'completo'
                    : `${int(pendencias)} pendências`
                  : '—'}
            </span>
          </div>
          {/* A BARRA SÓ EXISTE COM PERCENTUAL. Sem ele ela ficava zerada e
              parecia defeito — uma barra vazia afirma "0% preenchido", que é
              falso; o certo é não afirmar nada. */}
          {completude != null && (
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ink-200">
              <div
                className="h-full origin-left animate-grow rounded-full bg-water-600"
                style={{ width: `${completude}%` }}
              />
            </div>
          )}
          <div className="mt-4 flex flex-col">
            <StatusRow label="Sub-bacias" value={resumo?.subBacias} />
            <StatusRow label="ETEs" value={resumo?.etes} />
            <StatusRow label="Sistemas" value={resumo?.sistemas} />
            <StatusRow label="Obras cadastradas" value={resumo?.obras} last />
          </div>
          {/* Chip âmbar mantém a cor semântica no fundo/borda; o texto usa amber-800 para
              chegar a 6.4:1 — `text-warning` sobre `bg-warning/10` fica em 2.9:1. */}
          {!fechado && (completude != null || pendencias != null) && (
            <div className="mt-3.5 flex items-start gap-2 rounded-[9px] border border-warning/30 bg-warning/10 px-3 py-2.5">
              <Warning weight="fill" className="mt-0.5 flex-none text-amber-700" />
              <span className="text-xs text-amber-800">
                O cadastro desta unidade está incompleto — a simulação fica bloqueada até fechar
                100%.
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="mt-8">
        <div className="mb-3 text-[11px] font-semibold uppercase tracking-[.1em] text-ink-water">
          Módulos da plataforma
        </div>
        <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2 lg:grid-cols-3">
          {NAV_ITEMS.map((item) => {
            const IconCmp = item.icon
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className="carta min-w-0 p-5 text-left transition-all duration-hover ease-saida hover:border-water-200 hover:shadow-elev"
              >
                <div className="flex items-center justify-between">
                  <div
                    className={`flex h-9 w-9 items-center justify-center rounded-[10px] ${moduleClasses[item.path]}`}
                  >
                    <IconCmp weight="fill" className="text-xl" />
                  </div>
                  <ArrowRight className="text-ink-500" />
                </div>
                <h3 className="mt-2.5 text-[15px] font-bold tracking-tight text-body-text">
                  {item.title}
                </h3>
                <p className="mt-1 text-[12.5px] leading-relaxed text-ink-500">
                  {item.description}
                </p>
              </NavLink>
            )
          })}
        </div>
      </div>
    </section>
  )
}

/** Um fato do plano: rótulo miúdo, valor em mono, nota opcional embaixo. */
function Fato({ rotulo, valor, nota }: { rotulo: string; valor: string; nota?: string }) {
  return (
    <div>
      <div className="text-[10.5px] font-semibold uppercase tracking-[.09em] text-ink-400">
        {rotulo}
      </div>
      <div className="mt-1 font-mono text-[19px] font-semibold leading-none tracking-tight text-ink-900">
        {valor}
      </div>
      {nota && <div className="mt-1.5 text-[11.5px] text-ink-500">{nota}</div>}
    </div>
  )
}

/** `—` quando o número ainda não chegou: zero seria uma afirmação, e ela seria falsa. */
function StatusRow({ label, value, last = false }: { label: string; value?: number; last?: boolean }) {
  return (
    <div className={`flex items-center justify-between py-2.5 ${last ? '' : 'border-b border-ink-200'}`}>
      <span className="text-[13px] text-ink-500">{label}</span>
      <span className="font-mono text-[13px] font-semibold text-body-text">
        {value == null ? '—' : value.toLocaleString('pt-BR')}
      </span>
    </div>
  )
}
