/**
 * O QUE CADA `PUT` DO CADASTRO GRAVA, coluna por coluna e aba por aba.
 *
 * Nasceu de um pedido do dono do produto em 01/10/2026: *"é para permitir atualizar
 * todas as colunas"* pela planilha, e não só as que a Regional digita.
 *
 * A REGRA ANTERIOR ERA UM PALPITE. A planilha decidia o que aceitar de volta por
 * `origem === 'un'` — "a unidade preenche esta coluna" —, que é uma informação de
 * APRESENTAÇÃO: ela diz de onde o valor veio, não se o servidor o grava. Medido no
 * código do serviço: `_gravar_coleta` escreve `{...bloco_db, ...params}`, ou seja as
 * medidas da base comercial SÃO graváveis, com trilha de override. Eram 30 colunas que o
 * servidor aceita e a planilha recusava — 13 na sub-bacia, 14 na CTS e 3 nas obras.
 *
 * Então a regra passou a ser o CONTRATO: a coluna entra na volta se o `PUT` daquela ficha
 * a grava. Este arquivo é esse contrato, e mora em `data/` porque os dois lados o usam —
 * `domain/planilha.ts` para decidir o que importar, `lib/cadastroApi.ts` para montar o
 * corpo. Um teste compara os dois, para não voltarem a divergir.
 *
 * ## OS NOMES SÃO GRAVÁVEIS desde 01/10/2026
 *
 * Eram todos leitura, "porque vêm da carga". O dono do produto mudou o nome da empresa na
 * planilha, leu o aviso que recusava a mudança mandando usar a tela — onde também não
 * dava — e decidiu: *"isso está errado, se mudar pela planilha deve atualizar"*; depois,
 * sobre os outros: *"faça todos"*.
 *
 * Quatro entraram, cada um na ficha a que pertence:
 *
 *     empresa          input.empresa.empresa                      aba Empresas
 *     sub_bacia_name   sistema_topologia.componente_sistema_nome   aba Sub-bacias
 *     ete_name         idem — e a tela já o deixava digitar, com o `PUT` descartando
 *     cts_name         idem                                        aba Dados da CTS
 *     cidade_name      input.cidade.cidade_name                    SEM ABA (ver abaixo)
 *
 * O da CIDADE é o caso que não fecha: o serviço grava (o corpo do contrato leva
 * `cidade: {id, nome}`, e `salvar_contrato` escreve `input.cidade`), mas a aba
 * `cidade-operacional` é `ocultaNoWizard` — e pela razão que esta mudança acabou de
 * derrubar: "as 4 colunas são db, não há o que preencher". Hoje uma delas há. Enquanto a
 * aba não voltar à tela, o contrato aqui é capacidade sem superfície: não vai ao arquivo
 * nem à grade. Está declarado de propósito, para a próxima leitura não concluir que o
 * serviço não grava.
 *
 * Os três últimos são a MESMA coluna: o id deixou de ser o nome, e as fichas de
 * sub-bacia e de coletor guardam a chave, não o nome. O serviço tem um gravador só
 * (`_gravar_nome_do_componente`), e ele NÃO cria linha de topologia para um componente
 * que a carga não trouxe — nomear não é inventar topologia.
 *
 * Nome vazio não é correção, é perda: o serviço recusa com 422 e a planilha barra antes,
 * com aviso. Ver `NAO_SE_APAGAM` em `domain/planilha.ts`.
 *
 * ## O que fica FORA, e por quê
 *
 * Nenhuma destas é esquecimento; cada uma tem um motivo que o servidor impõe:
 *
 * - **derivadas**: `ticket_medio`, `ticket_medio_faturada` (receita ÷ ligações) e as dez
 *   `*_com_cts`. O servidor as calcula e NÃO as aceita no corpo — mandá-las de volta faz
 *   a ficha ser recusada por campo desconhecido. `capex` idem, com constraint no banco
 *   (`capex_e_derivado`), e `capacidade_ociosa`, que o motor confere contra a conta.
 * - **`ligacoes_novas_obras`, `economias_novas_obras`, `populacao_novas_obras`**: são o
 *   caso mais sutil, porque o `PUT` as CARREGA. São `universo − atuais`, e o motor as
 *   recalcula ignorando o que está gravado — pedir que alguém as digite seria pedir um
 *   número que nunca vai ser lido. Como as duas entradas passaram a ser editáveis, o valor
 *   guardado ficaria velho; quem o acerta é `recalcularDerivadasDaColeta`, na importação da
 *   planilha e ao montar o corpo da gravação.
 * - **ids**: `sub_bacia_id`, `cts_id`, `ete_id`, `emp_codigo`, `cidade_id`. São a
 *   identidade da linha: trocar um id não é atualizar, é apontar para outro registro — e
 *   a mescla casa justamente por ele.
 * - **nada mais fica fora por falta de superfície.** `sistema_name` e `cidade_name` eram
 *   os dois últimos, e em 01/10/2026 as abas deles voltaram à tela (eram
 *   `ocultaNoWizard` "porque não havia o que preencher"). O sistema ganhou rota própria;
 *   a cidade já tinha.
 * - **`componente`** (abas de obra): é metade da chave de casamento da linha. Mudá-la não
 *   é atualizar a obra, é trocar de obra. A planilha de hoje a "aceita" na aba de CAPEX da
 *   CTS, onde ela está marcada como `un` — mas é aceitação vazia: a mescla ACHA a linha
 *   por ela, então o valor da célula é sempre igual ao da linha e nunca há o que mudar.
 * - **`unidade`** (abas de obra): o `PUT` a envia, e mesmo assim fica fora. Ela é fixa por
 *   tipo de componente — metro para Rede, L/s para EEE, unidade para Ligação — e é o que
 *   faz `quantidade × preço unitário` ser comparável entre obras. Quem digitasse "km" numa
 *   Rede não corrigiria um dado: quebraria a comparação. A tela também a trava (`calc`).
 * - **a aba Cidade**: fora do nome, não tem coluna preenchível — a régua da cobertura
 *   virou parâmetro de rodada na migração 019, e as metas e as faixas moram nas abas
 *   próprias. Por um tempo a ficha da cidade ficou sem campo nenhum.
 * - **`sistema_id` da CTS**: o `PUT` grava, mas pela rota própria
 *   (`colocarCtsNoSistema`), com as regras de macrorregião. Fica fora da importação
 *   genérica para não haver dois caminhos escrevendo a mesma coluna.
 * - **`usa_macrorregiao_cts`**: decide o REGIME em que o arquivo nasce, e trocá-la numa
 *   planilha já gerada mudaria o significado das abas de CTS que estão nela. Tem aviso
 *   próprio na importação.
 */

/** As medidas da base comercial — o bloco `db` da ficha de coleta. O servidor as grava. */
const MEDIDAS_DA_BASE = [
  'receita_faturada_media_mensal',
  'receita_arrecadada_media_mensal',
  'universo_ligacoes',
  'ligacoes_atuais',
  'universo_economias',
  'economias_atuais',
  'universo_ligacoes_residencial',
  'ligacoes_atuais_residencial',
  'universo_economias_residencial',
  'economias_atuais_residencial',
] as const

/** O que a Regional preenche na ficha de coleta — o bloco `params`. */
const PARAMETROS_DA_COLETA = [
  'preco_por_ligacao',
  'tempo_arrecadacao',
  'tempo_ramp_up',
  'vazao_contribuicao',
  'universo_populacao',
  'populacao_atual',
  'potencial_crescimento',
] as const

/**
 * A obra, nas duas abas de CAPEX. Duas colunas que o `PUT` carrega ficam fora: `componente`,
 * que é metade da chave de casamento, e `unidade`, que é fixa por tipo de componente — ver
 * o cabeçalho.
 */
const OBRA = [
  'quantidade',
  'preco_unitario',
  'opex',
  'tempo_predecessoras',
  'tempo_execucao',
  'obra_obrigatoria_ano',
  'obra_proibida_ate',
  'wacc',
] as const

/** A ficha da ETE. `sistema_id` fica fora: a ETE entra num sistema pela topologia. */
const ETE = [
  'capacidade_por_modulo',
  'capex_por_modulo',
  'opex_por_modulo',
  'tempo_de_execucao',
  'capacidade_nominal_atual',
  'vazao_de_operacao_atual',
  'nova',
  'capex_terreno',
  'modulos',
  'capacidade_por_modulo_expansao',
  'capex_por_modulo_expansao',
  'wacc',
  'tempo_predecessoras',
  'obra_obrigatoria_ano',
  'obra_proibida_ate',
] as const

/**
 * Aba → as colunas que o `PUT` dela grava.
 *
 * Aba ausente aqui é aba que não recebe nada pela planilha: a Cidade (o `PUT` dela usa só o
 * id), a de sobreposição de CTS e a `regional-operacional`, que são leitura.
 */
export const GRAVAVEL_POR_ABA: Record<string, readonly string[]> = {
  'unidade-regional': ['wacc_medio'],
  //: `empresa` e o NOME da empresa — gravavel desde 01/10/2026, ver o cabecalho
  'empresa': ['empresa', 'data_fim_concessao'],
  //: a cidade ganhou o NOME em 01/10/2026 — e continua sem outro campo proprio
  'cidade-operacional': ['cidade_name'],
  /**
   * O NOME DO SISTEMA — o quinto nome, que em 01/10/2026 ganhou superfície.
   *
   * Ele ficava fora "porque o sistema não tem ficha no wizard". Passou a ter: a rota
   * `PUT /unidades/{u}/sistemas/{id}` grava nome e cidade, e a aba "Sistemas de esgoto"
   * voltou à tela. O `cidade_id` da linha é o par, e entra pelo caminho da criação.
   */
  'cidade-sistema': ['sistema_name'],
  'metas-cobertura': ['ano', 'cobertura_pct'],
  'fator-esgoto': ['cobertura_pct', 'paridade'],
  'ete-capex': ['ete_name', ...ETE],
  'sistema-topologia': ['componente_sistema_id_jusante'],
  'subbacia-operacional': ['sub_bacia_name', ...MEDIDAS_DA_BASE, ...PARAMETROS_DA_COLETA],
  'componentes-subbacias-capex': OBRA,
  'cts-operacional': ['cts_name', ...MEDIDAS_DA_BASE, ...PARAMETROS_DA_COLETA],
  'componentes-cts-capex': OBRA,
}

/**
 * A COLUNA QUE O SERVIDOR CALCULA e recusa no corpo do `PUT`.
 *
 * Pela CONVENÇÃO do nome, e não por lista declarada: `*_com_cts` são dez e nascem da
 * carga, `ticket_medio`/`ticket_medio_faturada` são a mesma conta em duas bases de
 * receita, `capex` tem constraint no banco e `capacidade_ociosa` é nominal − operação.
 * Uma lista envelheceria a cada coluna nova da família; a convenção não.
 *
 * Serve ao AVISO da importação: "não volta pela planilha" é a mesma frase para famílias
 * com saídas diferentes, e dizer a uma coluna derivada "corrija na origem" manda a pessoa
 * ao lugar errado — a saída dela é corrigir as colunas de que ela deriva.
 */
export const colunaCalculadaNoServidor = (col: string): boolean =>
  col.startsWith('ticket_medio')
  || col.endsWith('_com_cts')
  || col === 'capex'
  || col === 'capacidade_ociosa'

/**
 * O CONTEXTO DA UNIDADE que muda o que é gravável — não é a coluna que decide sozinha.
 *
 * Por ora tem um campo só, e é o caso que esta estrutura existe para carregar: a ficha de
 * CTS que é uma MACRORREGIÃO não grava as medidas da base.
 */
export interface ContextoDeGravacao {
  /**
   * A unidade usa macrorregião de CTS — então cada ficha de CTS É uma macrorregião, e as
   * medidas da base dela são a SOMA dos coletores.
   */
  ctsSomada?: boolean
}

/**
 * A MEDIDA DA BASE NUMA CTS SOMADA NÃO SE GRAVA — o servidor refaz a soma.
 *
 * Achado pela revisão do Codex em 01/10/2026, e confirmado no backend: ao gravar a ficha de
 * uma macrorregião, `_gravar_coleta` recebe o bloco `db` SUBSTITUÍDO por `_somas_de_hoje` —
 * a soma dos coletores, lida na hora. O comentário de lá explica por que, e enuncia a
 * premissa que esta mudança quebrou: *"as medidas do Databricks não são digitadas: são
 * travadas na tela. Não há, portanto, nada que a pessoa tenha escrito aqui para ser
 * descartado"*. Era verdade até a liberação; deixou de ser.
 *
 * Então, no regime de macrorregião, as medidas da base da CTS voltam a ser leitura: o que
 * se edita ali seria apagado pela soma no próximo salvamento, e a pessoa veria o valor
 * antigo voltar sem explicação. Os PARÂMETROS da coleta continuam graváveis — o servidor só
 * refaz o bloco `db`.
 *
 * O coletor avulso (regime de microrregião) não é soma de nada, e grava normalmente: lá
 * `_somas_de_hoje` devolve `None` e o bloco `db` que chegou é o que vale.
 */
const MEDIDA_DA_BASE = new Set<string>(MEDIDAS_DA_BASE)

/** A coluna é gravável nesta aba, nesta unidade? */
export const colunaGravavel = (
  abaKey: string,
  coluna: string,
  ctx: ContextoDeGravacao = {},
): boolean => {
  if (!(GRAVAVEL_POR_ABA[abaKey] ?? []).includes(coluna)) return false
  if (abaKey === 'cts-operacional' && ctx.ctsSomada && MEDIDA_DA_BASE.has(coluna)) return false
  return true
}
