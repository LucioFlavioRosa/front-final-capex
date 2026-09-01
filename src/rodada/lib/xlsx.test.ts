import { describe, expect, it } from 'vitest'
import { crc32 as crc32DoNode } from 'node:zlib'
import { letraDaColuna, livroXlsx, nomeDeAba, type Planilha } from './xlsx'

/**
 * O TESTE ABRE O ZIP QUE SAIU — e não confere o que o escritor achou que
 * escreveu.
 *
 * Um leitor próprio, escrito aqui, que percorre o catálogo central como o Excel
 * percorre: pega cada entrada pelo offset que o catálogo declara, confere a
 * assinatura do cabeçalho local naquele ponto e devolve os bytes. Se um offset
 * estiver errado por um byte — o defeito clássico de quem monta ZIP à mão — o
 * leitor não acha a assinatura e o teste falha, exatamente onde o Excel falharia
 * com "não foi possível abrir o arquivo".
 */
function abrirZip(z: Uint8Array): Map<string, string> {
  const dv = new DataView(z.buffer, z.byteOffset, z.byteLength)
  const dec = new TextDecoder()

  // O EOCD fica no fim; sem comentário ele são os últimos 22 bytes.
  const eocd = z.length - 22
  expect(dv.getUint32(eocd, true)).toBe(0x06054b50)
  const quantas = dv.getUint16(eocd + 10, true)
  const inicioDoCatalogo = dv.getUint32(eocd + 16, true)
  expect(dv.getUint32(eocd + 12, true)).toBe(eocd - inicioDoCatalogo)

  const partes = new Map<string, string>()
  let p = inicioDoCatalogo
  for (let i = 0; i < quantas; i++) {
    expect(dv.getUint32(p, true)).toBe(0x02014b50)
    const crc = dv.getUint32(p + 16, true)
    const tamanho = dv.getUint32(p + 24, true)
    const tamanhoDoNome = dv.getUint16(p + 28, true)
    const offset = dv.getUint32(p + 42, true)
    const nome = dec.decode(z.subarray(p + 46, p + 46 + tamanhoDoNome))

    // O cabeçalho local, no offset que o catálogo prometeu.
    expect(dv.getUint32(offset, true)).toBe(0x04034b50)
    expect(dv.getUint16(offset + 8, true)).toBe(0) // STORED
    const inicio = offset + 30 + dv.getUint16(offset + 26, true) + dv.getUint16(offset + 28, true)
    const dados = z.subarray(inicio, inicio + tamanho)

    // O CRC conferido contra a implementação do Node, e não contra a nossa.
    expect(crc32DoNode(Buffer.from(dados))).toBe(crc)

    partes.set(nome, dec.decode(dados))
    p += 46 + tamanhoDoNome + dv.getUint16(p + 30, true) + dv.getUint16(p + 32, true)
  }
  return partes
}

const EXEMPLO: Planilha = {
  nome: 'Obras de 2027',
  colunas: [
    { titulo: 'Obra', largura: 20 },
    { titulo: 'Cidade' },
    { titulo: 'CAPEX', formato: 'dinheiro' },
    { titulo: 'Prazo', formato: 'inteiro' },
  ],
  linhas: [
    ['RD-001', 'Rio das Ostras', 2_450_000.5, 18],
    ['ETE-002', 'Búzios & Cabo Frio <norte>', 12_300_000, null],
  ],
}

describe('livroXlsx', () => {
  it('monta um pacote que o Excel sabe abrir: as seis partes, nos offsets certos', () => {
    const partes = abrirZip(livroXlsx(EXEMPLO))
    expect([...partes.keys()].sort()).toEqual([
      '[Content_Types].xml',
      '_rels/.rels',
      'xl/_rels/workbook.xml.rels',
      'xl/styles.xml',
      'xl/workbook.xml',
      'xl/worksheets/sheet1.xml',
    ])
  })

  it('É O PONTO DA EXPORTAÇÃO: dinheiro sai como NÚMERO, não como texto', () => {
    // O defeito que o CSV tem e que motivou escrever isto. Se o CAPEX sair
    // `t="inlineStr"`, a coluna não soma no Excel — e a planilha existe para
    // somar. `<v>` cru é o que faz a célula ser numérica.
    const folha = abrirZip(livroXlsx(EXEMPLO)).get('xl/worksheets/sheet1.xml')!
    expect(folha).toContain('<c r="C2" s="2"><v>2450000.5</v></c>')
    expect(folha).toContain('<c r="D2" s="3"><v>18</v></c>')
    expect(folha).not.toMatch(/<c r="C2"[^>]*t="inlineStr"/)
  })

  it('escapa o XML — um "&" no nome da cidade não corrompe o arquivo inteiro', () => {
    const folha = abrirZip(livroXlsx(EXEMPLO)).get('xl/worksheets/sheet1.xml')!
    expect(folha).toContain('Búzios &amp; Cabo Frio &lt;norte&gt;')
    expect(folha).not.toContain('Búzios & Cabo')
  })

  it('célula nula é célula AUSENTE, e não a palavra "null"', () => {
    const folha = abrirZip(livroXlsx(EXEMPLO)).get('xl/worksheets/sheet1.xml')!
    expect(folha).not.toContain('null')
    expect(folha).not.toContain('r="D3"') // o prazo vazio da segunda linha
  })

  it('o cabeçalho vem na linha 1, em negrito (estilo 1)', () => {
    const folha = abrirZip(livroXlsx(EXEMPLO)).get('xl/worksheets/sheet1.xml')!
    expect(folha).toContain('<row r="1"><c r="A1" s="1"')
    expect(folha).toContain('<t xml:space="preserve">CAPEX</t>')
  })

  it('NaN e Infinity viram célula vazia em vez de um arquivo ilegível', () => {
    const folha = abrirZip(
      livroXlsx({ ...EXEMPLO, linhas: [['x', 'y', NaN, Infinity]] }),
    ).get('xl/worksheets/sheet1.xml')!
    expect(folha).not.toContain('NaN')
    expect(folha).not.toContain('Infinity')
  })

  it('aguenta uma planilha grande sem perder o alinhamento dos offsets', () => {
    const linhas = Array.from({ length: 500 }, (_, i) => [`OBRA-${i}`, 'Cidade', i * 1000, i])
    const partes = abrirZip(livroXlsx({ ...EXEMPLO, linhas }))
    expect(partes.get('xl/worksheets/sheet1.xml')).toContain('<row r="501">')
  })
})

describe('nomeDeAba', () => {
  it('tira o que o Excel recusa — senão ele acusa "arquivo corrompido"', () => {
    expect(nomeDeAba('Obras 2027/2028 [rev:1]')).toBe('Obras 2027 2028  rev 1')
  })
  it('corta em 31 caracteres', () => {
    expect(nomeDeAba('x'.repeat(60))).toHaveLength(31)
  })
  it('nome vazio ainda produz uma aba válida', () => {
    expect(nomeDeAba('  ')).toBe('Planilha')
  })
})

describe('letraDaColuna', () => {
  it('vai além de Z sem repetir referência', () => {
    expect([0, 25, 26, 27, 51, 52].map(letraDaColuna)).toEqual(['A', 'Z', 'AA', 'AB', 'AZ', 'BA'])
  })
})
