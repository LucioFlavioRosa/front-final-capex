import { NavLink, useNavigate } from 'react-router-dom'
import { ArrowRight, Warning } from '@phosphor-icons/react'
import { NAV_ITEMS } from '../config/navigation'
import { Band, BandStat } from '../components/ui/Band'
import { Button } from '../components/ui/Button'
import { useAuth } from '../auth/AuthContext'
import { useHome } from './homeDados'
import { dec } from '../lib/format'

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
    ? `Olá, ${primeiroNome[0].toUpperCase()}${primeiroNome.slice(1)}.`
    : 'Olá.'

  const ultima = data?.ultima ?? null
  const kpis = data?.meta?.kpis ?? null
  const unidade = data?.unidade ?? null
  const resumo = unidade?.resumo

  return (
    <section className="max-w-content mx-auto px-4 py-8 md:px-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-6">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[.1em] text-ink-water">
            Otimizador de CAPEX · esgotamento sanitário
          </div>
          <h1 className="mt-2 text-[30px] font-extrabold leading-tight tracking-tight text-water-600">
            {saudacao}
          </h1>
          <p className="mt-2 max-w-xl text-water-600/80">
            {isPending && 'Carregando o histórico…'}
            {isError && 'Não foi possível falar com o servidor. Recarregue a página.'}
            {data && !ultima && 'Nenhuma simulação publicada ainda — comece pelo cadastro da unidade.'}
            {ultima && unidade && (
              <>
                A unidade{' '}
                <strong className="font-semibold text-water-600">{ultima.unidadeNome}</strong>{' '}
                {unidade.completude === 100
                  ? 'está pronta para simular'
                  : `está com ${unidade.completude}% do cadastro preenchido`}
                . Última rodada {quando(ultima.dataHora)}.
              </>
            )}
          </p>
        </div>
        <div className="flex gap-2.5">
          <Button sweep onClick={() => navigate('/cadastro')}>
            Revisar cadastro
          </Button>
        </div>
      </div>

      <div className="grid items-start gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
        <Band className="col-span-2 min-w-0 p-6" flow>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="band-mut text-[10.5px] font-semibold uppercase tracking-[.09em]">
                Última simulação
              </div>
              <div className="mt-1.5 flex items-baseline gap-2.5">
                <span className="text-[17px] font-bold tracking-tight">
                  {ultima?.nome || ultima?.unidadeNome || '—'}
                </span>
                <span className="band-mut font-mono text-xs">{ultima?.runId ?? ''}</span>
              </div>
            </div>
            {ultima && (
              <span className="flex items-center gap-1.5 rounded-full border border-aegea-400/45 bg-aegea-400/15 px-2.5 py-1 text-[11.5px] font-semibold text-aegea-300">
                <span className="h-1.5 w-1.5 rounded-full bg-aegea-400" />
                {ultima.status}
              </span>
            )}
          </div>

          {kpis ? (
            <div className="mt-5 flex flex-wrap gap-9">
              <BandStat label="VPL" value={dinheiro(kpis.vpl)} size="hero" />
              <div className="border-l band-line pl-9">
                <BandStat label="CAPEX" value={dinheiro(kpis.capexTotal)} size="lg" />
                <div className="band-mut mt-1.5 text-[11.5px]">
                  cobertura ao fim: {dec(kpis.coberturaFimPct, 1)}%
                </div>
              </div>
              <div className="border-l band-line pl-9">
                <BandStat label="Obras sequenciadas" value={String(kpis.obrasConstruidas)} size="lg" />
                <div className="band-mut mt-1.5 text-[11.5px]">
                  de {kpis.obrasTotal} candidatas · {kpis.subbaciasFaturando} de {kpis.subbaciasTotal}{' '}
                  sub-bacias faturando
                </div>
              </div>
            </div>
          ) : (
            <div className="band-mut mt-5 text-[12.5px]">
              {isPending ? 'Carregando…' : 'Sem resultado publicado para exibir.'}
            </div>
          )}
        </Band>

        <div className="min-w-0 rounded-2xl border border-ink-200 bg-white p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[15px] font-bold tracking-tight text-ink-900">Status do cadastro</h2>
            <span className="font-mono text-xs font-semibold text-aegea-700">
              {unidade ? `${unidade.completude}%` : '—'}
            </span>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ink-200">
            <div
              className="h-full origin-left animate-grow rounded-full bg-gradient-to-r from-water-600 to-aegea-400"
              style={{ width: `${unidade?.completude ?? 0}%` }}
            />
          </div>
          <div className="mt-4 flex flex-col">
            <StatusRow label="Sub-bacias" value={resumo?.subBacias} />
            <StatusRow label="ETEs" value={resumo?.etes} />
            <StatusRow label="Sistemas" value={resumo?.sistemas} />
            <StatusRow label="Obras cadastradas" value={resumo?.obras} last />
          </div>
          {/* Chip âmbar mantém a cor semântica no fundo/borda; o texto usa amber-800 para
              chegar a 6.4:1 — `text-warning` sobre `bg-warning/10` fica em 2.9:1. */}
          {unidade && unidade.completude < 100 && (
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
                className="min-w-0 rounded-[14px] border border-ink-200 bg-white p-5 text-left transition-all duration-hover ease-saida hover:border-water-200 hover:shadow-elev"
              >
                <div className="flex items-center justify-between">
                  <div className={`flex h-9 w-9 items-center justify-center rounded-[10px] ${moduleClasses[item.path]}`}>
                    <IconCmp weight="fill" className="text-xl" />
                  </div>
                  <ArrowRight className="text-ink-500" />
                </div>
                <h3 className="mt-2.5 text-[15px] font-bold tracking-tight text-body-text">{item.title}</h3>
                <p className="mt-1 text-[12.5px] leading-relaxed text-ink-500">{item.description}</p>
              </NavLink>
            )
          })}
        </div>
      </div>
    </section>
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
