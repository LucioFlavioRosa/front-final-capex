import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

/**
 * Mede o item marcado `data-indicador="1"` dentro do contêiner e devolve a
 * posição/largura para desenhar uma barra que ESCORREGA até ele, em vez de
 * cortar para o lugar novo.
 *
 * Extraído do cabeçalho ("Trilho"), que foi o único lugar do app a resolver
 * isto — `TabBar`, `SegmentedControl`, `QuadroGrafico` e o stepper do
 * `CadastroWizard` tinham a mesma necessidade e cada um trocava de aba com um
 * corte seco (achado 1.7 da revisão de UX).
 *
 * Mede no LAYOUT (`useLayoutEffect`), não no efeito comum: a medida acontece
 * antes da pintura — senão o indicador nasce em x=0 no primeiro quadro e
 * salta para o lugar certo no segundo, que é exatamente o corte que ele
 * existe para eliminar.
 *
 * `chave` é o que muda quando o item ativo muda (o value selecionado, o
 * índice da aba…) — é a dependência que dispara a remedida.
 *
 * O `ResizeObserver` cobre os dois casos em que a medida envelhece sem que
 * `chave` mude: o contêiner reflowa (janela encolhe, colunas mudam de
 * largura) e a fonte carrega depois da primeira pintura (o texto muda de
 * largura).
 */
export function useIndicador<E extends HTMLElement = HTMLElement>(chave: string) {
  const containerRef = useRef<E>(null)
  const [estilo, setEstilo] = useState<{ left: number; width: number } | null>(null)

  const medir = useCallback(() => {
    const container = containerRef.current
    if (!container) return
    const el = container.querySelector<HTMLElement>('[data-indicador="1"]')
    if (!el) return setEstilo(null)
    setEstilo({ left: el.offsetLeft, width: el.offsetWidth })
  }, [])

  useLayoutEffect(medir, [medir, chave])

  useEffect(() => {
    const container = containerRef.current
    // `ResizeObserver` não existe em todo ambiente (jsdom, browsers antigos).
    // Sem ele o indicador ainda mede certo no primeiro layout — só não
    // reage a reflow depois disso, o que é degradação aceitável e não deve
    // derrubar um hook usado por quatro componentes de base.
    if (!container || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(medir)
    ro.observe(container)
    return () => ro.disconnect()
  }, [medir])

  return { containerRef, estilo }
}
