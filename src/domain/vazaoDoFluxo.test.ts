/**
 * A VAZÃO QUE PASSA POR CADA LIGAÇÃO — o número por trás da espessura da linha
 * no desenho do fluxo de escoamento.
 *
 * É ACUMULADA, e é isso que estes testes prendem. Uma ligação carrega o esgoto
 * de tudo o que está acima dela: o trecho que sai de um tronco leva as
 * sub-bacias que desaguam nele, e não só a contribuição do próprio tronco. Na
 * cabeceira as duas contas coincidem — lá a acumulada É a contribuição da
 * própria sub-bacia ou CTS.
 *
 * A diferença entre as duas leituras é justamente o que faz o desenho valer:
 * com a local, o tronco perto da ETE apareceria fino, que é o oposto do que
 * acontece no cano.
 */
import { describe, expect, it } from 'vitest'
import { unifilarDoSistema, type Dados } from './fluxo'

/** `b1` e `b2` desaguam em `b3`, que vai para a ETE. A CTS entra em `b3`. */
function base(vazoes: Record<string, string>): Dados {
  const topo = [
    ['b1', 'b3'],
    ['b2', 'b3'],
    ['c1', 'b3'],
    ['b3', 'ete1'],
    ['ete1', ''],
  ]
  return {
    'sistema-topologia': topo.map(([id, jus]) => ({
      componente_sistema_id: id,
      componente_sistema_id_jusante: jus,
      sistema_id: 's1',
      componente_sistema_nome: id,
      componente_sistema_nome_jusante: jus,
    })),
    'subbacia-operacional': ['b1', 'b2', 'b3'].map((id) => ({
      sub_bacia_id: id,
      sub_bacia_name: id,
      sistema_id: 's1',
      vazao_contribuicao: vazoes[id] ?? '',
    })),
    'cts-operacional': [
      { cts_id: 'c1', cts_name: 'c1', sistema_id: 's1', vazao_contribuicao: vazoes.c1 ?? '' },
    ],
    'ete-capex': [{ ete_id: 'ete1', ete_name: 'ete1', sistema_id: 's1' }],
    'cidade-sistema': [{ sistema_id: 's1', sistema_name: 's1' }],
  } as unknown as Dados
}

const vazaoDe = (uni: ReturnType<typeof unifilarDoSistema>, de: string) =>
  uni.arestas.find((a) => a.de === de)?.vazao

describe('a vazão que passa por cada ligação', () => {
  it('na cabeceira, é a contribuição da própria sub-bacia', () => {
    const uni = unifilarDoSistema(base({ b1: '10', b2: '20', b3: '5', c1: '7' }), 's1')
    expect(vazaoDe(uni, 'b1')).toBe(10)
    expect(vazaoDe(uni, 'b2')).toBe(20)
    expect(vazaoDe(uni, 'c1')).toBe(7)
  })

  it('no tronco, soma tudo o que chega — é o que a linha grossa afirma', () => {
    // b3 → ete1 carrega b1 (10) + b2 (20) + c1 (7) + o próprio b3 (5).
    const uni = unifilarDoSistema(base({ b1: '10', b2: '20', b3: '5', c1: '7' }), 's1')
    expect(vazaoDe(uni, 'b3')).toBe(42)
  })

  it('cadastro pela metade soma o que sabe, em vez de ficar mudo', () => {
    // Só b1 preenchida: o tronco ainda ordena corretamente contra os ramos.
    const uni = unifilarDoSistema(base({ b1: '10' }), 's1')
    expect(vazaoDe(uni, 'b1')).toBe(10)
    expect(vazaoDe(uni, 'b3')).toBe(10)
    // O ramo sem nada acima nem em si continua desconhecido — e desconhecido
    // não é zero: no desenho ele sai tracejado, não fino.
    expect(vazaoDe(uni, 'b2')).toBeNull()
  })

  it('sem nenhuma vazão preenchida, nenhuma ligação inventa número', () => {
    const uni = unifilarDoSistema(base({}), 's1')
    for (const a of uni.arestas) expect(a.vazao).toBeNull()
  })

  it('formato pt-BR é lido como número, não como texto', () => {
    // `1.234,5` é como o valor viaja e como a célula o mostra.
    const uni = unifilarDoSistema(base({ b1: '1.234,5' }), 's1')
    expect(vazaoDe(uni, 'b1')).toBeCloseTo(1234.5)
  })

  it('ciclo não trava o desenho', () => {
    // Estado possível enquanto se cadastra: a validação denuncia, o desenho
    // mostra em vermelho — e esta conta não pode entrar em recursão infinita.
    const dados = base({ b1: '10', b2: '20', b3: '5' })
    const topo = dados['sistema-topologia'] as Record<string, string>[]
    topo.find((r) => r.componente_sistema_id === 'ete1')!.componente_sistema_id_jusante = 'b1'
    const uni = unifilarDoSistema(dados, 's1')
    expect(uni.arestas.length).toBeGreaterThan(0)
  })
})
