/**
 * O ARQUIVO `.xlsx` DO CADASTRO — escrever e ler.
 *
 * Este é o único módulo que importa a biblioteca de Excel, e a importa SOB
 * DEMANDA: `exceljs` pesa quase um megabyte, e o cadastro abre milhares de
 * vezes sem ninguém baixar planilha nenhuma. O `import()` dentro da função faz
 * o bundler separar o pedaço, que só desce quando um dos dois botões é clicado.
 *
 * O que vai em cada aba, e como a volta se mescla na tela, é decisão de
 * `domain/planilha.ts`. Aqui é só forma: cabeçalho em duas linhas, cor por
 * origem, largura, lista suspensa nas caixas e a nota do regime de CTS.
 */
import type { UnidadeState } from '../data/cadastroUnidade/types'
import { colunaLabel } from '../data/cadastroUnidade/schema'
import {
  ABAS_DE_APOIO,
  COLOCA_NO_SISTEMA,
  LEIA_ME,
  PRIMEIRA_LINHA_DE_DADO,
  SISTEMAS,
  type PlanilhaLida,
  editavelNaPlanilha,
  leiaMe,
  linhasDeSistemas,
  nomeDoArquivo,
  paraCelula,
  planilhasDoArquivo,
  regimeDeCts,
} from '../domain/planilha'

export { PRIMEIRA_LINHA_DE_DADO }

type ExcelJS = typeof import('exceljs')

/**
 * A biblioteca é CommonJS: no navegador o bundler entrega o pacote em
 * `default`; no Node (testes) o mesmo objeto vem como o módulo inteiro. As duas
 * formas convergem aqui.
 */
async function excel(): Promise<ExcelJS> {
  const mod = (await import('exceljs')) as ExcelJS & { default?: ExcelJS }
  return mod.default ?? mod
}

/** As cores da legenda da tela, em ARGB: âmbar para "você preenche", cinza para o resto. */
const FUNDO = {
  un: 'FFFDF3DC',
  db: 'FFEEF1F4',
  calc: 'FFEEF1F4',
} as const
const TEXTO_UN = 'FF8A4B0A'
const TEXTO_DB = 'FF5B6B7A'

/** As caixas que a planilha aceita de volta ganham lista suspensa. A da macrorregião não: é só leitura no arquivo. */
const LISTA_SIM_NAO: Record<string, string> = {
  nova: '"Sim,Não"',
}

/** Gera o arquivo com o cadastro inteiro da unidade, como a tela o tem agora. */
export async function gerarPlanilha(unidade: UnidadeState, hoje = new Date()): Promise<ArrayBuffer> {
  const { Workbook } = await excel()
  const wb = new Workbook()
  wb.creator = 'Otimizador CAPEX'
  wb.created = hoje

  const regime = regimeDeCts(unidade.data)

  // ---- Leia-me
  const leia = wb.addWorksheet(LEIA_ME, { properties: { tabColor: { argb: 'FF0E7490' } } })
  leia.columns = [{ width: 34 }, { width: 70 }, { width: 10 }, { width: 70 }]
  for (const linha of leiaMe(unidade, unidade.data, hoje)) leia.addRow(linha)
  leia.getRow(1).font = { bold: true, size: 14 }
  leia.getRow(4).font = { bold: true, size: 12, color: { argb: regime.macro ? 'FF0E7490' : TEXTO_UN } }
  leia.getRow(8).font = { bold: true }
  leia.eachRow((row) => {
    row.alignment = { vertical: 'top', wrapText: true }
  })
  // a tabela das abas no fim: as do cadastro mais a de apoio
  const cabecalhoDasAbas = leia.getRow(leia.rowCount - planilhasDoArquivo(unidade.data).length - 1)
  cabecalhoDasAbas.font = { bold: true }

  // ---- uma aba por aba do cadastro
  for (const p of planilhasDoArquivo(unidade.data)) {
    const ws = wb.addWorksheet(p.nome, { views: [{ state: 'frozen', ySplit: 2 }] })
    ws.columns = p.colunas.map((c) => ({
      key: c.coluna,
      width: Math.min(40, Math.max(12, colunaLabel(c.coluna).length + 2)),
    }))

    const rotulos = ws.addRow(p.colunas.map((c) => colunaLabel(c.coluna)))
    const codigos = ws.addRow(p.colunas.map((c) => c.coluna))
    p.colunas.forEach((c, i) => {
      const editavel = editavelNaPlanilha(p.aba, c)
      const fundo = { type: 'pattern', pattern: 'solid', fgColor: { argb: editavel ? FUNDO.un : FUNDO.db } } as const
      const r = rotulos.getCell(i + 1)
      r.fill = fundo
      r.font = { bold: true, color: { argb: editavel ? TEXTO_UN : TEXTO_DB } }
      r.alignment = { wrapText: true, vertical: 'top' }
      const k = codigos.getCell(i + 1)
      k.fill = fundo
      k.font = { size: 9, italic: true, color: { argb: TEXTO_DB } }
      if (c.oque) r.note = c.oque
    })

    // A NOTA DO REGIME nas abas de CTS: quem abre a aba para preencher obras
    // lê ali quantas fichas há e por quê, sem voltar ao Leia-me.
    if (p.aba.key === 'cts-operacional' || p.aba.key === 'componentes-cts-capex') {
      const idx = p.colunas.findIndex((c) => c.coluna === 'cts_id')
      if (idx >= 0) rotulos.getCell(idx + 1).note = `${regime.nome.toUpperCase()} — ${regime.regra}`
    }
    // A COLUNA POR ONDE A CTS ENTRA NUM SISTEMA: a nota diz a regra, e onde achar o id.
    const colocaNoSistema = COLOCA_NO_SISTEMA[p.aba.key]
    if (colocaNoSistema) {
      const idx = p.colunas.findIndex((c) => c.coluna === colocaNoSistema)
      if (idx >= 0) {
        rotulos.getCell(idx + 1).note =
          `Nas CTS com o sistema em branco, preencha com o id (ou o nome) de um sistema da unidade — aba "${SISTEMAS}". ` +
          'Só entra: mudar de sistema ou sair dele é pela tela.' +
          (regime.macro ? ' Macrorregião marcada: cada sistema aceita uma CTS só.' : '')
      }
    }

    for (const linha of p.linhas) {
      const row = ws.addRow(p.colunas.map((c) => paraCelula(c.coluna, linha[c.coluna])))
      p.colunas.forEach((c, i) => {
        const lista = LISTA_SIM_NAO[c.coluna]
        if (lista && c.origem === 'un') {
          row.getCell(i + 1).dataValidation = {
            type: 'list',
            allowBlank: true,
            formulae: [lista],
            showErrorMessage: true,
            errorTitle: 'Valor inválido',
            error: 'Escolha Sim ou Nao.',
          }
        }
      })
    }
    ws.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: p.colunas.length } }
  }

  // ---- Sistemas: a aba de apoio, para consultar o id ao colocar uma CTS
  const sistemas = wb.addWorksheet(SISTEMAS, { views: [{ state: 'frozen', ySplit: 2 }], properties: { tabColor: { argb: 'FF9AA5B1' } } })
  const colunasDeSistemas = ['sistema_id', 'sistema_name', 'cidade_id', 'cidade_name']
  sistemas.columns = colunasDeSistemas.map((c) => ({ key: c, width: 28 }))
  const rotulosS = sistemas.addRow(colunasDeSistemas.map(colunaLabel))
  const codigosS = sistemas.addRow(colunasDeSistemas)
  for (const row of [rotulosS, codigosS]) {
    row.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FUNDO.db } }
      cell.font = row === rotulosS ? { bold: true, color: { argb: TEXTO_DB } } : { size: 9, italic: true, color: { argb: TEXTO_DB } }
    })
  }
  for (const linha of linhasDeSistemas(unidade.data)) sistemas.addRow(colunasDeSistemas.map((c) => linha[c] ?? ''))

  const buffer = await wb.xlsx.writeBuffer()
  return buffer as ArrayBuffer
}

/**
 * Lê o arquivo preenchido. Devolve as abas de dado — o Leia-me fica de fora —
 * com as chaves das colunas lidas da SEGUNDA linha e as linhas a partir da
 * terceira, como a biblioteca as entregou (número, texto, fórmula…). Traduzir
 * para o texto da tela é `daCelula`, no domínio.
 */
export async function lerPlanilha(arquivo: ArrayBuffer): Promise<PlanilhaLida> {
  const { Workbook } = await excel()
  const wb = new Workbook()
  await wb.xlsx.load(arquivo)

  const lida: PlanilhaLida = {}
  const apoio = new Set([...ABAS_DE_APOIO].map((a) => a.toLowerCase()))
  wb.eachSheet((ws) => {
    if (apoio.has(ws.name.trim().toLowerCase())) return
    const colunas: string[] = []
    ws.getRow(2).eachCell({ includeEmpty: true }, (cell, n) => {
      colunas[n - 1] = String(cell.value ?? '').trim()
    })
    const linhas: Record<string, unknown>[] = []
    ws.eachRow((row, n) => {
      if (n < PRIMEIRA_LINHA_DE_DADO) return
      const linha: Record<string, unknown> = {}
      // PELO CABEÇALHO, e não por `eachCell`: a biblioteca só itera até a última
      // célula que existe na linha, e uma célula apagada no fim deixa de existir.
      // Por `eachCell`, apagar o WACC (última coluna) faria a coluna sumir do
      // objeto — e a mescla leria "não veio" e manteria o valor anterior.
      colunas.forEach((chave, i) => {
        if (chave) linha[chave] = row.getCell(i + 1).value
      })
      linhas.push(linha)
    })
    lida[ws.name] = { colunas: colunas.filter(Boolean), linhas }
  })
  return lida
}

/**
 * Baixa o arquivo no navegador. `URL.createObjectURL` e o clique sintético são
 * o jeito padrão de entregar um blob sem navegar a aba para longe do cadastro.
 * Devolve o nome do arquivo, para o aviso na tela.
 */
export async function baixarPlanilha(unidade: UnidadeState): Promise<string> {
  const buffer = await gerarPlanilha(unidade)
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const nome = nomeDoArquivo(unidade)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nome
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
  return nome
}
