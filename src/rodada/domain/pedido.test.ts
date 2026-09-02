import { describe, expect, it } from 'vitest'
import { ordenarParametros, rotuloDoParametro, rotuloObjetivo, valorDoParametro } from '@/rodada/domain/pedido'

describe('rotuloObjetivo — o objetivo se lê como foi escolhido', () => {
  it('as três escolhas da tela viram o texto das próprias pílulas', () => {
    // Os textos têm de ser IGUAIS aos dos botões de "Objetivo" em Simular.
    // Divergir aqui faria a mesma rodada ser descrita de dois jeitos: um ao
    // montar, outro ao ler o resultado.
    expect(rotuloObjetivo(1)).toBe('Cobertura')
    expect(rotuloObjetivo(0.5)).toBe('Equilíbrio')
    expect(rotuloObjetivo(0)).toBe('Só VPL')
  })

  it('NUNCA devolve o número cru nas três escolhas', () => {
    // O defeito que motivou isto: as telas de resultado mostravam "Objetivo 1",
    // e quem não montou a rodada não tem como saber para que lado o 1 puxa.
    for (const v of [0, 0.5, 1]) expect(rotuloObjetivo(v)).not.toMatch(/\d/)
  })

  it('valor fora das três MOSTRA o número, em vez de escondê-lo', () => {
    // O payload aceita a faixa toda, e um pedido montado por script pode trazer
    // 0,7. Chamá-lo só de "Equilíbrio" apagaria a diferença para o 0,5 clicado.
    expect(rotuloObjetivo(0.7)).toBe('Equilíbrio (0,7)')
    expect(rotuloObjetivo(0.2)).toBe('Equilíbrio (0,2)')
  })

  it('o pedido formata o objetivo pelo rótulo, e não como número', () => {
    expect(valorDoParametro('FOCO_COBERTURA', 1)).toBe('Cobertura')
    expect(valorDoParametro('FOCO_COBERTURA', 0)).toBe('Só VPL')
    // E os outros números do pedido seguem números.
    expect(valorDoParametro('WORKERS', 4)).toBe('4')
  })

  it('nomeia os booleanos da simulação com as mesmas palavras da tela', () => {
    expect(rotuloDoParametro('USAR_CTS')).toBe('Coletores de tempo seco')
    // NÃO "ignorar": desligado, a demanda da CTS é SOMADA à sub-bacia irmã —
    // ela continua no plano. A palavra tem de dizer o que acontece, e não
    // sugerir que o coletor sumiu da conta.
    expect(valorDoParametro('USAR_CTS', true)).toBe('orçar à parte')
    expect(valorDoParametro('USAR_CTS', false)).toBe('somar à sub-bacia')
    expect(rotuloDoParametro('COBERTURA_SO_RESIDENCIAL')).toBe('Recorte da cobertura')
    expect(valorDoParametro('COBERTURA_SO_RESIDENCIAL', true)).toBe('só residenciais')
    expect(valorDoParametro('COBERTURA_SO_RESIDENCIAL', false)).toBe('todas as ligações')
    expect(ordenarParametros({ WORKERS: 4, COBERTURA_SO_RESIDENCIAL: true }).map(([k]) => k)).toEqual([
      'COBERTURA_SO_RESIDENCIAL',
      'WORKERS',
    ])
  })
})
