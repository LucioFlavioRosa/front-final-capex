import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CircleNotch, ShieldCheck } from '@phosphor-icons/react'
import { MicrosoftLogo } from '../components/brand/MicrosoftLogo'
import { Button } from '../components/ui/Button'
import { useAuth } from '../auth/AuthContext'

/** Mensagens de erro que o backend devolve via ?error= no redirect de falha. */
const ERROR_MESSAGES: Record<string, string> = {
  login_failed: 'Não foi possível autenticar. Tente novamente.',
  state_mismatch: 'Sessão de login expirada. Tente novamente.',
  token_exchange: 'Falha ao validar o login com a Microsoft.',
  missing_code: 'Resposta de login inválida. Tente novamente.',
  not_allowed: 'Seu usuário não tem acesso a esta plataforma.',
}

const STATS = [
  { value: '892', label: 'municípios' },
  { value: 'R$ 2,7 bi', label: 'CAPEX esgoto / ano' },
  { value: '~5.000', label: 'obras em portfólio' },
]

export function Login() {
  const { login, status } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  // Já autenticado? Sai da tela de login.
  useEffect(() => {
    if (status === 'authenticated') navigate('/', { replace: true })
  }, [status, navigate])

  // Lê erro vindo do backend (?error=...) e limpa a URL.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const err = params.get('error')
    if (err) {
      setErro(ERROR_MESSAGES[err] ?? 'Login falhou. Tente novamente.')
      window.history.replaceState({}, document.title, window.location.pathname)
    }
  }, [])

  function handleLogin() {
    setErro(null)
    setLoading(true)
    login() // redirect de página inteira — a partir daqui o navegador navega para fora
  }

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      {/* Painel institucional */}
      <div className="hero-bg relative flex flex-col justify-between overflow-hidden px-8 py-12 text-white md:px-12 lg:w-[58%] lg:py-16">
        <svg
          viewBox="0 0 600 700"
          preserveAspectRatio="none"
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 h-full w-full opacity-90"
        >
          <path
            d="M-40 520 C 120 520 150 300 270 300 C 360 300 372 430 452 430 C 540 430 560 250 660 250"
            fill="none"
            stroke="#17E3CB"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeDasharray={1400}
            strokeDashoffset={1400}
            className="animate-draw"
          />
          <path
            d="M-40 580 C 140 580 170 380 300 380 C 400 380 410 500 500 500 C 590 500 610 330 700 330"
            fill="none"
            stroke="rgba(255,255,255,.28)"
            strokeWidth={1.25}
            strokeDasharray={1400}
            strokeDashoffset={1400}
            className="animate-draw"
            style={{ animationDelay: '150ms' }}
          />
        </svg>

        <div className="relative flex items-center gap-2.5">
          <img src="/assets/aegea-logo-azul.png" alt="aegea" className="h-[34px] brightness-0 invert" />
          <div className="leading-tight">
            <div className="text-[10px] uppercase tracking-wider text-white/70">
              SES · Sequenciamento de Obras
            </div>
          </div>
        </div>

        <div className="relative my-12 max-w-lg">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide backdrop-blur">
            Otimização de Portfólio · SES
          </div>
          <h1 className="text-4xl font-extrabold leading-tight tracking-tight md:text-[46px]">
            O sequenciamento ótimo de obras de esgotamento sanitário.
          </h1>
          <p className="mt-5 max-w-md text-[15px] leading-relaxed text-water-200">
            Fronteira de Pareto entre VPL e CAPEX, fluxo de escoamento respeitado, teto de investimento por
            ano. Decisão auditável em três ciclos de replanejamento.
          </p>
          <div className="mt-9 flex flex-wrap gap-8 border-t border-white/18 pt-6">
            {STATS.map((s) => (
              <div key={s.label}>
                <div className="font-mono text-[22px] font-semibold text-white">{s.value}</div>
                <div className="text-[11px] tracking-wide text-water-300">{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        <p className="relative text-xs text-water-300">Nossa natureza movimenta a vida.</p>
      </div>

      {/* Painel de acesso */}
      <div className="flex items-center justify-center bg-[#66EDDD] px-6 py-12 lg:w-[42%]">
        <div className="w-full max-w-sm animate-fade-in-up rounded-2xl bg-white p-8 shadow-elev">
          <div className="text-[11px] font-semibold uppercase tracking-[.1em] text-ink-400">
            Acesso restrito
          </div>
          <h2 className="mt-2.5 text-[26px] font-extrabold leading-tight tracking-tight text-body-text">
            Acessar a plataforma
          </h2>
          <p className="mt-2 text-[13.5px] text-ink-500">
            Autenticação corporativa via Microsoft Entra ID. Seu perfil define a experiência.
          </p>

          <Button
            variant="primary"
            sweep
            onClick={handleLogin}
            disabled={loading}
            className="mt-7 w-full py-3.5"
          >
            {loading ? (
              <>
                <CircleNotch className="animate-spin text-lg" />
                Redirecionando para o SSO…
              </>
            ) : (
              <>
                <MicrosoftLogo />
                Entrar com conta Microsoft
              </>
            )}
          </Button>

          {erro && <p className="mt-3 text-sm text-danger">{erro}</p>}

          <div className="mt-[18px] flex items-center gap-2 text-xs text-ink-500">
            <ShieldCheck weight="fill" className="flex-shrink-0 text-base text-aegea-600" />
            <span>Sessão auditada · Azure AD SSO</span>
          </div>

          <p className="mt-8 border-t border-ink-200 pt-5 text-[11.5px] text-ink-400">
            Protótipo — não é ambiente de produção. © 2026 Aegea Saneamento
          </p>
        </div>
      </div>
    </div>
  )
}
