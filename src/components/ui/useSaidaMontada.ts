import { useEffect, useState } from 'react'

/**
 * Mantém um overlay montado durante a animação de SAÍDA.
 *
 * `open` cai para `false` no instante do clique — mas a caixa precisa ficar
 * no DOM pelos `duracaoMs` da transição de saída, senão ela some no mesmo
 * quadro em que a intenção de fechar foi registrada (o corte seco do item
 * "nada tem saída animada" da revisão de UX). Compartilhado por `Modal`,
 * `CommandPalette` e `PainelDicionario` — os três tinham essa mesma lacuna.
 *
 * `fechando` diz qual classe de animação aplicar (`*-out` em vez de `*-in`);
 * `montado` diz se o componente deve renderizar alguma coisa.
 */
export function useSaidaMontada(open: boolean, duracaoMs = 160) {
  const [montado, setMontado] = useState(open)
  const [fechando, setFechando] = useState(false)

  useEffect(() => {
    if (open) {
      setMontado(true)
      setFechando(false)
      return
    }
    if (!montado) return
    setFechando(true)
    const id = setTimeout(() => {
      setMontado(false)
      setFechando(false)
    }, duracaoMs)
    return () => clearTimeout(id)
  }, [open, duracaoMs, montado])

  return { montado, fechando }
}
