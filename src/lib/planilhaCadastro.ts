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
import { ehCts, type Dados } from '../domain/fluxo'
import { empresasDoSistema } from '../domain/escopo'
import {
  ABAS_DE_APOIO,
  COLOCA_NO_SISTEMA,
  LEIA_ME,
  PRIMEIRA_LINHA_DE_DADO,
  SISTEMAS,
  COMPONENTES,
  type PlanilhaLida,
  editavelNaPlanilha,
  contextoDeGravacao,
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

/**
 * A LETRA DA COLUNA no endereço do Excel — 1 → A, 27 → AA.
 *
 * Escrita à mão porque é isso: a base 26 do Excel não tem zero, e a biblioteca não expõe
 * a conversão. Uma aba de 712 linhas e 22 colunas já passa de Z.
 */
function letraDaColuna(n: number): string {
  let letra = ''
  for (let i = n; i > 0; i = Math.floor((i - 1) / 26)) {
    letra = String.fromCharCode(65 + ((i - 1) % 26)) + letra
  }
  return letra
}

/**
 * A FAIXA DE DADOS de uma coluna, para a lista suspensa apontar.
 *
 * Aspas simples no nome da aba: "Fluxo de escoamento" tem espaço, e sem elas a fórmula
 * não resolve. `linhas` nunca é zero — uma faixa vazia faz o Excel recusar a validação.
 */
function faixaDaColuna(aba: string, coluna: number, linhas: number): string {
  const l = letraDaColuna(coluna)
  const fim = PRIMEIRA_LINHA_DE_DADO + Math.max(linhas, 1) - 1
  return `'${aba}'!$${l}$${PRIMEIRA_LINHA_DE_DADO}:$${l}$${fim}`
}

/**
 * A ABA DE APOIO DO FLUXO — os componentes por sistema, e as CTS livres.
 *
 * Existe para as duas listas suspensas da aba do Fluxo poderem apontar para FAIXAS:
 *
 *   coluna A  o sistema de cada componente, agrupado — e o que torna o bloco de cada
 *             sistema CONTÍGUO, e sem contiguidade não há faixa por sistema
 *   coluna B  o id do componente — é esta que as listas oferecem
 *   coluna C  o nome, para quem for consultar à mão
 *   coluna E  as CTS LIVRES, numa coluna própria: lista de natureza diferente, e misturá-la
 *             na mesma faixa ofereceria coletor livre como destino, que não é destino
 *
 * Só leitura: a mescla a ignora (`ABAS_DE_APOIO`).
 */
/** Quantas linhas VAZIAS ganham lista suspensa abaixo da última — ver `LISTA_POR_FAIXA`. */
const LINHAS_PARA_CRIAR = 120

/**
 * O NOME DEFINIDO DO BLOCO DE UM SISTEMA — `sis_a1s27`.
 *
 * Nome do Excel não aceita espaço nem pontuação, e tem de começar por letra: os ids são
 * slug (`a1s27`, `d1s25`), mas o saneamento existe porque um id vindo da origem pode
 * destoar. O prefixo também evita colidir com nome de célula (`A1` é endereço, `sis_A1`
 * não é).
 */
const nomeDoSistema = (sistemaId: string): string =>
  `sis_${sistemaId.replace(/[^A-Za-z0-9_]/g, '_')}`

/**
 * O NOME DEFINIDO DAS ORIGENS DE UM SISTEMA — `org_a1s27`.
 *
 * Par do de cima, e pela mesma razão: a lista de ID Origem recorta por EMPRESA do sistema,
 * então ela depende da linha. O prefixo é outro para as duas faixas do mesmo sistema não
 * colidirem — uma tem os componentes dele (destinos), a outra as CTS que cabem nele.
 */
const nomeDaOrigem = (sistemaId: string): string =>
  `org_${sistemaId.replace(/[^A-Za-z0-9_]/g, '_')}`

/**
 * AS COLUNAS QUE GANHAM LISTA SUSPENSA APONTANDO PARA UMA FAIXA — aba → coluna → faixa.
 *
 * As duas são as que a TELA resolve com um `select`, e por isso as duas que mais custavam
 * no arquivo:
 *
 *   o SISTEMA da CTS       os sistemas da unidade, da aba de apoio `Sistemas`
 *   o DESTINO do Fluxo     os componentes do arquivo, da própria coluna de id da aba
 *
 * O destino aponta para a própria aba de propósito: os destinos possíveis são os
 * componentes que estão ali. A lista oferece os de TODOS os sistemas — a validação do
 * Excel não sabe de linha —, e a importação ainda recusa destino de outro sistema, com o
 * motivo. Oferecer os da unidade é muito melhor que texto livre, e não mente: o que a
 * lista promete é "isto é um componente", não "isto é um destino válido para esta linha".
 */
const LISTA_POR_FAIXA: Record<string, string> = {
  'cts-operacional': 'sistema_id',
}

/** As caixas que a planilha aceita de volta ganham lista suspensa. A da macrorregião não: é só leitura no arquivo. */
const LISTA_SIM_NAO: Record<string, string> = {
  nova: '"Sim,Não"',
}

/** Gera o arquivo com o cadastro inteiro da unidade, como a tela o tem agora. */
/**
 * O TETO DA DICA DE UMA CÉLULA, em caracteres — e o Excel não perdoa.
 *
 * Passar de 255 não trunca: o Excel RECUSA abrir o arquivo (`0x800A03EC`) e, no modo
 * reparo, descarta a mensagem inteira. A `exceljs` grava e relê qualquer tamanho, então a
 * ida e volta na biblioteca não prova nada — foi o que deixou uma dica de 286 caracteres
 * passar por 600 testes e chegar ao ar. `dicasCabemNoExcel` varre todas.
 */
export const LIMITE_DA_DICA = 255

/** Um componente do fluxo, para a aba de apoio e para as listas. */
interface ComponenteDoFluxo {
  sistemaId: string
  id: string
  nome: string
  /** A empresa, para a coluna de consulta: a lista recorta por ela e precisa mostrá-la. */
  emp?: string
}

export interface ApoioDoFluxo {
  /** Os componentes AGRUPADOS por sistema — a ordem é o que torna cada bloco contíguo. */
  porSistema: ComponenteDoFluxo[]
  /** As CTS fora de sistema. Vêm PRIMEIRO na lista: é o caso comum de quem monta sistema. */
  ctsLivres: ComponenteDoFluxo[]
  /**
   * AS CTS QUE JÁ ESTÃO EM SISTEMA — e que entram na lista do ID Origem igual às livres.
   *
   * Desde 02/10/2026 a planilha MOVE uma CTS de sistema, e uma lista que oferecesse só as
   * livres esconderia exatamente as que se quer mover. É também o que resolve o relato que
   * começou isto — *"quando eu tiro uma cts de um sistema essa cts não entra na lista
   * suspensa"*: com todas na lista, a que ele tira já estava lá desde o download, e não há
   * retrato para ficar velho.
   */
  ctsEmSistema: ComponenteDoFluxo[]
  /**
   * O QUE A LISTA DE ID ORIGEM OFERECE EM CADA SISTEMA — recortado por EMPRESA.
   *
   * Pôr todas as CTS na lista fez ela oferecer o que o servidor recusa: *"A macrorregião
   * 'Calumbê|d1sup3|uB1' é da empresa 'd1sup3', e o sistema 'd1s10' é de 'd1sup1'"*. A
   * régua do servidor é a empresa, igual para coletor comum e macrorregião, e um sistema
   * pode estar em cidades de mais de uma — o casamento é contra o conjunto. É a mesma régua
   * da tela, pela mesma função (`empresasDoSistema`).
   *
   * Agrupado por sistema, e por isso contíguo: é o que permite um nome definido por
   * sistema, e é ele que faz a lista depender da linha.
   */
  origemPorSistema: { sistemaId: string; ids: string[] }[]
}

/**
 * O QUE AS DUAS LISTAS DO FLUXO OFERECEM.
 *
 * `porSistema` sai ORDENADO por sistema, e isso não é estética: a faixa de um sistema só
 * existe se as linhas dele forem vizinhas. É o que permite um nome definido por sistema, e
 * é o que faz a lista do DESTINO conter só os componentes daquele sistema — a primeira
 * versão apontava para a coluna inteira e oferecia os de todos, que a revisão do Codex
 * apontou como lista que promete o que não vale.
 *
 * `ctsLivres` é a outra lista: coletor que não está em sistema nenhum. É o que se pode
 * acrescentar ao fluxo de um sistema — e por isso a lista da coluna ID ORIGEM.
 */
export function componentesPorSistema(dados: Dados): ApoioDoFluxo {
  const topo = dados['sistema-topologia'] ?? []
  const comps = topo.map((l) => ({
    sistemaId: (l.sistema_id ?? '').trim(),
    id: (l.componente_sistema_id ?? '').trim(),
    nome: (l.componente_sistema_nome ?? '').trim() || (l.componente_sistema_id ?? '').trim(),
    emp: (l.emp_codigo ?? '').trim(),
  }))
  const porSistema = comps
    .filter((c) => c.sistemaId && c.id)
    .sort((a, b) => a.sistemaId.localeCompare(b.sistemaId) || a.id.localeCompare(b.id))
  const ctsLivres = comps.filter(
    (c) => !c.sistemaId && c.id && ehCts(dados, topo.find((l) => (l.componente_sistema_id ?? '').trim() === c.id)!),
  )
  const ctsEmSistema = comps
    .filter((c) => c.sistemaId && c.id && ehCts(dados, topo.find((l) => (l.componente_sistema_id ?? '').trim() === c.id)!))
    .sort((a, b) => a.nome.localeCompare(b.nome))

  /**
   * A EMPRESA DE CADA CTS vem da FICHA (`cts-operacional`), e a linha da topologia é o
   * reserva: a ficha é quem tem a coluna, e a linha da topologia só a carrega para as que
   * estão fora de sistema (é por ela que o seletor da tela as recorta).
   */
  const empDaCts = new Map<string, string>()
  for (const l of topo) {
    const id = (l.componente_sistema_id ?? '').trim()
    if (id) empDaCts.set(id, (l.emp_codigo ?? '').trim())
  }
  for (const f of dados['cts-operacional'] ?? []) {
    const id = (f.cts_id ?? '').trim()
    const emp = (f.emp_codigo ?? '').trim()
    if (id && emp) empDaCts.set(id, emp)
  }

  for (const c of [...ctsLivres, ...ctsEmSistema]) {
    if (!c.emp) c.emp = empDaCts.get(c.id) ?? ''
  }
  const todas = [...ctsLivres, ...ctsEmSistema]
  const origemPorSistema = [...new Set(porSistema.map((c) => c.sistemaId))]
    .sort()
    .map((sistemaId) => {
      const empresas = new Set(empresasDoSistema(dados, { id: sistemaId, nome: '' }))
      const ids = todas
        //: já está NESTE sistema: oferecê-la seria oferecer o que não muda nada
        .filter((c) => c.sistemaId !== sistemaId)
        //: SEM EMPRESA FICA: é a CTS que a carga não situou em cidade nenhuma, e esconder
        //: essas deixaria uma CTS do banco sem forma nenhuma de ser colocada
        .filter((c) => {
          const emp = empDaCts.get(c.id) ?? ''
          return !emp || empresas.has(emp)
        })
        .map((c) => c.id)
      return { sistemaId, ids }
    })
    .filter((s) => s.ids.length)

  return { porSistema, ctsLivres, ctsEmSistema, origemPorSistema }
}

/**
 * AS DUAS LISTAS NUMA LINHA DO FLUXO — a de origem e a de destino.
 *
 * ORIGEM aponta para um nome definido fixo (`cts_livres`): a lista é a mesma em toda
 * linha, porque "coletor fora de sistema" não depende da linha.
 *
 * DESTINO aponta para `=INDIRECT("sis_"&$C3)` — o `$C` é a coluna do `ID Sistema` e o `3`
 * é a linha, RELATIVA. Cada linha resolve o nome do próprio sistema, e é assim que a lista
 * contém só os componentes dele. Linha sem sistema não resolve nome nenhum e fica sem
 * lista, o que é a resposta certa: sem sistema não há destino possível.
 *
 * SUGEREM, NÃO RECUSAM (`showErrorMessage: false`). A linha existente pode ter origem que
 * não está entre as livres — ela já está num sistema —, e travar a célula impediria colar
 * em massa, que é metade do motivo de existir uma planilha.
 */
function validarLinhaDoFluxo(
  row: import('exceljs').Row,
  colunas: { coluna: string }[],
  apoio: ApoioDoFluxo,
): void {
  const iOrigem = colunas.findIndex((c) => c.coluna === 'componente_sistema_id') + 1
  const iDestino = colunas.findIndex((c) => c.coluna === 'componente_sistema_id_jusante') + 1
  const iSistema = colunas.findIndex((c) => c.coluna === 'sistema_id') + 1
  if (iOrigem > 0 && iSistema > 0 && apoio.origemPorSistema.length) {
    row.getCell(iOrigem).dataValidation = {
      type: 'list',
      allowBlank: true,
      //: DEPENDE DA LINHA, como a do destino: a lista são as CTS da EMPRESA do sistema
      //: desta linha. Sem sistema não há empresa para recortar, e aí não há lista.
      formulae: [`=INDIRECT("${nomeDaOrigem('')}"&$${letraDaColuna(iSistema)}${row.number})`],
      showErrorMessage: false,
      showInputMessage: true,
      promptTitle: 'ID Origem',
      //: 255 CARACTERES, e nao e conselho: acima disso o Excel recusa abrir o arquivo
      //: (0x800A03EC) e, no reparo, descarta a mensagem. `LIMITE_DA_DICA` trava isso.
      prompt:
        'As CTS que cabem no sistema desta linha — só as da mesma empresa, que é a '
        + 'regra do cadastro. Preencha o ID Sistema primeiro, que é ele que define a '
        + 'lista. Na aba Componentes você vê a empresa e o sistema de cada CTS.',
    }
  }
  if (iDestino > 0 && iSistema > 0) {
    row.getCell(iDestino).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: [`=INDIRECT("sis_"&$${letraDaColuna(iSistema)}${row.number})`],
      showErrorMessage: false,
      showInputMessage: true,
      promptTitle: 'ID Destino (jusante)',
      prompt: 'Os componentes do sistema desta linha. Preencha o ID Sistema primeiro — é ele que define a lista.',
    }
  }
}

export async function gerarPlanilha(unidade: UnidadeState, hoje = new Date()): Promise<ArrayBuffer> {
  const { Workbook } = await excel()
  const wb = new Workbook()
  wb.creator = 'Otimizador CAPEX'
  wb.created = hoje

  const regime = regimeDeCts(unidade.data)
  //: lidos uma vez: a lista suspensa do sistema da CTS aponta para a faixa desta aba de
  //: apoio, e ela só é ESCRITA no fim do arquivo — ver `LISTA_POR_FAIXA`
  const sistemasDaUnidade = linhasDeSistemas(unidade.data)
  //: os componentes agrupados por sistema, e as CTS livres — ver `COMPONENTES`
  const apoioDoFluxo = componentesPorSistema(unidade.data)

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
      const editavel = editavelNaPlanilha(p.aba, c, contextoDeGravacao(unidade.data))
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

    /**
     * A LISTA SUSPENSA POR FAIXA — ver `LISTA_POR_FAIXA`.
     *
     * Montada ANTES das linhas porque a faixa é a mesma para todas, e calculá-la por
     * linha seria recalcular o endereço 712 vezes na aba de obras.
     *
     * A aba `Sistemas` ainda não existe neste ponto (ela fecha o arquivo), e isso não é
     * problema: a fórmula é texto, e o Excel a resolve ao abrir.
     */
    const colunaDeLista = LISTA_POR_FAIXA[p.aba.key]
    const iDaLista = colunaDeLista ? p.colunas.findIndex((c) => c.coluna === colunaDeLista) : -1
    const faixaDaLista = iDaLista < 0
      ? null
      : colunaDeLista === 'sistema_id'
        ? faixaDaColuna(SISTEMAS, 1, sistemasDaUnidade.length)
        : faixaDaColuna(p.nome, p.colunas.findIndex((c) => c.coluna === 'componente_sistema_id') + 1, p.linhas.length)

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
      if (p.aba.key === 'sistema-topologia') {
        validarLinhaDoFluxo(row, p.colunas, apoioDoFluxo)
      }
      if (faixaDaLista && iDaLista >= 0) {
        row.getCell(iDaLista + 1).dataValidation = {
          type: 'list',
          allowBlank: true,
          formulae: [faixaDaLista],
          // AVISO, E NÃO RECUSA (`showErrorMessage: false` seria mudo; `error` sem
          // `showErrorMessage` não aparece). A lista do Excel não sabe de linha, e o
          // destino válido depende do sistema da linha — travar a célula impediria
          // colagem em massa, que é metade do motivo de existir uma planilha.
          showErrorMessage: false,
          promptTitle: colunaDeLista === 'sistema_id' ? 'Sistema da CTS' : 'Destino (jusante)',
          prompt: colunaDeLista === 'sistema_id'
            ? `Escolha um sistema da unidade. A aba "${SISTEMAS}" lista id, nome e cidade.`
            : 'Escolha o componente para onde esta linha escoa. Tem de ser do mesmo sistema; a importação confere.',
          showInputMessage: true,
        }
      }
    }
    /**
     * AS LINHAS VAZIAS DO FLUXO TAMBÉM GANHAM AS LISTAS.
     *
     * "Quando eu criar uma linha" quer dizer digitar ABAIXO da última, e validação do
     * Excel é por CÉLULA: sem estender, a linha nova nasce sem lista nenhuma — justo no
     * momento em que a lista serve. São `LINHAS_PARA_CRIAR` linhas em branco, com as duas
     * validações e nada mais; o Excel não as conta como dado, e a mescla as ignora
     * (`linhaVazia`).
     */
    if (p.aba.key === 'sistema-topologia') {
      for (let n = 0; n < LINHAS_PARA_CRIAR; n++) {
        validarLinhaDoFluxo(ws.addRow([]), p.colunas, apoioDoFluxo)
      }
    }
    ws.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: p.colunas.length } }
  }

  // ---- Sistemas: a aba de apoio, para consultar o id ao colocar uma CTS
  /**
   * ---- Componentes: o apoio das duas listas da aba do Fluxo ----
   *
   * Agrupado por sistema, porque e a CONTIGUIDADE que permite uma faixa por sistema — e
   * um nome definido sobre ela. Sem isso a lista do destino so poderia apontar para a
   * coluna inteira, oferecendo componentes de todos os sistemas.
   *
   * As CTS LIVRES vao na coluna E, separadas: lista de outra natureza, e juntá-las ao
   * mesmo bloco ofereceria coletor fora de sistema como DESTINO, que ele nao e.
   */
  const comps = wb.addWorksheet(COMPONENTES, { views: [{ state: 'frozen', ySplit: 2 }], properties: { tabColor: { argb: 'FF9AA5B1' } } })
  comps.columns = [
    { key: 'sistema_id', width: 22 }, { key: 'componente_sistema_id', width: 26 },
    { key: 'componente_sistema_nome', width: 32 }, { key: 'vazio', width: 4 },
    { key: 'cts', width: 26 }, { key: 'cts_empresa', width: 14 },
    { key: 'cts_sistema', width: 22 }, { key: 'cts_nome', width: 28 },
    { key: 'vazio2', width: 4 },
    { key: 'origem_sistema', width: 22 }, { key: 'origem_cts', width: 26 },
  ]
  const rotulosC = comps.addRow([
    'ID Sistema', 'ID Origem', 'Nome', '',
    'CTS da unidade', 'Empresa', 'Em que sistema está hoje', 'Nome', '',
    'ID Sistema', 'CTS que cabem nele',
  ])
  const codigosC = comps.addRow([
    'sistema_id', 'componente_sistema_id', 'componente_sistema_nome', '',
    'cts', 'cts_empresa', 'cts_sistema', 'cts_nome', '',
    'origem_sistema', 'origem_cts',
  ])
  for (const row of [rotulosC, codigosC]) {
    row.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FUNDO.db } } as const
      cell.font = { bold: true, color: { argb: TEXTO_DB } }
    })
  }
  //: AS LIVRES PRIMEIRO: esta coluna é para CONSULTA — quem está onde, e de que empresa.
  const todasAsCts = [...apoioDoFluxo.ctsLivres, ...apoioDoFluxo.ctsEmSistema]
  //: AS ORIGENS, achatadas em blocos contíguos por sistema — é a contiguidade que permite
  //: um nome definido por sistema, e é ele que faz a lista depender da linha.
  const origens = apoioDoFluxo.origemPorSistema.flatMap((o) =>
    o.ids.map((id) => ({ sistemaId: o.sistemaId, id })),
  )
  const maior = Math.max(apoioDoFluxo.porSistema.length, todasAsCts.length, origens.length)
  for (let n = 0; n < maior; n++) {
    const c = apoioDoFluxo.porSistema[n]
    const cts = todasAsCts[n]
    const o = origens[n]
    comps.addRow([
      c?.sistemaId ?? '', c?.id ?? '', c?.nome ?? '', '',
      cts?.id ?? '', cts?.emp ?? '', cts?.sistemaId ?? '', cts?.nome ?? '', '',
      o?.sistemaId ?? '', o?.id ?? '',
    ])
  }

  /**
   * OS NOMES DEFINIDOS — um por sistema, mais o das CTS livres.
   *
   * Sao eles que fazem a lista do destino depender da LINHA: a validacao e
   * `=INDIRECT("sis_"&$C3)`, e o Excel resolve o nome do sistema daquela linha. Medi a ida
   * e volta antes de desenhar assim: nome definido e `INDIRECT` sobrevivem ao `.xlsx`.
   */
  let linha = PRIMEIRA_LINHA_DE_DADO
  for (let n = 0; n < apoioDoFluxo.porSistema.length; ) {
    const sis = apoioDoFluxo.porSistema[n].sistemaId
    let fim = n
    while (fim < apoioDoFluxo.porSistema.length && apoioDoFluxo.porSistema[fim].sistemaId === sis) fim++
    wb.definedNames.add(
      `'${COMPONENTES}'!$B$${linha}:$B$${linha + (fim - n) - 1}`,
      nomeDoSistema(sis),
    )
    linha += fim - n
    n = fim
  }
  //: UM NOME POR SISTEMA para as origens, na coluna K — o mesmo desenho dos `sis_`, e a
  //: coluna E fica só para consulta, sem nome definido: ninguém aponta para ela.
  let linhaDaOrigem = PRIMEIRA_LINHA_DE_DADO
  for (const o of apoioDoFluxo.origemPorSistema) {
    wb.definedNames.add(
      `'${COMPONENTES}'!$K$${linhaDaOrigem}:$K$${linhaDaOrigem + o.ids.length - 1}`,
      nomeDaOrigem(o.sistemaId),
    )
    linhaDaOrigem += o.ids.length
  }

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
  for (const linha of sistemasDaUnidade) sistemas.addRow(colunasDeSistemas.map((c) => linha[c] ?? ''))

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
