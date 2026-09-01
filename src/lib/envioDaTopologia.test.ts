/**
 * QUAL SISTEMA VAI, E COM O QUE DENTRO — a decisão do envio da topologia.
 *
 * Aqui morava um defeito real, visto na tela: tirar uma CTS do sistema e
 * reapontar quem escoava para ela dava
 *
 *     'cts_002' não pode sair do sistema enquanto 'cts_001' escoa(m) para ele.
 *
 * mesmo com o desenho da tela perfeito. A causa era o envio: um `PUT` por
 * componente, ordenado por uma heurística que olhava o estado final da PRÓPRIA
 * linha — a saída da CTS (sem sistema) contava como "solta" e ia na frente do
 * reapontamento (com jusante), que contava como "liga". O servidor via a saída
 * enquanto o banco ainda tinha alguém apontando para a CTS, e recusava com razão.
 *
 * Não era caso de acertar a ordem: um reapontamento É um "solta" do ponto de
 * vista de quem ele larga, e há reorganização para a qual nenhuma ordem funciona.
 * Por isso o envio é o sistema INTEIRO num `PUT` só, e estes testes prendem o
 * que ele manda.
 */
import { describe, expect, it } from 'vitest'
import { envioDaTopologia } from './cadastroApi'
import type { Row } from '../data/cadastroUnidade/types'

/** Uma linha da aba `sistema-topologia`, com os três campos que importam aqui. */
const linha = (id: string, sistema: string, jusante = ''): Row =>
  ({
    componente_sistema_id: id,
    sistema_id: sistema,
    componente_sistema_id_jusante: jusante,
  }) as Row

/** `cts_001 → cts_002 → b1 → ete`, tudo no sistema `s1`. */
const SISTEMA = [
  linha('cts_001', 's1', 'cts_002'),
  linha('cts_002', 's1', 'b1'),
  linha('b1', 's1', 'ete'),
  linha('ete', 's1'),
]

/** Ordena por id: dentro do sistema a ordem é a das linhas, e não é contrato. */
const porId = (cs: { id: string; jusante: string }[]) =>
  [...cs].sort((a, b) => a.id.localeCompare(b.id))

describe('envioDaTopologia', () => {
  it('não manda nada quando o desenho não mudou', () => {
    expect(envioDaTopologia(SISTEMA, [...SISTEMA])).toBeNull()
  })

  it('tirar a CTS e reapontar quem escoava para ela vira UM envio com o sistema inteiro', () => {
    // É o caso que dava o erro na tela. A `cts_002` sai do sistema e a `cts_001`,
    // que escoava para ela, passa a escoar direto para a `b1`.
    const depois = [
      linha('cts_001', 's1', 'b1'),
      linha('cts_002', '', ''), // fora de sistema, mas a linha continua existindo
      linha('b1', 's1', 'ete'),
      linha('ete', 's1'),
    ]
    const envio = envioDaTopologia(SISTEMA, depois)

    expect(envio).toEqual({
      sistemas: [
        {
          id: 's1',
          componentes: [
            { id: 'cts_001', jusante: 'b1' },
            { id: 'b1', jusante: 'ete' },
            { id: 'ete', jusante: '' },
          ],
        },
      ],
    })
    // A CTS que saiu NÃO é mencionada: é a ausência dela na lista que a remove, e
    // é isso que faz as duas mudanças valerem na mesma transação.
    const ids = envio!.sistemas[0].componentes.map((c) => c.id)
    expect(ids).not.toContain('cts_002')
  })

  it('mudar só o jusante de uma linha manda o sistema inteiro, e não a linha', () => {
    // O corpo é o ESTADO do sistema, não um patch: mandar só quem mudou faria o
    // servidor entender que todos os outros saíram.
    const depois = SISTEMA.map((t) =>
      t.componente_sistema_id === 'b1' ? linha('b1', 's1', '') : t,
    )
    const envio = envioDaTopologia(SISTEMA, depois)
    expect(envio!.sistemas).toHaveLength(1)
    expect(envio!.sistemas[0].componentes).toHaveLength(4)
  })

  it('mover um componente entre sistemas manda os DOIS, para valerem juntos', () => {
    // É a reorganização sem ordem possível: separada em dois envios, um deles é
    // sempre recusado — o de origem porque alguém ainda aponta para o componente,
    // o de destino porque o jusante dele está noutro sistema.
    const antes = [linha('b1', 's1', 'ete1'), linha('ete1', 's1'), linha('ete2', 's2')]
    const depois = [linha('b1', 's2', 'ete2'), linha('ete1', 's1'), linha('ete2', 's2')]
    const envio = envioDaTopologia(antes, depois)

    expect(envio!.sistemas.map((s) => s.id)).toEqual(['s1', 's2'])
    expect(envio!.sistemas[0].componentes).toEqual([{ id: 'ete1', jusante: '' }])
    // A ordem DENTRO do sistema não é contrato — o servidor confere o desenho,
    // não a sequência. Aqui ela sai na ordem das linhas da grade.
    expect(porId(envio!.sistemas[1].componentes)).toEqual([
      { id: 'b1', jusante: 'ete2' },
      { id: 'ete2', jusante: '' },
    ])
  })

  it('esvaziar um sistema manda a lista vazia, e não some do envio', () => {
    // Sumir seria "nada mudou aqui", e o sistema ficaria como estava.
    const envio = envioDaTopologia([linha('b1', 's1', '')], [linha('b1', '', '')])
    expect(envio).toEqual({ sistemas: [{ id: 's1', componentes: [] }] })
  })

  it('colocar no sistema um componente que estava solto manda o sistema de destino', () => {
    const envio = envioDaTopologia(
      [linha('ete', 's1'), linha('cts_009', '', '')],
      [linha('ete', 's1'), linha('cts_009', 's1', 'ete')],
    )
    expect(envio!.sistemas).toEqual([
      {
        id: 's1',
        componentes: [
          { id: 'ete', jusante: '' },
          { id: 'cts_009', jusante: 'ete' },
        ],
      },
    ])
  })

  it('sistema que não foi tocado não entra no envio', () => {
    const antes = [...SISTEMA, linha('outro', 's9', 'ete9'), linha('ete9', 's9')]
    const depois = [
      ...SISTEMA.map((t) => (t.componente_sistema_id === 'b1' ? linha('b1', 's1', '') : t)),
      linha('outro', 's9', 'ete9'),
      linha('ete9', 's9'),
    ]
    expect(envioDaTopologia(antes, depois)!.sistemas.map((s) => s.id)).toEqual(['s1'])
  })

  it('espaço em volta do id não conta como mudança', () => {
    // A grade devolve o que foi digitado; sem o `trim` o envio sairia a cada
    // gravação, e a trilha registraria uma mudança que ninguém fez.
    expect(envioDaTopologia(SISTEMA, [linha(' cts_001 ', ' s1 ', ' cts_002 '), ...SISTEMA.slice(1)])).toBeNull()
  })
})
