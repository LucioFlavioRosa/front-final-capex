/**
 * O MODELO DA PLANILHA E A MESCLA DA VOLTA — sem arquivo nenhum.
 *
 * O que se prende aqui é o contrato: quais abas vão, com que nome, que colunas
 * voltam; como um número atravessa nos dois sentidos; e como a planilha
 * preenchida encontra as linhas da tela — inclusive o que ela NÃO pode fazer
 * (mudar id, criar ficha, ser de outra unidade, mudar o regime de CTS, tirar
 * uma CTS do sistema). O `.xlsx` de verdade é assunto de `lib/planilhaCadastro`.
 */
import { describe, expect, it } from 'vitest'
import {
  LEIA_ME,
  SISTEMAS,
  colunasImportaveis,
  daCelula,
  editavelNaPlanilha,
  leiaMe,
  linhasDeSistemas,
  mesclarPlanilha,
  nomeDoArquivo,
  paraCelula,
  planilhasDoArquivo,
  planilhasDoCadastro,
  ptBr,
  regimeDeCts,
  simOuNao,
  type AbaLida,
  type PlanilhaLida,
} from './planilha'
import { SCHEMA } from '../data/cadastroUnidade/schema'
import { unidadeDeTeste } from '../testes/cadastroDePlanilha'

/** Monta uma aba lida como a biblioteca a entregaria: linhas cruas, chave = código da coluna. */
const aba = (linhas: Record<string, unknown>[]): AbaLida => ({
  colunas: [...new Set(linhas.flatMap((l) => Object.keys(l)))],
  linhas,
})

/** Um arquivo da unidade de teste: a aba Unidade com o id (obrigatória) mais o que o teste quiser. */
const arquivo = (abas: PlanilhaLida, unidade = 'uT1', macro = 'Nao'): PlanilhaLida => ({
  Unidade: aba([{ unidade_id: unidade, wacc_medio: 0.0873, usa_macrorregiao_cts: macro }]),
  ...abas,
})

describe('o modelo do arquivo', () => {
  it('tem uma aba por aba visível do cadastro, com nome que o Excel aceita', () => {
    const planilhas = planilhasDoCadastro(unidadeDeTeste().data)
    const visiveis = SCHEMA.filter((a) => !a.ocultaNoWizard)
    expect(planilhas.map((p) => p.aba.key)).toEqual(visiveis.map((a) => a.key))
    const nomes = planilhas.map((p) => p.nome)
    expect(new Set(nomes).size).toBe(nomes.length)
    for (const nome of [...nomes, LEIA_ME, SISTEMAS]) {
      expect(nome.length, nome).toBeLessThanOrEqual(31)
      expect(nome, nome).not.toMatch(/[[\]:*?/\\]/)
    }
  })

  it('no Fluxo, acrescenta sistema_id e sistema_name que a grade esconde', () => {
    const fluxo = planilhasDoCadastro(unidadeDeTeste().data).find((p) => p.aba.key === 'sistema-topologia')!
    expect(fluxo.colunas.slice(0, 2).map((c) => c.coluna)).toEqual(['sistema_id', 'sistema_name'])
    expect(fluxo.colunas.slice(0, 2).every((c) => c.origem === 'db')).toBe(true)
  })

  it('só devolve o que a unidade preenche, e nunca um id — nem a caixa da macrorregião', () => {
    const porAba = Object.fromEntries(SCHEMA.map((a) => [a.key, colunasImportaveis(a)]))
    expect(porAba['unidade-regional']).toEqual(['wacc_medio'])
    expect(porAba['empresa']).toEqual(['data_fim_concessao'])
    expect(porAba['cidade-operacional']).toEqual([])
    expect(porAba['metas-cobertura']).toEqual(['ano', 'cobertura_pct'])
    expect(porAba['sistema-topologia']).toEqual(['componente_sistema_id_jusante'])
    expect(porAba['componentes-cts-capex']).toContain('quantidade')
    expect(porAba['cts-operacional']).not.toContain('cts_id')
    expect(porAba['ete-capex']).not.toContain('sistema_id')
    for (const cols of Object.values(porAba)) {
      expect(cols.some((c) => c.endsWith('_id') || c.endsWith('_name'))).toBe(false)
    }
  })

  it('a caixa da macrorregião vai em cinza; o sistema da CTS vai em âmbar', () => {
    const unidade = SCHEMA.find((a) => a.key === 'unidade-regional')!
    expect(editavelNaPlanilha(unidade, unidade.cols.find((c) => c.coluna === 'usa_macrorregiao_cts')!)).toBe(false)
    expect(editavelNaPlanilha(unidade, unidade.cols.find((c) => c.coluna === 'wacc_medio')!)).toBe(true)
    const cts = SCHEMA.find((a) => a.key === 'cts-operacional')!
    expect(editavelNaPlanilha(cts, cts.cols.find((c) => c.coluna === 'sistema_id')!)).toBe(true)
  })

  it('a aba Sistemas lista os sistemas da unidade com a cidade', () => {
    expect(linhasDeSistemas(unidadeDeTeste().data)).toEqual([
      { sistema_id: 's1', sistema_name: 'Sistema Um', cidade_id: 'c1', cidade_name: 'Cidade Um' },
      { sistema_id: 's2', sistema_name: 'Sistema Dois', cidade_id: 'c1', cidade_name: 'Cidade Um' },
    ])
  })

  it('o Leia-me diz o regime, a regra, as fichas de CTS e como colocar uma no sistema', () => {
    const macro = leiaMe(unidadeDeTeste(true), unidadeDeTeste(true).data).flat().join('\n')
    expect(macro).toContain('Regime de CTS: MACRORREGIÃO')
    expect(macro).toContain('cada sistema aceita UMA CTS')
    const micro = leiaMe(unidadeDeTeste(false), unidadeDeTeste(false).data).flat().join('\n')
    expect(micro).toContain('Regime de CTS: MICRORREGIÃO')
    expect(micro).toContain('Fichas de CTS nesta planilha: 2, das quais 1 ainda sem sistema.')
    expect(micro).toContain('se decide na tela')
    expect(micro).toContain(`aba "${SISTEMAS}"`)
    // a tabela das abas lista cada uma com as colunas que a unidade preenche
    expect(micro).toContain('CAPEX das sub-bacias')
    expect(micro).toContain(SISTEMAS)
  })

  it('o regime vem da caixa da unidade', () => {
    expect(regimeDeCts(unidadeDeTeste(true).data)).toMatchObject({ macro: true, nome: 'Macrorregião' })
    expect(regimeDeCts(unidadeDeTeste(false).data)).toMatchObject({ macro: false, nome: 'Microrregião' })
    expect(regimeDeCts({})).toMatchObject({ macro: false })
  })

  it('o nome do arquivo leva a unidade e o dia', () => {
    expect(nomeDoArquivo({ id: 'uB2' }, new Date('2026-09-17T12:00:00Z'))).toBe('Cadastro_uB2_2026-09-17.xlsx')
  })
})

describe('número na ida e na volta', () => {
  it('texto pt-BR vira número na ida, e volta igual', () => {
    for (const [col, texto] of [
      ['preco_unitario', '1.026,89'],
      ['receita_faturada_media_mensal', '32.034,8'],
      ['wacc_medio', '0,0873'],
      ['quantidade', '319'],
      ['vazao_contribuicao', '-2,5'],
      ['obra_obrigatoria_ano', '2032'],
      ['data_fim_concessao', '2048'],
      ['capex_por_modulo', '1.500.000'],
    ] as const) {
      const celula = paraCelula(col, texto)
      expect(typeof celula, texto).toBe('number')
      expect(daCelula(col, celula), texto).toBe(texto)
    }
  })

  it('ano não ganha separador de milhar; quantidade ganha', () => {
    expect(ptBr(2028, 'obra_obrigatoria_ano')).toBe('2028')
    expect(ptBr(2028, 'ano')).toBe('2028')
    expect(ptBr(2028, 'quantidade')).toBe('2.028')
    expect(ptBr(1234.5)).toBe('1.234,5')
  })

  it('id, código e nome ficam como texto mesmo só com dígitos', () => {
    expect(paraCelula('cidade_id', '3550308')).toBe('3550308')
    expect(paraCelula('emp_codigo', '57')).toBe('57')
    expect(paraCelula('cts_name', '1234')).toBe('1234')
    expect(paraCelula('componente', 'EEE')).toBe('EEE')
  })

  it('o que não é número estrito passa como texto', () => {
    expect(paraCelula('preco_unitario', '1,234.5')).toBe('1,234.5')
    expect(paraCelula('preco_unitario', 'abc')).toBe('abc')
    expect(paraCelula('preco_unitario', '')).toBe('')
  })

  it('lê o que a biblioteca entrega: fórmula, texto formatado, hiperlink, vazio', () => {
    expect(daCelula('quantidade', { formula: 'A1*2', result: 20 })).toBe('20')
    expect(daCelula('componente', { richText: [{ text: 'Rede ' }, { text: 'coletora' }] })).toBe('Rede coletora')
    expect(daCelula('componente', { text: 'x', hyperlink: 'http://y' })).toBe('x')
    expect(daCelula('quantidade', { error: '#DIV/0!' })).toBe('')
    expect(daCelula('quantidade', null)).toBe('')
    expect(daCelula('quantidade', '  12 ')).toBe('12')
    expect(daCelula('nova', true)).toBe('Sim')
  })

  it('a caixa aceita o que uma pessoa escreve', () => {
    expect(simOuNao('sim')).toBe('Sim')
    expect(simOuNao('X')).toBe('Sim')
    expect(simOuNao(true)).toBe('Sim')
    expect(simOuNao('não')).toBe('Nao')
    expect(simOuNao('')).toBe('Nao')
    expect(simOuNao('talvez')).toBeNull()
  })
})

describe('a mescla da planilha preenchida', () => {
  it('atualiza a ficha pelo id e só nas colunas que a unidade preenche', () => {
    const unidade = unidadeDeTeste()
    const atual = unidade.data
    const r = mesclarPlanilha(unidade, arquivo({
      'Sub-bacias': aba([
        {
          sub_bacia_id: 'b1', preco_por_ligacao: 1100.5, tempo_arrecadacao: 3,
          // coluna do Databricks: o que vier aqui é ignorado
          receita_faturada_media_mensal: 999999, ligacoes_atuais: 1,
        },
      ]),
    }))
    expect(r.avisos).toEqual([])
    expect(r.alteracoes).toBe(2)
    const linha = r.dados['subbacia-operacional'][0]
    expect(linha.preco_por_ligacao).toBe('1.100,5')
    expect(linha.tempo_arrecadacao).toBe('3')
    expect(linha.receita_faturada_media_mensal).toBe('32.034,8')
    expect(linha.ligacoes_atuais).toBe('140')
    // a linha da tela não foi mutada — o diff do Salvar depende disso
    expect(atual['subbacia-operacional'][0].preco_por_ligacao).toBe('1.026,89')
    // coluna que a planilha não trouxe fica como estava
    expect(linha.vazao_contribuicao).toBe('20,6')
  })

  it('as obras casam por ficha + componente', () => {
    const unidade = unidadeDeTeste()
    const r = mesclarPlanilha(unidade, arquivo({
      'CAPEX das sub-bacias': aba([
        { sub_bacia_id: 'b1', componente: 'Ligacao de esgoto', quantidade: 300, obra_obrigatoria_ano: 2033 },
        { sub_bacia_id: 'b1', componente: 'Rede coletora', quantidade: 319 },
      ]),
      'CAPEX da CTS': aba([{ cts_id: 'cts_001', componente: 'Coletor de tempo seco', preco_unitario: 3000 }]),
    }))
    expect(r.avisos).toEqual([])
    const obras = r.dados['componentes-subbacias-capex']
    expect(obras[1]).toMatchObject({ quantidade: '300', obra_obrigatoria_ano: '2033' })
    expect(obras[0]).toBe(unidade.data['componentes-subbacias-capex'][0]) // sem mudança: a linha da tela é reaproveitada
    expect(r.dados['componentes-cts-capex'][0].preco_unitario).toBe('3.000')
    expect(r.alteracoes).toBe(3)
  })

  it('a CTS livre tem ficha e obras para preencher, antes de ter sistema', () => {
    const r = mesclarPlanilha(unidadeDeTeste(), arquivo({
      'Dados da CTS': aba([{ cts_id: 'cts_002', preco_por_ligacao: 950 }]),
      'CAPEX da CTS': aba([{ cts_id: 'cts_002', componente: 'Coletor de tempo seco', quantidade: 45, preco_unitario: 2800 }]),
    }))
    expect(r.avisos).toEqual([])
    expect(r.dados['cts-operacional'][1]).toMatchObject({ cts_id: 'cts_002', preco_por_ligacao: '950', sistema_id: '' })
    expect(r.dados['componentes-cts-capex'][1]).toMatchObject({ quantidade: '45', preco_unitario: '2.800' })
  })

  it('id que o cadastro não conhece é avisado e ignorado — a planilha não cria ficha', () => {
    const r = mesclarPlanilha(unidadeDeTeste(), arquivo({
      'Sub-bacias': aba([{ sub_bacia_id: 'b99', preco_por_ligacao: 1 }]),
      'Dados da CTS': aba([{ cts_id: 'cts_009', preco_por_ligacao: 1 }]),
    }))
    expect(r.dados).toEqual({})
    expect(r.avisos).toHaveLength(2)
    expect(r.avisos[0]).toMatch(/Sub-bacias, linha 3: "b99" não existe/)
    expect(r.avisos[1]).toMatch(/Dados da CTS, linha 3: "cts_009" não existe/)
  })

  it('célula em branco apaga o valor; linha toda em branco é ignorada', () => {
    const r = mesclarPlanilha(unidadeDeTeste(), arquivo({
      'Sub-bacias': aba([
        { sub_bacia_id: 'b1', potencial_crescimento: null },
        { sub_bacia_id: null, potencial_crescimento: null },
      ]),
    }))
    expect(r.avisos).toEqual([])
    expect(r.dados['subbacia-operacional'][0].potencial_crescimento).toBe('')
  })

  it('fórmula sem resultado calculado não apaga a célula — avisa e deixa como estava', () => {
    const r = mesclarPlanilha(unidadeDeTeste(), arquivo({
      'Sub-bacias': aba([{ sub_bacia_id: 'b1', preco_por_ligacao: { formula: 'B3*2' }, tempo_ramp_up: 7 }]),
      'Metas de cobertura': aba([{ cidade_id: 'c1', ano: 2030, cobertura_pct: { formula: 'C3+1' } }]),
    }))
    expect(r.dados['subbacia-operacional'][0]).toMatchObject({ preco_por_ligacao: '1.026,89', tempo_ramp_up: '7' })
    // numa lista não há o que preservar: a aba inteira fica de fora
    expect(r.dados['metas-cobertura']).toBeUndefined()
    // na ordem do stepper: Metas vem antes de Sub-bacias
    expect(r.avisos).toEqual([
      expect.stringMatching(/Metas de cobertura, linha 3: "Cobertura \(%\)" tem uma fórmula sem resultado.*aba inteira ficou de fora/),
      expect.stringMatching(/Sub-bacias, linha 3: "Preço por nova ligação" tem uma fórmula sem resultado/),
    ])
  })

  it('fórmula sem resultado no sistema da CTS não coloca, e avisa', () => {
    const r = mesclarPlanilha(unidadeDeTeste(), arquivo({
      'Dados da CTS': aba([{ cts_id: 'cts_002', sistema_id: { formula: 'Sistemas!A3' } }]),
    }))
    expect(r.dados).toEqual({})
    expect(r.avisos).toEqual([expect.stringMatching(/Dados da CTS, linha 3: "ID Sistema" tem uma fórmula sem resultado.*não foi colocada/)])
  })

  it('nada diferente: nenhuma aba volta', () => {
    const r = mesclarPlanilha(unidadeDeTeste(), arquivo({
      'Sub-bacias': aba([{ sub_bacia_id: 'b1', preco_por_ligacao: 1026.89 }]),
      'Empresas': aba([{ emp_codigo: '57', data_fim_concessao: 2048 }]),
    }))
    expect(r.dados).toEqual({})
    expect(r.alteracoes).toBe(0)
    expect(r.linhasLidas).toBe(3)
  })

  it('metas e faixas: a lista do arquivo substitui a da tela, e a cidade tem de ser da unidade', () => {
    const r = mesclarPlanilha(unidadeDeTeste(), arquivo({
      'Metas de cobertura': aba([
        { cidade_id: 'c1', ano: 2030, cobertura_pct: 85 },
        { cidade_id: 'c1', ano: 2040, cobertura_pct: 95 },
        { cidade_id: 'c1', ano: 2045, cobertura_pct: 100 },
        { cidade_id: 'c9', ano: 2050, cobertura_pct: 100 },
      ]),
    }))
    expect(r.avisos).toEqual([expect.stringMatching(/Metas de cobertura, linha 6: a cidade "c9" não é desta unidade/)])
    const metas = r.dados['metas-cobertura']
    expect(metas).toHaveLength(3)
    expect(metas[1]).toEqual({
      emp_codigo: '57', empresa: 'Empresa 57', cidade_id: 'c1', cidade_name: 'Cidade Um', ano: '2040', cobertura_pct: '95',
    })
  })

  it('cidade sem registro ganha uma linha-modelo no arquivo, e a tela não', () => {
    const { data } = unidadeDeTeste()
    const metas = planilhasDoArquivo(data).find((p) => p.aba.key === 'metas-cobertura')!
    expect(metas.linhas.map((l) => l.cidade_id)).toEqual(['c1', 'c1', 'c2'])
    expect(metas.linhas[2]).toEqual({ emp_codigo: '57', empresa: 'Empresa 57', cidade_id: 'c2', cidade_name: 'Cidade Dois', ano: '', cobertura_pct: '' })
    const faixas = planilhasDoArquivo(data).find((p) => p.aba.key === 'fator-esgoto')!
    expect(faixas.linhas.map((l) => l.cidade_id)).toEqual(['c1', 'c2'])
    // a tela continua com o que tem
    expect(planilhasDoCadastro(data).find((p) => p.aba.key === 'metas-cobertura')!.linhas).toHaveLength(2)
    expect(data['fator-esgoto']).toHaveLength(1)
  })

  it('a linha-modelo intocada não vira registro; preenchida, vira', () => {
    const modelo = { cidade_id: 'c2', ano: null, cobertura_pct: null }
    const r = mesclarPlanilha(unidadeDeTeste(), arquivo({
      'Metas de cobertura': aba([
        { cidade_id: 'c1', ano: 2030, cobertura_pct: 80 },
        { cidade_id: 'c1', ano: 2035, cobertura_pct: 90 },
        modelo,
      ]),
      'Escala de paridade': aba([{ cidade_id: 'c1', cobertura_pct: 0, paridade: 1 }, { cidade_id: 'c2', cobertura_pct: 0, paridade: 0.8 }]),
    }))
    expect(r.avisos).toEqual([])
    expect(r.dados['metas-cobertura']).toBeUndefined() // igual ao que a tela tem
    expect(r.dados['fator-esgoto']).toHaveLength(2)
    expect(r.dados['fator-esgoto'][1]).toMatchObject({ cidade_id: 'c2', cidade_name: 'Cidade Dois', cobertura_pct: '0', paridade: '0,8' })
  })

  it('a ETE aceita "sim" na coluna nova e guarda no vocabulário do select', () => {
    const r = mesclarPlanilha(unidadeDeTeste(), arquivo({
      'CAPEX das ETEs': aba([{ ete_id: 'e1', nova: 'sim', modulos: 3, capacidade_ociosa: 0 }]),
    }))
    expect(r.dados['ete-capex'][0]).toMatchObject({ nova: 'Sim', modulos: '3', capacidade_ociosa: '40' })
  })

  describe('de que unidade é o arquivo', () => {
    it('grava o WACC da unidade', () => {
      const r = mesclarPlanilha(unidadeDeTeste(), arquivo({}, 'uT1'))
      expect(r.dados).toEqual({})
      const r2 = mesclarPlanilha(unidadeDeTeste(), { Unidade: aba([{ unidade_id: 'uT1', wacc_medio: 0.09 }]) })
      expect(r2.dados['unidade-regional'][0].wacc_medio).toBe('0,09')
    })

    it('planilha de outra unidade não entra — os ids se repetem entre unidades', () => {
      const r = mesclarPlanilha(unidadeDeTeste(), arquivo({
        'Sub-bacias': aba([{ sub_bacia_id: 'b1', preco_por_ligacao: 1 }]),
      }, 'uB9'))
      expect(r.dados).toEqual({})
      expect(r.avisos).toEqual(['Esta planilha é da unidade uB9, e a tela está em uT1. Nada foi importado.'])
    })

    it('sem a aba Unidade não há como saber, e nada entra', () => {
      const r = mesclarPlanilha(unidadeDeTeste(), {
        'Sub-bacias': aba([{ sub_bacia_id: 'b1', preco_por_ligacao: 1 }]),
      })
      expect(r.dados).toEqual({})
      expect(r.avisos).toEqual([expect.stringMatching(/não tem a aba "Unidade" com o id/)])
    })
  })

  describe('a macrorregião se decide na tela', () => {
    it('a célula da caixa não volta: marcar na planilha não marca na tela', () => {
      const r = mesclarPlanilha(unidadeDeTeste(true), arquivo({}, 'uT1', 'Sim'))
      expect(r.dados).toEqual({})
      expect(r.avisos).toEqual([])
    })

    it('planilha gerada no outro regime: as abas de CTS ficam de fora, o resto entra', () => {
      const r = mesclarPlanilha(unidadeDeTeste(false), arquivo({
        'Dados da CTS': aba([{ cts_id: 'cts_001', preco_por_ligacao: 1 }]),
        'CAPEX da CTS': aba([{ cts_id: 'cts_001', componente: 'Coletor de tempo seco', quantidade: 1 }]),
        'Sub-bacias': aba([{ sub_bacia_id: 'b1', tempo_ramp_up: 6 }]),
      }, 'uT1', 'Sim'))
      expect(Object.keys(r.dados)).toEqual(['subbacia-operacional'])
      expect(r.avisos).toEqual([expect.stringMatching(/gerada com a macrorregião de CTS marcada, e a tela está desmarcada.*ficaram de fora/)])
    })
  })

  describe('a CTS entra num sistema pela aba Dados da CTS', () => {
    it('pelo id: a CTS e a linha dela no Fluxo ganham o sistema, o jusante fica para a tela', () => {
      const unidade = unidadeDeTeste()
      const r = mesclarPlanilha(unidade, arquivo({
        'Dados da CTS': aba([{ cts_id: 'cts_002', sistema_id: 's2', preco_por_ligacao: 950 }]),
      }))
      expect(r.avisos).toEqual([])
      expect(r.alteracoes).toBe(2)
      expect(r.dados['cts-operacional'][1]).toMatchObject({ cts_id: 'cts_002', sistema_id: 's2', sistema_name: 'Sistema Dois', preco_por_ligacao: '950' })
      const topo = r.dados['sistema-topologia'].find((t) => t.componente_sistema_id === 'cts_002')!
      expect(topo).toMatchObject({ sistema_id: 's2', sistema_name: 'Sistema Dois', componente_sistema_id_jusante: '' })
      // as colunas que só a linha livre carrega continuam lá — o seletor de CTS depende delas
      expect(topo).toMatchObject({ emp_codigo: '57', cidade_id: 'c1', macro: 'Nao' })
      // e a tela não foi mutada
      expect(unidade.data['sistema-topologia'][3].sistema_id).toBe('')
    })

    it('pelo nome, quando é único', () => {
      const r = mesclarPlanilha(unidadeDeTeste(), arquivo({
        'Dados da CTS': aba([{ cts_id: 'cts_002', sistema_id: 'sistema dois' }]),
      }))
      expect(r.avisos).toEqual([])
      expect(r.dados['cts-operacional'][1].sistema_id).toBe('s2')
    })

    it('sistema que não é da unidade é recusado, apontando a aba Sistemas', () => {
      const r = mesclarPlanilha(unidadeDeTeste(), arquivo({
        'Dados da CTS': aba([{ cts_id: 'cts_002', sistema_id: 's9' }]),
      }))
      expect(r.dados).toEqual({})
      expect(r.avisos).toEqual([expect.stringMatching(new RegExp(`Dados da CTS, linha 3: o sistema "s9" não é desta unidade.*${SISTEMAS}`))])
    })

    it('mudar de sistema ou sair dele é pela tela', () => {
      const r = mesclarPlanilha(unidadeDeTeste(), arquivo({
        'Dados da CTS': aba([
          { cts_id: 'cts_001', sistema_id: 's2' },
          { cts_id: 'cts_001', sistema_id: '' },
        ]),
      }))
      expect(r.dados).toEqual({})
      expect(r.avisos).toEqual([
        expect.stringMatching(/"cts_001" já está no sistema s1 — mudar de sistema é pela tela/),
        expect.stringMatching(/"cts_001" está no sistema s1 — tirar uma CTS do sistema é pela tela/),
      ])
    })

    it('com a macrorregião marcada, um sistema que já tem CTS não recebe outra — nem duas na mesma planilha', () => {
      const unidade = unidadeDeTeste(true)
      // com a macrorregião marcada o servidor não serve livres, mas a regra vale se servir
      const r = mesclarPlanilha(unidade, arquivo({
        'Dados da CTS': aba([{ cts_id: 'cts_002', sistema_id: 's1' }]),
      }, 'uT1', 'Sim'))
      expect(r.dados).toEqual({})
      expect(r.avisos).toEqual([expect.stringMatching(/o sistema Sistema Um já tem uma CTS, e a unidade usa macrorregião/)])

      // duas livres para o mesmo sistema vazio: a primeira entra, a segunda não
      unidade.data['cts-operacional'].push({ ...unidade.data['cts-operacional'][1], cts_id: 'cts_003', cts_name: 'CTS 003' })
      unidade.data['sistema-topologia'].push({ ...unidade.data['sistema-topologia'][3], componente_sistema_id: 'cts_003', componente_sistema_nome: 'CTS 003' })
      const r2 = mesclarPlanilha(unidade, arquivo({
        'Dados da CTS': aba([
          { cts_id: 'cts_002', sistema_id: 's2' },
          { cts_id: 'cts_003', sistema_id: 's2' },
        ]),
      }, 'uT1', 'Sim'))
      expect(r2.dados['cts-operacional'].map((c) => c.sistema_id)).toEqual(['s1', 's2', ''])
      expect(r2.avisos).toEqual([expect.stringMatching(/linha 4: o sistema Sistema Dois já tem uma CTS/)])
    })

    it('sem a macrorregião, várias CTS entram no mesmo sistema', () => {
      const r = mesclarPlanilha(unidadeDeTeste(false), arquivo({
        'Dados da CTS': aba([{ cts_id: 'cts_002', sistema_id: 's1' }]),
      }))
      expect(r.avisos).toEqual([])
      expect(r.dados['cts-operacional'][1].sistema_id).toBe('s1')
    })
  })

  describe('o Fluxo de escoamento', () => {
    it('muda o destino de quem já está num sistema, e o nome do destino vem junto', () => {
      const r = mesclarPlanilha(unidadeDeTeste(), arquivo({
        'Fluxo de escoamento': aba([{ componente_sistema_id: 'cts_001', componente_sistema_id_jusante: 'e1' }]),
      }))
      expect(r.avisos).toEqual([])
      const cts = r.dados['sistema-topologia'].find((t) => t.componente_sistema_id === 'cts_001')!
      expect(cts).toMatchObject({ componente_sistema_id_jusante: 'e1', componente_sistema_nome_jusante: 'ETE Um', sistema_id: 's1' })
    })

    it('não coloca CTS livre em sistema pelo Fluxo — isso é pela aba da CTS', () => {
      const r = mesclarPlanilha(unidadeDeTeste(), arquivo({
        'Fluxo de escoamento': aba([{ componente_sistema_id: 'cts_002', componente_sistema_id_jusante: 'b1' }]),
      }))
      expect(r.dados).toEqual({})
      expect(r.avisos).toEqual([expect.stringMatching(/"cts_002" está fora de sistema — coloque-a pela aba "Dados da CTS"/)])
    })

    it('destino que não existe é recusado', () => {
      const r = mesclarPlanilha(unidadeDeTeste(), arquivo({
        'Fluxo de escoamento': aba([{ componente_sistema_id: 'b1', componente_sistema_id_jusante: 'zzz' }]),
      }))
      expect(r.dados).toEqual({})
      expect(r.avisos).toEqual([expect.stringMatching(/o destino "zzz" não existe/)])
    })
  })

  it('aba que não é do cadastro é avisada; as de apoio, não; o nome é tolerante a caixa e espaço', () => {
    const r = mesclarPlanilha(unidadeDeTeste(), arquivo({ Rascunho: aba([{ a: 1 }]), [SISTEMAS]: aba([{ sistema_id: 's1' }]) }))
    expect(r.avisos).toEqual(['A aba "Rascunho" não é uma aba do cadastro e foi ignorada.'])
    const r2 = mesclarPlanilha(unidadeDeTeste(), arquivo({ ' sub-bacias ': aba([{ sub_bacia_id: 'b1', tempo_ramp_up: 6 }]) }))
    expect(r2.dados['subbacia-operacional'][0].tempo_ramp_up).toBe('6')
  })
})
