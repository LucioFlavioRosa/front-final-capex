import { useLayoutEffect, useSyncExternalStore } from 'react'

/**
 * O TEMA DA ABA "MAPEAMENTO POR CIDADE" — E DA TELA INTEIRA QUANDO ELA ESTÁ ABERTA.
 *
 * Não é o tema do app: fora desta aba o app continua claro, de propósito — a
 * Aegea já recusou um redesign escuro do site inteiro (11/08/2026). O que
 * existe aqui é uma preferência escopada a uma aba, mas que — por pedido
 * explícito de 09/09/2026 — veste a TELA INTEIRA enquanto essa aba está
 * aberta, Header e Footer inclusive: ver `useTemaResultadosNoDocumento`
 * abaixo, e o comentário em `Header.tsx` sobre o botão.
 *
 * `useSyncExternalStore` em vez de Context: o botão que troca o tema mora no
 * `Header`, que fica FORA do `<Outlet />` — não há um ancestral comum entre
 * ele e a página de resultados além do `AppLayout`, e criar um Provider lá
 * significaria abrir mão do resto do app para uma preferência de uma aba só.
 * Um armazenamento externo do próprio módulo não pede isso: os dois lados
 * importam a mesma função.
 */

const CHAVE = 'rr-tema'

export type TemaResultados = 'escuro' | 'claro'

function ler(): TemaResultados {
  if (typeof window === 'undefined') return 'escuro'
  // try/catch pelo mesmo motivo de `AbaGrid`: `localStorage` lança em janela
  // privada de alguns navegadores — e no Node 22+ o global existe sem métodos,
  // o que derrubava a suíte inteira que importa este módulo. Sem preferência
  // guardada, vale o padrão.
  try {
    const v = window.localStorage.getItem(CHAVE)
    return v === 'claro' ? 'claro' : 'escuro'
  } catch {
    return 'escuro'
  }
}

// `escuro` é o padrão de propósito: é a proposta que se pediu para aplicar
// primeiro, e quem abre a tela pela primeira vez deve ver o que foi
// desenhado — não uma preferência vazia que por acaso caiu em claro.
let tema: TemaResultados = ler()
const ouvintes = new Set<() => void>()

function notificar() {
  for (const f of ouvintes) f()
}

export function alternarTemaResultados() {
  tema = tema === 'escuro' ? 'claro' : 'escuro'
  try {
    window.localStorage.setItem(CHAVE, tema)
  } catch {
    /* a preferência não persiste, e só */
  }
  notificar()
}

function inscrever(cb: () => void) {
  ouvintes.add(cb)
  return () => ouvintes.delete(cb)
}

function obter() {
  return tema
}

/** O tema atual, e reage sozinho quando o botão do `Header` o troca. */
export function useTemaResultados(): TemaResultados {
  return useSyncExternalStore(inscrever, obter, obter)
}

/**
 * VESTE O `<html>` COM O TEMA, ENQUANTO A ABA DO MAPA ESTIVER ABERTA — e só
 * enquanto isso. Chamado UMA VEZ, em `AppLayout` (o único ancestral comum a
 * `Header`, `Footer` e ao conteúdo), com `ativo = useMapaAberto()`.
 *
 * `document.documentElement`, e não o `<section>` da página: Header e Footer
 * são IRMÃOS do `<main>` em `AppLayout`, não descendentes — nenhuma classe
 * posta na página os alcança. Subir para o documento é o único jeito de
 * vestir os três com o mesmo tema.
 *
 * `useLayoutEffect`, nunca `useEffect`: a troca de classe tem de acontecer
 * antes do navegador pintar, senão a tela pisca clara por um quadro toda vez
 * que a aba abre.
 *
 * A LIMPEZA NO `return` NÃO É OPCIONAL. Sem ela, sair da aba do mapa para
 * qualquer outra tela (Cadastro, Simular, as outras abas de Resultados) leva
 * o Header escuro de carona — a classe fica no `<html>` porque nada a tirou.
 * `ativo` e `tema` nas dependências: ao alternar claro/escuro sem sair da
 * aba, a classe antiga tem de sair antes da nova entrar (é o que o `return`
 * do efeito anterior garante, mesmo o componente continuando montado).
 */
export function useTemaResultadosNoDocumento(ativo: boolean) {
  const tema = useTemaResultados()
  useLayoutEffect(() => {
    if (!ativo) return
    const raiz = document.documentElement
    raiz.classList.add('rr-tela', tema === 'escuro' ? 'rr-noturno' : 'rr-claro')
    return () => raiz.classList.remove('rr-tela', 'rr-noturno', 'rr-claro')
  }, [ativo, tema])
}
