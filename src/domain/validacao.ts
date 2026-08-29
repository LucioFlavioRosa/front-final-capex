/**
 * Validações do cadastro.
 *
 * O critério para algo entrar aqui não é "seria bom checar" — é **o dano ser
 * silencioso**. Um campo faltando aparece na completude e alguém preenche. Já
 * uma PK duplicada ou uma FK quebrada produzem um plano errado que passa em
 * todas as reconciliações do portão de qualidade, porque o resultado é
 * internamente coerente com um cadastro que de fato tem duas obras (ou uma
 * sub-bacia a menos). Ninguém descobre olhando o resultado.
 *
 * Referência: docs/02-integracao-backend.md §2.2, "Três armadilhas do cadastro".
 */

import type { Row } from '../data/cadastroUnidade/types'
import { toNum } from './numero'
import { caminhoAteEte, sistemaDoNo, tipoDoNo } from './fluxo'

export type NivelProblema = 'critico' | 'aviso'

export interface Problema {
  nivel: NivelProblema
  /** Aba onde o problema está — para o link "ir até lá". */
  abaKey: string
  titulo: string
  detalhe: string
  /** Quantas linhas/itens estão envolvidos. */
  ocorrencias: number
}

type Dados = Record<string, Row[]>

const naoVazio = (v: string | undefined) => v != null && String(v).trim() !== ''

/** Duplicatas de uma chave composta, ignorando linhas com a chave incompleta. */
function duplicatas(rows: Row[], cols: string[]): string[] {
  const vistos = new Map<string, number>()
  for (const r of rows) {
    if (!cols.every((c) => naoVazio(r[c]))) continue
    const k = cols.map((c) => String(r[c]).trim()).join(' · ')
    vistos.set(k, (vistos.get(k) ?? 0) + 1)
  }
  return [...vistos.entries()].filter(([, n]) => n > 1).map(([k]) => k)
}

const listar = (xs: string[], max = 4) =>
  xs.slice(0, max).join(', ') + (xs.length > max ? ` e mais ${xs.length - max}` : '')

/**
 * TOPOLOGIA DO FLUXO DE ESCOAMENTO — item 23 do pedido de 05/08/2026.
 *
 * O pedido é do Wagner (13:51): *"lembra que a gente tinha até um botãozinho de
 * validação de topologia do fluxo de escoamento? Porque se passarem nós aqui… que vira uma
 * folha"* — e ele mesmo definiu o termo (14:13): *"folha é quando não tem um nó no
 * gráfico que não é conectado em nada"*. Lúcio confirmou que a checagem já existe
 * do outro lado (14:28): *"eu fiz lá no otimizador — lá tem alguns testes que
 * olham exatamente isso, se a topologia do sistema está atrelada corretamente,
 * desde o início até a ETE."*
 *
 * O QUE ESTA FUNÇÃO ANTECIPA, e por que ela é a validação mais necessária das que
 * existem aqui: a caminhada do motor (`otimizador_capex_v62.py:120`) para de duas
 * formas — o nó atual não existe no grafo, ou o contador de segurança chega a 200
 * — e nas duas ela simplesmente RETORNA. Sem exceção, sem log, sem nada. A
 * sub-bacia cujo caminho não chegou na ETE nunca fatura, e o plano sai menor sem
 * que uma linha de erro apareça em lugar nenhum. É o dano silencioso que é o
 * critério de tudo o que entra neste arquivo.
 *
 * ONDE ISSO APARECE, e a decisão que precisou de arbitragem: a lista de 30/07
 * TIROU os painéis de problema das telas de cadastro e os concentrou na Revisão,
 * porque "um problema aqui nunca é local" — e o pedido do item 23 diz "na tela de
 * cadastro". As duas coisas convivem porque a topologia é a exceção que confirma
 * a regra de 30/07: ela É local. O erro está na própria aba, a correção também, e
 * a lista de problemas cabe ao lado da tabela que os produz. Então: painel enxuto
 * na aba do Fluxo, só com estas regras, e a Revisão seguindo como o portão que
 * bloqueia a rodada — sem ressuscitar o painel geral em todas as abas.
 *
 * AS CINCO REGRAS. As quatro do item 23, mais a de destino inexistente, que já
 * existia solta em `validarCadastro` e é da mesma família.
 */
export function validarTopologia(dados: Dados): Problema[] {
  const p: Problema[] = []
  const fluxo = (dados['sistema-topologia'] ?? []).filter((r) => naoVazio(r.componente_sistema_id))
  // Mesmo objeto, nome diferente só para deixar claro nas chamadas abaixo que ele
  // está sendo lido como grafo, e não como tabela.
  const dadosFluxo = dados
  const id = (r: Row, c: string) => String(r[c] ?? '').trim()

  /**
   * (1) ORIGEM SEM DESTINO — a "folha" do Wagner. A cadeia não fecha e a
   *     sub-bacia (ou CTS) não entra em nenhum caminho até a ETE.
   *
   * A ETE É EXCLUÍDA, e não por elegância: ela É o fim do caminho, e uma linha de
   * fluxo cuja origem é a própria ETE não tem destino por definição. Isso não é
   * hipótese — o banco de dados regional (a planilha do otimizador) traz, para
   * cada um dos 997 sistemas, uma linha `sistema | ete | ete | (vazio)`. Sem esta
   * exclusão, todo cadastro carregado de lá abre acusando uma "origem que não
   * chega à ETE" por sistema, sendo que a origem acusada é a ETE.
   */
  const semDestino = fluxo
    .filter((r) => !naoVazio(r.componente_sistema_id_jusante))
    .map((r) => id(r, 'componente_sistema_id'))
    .filter((v) => tipoDoNo(dadosFluxo, v) !== 'ete')
  if (semDestino.length) {
    p.push({
      nivel: 'critico',
      abaKey: 'sistema-topologia',
      titulo: 'Origem sem destino no fluxo',
      detalhe: `${listar(semDestino)} não tem para onde escoar. Sem destino a cadeia não chega à ETE, e o motor não acusa erro: ele simplesmente para de caminhar e a origem nunca fatura.`,
      ocorrencias: semDestino.length,
    })
  }

  // (2) DESTINO INEXISTENTE — aponta para um código que não é nó nem ETE.
  const destinoInexistente = [...new Set(
    fluxo
      .map((r) => id(r, 'componente_sistema_id_jusante'))
      .filter((v) => v && tipoDoNo(dadosFluxo, v) === 'desconhecido'),
  )]
  if (destinoInexistente.length) {
    p.push({
      nivel: 'critico',
      abaKey: 'sistema-topologia',
      titulo: 'Destino que não existe no cadastro',
      detalhe: `${listar(destinoInexistente)} aparece como destino mas não é sub-bacia, nem CTS, nem ETE deste cadastro. A cadeia não fecha, e tudo o que estiver a montante nunca fatura.`,
      ocorrencias: destinoInexistente.length,
    })
  }

  /**
   * (3) CADEIA QUE NÃO TERMINA EM ETE — o ciclo.
   *
   * Duas sub-bacias apontando uma para a outra formam um cadastro que parece
   * perfeito: os dois destinos existem, nenhum campo está vazio, nenhuma
   * duplicata. O motor caminha 200 vezes e desiste. É o caso que nenhuma das
   * outras regras apanha, e é o que o `g<200` do otimizador esconde.
   */
  const emCiclo = fluxo
    .filter((r) => naoVazio(r.componente_sistema_id_jusante))
    .filter((r) => caminhoAteEte(dadosFluxo, id(r, 'componente_sistema_id')) === 'ciclo')
    .map((r) => id(r, 'componente_sistema_id'))
  if (emCiclo.length) {
    p.push({
      nivel: 'critico',
      abaKey: 'sistema-topologia',
      titulo: 'Cadeia que nunca chega à ETE',
      detalhe: `Saindo de ${listar(emCiclo)} o caminho volta sobre si mesmo em vez de terminar numa ETE. O motor desiste depois de 200 saltos, sem erro, e essas origens somem do plano.`,
      ocorrencias: emCiclo.length,
    })
  }

  /**
   * (4) SUB-BACIA QUE NÃO É ORIGEM DE NENHUMA LINHA — o nó isolado.
   *
   * ESCOPADA AOS SISTEMAS QUE O FLUXO MODELA, e sem isso a regra seria inútil ao
   * ponto de atrapalhar: `subbacia-operacional` traz as 1.047 sub-bacias da base
   * (o CSV não tem recorte por unidade) e o fluxo traz as 19 de um sistema-amostra.
   * Literal, a validação abriria com 1.028 problemas — e uma lista assim não é
   * lida, é fechada.
   *
   * Escopada, ela responde a pergunta que importa: dentro dos sistemas que este
   * cadastro descreve, sobrou alguma sub-bacia de fora da cadeia? Ela só fica
   * plenamente útil quando o Databricks trouxer o recorte por unidade — até lá o
   * escopo é o sistema-amostra, e é honesto que seja.
   */
  const origens = new Set(fluxo.map((r) => id(r, 'componente_sistema_id')))
  const sistemasDoFluxo = new Set(
    [...origens]
      .filter((v) => tipoDoNo(dadosFluxo, v) === 'subbacia')
      .map((v) => sistemaDoNo(dadosFluxo, v).id)
      .filter(Boolean),
  )
  const isoladas = (dados['subbacia-operacional'] ?? [])
    .map((r) => id(r, 'sub_bacia_id'))
    .filter((v) => v && !origens.has(v) && sistemasDoFluxo.has(sistemaDoNo(dadosFluxo, v).id))
  if (isoladas.length) {
    p.push({
      nivel: 'aviso',
      abaKey: 'sistema-topologia',
      titulo: 'Sub-bacia fora do fluxo',
      detalhe: `${listar(isoladas)} existe${isoladas.length === 1 ? '' : 'm'} no cadastro de sub-bacias e não aparece${isoladas.length === 1 ? '' : 'm'} como origem em nenhuma linha do fluxo. Nó isolado não pertence a nenhuma cadeia até a ETE — a obra dele entra no CAPEX e a receita nunca vem. (A conferência cobre só os sistemas que este fluxo descreve.)`,
      ocorrencias: isoladas.length,
    })
  }

  // (5) ETE SEM NADA DESAGUANDO NELA — estação dimensionada para uma vazão que
  //     não chega. Aviso, e não crítico: pode ser ETE cadastrada antes do fluxo.
  const destinos = new Set(fluxo.map((r) => id(r, 'componente_sistema_id_jusante')).filter(Boolean))
  const etesVazias = (dados['ete-capex'] ?? [])
    .map((r) => id(r, 'ete_id'))
    .filter((v) => v && !destinos.has(v))
  if (etesVazias.length) {
    p.push({
      nivel: 'aviso',
      abaKey: 'sistema-topologia',
      titulo: 'ETE sem nada desaguando nela',
      detalhe: `${listar(etesVazias)} não é destino de nenhuma linha do fluxo. A estação entra no plano com CAPEX e módulos, e nenhuma vazão para tratar.`,
      ocorrencias: etesVazias.length,
    })
  }

  return p
}

export function validarCadastro(dados: Dados): Problema[] {
  const p: Problema[] = []
  const linhas = (k: string) => dados[k] ?? []

  // ---------------------------------------------------------- (a) duplicatas
  const pks: { aba: string; cols: string[]; nome: string; porque: string }[] = [
    {
      aba: 'componentes-subbacias-capex', cols: ['sub_bacia_id', 'componente'],
      nome: 'sub-bacia + componente',
      porque: 'a obra é contada DUAS VEZES e o CAPEX dobra — e isso passa em todas as reconciliações, porque o resultado fica coerente com um cadastro que de fato tem duas obras.',
    },
    {
      aba: 'subbacia-operacional', cols: ['sub_bacia_id'],
      nome: 'sub-bacia',
      porque: 'a última linha vence e uma sub-bacia inteira desaparece do plano, sem erro.',
    },
    {
      aba: 'sistema-topologia', cols: ['componente_sistema_id'],
      nome: 'id de componente',
      porque: 'o motor indexa os nós por id GLOBAL: um id repetido faz ele manter só o último e perder um nó inteiro em silêncio.',
    },
    { aba: 'metas-cobertura', cols: ['cidade_id', 'ano'], nome: 'cidade + ano', porque: 'a meta duplicada sobrescreve a anterior.' },
    { aba: 'fator-esgoto', cols: ['cidade_id', 'cobertura_pct'], nome: 'cidade + faixa', porque: 'a faixa de paridade duplicada sobrescreve a anterior.' },
    { aba: 'ete-capex', cols: ['ete_id'], nome: 'ETE', porque: 'a última linha vence e uma ETE some do plano.' },
    {
      aba: 'componentes-cts-capex', cols: ['cts_id', 'componente'],
      nome: 'CTS + componente',
      porque: 'mesmo problema da sub-bacia: a obra é contada duas vezes e o CAPEX dobra.',
    },
    { aba: 'cts-operacional', cols: ['cts_id'], nome: 'CTS', porque: 'a última linha vence e um CTS inteiro desaparece do plano.' },
  ]

  for (const { aba, cols, nome, porque } of pks) {
    const dups = duplicatas(linhas(aba), cols)
    if (dups.length) {
      p.push({
        nivel: 'critico',
        abaKey: aba,
        titulo: `Duplicata em ${nome}`,
        detalhe: `${listar(dups)} aparece${dups.length === 1 ? '' : 'm'} mais de uma vez. Consequência: ${porque}`,
        ocorrencias: dups.length,
      })
    }
  }

  // ------------------------------------------------- (b) hierarquia quebrada
  const ids = (aba: string, col: string) =>
    new Set(linhas(aba).map((r) => String(r[col] ?? '').trim()).filter(Boolean))

  const elos: { aba: string; col: string; alvoAba: string; alvoCol: string; rotulo: string }[] = [
    { aba: 'regional-superintendencia', col: 'unidade_id', alvoAba: 'unidade-regional', alvoCol: 'unidade_id', rotulo: 'unidade' },
    { aba: 'superintendencia-cidade', col: 'superintendencia_id', alvoAba: 'regional-superintendencia', alvoCol: 'superintendencia_id', rotulo: 'superintendência' },
    { aba: 'cidade-sistema', col: 'cidade_id', alvoAba: 'superintendencia-cidade', alvoCol: 'cidade_id', rotulo: 'cidade' },
    { aba: 'sistema-topologia', col: 'sistema_id', alvoAba: 'cidade-sistema', alvoCol: 'sistema_id', rotulo: 'sistema' },
    { aba: 'cidade-operacional', col: 'cidade_id', alvoAba: 'superintendencia-cidade', alvoCol: 'cidade_id', rotulo: 'cidade' },
    { aba: 'componentes-subbacias-capex', col: 'sub_bacia_id', alvoAba: 'subbacia-operacional', alvoCol: 'sub_bacia_id', rotulo: 'sub-bacia' },
    { aba: 'subbacia-cts', col: 'sub_bacia_id', alvoAba: 'subbacia-operacional', alvoCol: 'sub_bacia_id', rotulo: 'sub-bacia' },
    { aba: 'subbacia-cts', col: 'cts_id', alvoAba: 'cts-operacional', alvoCol: 'cts_id', rotulo: 'CTS' },
    { aba: 'componentes-cts-capex', col: 'cts_id', alvoAba: 'cts-operacional', alvoCol: 'cts_id', rotulo: 'CTS' },
  ]

  for (const e of elos) {
    const validos = ids(e.alvoAba, e.alvoCol)
    const orfas = [...new Set(
      linhas(e.aba)
        .map((r) => String(r[e.col] ?? '').trim())
        .filter((v) => v && !validos.has(v)),
    )]
    if (orfas.length) {
      p.push({
        nivel: 'critico',
        abaKey: e.aba,
        titulo: `Referência de ${e.rotulo} inexistente`,
        detalhe: `${listar(orfas)} não existe${orfas.length === 1 ? '' : 'm'} no cadastro de ${e.rotulo}. Um elo quebrado na hierarquia produz sub-bacia órfã, que some do resultado sem erro.`,
        ocorrencias: orfas.length,
      })
    }
  }

  // O antigo bloco "jusante apontando para nó que não existe" mudou de casa: virou
  // uma das cinco regras de `validarTopologia`, junto das quatro que o item 23
  // pediu. Elas aparecem aqui (a Revisão continua sendo o portão que bloqueia a
  // rodada) E na própria aba do Fluxo, que é onde se corrige.
  p.push(...validarTopologia(dados))

  // ------------------------------------------------------ (c) o que impede rodar
  const cidadesSemFimConcessao = linhas('cidade-operacional')
    .filter((r) => !naoVazio(r.data_fim_concessao))
    .map((r) => String(r.cidade_id ?? '?'))
  if (cidadesSemFimConcessao.length) {
    p.push({
      nivel: 'aviso',
      abaKey: 'cidade-operacional',
      titulo: 'Cidade sem fim de concessão',
      detalhe: `${listar(cidadesSemFimConcessao)} está sem o ano de fim da concessão, que define o horizonte do sistema.`,
      ocorrencias: cidadesSemFimConcessao.length,
    })
  }

  const cidadesComParidade = ids('fator-esgoto', 'cidade_id')
  const cidadesSemParidade = [...ids('superintendencia-cidade', 'cidade_id')].filter(
    (c) => !cidadesComParidade.has(c),
  )
  if (cidadesSemParidade.length) {
    p.push({
      nivel: 'aviso',
      abaKey: 'fator-esgoto',
      titulo: 'Cidade sem faixa de paridade',
      // A faixa 0 automática (item 30) só cobre cidade que JÁ tem uma paridade
      // cadastrada — cidade sem nenhuma linha continua sendo trabalho de
      // preenchimento, e é o que este aviso aponta.
      detalhe: `${listar(cidadesSemParidade)} não tem nenhuma faixa em Escala de paridade. Basta cadastrar uma: a faixa de cobertura 0, que vale como paridade constante, é criada automaticamente.`,
      ocorrencias: cidadesSemParidade.length,
    })
  }

  const semWacc = !linhas('unidade-regional').some((r) => naoVazio(r.wacc_medio))
  const obrasSemWacc = linhas('componentes-subbacias-capex').filter((r) => !naoVazio(r.wacc)).length
  if (semWacc && obrasSemWacc > 0) {
    p.push({
      nivel: 'aviso',
      abaKey: 'unidade-regional',
      titulo: 'WACC ausente em obras, sem WACC médio para herdar',
      detalhe: `${obrasSemWacc} obra(s) estão sem WACC próprio e a unidade não tem WACC médio definido. Sem os dois, o elemento fica com custo de capital indefinido.`,
      ocorrencias: obrasSemWacc,
    })
  }

  /**
   * CAPEX 0 com prazo > 0 é obra de TERCEIROS — intencional e válido. Entra no
   * cronograma e libera a cadeia sem consumir orçamento. Nunca deve virar erro;
   * só é sinalizado para o usuário confirmar que a leitura é essa mesmo.
   */
  const terceiros = linhas('componentes-subbacias-capex').filter((r) => {
    // CAPEX é DERIVADO (quantidade × preço) — testar "quantidade vazia" deixaria
    // passar a linha com quantidade 0 e preço preenchido, que é justamente o
    // caso mais comum de obra de terceiros no cadastro
    const q = toNum(r.quantidade)
    const pu = toNum(r.preco_unitario)
    const prazo = toNum(r.tempo_execucao)
    if (q == null || pu == null || prazo == null) return false
    return q * pu === 0 && prazo > 0
  }).length
  if (terceiros > 0) {
    p.push({
      nivel: 'aviso',
      abaKey: 'componentes-subbacias-capex',
      titulo: `${terceiros} obra(s) lidas como de terceiros`,
      detalhe: 'Sem CAPEX mas com prazo de execução: o motor entende obra de terceiros — ela entra no cronograma e libera a cadeia, sem consumir orçamento. Confirme se é essa a intenção.',
      ocorrencias: terceiros,
    })
  }

  return p.sort((a, b) => (a.nivel === b.nivel ? 0 : a.nivel === 'critico' ? -1 : 1))
}
