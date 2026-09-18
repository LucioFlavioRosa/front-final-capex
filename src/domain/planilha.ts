/**
 * A PLANILHA DO CADASTRO — o que a unidade baixa preenchido e devolve preenchido.
 *
 * ## Por que existe
 *
 * Uma unidade grande tem centenas de sub-bacias e milhares de linhas de obra.
 * Digitar isso célula a célula na grade é possível, e é o que ninguém vai fazer:
 * quem tem o dado o tem numa planilha. Então a plataforma entrega UMA planilha
 * no formato que ela mesma entende — cada aba do cadastro é uma aba do arquivo,
 * já com as linhas de hoje — e recebe a mesma planilha de volta.
 *
 * ## O que este módulo é, e o que não é
 *
 * É o MODELO do arquivo e a MESCLA da volta: quais abas, quais colunas, como um
 * número atravessa (a tela guarda tudo como texto pt-BR; o Excel quer número), e
 * como uma linha da planilha encontra a linha da tela para atualizá-la. Não sabe
 * ler nem escrever `.xlsx` — isso é `lib/planilhaCadastro.ts`, que é o único
 * lugar que importa a biblioteca. Separar os dois é o que deixa a regra testável
 * sem montar arquivo nenhum.
 *
 * ## Decisões que valem como contrato
 *
 * SÓ ENTRA O QUE A UNIDADE PREENCHE. Coluna 'db' (vem do Databricks) e 'calc'
 * (o motor calcula) está na planilha para se LER — vai em cinza —, e o que for
 * digitado nela é ignorado na volta. Os ids nunca mudam pela planilha: uma linha
 * cujo id a tela não conhece é avisada e ignorada, porque criar ficha não é papel
 * do wizard (o servidor recusa id sem ficha, ver `gravarColeta`).
 *
 * A PLANILHA É DE UMA UNIDADE. Os ids gerados (`b001`, `s01`…) se repetem entre
 * unidades, então casar só pela chave da linha aplicaria a unidade A por cima
 * da B. A aba Unidade carrega o `unidade_id`, e a mescla recusa o arquivo de
 * outra unidade — e o arquivo sem essa aba, porque sem ela não há como saber.
 *
 * A MACRORREGIÃO DE CTS APARECE NO ARQUIVO — E SÓ SE DECIDE NA TELA. A caixa da
 * aba Unidade decide quantas CTS cada sistema comporta — marcada, uma;
 * desmarcada, quantas forem colocadas — e é isso que diz quantas fichas de CTS
 * há para preencher. Então o regime vai escrito no Leia-me, a célula da caixa vai
 * na aba Unidade, e as abas de CTS carregam a regra no cabeçalho. Mas a célula
 * NÃO VOLTA: a caixa da tela grava no servidor na hora e relê as fichas de CTS,
 * porque o regime muda quais fichas existem (a soma da macrorregião, ou cada
 * coletor). Uma planilha gerada num regime carrega as fichas daquele regime —
 * importá-la na tela em outro regime é avisado, e as abas de CTS dela ficam de
 * fora.
 *
 * A CTS ENTRA NUM SISTEMA PELA PLANILHA — só entra. A ficha e as obras de uma
 * CTS chegam da origem antes de alguém decidir em que sistema ela entra, e quem
 * preenche fora do site quer preenchê-las já. Então a aba "Dados da CTS" traz
 * também as CTS ainda fora de sistema (`sisId` vazio), e nelas a coluna
 * `sistema_id` é a única coluna de id que a planilha aceita: o id (ou o nome) de
 * um sistema da unidade. Mudar de sistema ou sair dele continua sendo pela tela,
 * onde há o desenho do fluxo para conferir. Marcada a macrorregião, um sistema
 * que já tem CTS não recebe outra — a mesma regra do seletor da tela.
 */
import { ABAS_VISIVEIS } from '../data/cadastroUnidade/blocos'
import { colunaLabel, SCHEMA } from '../data/cadastroUnidade/schema'
import type { AbaDef, ColDef, Row, UnidadeState } from '../data/cadastroUnidade/types'
import { type Dados, ehCts } from './fluxo'

// ------------------------------------------------------------------ o modelo

/** A aba de instruções, sempre a primeira do arquivo. Não é aba de dado. */
export const LEIA_ME = 'Leia-me'

/**
 * A ABA DE APOIO com os sistemas da unidade — id, nome e cidade —, para quem
 * vai preencher o `sistema_id` de uma CTS ter onde procurar. É a aba oculta
 * `cidade-sistema` do cadastro; só leitura, e a mescla a ignora sem aviso.
 */
export const SISTEMAS = 'Sistemas'

/** As abas do arquivo que não são de dado do cadastro, e que a mescla pula sem avisar. */
export const ABAS_DE_APOIO = new Set([LEIA_ME, SISTEMAS])

/**
 * O NOME DE CADA ABA NO ARQUIVO. O Excel limita a 31 caracteres e proíbe
 * `[ ] : * ? / \` — "CAPEX de componentes de sub-bacias" tem 34. Aba sem entrada
 * aqui usa o título da tela, e o teste confere que todos cabem.
 */
export const NOME_DA_PLANILHA: Record<string, string> = {
  'unidade-regional': 'Unidade',
  'componentes-subbacias-capex': 'CAPEX das sub-bacias',
}

/**
 * COLUNAS QUE A TELA NÃO MOSTRA MAS A PLANILHA PRECISA. No Fluxo, a barra de
 * escopo diz de qual sistema é cada linha e a grade não repete; no arquivo não
 * há barra, e sem as duas colunas a aba vira uma lista de trechos sem sistema.
 * Só leitura: quem coloca uma CTS num sistema pelo arquivo é a aba da CTS.
 */
const COLUNAS_EXTRAS: Record<string, ColDef[]> = {
  'sistema-topologia': [
    { coluna: 'sistema_id', origem: 'db', procedencia: 'mock' },
    { coluna: 'sistema_name', origem: 'db', procedencia: 'mock' },
  ],
}

export interface PlanilhaDaAba {
  aba: AbaDef
  /** O nome da aba no arquivo — ver `NOME_DA_PLANILHA`. */
  nome: string
  colunas: ColDef[]
  linhas: Row[]
}

export const nomeDaPlanilha = (aba: AbaDef): string => NOME_DA_PLANILHA[aba.key] ?? aba.titulo

export const colunasDaPlanilha = (aba: AbaDef): ColDef[] => [
  ...(COLUNAS_EXTRAS[aba.key] ?? []),
  ...aba.cols,
]

/** As abas do arquivo, na ordem do stepper: as visíveis, todas. */
export function planilhasDoCadastro(dados: Dados): PlanilhaDaAba[] {
  return ABAS_VISIVEIS.map((aba) => ({
    aba,
    nome: nomeDaPlanilha(aba),
    colunas: colunasDaPlanilha(aba),
    linhas: dados[aba.key] ?? [],
  }))
}

/**
 * UMA LINHA POR CIDADE NAS LISTAS, mesmo sem registro.
 *
 * Metas de cobertura e Escala de paridade são abas de "Adicionar linha": uma
 * cidade sem meta não tem linha nenhuma, e quem abre o arquivo para preencher
 * não teria onde escrever — nem saberia que a cidade existe. Então o ARQUIVO
 * leva, para cada cidade sem registro, uma linha-modelo com a cidade preenchida
 * e o resto em branco. Cidade que já tem registro vai como está.
 *
 * Só no arquivo: o estado da tela não ganha linha nenhuma, e na volta a
 * linha-modelo intocada (nada além da cidade) é ignorada em silêncio — é o que
 * mantém "baixar e importar sem mexer" sem mudar nada.
 */
const ABAS_POR_CIDADE = new Set(['metas-cobertura', 'fator-esgoto'])

export function linhasNoArquivo(planilha: PlanilhaDaAba, dados: Dados): Row[] {
  if (!ABAS_POR_CIDADE.has(planilha.aba.key)) return planilha.linhas
  const comRegistro = new Set(planilha.linhas.map((l) => (l.cidade_id ?? '').trim()))
  const modelos = (dados['cidade-operacional'] ?? [])
    .filter((c) => c.cidade_id && !comRegistro.has(c.cidade_id.trim()))
    .map((c) => {
      const linha: Row = {
        emp_codigo: c.emp_codigo ?? '',
        empresa: c.empresa ?? '',
        cidade_id: c.cidade_id,
        cidade_name: c.cidade_name ?? '',
      }
      for (const col of colunasImportaveis(planilha.aba)) linha[col] = ''
      return linha
    })
  return modelos.length ? [...planilha.linhas, ...modelos] : planilha.linhas
}

/** As abas como vão para o ARQUIVO: as da tela, com a linha-modelo por cidade nas listas. */
export function planilhasDoArquivo(dados: Dados): PlanilhaDaAba[] {
  return planilhasDoCadastro(dados).map((p) => ({ ...p, linhas: linhasNoArquivo(p, dados) }))
}

/** As linhas da aba de apoio `Sistemas`: um sistema por linha, com a cidade. */
export function linhasDeSistemas(dados: Dados): Row[] {
  const cidade = new Map((dados['cidade-operacional'] ?? []).map((c) => [c.cidade_id, c.cidade_name ?? '']))
  return (dados['cidade-sistema'] ?? []).map((s) => ({
    sistema_id: s.sistema_id ?? '',
    sistema_name: s.sistema_name ?? '',
    cidade_id: s.cidade_id ?? '',
    cidade_name: cidade.get(s.cidade_id ?? '') ?? '',
  }))
}

/**
 * A UNIDADE PREENCHE, MAS SÓ NA TELA. A caixa da macrorregião grava na hora e
 * relê o cadastro (ver o cabeçalho): na planilha ela é leitura, como uma coluna
 * do Databricks, e é assim que o arquivo a pinta.
 */
export const SO_NA_TELA = new Set(['usa_macrorregiao_cts'])

/**
 * O ID DO SISTEMA NA ABA DA CTS — a exceção à regra "id não se preenche". Só
 * nela: é a coluna por onde a CTS livre entra num sistema (ver o cabeçalho).
 */
export const COLOCA_NO_SISTEMA: Record<string, string> = { 'cts-operacional': 'sistema_id' }

/**
 * A COLUNA ENTRA NA VOLTA? Só a que a unidade preenche, e mesmo entre essas os
 * ids ficam de fora — id se escolhe na tela (a lista de destinos do Fluxo, o
 * seletor de CTS), onde há regra para conferir. A exceção é `COLOCA_NO_SISTEMA`,
 * que tem regra própria em `colocarCtsNoSistema`.
 */
export const colunaImportavel = (c: ColDef): boolean =>
  c.origem === 'un' && !ehColunaDeTexto(c.coluna) && !SO_NA_TELA.has(c.coluna)

/** As colunas de uma aba que a planilha devolve, na ordem da aba. */
export const colunasImportaveis = (aba: AbaDef): string[] =>
  aba.cols.filter(colunaImportavel).map((c) => c.coluna)

/** Como a coluna se apresenta no arquivo: editável (âmbar), ou só leitura (cinza). */
export const editavelNaPlanilha = (aba: AbaDef, c: ColDef): boolean =>
  (c.origem === 'un' && !SO_NA_TELA.has(c.coluna)) || COLOCA_NO_SISTEMA[aba.key] === c.coluna

// -------------------------------------------------------------- o regime

export interface RegimeDeCts {
  macro: boolean
  /** "Macrorregião" ou "Microrregião". */
  nome: string
  /** A regra, em uma frase — a mesma no Leia-me, no cartão e no cabeçalho. */
  regra: string
}

/**
 * O regime da unidade, lido da caixa. É o que a planilha reflete: com a
 * macrorregião marcada, as abas de CTS trazem uma ficha por sistema; sem ela,
 * uma por coletor — colocado ou ainda esperando sistema.
 */
export function regimeDeCts(dados: Dados): RegimeDeCts {
  const macro = dados['unidade-regional']?.[0]?.usa_macrorregiao_cts === 'Sim'
  return macro
    ? {
        macro,
        nome: 'Macrorregião',
        regra:
          'Esta unidade usa macrorregião de CTS: cada sistema aceita UMA CTS. As abas ' +
          '"Dados da CTS" e "CAPEX da CTS" trazem uma ficha por macrorregião — a soma dos ' +
          'coletores dela —, as já colocadas num sistema e as que ainda esperam um (sistema ' +
          'em branco); as obras se preenchem na macrorregião, nunca no coletor.',
      }
    : {
        macro,
        nome: 'Microrregião',
        regra:
          'Esta unidade usa microrregião de CTS: cada sistema aceita mais de uma CTS. As ' +
          'abas "Dados da CTS" e "CAPEX da CTS" trazem uma ficha por coletor — os já ' +
          'colocados num sistema e os que ainda esperam um (sistema em branco) —, e as ' +
          'obras se preenchem coletor a coletor.',
      }
}

// ------------------------------------------------------- número na ida e na volta

/**
 * O CONTRATO DE NÚMERO É pt-BR ESTRITO — o mesmo do servidor (`formato.py`): a
 * tela guarda `"1.026,89"`, e é assim que o valor viaja no `PUT`. O Excel, por
 * sua vez, só soma o que é número. Então a ida converte texto pt-BR em número e
 * a volta refaz o texto, e o teste de ida e volta garante que nada se perde.
 */
const PT_BR = /^-?\d{1,3}(\.\d{3})*(,\d+)?$|^-?\d+(,\d+)?$/

/**
 * ANO E CÓDIGO NÃO GANHAM SEPARADOR DE MILHAR — `2028` não é "2.028". A lista
 * espelha `SEM_SEPARADOR` do servidor, com os nomes de coluna da tela.
 */
export const COLUNAS_SEM_SEPARADOR = new Set([
  'data_fim_concessao',
  'ano',
  'obra_obrigatoria_ano',
  'obra_proibida_ate',
])

/**
 * ID, CÓDIGO E NOME SÃO TEXTO, mesmo quando só têm dígitos. Um `cidade_id`
 * "3550308" que virasse número voltaria como "3.550.308", e a linha deixaria de
 * encontrar a cidade dela.
 */
export const ehColunaDeTexto = (col: string): boolean =>
  col.endsWith('_id') || col.endsWith('_name') || col === 'emp_codigo'

/** Texto pt-BR → número, quando é número estrito; senão o texto como está. */
export function paraCelula(col: string, valor: string | undefined): string | number {
  const v = (valor ?? '').trim()
  if (!v || ehColunaDeTexto(col) || !PT_BR.test(v)) return v
  return Number(v.replace(/\./g, '').replace(',', '.'))
}

/** Número → texto pt-BR, como o servidor emite: inteiro sem casa, até 4 casas. */
export function ptBr(n: number, col = ''): string {
  if (!Number.isFinite(n)) return ''
  if (COLUNAS_SEM_SEPARADOR.has(col)) return n.toLocaleString('pt-BR', { useGrouping: false, maximumFractionDigits: 4 })
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 4 })
}

/**
 * FÓRMULA SEM RESULTADO — o arquivo foi salvo sem calcular (LibreOffice com
 * recálculo desligado, `.xlsx` gerado por script). Não há valor a ler, e ler
 * vazio apagaria a célula em silêncio: quem mescla pula a célula e avisa.
 */
export const semResultado = (valor: unknown): boolean =>
  typeof valor === 'object' && valor !== null && 'formula' in valor && (valor as { result?: unknown }).result == null

/**
 * O QUE VEIO NA CÉLULA → o texto que a tela guarda.
 *
 * A biblioteca devolve a célula como ela é no arquivo: número, texto, data,
 * fórmula (com o resultado ao lado), texto formatado em pedaços, hiperlink. A
 * tela só conhece texto — e é o resultado que interessa, nunca a fórmula.
 */
export function daCelula(col: string, valor: unknown): string {
  if (valor == null) return ''
  if (typeof valor === 'number') return ptBr(valor, col)
  if (typeof valor === 'boolean') return valor ? 'Sim' : 'Nao'
  if (valor instanceof Date) return String(valor.getFullYear())
  if (typeof valor === 'object') {
    const o = valor as { result?: unknown; richText?: { text: string }[]; text?: unknown; error?: unknown }
    if ('error' in o) return ''
    if ('result' in o) return daCelula(col, o.result)
    if (Array.isArray(o.richText)) return o.richText.map((t) => t.text).join('').trim()
    if ('text' in o) return daCelula(col, o.text)
    return ''
  }
  return String(valor).trim()
}

// ------------------------------------------------------------------ a volta

/** Uma aba do arquivo, como a biblioteca a leu: as chaves das colunas e as linhas cruas. */
export interface AbaLida {
  colunas: string[]
  linhas: Record<string, unknown>[]
}

/** O arquivo lido: nome da aba → conteúdo. As abas de apoio não entram. */
export type PlanilhaLida = Record<string, AbaLida>

export interface ResultadoDaMescla {
  /** SÓ as abas que mudaram, prontas para `IMPORTAR_PLANILHA`. */
  dados: Dados
  /** Quantas células mudaram de valor. */
  alteracoes: number
  /** Quantas linhas a planilha trouxe, somando as abas reconhecidas. */
  linhasLidas: number
  /** O que foi ignorado e por quê — para a pessoa ler antes de salvar. */
  avisos: string[]
}

/**
 * COMO CADA ABA ENCONTRA A LINHA DA TELA.
 *
 *   'unica'  — a aba tem uma linha só (a unidade).
 *   'chave'  — uma linha por entidade, achada pelas colunas listadas.
 *   'lista'  — linhas que a unidade cria e apaga (metas, faixas): a planilha
 *              traz a lista inteira, e ela SUBSTITUI a da tela.
 */
type Estrategia =
  | { tipo: 'unica' }
  | { tipo: 'chave'; colunas: string[] }
  | { tipo: 'lista' }

const ESTRATEGIA: Record<string, Estrategia> = {
  'unidade-regional': { tipo: 'unica' },
  'empresa': { tipo: 'chave', colunas: ['emp_codigo'] },
  'cidade-operacional': { tipo: 'chave', colunas: ['cidade_id'] },
  'metas-cobertura': { tipo: 'lista' },
  'fator-esgoto': { tipo: 'lista' },
  'ete-capex': { tipo: 'chave', colunas: ['ete_id'] },
  'sistema-topologia': { tipo: 'chave', colunas: ['componente_sistema_id'] },
  'subbacia-operacional': { tipo: 'chave', colunas: ['sub_bacia_id'] },
  'componentes-subbacias-capex': { tipo: 'chave', colunas: ['sub_bacia_id', 'componente'] },
  'cts-operacional': { tipo: 'chave', colunas: ['cts_id'] },
  'componentes-cts-capex': { tipo: 'chave', colunas: ['cts_id', 'componente'] },
}

const ABAS_DE_CTS = new Set(['cts-operacional', 'componentes-cts-capex'])

/** A primeira linha de dado do arquivo — as duas de cima são o cabeçalho. */
export const PRIMEIRA_LINHA_DE_DADO = 3

const txt = (v: unknown): string => String(v ?? '').trim()
/** A chave composta de uma linha, para casar obra por ficha + componente. */
const SEPARADOR = ' || '
const chaveDe = (linha: Record<string, unknown>, colunas: string[]): string =>
  colunas.map((c) => txt(daCelula(c, linha[c]))).join(SEPARADOR)

/** A célula da caixa aceita o que uma pessoa escreve para dizer sim ou não. */
export function simOuNao(valor: unknown): 'Sim' | 'Nao' | null {
  const v = daCelula('', valor).toLowerCase()
  if (['sim', 's', 'true', 'x', '1', 'verdadeiro'].includes(v)) return 'Sim'
  if (['nao', 'não', 'n', 'false', '0', 'falso', ''].includes(v)) return 'Nao'
  return null
}

/**
 * O VOCABULÁRIO DAS CAIXAS: `nova` (ETE) guarda 'Sim'/'Não' — com acento, como o
 * select da grade — e quem escreve "sim" na planilha não pode cair fora dele.
 */
function normalizar(col: string, valor: string): string {
  if (col !== 'nova' || !valor) return valor
  const v = simOuNao(valor)
  return v === 'Sim' ? 'Sim' : v === 'Nao' ? 'Não' : valor
}

/** Um aviso com o endereço: aba e linha do arquivo. */
const aviso = (planilha: PlanilhaDaAba, linhaDoArquivo: number, avisos: string[]) => (texto: string) =>
  avisos.push(`${planilha.nome}, linha ${linhaDoArquivo}: ${texto}`)

const linhaVazia = (linha: Record<string, unknown>): boolean =>
  Object.values(linha).every((v) => daCelula('', v) === '')

const abaDoSchema = (key: string): AbaDef => SCHEMA.find((a) => a.key === key)!

/**
 * MESCLA a planilha lida no cadastro da tela.
 *
 * Devolve só as abas que mudaram, com linhas NOVAS onde algo mudou — o estado
 * do wizard é imutável, e reaproveitar a linha da tela faria o diff do Salvar
 * não enxergar a mudança. Nada aqui grava: quem chama mostra os avisos, a
 * pessoa revê a grade e clica em Salvar.
 */
export function mesclarPlanilha(
  unidade: { id: string; data: Dados },
  lida: PlanilhaLida,
): ResultadoDaMescla {
  const atual = unidade.data
  const dados: Dados = {}
  const avisos: string[] = []
  let alteracoes = 0
  let linhasLidas = 0

  const porNome = new Map(Object.entries(lida).map(([nome, aba]) => [nome.trim().toLowerCase(), aba]))
  const planilhas = planilhasDoCadastro(atual)

  // DE QUE UNIDADE É O ARQUIVO — antes de qualquer linha. Ver o cabeçalho.
  const abaUnidade = porNome.get(nomeDaPlanilha(abaDoSchema('unidade-regional')).toLowerCase())
  const idDoArquivo = txt(daCelula('unidade_id', abaUnidade?.linhas[0]?.unidade_id))
  if (!abaUnidade || !idDoArquivo) {
    return {
      dados, alteracoes, linhasLidas,
      avisos: ['O arquivo não tem a aba "Unidade" com o id da unidade — não dá para saber de que unidade ele é. Baixe a planilha daqui e preencha-a sem apagar abas.'],
    }
  }
  if (idDoArquivo.toLowerCase() !== unidade.id.trim().toLowerCase()) {
    return {
      dados, alteracoes, linhasLidas,
      avisos: [`Esta planilha é da unidade ${idDoArquivo}, e a tela está em ${unidade.id}. Nada foi importado.`],
    }
  }

  // O REGIME EM QUE O ARQUIVO NASCEU. Diferente do da tela, as fichas de CTS
  // dele são outras (a soma da macrorregião, ou cada coletor): as abas de CTS
  // ficam de fora, e o resto entra.
  const primeira = abaUnidade.linhas[0] ?? {}
  const regimeDoArquivo = 'usa_macrorregiao_cts' in primeira ? simOuNao(primeira.usa_macrorregiao_cts) : null
  const regimeDaTela = regimeDeCts(atual).macro ? 'Sim' : 'Nao'
  const regimeDiverge = regimeDoArquivo !== null && regimeDoArquivo !== regimeDaTela
  if (regimeDiverge) {
    avisos.push(
      `A planilha foi gerada com a macrorregião de CTS ${regimeDoArquivo === 'Sim' ? 'marcada' : 'desmarcada'}, e a tela está ${regimeDaTela === 'Sim' ? 'marcada' : 'desmarcada'}: as fichas de CTS são outras. As abas "Dados da CTS" e "CAPEX da CTS" ficaram de fora — acerte a caixa na tela e baixe a planilha de novo.`,
    )
  }

  const reconhecidas = new Set<string>()
  for (const planilha of planilhas) {
    const nome = planilha.nome.trim().toLowerCase()
    const aba = porNome.get(nome)
    if (!aba) continue
    reconhecidas.add(nome)
    if (regimeDiverge && ABAS_DE_CTS.has(planilha.aba.key)) continue
    linhasLidas += aba.linhas.length

    const estrategia = ESTRATEGIA[planilha.aba.key] ?? { tipo: 'chave', colunas: [] }
    const resultado =
      estrategia.tipo === 'lista'
        ? mesclarLista(planilha, atual, aba, avisos)
        : estrategia.tipo === 'unica'
          ? mesclarUnica(planilha, aba, avisos)
          : mesclarPorChave(planilha, aba, estrategia.colunas, avisos)
    if (resultado) {
      dados[planilha.aba.key] = resultado.linhas
      alteracoes += resultado.alteracoes
    }
  }

  // A CTS ENTRA NO SISTEMA por último: a ficha dela já foi mesclada acima, e a
  // colocação escreve em DUAS abas — a da CTS e a do Fluxo.
  const abaCts = porNome.get(nomeDaPlanilha(abaDoSchema('cts-operacional')).toLowerCase())
  if (abaCts && !regimeDiverge) {
    const colocadas = colocarCtsNoSistema(
      planilhas.find((p) => p.aba.key === 'cts-operacional')!,
      { ...atual, ...dados },
      abaCts,
      avisos,
    )
    if (colocadas) {
      Object.assign(dados, colocadas.dados)
      alteracoes += colocadas.alteracoes
    }
  }

  for (const nome of Object.keys(lida)) {
    const n = nome.trim().toLowerCase()
    if (!reconhecidas.has(n) && ![...ABAS_DE_APOIO].some((a) => a.toLowerCase() === n)) {
      avisos.push(`A aba "${nome}" não é uma aba do cadastro e foi ignorada.`)
    }
  }

  return { dados, alteracoes, linhasLidas, avisos }
}

interface Mesclado {
  linhas: Row[]
  alteracoes: number
}

/** Aplica as colunas importáveis de `origem` sobre `linha`. Devolve a linha nova ou null se nada mudou. */
function aplicar(
  linha: Row,
  origem: Record<string, unknown>,
  colunas: string[],
  avisar: (texto: string) => void,
): { linha: Row; alteracoes: number } | null {
  let alteracoes = 0
  const nova: Row = { ...linha }
  for (const col of colunas) {
    if (!(col in origem)) continue // coluna que a planilha não trouxe: fica como está
    if (semResultado(origem[col])) {
      avisar(`"${colunaLabel(col)}" tem uma fórmula sem resultado calculado — a célula ficou como estava.`)
      continue
    }
    const valor = normalizar(col, daCelula(col, origem[col]))
    if ((linha[col] ?? '') === valor) continue
    nova[col] = valor
    alteracoes++
  }
  return alteracoes ? { linha: nova, alteracoes } : null
}

function mesclarUnica(planilha: PlanilhaDaAba, aba: AbaLida, avisos: string[]): Mesclado | null {
  const linha = planilha.linhas[0]
  const origem = aba.linhas[0]
  if (!linha || !origem) return null
  const r = aplicar(linha, origem, colunasImportaveis(planilha.aba), aviso(planilha, PRIMEIRA_LINHA_DE_DADO, avisos))
  if (!r) return null
  return { linhas: [r.linha, ...planilha.linhas.slice(1)], alteracoes: r.alteracoes }
}

function mesclarPorChave(
  planilha: PlanilhaDaAba,
  aba: AbaLida,
  chave: string[],
  avisos: string[],
): Mesclado | null {
  const colunas = colunasImportaveis(planilha.aba)
  if (!colunas.length || !chave.length) return null // aba só de leitura: nada a trazer

  const indice = new Map<string, number>()
  planilha.linhas.forEach((l, i) => {
    const k = chave.map((c) => txt(l[c])).join(SEPARADOR)
    if (!indice.has(k)) indice.set(k, i)
  })

  const linhas = [...planilha.linhas]
  let alteracoes = 0
  let ignoradas = 0
  const ehFluxo = planilha.aba.key === 'sistema-topologia'
  const nomeDoComponente = ehFluxo
    ? new Map(planilha.linhas.map((l) => [txt(l.componente_sistema_id), txt(l.componente_sistema_nome)]))
    : null

  aba.linhas.forEach((origem, n) => {
    if (linhaVazia(origem)) return
    const linhaDoArquivo = n + PRIMEIRA_LINHA_DE_DADO
    const k = chaveDe(origem, chave)
    const i = indice.get(k)
    if (i === undefined) {
      ignoradas++
      if (ignoradas <= 5) {
        const id = chave.map((c) => daCelula(c, origem[c]) || '(vazio)').join(' · ')
        avisos.push(`${planilha.nome}, linha ${linhaDoArquivo}: "${id}" não existe no cadastro — ignorada.`)
      }
      return
    }
    const entrada = { ...origem }

    if (ehFluxo && nomeDoComponente) {
      // O DESTINO SÓ SE MUDA DE QUEM JÁ ESTÁ NUM SISTEMA, e tem de ser um trecho
      // que existe. Colocar uma CTS livre num sistema é pela aba da CTS, e
      // desenhar o caminho dela depois é pela tela, onde há o fluxo para conferir.
      const destino = txt(daCelula('componente_sistema_id_jusante', entrada.componente_sistema_id_jusante))
      const mudou = destino !== txt(linhas[i].componente_sistema_id_jusante)
      if (mudou && !txt(linhas[i].sistema_id)) {
        avisos.push(`${planilha.nome}, linha ${linhaDoArquivo}: "${k}" está fora de sistema — coloque-a pela aba "Dados da CTS" e desenhe o caminho na tela.`)
        return
      }
      if (mudou && destino && !nomeDoComponente.has(destino)) {
        avisos.push(`${planilha.nome}, linha ${linhaDoArquivo}: o destino "${destino}" não existe no cadastro — ignorado.`)
        return
      }
      if (mudou) entrada.componente_sistema_nome_jusante = nomeDoComponente.get(destino) ?? ''
    }

    const r = aplicar(
      linhas[i], entrada,
      ehFluxo ? [...colunas, 'componente_sistema_nome_jusante'] : colunas,
      aviso(planilha, linhaDoArquivo, avisos),
    )
    if (!r) return
    linhas[i] = r.linha
    alteracoes += r.alteracoes
  })
  if (ignoradas > 5) avisos.push(`${planilha.nome}: mais ${ignoradas - 5} linha(s) com id desconhecido foram ignoradas.`)

  return alteracoes ? { linhas, alteracoes } : null
}

/**
 * METAS E FAIXAS: a planilha traz a lista inteira, e ela vale.
 *
 * São as abas de "Adicionar linha" — a unidade cria e apaga linhas, e não há
 * id para casar. Então a lista do arquivo substitui a da tela: linha que não
 * voltou foi apagada, linha nova foi criada. Cada linha precisa de uma cidade
 * que a unidade tenha; a empresa e o nome vêm da cidade, não da planilha.
 */
function mesclarLista(planilha: PlanilhaDaAba, atual: Dados, aba: AbaLida, avisos: string[]): Mesclado | null {
  const cidades = new Map(
    (atual['cidade-operacional'] ?? []).map((c) => [txt(c.cidade_id), c]),
  )
  const colunas = colunasImportaveis(planilha.aba)

  // FÓRMULA SEM RESULTADO NUMA LISTA: não há linha anterior a preservar — a
  // lista do arquivo substitui a da tela inteira —, e gravar vazio apagaria um
  // valor que existia. A aba inteira fica de fora, e o aviso diz onde.
  const semCalculo = aba.linhas.findIndex((l) => !linhaVazia(l) && colunas.some((c) => semResultado(l[c])))
  if (semCalculo >= 0) {
    const col = colunas.find((c) => semResultado(aba.linhas[semCalculo][c]))!
    avisos.push(
      `${planilha.nome}, linha ${semCalculo + PRIMEIRA_LINHA_DE_DADO}: "${colunaLabel(col)}" tem uma fórmula sem resultado calculado — a aba inteira ficou de fora. Salve o arquivo calculado e importe de novo.`,
    )
    return null
  }

  const linhas: Row[] = []
  aba.linhas.forEach((origem, n) => {
    if (linhaVazia(origem)) return
    const linhaDoArquivo = n + PRIMEIRA_LINHA_DE_DADO
    const cid = txt(daCelula('cidade_id', origem.cidade_id))
    const cidade = cidades.get(cid)
    if (!cidade) {
      avisos.push(`${planilha.nome}, linha ${linhaDoArquivo}: a cidade "${cid || '(vazio)'}" não é desta unidade — ignorada.`)
      return
    }
    // A LINHA-MODELO que o arquivo trouxe e ninguém preencheu: só a cidade, o
    // resto em branco. Não é registro — ver `linhasNoArquivo`.
    if (colunas.every((col) => daCelula(col, origem[col]) === '')) return
    const linha: Row = {
      emp_codigo: cidade.emp_codigo ?? '',
      empresa: cidade.empresa ?? '',
      cidade_id: cid,
      cidade_name: cidade.cidade_name ?? '',
    }
    for (const col of colunas) linha[col] = normalizar(col, daCelula(col, origem[col]))
    linhas.push(linha)
  })

  const igual =
    linhas.length === planilha.linhas.length &&
    linhas.every((l, i) => Object.keys({ ...l, ...planilha.linhas[i] }).every((k) => (l[k] ?? '') === (planilha.linhas[i][k] ?? '')))
  if (igual) return null
  return { linhas, alteracoes: Math.max(linhas.length, planilha.linhas.length) }
}

/**
 * A CTS LIVRE ENTRA NUM SISTEMA — a coluna `sistema_id` da aba "Dados da CTS".
 *
 * É o que o seletor "Adicionar CTS" do Fluxo faz na tela: escreve `sistema_id`
 * na linha da CTS na topologia e deixa o jusante em branco, para o caminho ser
 * desenhado depois. Aqui é o mesmo, para as CTS cujo sistema ainda está em
 * branco. Aceita o id ou o nome de um sistema da unidade (a aba `Sistemas` do
 * arquivo lista os dois). Marcada a macrorregião, um sistema que já tem CTS —
 * na tela ou nesta mesma planilha — não recebe outra.
 *
 * MUDAR OU SAIR é pela tela: trocar de sistema desfaz um caminho já desenhado,
 * e sair de um sistema pode deixar quem escoava para a CTS sem destino. As duas
 * têm o fluxo desenhado ao lado para se conferir; a planilha não tem.
 */
function colocarCtsNoSistema(
  planilha: PlanilhaDaAba,
  dados: Dados,
  aba: AbaLida,
  avisos: string[],
): { dados: Dados; alteracoes: number } | null {
  const sistemas = dados['cidade-sistema'] ?? []
  const porId = new Map(sistemas.map((s) => [txt(s.sistema_id).toLowerCase(), s]))
  const porNome = new Map<string, Row[]>()
  for (const s of sistemas) {
    const nome = txt(s.sistema_name).toLowerCase()
    if (!porNome.has(nome)) porNome.set(nome, [])
    porNome.get(nome)!.push(s)
  }
  const resolver = (texto: string): Row | null | 'ambiguo' => {
    const k = texto.toLowerCase()
    const porIdAchado = porId.get(k)
    if (porIdAchado) return porIdAchado
    const candidatos = porNome.get(k) ?? []
    return candidatos.length === 1 ? candidatos[0] : candidatos.length > 1 ? 'ambiguo' : null
  }

  const cts = [...(dados['cts-operacional'] ?? [])]
  const topo = [...(dados['sistema-topologia'] ?? [])]
  const indiceCts = new Map(cts.map((l, i) => [txt(l.cts_id), i]))
  const indiceTopo = new Map(topo.map((l, i) => [txt(l.componente_sistema_id), i]))
  const macro = regimeDeCts(dados).macro

  // QUANTAS CTS CADA SISTEMA JÁ TEM, na topologia — contando as que esta
  // planilha coloca, para duas linhas não entrarem no mesmo sistema quando só
  // uma cabe.
  const ctsPorSistema = new Map<string, number>()
  for (const t of topo) {
    const sis = txt(t.sistema_id)
    if (sis && ehCts(dados, t)) ctsPorSistema.set(sis, (ctsPorSistema.get(sis) ?? 0) + 1)
  }

  let alteracoes = 0
  aba.linhas.forEach((origem, n) => {
    if (linhaVazia(origem) || !('sistema_id' in origem)) return
    const avisar = aviso(planilha, n + PRIMEIRA_LINHA_DE_DADO, avisos)
    const id = txt(daCelula('cts_id', origem.cts_id))
    const i = indiceCts.get(id)
    if (i === undefined) return // já avisada em `mesclarPorChave`
    if (semResultado(origem.sistema_id)) {
      avisar(`"${colunaLabel('sistema_id')}" tem uma fórmula sem resultado calculado — a CTS não foi colocada em sistema.`)
      return
    }
    const pedido = txt(daCelula('sistema_id', origem.sistema_id))
    const atual = txt(cts[i].sistema_id)
    if (pedido.toLowerCase() === atual.toLowerCase()) return
    if (atual && !pedido) {
      avisar(`"${id}" está no sistema ${atual} — tirar uma CTS do sistema é pela tela, no Fluxo de escoamento.`)
      return
    }
    if (atual) {
      avisar(`"${id}" já está no sistema ${atual} — mudar de sistema é pela tela, no Fluxo de escoamento.`)
      return
    }
    const sistema = resolver(pedido)
    if (sistema === 'ambiguo') {
      avisar(`"${pedido}" é o nome de mais de um sistema — use o id (aba "${SISTEMAS}").`)
      return
    }
    if (!sistema) {
      avisar(`o sistema "${pedido}" não é desta unidade — veja os ids na aba "${SISTEMAS}".`)
      return
    }
    const sis = txt(sistema.sistema_id)
    if (macro && (ctsPorSistema.get(sis) ?? 0) > 0) {
      avisar(`o sistema ${sistema.sistema_name || sis} já tem uma CTS, e a unidade usa macrorregião: cada sistema aceita uma só.`)
      return
    }
    const t = indiceTopo.get(id)
    if (t === undefined) {
      avisar(`"${id}" não está na topologia da unidade — a carga não a trouxe como componente; não dá para colocá-la num sistema.`)
      return
    }
    cts[i] = { ...cts[i], sistema_id: sis, sistema_name: txt(sistema.sistema_name) }
    topo[t] = { ...topo[t], sistema_id: sis, sistema_name: txt(sistema.sistema_name) }
    ctsPorSistema.set(sis, (ctsPorSistema.get(sis) ?? 0) + 1)
    alteracoes++
  })

  if (!alteracoes) return null
  return { dados: { 'cts-operacional': cts, 'sistema-topologia': topo }, alteracoes }
}

// ------------------------------------------------------------------ o Leia-me

/** O nome do arquivo: a unidade e o dia, sem espaço nem acento. */
export function nomeDoArquivo(unidade: Pick<UnidadeState, 'id'>, hoje = new Date()): string {
  const dia = hoje.toISOString().slice(0, 10)
  return `Cadastro_${unidade.id.replace(/[^\w-]/g, '_')}_${dia}.xlsx`
}

/**
 * As linhas do Leia-me — texto, uma frase por linha. A biblioteca só as
 * escreve; o conteúdo mora aqui para o teste conferir que o regime está dito.
 */
export function leiaMe(unidade: Pick<UnidadeState, 'id' | 'name' | 'regionalName'>, dados: Dados, hoje = new Date()): string[][] {
  const regime = regimeDeCts(dados)
  const planilhas = planilhasDoArquivo(dados)
  const fichasDeCts = dados['cts-operacional'] ?? []
  const semSistema = fichasDeCts.filter((c) => !txt(c.sistema_id)).length
  return [
    [`Cadastro do Otimizador CAPEX — ${unidade.name} (${unidade.id}) · ${unidade.regionalName}`],
    [`Gerada em ${hoje.toLocaleDateString('pt-BR')}, com os dados que a tela mostrava.`],
    [],
    [`Regime de CTS: ${regime.nome.toUpperCase()}`],
    [regime.regra],
    [`Fichas de CTS nesta planilha: ${fichasDeCts.length}${semSistema ? `, das quais ${semSistema} ainda sem sistema` : ''}.`],
    [],
    ['Como preencher'],
    ['1. Cada aba deste arquivo é uma aba do cadastro, já com as linhas de hoje. Não renomeie as abas nem mexa nas duas primeiras linhas.'],
    ['2. A linha 1 é o nome da coluna; a linha 2 é o código dela — é por ele que a importação reconhece a coluna.'],
    ['3. Colunas em âmbar são as que a unidade preenche. Colunas em cinza vêm do Databricks ou são calculadas: estão aqui para leitura, e o que for digitado nelas é ignorado.'],
    ['4. Os ids nunca mudam pela planilha. Linha com id que o cadastro não conhece é ignorada com aviso.'],
    ['5. Célula em branco significa "sem valor" — apagar um valor na planilha apaga na tela. Fórmula vale pelo resultado, e o arquivo precisa estar calculado ao salvar.'],
    ['6. Metas de cobertura e Escala de paridade são listas: a lista do arquivo substitui a da tela, então acrescente e apague linhas à vontade. Cidade sem registro vem com uma linha-modelo (só a cidade preenchida): preencha-a, copie-a para mais anos ou faixas, ou deixe-a em branco — em branco ela não vira registro.'],
    [`7. Dados da CTS: nas CTS com o sistema em branco, preencha "${colunaLabel('sistema_id')}" com o id (ou o nome) de um sistema da unidade — a aba "${SISTEMAS}" lista todos. Só entra: mudar de sistema ou sair dele é pela tela, e o caminho até a ETE (jusante) se desenha lá, no Fluxo de escoamento.`],
    ['8. No Fluxo de escoamento só o destino (jusante) se altera, e só de quem já está num sistema.'],
    ['9. A caixa "usa macrorregião de CTS" se decide na tela, não aqui: ela muda quais fichas de CTS existem. Planilha gerada num regime não serve para o outro — as abas de CTS ficam de fora.'],
    ['10. Importe pelo botão "Importar planilha preenchida", na aba Unidade, na mesma unidade em que a planilha foi gerada. Nada é gravado na importação: revise a grade e clique em Salvar.'],
    [],
    ['Aba', 'O que é', 'Linhas', 'Colunas que a unidade preenche'],
    ...planilhas.map((p) => [
      p.nome,
      p.aba.desc.split('. ')[0],
      String(p.linhas.length),
      [...colunasImportaveis(p.aba), ...(COLOCA_NO_SISTEMA[p.aba.key] ? [COLOCA_NO_SISTEMA[p.aba.key]] : [])]
        .map(colunaLabel)
        .join(', ') || '— (só leitura)',
    ]),
    [SISTEMAS, 'Os sistemas da unidade, para consultar o id ao colocar uma CTS', String(linhasDeSistemas(dados).length), '— (só leitura)'],
  ]
}
