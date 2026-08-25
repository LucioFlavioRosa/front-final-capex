import React, { useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactElement;
}

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
 */
export const Tooltip: React.FC<TooltipProps> = ({ content, children }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; acima: boolean }>({
    top: 0,
    left: 0,
    acima: true,
  });
  const anchorRef = useRef<HTMLSpanElement>(null);

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

  return (
    <span
      ref={anchorRef}
      className="relative inline-block"
      onMouseEnter={mostrar}
      onMouseLeave={() => setIsVisible(false)}
    >
      {children}
      {isVisible &&
        createPortal(
          <div
            style={{
              position: 'fixed',
              top: pos.top,
              left: pos.left,
              transform: `translate(-50%, ${pos.acima ? '-100%' : '0'})`,
            }}
            className="pointer-events-none z-50 w-64 rounded-lg bg-gray-800 p-3 text-sm text-white shadow-lg
              prose prose-invert prose-p:mb-2 prose-strong:text-white"
          >
            {content}
          </div>,
          document.body,
        )}
    </span>
  );
};
