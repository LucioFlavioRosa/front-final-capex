import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AbaCell } from './AbaCell'
import { CAMPOS_SO_ETE_NOVA, SCHEMA, colunaLabel } from '../../../data/cadastroUnidade/schema'
import { COLUNAS_DA_ETE } from '../../../lib/cadastroApi'

/**
 * O MÓDULO DE EXPANSÃO DA ETE NOVA, na aba de cadastro.
 *
 * Pedido do cliente em 29/09/2026: os módulos iniciais da ETE nova têm vazão e preço
 * específicos, e os de expansão têm outros. `modulos` continua sendo a quantidade
 * inicial — as duas colunas novas dizem quanto trata e quanto custa CADA módulo de
 * expansão, e quantos serão é decisão da simulação.
 *
 * Vazias = iguais ao módulo inicial, que é o caso de todas as ETEs de hoje.
 */
describe('as duas colunas do módulo de expansão estão na aba da ETE', () => {
  const aba = SCHEMA.find((a) => a.key === 'ete-capex')!
  const colunas = aba.cols.map((c) => c.coluna)

  it.each(['capacidade_por_modulo_expansao', 'capex_por_modulo_expansao'])(
    '%s aparece na aba, com rótulo próprio',
    (col) => {
      expect(colunas).toContain(col)
      expect(colunaLabel(col)).toContain('expansão')
    },
  )

  it('as duas nascem VAZIAS, e não com dado de exemplo', () => {
    // `procedencia: 'mock'` encheria a célula com número inventado, e aqui vazio é
    // uma afirmação: "este módulo é igual ao inicial".
    for (const col of ['capacidade_por_modulo_expansao', 'capex_por_modulo_expansao']) {
      expect(aba.cols.find((c) => c.coluna === col)!.procedencia).toBe('vazio')
    }
  })

  it('as duas são opcionais — a aba diz o que acontece quando ficam em branco', () => {
    for (const col of ['capacidade_por_modulo_expansao', 'capex_por_modulo_expansao']) {
      expect(aba.cols.find((c) => c.coluna === col)!.opcional).toBeTruthy()
    }
  })

  it('e viajam no de/para da planilha, senão a gravação as perde', () => {
    expect(Object.values(COLUNAS_DA_ETE)).toContain('capacidade_por_modulo_expansao')
    expect(Object.values(COLUNAS_DA_ETE)).toContain('capex_por_modulo_expansao')
  })
})

/**
 * A REGRA DE BLOQUEIO VIVE NUM LUGAR SÓ.
 *
 * `AbaCell` mostra "—" e `AbaGrid` recusa a edição e o colar. A lista estava
 * duplicada nos dois arquivos, com o segundo dizendo em comentário que espelhava o
 * primeiro — e um espelho que alguém precisa lembrar de atualizar quebra do pior
 * jeito possível: a célula aparece travada e o colar escreve nela.
 */
describe('as colunas de expansão só se aplicam à ETE nova', () => {
  it('estão na lista única de campos exclusivos da ETE nova', () => {
    expect(CAMPOS_SO_ETE_NOVA).toContain('capacidade_por_modulo_expansao')
    expect(CAMPOS_SO_ETE_NOVA).toContain('capex_por_modulo_expansao')
  })

  function celula(col: string, nova: string) {
    render(
      <table>
        <tbody>
          <tr>
            <td>
              <AbaCell
                abaKey="ete-capex"
                col={col}
                origem="un"
                row={{ nova, [col]: '' }}
                cidades={[]}
                dados={{}}
                onChange={vi.fn()}
              />
            </td>
          </tr>
        </tbody>
      </table>,
    )
  }

  it.each(['capacidade_por_modulo_expansao', 'capex_por_modulo_expansao'])(
    'na ETE existente, %s mostra "—" em vez de campo',
    (col) => {
      celula(col, 'Nao')
      expect(screen.getByTitle('Só se aplica a ETE nova')).toBeInTheDocument()
      expect(screen.queryByRole('textbox')).toBeNull()
    },
  )

  it.each(['capacidade_por_modulo_expansao', 'capex_por_modulo_expansao'])(
    'na ETE nova, %s é campo preenchível',
    (col) => {
      celula(col, 'Sim')
      expect(screen.queryByTitle('Só se aplica a ETE nova')).toBeNull()
      expect(screen.getByRole('textbox')).toBeInTheDocument()
    },
  )
})
