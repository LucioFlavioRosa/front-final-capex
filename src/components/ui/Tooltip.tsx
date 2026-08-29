import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactElement;
}

/** Passar por cima sem ler não deve abrir nada — só quem PARA ganha a dica. */
const ATRASO_MS = 180;

/**
 * Posição calculada em `position: fixed` e renderizada via portal em
 * `document.body`.
 *
 * A versão anterior usava `position: absolute` dentro do próprio `<td>` da
 * grade — e a grade rola dentro de um contêiner com `overflow-x-auto`
 * (`AbaGrid.tsx`). Um eixo com overflow diferente de `visible` faz o
 * navegador tratar o outro eixo como `auto` também (regra do CSS, não bug do
 * navegador), então a caixa da dica ficava CORTADA verticalmente nas linhas
 * perto do topo da tabela — era exatamente o efeito visto no print (o texto
 * aparecia partido ao meio). `fixed` + portal tira a dica de dentro da
 * hierarquia da tabela, então nenhum contêiner com scroll consegue recortá-la.
 *
 * ATRASO E FADE (achado 1.8 da revisão de UX): sem os dois, atravessar a
 * grade com o mouse — 22 colunas, dica em cabeçalho e célula — disparava e
 * matava uma caixa por coluna. Os 180ms são o que separa "passei por cima" de
 * "parei para ler"; é isso, mais do que a transição em si, que faz o tooltip
 * parar de piscar.
 *
 * FOCO ABRE NA HORA, sem atraso: quem chega por Tab já demonstrou intenção — e
 * antes disto o gatilho era só de ponteiro, então a navegação por teclado
 * (o modo documentado do `AbaGrid`) nunca via a explicação da coluna.
 */
export const Tooltip: React.FC<TooltipProps> = ({ content, children }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; acima: boolean }>({
    top: 0,
    left: 0,
    acima: true,
  });
  const anchorRef = useRef<HTMLSpanElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => () => clearTimeout(timer.current), []);

  const mostrar = () => {
    const rect = anchorRef.current?.getBoundingClientRect()
    if (!rect) return
    // Vira para baixo quando não há altura livre acima (linhas do topo da
    // tabela, logo abaixo do cabeçalho fixo) — sem isso a dica nasceria fora
    // da tela em vez de só cortada.
    const acima = rect.top > 180
    setPos({
      top: acima ? rect.top - 8 : rect.bottom + 8,
      left: Math.min(Math.max(rect.left + rect.width / 2, 140), window.innerWidth - 140),
      acima,
    })
    setIsVisible(true)
  }

  const agendar = () => {
    clearTimeout(timer.current)
    timer.current = setTimeout(mostrar, ATRASO_MS)
  }

  const cancelar = () => {
    clearTimeout(timer.current)
    setIsVisible(false)
  }

  return (
    <span
      ref={anchorRef}
      tabIndex={0}
      className="relative inline-block rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-water-500/50"
      onMouseEnter={agendar}
      onMouseLeave={cancelar}
      onFocus={mostrar}
      onBlur={cancelar}
    >
      {children}
      {isVisible &&
        createPortal(
          <div
            role="tooltip"
            style={{
              position: 'fixed',
              top: pos.top,
              left: pos.left,
              transform: `translate(-50%, ${pos.acima ? '-100%' : '0'})`,
            }}
            className="pointer-events-none z-50 w-64 animate-fade-in rounded-lg bg-gray-800 p-3 text-sm text-white shadow-lg
              prose prose-invert prose-p:mb-2 prose-strong:text-white"
          >
            {content}
          </div>,
          document.body,
        )}
    </span>
  );
};
