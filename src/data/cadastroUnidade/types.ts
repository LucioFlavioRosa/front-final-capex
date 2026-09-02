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
 * tenha dito se é dado real ou invenção.
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
  /**
   * CAMPO QUE PODE FICAR VAZIO SEM O CADASTRO ESTAR INCOMPLETO.
   *
   * Existe porque a completude da tela contradizia a prontidão do servidor: ela
   * contava TODA coluna `un` como obrigatória e anunciava "89% · 4 abas
   * incompletas" para uma unidade que o backend dava como pronta, com zero
   * pendências. Os 4.004 campos que faltavam eram quatro colunas, e nenhuma
   * delas é exigida:
   *
   *   `wacc`               herda o WACC médio da unidade quando vazio — é o que
   *                        o próprio campo do WACC promete na tela.
   *   `..._jusante`        nó terminal (a ETE) não tem para onde drenar.
   *   `universo_populacao` só valem quando a RODADA mede cobertura POR
   *   `populacao_atual`    POPULAÇÃO; medindo por ligações, ficam vazios.
   *
   * O texto explica ao leitor por que aquele vazio é aceitável, e aparece no
   * lugar do "faltando" na Revisão.
   */
  opcional?: string
}

/**
 * DE ONDE SAI A CIDADE DE UMA LINHA — e por que isso é declaração, não código.
 *
 * A barra de escopo (cidade + sistema) recorta TODAS as abas, e nenhuma aba tem
 * as duas colunas: a de metas tem `cidade_id` e nenhum sistema; a de CAPEX da
 * CTS não tem nem um nem outro, só `cts_id`. Cada aba chega ao mesmo par por um
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
   * ABA QUE SAI DA TELA MAS FICA NO CADASTRO.
   *
   * Quase sempre a razão é não haver o que preencher (todas as colunas 'db' ou
   * 'calc'). Não é a única: `subbacia-cts` tem colunas editáveis e `addRow`, e
   * está oculta porque o backend não serve nem aceita a aba — ver `ABAS_SEM_ESCRITA`.
   *
   * ATENÇÃO ao segundo caso: aba oculta não tem porta de entrada nenhuma
   * (`irParaAba`/`BLOCOS` filtram aba oculta antes de montar destino), então
   * campo editável + aba oculta = dado inalcançável. Ao religar uma, tire a
   * flag E a trava de escrita na mesma passada.
   *
   * O DADO PRECISA FICAR por um motivo concreto: as abas ocultas são elos da
   * hierarquia que o motor lê —
   * `unidade_regional ▸ empresa ▸ cidade_empresa ▸ cidade ▸
   * cidade_sistema ▸ sistema_topologia`, todas com FK. Um elo quebrado não custa
   * uma tela: produz sub-bacia órfã, que desaparece do resultado sem erro.
   *
   * Então a aba oculta: sai de `BLOCOS` (navegação) e da contagem de completude
   * (um campo que ninguém pode preencher jamais fecharia em 100%), mas continua
   * no SCHEMA, no `seed` e em `validarCadastro`.
   */
  ocultaNoWizard?: boolean
  /*
   * NÃO EXISTE UM `semDados` — o inverso de `ocultaNoWizard`, para uma aba que
   * aparece na tela sem ter dado nenhum. Toda aba visível tem linhas próprias.
   *
   * Se alguma voltar a não ter, o cuidado é a completude: `contarAba` devolveria
   * `total: 0` e `progressoAba` traduziria isso como "OK · somente Databricks" —
   * uma aba dizendo que seus dados vêm do Databricks quando ela não tem dados.
   */
  cols: ColDef[]
  /** Permite adicionar/remover linhas (abas de metas/curvas, sem 1 linha fixa por entidade). */
  addRow?: boolean
  /** Fábrica de linha vazia — obrigatório quando addRow é true. */
  novo?: () => Row
  /**
   * Coluna usada só para alternar uma listra sutil de fundo a cada bloco de
   * linhas (ex.: as 5 linhas de componente de uma mesma sub-bacia). Puramente
   * visual — não agrupa nem esconde nada: a leitura da grade é de planilha,
   * tabela única, não acordeão mestre-detalhe. Assume que as linhas do bloco já
   * chegam consecutivas no array; se um import futuro as espalhar, a listra
   * some, mas os dados continuam corretos.
   */
  zebraPor?: string
  /**
   * A COLUNA QUE AGRUPA LINHAS QUE DEVERIAM TER O MESMO VALOR.
   *
   * Liga o botão "repetir nas linhas de…" da grade, para o caso em que um valor
   * é decidido num nível ACIMA da linha: uma empresa com sete cidades tem sete
   * células que precisam concordar, e nada além da atenção de quem digita
   * garante que concordem.
   *
   * Não muda o modelo: o motor continua lendo o ano por cidade, que é o que
   * permite uma cidade sair do contrato antes das irmãs. O que o botão faz é
   * poupar seis digitações e o erro que a sexta convida.
   *
   * Ausente = aba sem o botão, que é o caso de todas as outras: replicar preço
   * unitário entre sub-bacias é justamente o que NÃO se quer.
   */
  replicarPor?: string
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
