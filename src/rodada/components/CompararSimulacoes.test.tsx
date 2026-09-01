import { describe, expect, it } from 'vitest'
import { screen, within } from '@testing-library/react'
import { renderizar } from '@/testes/render'
import { CompararSimulacoes } from '@/rodada/components/CompararSimulacoes'
import type { RunResumo } from '@/rodada/domain/resultado'

/**
 * O QUE A COMPARAÇÃO MOSTRA — e o que ela cala.
 *
 * O modal existe para revelar o que MUDA entre duas rodadas. Três parâmetros
 * não são variados pela equipe, e três linhas sempre iguais empurram para baixo
 * as que importam. Elas ficam de fora — mas só enquanto forem iguais.
 */
function rodada(runId: string, pedido: Record<string, unknown>): RunResumo {
  return {
    runId,
    nome: runId,
    unidadeId: 'u1',
    unidadeNome: 'Unidade',
    dataHora: '2026-08-31T10:00:00Z',
    autor: 'dev@local',
    duracaoS: null,
    status: 'concluida',
    favorita: false,
    comentario: null,
    metricas: null,
    pedido,
  } as unknown as RunResumo
}

const PEDIDO_BASE = {
  ORCAMENTO: { 2026: 60_000_000, 2027: 50_000_000 },
  FOCO_COBERTURA: 1,
  PENALIDADE_COBERTURA: 'meta+cobertura',
  MAX_TIME_S: 400,
  ANOS_EXTRA_CONCLUSAO: 0,
}

function abrir(pedidoB: Record<string, unknown>) {
  renderizar(
    <CompararSimulacoes
      runs={[rodada('run_a', PEDIDO_BASE), rodada('run_b', pedidoB)]}
      aoFechar={() => {}}
    />,
  )
  return screen.getByRole('dialog')
}

describe('CompararSimulacoes — os parâmetros constantes na prática', () => {
  it('omite os três quando são iguais nas duas rodadas', () => {
    const dlg = abrir(PEDIDO_BASE)

    expect(within(dlg).queryByText('Estratégia de cobertura')).not.toBeInTheDocument()
    expect(within(dlg).queryByText('Tempo máximo do solver')).not.toBeInTheDocument()
    expect(within(dlg).queryByText('Anos extras para concluir')).not.toBeInTheDocument()

    // E o que varia continua ali — a omissão é dos três, não uma faxina geral.
    expect(within(dlg).getByText('Orçamento por ano')).toBeInTheDocument()
    expect(within(dlg).getByText('Objetivo')).toBeInTheDocument()
  })

  it('A LINHA VOLTA quando os valores divergem — é o caso que importa', () => {
    // Um pedido montado por script pode trazer outro valor. Esconder a linha
    // justamente quando ela deixa de ser constante seria o pior momento
    // possível: esta é a única tela feita para revelar divergência.
    const dlg = abrir({ ...PEDIDO_BASE, MAX_TIME_S: 60 })

    expect(within(dlg).getByText('Tempo máximo do solver')).toBeInTheDocument()
    // As outras duas seguem iguais, e seguem omitidas.
    expect(within(dlg).queryByText('Estratégia de cobertura')).not.toBeInTheDocument()
    expect(within(dlg).queryByText('Anos extras para concluir')).not.toBeInTheDocument()
  })

  it('o orçamento por ano sai em pedaços, para a célula poder quebrar', () => {
    const dlg = abrir(PEDIDO_BASE)
    const linha = within(dlg).getByText('Orçamento por ano').closest('tr')!

    // Cada ano é um elemento próprio com `whitespace-nowrap`: o grupo quebra
    // entre eles, e nenhum "2026: R$ 60 mi" se parte no meio.
    const pedacos = within(linha).getAllByText(/^\d{4}: R\$/)
    expect(pedacos.length).toBeGreaterThanOrEqual(4) // 2 anos x 2 rodadas
    for (const p of pedacos) expect(p).toHaveClass('whitespace-nowrap')
  })
})
