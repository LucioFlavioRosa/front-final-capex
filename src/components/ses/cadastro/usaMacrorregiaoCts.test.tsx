/**
 * A CAIXA DA MACRORREGIÃO RESPONDE NA HORA.
 *
 * Ela não é campo de ficha: é o regime da unidade, e o que ela muda é o que o
 * Fluxo oferece. Esperar o Salvar deixava a caixa marcada e a lista antiga na
 * mesma tela — e quem via as duas juntas concluía que a caixa não fazia nada.
 *
 * O componente é burro de propósito: recebe a linha, avisa a mudança e mostra a
 * recusa. Quem grava e relê é o contexto (`gravarUsaCts`). Estes testes prendem
 * o contrato do componente: o clique chega inteiro, e a recusa aparece onde quem
 * clicou está olhando — e não some.
 */
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { UsaMacrorregiaoCts } from './UsaMacrorregiaoCts'

const linha = (marcado: boolean) => ({ usa_macrorregiao_cts: marcado ? 'Sim' : 'Nao' })

describe('a caixa da macrorregião', () => {
  it('avisa a mudança com o valor novo', () => {
    const onMudar = vi.fn()
    render(
      <UsaMacrorregiaoCts linha={linha(false)} sistemasCheios={[]} recusa={null} onMudar={onMudar} />,
    )
    fireEvent.click(screen.getByRole('checkbox'))
    expect(onMudar).toHaveBeenCalledWith(true)
  })

  it('mostra a recusa do servidor ao lado da caixa, e a caixa fica onde estava', () => {
    // A célula local só muda depois que o servidor aceitou; numa recusa ela
    // continua como veio — aqui, desmarcada — e o motivo aparece como alerta.
    render(
      <UsaMacrorregiaoCts
        linha={linha(false)}
        sistemasCheios={[]}
        recusa="2 sistema(s) da unidade têm mais de uma CTS: 'd1s1' tem 'cts_001', 'cts_002'."
        onMudar={vi.fn()}
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent(/mais de uma CTS/)
    expect(screen.getByRole('checkbox')).not.toBeChecked()
  })

  it('sem recusa, não há alerta', () => {
    render(
      <UsaMacrorregiaoCts linha={linha(true)} sistemasCheios={[]} recusa={null} onMudar={vi.fn()} />,
    )
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByRole('checkbox')).toBeChecked()
  })
})
