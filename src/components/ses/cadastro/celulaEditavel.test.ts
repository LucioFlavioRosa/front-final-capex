/**
 * A GRADE E A PLANILHA RESPONDEM A MESMA PERGUNTA — "o servidor grava esta coluna?".
 *
 * Pedido do dono do produto em 01/10/2026: *"é para permitir atualizar todas as colunas"*.
 * O que impedia era a regra estrutural da grade, `origem !== 'db'`: ela travava a medida da
 * base comercial, embora a ficha de coleta grave `{...bloco_db, ...params}` — com trilha de
 * quem sobrepôs. Um dado errado na base só podia ser corrigido fora da plataforma, e
 * esperando a carga seguinte.
 *
 * Este teste existe pela ASSIMETRIA, mais do que pela liberação: enquanto só a planilha
 * soltasse essas colunas, o arquivo poderia mais que a tela — e o aviso da importação
 * ("ela vem preenchida para dar contexto; para mudá-la, use a tela") estaria mandando a
 * pessoa para o único lugar onde a mudança é impossível. Os dois lados saem do mesmo
 * contrato, e é isto que confere que continuam saindo.
 */
import { describe, expect, it } from 'vitest'
import { celulaEditavel } from './AbaGrid'
import { SCHEMA } from '../../../data/cadastroUnidade/schema'
import type { AbaDef, Row } from '../../../data/cadastroUnidade/types'
import { colunasImportaveis } from '../../../domain/planilha'

const aba = (key: string): AbaDef => SCHEMA.find((a) => a.key === key)!
const origemDe = (key: string, col: string) => aba(key).cols.find((c) => c.coluna === col)!.origem
const podeDigitar = (key: string, col: string, row: Row = { nova: 'Não' }) =>
  celulaEditavel(aba(key), row, col, origemDe(key, col))

describe('o que a grade deixa digitar', () => {
  it('a medida que veio da base é sobreponível, na sub-bacia e na CTS', () => {
    for (const key of ['subbacia-operacional', 'cts-operacional']) {
      // continuam marcadas como `db` no cabeçalho — a etiqueta diz de ONDE o valor veio,
      // e isso não mudou. O que mudou é quem pode corrigi-lo.
      expect(origemDe(key, 'ligacoes_atuais'), key).toBe('db')
      expect(podeDigitar(key, 'ligacoes_atuais'), key).toBe(true)
      expect(podeDigitar(key, 'receita_faturada_media_mensal'), key).toBe(true)
      expect(podeDigitar(key, 'universo_economias_residencial'), key).toBe(true)
    }
  })

  it('a derivada continua travada: é conta do servidor', () => {
    // `ticket_medio` é receita ÷ ligações totais, e as `*_com_cts` são o que sobra para a
    // sub-bacia com a CTS. O servidor recusa as duas no corpo do `PUT`.
    expect(podeDigitar('subbacia-operacional', 'ticket_medio')).toBe(false)
    expect(podeDigitar('subbacia-operacional', 'ligacoes_atuais_com_cts')).toBe(false)
  })

  it('a identidade da linha continua travada', () => {
    expect(podeDigitar('subbacia-operacional', 'sub_bacia_id')).toBe(false)
    expect(podeDigitar('componentes-subbacias-capex', 'sub_bacia_name')).toBe(false)
  })

  it('a cidade continua se escolhendo nas abas de lista, e só nelas', () => {
    // Ali ela é a identidade da linha que a pessoa está criando, não um dado da ficha.
    expect(podeDigitar('metas-cobertura', 'cidade_id')).toBe(true)
    expect(podeDigitar('cidade-operacional', 'cidade_id')).toBe(false)
  })

  it('o campo calculado e a ETE que não é nova seguem como estavam', () => {
    expect(podeDigitar('componentes-subbacias-capex', 'unidade')).toBe(false)
    const ete = aba('ete-capex')
    const terreno = ete.cols.find((c) => c.coluna === 'capex_terreno')!
    expect(celulaEditavel(ete, { nova: 'Não' }, 'capex_terreno', terreno.origem)).toBe(false)
    expect(celulaEditavel(ete, { nova: 'Sim' }, 'capex_terreno', terreno.origem)).toBe(true)
  })

  it('na macrorregião, a medida da base da CTS volta a ser leitura', () => {
    // O servidor refaz a soma a cada gravação (ver `gravavel.ts`): digitar ali seria
    // digitar para ver o valor voltar. A grade trava pelo MESMO contrato da planilha.
    const cts = aba('cts-operacional')
    const col = cts.cols.find((c) => c.coluna === 'ligacoes_atuais')!
    expect(celulaEditavel(cts, {}, 'ligacoes_atuais', col.origem, { ctsSomada: false })).toBe(true)
    expect(celulaEditavel(cts, {}, 'ligacoes_atuais', col.origem, { ctsSomada: true })).toBe(false)
    // o parâmetro da coleta continua: o servidor só refaz o bloco `db`
    const preco = cts.cols.find((c) => c.coluna === 'preco_por_ligacao')!
    expect(celulaEditavel(cts, {}, 'preco_por_ligacao', preco.origem, { ctsSomada: true })).toBe(true)
  })

  it('a grade deixa digitar tudo o que a planilha leva de volta', () => {
    // A ASSIMETRIA, virada teste. Coluna que o arquivo aceita e a tela trava é um aviso
    // mentiroso esperando para acontecer.
    // NOS DOIS REGIMES de CTS: a exceção da macrorregião tem de valer dos dois lados, ou
    // a assimetria volta só para as unidades que usam macrorregião — o pior dos casos,
    // porque ninguém olharia ali.
    for (const ctsSomada of [false, true]) {
      const travadas: string[] = []
      for (const a of SCHEMA) {
        for (const col of colunasImportaveis(a, { ctsSomada })) {
          const origem = a.cols.find((c) => c.coluna === col)!.origem
          //: a ETE nova é a exceção legítima: as colunas dos módulos iniciais só fazem
          //: sentido quando `nova` é Sim, e é a linha que decide — não a coluna.
          if (!celulaEditavel(a, { nova: 'Sim' }, col, origem, { ctsSomada })) {
            travadas.push(`${a.key}.${col}`)
          }
        }
      }
      expect(travadas, `ctsSomada=${ctsSomada}`).toEqual([])
    }
  })
})
