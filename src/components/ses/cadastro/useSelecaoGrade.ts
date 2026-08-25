/**
 * Seleção de células estilo planilha — substitui a "replicação em massa" por
 * modal (item 19, descartada em revisão: a Aegea quer o comportamento do Excel,
 * não um formulário).
 *
 * O modelo é o de planilha, com dois modos por célula:
 *
 *   NAVEGAÇÃO (padrão) — as setas andam de célula em célula. Shift+seta estende
 *     a seleção; Ctrl+Shift+seta estende até a borda. Digitar um caractere
 *     começa a editar substituindo o conteúdo, como no Excel.
 *   EDIÇÃO — as setas voltam a mover o cursor DENTRO do texto. Entra com
 *     duplo-clique, F2 ou Enter; sai com Enter (desce), Tab (anda) ou Esc.
 *
 * Sem os dois modos, Shift+seta seria ambíguo: dentro de um <input> ele já
 * significa "selecionar texto". É por isso que a navegação precisa ser um modo
 * próprio, e não um atalho adicional.
 *
 * Estado guardado: `ancora` (onde a seleção começou) e `foco` (onde está agora).
 * O retângulo selecionado é derivado dos dois — não é uma lista de células, para
 * não crescer com o tamanho da seleção.
 */

import { useCallback, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react'

export interface Celula {
  ri: number
  ci: number
}

/** Retângulo normalizado (r0 ≤ r1, c0 ≤ c1) — a seleção sempre vira um destes. */
export interface Intervalo {
  r0: number
  r1: number
  c0: number
  c1: number
}

export interface Edicao {
  ri: number
  ci: number
  value: string
}

interface Args {
  totalLinhas: number
  totalColunas: number
  /** A célula aceita escrita? (origem 'un', mais as exceções que dependem da linha) */
  podeEditar: (ri: number, ci: number) => boolean
  /** Valor atual — usado para montar o TSV do copiar. */
  valorDe: (ri: number, ci: number) => string
  /** Aplica todas as edições de uma vez (um só dispatch, um só re-render). */
  onAplicar: (edicoes: Edicao[]) => void
}

const intervaloDe = (a: Celula, f: Celula): Intervalo => ({
  r0: Math.min(a.ri, f.ri),
  r1: Math.max(a.ri, f.ri),
  c0: Math.min(a.ci, f.ci),
  c1: Math.max(a.ci, f.ci),
})

/** Caracteres que começam uma edição ao serem digitados sobre a célula. */
function ehDigitavel(e: KeyboardEvent): boolean {
  return e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey
}

export function useSelecaoGrade({
  totalLinhas, totalColunas, podeEditar, valorDe, onAplicar,
}: Args) {
  const [ancora, setAncora] = useState<Celula | null>(null)
  const [foco, setFoco] = useState<Celula | null>(null)
  const [editando, setEditando] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)
  /** true enquanto o botão do mouse está pressionado — habilita arrastar para estender. */
  const arrastando = useRef(false)

  const intervalo = useMemo<Intervalo | null>(
    () => (ancora && foco ? intervaloDe(ancora, foco) : null),
    [ancora, foco],
  )

  /**
   * Devolve o foco do DOM para a célula certa depois de navegar.
   *
   * A ORDEM DE PREFERÊNCIA É O PONTO (11/08/2026). Antes daqui só existia a
   * primeira opção — `input`/`select` dentro da célula — porque TODA célula
   * tinha um `<input>`, mesmo as travadas. Agora a célula fora de edição é
   * texto, e é o próprio `<td>` (com `tabIndex={-1}`) que recebe o foco.
   *
   * Isso não é detalhe de aparência: é o que mantém teclado e área de
   * transferência funcionando. `onKeyDown`, `onCopy` e `onPaste` vivem no
   * container e só recebem o evento porque ele BORBULHA do elemento focado. Sem
   * nada focado, a grade ficaria muda — setas não andariam e Ctrl+V não colaria.
   */
  const focarNoDom = useCallback((c: Celula) => {
    // rAF: espera o React pintar a linha nova antes de procurar a célula dela
    requestAnimationFrame(() => {
      const celula = containerRef.current?.querySelector<HTMLElement>(`[data-celula="${c.ri}-${c.ci}"]`)
      const campo = celula?.querySelector<HTMLElement>('input, select')
      // Só foco, sem `select()`: marcar o texto em azul faria a célula em
      // navegação parecer que já está em edição. Substituir ao digitar não
      // depende disso — quem faz é o `onKeyDown` daqui.
      ;(campo ?? celula)?.focus({ preventScroll: false })
    })
  }, [])

  const irPara = useCallback((c: Celula, estender: boolean) => {
    const destino: Celula = {
      ri: Math.max(0, Math.min(totalLinhas - 1, c.ri)),
      ci: Math.max(0, Math.min(totalColunas - 1, c.ci)),
    }
    setFoco(destino)
    if (!estender) setAncora(destino)
    setEditando(false)
    focarNoDom(destino)
  }, [totalLinhas, totalColunas, focarNoDom])

  /** Clique numa célula: seleciona (ou estende, com Shift). */
  const selecionarCelula = useCallback((ri: number, ci: number, estender = false) => {
    const destino = { ri, ci }
    setFoco(destino)
    if (!estender) setAncora(destino)
    setEditando(false)
  }, [])

  const iniciarEdicao = useCallback((ri: number, ci: number) => {
    setAncora({ ri, ci })
    setFoco({ ri, ci })
    setEditando(true)
  }, [])

  // ------------------------------------------------------------------ teclado
  const onKeyDown = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
    if (!foco) return

    // Em modo de edição o input manda: só interceptamos as teclas de saída.
    if (editando) {
      if (e.key === 'Escape') {
        e.preventDefault()
        setEditando(false)
        focarNoDom(foco)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        irPara({ ri: foco.ri + 1, ci: foco.ci }, false)
      } else if (e.key === 'Tab') {
        e.preventDefault()
        irPara({ ri: foco.ri, ci: foco.ci + (e.shiftKey ? -1 : 1) }, false)
      }
      return
    }

    const estender = e.shiftKey
    const aoExtremo = e.ctrlKey || e.metaKey

    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault()
        irPara({ ri: aoExtremo ? 0 : foco.ri - 1, ci: foco.ci }, estender)
        return
      case 'ArrowDown':
        e.preventDefault()
        irPara({ ri: aoExtremo ? totalLinhas - 1 : foco.ri + 1, ci: foco.ci }, estender)
        return
      case 'ArrowLeft':
        e.preventDefault()
        irPara({ ri: foco.ri, ci: aoExtremo ? 0 : foco.ci - 1 }, estender)
        return
      case 'ArrowRight':
        e.preventDefault()
        irPara({ ri: foco.ri, ci: aoExtremo ? totalColunas - 1 : foco.ci + 1 }, estender)
        return
      case 'Tab':
        e.preventDefault()
        irPara({ ri: foco.ri, ci: foco.ci + (e.shiftKey ? -1 : 1) }, false)
        return
      case 'Home':
        e.preventDefault()
        irPara({ ri: aoExtremo ? 0 : foco.ri, ci: 0 }, estender)
        return
      case 'End':
        e.preventDefault()
        irPara({ ri: aoExtremo ? totalLinhas - 1 : foco.ri, ci: totalColunas - 1 }, estender)
        return
      case 'F2':
      case 'Enter':
        e.preventDefault()
        if (podeEditar(foco.ri, foco.ci)) setEditando(true)
        return
      case 'Escape':
        e.preventDefault()
        setAncora(foco)
        return
    }

    // Digitar sobre a célula: começa a editar substituindo o conteúdo (Excel).
    if (ehDigitavel(e) && podeEditar(foco.ri, foco.ci)) {
      e.preventDefault()
      onAplicar([{ ri: foco.ri, ci: foco.ci, value: e.key }])
      setEditando(true)
    }
  }, [foco, editando, totalLinhas, totalColunas, podeEditar, onAplicar, irPara, focarNoDom])

  // ------------------------------------------------------------ copiar / colar
  /**
   * Usa os eventos `copy`/`paste` do navegador em vez da Clipboard API
   * assíncrona: aqui o `clipboardData` vem pronto, sem pedir permissão, e a
   * área de transferência é a do sistema — dá para colar direto do Excel.
   */
  const onCopy = useCallback((e: ClipboardEvent<HTMLDivElement>) => {
    if (!intervalo) return
    // Editando com trecho de texto marcado: é um copiar de texto comum, deixa passar.
    const alvo = e.target as HTMLElement
    if (editando && alvo instanceof HTMLInputElement && alvo.selectionStart !== alvo.selectionEnd) return

    e.preventDefault()
    const linhas: string[] = []
    for (let ri = intervalo.r0; ri <= intervalo.r1; ri++) {
      const cols: string[] = []
      for (let ci = intervalo.c0; ci <= intervalo.c1; ci++) cols.push(valorDe(ri, ci))
      linhas.push(cols.join('\t'))
    }
    e.clipboardData.setData('text/plain', linhas.join('\n'))
  }, [intervalo, editando, valorDe])

  const onPaste = useCallback((e: ClipboardEvent<HTMLDivElement>) => {
    if (!intervalo || !foco) return
    const alvo = e.target as HTMLElement
    if (editando && alvo instanceof HTMLInputElement && alvo.selectionStart !== alvo.selectionEnd) return

    const texto = e.clipboardData.getData('text/plain')
    if (!texto) return
    e.preventDefault()

    const bloco = texto.replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n').map((l) => l.split('\t'))
    const umValorSo = bloco.length === 1 && bloco[0].length === 1
    const edicoes: Edicao[] = []

    if (umValorSo) {
      // Um valor para todas as células selecionadas — o caso de uso que motivou
      // o pedido: preencher o mesmo preço em várias sub-bacias de uma vez.
      const valor = bloco[0][0]
      for (let ri = intervalo.r0; ri <= intervalo.r1; ri++) {
        for (let ci = intervalo.c0; ci <= intervalo.c1; ci++) {
          if (podeEditar(ri, ci)) edicoes.push({ ri, ci, value: valor })
        }
      }
    } else {
      // Bloco (veio de outra faixa ou do Excel): ancora no canto superior
      // esquerdo da seleção e vai até onde couber na grade.
      for (let dr = 0; dr < bloco.length; dr++) {
        for (let dc = 0; dc < bloco[dr].length; dc++) {
          const ri = intervalo.r0 + dr
          const ci = intervalo.c0 + dc
          if (ri >= totalLinhas || ci >= totalColunas) continue
          if (podeEditar(ri, ci)) edicoes.push({ ri, ci, value: bloco[dr][dc] })
        }
      }
    }

    if (edicoes.length) onAplicar(edicoes)
    return edicoes.length
  }, [intervalo, foco, editando, podeEditar, totalLinhas, totalColunas, onAplicar])

  // -------------------------------------------------------------------- mouse
  const aoPressionarCelula = useCallback((ri: number, ci: number, shift: boolean) => {
    // Clique DENTRO da célula que já está em edição: deixa o clique fazer o que
    // ele faz num campo de texto (posicionar o cursor). Sem esta guarda,
    // reposicionar o cursor no meio de um valor cancelaria a edição.
    if (editando && foco?.ri === ri && foco?.ci === ci) return
    arrastando.current = true
    selecionarCelula(ri, ci, shift)
  }, [editando, foco, selecionarCelula])

  const aoEntrarNaCelula = useCallback((ri: number, ci: number) => {
    if (!arrastando.current || editando) return
    setFoco({ ri, ci })
  }, [editando])

  const aoSoltarMouse = useCallback(() => {
    arrastando.current = false
  }, [])

  return {
    containerRef,
    foco,
    editando,
    intervalo,
    onKeyDown,
    onCopy,
    onPaste,
    selecionarCelula,
    iniciarEdicao,
    setEditando,
    aoPressionarCelula,
    aoEntrarNaCelula,
    aoSoltarMouse,
  }
}
