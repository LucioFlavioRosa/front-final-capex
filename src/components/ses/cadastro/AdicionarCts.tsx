import { useId, useMemo, useState } from 'react'
import type { Row } from '../../../data/cadastroUnidade/types'
import { ehCts, type Dados } from '../../../domain/fluxo'

/**
 * ADICIONAR UMA CTS AO SISTEMA.
 *
 * A CTS é o único componente que a Regional coloca. Do Databricks vêm quais
 * sub-bacias e qual ETE pertencem ao sistema — e TODAS as CTS cadastradas, sem
 * dizer de qual sistema são. Nenhuma nasce atrelada: em que sistema cada uma
 * entra é decisão de quem monta, aqui.
 *
 * POR QUE UM CONTROLE PRÓPRIO, e não uma célula da grade: na aba do Fluxo o
 * `sistema_id` nem é coluna da grade — ele descreve onde o
 * componente ESTÁ, e sub-bacia e ETE estão onde o Databricks disse. Abrir a
 * coluna para edição deixaria qualquer componente ser arrastado para qualquer
 * sistema, que é o oposto do modelo. A CTS é a exceção, e a exceção tem seu
 * próprio botão.
 *
 * A lista são as CTS que não estão em NENHUM outro sistema. Uma já colocada não
 * aparece: um componente está em um sistema só, e levá-la para outro é tirá-la
 * de lá primeiro.
 *
 * NÃO é recortada por unidade, e não poderia ser: CTS fora de sistema não tem
 * cidade, nem empresa, nem unidade. Por isso o texto diz "da base".
 */
export function AdicionarCts({
  sistemaId,
  sistemaNome,
  topo,
  dados,
  limitada,
  onAdicionar,
}: {
  sistemaId: string
  sistemaNome: string
  /** As linhas da aba do Fluxo — é delas que sai quem está sem sistema. */
  topo: Row[]
  /**
   * O cadastro inteiro, para `tipoDoNo` saber o que cada componente é.
   *
   * A coluna `componente_tipo` da grade é DERIVADA da mesma função (ver
   * `cadastroCalc`), e a lógica não lê aquela string: ela é rótulo de tela
   * ('sub-bacia', 'CTS'), e comparar contra rótulo quebraria na primeira
   * mudança de texto.
   */
  dados: Dados
  /** A unidade usa macrorregião de CTS e o sistema já tem a dele: nada a adicionar. */
  limitada: boolean
  onAdicionar: (componenteId: string) => void
}) {
  const [sel, setSel] = useState('')
  const id = useId()

  const disponiveis = useMemo(
    () => topo.filter((t) => !t.sistema_id && ehCts(dados, t)),
    [topo, dados],
  )

  if (!sistemaId) return null

  if (limitada)
    return (
      <div className="mt-3 rounded-[10px] border border-ink-200 bg-ink-50 px-3.5 py-2.5 text-[11.5px] leading-snug text-ink-water">
        A unidade usa <strong>macrorregião de CTS</strong>, e este sistema já tem a dele. Para
        adicionar outra, tire a atual da tabela — ou desmarque a opção em{' '}
        <strong>Organização · Unidade e regional</strong>, o que vale para todos os sistemas
        da unidade.
      </div>
    )

  return (
    <div className="mt-3 rounded-[10px] border border-ink-200 bg-white px-3.5 py-3">
      <label htmlFor={id} className="block text-[12.5px] font-semibold text-ink-900">
        Adicionar CTS a {sistemaNome || sistemaId}
      </label>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <select
          id={id}
          value={sel}
          disabled={!disponiveis.length}
          onChange={(e) => setSel(e.target.value)}
          className="min-w-0 flex-1 rounded-[8px] border border-ink-200 bg-white px-2.5 py-1.5 text-[12.5px]"
        >
          <option value="">
            {disponiveis.length
              ? `Escolha uma CTS… (${disponiveis.length} livres na base)`
              : 'Nenhuma CTS livre na base'}
          </option>
          {disponiveis.map((c) => (
            <option key={c.componente_sistema_id} value={c.componente_sistema_id}>
              {c.componente_sistema_nome || c.componente_sistema_id}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={!sel}
          onClick={() => {
            onAdicionar(sel)
            setSel('')
          }}
          className="rounded-[8px] border border-water-200 bg-water-600 px-3 py-1.5 text-[12.5px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          + adicionar
        </button>
      </div>
      <div className="mt-1.5 text-[11.5px] leading-snug text-ink-water">
        Só aparecem CTS que não estão em nenhum outro sistema. Depois de adicionar, defina para onde
        ela escoa na tabela e salve.
      </div>
    </div>
  )
}
