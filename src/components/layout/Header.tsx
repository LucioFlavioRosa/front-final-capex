import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { MapPin, SignOut, MagnifyingGlass, ArrowsClockwise, CaretDown } from '@phosphor-icons/react'
import { navItemsVisiveis } from '../../config/navigation'
import { useAuth } from '../../auth/AuthContext'
import { useContextoTrilho } from './ContextoCabecalho'

/**
 * CABEÇALHO "TRILHO" — direção A do estudo de redesign (11/08/2026).
 *
 * O que mudou e por quê, porque as três coisas foram pedidas juntas:
 *
 *   MENOS INFORMAÇÃO. Saíram o rótulo "SES / Sequenciamento de obras" (a marca
 *     já diz de quem é o produto, e a aba do navegador diz o resto) e o
 *     nome+cargo por extenso ao lado do avatar (viraram `title` do avatar, que
 *     é onde se procura por isso). O que sobrou é o que muda a leitura do que
 *     está embaixo: marca, módulo, unidade em operação, busca, sessão.
 *
 *   ACABAMENTO. A barra ganhou 1px de luz no topo e 1px de sombra embaixo
 *     (`shadow-trilho`, inline abaixo): sem isso ela é um retângulo de cor
 *     chapada, que é o que fazia o protótipo parecer "cru".
 *
 *   MOVIMENTO. O indicador da aba ativa DESLIZA entre os itens em vez de
 *     aparecer cortado no lugar novo — ver `useIndicador`. As durações e a
 *     curva vêm dos tokens de `tailwind.config.js` (duration-hover,
 *     ease-saida), não de números soltos.
 *
 * O tema é CLARO e continua claro: o redesign dark não passou na Aegea
 * (11/08/2026). Não reintroduzir `#070B2E` nem as fontes do protótipo dark.
 */

/**
 * O TRILHO propriamente dito: mede o item ativo e escorrega a barrinha até ele.
 *
 * Mede no layout (`useLayoutEffect`) e não no efeito comum porque a medida
 * acontece antes da pintura — senão o indicador aparece em x=0 no primeiro
 * quadro e salta para o lugar certo no segundo, que é exatamente o corte seco
 * que ele existe para eliminar.
 *
 * O `ResizeObserver` cobre os dois casos em que a medida envelhece sem que a
 * rota mude: a janela encolhe (os itens reflowam) e a fonte carrega depois da
 * primeira pintura (o texto muda de largura).
 */
function useIndicador(ativo: string) {
  const navRef = useRef<HTMLElement>(null)
  const [estilo, setEstilo] = useState<{ left: number; width: number } | null>(null)

  const medir = useCallback(() => {
    const nav = navRef.current
    if (!nav) return
    const el = nav.querySelector<HTMLElement>('[data-ativo="1"]')
    if (!el) return setEstilo(null)
    setEstilo({ left: el.offsetLeft, width: el.offsetWidth })
  }, [])

  useLayoutEffect(medir, [medir, ativo])

  useEffect(() => {
    const nav = navRef.current
    if (!nav) return
    const ro = new ResizeObserver(medir)
    ro.observe(nav)
    return () => ro.disconnect()
  }, [medir])

  return { navRef, estilo }
}

/** Classes do chip — compartilhadas pelas duas formas, estática e clicável. */
const CHIP_BASE =
  'hidden flex-none items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 lg:flex'

/**
 * O chip de contexto, nas suas duas formas.
 *
 * Estático quando ninguém declarou contexto (é o caso do Cadastro, que mantém
 * exatamente o `<span>` de antes). Botão quando a tela declarou um `aoClicar` —
 * unidades não se comparam entre si, mas rodadas sim, e trocar de rodada é a
 * operação mais frequente de quem lê resultado.
 */
function ChipContexto() {
  const contexto = useContextoTrilho()
  const rotulo = contexto?.rotulo ?? 'Águas do Rio · Bloco 2'

  const conteudo = (
    <>
      <MapPin weight="fill" className="text-[13px] text-aegea-400" />
      <span className="font-mono text-[11.5px] font-medium text-header-text/90">{rotulo}</span>
    </>
  )

  if (!contexto?.aoClicar) {
    return <span className={`${CHIP_BASE} border-white/20 bg-white/10`}>{conteudo}</span>
  }

  return (
    <button
      type="button"
      onClick={contexto.aoClicar}
      title={contexto.descricao ?? 'Trocar de rodada'}
      aria-label={contexto.descricao ?? `Rodada ${rotulo}. Trocar de rodada`}
      className={`${CHIP_BASE} border-white/40 bg-white/10 transition-[background-color,border-color] duration-hover ease-saida hover:border-white/60 hover:bg-white/20`}
    >
      {conteudo}
      <CaretDown weight="bold" className="text-[10px] text-header-text/70" />
    </button>
  )
}

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  [
    'relative flex items-center rounded-t-md px-3.5 text-[13px] font-semibold',
    'transition-colors duration-hover ease-saida',
    isActive ? 'text-header-text' : 'text-header-text/70 hover:bg-white/10 hover:text-header-text',
  ].join(' ')

interface HeaderProps {
  onOpenCmd: () => void
}

export function Header({ onOpenCmd }: HeaderProps) {
  const { user, logout, isMockAuth, perfilDev, opcoesPerfilDev, rotuloPerfilDev, definirPerfilDev } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { navRef, estilo } = useIndicador(pathname)

  // N4: cada papel vê só os módulos que a matriz de perfis libera para ele —
  // ver `config/navigation.ts:navItemsVisiveis`. `gerenciador_usuarios` fica
  // com lista vazia até o módulo de Usuários existir (N6); a rota `*`
  // (`router.tsx`) já lida com "nenhum item visível".
  const itensVisiveis = navItemsVisiveis(user?.papeis ?? [])

  // Com um módulo só, a barrinha sublinharia o único item possível —
  // decoração que não informa nada.
  const mostrarIndicador = itensVisiveis.length > 1

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <header
      className="sticky top-0 z-30 bg-header"
      // Luz no topo e sombra na base, as duas por dentro: é o que faz a faixa
      // ler como um objeto apoiado sobre a página em vez de um preenchimento.
      style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,.14), inset 0 -1px 0 rgba(0,0,0,.22)' }}
    >
      <div className="max-w-content mx-auto flex h-14 items-center gap-4 px-4 md:px-6">
        {/* A marca aponta para /cadastro enquanto a Home está desligada —
            ver o comentário do `router.tsx`. */}
        <NavLink to="/cadastro" className="flex flex-none items-center">
          <img src="/assets/aegea-logo-azul.png" alt="aegea" className="h-7 flex-none brightness-0 invert" />
        </NavLink>

        <span className="hidden h-5 w-px flex-none bg-white/20 sm:block" />

        {/* Navegação principal. Sem link "Início": a Home está fora do ar. */}
        <nav
          ref={navRef}
          className="relative flex h-14 flex-none items-stretch gap-0.5"
          aria-label="Navegação principal"
        >
          {itensVisiveis.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={navLinkClass}
              data-ativo={pathname.startsWith(item.path) ? '1' : undefined}
            >
              {item.label}
            </NavLink>
          ))}
          {mostrarIndicador && estilo && (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute bottom-0 h-0.5 rounded-t-sm bg-aegea-400 transition-[transform,width] duration-mover ease-saida"
              style={{ width: estilo.width, transform: `translateX(${estilo.left}px)` }}
            />
          )}
        </nav>

        <span className="flex-1" />

        {/* Contexto operacional — o único dado do cabeçalho que muda a leitura
            da tela inteira: todo número abaixo se refere a este recorte.

            No cadastro o recorte é a unidade, e o texto é o de sempre. Nas
            telas de rodada ele é a RODADA, e o chip vira botão de troca — ver
            `ContextoCabecalho`. Sem provider, `contexto` é null e nada muda. */}
        <ChipContexto />


        {/* PARA A APRESENTAÇÃO DE 18/08/2026: dropdown com os 8 perfis do
            documento + "Super-admin" (sem restrição nenhuma) — escolha
            direta, sem precisar clicar N vezes até chegar no perfil que se
            quer mostrar. `<select>` nativo de propósito: é o controle mais
            confiável para uma demo ao vivo. */}
        {isMockAuth && perfilDev && (
          <label
            title="Só em dev (VITE_SKIP_AUTH) — troca o mock de perfil sem precisar de backend"
            className="flex flex-none items-center gap-1.5 rounded-lg border border-dashed border-amber-300/70 bg-amber-400/10 px-2.5 py-1 text-[11px] font-semibold text-amber-100"
          >
            <ArrowsClockwise className="text-[13px]" />
            <span className="sr-only">Perfil de demonstração</span>
            <select
              value={perfilDev}
              onChange={(e) => definirPerfilDev(e.target.value as typeof perfilDev)}
              className="cursor-pointer border-none bg-transparent text-[11px] font-semibold text-amber-100 outline-none [color-scheme:dark]"
            >
              {opcoesPerfilDev.map((p) => (
                <option key={p} value={p} className="text-ink-900">
                  {rotuloPerfilDev[p]}
                </option>
              ))}
            </select>
          </label>
        )}

        <button
          type="button"
          onClick={onOpenCmd}
          title="Buscar (⌘K)"
          aria-label="Buscar"
          className="flex flex-none items-center gap-2 rounded-lg border border-white/20 bg-white/10 py-1.5 pl-2.5 pr-2 text-header-text/80 transition-[background-color,border-color,transform] duration-hover ease-saida hover:border-white/40 hover:bg-white/15 hover:text-header-text active:scale-[.97] active:duration-press"
        >
          <MagnifyingGlass className="text-[15px]" />
          <span className="font-mono text-[11px]">⌘K</span>
        </button>

        <div className="flex flex-none items-center gap-2 border-l border-white/20 pl-3">
          {/* Nome e cargo saíram da barra e vivem aqui: quem precisa conferir
              com que conta está logado passa o mouse; quem não precisa ganha o
              espaço de volta. */}
          <span
            title={user ? `${user.name}${user.role ? ` · ${user.role}` : ''}` : 'Visitante'}
            className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-gradient-to-br from-aegea-400 to-aegea-600 text-[11px] font-bold text-water-950 ring-1 ring-white/25"
          >
            {user?.initials ?? '—'}
          </span>
          <button
            type="button"
            onClick={handleLogout}
            title="Sair"
            aria-label="Sair"
            className="rounded-lg p-1.5 text-header-text/70 transition-[background-color,color,transform] duration-hover ease-saida hover:bg-white/15 hover:text-header-text active:scale-[.94] active:duration-press"
          >
            <SignOut className="text-[17px]" />
          </button>
        </div>
      </div>
    </header>
  )
}
