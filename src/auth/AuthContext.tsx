import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api, ApiError, definirLoginDeDev } from '../lib/api'
import {
  ADMIN_HOLDING,
  ADMIN_REGIONAL,
  ADMIN_UNIDADE,
  FINANCEIRO_HOLDING,
  GERENCIADOR_USUARIOS,
  ROTULO_PAPEL,
  TODOS_OS_PAPEIS,
  USUARIO_HOLDING,
  USUARIO_REGIONAL,
  USUARIO_UNIDADE,
  type Papel,
} from './papeis'

/**
 * Perfil de acesso — quem vê o quê depois de entrar.
 *
 * DUAS CAMADAS, e este arquivo só cuida da segunda: o SSO (dormente,
 * `app/auth/`) valida se a pessoa entra no site; `papeis`/`unidades`/`tudo`
 * dizem o que ela vê e manuseia depois de entrar. `GET /api/users/profile`
 * devolve as duas coisas juntas porque a costura é só o e-mail — ver o
 * comentário em `app/users/routes.py`.
 *
 * Fonte real: `controle.usuario_acesso`, via `/api/users/profile`. Sem
 * concessão, os três campos vêm vazios/falso — mesmo default seguro de
 * "sem acesso" que o backend já aplica (migração 0010).
 */
export interface User {
  name: string
  email: string
  role: string
  /** Os papéis concedidos a esta pessoa — normalmente um só, mas o tipo é lista
   *  porque a tabela não impede duas concessões com papéis diferentes. */
  papeis: Papel[]
  /** Unidades alcançadas — já com toda concessão por regional expandida. Vazio
   *  quando `tudo` é true (não há lista a enumerar) ou quando não há concessão. */
  unidades: string[]
  /** Escopo total (holding) — ver `app.dominio.papeis.ESCOPO_HOLDING`. */
  tudo: boolean
  /** Iniciais para o avatar. */
  initials: string
}

/** Status da verificação de sessão. Evita "piscar" a tela de login durante o load. */
export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated'

interface AuthContextValue {
  user: User | null
  status: AuthStatus
  isAuthenticated: boolean
  /** Inicia o SSO: redireciona o navegador para o backend (/auth/login). Não retorna. */
  login: () => void
  /** Encerra a sessão no backend e limpa o estado local. */
  logout: () => Promise<void>
  /** true com VITE_SKIP_AUTH — só nesse modo o seletor de perfil (dev) existe. */
  isMockAuth: boolean
  /** Qual mock está selecionado agora — `null` fora do modo mock. Value do
   *  dropdown de dev (`Header.tsx`). */
  perfilDev: PerfilDev | null
  /** As opções do dropdown, na ordem em que aparecem — os 8 papéis do
   *  documento mais o `super-admin` de demonstração. */
  opcoesPerfilDev: readonly PerfilDev[]
  /** Rótulo de exibição de cada opção. */
  rotuloPerfilDev: Record<PerfilDev, string>
  /** Troca para o mock escolhido. Só faz sentido quando isMockAuth. */
  definirPerfilDev: (perfil: PerfilDev) => void
}

/** Formato bruto do usuário retornado pelo backend (users/service.py). */
interface BackendUser {
  nome_completo: string
  email: string
  cargo_texto?: string | null
}

/** Formato bruto de `GET /api/users/profile` — ver `app/users/routes.py`. */
interface BackendProfile {
  user: BackendUser
  papeis: string[]
  unidades: string[]
  tudo: boolean
}

function computeInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '—'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

/** Converte o perfil do backend para o formato consumido pela UI. */
function mapUser(raw: BackendProfile): User {
  const name = raw.user.nome_completo || raw.user.email
  return {
    name,
    email: raw.user.email,
    role: raw.user.cargo_texto || 'Usuário Aegea',
    // `papeis` chega como `string[]` (o backend não conhece o tipo `Papel` do
    // TS); papel que este front não reconhece cai aqui do mesmo jeito que cai
    // sem poder no backend — ver `app.dominio.papeis`: "guardado e ignorado".
    papeis: raw.papeis as Papel[],
    unidades: raw.unidades,
    tudo: raw.tudo,
    initials: computeInitials(name),
  }
}

const AuthContext = createContext<AuthContextValue | null>(null)

/**
 * Bypass temporário do SSO para desenvolvimento do frontend antes do Entra ID
 * estar configurado. Ativado só via `.env.local` (gitignored) com
 * VITE_SKIP_AUTH=true. Remover esta flag (e o bloco abaixo) quando o SSO
 * estiver pronto para uso — não deixar habilitado em produção.
 */
const SKIP_AUTH = import.meta.env.VITE_SKIP_AUTH === 'true'

/** Chave de persistência do toggle dev — sobrevive a F5, some ao trocar de navegador/perfil do SO. */
const CHAVE_PERFIL_DEV = 'ses_dev_perfil'

/**
 * `super-admin` NÃO é um dos 8 papéis do documento — é um NONO valor,
 * só de demonstração/QA, que não existe no backend (não está em
 * `app/dominio/papeis.py` nem no CHECK de `migrations/0018`). Por isso ele
 * vive AQUI, e não em `auth/papeis.ts`: aquele arquivo é o espelho fechado
 * do vocabulário real, e um valor a mais ali quebraria a paridade com a
 * migration que `test_papeis.py` garante.
 *
 * O mock dele usa `papeis: [ADMIN_HOLDING]` — o papel real mais amplo — e
 * `email: 'dev@local'`, a identidade padrão do backend em modo sem
 * autenticação. Ou seja: "super-admin" não é um atalho que pula a
 * autorização, é só o mock cujo e-mail bate com o grant que já existe pronto
 * no banco local (`admin_holding`, sem regional/unidade — escopo total) —
 * o mesmo que qualquer chamada faz por padrão quando NENHUM cabeçalho de dev
 * é enviado. É o perfil mais seguro para "se algo no seletor falhar, isto
 * ainda funciona".
 */
const SUPER_ADMIN = 'super-admin'
export type PerfilDev = Papel | typeof SUPER_ADMIN

/** As 8 opções reais, na ordem do documento, mais o super-admin por último. */
const OPCOES_PERFIL_DEV: readonly PerfilDev[] = [...TODOS_OS_PAPEIS, SUPER_ADMIN]

const ROTULO_PERFIL_DEV: Record<PerfilDev, string> = {
  ...ROTULO_PAPEL,
  [SUPER_ADMIN]: 'Super-admin (sem nenhuma restrição)',
}

/**
 * UM MOCK POR PAPEL — para mostrar o que cada um dos 8 perfis do documento vê
 * no dia a dia, sem precisar de 8 contas reais nem do SSO (que está dormente).
 * `unidades` usa '56'/'57' —
 * as duas únicas unidades carregadas em `input.unidade_regional` hoje (ver
 * `lib/organizacaoApi.ts`) — para que os mocks de escopo estreito mostrem
 * dado de verdade, não uma unidade vazia.
 *
 * CADA E-MAIL AQUI TEM UM GRANT CORRESPONDENTE em `controle.usuario_acesso`
 * NO BANCO LOCAL — sem ele, o toggle muda o menu mas `/api/regionais` etc.
 * continuam vazios, porque o filtro por escopo roda sobre a identidade REAL
 * da requisição (`X-Usuario-Dev`, ver `lib/api.ts`), não sobre este objeto.
 * Ver `ses-backend/scripts/semear_acessos_demo.sql`.
 */
const MOCKS: Record<PerfilDev, User> = {
  [ADMIN_HOLDING]: {
    name: 'Administrador da Holding (mock)',
    email: 'admin.holding@aegea.com.br',
    role: 'Diretoria · Planejamento Aegea',
    papeis: [ADMIN_HOLDING],
    unidades: [],
    tudo: true,
    initials: 'AH',
  },
  [USUARIO_HOLDING]: {
    name: 'Usuário Comum da Holding (mock)',
    email: 'usuario.holding@aegea.com.br',
    role: 'Planejamento Aegea · leitura',
    papeis: [USUARIO_HOLDING],
    unidades: [],
    tudo: true,
    initials: 'UH',
  },
  [ADMIN_REGIONAL]: {
    name: 'Administrador Regional (mock)',
    email: 'admin.regional@aegea.com.br',
    role: 'Gestão · Águas do Rio (R4)',
    papeis: [ADMIN_REGIONAL],
    unidades: ['56', '57'],
    tudo: false,
    initials: 'AR',
  },
  [USUARIO_REGIONAL]: {
    name: 'Usuário Comum Regional (mock)',
    email: 'usuario.regional@aegea.com.br',
    role: 'Águas do Rio (R4) · leitura',
    papeis: [USUARIO_REGIONAL],
    unidades: ['56', '57'],
    tudo: false,
    initials: 'UR',
  },
  [ADMIN_UNIDADE]: {
    name: 'Administrador da Unidade (mock)',
    email: 'admin.unidade@aegea.com.br',
    role: 'Gestão · Águas do Rio 04',
    papeis: [ADMIN_UNIDADE],
    unidades: ['57'],
    tudo: false,
    initials: 'AU',
  },
  /** Mesma unidade que já é o default de `CadastroContext` — mock original preservado. */
  [USUARIO_UNIDADE]: {
    name: 'Usuário Comum da Unidade (mock)',
    email: 'unidade.rio04@aegea.com.br',
    role: 'Operador · Águas do Rio 04',
    papeis: [USUARIO_UNIDADE],
    unidades: ['57'],
    tudo: false,
    initials: 'UU',
  },
  [FINANCEIRO_HOLDING]: {
    name: 'Financeiro da Holding (mock)',
    email: 'financeiro@aegea.com.br',
    role: 'Operações Financeiras · WACC',
    papeis: [FINANCEIRO_HOLDING],
    unidades: [],
    tudo: true,
    initials: 'FH',
  },
  [GERENCIADOR_USUARIOS]: {
    name: 'Gerenciador de Usuários (mock)',
    email: 'acessos@aegea.com.br',
    role: 'Administração de acessos',
    papeis: [GERENCIADOR_USUARIOS],
    unidades: [],
    tudo: false,
    initials: 'GU',
  },
  [SUPER_ADMIN]: {
    name: 'Super-admin (mock)',
    email: 'dev@local',
    role: 'Sem restrição — só para demonstração',
    papeis: [ADMIN_HOLDING],
    unidades: [],
    tudo: true,
    initials: 'SA',
  },
}

function lerPerfilDev(): PerfilDev {
  if (typeof window === 'undefined') return SUPER_ADMIN
  const salvo = window.localStorage.getItem(CHAVE_PERFIL_DEV)
  return (OPCOES_PERFIL_DEV as string[]).includes(salvo ?? '') ? (salvo as PerfilDev) : SUPER_ADMIN
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [perfilDev, setPerfilDev] = useState<PerfilDev>(lerPerfilDev)
  const [user, setUser] = useState<User | null>(SKIP_AUTH ? MOCKS[perfilDev] : null)
  const [status, setStatus] = useState<AuthStatus>(SKIP_AUTH ? 'authenticated' : 'loading')
  const queryClient = useQueryClient()

  // O cabeçalho de dev precisa refletir o mock ATUAL logo na primeira
  // renderização — sem isto, a primeiríssima leva de chamadas (a tela que
  // abre com o app) sai sem `X-Usuario-Dev` e autentica como o padrão do
  // backend, não como o mock escolhido na sessão anterior (persistido em
  // `localStorage`).
  useEffect(() => {
    if (SKIP_AUTH) definirLoginDeDev(MOCKS[perfilDev].email)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /**
   * Troca de mock — dropdown, e não mais ciclo: com 9 opções, "próximo" obrigaria
   * passar pelas 8 anteriores para chegar à que se quer demonstrar.
   *
   * `queryClient.clear()` é o que faltava para a troca valer NA HORA: as
   * chaves de `useRegionais`/`useUnidades`/`useUnidade`
   * (`lib/organizacaoApi.ts`) não carregam QUEM pediu, só O QUÊ — então
   * trocar de identidade sem limpar o cache deixava a tela mostrar a
   * REGIONAL do perfil anterior (até 5 minutos de `staleTime`) misturada
   * com a UNIDADE do perfil novo, buscada na hora por ter uma chave
   * diferente. Foi exatamente o sintoma visto na demo: "R4" sobrando de um
   * perfil anterior, "nenhuma unidade" correto do perfil atual — duas
   * verdades de dois perfis diferentes, na mesma tela.
   */
  const definirPerfilDev = useCallback(
    (proximo: PerfilDev) => {
      window.localStorage.setItem(CHAVE_PERFIL_DEV, proximo)
      definirLoginDeDev(MOCKS[proximo].email)
      queryClient.clear()
      setUser(MOCKS[proximo])
      setPerfilDev(proximo)
    },
    [queryClient],
  )

  // Ao montar: verifica se já existe uma sessão válida (cookie httpOnly).
  useEffect(() => {
    if (SKIP_AUTH) return
    let cancelled = false
    ;(async () => {
      try {
        const data = await api.get<BackendProfile>('/api/users/profile')
        if (!cancelled) {
          setUser(mapUser(data))
          setStatus('authenticated')
        }
      } catch (err) {
        // 401 é esperado para quem ainda não logou.
        if (!(err instanceof ApiError) || err.status !== 401) {
          console.error('[auth] Falha ao verificar sessão:', err)
        }
        if (!cancelled) {
          setUser(null)
          setStatus('unauthenticated')
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const login = useCallback(() => {
    // Redirect de página inteira para o backend. Ele leva ao Entra ID e,
    // após o callback, volta autenticado para /home (com o cookie setado).
    const base = import.meta.env.VITE_API_URL ?? ''
    window.location.assign(`${base}/auth/login`)
  }, [])

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout')
    } catch (err) {
      console.error('[auth] Erro no logout:', err)
    } finally {
      setUser(null)
      setStatus('unauthenticated')
    }
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      status,
      isAuthenticated: status === 'authenticated',
      login,
      logout,
      isMockAuth: SKIP_AUTH,
      perfilDev: SKIP_AUTH ? perfilDev : null,
      opcoesPerfilDev: OPCOES_PERFIL_DEV,
      rotuloPerfilDev: ROTULO_PERFIL_DEV,
      definirPerfilDev,
    }),
    [user, status, login, logout, perfilDev, definirPerfilDev],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth deve ser usado dentro de <AuthProvider>')
  return ctx
}
