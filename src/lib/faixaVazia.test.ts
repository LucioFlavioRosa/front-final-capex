/**
 * A FAIXA DA LISTA SUSPENSA QUANDO NÃO HÁ O QUE LISTAR.
 *
 * Uma unidade sem sistema nenhum deixa a aba de apoio só com o cabeçalho, e a faixa da
 * lista fica de uma célula vazia. O que não pode é o ARQUIVO quebrar — uma faixa
 * degenerada (`$A$3:$A$2`, fim antes do começo) faz o Excel recusar a validação e abrir
 * reclamando, e aí a planilha inteira some por causa de uma lista.
 */
import { describe, expect, it } from 'vitest'
import ExcelJS from 'exceljs'
import { gerarPlanilha } from './planilhaCadastro'
import { unidadeDeTeste } from '../testes/cadastroDePlanilha'

describe('unidade sem sistema', () => {
  it('gera o arquivo, e a faixa da lista não é degenerada', async () => {
    const unidade = unidadeDeTeste()
    //: tira os sistemas, mantendo a CTS que referencia um deles
    unidade.data['cidade-sistema'] = []
    const buffer = await gerarPlanilha(unidade)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buffer)
    const ws = wb.getWorksheet('Dados da CTS')!
    const codigos = (ws.getRow(2).values as unknown[]).map((v) => String(v ?? ''))
    const v = ws.getRow(3).getCell(codigos.indexOf('sistema_id')).dataValidation
    expect(v?.formulae?.[0]).toBe("'Sistemas'!$A$3:$A$3")
    //: e o arquivo abriu — é o que este teste prova de fato
    expect(wb.getWorksheet('Sistemas')).toBeDefined()
  })
})
