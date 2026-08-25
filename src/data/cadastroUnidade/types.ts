import type { Icon } from '@phosphor-icons/react'

/** Origem de uma coluna: vem pronta do Databricks, é preenchida pela unidade, ou é calculada. */
export type Origem = 'db' | 'un' | 'calc'

/**
 * PROCEDÊNCIA — de onde vem o que está na tela AGORA.
 *
 * Não confundir com `Origem`, que diz de onde o dado DEVERIA vir quando o
 * sistema estiver integrado. As duas são independentes, e é justamente o
 * cruzamento que interessa: uma coluna pode ser 'db' (deveria vir do Databricks)
 * e ao mesmo tempo 'mock' (hoje é exemplo inventado) ou 'vazio' (a integração
 * ainda não existe).
 *
 * Os três primeiros valores são os CSVs que a Aegea enviou — dado real:
 *   'subbacias' → SUB_BACIAS_DADOS_COMERCIAIS.csv    (1.047 sub-bacias)
 *   'cts'       → CTS_DADOS_COMERCIAIS.csv           (304 CTS, por EMP_CODIGO)
 *   'depara'    → DEPARA_REGIONAL_EMP_CODIGO_EMPRSA_CIDADE.csv (5 regionais,
 *                 53 empresas, 725 cidades)
 *
 * E os três restantes:
 *   'mock'  → valor inventado, exemplo. NÃO usar para decidir nada.
 *   'vazio' → sem valor e sem fonte: a integração não existe, ou é campo que a
 *             unidade preenche e ainda está em branco.
 *   'misto' → a coluna tem linhas reais E linhas de exemplo ao mesmo tempo.
 *   'regra' → nem fonte nem invenção: convenção acordada com a Aegea, fixa no
 *             código (ex.: a unidade de medida de cada componente de obra). É
 *             valor CONFIÁVEL, e por isso não podia ficar como 'mock' — mas
 *             muda por decisão de negócio, não por carga de dado, e por isso
 *             também não é 'db'.
 */
export type Procedencia = 'subbacias' | 'cts' | 'depara' | 'mock' | 'vazio' | 'misto' | 'regra'

/**
 * [nome da coluna, origem, procedência].
 *
 * A procedência é OBRIGATÓRIA de propósito: assim o compilador cobra a
 * classificação de toda coluna nova, e nenhuma entra na tela sem que alguém
 * tenha dito se é dado real ou invenção. Era o pedido da Aegea de 30/07/2026 —
 * "precisamos de um tracking melhor do que é informação mockada e o que é dado
 * real".
 */
export interface ColDef {
  coluna: string
  origem: Origem
  procedencia: Procedencia
  /** O que é o campo (explicação). */
  oque?: string
  /** Por que o campo é necessário e qual seu impacto. */
  porque?: string
  /** Exemplo de valor. */
  exemplo?: string
}

/**
 * DE ONDE SAI A CIDADE DE UMA LINHA — e por que isso é declaração, não código.
 *
 * A barra de escopo (cidade + sistema) nasceu dentro da aba de representação e
 * virou controle de TODAS as abas em 20/08/2026. O problema é que nenhuma aba tem
 * as duas colunas: a de metas tem `cidade_id` e nenhum sistema; a de CAPEX da CTS
 * não tem nem um nem outro, só `cts_id`. Cada aba chega ao mesmo par por um
 * caminho diferente.
 *
 * Declarar o caminho aqui, e não num `if` por aba dentro do componente, é o que
 * mantém "qual seleção interessa nesta aba" numa tela só de leitura — a mesma
 * razão de o `bloco` do stepper morar no SCHEMA.
 *
 *   'coluna'  — a própria linha traz o vínculo (`cidade_id`, `sistema_id`, ou o
 *               `sistema_name` quando o id vem vazio da fonte, que é o caso das
 *               1.047 linhas de Sub-bacias).
 *   'via-sistema' — resolve o sistema da linha primeiro e pergunta a
 *               `cidade-sistema` quais cidades ele atende. É indireto porque o
 *               vínculo cidade↔sistema é de cadastro, não de linha.
 */
export type FonteCidade = 'coluna' | 'via-sistema'

/**
 * DE ONDE SAI O SISTEMA DE UMA LINHA. Ver `FonteCidade` para o porquê da
 * declaração.
 *
 *   'coluna'       — `sistema_id`, ou `sistema_name` quando o id vem vazio.
 *   'fluxo'        — a aba do Fluxo de escoamento: `sistema_id` na linha de
 *                    sub-bacia, e o sistema DERIVADO do destino na linha de CTS
 *                    (o sistema de uma CTS é o do destino dela — item 21).
 *   'via-subbacia' — `sub_bacia_id` → sistema, pelo Fluxo ou pelo CAPEX.
 *   'via-cts'      — `cts_id` → sistema, por `cts-operacional`.
 */
export type FonteSistema = 'coluna' | 'fluxo' | 'via-subbacia' | 'via-cts'

/**
 * Os eixos pelos quais esta aba se deixa recortar. Eixo ausente = a barra não
 * oferece aquele controle nesta aba.
 */
export interface EscopoAba {
  cidade?: FonteCidade
  sistema?: FonteSistema
}

export interface AbaDef {
  key: string
  icone: Icon
  titulo: string
  desc: string
  /** Rótulo do bloco/seção exibido no stepper acima desta aba (só na primeira aba de cada bloco). */
  bloco?: string
  /**
   * ABA QUE SAI DA TELA MAS FICA NO CADASTRO (05/08/2026).
   *
   * Quatro abas foram tiradas da navegação por pedido da Aegea — Ano-base,
   * Superintendências, Sistemas de esgoto e Cidades atendidas. O pedido é sobre a
   * TELA, não sobre o dado: "talvez a gente não precise mostrar ela, mas ela
   * precisa estar, para questão de organização dos dados" (Lúcio, 04/08).
   *
   * E o dado precisa ficar por um motivo concreto: as quatro são elos da
   * hierarquia que o motor lê —
   * `unidade_regional ▸ regional_superintendencia ▸ superintendencia_cidade ▸
   * cidade_sistema ▸ sistema_topologia`, todas com FK. Um elo quebrado não custa
   * uma tela: produz sub-bacia órfã, que desaparece do resultado sem erro.
   *
   * Então a aba oculta: sai de `BLOCOS` (navegação) e da contagem de completude
   * (um campo que ninguém pode preencher jamais fecharia em 100%), mas continua
   * no SCHEMA, no `seed` e em `validarCadastro`.
   */
  ocultaNoWizard?: boolean
  /*
   * `semDados` FOI DAQUI, e saiu em 20/08/2026 junto da única aba que a usava.
   *
   * Ela marcava "aparece na tela e não tem dado nenhum" — o inverso exato de
   * `ocultaNoWizard` — e existia só para a aba de representação (item 34), que
   * desenhava o que as outras cadastravam sem guardar linha própria. A marca a
   * tirava de `ABAS_VISIVEIS` e de `progressoPorBloco`, porque `contarAba`
   * devolvia `total: 0` e `progressoAba` traduzia isso como "OK · somente
   * Databricks" — uma aba dizendo que seus dados vinham do Databricks quando ela
   * não tinha dados.
   *
   * Com a fusão do desenho na aba do Fluxo, ela ficou sem dono. O campo saiu em
   * vez de ficar: numa base em que cada `AbaDef` é lida para saber o que a tela
   * faz, uma opção que nenhuma aba usa é convite a usá-la errado.
   */
  cols: ColDef[]
  /** Permite adicionar/remover linhas (abas de metas/curvas, sem 1 linha fixa por entidade). */
  addRow?: boolean
  /** Fábrica de linha vazia — obrigatório quando addRow é true. */
  novo?: () => Row
  /**
   * Coluna usada só para alternar uma listra sutil de fundo a cada bloco de
   * linhas (ex.: as 5 linhas de componente de uma mesma sub-bacia). Puramente
   * visual — não agrupa nem esconde nada, ao contrário do antigo layout
   * mestre-detalhe (removido no item 6 da sessão de 30/07/2026: a Aegea pediu
   * tabela única estilo Excel, não acordeão). Assume que as linhas do bloco já
   * chegam consecutivas no array; se um import futuro as espalhar, a listra
   * some, mas os dados continuam corretos.
   */
  zebraPor?: string
  /**
   * OS EIXOS DA BARRA DE ESCOPO nesta aba — ver `EscopoAba`.
   *
   * Ausente = aba sem barra. É o caso de `unidade-regional` (uma linha só) e das
   * quatro abas ocultas: filtro numa aba de uma linha é ruído puro, pela mesma
   * razão que `MIN_LINHAS_PARA_FILTRO` existe para o funil de coluna.
   */
  escopo?: EscopoAba
}

/** Uma linha de dados: todas as colunas guardadas como texto (fidelidade ao protótipo). */
export type Row = Record<string, string>

export interface Cidade {
  id: string
  name: string
}

export interface UnidadeState {
  id: string
  name: string
  regionalName: string
  /**
   * Cidades REAIS da unidade (de-para regional·empresa·cidade). Vive aqui, e não
   * numa constante global, porque cada unidade tem a sua lista — é o que
   * alimenta o select de cidade das abas de metas e paridade.
   */
  cidades: Cidade[]
  data: Record<string, Row[]>
}

export interface UnidadeOption {
  id: string
  nome: string
}
