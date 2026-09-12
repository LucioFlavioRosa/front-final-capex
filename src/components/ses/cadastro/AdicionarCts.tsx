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
 * E É RECORTADA PELA EMPRESA DO SISTEMA — coletor e macrorregião, a mesma régua.
 *
 * Já foi pela cidade. Dizia-se aqui que nem isso poderia ser ("CTS fora de
 * sistema não tem cidade, nem empresa, nem unidade"), a lista oferecia a base
 * inteira, e a migração 018 devolveu a cidade ao esquema. O que a lista sem
 * recorte custava: 151 candidatas, quase todas de outra unidade, e duas CTS
 * colocadas em sistema de outra cidade.
 *
 * A CIDADE DEIXOU DE SER A RÉGUA quando o sistema passou a poder estar em várias
 * (migração 022): um coletor de Mesquita pertence ao Sarapuí tanto quanto um de
 * Belford Roxo, e recortar pela cidade o esconderia de metade dos sistemas em que
 * ele cabe. A empresa é o nível que sobrevive a isso — sub-bacia, coletor e
 * macrorregião carregam `emp_codigo`, e é a mesma chave que agrupa a
 * macrorregião (`sistema_cts`, `emp_codigo`). Um sistema pode estar em cidades
 * de empresas diferentes (Saracuruna: Duque de Caxias e Magé), por isso o
 * recorte é por CONJUNTO de empresas.
 *
 * SEM EMPRESA VAI NUM GRUPO À PARTE, e não some: é o coletor que a carga não
 * situou em cidade nenhuma (e portanto em empresa nenhuma). Esconder esses
 * deixaria uma CTS que existe no banco sem forma nenhuma de ser colocada —
 * trocaria uma lista grande demais por uma que mente.
 */
export function AdicionarCts({
  sistemaId,
  sistemaNome,
  empresasDoSistema,
  empresasNome,
  topo,
  dados,
  limitada,
  onAdicionar,
}: {
  sistemaId: string
  sistemaNome: string
  /** As empresas do sistema — o recorte da lista. Um sistema pode estar em cidades de mais de uma. */
  empresasDoSistema: Set<string>
  /** Os nomes delas, para o texto. Caem no código quando o nome não veio. */
  empresasNome: string
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
   * DUAS LISTAS, e não uma filtrada: as CTS das empresas do sistema, e as que
   * ainda não têm empresa (porque a carga não as situou em cidade nenhuma). A
   * segunda é rara e some quando a carga completar — mas enquanto existir, ela
   * precisa ficar visível e SEPARADA, para ninguém colocar às cegas uma CTS que
   * pode ser de outra operadora.
   *
   * UMA RÉGUA SÓ: a empresa. Coletor e macrorregião entram se a empresa deles é
   * uma das do sistema. O que a macrorregião ensinou vale para o coletor — a
   * cidade esconde quem cabe, e a empresa é a chave que os três compartilham.
   * `Set` vazio (sistema sem cidade, logo sem empresa) não casa com nada: quem
   * não tem empresa vai para o grupo à parte, e não para as duas listas.
   */
  const daEmpresaDoSistema = useMemo(
    () => livres.filter((t) => empresasDoSistema.has(t.emp_codigo)),
    [livres, empresasDoSistema],
  )
  // SEM EMPRESA VAI À PARTE, e não some: é o coletor que a carga não situou em
  // cidade nenhuma — e a macrorregião cujos membros também não.
  const semEmpresa = useMemo(() => livres.filter((t) => !t.emp_codigo), [livres])
  const temEmpresa = empresasDoSistema.size > 0
  const temMacro = daEmpresaDoSistema.some((t) => t.macro === 'Sim')
  const quantas = daEmpresaDoSistema.length + semEmpresa.length

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
            {!temEmpresa
              ? /* O SISTEMA AINDA NAO TEM CIDADE, logo nem empresa: prometer um
                   recorte aqui seria mentir sobre o que a lista é. */
                quantas
                ? `Escolha uma CTS… (${quantas} sem empresa cadastrada)`
                : 'Este sistema ainda não tem cidade'
              : quantas
                ? `Escolha uma CTS… (${quantas} livre${quantas > 1 ? 's' : ''} de ${empresasNome})`
                : `Nenhuma CTS livre de ${empresasNome}`}
          </option>
          {daEmpresaDoSistema.map((c) => (
            <option key={c.componente_sistema_id} value={c.componente_sistema_id}>
              {c.componente_sistema_nome || c.componente_sistema_id}
            </option>
          ))}
          {/* Agrupadas e rotuladas: sem o rótulo elas se misturariam às da
              empresa, e a lista voltaria a afirmar um dono que não sabe. */}
          {semEmpresa.length > 0 && (
            <optgroup label="Sem empresa cadastrada">
              {semEmpresa.map((c) => (
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
        {temEmpresa ? (
          <>
            Só aparecem {temMacro ? 'macrorregiões' : 'CTS'} de{' '}
            <strong>{empresasNome}</strong> que não estão em nenhum outro sistema — a
            empresa, e não a cidade: um sistema pode estar em mais de um município.
          </>
        ) : (
          <>
            Este sistema não tem cidade cadastrada, então não se sabe a empresa dele e a
            lista <strong>não é recortada</strong> — só as CTS sem empresa aparecem.
          </>
        )}{' '}
        Depois de adicionar, defina para onde ela escoa na tabela e salve.
      </div>
    </div>
  )
}
