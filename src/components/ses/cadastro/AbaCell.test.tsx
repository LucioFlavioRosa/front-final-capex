import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AbaCell, ehColunaDeCodigo } from './AbaCell'

/**
 * N7/N8 (18/08/2026): `somenteLeitura` passou a carregar PERMISSÃO, não só o
 * estado de foco/edição — ver o comentário em `AbaGrid.tsx::AbaGridRow`. Os
 * três `<select>` da célula (dinâmico do Fluxo, `SELECTS[col]`, cidade)
 * historicamente ignoravam essa prop porque ela só decidia foco; agora
 * precisam respeitá-la, senão alguém sem permissão continua escolhendo uma
 * opção que o servidor recusaria salvar.
 *
 * `nova` (aba `ete-capex`, "ETE nova? Sim/Não") é o exemplo real de coluna
 * `SELECTS[col]` no schema — ver `data/cadastroUnidade/schema.ts:153`.
 */
describe('AbaCell — o <select> desabilita por PERMISSÃO, não por foco', () => {
  function montar(props: { somenteLeitura?: boolean; bloqueada?: boolean }) {
    render(
      <table>
        <tbody>
          <tr>
            <td>
              <AbaCell
                abaKey="ete-capex"
                col="nova"
                origem="un"
                row={{ nova: 'Sim' }}
                cidades={[]}
                dados={{}}
                onChange={vi.fn()}
                {...props}
              />
            </td>
          </tr>
        </tbody>
      </table>,
    )
  }

  it('sem permissão, o select fica desabilitado', () => {
    montar({ bloqueada: true })
    expect(screen.getByRole('combobox')).toBeDisabled()
  })

  it('com permissão, o select aceita interação', () => {
    montar({ bloqueada: false })
    expect(screen.getByRole('combobox')).toBeEnabled()
  })

  /**
   * O IMPASSE DE 20/08/2026, e é por isso que `bloqueada` existe separada.
   *
   * `somenteLeitura` é `!permitida || !(focada && editando)` — ele mistura
   * permissão com o estado de foco da grade. Enquanto o `<select>` desabilitava
   * por ele, a célula ficava inalcançável pelo MOUSE: controle desabilitado não
   * deixa o clique borbulhar, então o `onDoubleClick` do `<td>` nunca disparava,
   * a célula nunca entrava em edição, e o select nunca habilitava. Só pelo teclado
   * (clicar numa célula de texto, andar com as setas, Enter) — o que ninguém
   * descobre sozinho.
   *
   * Este teste é o que impede a volta: FORA do modo de edição, com permissão, o
   * select tem de estar clicável.
   */
  it('fora do modo de edição, com permissão, continua clicável', () => {
    montar({ somenteLeitura: true, bloqueada: false })
    expect(screen.getByRole('combobox')).toBeEnabled()
  })

  /** Sem a prop, `bloqueada` herda `somenteLeitura`: erra fechando, nunca abrindo. */
  it('sem a prop, o padrão é fechar', () => {
    montar({ somenteLeitura: true })
    expect(screen.getByRole('combobox')).toBeDisabled()
  })
})

/**
 * CÓDIGO EM MONO (29/08/2026) — `cts_002`, `d1b1_1_1`, `d1s1`.
 *
 * A regra é derivada do NOME da coluna, e não declarada no schema, porque `_id`
 * é a convenção do modelo inteiro: as 15 abas são as 15 tabelas do backend com
 * os mesmos nomes de coluna. Uma lista declarada envelheceria a cada tabela
 * nova; a convenção não.
 */
describe('ehColunaDeCodigo', () => {
  it('coluna de id é código', () => {
    for (const col of ['cts_id', 'sub_bacia_id', 'sistema_id', 'componente_sistema_id']) {
      expect(ehColunaDeCodigo(col)).toBe(true)
    }
  })

  it('NOME de componente não é código', () => {
    // Nome é texto que se lê, não código que se compara caractere a caractere —
    // e em mono ele fica largo e piora a leitura numa grade estreita.
    for (const col of ['sub_bacia_name', 'sistema_name', 'cidade_name']) {
      expect(ehColunaDeCodigo(col)).toBe(false)
    }
  })

  it('coluna de dado comum não é código', () => {
    for (const col of ['preco_por_ligacao', 'tempo_execucao', 'obra_obrigatoria_ano', 'nova']) {
      expect(ehColunaDeCodigo(col)).toBe(false)
    }
  })
})
