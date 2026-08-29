import { useId, useState, type ReactNode } from 'react'
import { useIndicador } from '@/components/ui/useIndicador'

/**
 * A moldura de todo quadro de gráfico.
 *
 * Portada do `ChartFrame.tsx` do repo do Lucio — a MOLDURA, não o SVG. Os
 * 1.077 LOC de desenho à mão saíram e viraram recharts; o que ficou são as três
 * partes que carregam informação:
 *
 *   `nota`    — conteúdo negociado, não decoração. A do EBITDA diz que ele é
 *               saída calculada e não entra na função objetivo.
 *   `tabela`  — OBRIGATÓRIA no tipo, e é a razão de ela não ser opcional aqui
 *               também. O desenho é `aria-hidden`, então esta tabela é a única
 *               forma de o dado chegar a quem usa leitor de tela. É também o
 *               alívio que o validador de paleta exige: turquesa, âmbar e
 *               magenta ficam abaixo de 3:1 no branco.
 *
 * `escopo` é acréscimo nosso, da fase 8: Fluxo de escoamento e EBITDA aparecem no nível
 * global E no da cidade, com o MESMO componente. Sem o escopo em negrito no
 * subtítulo, um print da tela de cidade é indistinguível de um print do global
 * — e a diferença é o que o número significa.
 *
 * O TOGGLE virou EXCLUSIVO no redesign de 19/08 — antes era um link no rodapé
 * que REVELAVA a tabela por baixo do gráfico (as duas ficavam visíveis); o
 * design pede duas abas de peso igual no topo, e só uma vista por vez. Não é
 * regressão de acesso: antes do clique não havia tabela alguma no DOM (mesma
 * ausência de hoje) — mudou o RÓTULO e a POSIÇÃO do gatilho, não o que ele
 * garante. `role="tablist"`/`role="tab"` é o par certo aqui (não o
 * `radiogroup` do `SegmentedControl`): as duas abas trocam o PAINEL abaixo,
 * que é exatamente o que `aria-controls`/`aria-selected` descrevem.
 */
export interface DadosTabela {
  colunas: string[]
  linhas: (string | number)[][]
}

interface QuadroGraficoProps {
  titulo: string
  subtitulo?: string
  /** Recorte a que os números se referem, quando o quadro é reusado entre níveis. */
  escopo?: string
  nota?: ReactNode
  /**
   * Controle próprio do quadro, à esquerda do alternador Gráfico/Tabela — hoje
   * o seletor de cidade do quadro de meta de cobertura. Fica na LINHA DO
   * TÍTULO, e não acima do card, porque ele muda o que o quadro mostra: solto
   * lá em cima ele pareceria filtrar a seção inteira.
   */
  acoes?: ReactNode
  tabela: DadosTabela
  children: ReactNode
}

export function QuadroGrafico({
  titulo,
  subtitulo,
  escopo,
  nota,
  acoes,
  tabela,
  children,
}: QuadroGraficoProps) {
  const [verTabela, setVerTabela] = useState(false)
  const id = useId()
  // A pílula ESCORREGA entre Gráfico/Tabela (`useIndicador`, a mesma técnica
  // do Trilho) em vez de pular — repetida em ~10 quadros por tela.
  const { containerRef, estilo } = useIndicador<HTMLDivElement>(String(verTabela))

  return (
    <figure aria-labelledby={`${id}-t`} className="carta m-0 overflow-hidden">
      {/* SEM `flex-wrap`: o toggle tem de ficar na linha do título mesmo em
          card estreito (a metade de uma linha de dois quadros). Com wrap ele
          cai para baixo do subtítulo e cada quadro da mesma linha põe o
          controle numa altura diferente. Quem cede espaço é o título, que
          tem `min-w-0` e quebra. */}
      <div className="flex items-start justify-between gap-4 px-4 pt-4 md:px-5 md:pt-5">
        <div className="min-w-0">
          <figcaption id={`${id}-t`} className="text-[15px] font-bold text-ink-800">
            {titulo}
          </figcaption>
          {(subtitulo || escopo) && (
            <p className="mt-0.5 text-[12px] leading-snug text-ink-500">
              {subtitulo}
              {subtitulo && escopo && ' · '}
              {escopo && <strong className="font-semibold text-ink-700">{escopo}</strong>}
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
        {acoes}
        <div
          ref={containerRef}
          role="tablist"
          aria-label={`Ver "${titulo}" como`}
          className="relative flex shrink-0 gap-1 rounded-full border border-ink-200 bg-ink-50 p-1"
        >
          <button
            type="button"
            role="tab"
            id={`${id}-btn-grafico`}
            aria-selected={!verTabela}
            aria-controls={`${id}-painel`}
            data-indicador={!verTabela ? '1' : undefined}
            onClick={() => setVerTabela(false)}
            className={`relative z-10 rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors duration-hover ease-saida ${
              !verTabela ? 'text-water-700' : 'text-ink-500 hover:text-ink-700'
            }`}
          >
            Gráfico
          </button>
          <button
            type="button"
            role="tab"
            id={`${id}-btn-tabela`}
            aria-selected={verTabela}
            aria-controls={`${id}-painel`}
            data-indicador={verTabela ? '1' : undefined}
            onClick={() => setVerTabela(true)}
            className={`relative z-10 rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors duration-hover ease-saida ${
              verTabela ? 'text-water-700' : 'text-ink-500 hover:text-ink-700'
            }`}
          >
            Tabela
          </button>
          {estilo && (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-1 rounded-full bg-white shadow-soft transition-[transform,width] duration-mover ease-saida"
              style={{ width: estilo.width, transform: `translateX(${estilo.left}px)` }}
            />
          )}
        </div>
        </div>
      </div>

      <div id={`${id}-painel`} role="tabpanel" aria-labelledby={`${id}-btn-${verTabela ? 'tabela' : 'grafico'}`}>
        {verTabela ? (
          <div className="carta-tabela min-w-0 overflow-x-auto px-4 pb-4 pt-3 md:px-5 md:pb-5">
            <table>
              <caption className="sr-only">{titulo}</caption>
              <thead>
                <tr>
                  {tabela.colunas.map((c, i) => (
                    <th key={c} data-r={i > 0 ? '' : undefined} scope="col">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tabela.linhas.map((linha, i) => (
                  <tr key={i}>
                    {linha.map((celula, j) => (
                      <td key={j} data-m={j > 0 ? '' : undefined}>
                        {celula}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          /* O desenho é aria-hidden: o equivalente textual é a aba Tabela. */
          <div aria-hidden="true" className="viz-root px-2.5 pb-3 pt-1 md:px-3.5">
            {children}
          </div>
        )}
      </div>

      {nota && (
        <p className="border-t border-ink-100 bg-ink-50 px-4 py-3 text-[12px] leading-relaxed text-ink-600 md:px-5">
          {nota}
        </p>
      )}
    </figure>
  )
}
