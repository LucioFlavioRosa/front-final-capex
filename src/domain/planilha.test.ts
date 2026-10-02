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
  COLOCA_NO_SISTEMA,
  CRIAVEL_POR_ABA,
  LEIA_ME,
  SISTEMAS,
  colunaImportavel,
  colunasImportaveis,
  daCelula,
  editavelNaPlanilha,
  leiaMe,
  linhasNoArquivo,
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
import { ABAS_VISIVEIS } from '../data/cadastroUnidade/blocos'
import { GRAVAVEL_POR_ABA } from '../data/cadastroUnidade/gravavel'
import { unidadeDeTeste } from '../testes/cadastroDePlanilha'
import type { Dados } from './fluxo'

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

  it('devolve o que o servidor GRAVA — inclusive a medida que veio da base', () => {
    const porAba = Object.fromEntries(SCHEMA.map((a) => [a.key, colunasImportaveis(a)]))
    expect(porAba['unidade-regional']).toEqual(['wacc_medio'])
    //: o NOME da empresa entrou em 01/10/2026 — ver o teste dele mais abaixo
    expect(porAba['empresa']).toEqual(['empresa', 'data_fim_concessao'])
    //: a cidade ganhou o NOME; fora dele continua sem campo proprio
    expect(porAba['cidade-operacional']).toEqual(['cidade_name'])
    expect(porAba['metas-cobertura']).toEqual(['ano', 'cobertura_pct'])
    expect(porAba['sistema-topologia']).toEqual(['componente_sistema_id_jusante'])
    expect(porAba['componentes-cts-capex']).toContain('quantidade')
    expect(porAba['cts-operacional']).not.toContain('cts_id')
    expect(porAba['ete-capex']).not.toContain('sistema_id')
    // ID NUNCA ENTRA — ele é a identidade, e a mescla casa por ele. NOME entra desde
    // 01/10/2026, e só o das quatro fichas que ganharam campo no serviço.
    const NOMES_LIBERADOS = ['cidade_name', 'sistema_name', 'sub_bacia_name', 'ete_name', 'cts_name']
    for (const [chave, cols] of Object.entries(porAba)) {
      expect(cols.filter((c) => c.endsWith('_id')), chave).toEqual([])
      expect(cols.filter((c) => c.endsWith('_name') && !NOMES_LIBERADOS.includes(c)), chave).toEqual([])
    }
    expect(porAba['subbacia-operacional']).toContain('sub_bacia_name')
    expect(porAba['cts-operacional']).toContain('cts_name')
    expect(porAba['ete-capex']).toContain('ete_name')
    //: o do sistema continua fora: ele não tem ficha no wizard — ver `gravavel.ts`
    expect(porAba['sistema-topologia']).not.toContain('sistema_name')

    // A ABERTURA DE 01/10/2026. `_gravar_coleta` escreve `{...bloco_db, ...params}`: a
    // medida que veio do Databricks é sobreponível, com trilha. A planilha a recusava
    // porque olhava a ORIGEM do valor, que é informação de apresentação.
    for (const chave of ['subbacia-operacional', 'cts-operacional']) {
      expect(porAba[chave], chave).toContain('receita_faturada_media_mensal')
      expect(porAba[chave], chave).toContain('ligacoes_atuais')
      expect(porAba[chave], chave).toContain('universo_economias_residencial')
      // e a derivada continua fora: o servidor a calcula e recusa no corpo
      expect(porAba[chave], chave).not.toContain('ticket_medio')
    }
    expect(porAba['subbacia-operacional']).not.toContain('ligacoes_atuais_com_cts')

    // `unidade` da obra é fixa por tipo de componente — é o que faz quantidade × preço
    // ser comparável entre obras. O `PUT` a envia; a planilha não a solta.
    expect(porAba['componentes-subbacias-capex']).not.toContain('unidade')
    // `componente` é metade da chave de casamento: mudá-la é trocar de obra.
    expect(porAba['componentes-cts-capex']).not.toContain('componente')
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
    //: o item 4 dizia que id desconhecido é ignorado — e isso ficou falso quando as abas
    //: passaram a criar. É o texto que vai DENTRO do arquivo que a pessoa baixa.
    expect(micro).toContain('LINHA NOVA se cria aqui')
    expect(micro).toContain('a cidade pede a empresa')
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
  it('atualiza a ficha pelo id, inclusive a medida que veio da base', () => {
    const unidade = unidadeDeTeste()
    const atual = unidade.data
    const r = mesclarPlanilha(unidade, arquivo({
      'Sub-bacias': aba([
        {
          sub_bacia_id: 'b1', preco_por_ligacao: 1100.5, tempo_arrecadacao: 3,
          // medida da base comercial: o servidor a GRAVA, com trilha de override
          receita_faturada_media_mensal: 999999, ligacoes_atuais: 1,
          // derivada: o servidor a calcula e recusa no corpo — esta é ignorada, com aviso
          ticket_medio: 42,
        },
      ]),
    }))
    // A EXPECTATIVA DESTE TESTE JÁ MUDOU DUAS VEZES, e a história importa:
    //
    // 1. No começo ele mudava duas colunas do Databricks de propósito e afirmava
    //    `avisos: []` — ou seja, afirmava o SILÊNCIO que o tester relatou em 30/09/2026.
    // 2. Em 30/09 passou a exigir o aviso: ignorada não é invisível.
    // 3. Em 01/10, a pedido do dono do produto ("permitir atualizar todas as colunas"),
    //    elas deixaram de ser ignoradas: `_gravar_coleta` escreve `{...bloco_db,
    //    ...params}`, então a medida da base é sobreponível e a planilha a leva de volta.
    //
    // O aviso continua existindo, e agora para quem o merece: a coluna DERIVADA, que o
    // servidor calcula e recusa.
    expect(r.avisos).toEqual([
      expect.stringContaining('não volta pela planilha'),
    ])
    expect(r.avisos[0]).toContain('Ticket')
    expect(r.alteracoes).toBe(4)
    const linha = r.dados['subbacia-operacional'][0]
    expect(linha.preco_por_ligacao).toBe('1.100,5')
    expect(linha.tempo_arrecadacao).toBe('3')
    expect(linha.receita_faturada_media_mensal).toBe('999.999')
    expect(linha.ligacoes_atuais).toBe('1')
    // a derivada ficou como estava: ela é conta do servidor
    expect(linha.ticket_medio).toBe('191,29')
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

  it('ficha nova sem o que a prende à unidade é recusada, com o motivo', () => {
    /**
     * A regra era "a planilha não cria ficha". Virou o contrário em 01/10/2026 — mas
     * criar exige o que PRENDE a ficha à unidade, porque na criação não há ficha para
     * consultar a posse: a sub-bacia chega pelo SISTEMA, o coletor pela CIDADE.
     *
     * Sem isso a recusa é aqui, e não um 422 do servidor — que derrubaria o lote inteiro
     * e não diria em que linha do arquivo o problema está.
     */
    const r = mesclarPlanilha(unidadeDeTeste(), arquivo({
      'Sub-bacias': aba([{ sub_bacia_id: 'b99', preco_por_ligacao: 1 }]),
      'Dados da CTS': aba([{ cts_id: 'cts_009', preco_por_ligacao: 1 }]),
    }))
    expect(r.dados).toEqual({})
    expect(r.avisos).toHaveLength(2)
    //: sem nome nenhum, é o nome que falta primeiro
    expect(r.avisos[0]).toMatch(/Sub-bacias, linha 3: "b99" é uma linha NOVA/)
    expect(r.avisos[1]).toMatch(/Dados da CTS, linha 3: "cts_009" é uma linha NOVA/)
  })

  it('ficha nova COM nome e sistema é criada', () => {
    const r = mesclarPlanilha(unidadeDeTeste(), arquivo({
      'Sub-bacias': aba([{
        sub_bacia_id: 'b99', sub_bacia_name: 'Canal Novo',
        sistema_name: 'Sistema Um', preco_por_ligacao: 1200,
      }]),
    }))
    const criada = r.dados['subbacia-operacional']?.find((l) => l.sub_bacia_id === 'b99')
    expect(criada, `não criou. Avisos: ${JSON.stringify(r.avisos)}`).toBeDefined()
    expect(criada).toMatchObject({
      sub_bacia_id: 'b99',
      sub_bacia_name: 'Canal Novo',
      sistema_id: 's1',
      preco_por_ligacao: '1.200',
    })
  })

  it('coletor novo precisa da CIDADE, não do sistema — ele nasce livre', () => {
    const r = mesclarPlanilha(unidadeDeTeste(), arquivo({
      'Dados da CTS': aba([{
        cts_id: 'cts_009', cts_name: 'Coletor Novo', cidade_name: 'Cidade Um',
      }]),
    }))
    const criada = r.dados['cts-operacional']?.find((l) => l.cts_id === 'cts_009')
    expect(criada, `não criou. Avisos: ${JSON.stringify(r.avisos)}`).toBeDefined()
    expect(criada).toMatchObject({
      cts_id: 'cts_009',
      cts_name: 'Coletor Novo',
      cidade_id: 'c1',
      //: nasce FORA de sistema, como manda o conceito
      sistema_id: '',
    })
  })

  it('célula em branco apaga o valor; linha toda em branco é ignorada', () => {
    const r = mesclarPlanilha(unidadeDeTeste(), arquivo({
      'Sub-bacias': aba([
        { sub_bacia_id: 'b1', potencial_crescimento: null },
        { sub_bacia_id: null, potencial_crescimento: null },
      ]),
    }))
    // O APAGAMENTO CONTINUA ACONTECENDO, e desde 01/10 ele é DITO: as medidas da base
    // comercial passaram a voltar pela planilha, e esvaziar uma coluna sem perceber deixou
    // de ser um erro pequeno. O aviso não substitui o efeito — acompanha-o.
    expect(r.avisos).toEqual([expect.stringContaining('"Potencial de crescimento" ficou VAZIA em 1 linha')])
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

    // UM COMPONENTE TEM UMA POSIÇÃO SÓ: a linha repetida tem aviso próprio desde
    // 01/10/2026, e duas linhas pedindo coisas diferentes é contradição.
    /**
     * TIRAR E MOVER PELA PLANILHA — decisão do dono do produto em 02/10/2026.
     *
     * Estes dois testes afirmavam o contrário ("é pela tela") até esta data. A planilha é
     * uma das três fontes, e não a de segunda classe. O que mudou foi só o portão: a
     * gravação (`envioDaTopologia`) e a rota de lote já faziam as duas coisas.
     */
    it('tirar a CTS do sistema: a ficha fica, o sistema e o jusante saem', () => {
      const r = mesclarPlanilha(unidadeDeTeste(), arquivo({
        'Dados da CTS': aba([{ cts_id: 'cts_001', sistema_id: '' }]),
      }))
      expect(r.avisos).toEqual([])
      expect(r.dados['cts-operacional'].find((l) => l.cts_id === 'cts_001'))
        .toMatchObject({ sistema_id: '', sistema_name: '' })
      //: a linha da topologia FICA — é ela que preserva o nome e permite recolocá-la
      const linha = r.dados['sistema-topologia'].find((l) => l.componente_sistema_id === 'cts_001')!
      expect(linha).toMatchObject({ sistema_id: '', componente_sistema_id_jusante: '' })
      expect(linha.componente_sistema_nome).toBeTruthy()
    })

    it('mover a CTS de sistema: o jusante do sistema antigo é limpo', () => {
      const r = mesclarPlanilha(unidadeDeTeste(), arquivo({
        'Dados da CTS': aba([{ cts_id: 'cts_001', sistema_id: 's2' }]),
      }))
      expect(r.avisos).toEqual([])
      expect(r.dados['cts-operacional'].find((l) => l.cts_id === 'cts_001'))
        .toMatchObject({ sistema_id: 's2', sistema_name: 'Sistema Dois' })
      //: o jusante era componente de s1, e em s2 ele não vale — mandá-lo seria pedir ao
      //: servidor um desenho que ele recusa
      expect(r.dados['sistema-topologia'].find((l) => l.componente_sistema_id === 'cts_001'))
        .toMatchObject({ sistema_id: 's2', componente_sistema_id_jusante: '' })
    })

    it('a CTS não sai enquanto alguém escoa para ela, e o aviso diz quem', () => {
      // A MESMA RECUSA DA TELA E DO SERVIDOR. No portfólio real nada escoa para uma CTS
      // hoje (medido: 0 linhas), mas é ela que impede a planilha de arrebentar um desenho
      // em lote, sem ninguém olhando.
      const unidade = unidadeDeTeste()
      const topo = (unidade.data['sistema-topologia'] ?? []).map((l) =>
        l.componente_sistema_id === 'b1' ? { ...l, componente_sistema_id_jusante: 'cts_001' } : l,
      )
      const comPreso = { ...unidade, data: { ...unidade.data, 'sistema-topologia': topo } }
      const r = mesclarPlanilha(comPreso, arquivo({
        'Dados da CTS': aba([{ cts_id: 'cts_001', sistema_id: '' }]),
      }))
      expect(r.dados).toEqual({})
      expect(r.avisos).toEqual([
        expect.stringMatching(/"cts_001" não pode sair do sistema s1 enquanto b1 escoa\(m\) para ela/),
      ])
    })

    it('a mesma CTS duas vezes no arquivo: só a primeira vale, e a segunda é avisada', () => {
      const r = mesclarPlanilha(unidadeDeTeste(), arquivo({
        'Dados da CTS': aba([
          { cts_id: 'cts_002', sistema_id: 's2' },
          { cts_id: 'cts_002', sistema_id: 's1' },
        ]),
      }))
      //: a primeira colocou
      expect(r.dados['cts-operacional']?.find((l) => l.cts_id === 'cts_002')?.sistema_id).toBe('s2')
      expect(r.avisos.join(' ')).toContain('aparece mais de uma vez nesta aba')
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

    it('destino de quem está FORA de sistema é recusado — primeiro o sistema', () => {
      /**
       * A regra era "colocar no sistema é pela aba da CTS, não aqui". Em 01/10/2026 esta
       * aba virou a segunda porta: o dono do produto preencheu a coluna "Sistema" aqui,
       * que é onde ela está à vista. O que NÃO mudou é a ordem — sem sistema não há
       * caminho a desenhar, porque o jusante só existe dentro de um sistema.
       */
      const r = mesclarPlanilha(unidadeDeTeste(), arquivo({
        'Fluxo de escoamento': aba([{ componente_sistema_id: 'cts_002', componente_sistema_id_jusante: 'b1' }]),
      }))
      expect(r.dados).toEqual({})
      expect(r.avisos).toEqual([expect.stringMatching(/"cts_002" está fora de sistema — informe o Sistema nesta linha/)])
    })

    it('mas com o Sistema preenchido, a mesma linha entra — e o caminho fica para a tela', () => {
      const r = mesclarPlanilha(unidadeDeTeste(), arquivo({
        'Fluxo de escoamento': aba([{
          componente_sistema_id: 'cts_002',
          sistema_name: 'Sistema Dois',
          componente_sistema_id_jusante: 'b1',
        }]),
      }))
      const posta = r.dados['sistema-topologia']?.find((l) => l.componente_sistema_id === 'cts_002')
      expect(posta).toMatchObject({ sistema_id: 's2', sistema_name: 'Sistema Dois' })
      //: o jusante do mesmo arquivo JÁ VALE: depois de entrar no sistema, há caminho
      expect(posta?.componente_sistema_id_jusante).toBe('b1')
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

/**
 * O QUE A PLANILHA PROMETE E O QUE ELA ACEITA TÊM DE SER A MESMA COISA.
 *
 * Relatado por um tester em 30/09/2026: "atualizo um dado de uma coluna que já vem
 * preenchida no download e ao subir não é salva, pelo menos não vejo na interface".
 *
 * Eram duas causas, e as duas valiam para TODAS as abas:
 *
 * 1. O arquivo pintava de âmbar ("preencha aqui") 11 colunas que o upload descarta —
 *    `ete_name`, o `sistema_id` da ETE, `cts_id`, `cts_name`, `cidade_id`, `cidade_name`
 *    e as duas da aba de sobreposição. Eram duas regras parecidas e divergentes:
 *    `editavelNaPlanilha` não excluía id nem nome, `colunaImportavel` excluía.
 * 2. Mudar uma coluna que não volta não produzia NADA: nem efeito, nem aviso. `aplicar`
 *    só percorria as importáveis, então a mudança não era rejeitada — era invisível.
 */
describe('a planilha não promete o que não aceita', () => {
  it('toda coluna pintada como preenchível é aceita no upload', () => {
    const divergentes: string[] = []
    for (const aba of SCHEMA) {
      for (const c of aba.cols ?? []) {
        const pintada = editavelNaPlanilha(aba, c)
        const aceita = colunaImportavel(aba, c) || COLOCA_NO_SISTEMA[aba.key] === c.coluna
        if (pintada !== aceita) divergentes.push(`${aba.key}.${c.coluna}`)
      }
    }
    expect(divergentes).toEqual([])
  })

  it('o id continua fora; o NOME entrou em 01/10/2026', () => {
    // O guarda do outro lado: a regra derivada não pode ter aberto a porta para ids.
    const ete = SCHEMA.find((a) => a.key === 'ete-capex')!
    expect(editavelNaPlanilha(ete, ete.cols.find((c) => c.coluna === 'sistema_id')!)).toBe(false)
    expect(editavelNaPlanilha(ete, ete.cols.find((c) => c.coluna === 'ete_id')!)).toBe(false)
    // O NOME DA ETE: a grade sempre deixou digitá-lo e o `PUT` o descartava calado.
    // Agora o serviço o grava (`_gravar_nome_do_componente`), e a planilha o leva.
    expect(editavelNaPlanilha(ete, ete.cols.find((c) => c.coluna === 'ete_name')!)).toBe(true)
    // e o que a unidade preenche continua âmbar
    expect(editavelNaPlanilha(ete, ete.cols.find((c) => c.coluna === 'capex_por_modulo')!)).toBe(true)
  })

  it('a CTS continua entrando no sistema pela aba dela', () => {
    // A única exceção: coluna de id que o upload lê, por caminho próprio.
    const cts = SCHEMA.find((a) => a.key === 'cts-operacional')!
    expect(editavelNaPlanilha(cts, cts.cols.find((c) => c.coluna === 'sistema_id')!)).toBe(true)
  })
})

describe('mudança em coluna que não volta é AVISADA, e não ignorada em silêncio', () => {
  it('avisa por COLUNA, e não por linha', () => {
    // UMA unidade tem centenas de sub-bacias: um aviso por linha afogaria a lista que a
    // pessoa precisa ler. Duas linhas da mesma aba, a mesma coluna de leitura mudada nas
    // duas — e um aviso só, dizendo quantas.
    const unidade = unidadeDeTeste()
    const r = mesclarPlanilha(unidade, arquivo({
      'CAPEX das sub-bacias': aba([
        { sub_bacia_id: 'b1', componente: 'Rede coletora', sistema_name: 'Outro Sistema' },
        { sub_bacia_id: 'b1', componente: 'Ligacao de esgoto', sistema_name: 'Outro Sistema' },
      ]),
    }))
    const sobre = r.avisos.filter((a) => a.includes('não volta pela planilha'))
    expect(sobre).toHaveLength(1)
    expect(sobre[0]).toContain('2 linhas diferentes foram ignoradas')
  })

  it('não avisa quando a planilha traz a coluna IGUAL ao que a tela tem', () => {
    // A planilha traz as colunas de leitura junto, e devolvê-las intactas é o caso
    // normal: quem preenche baixa, mexe numa célula e sobe o arquivo inteiro.
    const unidade = unidadeDeTeste()
    const linha = unidade.data['subbacia-operacional'][0]
    const r = mesclarPlanilha(unidade, arquivo({
      'Sub-bacias': aba([
        {
          sub_bacia_id: linha.sub_bacia_id,
          ligacoes_atuais: Number(String(linha.ligacoes_atuais).replace(/\./g, '').replace(',', '.')),
          preco_por_ligacao: 1234,
        },
      ]),
    }))
    expect(r.avisos.filter((a) => a.includes('não volta pela planilha'))).toEqual([])
    expect(r.alteracoes).toBe(1)
  })

  it('a derivada é recalculada na subida, e não fica com o número velho', () => {
    /**
     * O QUE O DONO DO PRODUTO APONTOU em 01/10/2026: *"quem calcula é no momento de subir
     * a planilha"*.
     *
     * `ligacoes_novas_obras` é `universo_ligacoes − ligacoes_atuais`. A célula da grade
     * sempre MOSTROU a conta, sem guardá-la — e isso bastava enquanto as duas entradas
     * eram intocáveis. Agora elas voltam pela planilha: sem o recálculo, a linha subiria
     * com o número que o download trouxe, contradizendo as duas colunas ao lado.
     */
    const unidade = unidadeDeTeste()
    // de 406 − 140 = 266 para 500 − 150 = 350
    const r = mesclarPlanilha(unidade, arquivo({
      'Sub-bacias': aba([{ sub_bacia_id: 'b1', universo_ligacoes: 500, ligacoes_atuais: 150 }]),
    }))
    const linha = r.dados['subbacia-operacional'][0]
    expect(linha.universo_ligacoes).toBe('500')
    expect(linha.ligacoes_atuais).toBe('150')
    expect(linha.ligacoes_novas_obras).toBe('350')
    // o recálculo não é uma edição da pessoa: ela mudou duas células, não três
    expect(r.alteracoes).toBe(2)
    // e ninguém é avisado de que a derivada "não volta": ela não foi digitada
    expect(r.avisos).toEqual([])
  })

  it('na macrorregião, a medida da base da CTS não volta — e o aviso manda ao coletor', () => {
    /**
     * A EXCEÇÃO QUE A REVISÃO DO CODEX ACHOU em 01/10/2026. Gravar a ficha de uma
     * macrorregião faz o servidor SUBSTITUIR o bloco `db` pela soma dos coletores de hoje
     * (`cadastro_escrita._somas_de_hoje`). Aceitar a edição aqui seria aceitá-la para
     * descartá-la no salvamento.
     *
     * E o aviso tem de dizer OUTRA coisa: "use a tela" é falso neste caso, porque a tela
     * trava pelo mesmo contrato. O que resolve é corrigir o coletor na origem.
     */
    const unidade = unidadeDeTeste(true) // macrorregião marcada
    const r = mesclarPlanilha(unidade, arquivo({
      'Dados da CTS': aba([{ cts_id: 'cts_001', ligacoes_atuais: 99, preco_por_ligacao: 1500 }]),
    }, 'uT1', 'Sim'))
    // o parâmetro da coleta entrou; a medida da base, não
    expect(r.dados['cts-operacional']?.[0].preco_por_ligacao).toBe('1.500')
    expect(r.dados['cts-operacional']?.[0].ligacoes_atuais).not.toBe('99')
    const sobre = r.avisos.filter((a) => a.includes('não volta pela planilha'))
    expect(sobre).toHaveLength(1)
    expect(sobre[0]).toContain('SOMA dos coletores')
    expect(sobre[0]).toContain('Corrija o dado no coletor')
    expect(sobre[0]).not.toContain('use a tela')
  })

  it('o nome da empresa mudado na planilha ENTRA', () => {
    /**
     * DECISÃO DO DONO DO PRODUTO em 01/10/2026, depois de ler o aviso que recusava:
     * *"isso está errado, se mudar pela planilha deve atualizar"*.
     *
     * O aviso dizia "para mudá-la, use a tela" — e a tela também não mudava, porque o
     * `PUT /empresas/{cod}` só levava o fim da concessão. O serviço ganhou o campo
     * (`salvar_empresa`, mapa `_EMPRESA`), e o nome passou a ser gravável nos dois
     * caminhos. Sustenta-se porque a carga insere com `ON CONFLICT DO NOTHING`: a
     * correção não volta atrás na carga seguinte.
     */
    const unidade = unidadeDeTeste()
    const r = mesclarPlanilha(unidade, arquivo({
      Empresas: aba([{ emp_codigo: '57', empresa: 'Empresa 57 Interior10', data_fim_concessao: 2048 }]),
    }))
    expect(r.dados['empresa']?.[0].empresa).toBe('Empresa 57 Interior10')
    expect(r.alteracoes).toBe(1)
    // e nenhum aviso de "não volta": ela volta
    expect(r.avisos).toEqual([])
    expect(r.naoVoltaram).toBe(0)
  })

  it('empresa que o cadastro não conhece é CRIADA, não ignorada', () => {
    /**
     * O RELATO, em 01/10/2026: *"eu criei uma nova empresa e tive essa informação no
     * front — Empresas, linha 11: 'e2sup5' não existe no cadastro — ignorada. e isso
     * não é para acontecer, é para criar essa linha no banco"*. E a regra geral que ele
     * enunciou em seguida: **as três fontes — Databricks, tela e planilha — criam e
     * atualizam o mesmo**.
     *
     * A linha nova entra no ESTADO; gravar continua sendo o Salvar. É isso que torna a
     * criação revisável, e é o que protege do caso ruim — um id digitado errado virando
     * registro novo em silêncio. Por isso o aviso diz, em letras, que vai criar.
     */
    const unidade = unidadeDeTeste()
    const r = mesclarPlanilha(unidade, arquivo({
      Empresas: aba([
        { unidade_id: 'uT1', emp_codigo: '57', empresa: 'Empresa 57', data_fim_concessao: 2048 },
        { unidade_id: 'uT1', emp_codigo: 'e2sup5', empresa: 'Empresa Nova', data_fim_concessao: 2050 },
      ]),
    }))
    const criada = r.dados['empresa']?.find((l) => l.emp_codigo === 'e2sup5')
    expect(criada, 'a linha nova não entrou').toBeDefined()
    expect(criada).toMatchObject({
      emp_codigo: 'e2sup5',
      empresa: 'Empresa Nova',
      data_fim_concessao: '2050',
      //: a unidade vem do CONTEXTO, nunca da célula — ver `CRIAVEL_POR_ABA`
      unidade_id: 'uT1',
    })
    expect(r.avisos).toEqual([expect.stringContaining('será CRIADA ao salvar')])
    //: a linha que já existia continua lá, intocada
    expect(r.dados['empresa']).toHaveLength(2)
  })

  it('sem o nome, a empresa nova é recusada — e o aviso diz o que falta', () => {
    // O servidor recusa criação sem nome (422), e o salvamento é tudo-ou-nada: um 422
    // derrubaria o lote inteiro. Então a planilha barra antes e nomeia a coluna.
    const unidade = unidadeDeTeste()
    const r = mesclarPlanilha(unidade, arquivo({
      Empresas: aba([{ emp_codigo: 'e2sup9', empresa: '', data_fim_concessao: 2050 }]),
    }))
    expect(r.dados['empresa']).toBeUndefined()
    expect(r.avisos).toEqual([expect.stringContaining('é uma linha NOVA e')])
    expect(r.avisos[0]).toContain('em branco — preencha para criá-la')
  })

  it('CTS acrescentada no Fluxo entra no sistema — pelo NOME dele', () => {
    /**
     * O RELATO, em 01/10/2026: *"adicionei uma cts no fluxo de escoamento e vi isso aqui
     * — a coluna Sistema não volta pela planilha ... corrija na origem. e a cts que
     * adicionei no fluxo não apareceu na tela"*.
     *
     * Duas coisas erradas: a aba não criava linha, e o aviso mandava corrigir "na
     * origem" justamente a coluna que uma linha NOVA existe para informar.
     *
     * O sistema entra por NOME porque é o que a coluna mostra — o id fica na coluna ao
     * lado, e a aba de apoio "Sistemas" lista os dois. O jusante nasce vazio: o caminho
     * até a ETE se desenha na tela, com o unifilar ao lado.
     */
    const unidade = unidadeDeTeste()
    const r = mesclarPlanilha(unidade, arquivo({
      'Fluxo de escoamento': aba([
        { componente_sistema_id: 'cts_002', sistema_name: 'Sistema Dois' },
      ]),
    }))
    const posta = r.dados['sistema-topologia']?.find((l) => l.componente_sistema_id === 'cts_002')
    expect(posta, `não colocou. Avisos: ${JSON.stringify(r.avisos)}`).toBeDefined()
    expect(posta).toMatchObject({
      componente_sistema_id: 'cts_002',
      sistema_id: 's2',
      sistema_name: 'Sistema Dois',
      //: o caminho continua por desenhar — é na tela, com o unifilar ao lado
      componente_sistema_id_jusante: '',
    })
    //: e nenhum "não volta" sobre a coluna Sistema: na linha sem sistema ela É o dado
    expect(r.avisos.join(' ')).not.toContain('não volta pela planilha')
  })

  it('colocar pelo Fluxo preenche a coluna Sistema DA CTS também', () => {
    /**
     * *"ao adicionar a cts no sistema temos que automaticamente preencher a coluna de
     * sistema da cts"* — 01/10/2026.
     *
     * É o que a tela faz: o seletor do Fluxo escreve nas DUAS abas. A porta nova do
     * Fluxo escrevia só a linha da topologia, e as duas metades ficavam em desacordo —
     * a topologia dizendo que a CTS está no sistema e a ficha dela dizendo que não.
     */
    const unidade = unidadeDeTeste()
    const r = mesclarPlanilha(unidade, arquivo({
      'Fluxo de escoamento': aba([
        { componente_sistema_id: 'cts_002', sistema_name: 'Sistema Dois' },
      ]),
    }))
    // a topologia
    expect(r.dados['sistema-topologia']?.find((l) => l.componente_sistema_id === 'cts_002'))
      .toMatchObject({ sistema_id: 's2', sistema_name: 'Sistema Dois' })
    // E A FICHA DA CTS — a outra ponta
    expect(r.dados['cts-operacional']?.find((l) => l.cts_id === 'cts_002'))
      .toMatchObject({ sistema_id: 's2', sistema_name: 'Sistema Dois' })
  })

  it('colocar pelo Fluxo NÃO gera aviso falso de "tirar do sistema"', () => {
    /**
     * Achado da revisão do Codex sobre o conserto anterior. A colocação pelo Fluxo
     * escreve o sistema na ficha da CTS; em seguida `colocarCtsNoSistema` lê a aba "Dados
     * da CTS" do MESMO arquivo — onde `sistema_id` continua VAZIO, porque o arquivo foi
     * gerado antes da edição. Ela via ficha com sistema e célula vazia, e concluía "tirar
     * uma CTS do sistema é pela tela": exatamente o contrário do que a pessoa fez.
     *
     * O arquivo de verdade traz TODAS as abas, e é por isso que este teste manda as duas.
     */
    const unidade = unidadeDeTeste()
    const r = mesclarPlanilha(unidade, arquivo({
      'Fluxo de escoamento': aba([
        { componente_sistema_id: 'cts_002', sistema_name: 'Sistema Dois' },
      ]),
      //: como o arquivo baixado traz: a ficha da CTS ainda sem sistema
      'Dados da CTS': aba([
        { cts_id: 'cts_001', sistema_id: 's1' },
        { cts_id: 'cts_002', sistema_id: '' },
      ]),
    }))
    expect(r.dados['cts-operacional']?.find((l) => l.cts_id === 'cts_002'))
      .toMatchObject({ sistema_id: 's2' })
    expect(r.avisos.join(' '), JSON.stringify(r.avisos)).not.toContain('tirar uma CTS do sistema')
  })

  it('no Fluxo, sistema de fora da unidade e troca de sistema são recusados com o motivo', () => {
    const unidade = unidadeDeTeste()
    const semSistema = mesclarPlanilha(unidade, arquivo({
      'Fluxo de escoamento': aba([{ componente_sistema_id: 'cts_002', sistema_name: 'Sistema Fantasma' }]),
    }))
    expect(semSistema.dados['sistema-topologia']).toBeUndefined()
    expect(semSistema.avisos[0]).toContain('não é desta unidade')

    // E MUDAR de sistema continua sendo pela tela: trocar desfaz caminho desenhado.
    const jaPosta = mesclarPlanilha(unidade, arquivo({
      'Fluxo de escoamento': aba([{ componente_sistema_id: 'cts_001', sistema_name: 'Sistema Dois' }]),
    }))
    //: a recusa NOMEIA o sistema e diz onde se muda — antes ela mandava "para a tela, no
    //: Fluxo de escoamento" para quem já estava na aba Fluxo da planilha
    expect(jaPosta.avisos[0]).toContain('já está no sistema')
    expect(jaPosta.avisos[0]).toContain('um componente só fica num sistema')
    expect(jaPosta.avisos[0]).toContain('da TELA')
  })

  it('aba que NÃO cria continua avisando e ignorando — as obras', () => {
    // AS OBRAS NÃO SE CRIAM SOLTAS, e não por esquecimento: a cardinalidade é FIXA (5 na
    // sub-bacia, 4 no coletor) e o servidor recusa cardinalidade incompleta. Elas nascem
    // COM a ficha, com o vocabulário — ver `_criar_ficha_de_componente`.
    const unidade = unidadeDeTeste()
    const r = mesclarPlanilha(unidade, arquivo({
      'CAPEX das sub-bacias': aba([{ sub_bacia_id: 'b1', componente: 'Obra Inventada', quantidade: 9 }]),
    }))
    expect(r.dados['componentes-subbacias-capex']).toBeUndefined()
    expect(r.avisos.join(' ')).toContain('não existe no cadastro — ignorada')
  })

  it('os quatro nomes entram pela planilha', () => {
    /**
     * *"faça todos"* — 01/10/2026. Eram cinco nomes de leitura "porque vêm da carga".
     *
     * QUATRO CHEGAM À PLANILHA: empresa, sub-bacia, ETE e coletor. Os outros dois têm
     * campo no serviço e não têm SUPERFÍCIE — e isso não é descuido, é a consequência de
     * uma decisão anterior: a aba Municípios é `ocultaNoWizard` justamente porque "as 4
     * colunas são db, não há o que preencher", e o sistema não tem ficha nenhuma. Enquanto
     * não houver onde digitar, liberá-los só no arquivo devolveria a assimetria que esta
     * sequência de mudanças existe para tirar — o arquivo podendo mais que a tela.
     */
    const unidade = unidadeDeTeste()
    const r = mesclarPlanilha(unidade, arquivo({
      Empresas: aba([{ emp_codigo: '57', empresa: 'Empresa 57 renomeada', data_fim_concessao: 2048 }]),
      'Sub-bacias': aba([{ sub_bacia_id: 'b1', sub_bacia_name: 'Canal do Cunha' }]),
      'CAPEX das ETEs': aba([{ ete_id: 'e1', ete_name: 'ETE Alegria' }]),
      'Dados da CTS': aba([{ cts_id: 'cts_001', cts_name: 'Coletor Norte' }]),
    }))
    expect(r.dados['empresa']?.[0].empresa).toBe('Empresa 57 renomeada')
    expect(r.dados['subbacia-operacional']?.[0].sub_bacia_name).toBe('Canal do Cunha')
    expect(r.dados['ete-capex']?.[0].ete_name).toBe('ETE Alegria')
    expect(r.dados['cts-operacional']?.[0].cts_name).toBe('Coletor Norte')
    //: nenhum "não volta": os quatro voltam
    expect(r.naoVoltaram).toBe(0)
  })

  it('a cidade e o sistema têm campo no serviço E superfície para digitar', () => {
    /**
     * A ÚLTIMA ASSIMETRIA FECHOU em 01/10/2026. As duas abas tinham campo no serviço e
     * nenhum lugar onde mexer: eram `ocultaNoWizard` "porque as colunas são db, não há o
     * que preencher" — verdade enquanto nada nascia pelo cadastro.
     *
     * O dono do produto então disse que a planilha tem de poder subir uma unidade
     * inteira, porque "tem unidade que não estão salvas no Databricks". A cidade e o
     * sistema são elos OBRIGATÓRIOS dessa corrente: sem cidade não há sistema, e sem
     * sistema não há sub-bacia nem ETE.
     *
     * Oculta não era só invisível na tela — `ABAS_VISIVEIS` decide também o que vai para
     * o ARQUIVO.
     */
    expect(GRAVAVEL_POR_ABA['cidade-operacional']).toEqual(['cidade_name'])
    expect(GRAVAVEL_POR_ABA['cidade-sistema']).toEqual(['sistema_name'])
    for (const chave of ['cidade-operacional', 'cidade-sistema']) {
      expect(ABAS_VISIVEIS.some((a) => a.key === chave), chave).toBe(true)
      expect(CRIAVEL_POR_ABA[chave], `${chave} precisa criar`).toBeDefined()
    }
  })

  it('a corrente de partida cria cidade e sistema, cada uma com o que a prende', () => {
    // A ORDEM IMPORTA, e é a da corrente: a cidade pede a EMPRESA, o sistema pede a
    // CIDADE. Numa unidade vazia é assim que se começa.
    const unidade = unidadeDeTeste()
    const r = mesclarPlanilha(unidade, arquivo({
      Municípios: aba([{ cidade_id: 'c9', cidade_name: 'Cidade Nova', emp_codigo: '57' }]),
      'Sistemas de esgoto': aba([{ sistema_id: 's9', sistema_name: 'Sistema Novo', cidade_id: 'c1' }]),
    }))
    expect(r.dados['cidade-operacional']?.find((l) => l.cidade_id === 'c9'), JSON.stringify(r.avisos))
      .toMatchObject({ cidade_name: 'Cidade Nova', emp_codigo: '57', empresa: 'Empresa 57' })
    expect(r.dados['cidade-sistema']?.find((l) => l.sistema_id === 's9'), JSON.stringify(r.avisos))
      .toMatchObject({ sistema_name: 'Sistema Novo', cidade_id: 'c1', emp_codigo: '57' })
  })

  it('a unidade VAZIA sobe inteira numa importação só', () => {
    /**
     * O REQUISITO, nas palavras dele: *"tem unidades que tem apenas dados em organização
     * na aba unidade e regional, e as demais dados estão totalmente vazios, e a planilha
     * pode ser preenchida para subir todos os demais dados, pois tem unidade que não
     * estão salvas no Databricks"*.
     *
     * A revisão final do Codex mostrou que isso NÃO funcionava, por duas razões, e as
     * duas invisíveis nos testes de então:
     *
     *   o `resolve` lia o estado ORIGINAL, então a cidade criada três linhas acima não
     *   existia para criar o sistema;
     *
     *   a ordem da mescla era a do STEPPER, que põe o Fluxo antes das sub-bacias.
     *
     * Este teste é a corrente inteira num arquivo só, sobre uma unidade que tem apenas a
     * aba Unidade. Se ele passar, "preencher a planilha e subir tudo" é verdade.
     */
    const vazia = {
      id: 'uT1',
      data: {
        'unidade-regional': [{
          regional_id: 'rT', regional_name: 'Regional Teste',
          diretoria_id: 'dT', diretoria_name: 'Diretoria',
          unidade_id: 'uT1', unidade_name: 'Unidade Teste',
          wacc_medio: '0,0873', usa_macrorregiao_cts: 'Nao',
        }],
      } as unknown as Dados,
    }
    const r = mesclarPlanilha(vazia, arquivo({
      Empresas: aba([{ emp_codigo: 'E1', empresa: 'Empresa Um', data_fim_concessao: 2050 }]),
      Municípios: aba([{ cidade_id: 'C1', cidade_name: 'Cidade Um', emp_codigo: 'E1' }]),
      'Sistemas de esgoto': aba([{ sistema_id: 'S1', sistema_name: 'Sistema Um', cidade_id: 'C1' }]),
      'Sub-bacias': aba([{ sub_bacia_id: 'B1', sub_bacia_name: 'Bacia Um', sistema_id: 'S1', preco_por_ligacao: 1000 }]),
      'CAPEX das ETEs': aba([{ ete_id: 'E_ETE', ete_name: 'ETE Um', sistema_id: 'S1', nova: 'Sim' }]),
      'Dados da CTS': aba([{ cts_id: 'T1', cts_name: 'Coletor Um', cidade_id: 'C1' }]),
      'Fluxo de escoamento': aba([{ componente_sistema_id: 'B1', sistema_id: 'S1', componente_sistema_id_jusante: 'E_ETE' }]),
    }))

    const avisos = JSON.stringify(r.avisos, null, 1)
    expect(r.dados['empresa']?.[0], avisos).toMatchObject({ emp_codigo: 'E1', empresa: 'Empresa Um' })
    expect(r.dados['cidade-operacional']?.[0], avisos).toMatchObject({ cidade_id: 'C1', emp_codigo: 'E1' })
    expect(r.dados['cidade-sistema']?.[0], avisos).toMatchObject({ sistema_id: 'S1', cidade_id: 'C1' })
    expect(r.dados['subbacia-operacional']?.[0], avisos).toMatchObject({ sub_bacia_id: 'B1', sistema_id: 'S1' })
    expect(r.dados['ete-capex']?.[0], avisos).toMatchObject({ ete_id: 'E_ETE', sistema_id: 'S1' })
    expect(r.dados['cts-operacional']?.[0], avisos).toMatchObject({ cts_id: 'T1', cidade_id: 'C1' })
    //: e o FLUXO, que vem por último e referencia todo mundo — a sub-bacia criada acima
    //: escoando para a ETE criada acima
    expect(r.dados['sistema-topologia']?.find((l) => l.componente_sistema_id === 'B1'), avisos)
      .toMatchObject({ sistema_id: 'S1', componente_sistema_id_jusante: 'E_ETE' })
  })

  it('cidade sem empresa e sistema sem cidade são recusados com o motivo', () => {
    const unidade = unidadeDeTeste()
    const semEmp = mesclarPlanilha(unidade, arquivo({
      Municípios: aba([{ cidade_id: 'c9', cidade_name: 'Cidade Nova' }]),
    }))
    expect(semEmp.avisos[0]).toContain('informe a Empresa')
    // No sistema a cidade é METADE DA CHAVE (o par sistema×cidade), então quem recusa é
    // o guarda da chave, antes do `resolve` — e a mensagem nomeia a coluna que falta.
    const semCid = mesclarPlanilha(unidade, arquivo({
      'Sistemas de esgoto': aba([{ sistema_id: 's9', sistema_name: 'Sistema Novo' }]),
    }))
    expect(semCid.avisos[0]).toContain('não dá para criar a linha')
    expect(semCid.dados['cidade-sistema']).toBeUndefined()
  })

  it('apagar o nome da empresa NÃO apaga — avisa e deixa como estava', () => {
    // Apagar número é correção; apagar nome deixa a linha inidentificável nas cinco abas
    // em que a empresa aparece, e o servidor recusa com 422 — que derrubaria o lote todo.
    const unidade = unidadeDeTeste()
    const r = mesclarPlanilha(unidade, arquivo({
      Empresas: aba([{ emp_codigo: '57', empresa: '', data_fim_concessao: 2048 }]),
    }))
    expect(r.dados['empresa']).toBeUndefined()
    expect(r.avisos).toEqual([expect.stringContaining('não pode ficar em branco')])
  })

  it('mudar o ID Sistema numa aba que não é porta é AVISADO, e não ignorado', () => {
    /**
     * Achado 3 da revisão final do Codex. A isenção do aviso era GLOBAL por nome de
     * coluna (`COLOCA_NO_SISTEMA_TODAS`), e a porta legítima é só a da CTS — e, desde
     * 01/10, a do Fluxo. Mudar o `ID Sistema` de uma ETE era ignorado sem aviso e sem
     * contar em `naoVoltaram`: perda silenciosa, que é o defeito que esta mudança inteira
     * existe para tirar. Eu já tinha cometido o mesmo excesso com `sistema_name` e
     * consertado só aquele.
     */
    const unidade = unidadeDeTeste()
    const r = mesclarPlanilha(unidade, arquivo({
      'CAPEX das ETEs': aba([{ ete_id: 'e1', sistema_id: 's2' }]),
    }))
    expect(r.dados['ete-capex']).toBeUndefined()
    expect(r.naoVoltaram, 'a célula mudada tem de ser CONTADA').toBe(1)
    expect(r.avisos.join(' ')).toContain('não volta pela planilha')
  })

  it('nas DUAS portas de colocação o ID Sistema continua sem aviso', () => {
    // Avisar ali seria falso: é por essa coluna que a CTS entra num sistema.
    const unidade = unidadeDeTeste()
    const pelaCts = mesclarPlanilha(unidade, arquivo({
      'Dados da CTS': aba([{ cts_id: 'cts_002', sistema_id: 's2' }]),
    }))
    expect(pelaCts.avisos.join(' ')).not.toContain('não volta pela planilha')
    const peloFluxo = mesclarPlanilha(unidade, arquivo({
      'Fluxo de escoamento': aba([{ componente_sistema_id: 'cts_002', sistema_id: 's2' }]),
    }))
    expect(peloFluxo.avisos.join(' ')).not.toContain('não volta pela planilha')
  })

  it('apagar medida da base é avisado antes de salvar, contado por coluna', () => {
    /**
     * CONSEQUÊNCIA DIRETA DA LIBERAÇÃO, apontada pela revisão do Codex. "Célula em branco
     * apaga o valor" é o contrato do arquivo desde sempre — é o que permite tirar um número
     * que não deveria existir. O que mudou em 01/10 é o ALCANCE: as medidas da base
     * comercial entraram, e uma coluna arrastada ou um filtro mal aplicado passou a poder
     * esvaziar dado que ninguém digitou.
     *
     * Não é recusa — a pessoa pode querer apagar. É a chance de olhar antes de salvar.
     */
    const unidade = unidadeDeTeste()
    const r = mesclarPlanilha(unidade, arquivo({
      'Sub-bacias': aba([{ sub_bacia_id: 'b1', ligacoes_atuais: '', universo_ligacoes: '' }]),
    }))
    const sobre = r.avisos.filter((a) => a.includes('ficou VAZIA'))
    expect(sobre).toHaveLength(2)
    expect(sobre.join(' ')).toContain('célula em branco na planilha apaga o valor')
    // e apagou de verdade: o aviso não substitui o efeito, acompanha-o
    expect(r.dados['subbacia-operacional'][0].ligacoes_atuais).toBe('')
  })

  it('célula vazia na planilha não conta como edição', () => {
    // Coluna que a pessoa apagou, ou que a planilha não trouxe: não é uma tentativa de
    // mudar nada, e avisar sobre ela encheria a lista sem motivo.
    const unidade = unidadeDeTeste()
    const r = mesclarPlanilha(unidade, arquivo({
      'Sub-bacias': aba([{ sub_bacia_id: 'b1', ligacoes_atuais: '', preco_por_ligacao: 1234 }]),
    }))
    expect(r.avisos.filter((a) => a.includes('não volta pela planilha'))).toEqual([])
  })

  it('o aviso diz o que fazer, e cada família tem uma saída diferente', () => {
    /**
     * A FRASE ERA UMA SÓ — "para mudá-la, use a tela" — e mentia na maioria dos casos. O
     * dono do produto bateu nela duas vezes em 01/10/2026: primeiro no nome da empresa
     * (que a tela também não mudava, e que por decisão dele passou a ser gravável), e
     * antes disso na CTS somada. Um aviso que manda a pessoa ao lugar errado é pior que
     * nenhum: ela vai, não consegue, e conclui que o sistema está quebrado.
     *
     * `ticket_medio` é receita ÷ ligações, conta do servidor. A saída dela não é "a tela",
     * é corrigir as colunas de que ela deriva.
     */
    const unidade = unidadeDeTeste()
    const r = mesclarPlanilha(unidade, arquivo({
      'Sub-bacias': aba([{ sub_bacia_id: 'b1', ticket_medio: 7 }]),
    }))
    const aviso = r.avisos.find((a) => a.includes('não volta pela planilha'))!
    expect(aviso).toContain('conta que o servidor faz')
    expect(aviso).toContain('corrija as colunas de que ela deriva')
    expect(aviso).not.toContain('use a tela')
  })
})

describe('a aba do Fluxo no arquivo', () => {
  /**
   * *"todos elementos devem estar agrupados por sub bacia, atualmente você está colocando
   * todas as cts no fim da planilha"* — e, antes disso, *"as cts têm que ficar na aba de
   * cts somente"*.
   *
   * Dados à mão, e não o fixture: a regra é sobre a CORRENTE, e um fixture pequeno
   * provaria um caso só. Aqui há CTS escoando para sub-bacia, CTS escoando para ETE, CTS
   * sem destino e CTS fora de sistema — as quatro situações que o portfólio real tem.
   */
  const comCorrente = (): Dados => ({
    'sistema-topologia': [
      { sistema_id: 's1', componente_sistema_id: 'b1', componente_tipo: 'sub-bacia', componente_sistema_id_jusante: 'e1' },
      { sistema_id: 's1', componente_sistema_id: 'e1', componente_tipo: 'ete', componente_sistema_id_jusante: '' },
      { sistema_id: 's2', componente_sistema_id: 'b2', componente_tipo: 'sub-bacia', componente_sistema_id_jusante: 'e2' },
      { sistema_id: 's2', componente_sistema_id: 'e2', componente_tipo: 'ete', componente_sistema_id_jusante: '' },
      //: as CTS chegam DEPOIS de tudo, como a carga as entrega — é a desordem a consertar
      { sistema_id: 's1', componente_sistema_id: 'ctsA', componente_tipo: 'cts', componente_sistema_id_jusante: 'b1' },
      { sistema_id: 's1', componente_sistema_id: 'ctsB', componente_tipo: 'cts', componente_sistema_id_jusante: '' },
      { sistema_id: 's2', componente_sistema_id: 'ctsC', componente_tipo: 'cts', componente_sistema_id_jusante: 'e2' },
      { sistema_id: '', componente_sistema_id: 'ctsD', componente_tipo: 'cts', componente_sistema_id_jusante: '' },
    ],
  })

  const noArquivo = (dados: Dados): string[] => {
    const fluxo = planilhasDoCadastro(dados).find((p) => p.aba.key === 'sistema-topologia')!
    return linhasNoArquivo(fluxo, dados).map((l) => String(l.componente_sistema_id ?? ''))
  }

  it('cada CTS vai encostada no componente para onde escoa', () => {
    expect(noArquivo(comCorrente())).toEqual([
      'b1',    // a sub-bacia, âncora
      'ctsA',  // escoa para b1: encostada nela — é o "agrupado por sub-bacia"
      'e1',
      'ctsB',  // sem destino: fim do bloco DO SISTEMA s1, e não o fim da planilha
      'b2',
      'e2',
      'ctsC',  // escoa para a ETE: encostada nela, que é para onde ela escoa de fato
    ])
  })

  it('a CTS fora de sistema não entra na aba do Fluxo', () => {
    //: ela é do cadastro, e aparece em "Dados da CTS" — a aba do Fluxo é o DESENHO
    expect(noArquivo(comCorrente())).not.toContain('ctsD')
  })

  it('nenhuma CTS sobra no fim do arquivo quando todas têm destino', () => {
    const dados = comCorrente()
    dados['sistema-topologia'] = dados['sistema-topologia']!.filter(
      (l) => l.componente_sistema_id !== 'ctsB' && l.componente_sistema_id !== 'ctsD',
    )
    const ordem = noArquivo(dados)
    //: a última linha é a CTS de s2 porque ela escoa para a ETE de s2 — está no bloco
    //: dela, e não num bloco de CTS no fim
    expect(ordem).toEqual(['b1', 'ctsA', 'e1', 'b2', 'e2', 'ctsC'])
  })

  it('a ordem não perde nem duplica linha, seja qual for o desenho', () => {
    // A GARANTIA QUE IMPORTA: reordenar é fácil de fazer perdendo uma linha, e uma linha
    // perdida aqui é um componente que desaparece do arquivo sem ninguém avisar.
    const dados = comCorrente()
    const dentro = dados['sistema-topologia']!.filter((l) => String(l.sistema_id ?? '').trim())
    const ordem = noArquivo(dados)
    expect(ordem).toHaveLength(dentro.length)
    expect([...ordem].sort()).toEqual(dentro.map((l) => String(l.componente_sistema_id)).sort())
  })
})
