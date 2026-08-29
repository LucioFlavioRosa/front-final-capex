import { SCHEMA, UNIDADE_POR_COMPONENTE } from '../data/cadastroUnidade/schema'
import type { Row } from '../data/cadastroUnidade/types'
import { sistemaDaCts, tipoDoNo, type Dados } from './fluxo'
import { toNum } from './numero'

export function fmtBRL(n: number | null): string {
  if (n == null) return '—'
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}

/**
 * O motor RECALCULA estas três colunas ("derivado, não preencher", no
 * dicionário) e ignora o que estiver gravado no banco: `universo − atuais`
 * para ligações, economias e população. Deixá-las editáveis convidava a
 * "corrigir na mão" um valor que nunca seria lido.
 */
const NOVAS_OBRAS: Record<string, [string, string]> = {
  ligacoes_novas_obras: ['universo_ligacoes', 'ligacoes_atuais'],
  economias_novas_obras: ['universo_economias', 'economias_atuais'],
  populacao_novas_obras: ['universo_populacao', 'populacao_atual'],
}

/**
 * ANO-BASE — o ano 0 do cronograma, automático desde 05/08/2026.
 *
 * Era campo digitado, numa aba própria. A pergunta do Wagner ("por que isso é
 * variável?") e a resposta do Lúcio ("ele poderia só pegar o ano da data que o cara
 * está") aposentaram as duas coisas: o ano de uma análise é o ano em que ela é feita.
 *
 * Lido na hora da renderização, e não congelado numa constante de módulo: uma aba
 * aberta na virada do ano mostraria o ano velho até alguém recarregar a página.
 */
const anoCorrente = (): string => String(new Date().getFullYear())

/**
 * Contexto de uma célula derivada — a aba em que ela está e o cadastro inteiro.
 *
 * NASCEU COM O ITEM 21, e é a mudança estrutural que ele exigiu. Até 07/08/2026
 * `computeCalc(col, row)` só enxergava a LINHA ATUAL, e isso bastava para tudo
 * que havia: CAPEX é quantidade × preço da própria linha, capacidade ociosa é
 * nominal − operação da própria linha, a unidade de medida é o componente da
 * própria linha.
 *
 * O sistema da CTS não é assim. Ele mora em OUTRA ABA — a linha do Fluxo de
 * escoamento cuja origem é aquela CTS — e nenhuma quantidade de dados da linha
 * atual chega lá. Daí `dados`, que desce de `CadastroWizard` → `AbaGrid` →
 * `AbaCell` até aqui.
 *
 * `abaKey` vem junto porque `sistema_id`/`sistema_name` existem em CINCO abas, e
 * só na de CTS elas são derivadas. Sem saber a aba, uma célula de sistema da aba
 * Sub-bacias cairia na regra da CTS.
 *
 * Os dois são OPCIONAIS de propósito: as derivações antigas não precisam deles, e
 * exigi-los obrigaria a passar contexto em toda chamada só para calcular um CAPEX.
 */
export interface CtxCalc {
  abaKey?: string
  dados?: Dados
}

/** Calcula o valor de exibição de uma coluna 'calc' a partir da linha atual. */
export function computeCalc(col: string, row: Row, ctx: CtxCalc = {}): string {
  if (col === 'ano_base') return anoCorrente()

  /**
   * SISTEMA DA CTS (item 21) — derivado do destino dela no Fluxo de escoamento.
   *
   * O '—' aqui não é falha: é CTS que ainda não tem destino escolhido, e a
   * validação de topologia já a aponta pelo nome. Ver `sistemaDaCts`.
   */
  if (ctx.abaKey === 'cts-operacional' && (col === 'sistema_id' || col === 'sistema_name')) {
    if (!ctx.dados) return '—'
    const sistema = sistemaDaCts(ctx.dados, String(row.cts_id ?? ''))
    return (col === 'sistema_id' ? sistema.id : sistema.nome) || '—'
  }

  /**
   * O QUE O COMPONENTE É — sub-bacia, CTS ou ETE.
   *
   * Derivado da aba em que ele tem ficha, que é a única fonte que existe: não há
   * coluna de tipo em `input.sistema_topologia`, e não precisa haver. É a mesma
   * pergunta que `tipoDoNo` responde para o unifilar e para a validação de
   * topologia — aqui ela só ganha uma coluna na tela.
   *
   * Os rótulos são os que a tela mostra, e 'cts' é o que a lógica compara (ver
   * `AdicionarCts`): quem decide não lê esta string, chama `tipoDoNo`.
   */
  if (col === 'componente_tipo') {
    if (!ctx.dados) return '—'
    const tipo = tipoDoNo(ctx.dados, String(row.componente_sistema_id ?? ''))
    return { subbacia: 'sub-bacia', cts: 'CTS', ete: 'ETE', desconhecido: '—' }[tipo]
  }

  /**
   * A unidade de medida não é "calculada" no sentido de conta: ela é LIDA da
   * tabela de padrões a partir do componente da linha. Cai aqui porque o efeito
   * é o mesmo que o das outras — valor derivado de outra célula, célula travada
   * — e assim o grid, o colar e a contagem de progresso já a tratam certo, sem
   * um quarto caminho especial. Ver `UNIDADE_POR_COMPONENTE`.
   */
  if (col === 'unidade') return UNIDADE_POR_COMPONENTE[row.componente ?? ''] ?? '—'
  if (col === 'capex') {
    const q = toNum(row.quantidade)
    const p = toNum(row.preco_unitario)
    return q != null && p != null ? fmtBRL(q * p) : '—'
  }
  if (col === 'capacidade_ociosa') {
    const cn = toNum(row.capacidade_nominal_atual)
    const vo = toNum(row.vazao_de_operacao_atual)
    return cn != null && vo != null ? String(cn - vo) : '—'
  }
  if (col in NOVAS_OBRAS) {
    const [universoCol, atuaisCol] = NOVAS_OBRAS[col]
    const universo = toNum(row[universoCol])
    const atuais = toNum(row[atuaisCol])
    if (universo == null || atuais == null) return '—'
    return Math.max(0, universo - atuais).toLocaleString('pt-BR')
  }
  return '—'
}

/**
 * FAIXA DE COBERTURA 0 automática na escala de paridade (item 30, 05/08/2026).
 *
 * A regra que o cliente ditou: *"caso a cidade só tenha uma paridade, criar uma faixa
 * de cobertura zero"*. O motivo é que a faixa vale A PARTIR da cobertura informada —
 * uma cidade cuja única faixa começa em 40% fica sem paridade nenhuma enquanto a
 * cobertura estiver abaixo disso, e a receita de esgoto dela sai zerada nos primeiros
 * anos do plano. Faixa 0 = paridade constante, que é o que se quer dizer com "a
 * cidade tem uma paridade".
 *
 * Três decisões de comportamento, e cada uma evita um estrago:
 *
 *   ACRESCENTA, não reescreve. Mudar a cobertura da faixa existente de 40 para 0
 *     seria mais enxuto e apagaria um número que a unidade digitou de propósito.
 *   SÓ com UMA faixa. Com duas ou mais, a escala é intencional e a primeira faixa
 *     pode começar acima de zero por decisão de negócio — não é lugar de adivinhar.
 *   IDEMPOTENTE. Cidade que já tem faixa 0 não recebe outra: `(cidade_id,
 *     cobertura_pct)` é chave primária, e duplicata é problema CRÍTICO na validação
 *     (a faixa duplicada sobrescreve a anterior em silêncio).
 *
 * Roda ao ENTRAR na aba, não a cada tecla: aplicada durante a digitação, a linha nova
 * apareceria no instante em que a pessoa terminasse de escrever a primeira cobertura
 * — e ela ainda pode estar a caminho de cadastrar a segunda faixa.
 */
export function garantirFaixaZero(rows: Row[]): Row[] {
  const porCidade = new Map<string, Row[]>()
  rows.forEach((r) => {
    const cidade = String(r.cidade_id ?? '').trim()
    if (!cidade) return
    porCidade.set(cidade, [...(porCidade.get(cidade) ?? []), r])
  })

  const novas: Row[] = []
  porCidade.forEach((faixas) => {
    if (faixas.length !== 1) return
    const unica = faixas[0]
    // paridade em branco = a linha ainda está sendo preenchida; nada a propagar
    if (String(unica.paridade ?? '').trim() === '') return
    if (toNum(unica.cobertura_pct) === 0) return
    novas.push({ ...unica, cobertura_pct: '0' })
  })

  return novas.length ? [...rows, ...novas] : rows
}

/** Conta quantos campos de origem "un" estão preenchidos numa aba, dado o estado de dados. */
export function contarAba(abaKey: string, rows: Row[]): { feitos: number; total: number } {
  const aba = SCHEMA.find((s) => s.key === abaKey)
  if (!aba) return { feitos: 0, total: 0 }
  const uncols = aba.cols.filter((c) => c.origem === 'un').map((c) => c.coluna)
  let feitos = 0
  let total = 0
  rows.forEach((row) => {
    uncols.forEach((c) => {
      total++
      const v = row[c]
      if (v !== '' && v != null) feitos++
    })
  })
  return { feitos, total }
}

/**
 * Completude geral — sobre as abas VISÍVEIS, não sobre o SCHEMA inteiro.
 *
 * Desde 05/08/2026 quatro abas saíram da tela mas continuam no cadastro
 * (`ocultaNoWizard`). Somar os campos delas aqui contaria trabalho que ninguém tem
 * como fazer: a aba não aparece, o campo não é alcançável, e o percentual nunca
 * fecharia — com a Revisão bloqueando a rodada para sempre.
 *
 * Hoje as quatro não têm nenhuma coluna 'un' (a última, `ano_base`, virou 'calc' no
 * mesmo pedido), então o filtro não muda nenhum número. Ele existe para o dia em que
 * uma aba com campo de unidade for ocultada — aí a diferença é entre "98%" e um
 * cadastro que não fecha.
 */
export function totalGeral(data: Record<string, Row[]>): { feitos: number; total: number; pct: number } {
  let feitos = 0
  let total = 0
  SCHEMA.filter((aba) => !aba.ocultaNoWizard).forEach((aba) => {
    const c = contarAba(aba.key, data[aba.key] ?? [])
    feitos += c.feitos
    total += c.total
  })
  return { feitos, total, pct: total ? Math.round((feitos / total) * 100) : 100 }
}
