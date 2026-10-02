/**
 * A GRADE INTEIRA, MONTADA — a liberação chega ao que a pessoa vê?
 *
 * Os testes de regra (`celulaEditavel.test.ts`) e o da célula (`AbaCell.test.tsx`) passavam
 * enquanto a tela não mostrava diferença nenhuma, porque cada um verificava a sua peça. O
 * que faltava era a COMPOSIÇÃO: `AbaGrid` resolve `celulaEditavel` + papel + modo de edição
 * e entrega à `AbaCell`, e foi aí que a liberação de 01/10/2026 se perdeu duas vezes —
 * primeiro na `AbaCell`, que tinha o seu próprio `origem === 'db'`, e depois no cabeçalho,
 * que continuava pintando o selo `DB` como "não editável".
 *
 * ## Por que a asserção é de ESTILO, e não de `<input>`
 *
 * Fora do modo de edição a grade desenha TEXTO, e o campo só se materializa na célula
 * focada — é o que permite 3.755 linhas sem 80 mil inputs no DOM. Então "dá para digitar
 * aqui" se lê, no DOM parado, pela gramática visual: o fundo azul-água de `bg-water-50/60`
 * é a célula de leitura. Era exatamente essa a diferença que não aparecia.
 */
import { describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { AbaGrid } from './AbaGrid'
import { SCHEMA } from '@/data/cadastroUnidade/schema'
import type { Dados } from '@/domain/fluxo'
import type { Row } from '@/data/cadastroUnidade/types'

const SESSAO = { user: { papeis: ['admin_holding'] } }
vi.mock('@/auth/AuthContext', () => ({ useAuth: () => SESSAO }))

globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver

const aba = SCHEMA.find((a) => a.key === 'subbacia-operacional')!

const linha: Row = {}
for (const c of aba.cols) linha[c.coluna] = ''
Object.assign(linha, {
  sub_bacia_id: 'b1',
  sub_bacia_name: 'Sub-bacia Um',
  sistema_id: 's1',
  ligacoes_atuais: '140',
  universo_ligacoes: '406',
  ticket_medio: '191,29',
  preco_por_ligacao: '1.026,89',
})

const nada = () => {}

/** O marcador da célula de LEITURA — o fundo azul-água de `AbaCell`. */
const SO_LEITURA = 'bg-water-50/60'

function montar() {
  return render(
    <AbaGrid
      aba={aba}
      rows={[linha]}
      cidades={[]}
      dados={{ 'subbacia-operacional': [linha] } as unknown as Dados}
      onCell={nada}
      onCells={nada}
      onAddRow={nada}
      onDelRow={nada}
      edicaoLiberada
    />,
  )
}

/** A célula da primeira linha naquela coluna — `data-celula` é `linha-coluna`. */
function celulaDa(container: HTMLElement, coluna: string): HTMLElement {
  const ci = aba.cols.findIndex((c) => c.coluna === coluna)
  expect(ci, `coluna "${coluna}" não está na aba`).toBeGreaterThanOrEqual(0)
  const td = container.querySelector<HTMLElement>(`[data-celula="0-${ci}"]`)
  expect(td, `célula 0-${ci} ("${coluna}") não foi renderizada`).not.toBeNull()
  return td!
}

const soLeitura = (container: HTMLElement, coluna: string): boolean =>
  celulaDa(container, coluna).innerHTML.includes(SO_LEITURA)

describe('a medida da base na grade montada', () => {
  it('a medida que veio da base deixou de ser célula de leitura', () => {
    const { container } = montar()
    expect(soLeitura(container, 'ligacoes_atuais'), 'ligacoes_atuais').toBe(false)
    expect(soLeitura(container, 'universo_ligacoes'), 'universo_ligacoes').toBe(false)
    expect(soLeitura(container, 'receita_faturada_media_mensal'), 'receita_faturada').toBe(false)
    // e o valor continua ali: liberar não é limpar
    expect(celulaDa(container, 'ligacoes_atuais').textContent).toContain('140')
  })

  it('a derivada e o ID continuam de leitura; o NOME não', () => {
    const { container } = montar()
    expect(soLeitura(container, 'ticket_medio'), 'ticket_medio').toBe(true)
    expect(soLeitura(container, 'sub_bacia_id'), 'sub_bacia_id').toBe(true)
    // O NOME virou gravável em 01/10/2026 ("faça todos"): ele é rótulo, não identidade.
    // Mora em `sistema_topologia.componente_sistema_nome`, e o serviço o grava.
    expect(soLeitura(container, 'sub_bacia_name'), 'sub_bacia_name').toBe(false)
  })

  it('o que a Regional preenche continua como era', () => {
    const { container } = montar()
    expect(soLeitura(container, 'preco_por_ligacao')).toBe(false)
  })

  it('o selo do cabeçalho segue a editabilidade, e não só a origem', () => {
    // Era aqui que a mudança ficava invisível: a coluna liberada continuava com o selo
    // `DB` em azul-água, e azul-água significa "não digite aqui" na gramática da tela.
    const { container } = montar()
    const selo = (coluna: string) => {
      const ci = aba.cols.findIndex((c) => c.coluna === coluna)
      const th = container.querySelectorAll('thead th')[ci]
      return th?.querySelector('span[title]')?.className ?? ''
    }
    expect(selo('ligacoes_atuais'), 'medida liberada').toContain('amber')
    expect(selo('ticket_medio'), 'derivada').toContain('water')
    expect(selo('sub_bacia_id'), 'identidade').toContain('water')
  })
})
