/**
 * O ARQUIVO DE VERDADE: gera, lê de volta e mescla — e nada se perde no caminho.
 *
 * O teste do domínio prova a regra com abas fabricadas; este prova que a
 * biblioteca escreve e lê o que o domínio espera — a chave da coluna na linha
 * 2, o dado a partir da 3, número como número, o Leia-me com o regime, a lista
 * suspensa na caixa e a nota nas abas de CTS. Roda em Node com a mesma
 * biblioteca que o navegador usa.
 */
import { describe, expect, it } from 'vitest'
import ExcelJS from 'exceljs'
import { gerarPlanilha, lerPlanilha, PRIMEIRA_LINHA_DE_DADO } from './planilhaCadastro'
import { LEIA_ME, SISTEMAS, mesclarPlanilha, planilhasDoCadastro } from '../domain/planilha'
import { unidadeDeTeste } from '../testes/cadastroDePlanilha'

async function abrir(buffer: ArrayBuffer): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer)
  return wb
}

describe('a planilha gerada', () => {
  it('tem o Leia-me primeiro e uma aba por aba do cadastro, na ordem do stepper', async () => {
    const unidade = unidadeDeTeste()
    const wb = await abrir(await gerarPlanilha(unidade))
    const nomes = wb.worksheets.map((ws) => ws.name)
    expect(nomes[0]).toBe(LEIA_ME)
    expect(nomes.slice(1, -1)).toEqual(planilhasDoCadastro(unidade.data).map((p) => p.nome))
    // a aba de apoio fecha o arquivo, com os sistemas da unidade
    expect(nomes.at(-1)).toBe(SISTEMAS)
    const sistemas = wb.getWorksheet(SISTEMAS)!
    expect(sistemas.getRow(3).getCell(1).value).toBe('s1')
    expect(sistemas.getRow(4).getCell(2).value).toBe('Sistema Dois')
  })

  it('cabeçalho em duas linhas — rótulo e código — e o dado a partir da terceira', async () => {
    const unidade = unidadeDeTeste()
    const wb = await abrir(await gerarPlanilha(unidade))
    const ws = wb.getWorksheet('Sub-bacias')!
    const codigos = ws.getRow(2).values as unknown[]
    expect(codigos).toContain('preco_por_ligacao')
    expect(codigos).toContain('sub_bacia_id')
    const rotulos = ws.getRow(1).values as unknown[]
    expect(rotulos[codigos.indexOf('preco_por_ligacao')]).toBe('Preço por nova ligação')
    const primeira = ws.getRow(PRIMEIRA_LINHA_DE_DADO)
    expect(primeira.getCell(codigos.indexOf('sub_bacia_id')).value).toBe('b1')
    // número vai como número — é o que deixa o Excel somar
    expect(primeira.getCell(codigos.indexOf('preco_por_ligacao')).value).toBe(1026.89)
    expect(ws.views[0]).toMatchObject({ state: 'frozen', ySplit: 2 })
  })

  it('reflete o regime: Leia-me, célula da caixa só leitura e nota nas abas de CTS', async () => {
    const macro = unidadeDeTeste(true)
    const wb = await abrir(await gerarPlanilha(macro))
    const leia = wb.getWorksheet(LEIA_ME)!
    const celulas: string[] = []
    leia.eachRow((row) => row.eachCell((c) => celulas.push(String(c.value ?? ''))))
    expect(celulas.join('\n')).toContain('Regime de CTS: MACRORREGIÃO')

    const unidade = wb.getWorksheet('Unidade')!
    const codigos = unidade.getRow(2).values as unknown[]
    const coluna = codigos.indexOf('usa_macrorregiao_cts')
    const caixa = unidade.getRow(PRIMEIRA_LINHA_DE_DADO).getCell(coluna)
    expect(caixa.value).toBe('Sim')
    // só leitura no arquivo: sem lista suspensa, e o cabeçalho em cinza como o do Databricks
    expect(caixa.dataValidation).toBeUndefined()
    const fundo = (c: number) => (unidade.getRow(1).getCell(c).fill as { fgColor: { argb: string } }).fgColor.argb
    const cinza = fundo(codigos.indexOf('unidade_id'))
    expect(fundo(coluna)).toBe(cinza)
    expect(fundo(codigos.indexOf('wacc_medio'))).not.toBe(cinza)

    for (const nome of ['Dados da CTS', 'CAPEX da CTS']) {
      const ws = wb.getWorksheet(nome)!
      const cods = ws.getRow(2).values as unknown[]
      const nota = ws.getRow(1).getCell(cods.indexOf('cts_id')).note
      const textoDaNota = typeof nota === 'string' ? nota : nota?.texts?.map((t) => t.text).join('')
      expect(textoDaNota, nome).toContain('MACRORREGIÃO')
      expect(textoDaNota, nome).toContain('cada sistema aceita UMA CTS')
    }

    const micro = await abrir(await gerarPlanilha(unidadeDeTeste(false)))
    const dadosDaCts = micro.getWorksheet('Dados da CTS')!
    const cods = dadosDaCts.getRow(2).values as unknown[]
    const texto = (nota: ExcelJS.Cell['note']) => (typeof nota === 'string' ? nota : nota?.texts?.map((t) => t.text).join(''))
    expect(texto(dadosDaCts.getRow(1).getCell(cods.indexOf('cts_id')).note)).toContain('MICRORREGIÃO')
    // a CTS livre está lá, com o sistema em branco, e a coluna do sistema tem a nota de como preencher
    expect(dadosDaCts.getRow(PRIMEIRA_LINHA_DE_DADO + 1).getCell(cods.indexOf('cts_id')).value).toBe('cts_002')
    expect(dadosDaCts.getRow(PRIMEIRA_LINHA_DE_DADO + 1).getCell(cods.indexOf('sistema_id')).value).toBe('')
    expect(texto(dadosDaCts.getRow(1).getCell(cods.indexOf('sistema_id')).note)).toContain(SISTEMAS)
  })
})

describe('ida e volta', () => {
  it('gerar → ler → mesclar sem mexer em nada não muda nada', async () => {
    const unidade = unidadeDeTeste()
    const lida = await lerPlanilha(await gerarPlanilha(unidade))
    expect(Object.keys(lida)).not.toContain(LEIA_ME)
    expect(lida['Sub-bacias'].colunas).toContain('preco_por_ligacao')
    expect(lida['Sub-bacias'].linhas).toHaveLength(1)
    // a planilha de outra unidade é recusada de cara
    expect(mesclarPlanilha({ id: 'uZ9', data: unidade.data }, lida).avisos)
      .toEqual([expect.stringMatching(/da unidade uT1, e a tela está em uZ9/)])
    const r = mesclarPlanilha(unidade, lida)
    expect(r.avisos).toEqual([])
    expect(r.alteracoes).toBe(0)
    expect(r.dados).toEqual({})
    // o arquivo tem 2 linhas a mais que a tela: a linha-modelo da Cidade Dois em Metas e em Escala
    expect(r.linhasLidas).toBe(
      planilhasDoCadastro(unidade.data).reduce((n, p) => n + p.linhas.length, 0) + 2,
    )
    for (const nome of ['Metas de cobertura', 'Escala de paridade']) {
      const modelo = lida[nome].linhas.at(-1)!
      expect(modelo.cidade_id, nome).toBe('c2')
      expect(modelo.cidade_name, nome).toBe('Cidade Dois')
    }
  })

  it('o que se edita no arquivo chega à tela no formato dela', async () => {
    const unidade = unidadeDeTeste()
    const wb = await abrir(await gerarPlanilha(unidade))

    const obras = wb.getWorksheet('CAPEX da CTS')!
    let cods = obras.getRow(2).values as unknown[]
    obras.getRow(PRIMEIRA_LINHA_DE_DADO).getCell(cods.indexOf('quantidade')).value = 1234
    obras.getRow(PRIMEIRA_LINHA_DE_DADO).getCell(cods.indexOf('obra_obrigatoria_ano')).value = 2031

    const un = wb.getWorksheet('Unidade')!
    cods = un.getRow(2).values as unknown[]
    un.getRow(PRIMEIRA_LINHA_DE_DADO).getCell(cods.indexOf('wacc_medio')).value = 0.1

    // a CTS livre ganha o sistema e um preço
    const dadosDaCts = wb.getWorksheet('Dados da CTS')!
    cods = dadosDaCts.getRow(2).values as unknown[]
    dadosDaCts.getRow(PRIMEIRA_LINHA_DE_DADO + 1).getCell(cods.indexOf('sistema_id')).value = 's2'
    dadosDaCts.getRow(PRIMEIRA_LINHA_DE_DADO + 1).getCell(cods.indexOf('preco_por_ligacao')).value = 880

    // apaga a ÚLTIMA coluna editável de uma obra: a célula deixa de existir no arquivo
    obras.getRow(PRIMEIRA_LINHA_DE_DADO).getCell((obras.getRow(2).values as unknown[]).indexOf('wacc')).value = null

    const metas = wb.getWorksheet('Metas de cobertura')!
    cods = metas.getRow(2).values as unknown[]
    const nova = metas.addRow([])
    nova.getCell(cods.indexOf('cidade_id')).value = 'c1'
    nova.getCell(cods.indexOf('ano')).value = 2040
    nova.getCell(cods.indexOf('cobertura_pct')).value = 99

    const lida = await lerPlanilha((await wb.xlsx.writeBuffer()) as ArrayBuffer)
    expect(Object.keys(lida)).not.toContain(SISTEMAS)
    const r = mesclarPlanilha(unidade, lida)
    expect(r.avisos).toEqual([])
    expect(r.dados['componentes-cts-capex'][0]).toMatchObject({ quantidade: '1.234', obra_obrigatoria_ano: '2031', wacc: '' })
    expect(r.dados['unidade-regional'][0]).toMatchObject({ wacc_medio: '0,1', usa_macrorregiao_cts: 'Nao' })
    expect(r.dados['metas-cobertura']).toHaveLength(3)
    expect(r.dados['metas-cobertura'][2]).toMatchObject({ cidade_id: 'c1', ano: '2040', cobertura_pct: '99', empresa: 'Empresa 57' })
    expect(r.dados['cts-operacional'][1]).toMatchObject({ cts_id: 'cts_002', sistema_id: 's2', sistema_name: 'Sistema Dois', preco_por_ligacao: '880' })
    expect(r.dados['sistema-topologia'].find((t) => t.componente_sistema_id === 'cts_002')).toMatchObject({ sistema_id: 's2' })
    expect(Object.keys(r.dados).sort()).toEqual(['componentes-cts-capex', 'cts-operacional', 'metas-cobertura', 'sistema-topologia', 'unidade-regional'])
  })
})
