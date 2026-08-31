/**
 * ESCREVER UM .xlsx DE VERDADE, sem dependência nenhuma.
 *
 * O pedido era "exportar Excel", e havia dois caminhos. CSV é uma linha de
 * código e mente em três lugares: o Excel pt-BR abre por `;` e não por vírgula
 * (uma planilha de uma coluna só), acentos viram mojibake sem BOM, e — o que
 * estraga o uso real — TODO NÚMERO CHEGA COMO TEXTO. Quem exporta a lista de
 * obras de um ano exporta para somar o CAPEX; uma coluna de texto não soma.
 *
 * O outro caminho era uma biblioteca. A SheetJS resolve tudo e pesa mais que
 * todas as seis dependências de runtime deste projeto juntas, para um botão.
 *
 * Então: .xlsx escrito aqui. Um .xlsx é um ZIP de XMLs, e o ZIP admite entradas
 * STORED (sem compressão) — o que elimina o deflate e deixa só o CRC-32, que
 * são as vinte linhas abaixo. O arquivo que sai é o formato nativo: abre no
 * Excel sem aviso de conversão, os números somam, e o cabeçalho vem em negrito.
 *
 * O MÓDULO É PURO ATÉ A ÚLTIMA LINHA. `livroXlsx` devolve bytes e não toca no
 * documento; `baixarXlsx` é a casca de cinco linhas que os entrega ao
 * navegador. É essa separação que torna o formato testável de verdade — o teste
 * abre o ZIP que sai e confere o XML lá dentro, sem DOM e sem download.
 */

/** O que cabe numa célula. `null` vira célula vazia — e não a string "null". */
export type Celula = string | number | null

/**
 * O formato importa para o Excel, não para nós: ele decide se a coluna soma,
 * se alinha à direita e com quantas casas aparece. `dinheiro` é R$ cheio com
 * centavos — a exportação existe para conferir conta, e milhão arredondado
 * ("R$ 2,4 Mi") é bom na tela e péssimo numa planilha que vai ser somada.
 */
export interface Coluna {
  titulo: string
  /** Largura em caracteres. Sem isto o Excel entrega tudo em 8,43 e a coluna corta. */
  largura?: number
  formato?: 'texto' | 'dinheiro' | 'inteiro'
}

export interface Planilha {
  /** Nome da aba. Sai saneado: o Excel recusa `[]:*?/\` e mais de 31 caracteres. */
  nome: string
  colunas: Coluna[]
  linhas: Celula[][]
}

/** O índice de `cellXfs` no `styles.xml` abaixo — a ordem ali é esta. */
const ESTILO = { texto: 0, cabecalho: 1, dinheiro: 2, inteiro: 3 } as const

export const TIPO_XLSX =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

// ---------------------------------------------------------------------------
//  ZIP
// ---------------------------------------------------------------------------

const TABELA_CRC = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(b: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < b.length; i++) c = TABELA_CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/** Bytes em ordem, com os inteiros em little-endian — o que o ZIP pede. */
class Escritor {
  private readonly b: number[] = []
  get tamanho() {
    return this.b.length
  }
  u16(v: number) {
    this.b.push(v & 0xff, (v >>> 8) & 0xff)
  }
  u32(v: number) {
    this.b.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff)
  }
  crus(bytes: Uint8Array) {
    for (let i = 0; i < bytes.length; i++) this.b.push(bytes[i])
  }
  fechar(): Uint8Array {
    return new Uint8Array(this.b)
  }
}

interface Entrada {
  nome: string
  tamanho: number
  crc: number
  offset: number
}

/**
 * ZIP com todas as entradas STORED.
 *
 * A flag 0x0800 marca os nomes como UTF-8. Nenhum nome de parte de um .xlsx
 * tem acento, mas o leitor que assume CP437 na ausência da flag é o mesmo que
 * depois reclama do pacote inteiro — é um bit para não depender disso.
 */
function zipar(partes: { nome: string; texto: string }[]): Uint8Array {
  const cod = new TextEncoder()
  const agora = new Date()
  const hora =
    (agora.getHours() << 11) | (agora.getMinutes() << 5) | (agora.getSeconds() >> 1)
  const data =
    ((agora.getFullYear() - 1980) << 9) | ((agora.getMonth() + 1) << 5) | agora.getDate()

  const saida = new Escritor()
  const entradas: Entrada[] = []

  for (const parte of partes) {
    const dados = cod.encode(parte.texto)
    const nome = cod.encode(parte.nome)
    const crc = crc32(dados)
    entradas.push({ nome: parte.nome, tamanho: dados.length, crc, offset: saida.tamanho })

    saida.u32(0x04034b50)
    saida.u16(20) // versão necessária
    saida.u16(0x0800) // nomes em UTF-8
    saida.u16(0) // método: STORED
    saida.u16(hora)
    saida.u16(data)
    saida.u32(crc)
    saida.u32(dados.length) // comprimido == cru, é STORED
    saida.u32(dados.length)
    saida.u16(nome.length)
    saida.u16(0) // sem campo extra
    saida.crus(nome)
    saida.crus(dados)
  }

  const inicioDoCatalogo = saida.tamanho
  for (const e of entradas) {
    const nome = cod.encode(e.nome)
    saida.u32(0x02014b50)
    saida.u16(20) // versão de quem escreveu
    saida.u16(20) // versão necessária
    saida.u16(0x0800)
    saida.u16(0)
    saida.u16(hora)
    saida.u16(data)
    saida.u32(e.crc)
    saida.u32(e.tamanho)
    saida.u32(e.tamanho)
    saida.u16(nome.length)
    saida.u16(0) // extra
    saida.u16(0) // comentário
    saida.u16(0) // disco
    saida.u16(0) // atributos internos
    saida.u32(0) // atributos externos
    saida.u32(e.offset)
    saida.crus(nome)
  }
  const tamanhoDoCatalogo = saida.tamanho - inicioDoCatalogo

  saida.u32(0x06054b50)
  saida.u16(0)
  saida.u16(0)
  saida.u16(entradas.length)
  saida.u16(entradas.length)
  saida.u32(tamanhoDoCatalogo)
  saida.u32(inicioDoCatalogo)
  saida.u16(0) // sem comentário
  return saida.fechar()
}

// ---------------------------------------------------------------------------
//  As partes do .xlsx
// ---------------------------------------------------------------------------

function escapar(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** A → Z, AA → AZ, … — a letra da coluna `i`, contada do zero. */
export function letraDaColuna(i: number): string {
  let s = ''
  for (let n = i; n >= 0; n = Math.floor(n / 26) - 1) s = String.fromCharCode(65 + (n % 26)) + s
  return s
}

/**
 * O Excel recusa a aba com `[]:*?/\` no nome ou com mais de 31 caracteres — e
 * recusa abrindo uma caixa de "arquivo corrompido", sem dizer qual era o
 * problema. "Obras de 2027" nunca esbarra nisso; um nome vindo de dado, sim.
 */
export function nomeDeAba(bruto: string): string {
  const limpo = bruto.replace(/[[\]:*?/\\]/g, ' ').trim()
  return (limpo || 'Planilha').slice(0, 31)
}

function celula(ref: string, valor: Celula, estilo: number): string {
  if (valor === null || valor === '') return ''
  if (typeof valor === 'number') {
    // NaN e Infinity não têm representação no formato; viram vazio em vez de
    // um arquivo que o Excel recusa a abrir inteiro por causa de uma célula.
    if (!Number.isFinite(valor)) return ''
    return `<c r="${ref}" s="${estilo}"><v>${valor}</v></c>`
  }
  // `inlineStr` e não `sharedStrings`: dispensa a parte compartilhada inteira,
  // ao custo de repetir texto igual. Uma lista de obras quase não repete.
  return `<c r="${ref}" s="${estilo}" t="inlineStr"><is><t xml:space="preserve">${escapar(valor)}</t></is></c>`
}

function folha(p: Planilha): string {
  const larguras = p.colunas
    .map(
      (c, i) =>
        `<col min="${i + 1}" max="${i + 1}" width="${c.largura ?? 16}" customWidth="1"/>`,
    )
    .join('')

  const cabecalho = p.colunas
    .map((c, i) => celula(`${letraDaColuna(i)}1`, c.titulo, ESTILO.cabecalho))
    .join('')

  const corpo = p.linhas
    .map((linha, l) => {
      const r = l + 2 // a linha 1 é o cabeçalho
      const celulas = p.colunas
        .map((col, i) => {
          const v = linha[i] ?? null
          const estilo =
            typeof v === 'number'
              ? col.formato === 'dinheiro'
                ? ESTILO.dinheiro
                : col.formato === 'inteiro'
                  ? ESTILO.inteiro
                  : ESTILO.texto
              : ESTILO.texto
          return celula(`${letraDaColuna(i)}${r}`, v, estilo)
        })
        .join('')
      return `<row r="${r}">${celulas}</row>`
    })
    .join('')

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols>${larguras}</cols><sheetData><row r="1">${cabecalho}</row>${corpo}</sheetData></worksheet>`
}

/** Duas fontes e quatro formatos — a ordem dos `xf` é a de `ESTILO`. */
const ESTILOS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="&quot;R$&quot;\\ #,##0.00"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="1" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`

const TIPOS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`

const RAIZ = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`

const LIGACOES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`

/** Os bytes de um .xlsx de uma aba. Puro: nada aqui toca no documento. */
export function livroXlsx(p: Planilha): Uint8Array {
  const aba = nomeDeAba(p.nome)
  return zipar([
    { nome: '[Content_Types].xml', texto: TIPOS },
    { nome: '_rels/.rels', texto: RAIZ },
    {
      nome: 'xl/workbook.xml',
      texto: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${escapar(aba)}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    },
    { nome: 'xl/_rels/workbook.xml.rels', texto: LIGACOES },
    { nome: 'xl/styles.xml', texto: ESTILOS },
    { nome: 'xl/worksheets/sheet1.xml', texto: folha(p) },
  ])
}

/**
 * A casca: gera os bytes e entrega ao navegador.
 *
 * O `revokeObjectURL` não é higiene opcional — sem ele os bytes da planilha
 * ficam presos na memória da aba até um recarregamento, e quem exporta ano a
 * ano exporta várias vezes na mesma visita.
 */
export function baixarXlsx(p: Planilha, nomeDoArquivo: string): void {
  // `.buffer` e nao o Uint8Array: o TS 5.7 tipou os arrays por buffer, e um
  // `Uint8Array<ArrayBufferLike>` deixou de valer como `BlobPart` porque
  // poderia, em tese, estar sobre um SharedArrayBuffer. O nosso nunca esta —
  // `zipar` devolve um array recem-criado, do tamanho exato do conteudo.
  const blob = new Blob([livroXlsx(p).buffer as ArrayBuffer], { type: TIPO_XLSX })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nomeDoArquivo
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
