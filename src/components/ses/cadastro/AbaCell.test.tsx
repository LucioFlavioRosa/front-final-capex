import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AbaCell, ehColunaDeCodigo } from './AbaCell'
import { celulaEditavel } from './AbaGrid'
import { SCHEMA } from '../../../data/cadastroUnidade/schema'
import type { Row } from '../../../data/cadastroUnidade/types'

/**
 * `somenteLeitura` carrega PERMISSÃO, e não só o estado de foco/edição — ver o
 * comentário em `AbaGrid.tsx::AbaGridRow`. Os três `<select>` da célula
 * (dinâmico do Fluxo, `SELECTS[col]`, cidade) têm que respeitá-la, senão alguém
 * sem permissão continua escolhendo uma opção que o servidor recusaria salvar.
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
                // coluna `un`: a regra estrutural a libera — este teste é sobre os outros portões
                editavelNaEstrutura
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
   * O IMPASSE que faz `bloqueada` existir separada de `somenteLeitura`.
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
 * A CÉLULA DESENHADA, e não só a regra — o teste que faltava em 01/10/2026.
 *
 * `celulaEditavel` liberou as medidas da base, a planilha passou a aceitá-las, os testes
 * todos passaram, e do lado de fora NÃO HOUVE DIFERENÇA NENHUMA: a `AbaCell` tinha o seu
 * próprio `origem === 'db'` e continuava devolvendo texto de leitura. Era a terceira cópia
 * da mesma pergunta — a primeira divergência custou 11 colunas pintadas de âmbar que o
 * upload descartava, e esta custou a mudança inteira.
 *
 * Os testes de regra não pegam isto por construção: eles param na função. Este desce até o
 * que a pessoa vê, e é por isso que ele existe — a composição é a parte que quebra.
 */
describe('a medida da base chega EDITÁVEL até a célula', () => {
  function montar(abaKey: string, col: string, origem: 'db' | 'un' | 'calc', row: Row = {}) {
    const aba = SCHEMA.find((a) => a.key === abaKey)!
    render(
      <table>
        <tbody>
          <tr>
            <td>
              <AbaCell
                abaKey={abaKey}
                col={col}
                origem={origem}
                row={row}
                cidades={[]}
                dados={{}}
                onChange={vi.fn()}
                //: a MESMA composição da grade — é ela que estava rompida
                editavelNaEstrutura={celulaEditavel(aba, row, col, origem)}
                bloqueada={false}
              />
            </td>
          </tr>
        </tbody>
      </table>,
    )
  }

  it('a medida da base virou campo, e não texto', () => {
    montar('subbacia-operacional', 'ligacoes_atuais', 'db', { ligacoes_atuais: '140' })
    expect(screen.getByRole('textbox')).toHaveValue('140')
  })

  it('a derivada continua texto: é conta do servidor', () => {
    montar('subbacia-operacional', 'ticket_medio', 'db', { ticket_medio: '191,29' })
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.getByText('191,29')).toBeInTheDocument()
  })

  it('o id continua texto: é a identidade da linha', () => {
    montar('subbacia-operacional', 'sub_bacia_id', 'db', { sub_bacia_id: 'b1' })
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })
})

/**
 * CÓDIGO EM MONO — `cts_002`, `d1b1_1_1`, `d1s1`.
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
