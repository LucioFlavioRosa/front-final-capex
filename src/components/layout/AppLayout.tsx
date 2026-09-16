import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Outlet, useLocation, useNavigationType } from 'react-router-dom'
import { Header } from './Header'
import { Footer } from './Footer'
import { CommandPalette } from '../ui/CommandPalette'
import { useMapaAberto } from '@/rodada/layout/abaResultado'
import { useTemaResultadosNoDocumento } from '@/rodada/mapa/temaResultados'

/**
 * Posição de scroll por rota, para o `POP` (voltar) restaurar em vez de
 * zerar. Módulo, e não estado do componente: o `AppLayout` não desmonta entre
 * navegações, mas guardar aqui deixa a intenção explícita — é memória de
 * ROTA, não de render.
 */
const posicoesDeScroll = new Map<string, number>()

export function AppLayout() {
  const { pathname } = useLocation()
  const tipoDeNavegacao = useNavigationType() // 'PUSH' | 'POP' | 'REPLACE'
  const [cmdOpen, setCmdOpen] = useState(false)

  /**
   * O TEMA DA ABA "MAPEAMENTO POR CIDADE" VESTE O DOCUMENTO INTEIRO enquanto
   * ela está aberta — Header e Footer inclusive (pedido de 09/09/2026). Mora
   * aqui, e não em `Global.tsx` ou `PainelMapeamento.tsx`, porque este é o
   * único ancestral comum aos três: ver `useTemaResultadosNoDocumento`.
   */
  useTemaResultadosNoDocumento(useMapaAberto())

  // Guarda a posição da rota que está SAINDO, antes da troca.
  useEffect(() => {
    return () => {
      posicoesDeScroll.set(pathname, window.scrollY)
    }
  }, [pathname])

  /**
   * `POP` (o botão Voltar, ou navegar de volta pelo Trilho) restaura a
   * posição de onde a pessoa saiu — sem isso, quem está no 40º sistema do
   * drill-down volta ao topo da lista e procura de novo. Qualquer outra
   * navegação de ROTA zera.
   *
   * "Navegação de rota" é a condição que se perdeu na absorção do front do
   * github (04/09/2026) e voltou em 05/09/2026: o efeito disparava em
   * QUALQUER navegação — inclusive uma troca só de QUERY STRING na mesma
   * página, porque `useNavigationType()` também muda de valor quando
   * `setSearchParams` empurra ou substitui uma entrada no histórico sem
   * tocar no `pathname`. O cartão de cidade em `rodada/mapa/` (a aba
   * "Mapeamento por Cidade") faz exatamente isso a cada clique — abrir uma
   * cidade, trocar o dado mostrado, fixar uma comparação — e cada um desses
   * gestos jogava a rolagem pro topo, obrigando quem estava lendo o mapa lá
   * embaixo a descer a página de novo. `pathname` é o que de fato importa
   * aqui: só ele diz que a pessoa foi para OUTRA TELA. Uma `ref` guarda o
   * último pathname visto, e o efeito sai cedo quando ele não mudou —
   * `tipoDeNavegacao` continua no array de dependências (é ele quem decide
   * ENTRE topo e posição salva quando a rota muda de verdade), só não basta
   * mais sozinho para justificar rolar a página.
   *
   * `instant`, nunca `smooth`: a viagem do scroll numa TROCA DE ROTA não
   * informa nada — a página de destino é outra — e corria por cima do
   * `animate-fade-in` de entrada dela. `smooth` continua certo para âncora
   * dentro da mesma página, que é para onde `html { scroll-behavior: smooth }`
   * (`index.css`) foi escrito.
   */
  const ultimoPathname = useRef(pathname)
  useLayoutEffect(() => {
    if (pathname === ultimoPathname.current) return
    ultimoPathname.current = pathname
    const alvo = tipoDeNavegacao === 'POP' ? (posicoesDeScroll.get(pathname) ?? 0) : 0
    window.scrollTo({ top: alvo, behavior: 'instant' })
  }, [pathname, tipoDeNavegacao])

  // ⌘K / Ctrl+K abre a busca rápida.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setCmdOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="min-h-screen flex flex-col">
      <a
        href="#main-content"
        /* `water-700` e não `aegea-600`: o branco sobre o verde-água dava 3,9:1, abaixo
           do mínimo de 4,5:1 — e este é o PRIMEIRO alvo de quem navega por teclado,
           o último lugar onde o contraste pode falhar. O azul da marca dá folga. */
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 z-50 bg-water-700 text-white px-4 py-2 rounded"
      >
        Pular para o conteúdo
      </a>
      <Header onOpenCmd={() => setCmdOpen(true)} />
      {/*
        SEM `animate-fade-in` aqui, e SEM `key={pathname}` para forçar um
        remount que a produziria: este `<main>` nunca desmonta entre rotas —
        é por isso que a classe, sozinha, tocava uma vez na carga do app e
        nunca mais (achado 1.10 da revisão de UX). `key={pathname}` pareceria
        a correção óbvia, mas quebraria a `CascaResultado` (`/resultados/*`):
        ela é a casca que PRECISA sobreviver à navegação entre níveis — se
        ela desmontar a cada troca de `runId`/cidade/sistema, a árvore de
        escopo perde o estado de expansão a cada clique, que é exatamente o
        que o comentário dela promete não acontecer.

        O fade real acontece no ROOT de cada página (`Global`, `Cidade`,
        `Sistema`, `SubBacia`, `Elemento`, `Historico`, `Simular`) — esses
        SIM remontam a cada troca de rota, porque são componentes distintos
        entrando no `<Outlet />`, e a classe deles já faz o trabalho certo.
      */}
      <main id="main-content" tabIndex={-1} className="flex-1 w-full">
        <Outlet />
      </main>
      <Footer />
      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} />
    </div>
  )
}
