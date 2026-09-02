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
 * E É RECORTADA PELA CIDADE DO SISTEMA. Dizia-se aqui que não poderia ser —
 * "CTS fora de sistema não tem cidade, nem empresa, nem unidade" —, e a lista
 * oferecia a base inteira. A premissa era falsa: a fonte sempre soube onde cada
 * CTS está, e a migração 018 devolveu isso ao esquema. Como a cidade determina
 * empresa, unidade, diretoria e regional, recortar por ela recorta pelos cinco
 * níveis de uma vez.
 *
 * O que a lista sem recorte custava: 151 candidatas, quase todas de outra
 * unidade, e duas CTS efetivamente colocadas em sistema de outra cidade.
 *
 * SEM CIDADE CADASTRADA VAI NUM GRUPO À PARTE, e não some. `cidade_id` é
 * nulável, e esconder essas deixaria uma CTS que existe no banco sem forma
 * nenhuma de ser colocada — trocaria uma lista grande demais por uma que mente.
 */
export function AdicionarCts({
  sistemaId,
  sistemaNome,
  cidadeDoSistema,
  cidadeNome,
  topo,
  dados,
  limitada,
  onAdicionar,
}: {
  sistemaId: string
  sistemaNome: string
  /** A cidade do sistema — o recorte da lista. */
  cidadeDoSistema: string
  /** O nome dela, para o texto. Cai no id quando o nome não veio. */
  cidadeNome: string
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

  const livres = useMemo(
    () => topo.filter((t) => !t.sistema_id && ehCts(dados, t)),
    [topo, dados],
  )
  /**
   * DUAS LISTAS, e não uma filtrada: as CTS da cidade do sistema, e as que ainda
   * não têm cidade na base. A segunda é rara e some quando a carga completar —
   * mas enquanto existir, ela precisa ficar visível e SEPARADA, para ninguém
   * colocar às cegas uma CTS que pode ser de outro município.
   */
  const daCidade = useMemo(
    // A GUARDA `cidadeDoSistema &&` NAO E DEFENSIVA À TOA: sem ela, um sistema
    // sem cidade cai em `'' === ''` e casa com TODAS as CTS sem cidade — que a
    // linha seguinte já colhe. As mesmas opções apareceriam duas vezes, com a
    // mesma `key`, e o contador diria o dobro. O recorte some justamente quando
    // não há por onde recortar, que é quando ele mais parecia estar valendo.
    () => (cidadeDoSistema ? livres.filter((t) => t.cidade_id === cidadeDoSistema) : []),
    [livres, cidadeDoSistema],
  )
  const semCidade = useMemo(() => livres.filter((t) => !t.cidade_id), [livres])
  const quantas = daCidade.length + semCidade.length

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
          disabled={!quantas}
          onChange={(e) => setSel(e.target.value)}
          className="min-w-0 flex-1 rounded-[8px] border border-ink-200 bg-white px-2.5 py-1.5 text-[12.5px]"
        >
          <option value="">
            {!cidadeDoSistema
              ? /* O SISTEMA AINDA NAO TEM CIDADE: prometer um recorte por cidade
                   aqui seria mentir sobre o que a lista é. */
                quantas
                ? `Escolha uma CTS… (${quantas} sem cidade cadastrada)`
                : 'Este sistema ainda não tem cidade'
              : quantas
                ? `Escolha uma CTS… (${quantas} livre${quantas > 1 ? 's' : ''} em ${cidadeNome})`
                : `Nenhuma CTS livre em ${cidadeNome}`}
          </option>
          {daCidade.map((c) => (
            <option key={c.componente_sistema_id} value={c.componente_sistema_id}>
              {c.componente_sistema_nome || c.componente_sistema_id}
            </option>
          ))}
          {/* Agrupadas e rotuladas: sem o rótulo elas se misturariam às da
              cidade, e a lista voltaria a afirmar um lugar que não sabe. */}
          {semCidade.length > 0 && (
            <optgroup label="Sem cidade cadastrada">
              {semCidade.map((c) => (
                <option key={c.componente_sistema_id} value={c.componente_sistema_id}>
                  {c.componente_sistema_nome || c.componente_sistema_id}
                </option>
              ))}
            </optgroup>
          )}
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
        {cidadeDoSistema ? (
          <>
            Só aparecem CTS de <strong>{cidadeNome}</strong> que não estão em nenhum outro
            sistema.
          </>
        ) : (
          <>
            Este sistema não tem cidade cadastrada, então a lista{' '}
            <strong>não é recortada por município</strong>.
          </>
        )}{' '}
        Depois de adicionar, defina para onde ela escoa na tabela e salve.
      </div>
    </div>
  )
}
