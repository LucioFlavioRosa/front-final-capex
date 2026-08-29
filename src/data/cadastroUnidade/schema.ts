/**
 * SCHEMA — reproduz a aba "02 Dicionário de Dados" de
 * `20260728_AEG_Base de Dados Entrada_Otimizador_v8.xlsx`, coluna a coluna.
 *
 * Este arquivo é a transcrição do dicionário, não uma interpretação dele: toda
 * aba, toda coluna e toda origem aqui existe porque o dicionário a lista. Ao
 * atualizar para uma versão nova da planilha, a forma de conferir é reabrir a
 * aba "02 Dicionário de Dados" e comparar linha a linha com `SCHEMA` abaixo —
 * não com os dados de exemplo, que continuam fictícios.
 *
 * Origem de cada coluna (a legenda que aparece em cada célula do cadastro):
 *   'db'   — databricks : já vem pronta, carregada pela integração.
 *   'un'   — unidade    : a unidade preenche.
 *   'calc' — calculado  : o motor deriva; o valor gravado é ignorado.
 *
 * Quatro pontos em aberto, deixados como comentário no bloco da aba em questão
 * porque a própria planilha se contradiz ou tem lacuna — não são bugs deste
 * arquivo, são perguntas para quem mantém a planilha:
 *   1. `sistema-topologia`, `subbacia-cts` — listadas no índice da planilha,
 *      mas sem aba própria no arquivo v8. Mantidas aqui pelo dicionário.
 *   2. `cidade-operacional` perdeu a coluna `unidade_cobertura` que existia na
 *      versão anterior (22/07) e que as "Regras e convenções" da própria v8
 *      ainda descrevem como usada para medir meta e paridade.
 *   3. `fator-esgoto` marca `cidade_id`/`cidade_name` como 'db', enquanto
 *      `metas-cobertura` marca as MESMAS colunas como 'un'. Como as duas abas
 *      têm linhas criadas pela unidade (`addRow`), a leitura 'db' deixaria a
 *      cidade impossível de informar — ver `CIDADE_EDITAVEL_EM` abaixo.
 *   4. `obra_obrigatoria_ano`/`obra_proibida_ate`: o dicionário e as Regras
 *      descrevem o código -1 de formas diferentes. O rótulo do seletor segue
 *      a leitura de `ddl_input.sql`/`otimizador_capex_v62.py` (o código-fonte
 *      do motor), por ser a fonte mais confiável entre as três.
 *
 * ATENÇÃO — as duas colunas de janela de obra (`obra_obrigatoria_ano` e
 * `obra_proibida_ate`) SAÍRAM das abas de CAPEX por decisão da sessão de
 * 30/07/2026 com a Aegea: elas não são cadastro, são premissa de rodada, e
 * passam a ser informadas na tela de simulação. Rótulo, largura e o controle
 * `JanelaObraInput` seguem preservados de propósito, para serem reaproveitados
 * lá. Ver ANALISE-MUDANCAS-AEGEA-30-07.md, item 9.
 */

import {
  TreeView, CalendarBlank, GitFork, MapPinLine, FlowArrow, Graph, Buildings,
  TreeStructure, Wrench, Factory, ChartLineUp, Scales, ArrowsLeftRight, Drop,
} from '@phosphor-icons/react'
import type { AbaDef, Cidade, ColDef } from './types'

/**
 * Nome de uma cidade dentro da lista da unidade — usado pelos selects de metas /
 * fator-esgoto para preencher `cidade_name` junto com `cidade_id`.
 *
 * Recebe a lista como parâmetro porque as cidades são REAIS e variam por
 * unidade (de-para regional·empresa·cidade, ver `hierarquiaReal.ts`): a
 * constante global `CIDADES` que existia aqui era um exemplo fixo de 3 cidades
 * e valia para qualquer unidade selecionada, o que deixou de fazer sentido.
 */
export const nomeCidade = (cidades: Cidade[], id: string): string =>
  cidades.find((c) => c.id === id)?.name ?? ''

/**
 * As cidades REAIS da unidade, derivadas do próprio cadastro carregado —
 * e não mais de um mapa compilado (`hierarquiaReal.ts`, saído em 17/08/2026).
 *
 * A fonte é a aba `cidade-operacional`: ela é `origem: 'db'` (Databricks) e
 * tem exatamente uma linha por cidade da unidade, com `cidade_id`/`cidade_name`.
 * Deriva daqui, e não de uma segunda chamada de rede, porque o cadastro já
 * trouxe essas linhas ao carregar — pedir de novo seria uma segunda fonte para
 * o mesmo fato, e as duas poderiam divergir.
 *
 * Unidade sem cadastro salvo (ainda não passou pelo wizard) devolve lista
 * vazia — os selects de cidade ficam sem opção até a aba de Concessão ganhar
 * ao menos uma linha. É a mesma regra de "banco é a única fonte": sem dado
 * salvo, não há cidade para oferecer.
 */
export function cidadesDoCadastro(dados: Record<string, import('./types').Row[]>): Cidade[] {
  const linhas = dados['cidade-operacional'] ?? []
  const vistas = new Set<string>()
  const cidades: Cidade[] = []
  for (const r of linhas) {
    const id = r.cidade_id
    if (!id || vistas.has(id)) continue
    vistas.add(id)
    cidades.push({ id, name: r.cidade_name ?? '' })
  }
  return cidades
}


/**
 * Abas onde a cidade é escolhida pela unidade, mesmo que o dicionário marque a
 * coluna como 'db'.
 *
 * A regra geral é que coluna 'db' não se edita no site (ver `AbaCell`). Estas
 * duas abas são a exceção porque suas linhas NÃO existem no Databricks: a
 * unidade cria cada faixa de paridade e cada meta com "Adicionar linha", então
 * não há valor vindo de lá para herdar. Travar a cidade aqui deixaria a aba
 * inutilizável — a linha nasceria sem cidade e sem como informá-la.
 *
 * É o ponto (3) em aberto no topo deste arquivo: o dicionário se contradiz
 * entre as duas abas, e esta constante documenta a leitura que adotamos.
 */
export const CIDADE_EDITAVEL_EM = ['metas-cobertura', 'fator-esgoto']

/**
 * UNIDADE DE MEDIDA PADRÃO por tipo de infraestrutura.
 *
 * Decisão da Aegea (31/07/2026): a unidade não é escolha de quem preenche, é
 * propriedade do componente — uma rede sempre se mede em metro, uma EEE sempre
 * em vazão. Deixá-la como select abria a porta para a mesma obra chegar em
 * unidades diferentes de duas unidades operacionais, e aí quantidade × preço
 * unitário deixa de ser comparável entre linhas.
 *
 * Por isso a coluna `unidade` das DUAS abas de CAPEX (rede e CTS) passou de
 * origem 'un' (a unidade preenche) para 'calc' (derivada): ela é lida daqui a
 * partir de `componente`, e a célula fica travada. Ver `computeCalc`.
 *
 * O mapa é por COMPONENTE, não por aba, e é o que permite as duas abas
 * compartilharem a regra: Coletor Tronco, EEE e Linha de recalque aparecem nas
 * duas, e uma tabela por aba abriria espaço para a mesma obra valer metro de um
 * lado e vazão do outro. 'Coletor de tempo seco' só existe na aba da CTS.
 *
 * 'COLETA' OU 'COLETOR' DE TEMPO SECO? A lista escrita de 31 pontos pedia
 * "Coleta" (itens 17 e 18) e o rename chegou a ser feito assim. A transcrição da
 * mesma reunião, porém, termina o trecho correspondente em *"faz sentido ser
 * coletor mesmo, vamos botar"* (1:30:22) — e "coletor" é o que o C de CTS
 * significa. Vale a fonte primária: voltou para 'Coletor de tempo seco' em
 * 07/08/2026.
 *
 * ATENÇÃO ao renomear componente (05/08/2026 — 'Tronco' virou 'Coletor Tronco',
 * pedido da Aegea): o nome é VALOR de dado, não rótulo, e o motor o classifica
 * por SUBSTRING —
 * `otimizador_capex_v62.py`, `_codigo()`: 'tempo seco' → âncora de receita da
 * CTS, 'liga' → ligação, 'rede' → rede, 'tronco' → transporte, 'eee'/'elevat' →
 * transporte, e QUALQUER OUTRA COISA cai no `return` final, Linha de recalque.
 * Os renomes preservam a palavra-chave ('tronco', 'tempo seco'), então passam.
 * Um que a tirasse (ex.: 'Tronco' → 'Interceptor') viraria linha de recalque em
 * silêncio.
 */
export const UNIDADE_POR_COMPONENTE: Record<string, string> = {
  'Ligação': 'un',
  'Rede': 'm',
  'Coletor Tronco': 'm',
  'EEE': 'L/s',
  'Linha de recalque': 'm',
  'Coletor de tempo seco': 'm',
}

/** Selects especiais por coluna: [valor, rótulo][]. */
export const SELECTS: Record<string, [string, string][]> = {
  // `unidade` saiu daqui: virou valor derivado nas duas abas de CAPEX, as
  // únicas que tinham a coluna (ver `UNIDADE_POR_COMPONENTE`). As opções que
  // havia — 'm', 'ligacao', 'un' — nem vocabulário certo tinham: 'ligacao' é o
  // nome de um componente, não uma unidade de medida.
  nova: [['Sim', 'Sim'], ['Não', 'Não']],

  /*
   * A RÉGUA DA COBERTURA — em que unidade a meta da cidade é medida.
   *
   * O valor gravado é o código (`ligacoes`), e o rótulo é a palavra em português:
   * o banco guarda os três literais sem acento e sem CHECK, e é o `<select>` que
   * faz as vezes de restrição. Digitar livre aqui deixaria entrar 'ligações' com
   * acento, que `reguaDe()` no back trata como "régua não escolhida" — pendência
   * silenciosa numa cidade que o usuário jurou ter preenchido.
   *
   * Escolher `populacao` muda o que é EXIGIDO nas fichas de sub-bacia e CTS:
   * `universo_populacao` e `populacao_atual` passam a contar como pendência
   * (`pendencias.py`, `_PARAMS_POP`). Aqui as duas colunas já aparecem sempre, em
   * `colsOperacionalComercial` — não há nada a mostrar ou esconder; o que muda é
   * a conta de completude, e essa vem pronta do servidor.
   *
   * A receita NÃO segue a régua: é sempre por ligação, em qualquer das três.
   */
  unidade_cobertura: [
    ['ligacoes', 'ligações'],
    ['economias', 'economias'],
    ['populacao', 'população'],
  ],
}

export const PLACEHOLDER: Record<string, string> = {
  data_fim_concessao: 'AAAA',
  ano: 'AAAA',
  ano_base: 'AAAA',
  cobertura_pct: '%',
  paridade: '0,80',
  potencial_crescimento: '1,0',
  wacc: '0,091',
  wacc_medio: '0,091',
  preco_unitario: 'R$',
  preco_por_ligacao: 'R$',
}

/** Rótulo humano de cada coluna — o nome técnico do dicionário fica só no tooltip. */
export const COLUNA_LABELS: Record<string, string> = {
  regional_id: 'ID Regional',
  regional_name: 'Regional',
  unidade_id: 'ID Unidade',
  unidade_name: 'Unidade',
  /**
   * Código e nome da empresa operadora, o vocabulário do de-para do Wagner
   * (`DEPARA_REGIONAL_EMP_CODIGO_EMPRSA_CIDADE.csv`: REGIONAL · EMP_CODIGO ·
   * EMPRESA · CIDADE).
   *
   * Colunas PRÓPRIAS, e não `unidade_id`/`unidade_name` reaproveitados, mesmo
   * carregando hoje o mesmo valor: se EMPRESA é ou não a mesma coisa que
   * UNIDADE é justamente a pergunta em aberto (§6). Colunas separadas deixam a
   * resposta livre — se forem níveis distintos, cada uma já tem seu lugar; se
   * forem a mesma coisa, some uma. Fundir agora seria decidir por antecipação.
   */
  emp_codigo: 'EMP_CODIGO',
  empresa: 'Empresa',
  wacc_medio: 'WACC médio da unidade',
  ano_base: 'Ano-base do cronograma',
  superintendencia_id: 'ID Superintendência',
  superintendencia_name: 'Superintendência',
  cidade_id: 'ID Cidade',
  cidade_name: 'Cidade',
  sistema_id: 'ID Sistema',
  sistema_name: 'Sistema',
  /**
   * A planilha chama de "componente do sistema", mas cada linha do Fluxo de
   * escoamento é uma sub-bacia, uma ETE **ou** uma CTS — "Componente" fazia
   * parecer que era só um dos cinco componentes de obra (Ligação/Rede/Coletor
   * Tronco/EEE/Linha de recalque), que é outra coisa e existe como coluna
   * própria nas abas de CAPEX.
   *
   * Quatro rodadas de ajuste com a Aegea: primeiro "Nó do sistema" / "ID do nó";
   * depois o par origem→destino, que é o que a tabela realmente descreve (cada
   * linha é uma aresta do fluxo); em 31/07/2026 a simetria entre os dois lados
   * (cada um com seu par id + nome); e em 05/08/2026 a palavra "Nó" caiu —
   * jargão de grafo que ninguém usa na operação.
   *
   * A ASSIMETRIA dos dois rótulos de nome é o conteúdo: origem é sempre
   * sub-bacia ou CTS; destino é sempre sub-bacia ou ETE. O tipo, que "Nó"
   * escondia, passou a estar escrito no cabeçalho. Os dois rótulos de ID ficam
   * curtos porque a coluna tem 84px (ver `COLS_XS`) — o tipo está na coluna de
   * nome ao lado e no tooltip.
   */
  componente_sistema_id: 'ID Origem',
  componente_sistema_nome: 'Sub-bacia/CTS de origem',
  componente_sistema_id_jusante: 'ID Destino',
  componente_sistema_nome_jusante: 'Sub-bacia/ETE de destino',
  data_fim_concessao: 'Fim da concessão',
  unidade_cobertura: 'Cobertura medida em',
  sub_bacia_id: 'ID Sub-bacia',
  sub_bacia_name: 'Sub-bacia',
  cts_id: 'ID CTS',
  cts_name: 'CTS',
  // "por NOVA ligação" (05/08/2026): a taxa é cobrada uma vez, no momento em que
  // o cliente é conectado pela obra — não é recorrente por ligação existente.
  preco_por_ligacao: 'Preço por nova ligação',
  receita_faturada_media_mensal: 'Receita faturada (média mensal)',
  receita_arrecadada_media_mensal: 'Receita arrecadada (média mensal)',
  tempo_arrecadacao: 'Tempo para arrecadação',
  tempo_ramp_up: 'Tempo de Ramp-up',
  vazao_contribuicao: 'Vazão de contribuição',
  universo_ligacoes: 'Universo de ligações',
  ligacoes_atuais: 'Ligações atuais',
  ligacoes_novas_obras: 'Ligações novas (obras)',
  universo_economias: 'Universo de economias',
  economias_atuais: 'Economias atuais',
  economias_novas_obras: 'Economias novas (obras)',
  /**
   * As CINCO colunas do recorte residencial e o ticket, que estavam sem rótulo e
   * por isso apareciam com o nome técnico (`colunaLabel` devolve a chave quando
   * não acha entrada). Passava despercebido na tela porque as cinco vivem no
   * grupo de colunas de referência da ficha comercial, à direita do que se
   * preenche — mas no template de Excel elas são cabeçalho de coluna como
   * qualquer outra, e `universo_ligacoes_residencial` num cabeçalho é ruído.
   *
   * O rótulo diz "(residencial)" e não "residenciais" para o par universo/atuais
   * ler igual ao par sem recorte que vem logo antes: a diferença entre as duas
   * colunas é o RECORTE, não a contagem.
   */
  universo_ligacoes_residencial: 'Universo de ligações (residencial)',
  ligacoes_atuais_residencial: 'Ligações atuais (residencial)',
  universo_economias_residencial: 'Universo de economias (residencial)',
  economias_atuais_residencial: 'Economias atuais (residencial)',
  ticket_medio: 'Ticket médio',
  universo_populacao: 'Universo de população',
  populacao_atual: 'População atual',
  populacao_novas_obras: 'População nova (obras)',
  potencial_crescimento: 'Potencial de crescimento',
  componente: 'Componente',
  quantidade: 'Quantidade',
  unidade: 'Unidade de medida',
  preco_unitario: 'Preço unitário',
  capex: 'CAPEX',
  opex: 'OPEX',
  // Vale para as duas abas de CAPEX (rede e ETEs) — é a mesma coluna.
  tempo_predecessoras: 'Tempo para predecessoras',
  /**
   * UMA grafia para as duas abas de CAPEX (sub-bacia e CTS), de propósito.
   *
   * O pedido de 05/08/2026 trouxe duas — "Tempo de execução da obra" na
   * sub-bacia e "Tempo de execução de obra" na CTS — para a MESMA coluna. Como o
   * rótulo é por coluna e não por aba, atender às duas exigiria transformar este
   * mapa em `Record<aba, Record<coluna, string>>` por causa de uma preposição.
   * Adotada a primeira nas duas; se a diferença for intencional, é reabrir.
   */
  tempo_execucao: 'Tempo de execução da obra',
  tempo_de_execucao: 'Tempo de execução do módulo',
  // Fora do cadastro desde 30/07/2026 — passam para a tela de simulação. Os
  // rótulos ficam porque é lá que serão reaproveitados (ver topo do arquivo).
  obra_obrigatoria_ano: 'Obrigatória em',
  obra_proibida_ate: 'Proibida até',
  wacc: 'WACC',
  ete_id: 'ID ETE',
  ete_name: 'ETE',
  capacidade_por_modulo: 'Capacidade por módulo',
  capex_por_modulo: 'CAPEX por módulo',
  opex_por_modulo: 'OPEX por módulo',
  capacidade_nominal_atual: 'Capacidade nominal atual',
  vazao_de_operacao_atual: 'Vazão de operação atual',
  capacidade_ociosa: 'Capacidade ociosa',
  nova: 'ETE nova?',
  // Só o RÓTULO muda (item 14). A chave `capex_terreno` é o que o motor lê para
  // decidir ETE nova vs expansão e o que `CAMPOS_SO_ETE_NOVA` usa para travar a
  // célula — renomeá-la quebraria as duas coisas em silêncio.
  capex_terreno: 'Custo de terreno e estrutura de fim de plano',
  modulos: 'Módulos',
  ano: 'Ano',
  cobertura_pct: 'Cobertura (%)',
  paridade: 'Paridade',
}

export const colunaLabel = (col: string): string => COLUNA_LABELS[col] ?? col

/**
 * Explicação que aparece ao passar o mouse no CABEÇALHO da coluna.
 *
 * Existe porque rótulo é espaço caro: "Nó de origem (Sub-bacia, ETE, CTS)"
 * cabia, mas as duas colunas de nó juntas enchiam a tela de parênteses — a
 * Aegea reclamou da poluição (31/07/2026) e pediu que a explicação viesse pelo
 * mouse. A informação não se perde, muda de lugar.
 *
 * Vale sobretudo para os IDs GERADOS: 'b001' não se explica sozinho, e quem
 * vê o código precisa saber que ele é provisório e não vem do Databricks.
 */
export const COLUNA_AJUDA: Record<string, string> = {
  /**
   * Os quatro verbetes foram reescritos em 07/08/2026 junto do item 22: a lista
   * suspensa mudou o que é VERDADE sobre cada campo. Antes eles diziam que o nó
   * "pode ser sub-bacia, ETE ou CTS" dos dois lados; agora a regra é assimétrica —
   * sub-bacia nunca deságua em CTS, e a lista de uma sub-bacia é sempre dentro do
   * próprio sistema.
   */
  componente_sistema_id: 'De onde o esgoto sai nesta linha: uma sub-bacia (b001) ou uma CTS (t001). Escolha na lista — cada origem aparece uma vez só, porque a saída de um nó é sempre uma.',
  componente_sistema_nome: 'Nome da sub-bacia ou da CTS de origem. Preenchido junto com o código ao lado, não se digita.',
  componente_sistema_id_jusante: 'Para onde esta linha deságua. Saindo de uma SUB-BACIA, a lista traz as outras sub-bacias do mesmo sistema e a ETE dele — sub-bacia não deságua em CTS. Saindo de uma CTS, a lista é completa: qualquer sub-bacia, CTS ou ETE, porque esse vínculo não existe em fonte nenhuma.',
  componente_sistema_nome_jusante: 'Nome do destino — o próximo passo do caminho até a estação de tratamento. Preenchido junto com o código ao lado.',
  cidade_id: 'Código provisório da cidade dentro desta unidade (c001, c002…). Gerado pelo site: o de-para não traz código de cidade. Vale só dentro deste cadastro.',
  sistema_id: 'Código provisório do sistema (s01, s02…). Gerado pelo site: nenhuma fonte traz código de sistema — o nome ao lado é que é real.',
  sub_bacia_id: 'Código provisório da sub-bacia (b001, b002…). Gerado pelo site: o CSV só traz o nome. Será substituído pelo código do Databricks.',
  superintendencia_id: 'Código provisório da superintendência (p01). O nível não existe em nenhuma fonte — há uma linha só, para a hierarquia fechar.',
  ete_id: 'Código provisório da ETE (e01, e02…). Nenhuma fonte traz ETE: a aba inteira é exemplo.',
  cts_id: 'Código provisório da CTS dentro desta unidade (t001, t002…). Gerado pelo site; o código de CTS_DADOS_COMERCIAIS.csv aparece por extenso na coluna ao lado.',
  emp_codigo: 'Código real da empresa operadora no de-para. É ele que recorta a base comercial de CTS por unidade.',
  regional_id: 'Código real da regional (R1…R5). O de-para não traz nome descritivo, por isso a coluna ao lado repete o código.',
}

/**
 * Colunas numéricas curtas (largura mínima) — só as que também têm RÓTULO
 * curto. As colunas de prazo (`tempo_*`) têm valor curto mas rótulo longo
 * ("Tempo para arrecadação", "Tempo de execução da obra"...) e foram tiradas
 * daqui: em 84px o rótulo cortava no meio da palavra
 * ("ARRECAD"/"AÇÃO") — na largura padrão (128px) cada palavra cabe inteira
 * numa linha. Ver ANALISE-MUDANCAS-AEGEA-30-07.md, item 18.
 */
const COLS_XS = new Set([
  'ano', 'ano_base', 'wacc', 'wacc_medio', 'modulos', 'cobertura_pct', 'paridade', 'quantidade',
  /**
   * Os IDs GERADOS entram aqui desde 31/07/2026: o valor virou código curto
   * ('c001', 's01', 'b001'), então 128px eram 44px de ar por coluna, em abas
   * com 20+ colunas. Os rótulos cabem em 84px porque são todos de palavra
   * curta — "ID Sistema", "ID Cidade", "ID Sub-bacia", "ID Origem".
   *
   * DUAS EXCEÇÕES, cada uma por um motivo:
   *
   *   `superintendencia_id` — "Superintendência" é palavra de 16 letras e,
   *     sozinha, é mais larga que a coluna inteira; em 84px quebra no meio, o
   *     mesmo defeito documentado acima para as colunas de prazo.
   *   `cidade_id` — nas abas de metas e paridade a célula é um <select>, e o
   *     <select> nativo exibe o rótulo INTEIRO da opção escolhida ('c001 ·
   *     BELFORD ROXO'), não só o valor. Em 84px, descontada a seta do
   *     controle, nem o código cabia. Fica em 128px por causa dessas duas
   *     abas; nas outras quatro, onde é campo travado mostrando 'c001', sobra
   *     espaço — é o preço de a largura ser por coluna, não por aba.
   */
  'sistema_id', 'sub_bacia_id', 'cts_id', 'ete_id',
  'componente_sistema_id', 'componente_sistema_id_jusante',
])
/** Colunas de nome/texto ou valores longos (largura maior). */
const COLS_LG = new Set([
  'regional_name', 'superintendencia_name', 'cidade_name', 'sistema_name',
  'sub_bacia_name', 'cts_name', 'ete_name',
  // "ÁGUAS GUARIROBA S.A.", "NX - ÁGUAS DE NOVO PROGRESSO" — nomes longos
  'empresa',
  // só os NOMES de origem/destino; os dois ids são código curto e vivem em COLS_XS
  'componente', 'componente_sistema_nome', 'componente_sistema_nome_jusante',
  'receita_faturada_media_mensal', 'receita_arrecadada_media_mensal',
  'obra_obrigatoria_ano', 'obra_proibida_ate',
])

/**
 * Largura fixa (px) de cada coluna na grade. Usada em colgroup + table-fixed:
 * cabeçalho e input passam a compartilhar exatamente a mesma caixa, garantindo alinhamento.
 */
export function colunaLargura(col: string): number {
  if (COLS_XS.has(col)) return 84
  if (COLS_LG.has(col)) return 168
  return 128
}

/** Largura da coluna de ações (a lixeira), quando a aba permite remover linha. */
export const LARGURA_ACOES = 44

/**
 * A LARGURA DA TABELA de uma aba, em pixels — a soma das colunas mais a de ações.
 *
 * `temAcoes` é PARÂMETRO, e não deduzido de `aba.addRow`, porque a coluna de
 * ações deixou de depender só disso: a aba do Fluxo não cria linhas e mesmo
 * assim tem uma ação por linha (tirar a CTS do sistema). Deduzindo, a conta
 * ficava 44px curta justamente nela, e o botão nascia fora da área visível —
 * só alcançável com rolagem lateral.
 *
 * Vivia dentro do `AbaGrid`, que precisa dela para o `colgroup` e para a barra de
 * rolagem espelhada. Saiu de lá em 20/08/2026 porque o `CadastroWizard` passou a
 * precisar do MESMO número: na aba do Fluxo ele dimensiona a coluna da esquerda
 * do layout de duas colunas, e um número calculado em dois lugares é um número
 * que vai discordar de si mesmo na primeira coluna nova.
 */
export const larguraDaGrade = (aba: AbaDef, temAcoes = !!aba.addRow): number =>
  aba.cols.reduce((s, c) => s + colunaLargura(c.coluna), 0) + (temAcoes ? LARGURA_ACOES : 0)

/**
 * COLUNAS ADITIVAS — aquelas cuja SOMA no rodapé da grade quer dizer algo.
 *
 * ⚠️ ESTA LISTA É UMA CLASSIFICAÇÃO DE ENGENHARIA, NÃO UMA DECISÃO DA AEGEA.
 * Precisa de confirmação antes de a soma aparecer numa demonstração. Os dois
 * grupos em que eu tenho menos certeza estão marcados abaixo.
 *
 * O critério é um só: somar as linhas produz um número que existe no mundo?
 *
 *   ENTRA  — estoque e contagem (`ligacoes_atuais`, `economias_novas_obras`,
 *     `populacao_atual`, `universo_*`, `modulos`, `quantidade`), dinheiro
 *     (`capex`, `capex_terreno`, `opex`) e capacidade (`capacidade_*`).
 *     A soma de 9 sub-bacias é o total da unidade — é a pergunta que a Aegea faz.
 *
 *   NÃO ENTRA — taxa, percentual e preço unitário (`wacc`, `wacc_medio`,
 *     `paridade`, `cobertura_pct`, `potencial_crescimento`, `preco_unitario`,
 *     `preco_por_ligacao`, `*_por_modulo`): a soma de percentuais dá 640% e
 *     ninguém precisa disso. Ano e data (`ano`, `ano_base`,
 *     `data_fim_concessao`) pelo motivo óbvio: somar 9 anos daria 18.234, e o
 *     número PARECE plausível, que é o pior defeito possível num rodapé.
 *     Prazos (`tempo_*`) também ficam fora: são a linha do tempo de cada
 *     entidade, e somá-las não descreve nada — dois prazos de 6 meses em
 *     paralelo não são 12 meses.
 *
 * (1) RECEITA — `receita_*_media_mensal` é média mensal por linha. Somar dá a
 *     receita mensal do conjunto, o que É útil, mas o rótulo "média" no nome
 *     pode fazer alguém ler o total como se fosse média de médias.
 * (2) VAZÃO — somar vazões de contribuintes em paralelo é fisicamente correto
 *     no ponto de encontro, e não é correto se as linhas forem do mesmo trecho
 *     em série. Depende da topologia, que a grade não conhece.
 */
const COLUNAS_ADITIVAS = new Set([
  // dinheiro
  'capex', 'capex_terreno', 'opex',
  // contagem e estoque
  'modulos', 'quantidade',
  'economias_atuais', 'economias_novas_obras',
  'ligacoes_atuais', 'ligacoes_novas_obras',
  'populacao_atual', 'populacao_novas_obras',
  'universo_economias', 'universo_ligacoes', 'universo_populacao',
  // capacidade
  'capacidade_nominal_atual', 'capacidade_ociosa',
  // (1) a confirmar com a Aegea
  'receita_faturada_media_mensal', 'receita_arrecadada_media_mensal',
  // (2) a confirmar com a Aegea
  'vazao_contribuicao', 'vazao_de_operacao_atual',
])

/** A soma desta coluna no rodapé da grade significa algo? Ver `COLUNAS_ADITIVAS`. */
export function ehAditiva(col: string): boolean {
  return COLUNAS_ADITIVAS.has(col)
}

/**
 * As colunas comerciais que se repetem em `subbacia-operacional` e em
 * `cts-operacional` — o dicionário descreve os dois blocos de forma idêntica.
 *
 * Recebe o CSV de procedência como parâmetro porque as duas abas leem o MESMO
 * conjunto de colunas de arquivos diferentes: a de sub-bacia vem de
 * SUB_BACIAS_DADOS_COMERCIAIS.csv, a de CTS de CTS_DADOS_COMERCIAIS.csv. Antes
 * era uma constante; virou função para o rastreio de procedência não mentir em
 * uma das duas.
 */
const colsOperacionalComercial = (csv: 'subbacias' | 'cts'): ColDef[] => [
  // sem coluna correspondente em nenhum dos CSVs — a unidade preenche
  { coluna: 'preco_por_ligacao', origem: 'un', procedencia: 'vazio', oque: 'Taxa cobrada uma única vez ao conectar o cliente, por NOVA ligação — não incide sobre as ligações já existentes.', porque: 'Vira receita indireta no ano da conexão.', exemplo: '784' },
  // MED_12M_FAT_DIR_AGUA_LIQ / MED_12M_ARREC_DIR_AGUA
  { coluna: 'receita_faturada_media_mensal', origem: 'db', procedencia: csv, oque: 'Média mensal da receita faturada de água nos últimos 12 meses, para as ligações desta base comercial.', porque: 'É a base para estimar quanto a área deve gerar de receita de esgoto, aplicando a paridade esgoto/água.' },
  { coluna: 'receita_arrecadada_media_mensal', origem: 'db', procedencia: csv, oque: 'Média mensal da receita efetivamente arrecadada (paga) de água nos últimos 12 meses.', porque: 'Comparada com a receita faturada, mostra a inadimplência da base — importante para não superestimar o retorno esperado.' },
  { coluna: 'tempo_arrecadacao', origem: 'un', procedencia: 'vazio', oque: 'Tempo entre a obra ficar pronta e a sub-bacia começar a faturar.', porque: 'Atrasa o início da receita (lag) no cálculo do VPL.', exemplo: '6' },
  { coluna: 'tempo_ramp_up', origem: 'un', procedencia: 'vazio', oque: 'Tempo até a adesão plena dos clientes após o início do faturamento.', porque: 'A receita cresce em curva S (lenta–pico–lenta) até o pleno neste prazo; o OPEX sobe no mesmo período.', exemplo: '12' },
  { coluna: 'vazao_contribuicao', origem: 'un', procedencia: 'vazio', oque: 'A vazão NOVA que a sub-bacia passa a mandar quando conectada — não a vazão já existente. É o TOTAL, e assim continua no recorte residencial: a vazão dimensiona a ETE, e descontar indústria a subdimensionaria.', porque: 'Dimensiona os módulos da ETE e é o peso do rateio das obras compartilhadas. Errar aqui distorce quem paga o quê.', exemplo: '165,9' },
  // QTD_LIGACOES_TOTAL / QTD_LIGACOES_AGUA
  { coluna: 'universo_ligacoes', origem: 'db', procedencia: csv, oque: 'Total de ligações de água potenciais da base (residenciais + industriais), somando ativas e inativas.' },
  { coluna: 'ligacoes_atuais', origem: 'db', procedencia: csv, oque: 'Ligações de água atualmente ativas.' },
  { coluna: 'ligacoes_novas_obras', origem: 'calc', procedencia: 'vazio', oque: 'Calculado: universo − ligações atuais.', porque: 'São as ligações que as obras deste plano ainda precisam atender. O valor gravado nesta coluna é ignorado — o motor sempre recalcula.' },
  /*
   * RECORTE RESIDENCIAL — quanto das medidas acima é residencial.
   *
   * Vem apurado da origem, e NÃO é deduzido por subtração: a base entrega os
   * quatro números medidos. Serve de denominador da meta quando a rodada pede
   * cobertura só residencial; a receita, o VPL e a vazão seguem no TOTAL em
   * qualquer modo — quem paga a conta é a ligação, seja de casa ou de fábrica.
   *
   * Faltavam nesta tela, e o efeito era silencioso: a ficha chegava do servidor
   * com eles, a grade não os mostrava, e a gravação os preservava por baixo
   * (`ultimaLeitura`, em `lib/cadastroApi.ts`). Ou seja: dado que existe, importa
   * para a meta, e ninguém conseguia conferir nem corrigir.
   */
  { coluna: 'universo_ligacoes_residencial', origem: 'db', procedencia: csv, oque: 'Quantas do universo de ligações são residenciais.', porque: 'Denominador da meta quando a rodada mede cobertura só residencial.' },
  { coluna: 'ligacoes_atuais_residencial', origem: 'db', procedencia: csv, oque: 'Quantas das ligações já atendidas são residenciais.', porque: 'Numerador de partida da meta no recorte residencial.' },
  // QTD_ECO_TOTAL / QTD_ECO_AGUA
  { coluna: 'universo_economias', origem: 'db', procedencia: csv, oque: 'Total de economias de água da base — uma economia é cada unidade autônoma dentro de uma mesma ligação (ex.: cada apartamento de um prédio).' },
  { coluna: 'economias_atuais', origem: 'db', procedencia: csv, oque: 'Economias de água atualmente ativas.' },
  { coluna: 'economias_novas_obras', origem: 'calc', procedencia: 'vazio', oque: 'Calculado: universo − economias atuais.', porque: 'São as economias que as obras deste plano ainda precisam atender. O valor gravado nesta coluna é ignorado — o motor sempre recalcula.' },
  /*
   * TICKET MÉDIO — conta do servidor, exibida aqui.
   *
   * `origem: 'db'` e não `'calc'`: o valor VEM pronto do backend (receita ÷
   * ligações), e `computeCalc` não o conhece — marcá-lo como calculado faria a
   * célula exibir um travessão sobre um número que já existe. Ele não volta na
   * gravação: o servidor o exclui do contrato do `PUT` (ver `DB_DERIVADO` em
   * `lib/cadastroApi.ts`).
   */
  { coluna: 'ticket_medio', origem: 'db', procedencia: 'vazio', oque: 'Receita média por ligação — receita faturada dividida pelas ligações ativas.', porque: 'É o que multiplica as ligações novas para estimar a receita das obras. Conta do servidor: não é digitado nem gravado.' },
  { coluna: 'universo_economias_residencial', origem: 'db', procedencia: csv, oque: 'Quantas do universo de economias são residenciais.', porque: 'Denominador da meta quando a cidade mede cobertura em economias e a rodada pede só residencial.' },
  { coluna: 'economias_atuais_residencial', origem: 'db', procedencia: csv, oque: 'Quantas das economias já atendidas são residenciais.', porque: 'Numerador de partida da meta no recorte residencial por economias.' },
  // população não existe em nenhum CSV
  { coluna: 'universo_populacao', origem: 'un', procedencia: 'vazio', oque: 'Toda a população da área da sub-bacia, atendida ou não por esgoto.', porque: 'É o denominador da meta quando a cidade mede cobertura por população. Sem ele não dá para verificar o percentual contratado.', exemplo: '1.267' },
  { coluna: 'populacao_atual', origem: 'un', procedencia: 'vazio', oque: 'População que já tem coleta de esgoto, antes das obras deste plano.', porque: 'É o numerador de partida da meta. A diferença para o universo é a população que as obras precisam atender.', exemplo: '406' },
  { coluna: 'populacao_novas_obras', origem: 'calc', procedencia: 'vazio', oque: 'Calculado: universo − atendida hoje.', porque: 'É a população que as obras deste plano passam a atender. O valor gravado nesta coluna é ignorado — o motor sempre recalcula.' },
  { coluna: 'potencial_crescimento', origem: 'un', procedencia: 'vazio', oque: 'Multiplicador do universo de ligações da sub-bacia. 1,0 = sem crescimento; 1,5 = universo 50% maior.', porque: 'Amplia SÓ o denominador da meta de cobertura.', exemplo: '1,0' },
]

export const SCHEMA: AbaDef[] = [
  // -------------------------------------------------------- Unidade e fluxo
  /**
   * BLOCOS 01 E 02 FUNDIDOS (07/08/2026) — consequência das remoções do item 3-6.
   *
   * "Identificação da unidade" e "Estrutura" tinham quatro abas juntos; depois que
   * Ano-base, Superintendências, Sistemas de esgoto e Cidades atendidas saíram da
   * tela, sobrou UMA aba visível em cada — e um bloco de uma aba é dois níveis de
   * navegação para um destino só, com o stepper de blocos e a fila de abas
   * dizendo a mesma coisa.
   *
   * Fundidos, o wizard tem 5 blocos e o primeiro tem duas abas: quem a unidade é,
   * e por onde o esgoto dela corre. As abas ocultas continuam no meio do array,
   * na posição hierárquica que sempre tiveram — `blocos.ts` as filtra depois de
   * agrupar, então elas não levam nome de bloco nenhum embora.
   */
  {
    key: 'unidade-regional', icone: TreeView, titulo: 'Unidade e regional', bloco: 'Unidade e fluxo',
    // A menção ao WACC saiu daqui em 05/08/2026: ele virou cartão próprio acima da
    // tabela (item 24), com a explicação inteira. Repetir a regra da herança na
    // descrição da aba, a 3cm de distância, é a poluição que o cartão veio resolver.
    desc: 'Topo da hierarquia da unidade: regional e empresa operadora, como vêm do de-para oficial da Aegea.',
    cols: [
      { coluna: 'regional_id', origem: 'db', procedencia: 'depara', oque: 'Código da regional a que esta unidade pertence (R1 a R5), vindo do de-para oficial Regional × Empresa × Cidade.', exemplo: 'R4' },
      // o de-para só traz o CÓDIGO da regional (R1…R5), não um nome descritivo:
      // esta coluna repete o código em vez de inventar um nome
      { coluna: 'regional_name', origem: 'db', procedencia: 'depara', oque: 'Nome da regional. Hoje repete o próprio código (R1…R5) porque a fonte de dados não traz um nome descritivo — pendência a confirmar com a Aegea.', exemplo: 'R4' },
      { coluna: 'unidade_id', origem: 'db', procedencia: 'depara', oque: 'Código da empresa operadora (EMP_CODIGO) que identifica esta unidade no de-para da Aegea.', exemplo: '57' }, { coluna: 'unidade_name', origem: 'db', procedencia: 'depara', oque: 'Nome da empresa operadora responsável por esta unidade.', exemplo: 'Águas do Rio 04' },
      { coluna: 'wacc_medio', origem: 'un', procedencia: 'mock', oque: 'Custo médio de capital (WACC) da unidade como um todo — preenchido por Operações Financeiras.', porque: 'Toda obra de CAPEX que não tiver um WACC próprio preenchido herda este valor no cálculo do retorno — nenhuma obra fica sem taxa de desconto.', exemplo: '0,0945' },
    ],
  },
  {
    /**
     * FORA DA TELA desde 05/08/2026, e agora AUTOMÁTICA.
     *
     * A pergunta do Wagner foi "por que isso é variável?", e a resposta do Lúcio
     * fechou o item na hora: "ele poderia só pegar o ano da data que o cara está.
     * Se eu estou fazendo 2026, eu vou pegar o ano 2026. A gente pega o
     * automático." Por isso `ano_base` deixou de ser 'un' (a unidade digita) e
     * passou a 'calc' — `computeCalc` devolve o ano corrente.
     *
     * A linha continua existindo porque o motor lê `regional_operacional.ano_base`
     * como o ano 0 do cronograma. O valor definitivo da rodada é pedido na tela de
     * simulação, junto do orçamento — mesmo destino de `obra_obrigatoria_ano` /
     * `obra_proibida_ate` (ver topo deste arquivo).
     */
    key: 'regional-operacional', icone: CalendarBlank, titulo: 'Ano-base',
    ocultaNoWizard: true,
    desc: 'Ano em que o cronograma da análise começa a contar. Automático: é o ano corrente, e a rodada pode sobrescrevê-lo na tela de simulação.',
    cols: [
      { coluna: 'regional_id', origem: 'db', procedencia: 'depara', oque: 'Código da regional a que esta unidade pertence (R1 a R5).', exemplo: 'R4' },
      { coluna: 'ano_base', origem: 'calc', procedencia: 'regra', oque: 'Ano-calendário em que o cronograma de obras e receitas desta unidade começa a contar. Automático: o ano corrente.', porque: 'É o ano 0 da linha do tempo usada para posicionar os prazos das obras e descontar os fluxos de caixa. Deixou de ser digitado em 05/08/2026 — o ano da análise é sempre o ano em que ela é feita.', exemplo: '2026' },
    ],
  },

  // -------------------------------------------------------------- Estrutura
  {
    // FORA DA TELA desde 05/08/2026 (o dado fica — ver `ocultaNoWizard`). Era a
    // aba mais vazia do cadastro: uma linha placeholder, nome em branco, nada a
    // preencher. Lúcio, 04/08: "superintendência a gente não está considerando
    // nada… é mais uma questão de organização do dado".
    // Declarava `bloco: 'Estrutura'` até 07/08/2026 — era a primeira aba do
    // bloco 02, e por isso o nome dele morava aqui, numa aba oculta. Com a fusão
    // acima o bloco deixou de existir e o campo saiu; as três abas ocultas
    // seguintes e o Fluxo de escoamento passam a pertencer ao bloco 01.
    key: 'regional-superintendencia', icone: GitFork, titulo: 'Superintendências',
    ocultaNoWizard: true,
    desc: 'Liga unidade → superintendência. O nível de superintendência não existe em nenhuma das fontes: há uma linha de reserva para a hierarquia fechar.',
    cols: [
      { coluna: 'unidade_id', origem: 'db', procedencia: 'depara', oque: 'Código da unidade a que esta superintendência pertence.', exemplo: '57' },
      // 'p01', código gerado — o de-para pula de empresa direto para cidade
      { coluna: 'superintendencia_id', origem: 'db', procedencia: 'mock', oque: 'Identifica uma camada intermediária entre unidade e cidade, criada só para a hierarquia fechar — nenhuma fonte de dados traz esse nível hoje.', exemplo: 'p01' },
      { coluna: 'superintendencia_name', origem: 'db', procedencia: 'vazio', oque: 'Nome da superintendência. Fica vazio porque esse nível não existe em nenhuma fonte de dados hoje.' },
    ],
  },
  // A ORDEM DAS ABAS sai da ordem deste array. Sistemas de esgoto vem antes de
  // Cidades atendidas por pedido da Aegea (30/07/2026) — junto com a mesma
  // inversão dentro da tabela, sistema antes de cidade.
  {
    /**
     * FORA DA TELA desde 05/08/2026 — mas o dado é o mais requisitado dos quatro.
     *
     * Wagner, 04/08: "isso daqui é um de-para também… não sei se tem ganho mostrar
     * isso, se não tem nada para preencher". De fato: as 5 colunas são 'db'.
     *
     * A tabela, porém, é a fonte de DUAS coisas que continuam na tela: o nome de
     * cada sistema, e o filtro por sistema da lista de destino do Fluxo de
     * escoamento (item 22 — a sub-bacia só pode desaguar em sub-bacia do mesmo
     * sistema). Esconder é seguro; apagar quebraria o item 22.
     */
    key: 'cidade-sistema', icone: FlowArrow, titulo: 'Sistemas de esgoto',
    ocultaNoWizard: true,
    desc: 'Liga sistema → cidade — o universo que a otimização analisa. O primeiro sistema é real (o da amostra do Fluxo de escoamento, sem cidade porque nenhuma fonte diz qual ele atende); os demais são exemplo, e sustentam a aba de CAPEX das ETEs.',
    cols: [
      { coluna: 'emp_codigo', origem: 'db', procedencia: 'depara', oque: 'Código real da empresa operadora no de-para da Aegea — é ele que recorta os dados comerciais (sub-bacias, CTS) por unidade.', exemplo: '57' }, { coluna: 'empresa', origem: 'db', procedencia: 'depara', oque: 'Nome da empresa operadora responsável por este sistema.', exemplo: 'Águas do Rio 04' },
      // O ID é código gerado em TODAS as linhas — 'mock', não 'misto'. Antes o
      // do sistema real trazia o próprio nome ('Alegria') e os de exemplo
      // traziam s1/s2/s3, e a coluna misturava as duas coisas; a Aegea apontou
      // que ficava estranho. O NOME é que segue misto, e é onde a diferença
      // entre real e exemplo deve mesmo aparecer.
      { coluna: 'sistema_id', origem: 'db', procedencia: 'mock', oque: 'Identifica um sistema de esgotamento sanitário — o conjunto de sub-bacias que escoam até a mesma ETE.', exemplo: 's01' }, { coluna: 'sistema_name', origem: 'db', procedencia: 'misto', oque: 'Nome do sistema de esgotamento sanitário.', exemplo: 'Alegria' },
      // vazia na linha real, cidade do de-para nas de exemplo
      { coluna: 'cidade_id', origem: 'db', procedencia: 'mock', oque: 'Identifica a cidade atendida por este sistema, dentro do de-para oficial da Aegea.', exemplo: '57-BELFORD_ROXO' },
      // A ÚNICA coluna que a Regional preenche nesta aba, e a razão de ela ainda
      // importar mesmo oculta. Não vem do Databricks: é decisão de quem monta o
      // sistema, e o servidor a faz valer — marcado, ele recusa a segunda CTS.
      //
      // A caixa aparece na aba do FLUXO, ao lado do seletor de sistema, e não
      // aqui: é lá que se escolhe um sistema por vez e se coloca CTS nele.
      // Editá-la numa aba oculta seria escondê-la de quem precisa dela.
      {
        coluna: 'usa_sistema_cts', origem: 'un', procedencia: 'vazio',
        oque: 'Marcado: o sistema aceita UMA CTS. Desmarcado: aceita várias.',
        porque: 'Define quantos coletores de tempo seco o sistema comporta. O servidor recusa adicionar a segunda CTS num sistema marcado, e recusa marcar um que já tenha duas.',
        exemplo: 'Nao',
      },
    ],
  },
  {
    /**
     * FORA DA TELA desde 05/08/2026. Wagner, 04/08: "esses cidades atendidas vai
     * ser a mesma coisa… focar nas telas que tenham de fato dados a serem
     * preenchidos".
     *
     * O dado fica, e é usado em dois lugares que continuam visíveis: a validação
     * "cidade sem faixa de paridade" e o elo superintendência → cidade. A lista do
     * <select> de cidade das abas de metas e paridade NÃO vem daqui (vem do
     * de-para, via `UnidadeState.cidades`), então ela não é afetada.
     */
    key: 'superintendencia-cidade', icone: MapPinLine, titulo: 'Cidades atendidas',
    ocultaNoWizard: true,
    desc: 'Liga superintendência → cidade, com a empresa operadora que responde por elas. Cidades reais do de-para.',
    cols: [
      { coluna: 'emp_codigo', origem: 'db', procedencia: 'depara', oque: 'Código real da empresa operadora no de-para da Aegea.', exemplo: '57' }, { coluna: 'empresa', origem: 'db', procedencia: 'depara', oque: 'Nome da empresa operadora responsável por esta cidade.', exemplo: 'Águas do Rio 04' },
      { coluna: 'superintendencia_id', origem: 'db', procedencia: 'mock', oque: 'Superintendência a que esta cidade está ligada nesta hierarquia (placeholder — ver aba Superintendências).', exemplo: 'p01' },
      // o id é gerado ('c001'); o NOME é que vem do de-para
      { coluna: 'cidade_id', origem: 'db', procedencia: 'mock', oque: 'Identifica esta cidade dentro do cadastro. Código gerado pelo site (o de-para não traz id de cidade).', exemplo: 'c001' }, { coluna: 'cidade_name', origem: 'db', procedencia: 'depara', oque: 'Nome da cidade atendida por esta unidade, vindo do de-para oficial da Aegea.', exemplo: 'Belford Roxo' },
    ],
  },
  {
    // Listada no índice da planilha (01 Indice de Abas), sem aba própria no
    // arquivo v8 — ver ponto (1) no comentário do topo do arquivo.
    key: 'sistema-topologia', icone: Graph, titulo: 'Fluxo de escoamento',
    // A aba do print: os dois eixos, e o sistema pelo caminho 'fluxo' porque a
    // linha de CTS chega sem `sistema_id` — ele vem do destino dela (item 21).
    escopo: { cidade: 'via-sistema', sistema: 'fluxo' },
    /**
     * TEXTO REESCRITO (item 28, fechado em 07/08/2026).
     *
     * A metade que faltava dependia do item 22: dizer que "cada linha é uma
     * sub-bacia OU uma CTS de origem" só virou verdade quando a aba passou a
     * nascer com linha de CTS. Antes disso o texto descreveria uma tela que não
     * existia.
     *
     * A última frase é a que importa e é a que o cliente insistiu: o destino não
     * tem fonte, é a informação mais crítica da base, e errá-lo não produz erro —
     * produz um plano que libera receita sem a obra que a sustenta.
     */
    desc: 'Para onde cada trecho escoa. Cada linha é uma sub-bacia ou uma CTS de origem, com o destino — outra sub-bacia ou a ETE — escolhido na mesma linha; encadeadas, as linhas formam o caminho até a estação de tratamento. Saindo de uma sub-bacia, a lista de destinos fica no próprio sistema; saindo de uma CTS, ela é completa. Os nomes de sistema e de sub-bacia são reais (amostra de um sistema); os códigos ao lado são provisórios, gerados aqui. O destino não existe em nenhuma fonte: é o que a unidade informa, e é a informação mais crítica da aba — um destino errado libera receita sem a infraestrutura que a sustenta. AO LADO DA TABELA, o mesmo fluxo aparece desenhado: cada caixa é uma sub-bacia, uma CTS ou a ETE, e cada seta é o caminho que o esgoto faz até a estação. Escolha o sistema na barra acima para ver o desenho dele; clicar numa caixa leva o foco para a linha dela aqui.',
    /**
     * A aba ganhou "Adicionar linha" com o item 22. Até aqui não havia como
     * cadastrar um escoamento que o `seed` não tivesse criado — o que era
     * aceitável enquanto a aba só tinha as 19 sub-bacias da amostra, e deixou de
     * ser quando ela passou a ser o lugar onde a CTS declara para onde vai.
     *
     * A linha nasce vazia dos dois lados: origem e destino são escolha, e a origem
     * é que decide qual lista o destino oferece.
     */
    /**
     * SEM "ADICIONAR LINHA", e sem escolher a origem — as duas coisas saíram
     * juntas, e pela mesma razão.
     *
     * Cada linha desta aba É um componente, e todos eles já vêm do servidor:
     * sub-bacias e ETE porque o Databricks diz quais pertencem ao sistema, e as
     * CTS porque a base as traz todas (as ainda não colocadas chegam com o
     * sistema em branco). Não sobra ninguém para uma linha nova apontar — o
     * seletor de origem só oferece quem AINDA NÃO é origem, e essa lista é
     * sempre vazia. Era exatamente o que se via na tela: um dropdown que abre
     * sem nenhuma opção.
     *
     * Criar componente aqui também não resolveria: o servidor recusa id que não
     * tenha ficha, justamente para não nascer nó de demanda zero (ver
     * `salvar_topologia` no backend).
     *
     * O que se edita aqui é o JUSANTE — o caminho até a ETE. Colocar uma CTS num
     * sistema é o controle "Adicionar CTS" abaixo da grade.
     */
    cols: [
      // Código gerado, nome real: nem o CSV de sub-bacias nem nenhuma outra
      // fonte trazem código de sistema ou de sub-bacia. Pedido da Aegea
      // (31/07/2026) — os dois ids eram o nome repetido e vinham marcados como
      // dado real, o que era duplamente enganoso.
      /*
       * `sistema_id` e `sistema_name` NÃO SÃO COLUNAS AQUI — e continuam no dado.
       *
       * Esta aba trabalha um sistema por vez: a barra acima diz qual, e toda
       * linha visível é dele. Repetir o mesmo valor em duas colunas, linha após
       * linha, gastava a largura que empurrava a coluna de ações para fora da
       * tela — o botão de tirar a CTS do sistema só aparecia com rolagem
       * lateral.
       *
       * O código já tratava as duas como redundantes com a barra: para esta aba
       * (`escopo.sistema === 'fluxo'`), `colunasDoEscopo` tira o funil de filtro
       * delas justamente porque quem recorta é a barra. Sair da tabela é o passo
       * seguinte da mesma ideia.
       *
       * O DADO FICA: `escopoInicial`, `casaComEscopo`, o unifilar e a gravação
       * leem `row.sistema_id`, e é ele que a tela escreve ao colocar ou tirar
       * uma CTS. Some da grade, não da linha.
       *
       * CONSEQUÊNCIA a conhecer: abrindo a barra em "todos os sistemas", a
       * tabela deixa de dizer de qual sistema é cada linha. É o preço, e ele é
       * pequeno perto de a aba abrir recortada por padrão.
       */
      /**
       * ORIGEM passou de 'db' para 'un' com o item 22, e é mais que rótulo: a aba
       * agora tem "Adicionar linha", e numa linha nova não existe origem vinda de
       * lugar nenhum — a unidade escolhe qual sub-bacia ou CTS aquela linha
       * descreve. As 19+ linhas que o `seed` cria já chegam preenchidas, então a
       * completude não muda de patamar (entram no numerador e no denominador ao
       * mesmo tempo).
       */
      { coluna: 'componente_sistema_id', origem: 'db', procedencia: 'mock', oque: 'De onde o esgoto sai nesta linha: uma sub-bacia (b001) ou uma CTS (t001). Escolha na lista.', porque: 'Cada origem aparece uma vez só: a saída de um nó é sempre uma, e duas linhas para o mesmo nó fariam o motor manter só a última.', exemplo: 'b001' },
      /**
       * Os dois NOMES continuam travados, e agora por outro motivo: não vêm mais
       * do Databricks, vêm da escolha do código ao lado — `espelharColunas`, em
       * `cadastroFluxo.ts`, escreve os dois na mesma tecla. Ficam 'db' porque o
       * efeito na tela é o que 'db' significa (célula travada, ninguém digita
       * aqui); o `oque` é que diz de onde o valor veio.
       */
      { coluna: 'componente_sistema_nome', origem: 'db', procedencia: 'subbacias', oque: 'Nome da sub-bacia ou da CTS de origem. Preenchido junto com o código ao lado.', exemplo: 'Canal do Cunha' },
      // O destino é um par id + nome, espelhando a origem ao lado. Pedido da
      // Aegea (31/07/2026): com só o id, quem confere o caminho precisa procurar
      // o código em outra aba para saber o que ele é.
      // O QUE o componente e — sub-bacia, CTS ou ETE. Vem do servidor (ele sabe
      // em qual tabela o componente tem ficha) e nao volta: e derivado, nao
      // digitado. Sem ele a tela nao distingue uma CTS ainda nao colocada de uma
      // sub-bacia, e as duas aparecem iguais na lista dos sem sistema.
      // `calc`, e nao `db`: o tipo e uma FUNCAO PURA do id — e a aba em que o
      // componente tem ficha (`subbacia-operacional`, `cts-operacional`,
      // `ete-capex`), que o cadastro ja carrega. Derivar na hora de exibir e
      // melhor que guardar na linha: nao ha copia para envelhecer, e a celula
      // nasce travada, como toda coluna derivada.
      //
      // No back do Lucio isto vem do servidor (`t.tipo`), porque a API dele
      // entrega ficha por ficha e a tela nao tem o conjunto. Aqui tem.
      { coluna: 'componente_tipo', origem: 'calc', procedencia: 'vazio', oque: 'Natureza do componente: sub-bacia, CTS ou ETE.', porque: 'Derivado da aba em que o componente tem ficha — não é digitado nem gravado. Sem ele a tela não distingue uma CTS ainda não colocada de uma sub-bacia.', exemplo: 'cts' },
      { coluna: 'componente_sistema_id_jusante', origem: 'un', procedencia: 'vazio', oque: 'Para ONDE esta linha escoa. A lista depende da origem: de uma sub-bacia, só as sub-bacias do mesmo sistema e a ETE dele; de uma CTS, qualquer sub-bacia, CTS ou ETE.', porque: 'COLUNA MAIS CRÍTICA DA BASE. Define o caminho até a ETE e quais obras liberam a receita. Um erro aqui libera receita sem infraestrutura.', exemplo: 'e01' },
      { coluna: 'componente_sistema_nome_jusante', origem: 'db', procedencia: 'vazio', oque: 'Nome do destino — o próximo passo do caminho até a estação de tratamento. Preenchido junto com o código ao lado.' },
    ],
  },
  /*
   * A ABA `fluxo-unifilar` FOI ABSORVIDA POR ESTA, em 20/08/2026, e o registro
   * fica porque o desenho já foi apagado uma vez.
   *
   * Ela era o item 34 do pedido de 04/08/2026 e nasceu SEM DADO NENHUM — nenhuma
   * coluna, nenhuma linha, marcada `semDados` para sair da completude e do
   * payload. Vinha logo depois desta, e a ordem era do Wagner (15:17): *"a
   * topologia tem que vir primeiro"*; preenchia-se numa, conferia-se na outra.
   *
   * O que a separação custava era exatamente o que ela prometia: conferir era
   * navegar, e o efeito de escolher um destino só aparecia depois de trocar de
   * aba. Juntas — grade à esquerda, desenho à direita, ligados pelo foco da linha
   * — a conferência acontece enquanto se preenche, que é o que Wagner pediu em
   * 14:19 (*"essa demonstração deveria estar aqui no cadastro também"*).
   *
   * O unifilar já existiu e foi APAGADO no item 14 de 30/07/2026, quando a `main`
   * foi reduzida ao escopo entregável — era um SVG fixo, com nomes inventados
   * ('Alto da Serra', 'ETE Aurora'), que não lia dado nenhum. O que vive hoje em
   * `Unifilar.tsx` não é aquele: é desenho do cadastro real.
   */

  // --------------------------------------------------------------- Operação
  {
    key: 'cidade-operacional', icone: Buildings, titulo: 'Concessão', bloco: 'Operação',
    // Só cidade: a concessão é DA CIDADE, e sistema não existe nesta aba.
    escopo: { cidade: 'coluna' },
    // O fim de concessão é do CONTRATO, e o contrato é da empresa operadora —
    // ver `replicarPor` em `types.ts`. A mesma tecla vale para a régua de
    // cobertura, que também costuma ser uniforme dentro de uma operadora.
    replicarPor: 'emp_codigo',
    desc: 'Fim da concessão de cada cidade, por empresa operadora.',
    cols: [
      { coluna: 'emp_codigo', origem: 'db', procedencia: 'depara', oque: 'Código real da empresa operadora responsável por esta cidade.', exemplo: '57' }, { coluna: 'empresa', origem: 'db', procedencia: 'depara', oque: 'Nome da empresa operadora responsável por esta cidade.', exemplo: 'Águas do Rio 04' },
      { coluna: 'cidade_id', origem: 'db', procedencia: 'mock', oque: 'Identifica esta cidade dentro do cadastro.', exemplo: 'c001' }, { coluna: 'cidade_name', origem: 'db', procedencia: 'depara', oque: 'Nome da cidade.', exemplo: 'Belford Roxo' },
      { coluna: 'data_fim_concessao', origem: 'un', procedencia: 'vazio', oque: 'Ano-calendário do fim da concessão da cidade.', porque: 'Define até quando a receita entra no VPL. Depois disso, nada é contado.', exemplo: '2045' },
      { coluna: 'unidade_cobertura', origem: 'un', procedencia: 'vazio', oque: 'A régua em que a cobertura desta cidade é medida: ligações, economias ou população.', porque: 'Vale para a verificação da META e para a faixa de PARIDADE. Escolher "população" torna obrigatórios o universo e a população atual de cada sub-bacia e CTS. A receita continua sempre por ligação.', exemplo: 'ligações' },
    ],
  },
  {
    key: 'subbacia-operacional', icone: TreeStructure, titulo: 'Sub-bacias',
    // 1.047 linhas — a aba que mais ganha com o recorte. O sistema vem por
    // `via-subbacia` e não por 'coluna': o `sistema_id` desta aba chega VAZIO da
    // fonte (ver a própria coluna abaixo), e o vínculo real está no nome.
    escopo: { cidade: 'via-sistema', sistema: 'via-subbacia' },
    desc: 'Base comercial (Databricks) + parâmetros da unidade: preço/ligação, prazos, vazão, população e potencial de crescimento.',
    // Sistema antes de sub-bacia: a leitura natural é de cima para baixo na
    // hierarquia, e é assim que a unidade procura a linha na tabela.
    cols: [
      // o CSV traz o NOME do sistema (coluna SES), não um código — e nesta aba
      // o campo de código nem chega preenchido (o join sistema→sub-bacia vive
      // no Fluxo de escoamento); o da sub-bacia é o 'b001' gerado
      { coluna: 'sistema_id', origem: 'db', procedencia: 'vazio', oque: 'Sistema de esgotamento sanitário a que esta sub-bacia pertence. Vazio aqui porque esse vínculo vive na aba Fluxo de escoamento.' }, { coluna: 'sistema_name', origem: 'db', procedencia: 'subbacias', oque: 'Nome do sistema de esgotamento sanitário (SES) da base comercial.', exemplo: 'Alegria' },
      { coluna: 'sub_bacia_id', origem: 'db', procedencia: 'mock', oque: 'Identifica esta sub-bacia — a menor unidade territorial de coleta de esgoto, que escoa até uma ETE.', exemplo: 'b001' }, { coluna: 'sub_bacia_name', origem: 'db', procedencia: 'subbacias', oque: 'Nome da sub-bacia, vindo da base comercial real.', exemplo: 'Canal do Cunha' },
      ...colsOperacionalComercial('subbacias'),
    ],
  },

  // ---------------------------------------------------------------- Sub-bacia
  {
    key: 'componentes-subbacias-capex', icone: Wrench, titulo: 'CAPEX de componentes de sub-bacias', bloco: 'Sub-bacia',
    // 5 linhas por sub-bacia. Um terceiro eixo (sub-bacia) foi deixado de fora:
    // a listra de `zebraPor` já dá a leitura por bloco sem custar controle.
    escopo: { cidade: 'via-sistema', sistema: 'coluna' },
    desc: 'Os 5 componentes de obra de cada sub-bacia real do sistema: Ligação, Rede, Coletor Tronco, EEE e Linha de recalque. O CAPEX é calculado (quantidade × preço unitário) e a unidade de medida é o padrão do componente.',
    // Tabela única, sem accordion — decisão da sessão de 30/07/2026: a Aegea
    // quer ver e editar tudo como uma planilha, não abrir bloco por bloco.
    zebraPor: 'sub_bacia_id',
    // Componente DEPOIS de sub-bacia: a hierarquia vem primeiro (sistema →
    // sub-bacia) e o componente é o detalhe dentro dela. Ele já esteve na
    // primeira posição por uma rodada; a Aegea reviu e pediu aqui.
    //
    // A aba deixou de ser exemplo de ponta a ponta (31/07/2026): sistema e
    // sub-bacia agora são os REAIS do CSV de sub-bacias, os mesmos do Fluxo
    // — daí 'subbacias' no lugar de 'mock' nas quatro primeiras colunas. O que
    // segue inventado é a OBRA (quantidade, preço, OPEX, prazos, WACC), e só
    // numa sub-bacia. `componente` é a lista fixa dos 5 do dicionário.
    cols: [
      // ids gerados ('s01', 'b001'), nomes reais — ver `IDS GERADOS` em seed.ts
      { coluna: 'sistema_id', origem: 'db', procedencia: 'mock', oque: 'Sistema de esgotamento sanitário a que esta sub-bacia pertence.', exemplo: 's01' }, { coluna: 'sistema_name', origem: 'db', procedencia: 'subbacias', oque: 'Nome do sistema de esgotamento sanitário.', exemplo: 'Alegria' },
      { coluna: 'sub_bacia_id', origem: 'db', procedencia: 'mock', oque: 'Identifica a sub-bacia dona desta obra.', exemplo: 'b001' }, { coluna: 'sub_bacia_name', origem: 'db', procedencia: 'subbacias', oque: 'Nome da sub-bacia dona desta obra.', exemplo: 'Canal do Cunha' }, { coluna: 'componente', origem: 'db', procedencia: 'regra', oque: 'Tipo do componente de obra: Ligação, Rede, Coletor Tronco, EEE (estação elevatória) ou Linha de recalque.', porque: 'Cada tipo tem sua própria unidade de medida padrão (ver coluna Unidade) e seu papel na cadeia de coleta.' },
      // `unidade` é 'calc' + 'regra': não é exemplo nem dado de fonte, é a
      // convenção fixada com a Aegea, derivada de `componente`.
      { coluna: 'quantidade', origem: 'un', procedencia: 'mock', oque: 'Quanto será construído do componente (ex.: 2.472 m de rede, 38 ligações).', porque: 'CAPEX = quantidade × preço unitário. Dá rastreabilidade ao investimento.', exemplo: '2.472' },
      { coluna: 'unidade', origem: 'calc', procedencia: 'regra', oque: 'Unidade de medida da quantidade — metro para Rede/Coletor Tronco/Linha de recalque, L/s para EEE, unidade para Ligação.', porque: 'É fixa por tipo de componente (não é escolha livre) para que quantidade × preço unitário seja sempre comparável entre obras.' },
      { coluna: 'preco_unitario', origem: 'un', procedencia: 'mock', oque: 'Preço de mercado de uma unidade do componente (R$/metro, R$/ligação ou R$/L·s, conforme o tipo).', porque: 'CAPEX = quantidade × preço unitário.' },
      { coluna: 'capex', origem: 'calc', procedencia: 'mock', oque: 'Investimento total do componente.', porque: 'Calculado automaticamente como quantidade × preço unitário — não precisa preencher.' },
      { coluna: 'opex', origem: 'un', procedencia: 'mock', oque: 'Custo de operar a obra, por ano, depois de pronta. Informe o valor MÁXIMO (todas as ligações faturando).', porque: 'Obra ociosa não gera OPEX; a operação sobe de forma côncava até o máximo no tempo de rampa.', exemplo: '49.847' },
      { coluna: 'tempo_predecessoras', origem: 'un', procedencia: 'mock', oque: 'Espera entre as obras que vêm antes ficarem prontas e esta poder começar.', porque: 'É assim que a sequência é montada: a simulação escolhe o ano de cada obra, mas respeita a ordem física. 0 = pode começar junto.', exemplo: '4' }, 
      { coluna: 'tempo_execucao', origem: 'un', procedencia: 'mock', oque: 'Quanto dura a construção desta obra, do início à entrega.', porque: 'Define quando a obra passa a atender e a gerar receita.', exemplo: '9' },
      /*
       * A JANELA DA OBRA — em que anos ela PODE acontecer.
       *
       * Faltavam, e são as duas únicas restrições de tempo que o motor aceita
       * por obra. Sem elas, a tela não tinha como dizer "esta obra é obrigatória
       * em 2027" nem "esta não pode começar antes de 2029" — e o servidor as
       * aceita desde sempre (`obra_obrigatoria_ano`, `obra_proibida_ate` em
       * `componentes_*_capex`).
       */
      { coluna: 'obra_obrigatoria_ano', origem: 'un', procedencia: 'vazio', oque: 'Ano em que esta obra TEM de acontecer, por exigência contratual ou regulatória.', porque: 'O motor a força nesse ano, mesmo que o retorno não justifique. Vazio = sem exigência.', exemplo: '2027' },
      { coluna: 'obra_proibida_ate', origem: 'un', procedencia: 'vazio', oque: 'Ano até o qual esta obra NÃO pode começar.', porque: 'Impede o plano de agendar antes de uma licença, desapropriação ou obra de terceiro. Vazio = sem impedimento.', exemplo: '2029' }, 
      { coluna: 'wacc', origem: 'un', procedencia: 'mock', oque: 'Custo de capital do componente, quando há financiamento nominalmente atrelado.', porque: 'Desconta CAPEX e OPEX da obra. Vazio = usa o WACC médio da unidade (Operações Financeiras).', exemplo: '0,091' },
    ],
  },
  {
    key: 'ete-capex', icone: Factory, titulo: 'CAPEX das ETEs',
    // Só sistema: a ETE declara `sistema_id` desde o item 22. Cidade seria
    // derivação de segundo grau para uma lista curta — controle sem retorno.
    escopo: { sistema: 'coluna' },
    desc: 'Módulos, custos, terreno e prazos das estações de tratamento. A capacidade ociosa é calculada automaticamente. Nenhuma fonte traz ETE: a aba inteira é exemplo.',
    cols: [
      /**
       * `ete_name` PASSOU DE 'db' PARA 'un' em 20/08/2026, junto de `sistema_id`
       * abaixo, e pelo mesmo motivo: nenhuma fonte traz ETE — a aba inteira é
       * exemplo, e o nome que aparece hoje ('ETE Alegria') foi montado pelo
       * `seed`. Travado, ele era um nome inventado que ninguém podia corrigir.
       *
       * `ete_id` FICA travado: é identidade, gerada pelo cadastro, e é a chave que
       * o Fluxo referencia como destino. Deixá-lo editável abriria a porta para
       * renomear um código já apontado por linhas de escoamento.
       */
      { coluna: 'ete_id', origem: 'db', procedencia: 'mock', oque: 'Identifica a Estação de Tratamento de Esgoto (ETE) que recebe a vazão dos sistemas conectados a ela.', exemplo: 'e01' }, { coluna: 'ete_name', origem: 'un', procedencia: 'mock', oque: 'Nome da ETE.', porque: 'Nenhuma fonte traz estação de tratamento: o nome que vem preenchido é exemplo, e é a unidade que informa o real.' },
      /**
       * O SISTEMA QUE A ETE ATENDE — coluna nova, exigida pelo item 22.
       *
       * A regra do destino filtrado é "as outras sub-bacias daquele sistema **e a
       * ETE dele**", e até 07/08/2026 esse "dele" não existia em lugar nenhum que
       * a tela pudesse ler: o vínculo ETE → sistema morava dentro do `seed`, como
       * um mapa privado usado só para montar o nome da estação ("ETE Alegria").
       * Sem a coluna, a lista de destinos de uma sub-bacia sairia sem ETE — ou
       * seja, sem o único destino que fecha a cadeia.
       *
       * ERA 'db' — "vínculo de cadastro, não escolha de quem preenche" — e isso
       * se mostrou errado em 20/08/2026. O raciocínio valia para um vínculo que
       * vem de fonte; este não vem de nenhuma ('mock', porque a aba inteira é
       * exemplo). O resultado prático era que NÃO HAVIA COMO dizer qual sistema
       * uma ETE atende — e este é justamente o vínculo de que `opcoesDestino`
       * precisa para oferecer a ETE como destino das sub-bacias daquele sistema,
       * e `unifilarDoSistema` para fechar o desenho na estação.
       *
       * Vira 'un' como LISTA SUSPENSA dos sistemas do cadastro (ver
       * `opcoesDaCelula`), não texto livre: um código de sistema digitado errado
       * some da lista de destinos sem acusar erro nenhum.
       *
       * Quando o Databricks trouxer ETE, esta coluna volta a 'db' e mais nada muda.
       */
      { coluna: 'sistema_id', origem: 'un', procedencia: 'mock', oque: 'Sistema de esgotamento sanitário que esta ETE atende. Escolha na lista.', porque: 'É o que permite ao Fluxo de escoamento oferecer a ETE certa como destino das sub-bacias daquele sistema — e é o sistema que uma CTS herda quando deságua nesta estação.', exemplo: 's01' },
      { coluna: 'capacidade_por_modulo', origem: 'un', procedencia: 'mock', oque: 'Vazão que cada módulo da ETE trata.', porque: 'Define quantos módulos são necessários para a vazão conectada.', exemplo: '49' },
      { coluna: 'capex_por_modulo', origem: 'un', procedencia: 'mock', oque: 'Investimento de um módulo — o custo da expansão.' },
      { coluna: 'opex_por_modulo', origem: 'un', procedencia: 'mock', oque: 'Custo anual de operar um módulo.' },
      { coluna: 'tempo_predecessoras', origem: 'un', procedencia: 'mock', oque: 'Espera entre as obras que vêm antes ficarem prontas e esta poder começar.', porque: 'É assim que a sequência é montada: a simulação escolhe o ano de cada obra, mas respeita a ordem física. 0 = pode começar junto.', exemplo: '4' },
      { coluna: 'tempo_de_execucao', origem: 'un', procedencia: 'mock', oque: 'Quanto dura a construção de um módulo. Mesma lógica das demais obras.', porque: 'Define quando a obra passa a atender e a gerar receita.', exemplo: '9' },
      /*
       * A JANELA DA OBRA DA ETE — as mesmas duas das outras abas de obra.
       *
       * A ETE é uma obra como as demais para o motor, que lê as duas daqui
       * (`otimizador_capex_v62.py:1315`). Faltava a tela poder defini-las: a
       * restrição valia na simulação e não havia onde dizer "esta ETE é
       * obrigatória em 2028".
       */
      { coluna: 'obra_obrigatoria_ano', origem: 'un', procedencia: 'vazio', oque: 'Ano em que esta ETE TEM de ficar pronta, por exigência contratual ou regulatória.', porque: 'O motor a força nesse ano, mesmo que o retorno não justifique. Vazio = sem exigência.', exemplo: '2028' },
      { coluna: 'obra_proibida_ate', origem: 'un', procedencia: 'vazio', oque: 'Ano até o qual esta ETE NÃO pode começar.', porque: 'Impede o plano de agendar antes de licença ambiental, desapropriação ou obra de terceiro. Vazio = sem impedimento.', exemplo: '2029' },
      { coluna: 'capacidade_nominal_atual', origem: 'un', procedencia: 'mock', oque: 'Capacidade instalada hoje.', porque: 'Com a vazão de operação, define a folga (capacidade ociosa).' },
      { coluna: 'vazao_de_operacao_atual', origem: 'un', procedencia: 'mock', oque: 'Vazão tratada hoje.' },
      { coluna: 'capacidade_ociosa', origem: 'calc', procedencia: 'mock', oque: 'Folga = capacidade nominal − vazão de operação.', porque: 'Absorve vazão nova sem exigir módulo novo.' },
      { coluna: 'nova', origem: 'un', procedencia: 'mock', oque: 'Indica se esta é uma ETE nova (greenfield) ou uma ETE existente em expansão.', porque: "Só ETE nova tem custo de terreno e número de módulos preenchíveis — os demais campos ficam travados quando a resposta é 'Não'." },
      { coluna: 'capex_terreno', origem: 'un', procedencia: 'mock', oque: 'Custo do terreno da ETE nova.', porque: 'ETE nova é um pacote único: terreno + módulos.', exemplo: '912.405' },
      { coluna: 'modulos', origem: 'un', procedencia: 'mock', oque: 'Número de módulos da ETE nova.', porque: 'Define a capacidade total do pacote (teto de vazão).', exemplo: '4' },
      { coluna: 'wacc', origem: 'un', procedencia: 'mock', oque: 'Custo de capital do componente, quando há financiamento nominalmente atrelado.', porque: 'Desconta CAPEX/OPEX e entra rateado por vazão na taxa da receita das sub-bacias. Vazio = usa o WACC médio da unidade (Operações Financeiras).', exemplo: '0,091' },
    ],
  },

  // ------------------------------------------------------------ Metas e fatores
  {
    key: 'metas-cobertura', icone: ChartLineUp, titulo: 'Metas de cobertura', bloco: 'Metas e fatores',
    // A meta é por cidade e ano; sistema não aparece e não faria sentido.
    escopo: { cidade: 'coluna' },
    desc: 'Meta de cobertura (%) por cidade e ano — o que a otimização precisa alcançar. Uma linha por par cidade/ano.',
    addRow: true,
    novo: () => ({ cidade_id: '', cidade_name: '', ano: '', cobertura_pct: '' }),
    cols: [
      { coluna: 'emp_codigo', origem: 'db', procedencia: 'depara', oque: 'Código real da empresa operadora responsável por esta cidade.', exemplo: '57' }, { coluna: 'empresa', origem: 'db', procedencia: 'depara', oque: 'Nome da empresa operadora responsável por esta cidade.', exemplo: 'Águas do Rio 04' },
      // a cidade é real (de-para), com código gerado; ano e meta são exemplo —
      // nenhuma fonte traz meta
      { coluna: 'cidade_id', origem: 'un', procedencia: 'mock', oque: 'Cidade a que esta meta de cobertura se refere.', exemplo: 'c001' }, { coluna: 'cidade_name', origem: 'un', procedencia: 'depara', oque: 'Nome da cidade.', exemplo: 'Belford Roxo' },
      { coluna: 'ano', origem: 'un', procedencia: 'mock', oque: 'Ano-calendário em que a meta de cobertura precisa ser atingida.', exemplo: '2030' },
      { coluna: 'cobertura_pct', origem: 'un', procedencia: 'mock', oque: 'Percentual do universo que deve estar atendido naquele ano.', porque: 'O alvo em quantidade = % × universo, medido na régua da cidade. Metas fora do horizonte de CAPEX são ignoradas.', exemplo: '48' },
    ],
  },
  {
    key: 'fator-esgoto', icone: Scales, titulo: 'Escala de paridade',
    // Mesma razão da aba de metas. ATENÇÃO: esta aba CRIA a faixa 0 ao ser
    // aberta (`garantirFaixaZeroParidade`) — ver o efeito no CadastroWizard, que
    // limpa o recorte junto para a linha nova não nascer escondida.
    escopo: { cidade: 'coluna' },
    /**
     * Texto reescrito em 05/08/2026 (item 30). O anterior — "Uma faixa (cobertura 0)
     * já vale como paridade constante" — era correto e ilegível para quem não já
     * soubesse a regra. O cliente ditou a segunda metade: *"caso a cidade só tenha
     * uma paridade, criar uma faixa de cobertura zero"* (Wagner, 1:24:34), e a
     * criação automática está em `garantirFaixaZero`.
     */
    desc: 'Quanto a tarifa de esgoto representa da tarifa de água, por faixa de cobertura. Cada faixa vale a partir da cobertura informada; a faixa de cobertura 0 é a paridade constante — vale para a cidade inteira, em qualquer ano. Cidade com uma paridade só não precisa de mais nada: a faixa 0 é criada aqui automaticamente.',
    addRow: true,
    novo: () => ({ cidade_id: '', cidade_name: '', cobertura_pct: '', paridade: '' }),
    cols: [
      { coluna: 'emp_codigo', origem: 'db', procedencia: 'depara', oque: 'Código real da empresa operadora responsável por esta cidade.', exemplo: '57' }, { coluna: 'empresa', origem: 'db', procedencia: 'depara', oque: 'Nome da empresa operadora responsável por esta cidade.', exemplo: 'Águas do Rio 04' },
      { coluna: 'cidade_id', origem: 'db', procedencia: 'mock', oque: 'Cidade a que esta faixa de paridade se refere.', exemplo: 'c001' }, { coluna: 'cidade_name', origem: 'db', procedencia: 'depara', oque: 'Nome da cidade.', exemplo: 'Belford Roxo' },
      { coluna: 'cobertura_pct', origem: 'un', procedencia: 'mock', oque: 'Percentual do universo que deve estar atendido naquele ano.', porque: 'O alvo em quantidade = % × universo, medido na régua da cidade. Metas fora do horizonte de CAPEX são ignoradas.', exemplo: '48' }, 
      { coluna: 'paridade', origem: 'un', procedencia: 'mock', oque: 'Quanto a tarifa de esgoto representa da tarifa de água naquela faixa de cobertura.', porque: 'tarifa_esgoto = ticket (água) × paridade. Quando a cobertura sobe de faixa, o reajuste vale também para a base existente.', exemplo: '0,80 / 0,85 / … / 1,00' },
    ],
  },

  // --------------------------------------------------- Coletor de tempo seco
  {
    // Listada no índice da planilha, sem aba própria no arquivo v8 — ver
    // ponto (1) no comentário do topo. Só se aplica a unidades com CTS.
    /**
     * VOLTOU PARA A NAVEGAÇÃO em 21/08/2026 — estava `ocultaNoWizard` desde
     * antes de o PAREAMENTO decidir de que unidade a CTS era (a leitura hoje
     * é pela TOPOLOGIA — a aba do Fluxo — e a sobreposição de área virou dado
     * da própria sub-bacia, nas colunas `*_com_cts`, já consolidado pela
     * origem). Esconder fazia sentido NAQUELE momento: "a aba fica no SCHEMA
     * por ser elo do modelo, e sai da navegação porque não há nada a
     * preencher nela — o backend não a serve nem a aceita" era verdade então.
     *
     * Deixou de ser verdade em 20/08/2026 (ver o comentário logo abaixo, "A
     * ABA ERA INTOCÁVEL ATÉ 20/08/2026"): os dois códigos viraram editáveis,
     * ganhou `addRow`, lista suspensa e espelho de nome — e o backend
     * (`sincronizar_input.py`) sempre continuou gravando `input.subbacia_cts`,
     * nunca parou. A flag `ocultaNoWizard` só não foi removida junto — o
     * resultado, achado em 21/08, era uma tela sem NENHUM jeito de chegar
     * nela: `irParaAba`/`BLOCOS` filtram aba oculta antes de montar destino,
     * e nenhum componente (ao contrário de `UsaSistemaCts`/`AdicionarCts`
     * para `cidade-sistema`) a expunha por outro caminho. Dado editável e
     * gravável, sem porta de entrada nenhuma.
     */
    key: 'subbacia-cts', icone: ArrowsLeftRight, titulo: 'Pareamento sub-bacia · CTS', bloco: 'Coletor de tempo seco (CTS)',
    /**
     * CONTINUA FORA DA NAVEGAÇÃO AQUI, e o motivo é o backend, não a tela.
     *
     * O comentário acima descreve o backend do SES, que grava
     * `input.subbacia_cts` por `sincronizar_input.py`. O backend do Otimizador
     * NÃO serve nem aceita esta aba: `lib/cadastroApi.ts` a lista em
     * `ABAS_SEM_ESCRITA` e a devolve vazia, porque não há rota de leitura nem
     * de escrita para ela.
     *
     * Sem a flag, a aba aparece no menu, abre vazia, oferece "Adicionar linha"
     * e descarta o que for digitado ao salvar — as três coisas em silêncio.
     * Uma aba ausente é menos danosa que uma que finge.
     *
     * Para religar: basta o backend ganhar leitura e escrita de
     * `input.subbacia_cts` e a aba sair de `ABAS_SEM_ESCRITA`.
     */
    ocultaNoWizard: true,
    // Só tem `sub_bacia_id` e `cts_id`: o sistema vem do join. Cidade sai por
    // ser terceiro grau — sub-bacia → sistema → cidade.
    escopo: { sistema: 'via-subbacia' },
    desc: 'O Coletor de Tempo Seco (CTS) capta o esgoto que escoa em dias sem chuva e o leva até a ETE — é a "irmã" da sub-bacia, pareada 1:1 e opcional. Aqui é o de-para entre a sub-bacia e o CTS que a atende: os dois lados são reais, mas o pareamento entre eles é exemplo — nenhuma fonte diz qual CTS atende qual sub-bacia.',
    // `cts_name` acrescentado: a coluna só tinha o id, e o id de CTS na base é
    // um código como "292_SEDEITABORAI" — sem o nome ao lado não há como
    // conferir se o pareamento está certo.
    /**
     * A ABA ERA INTOCÁVEL ATÉ 20/08/2026, e isso era defeito, não decisão.
     *
     * As quatro colunas eram 'db' e não havia "Adicionar linha": uma tela de
     * cadastro em que nada podia ser cadastrado. E o pareamento é o propósito
     * INTEIRO dela — a própria `desc` diz que ele é exemplo, que nenhuma fonte
     * diz qual CTS atende qual sub-bacia. Se não vem de fonte e a unidade não
     * pode informar, a informação não existe em lugar nenhum.
     *
     * Então os dois CÓDIGOS viraram 'un', como lista suspensa das entidades que
     * existem (ver `opcoesDaCelula`) — nunca texto livre, porque um id digitado
     * errado quebra a FK que `validarCadastro` já confere. Os dois NOMES ficam
     * 'db': eles são espelho do código escolhido ao lado (`espelharColunas`), e
     * 'db' é o que produz na tela o efeito certo — célula travada.
     */
    addRow: true,
    novo: () => ({ sub_bacia_id: '', sub_bacia_name: '', cts_id: '', cts_name: '' }),
    cols: [
      // ids gerados dos dois lados; o código real da CTS vive em `cts_name`
      { coluna: 'sub_bacia_id', origem: 'un', procedencia: 'mock', oque: 'Sub-bacia deste par. Escolha na lista — são todas as sub-bacias do cadastro.', porque: 'O pareamento não vem de fonte nenhuma: é o que a unidade informa. Sem ele, o CTS não entra em caminho nenhum até a ETE.', exemplo: 'b001' }, { coluna: 'sub_bacia_name', origem: 'db', procedencia: 'subbacias', oque: 'Nome da sub-bacia deste par. Preenchido junto com o código ao lado.', exemplo: 'Canal do Cunha' },
      { coluna: 'cts_id', origem: 'un', procedencia: 'mock', oque: 'Coletor de Tempo Seco (CTS) que atende esta sub-bacia — infraestrutura que capta e desvia o esgoto de tempo seco de um curso d’água para a rede de esgotamento. Escolha na lista.', porque: 'Pareamento 1:1 e opcional, e nenhuma fonte o traz. É a unidade que sabe qual coletor atende qual sub-bacia.', exemplo: 't001' }, { coluna: 'cts_name', origem: 'db', procedencia: 'cts', oque: 'Nome/código real do CTS na base comercial. Preenchido junto com o código ao lado.', exemplo: '292_SEDEITABORAI' },
    ],
  },
  {
    key: 'cts-operacional', icone: Drop, titulo: 'Dados da CTS',
    // A aba com o join mais curto dos dois eixos: tem `sistema_id`,
    // `sistema_name` e `emp_codigo` na própria linha.
    escopo: { cidade: 'via-sistema', sistema: 'coluna' },
    desc: 'Mesmos parâmetros da sub-bacia (preço, prazos, vazão, população), aplicados ao CTS.',
    addRow: true,
    novo: () => ({ cts_id: '', cts_name: '', sistema_id: '', sistema_name: '' }),
    // EMP_CODIGO/EMPRESA entram aqui com mais razão que nas outras abas: é a
    // coluna do próprio CSV de CTS que permitiu recortar a base por unidade.
    cols: [
      { coluna: 'emp_codigo', origem: 'db', procedencia: 'depara', oque: 'Código real da empresa operadora — é ele que recorta as CTS por unidade.', exemplo: '57' }, { coluna: 'empresa', origem: 'db', procedencia: 'depara', oque: 'Nome da empresa operadora responsável por este CTS.', exemplo: 'Águas do Rio 04' },
      // id gerado ('t001'), nome com o código real do CSV
      { coluna: 'cts_id', origem: 'un', procedencia: 'mock', oque: 'Identifica este Coletor de Tempo Seco (CTS) dentro do cadastro.', exemplo: 't001' }, { coluna: 'cts_name', origem: 'un', procedencia: 'cts', oque: 'Nome/código real do CTS na base comercial.', exemplo: '292_SEDEITABORAI' },
      /**
       * SISTEMA DA CTS — DERIVADO DO DESTINO NO FLUXO (item 21, 07/08/2026).
       *
       * As duas colunas eram 'db'/'vazio' e apareciam em branco em toda linha,
       * com o aviso da aba dizendo que era "integração pendente". Não era: a
       * integração nunca vai trazer isso. Wagner, 34:37: *"não existe, na CTS, um
       * vínculo que diga em qual sistema de sub-bacias essa CTS está. Não existe
       * essa informação em nenhum lugar."*
       *
       * A regra que ele mesmo deu (32:12): *"a partir do momento em que essa CTS é
       * vinculada a uma ETE ou a uma sub-bacia, o campo de sistema da CTS vira o
       * sistema da ETE ou da sub-bacia que ela está vinculada. Então não precisa o
       * cara preencher isso."* Luan fechou (32:44): *"quando a pessoa selecionar a
       * sub-bacia de destino ou a ETE de destino, automaticamente o sistema
       * daquela ETE de destino é o sistema que a CTS pertence."*
       *
       * Daí 'calc'/'regra': o vínculo JÁ ESTÁ no Fluxo de escoamento, e pedi-lo de
       * novo em campo próprio só abriria espaço para as duas informações
       * discordarem — com a tela sem como dizer qual das duas está certa. A conta
       * vive em `sistemaDaCts`, em `cadastroFluxo.ts`.
       *
       * Enquanto a CTS não tiver destino no fluxo, as duas mostram '—'. Isso é
       * informação, não lacuna: a mesma CTS aparece na validação de topologia como
       * "origem sem destino", que é o problema de verdade.
       */
      { coluna: 'sistema_id', origem: 'calc', procedencia: 'regra', oque: 'Sistema de esgotamento sanitário a que este CTS pertence. Não se digita: é o sistema do nó para onde a CTS deságua, lido do Fluxo de escoamento.', porque: 'Nenhuma fonte liga CTS a sistema de sub-bacias — o vínculo só existe pelo destino. Derivar evita que o mesmo fato fique gravado em dois lugares que podem discordar.' }, { coluna: 'sistema_name', origem: 'calc', procedencia: 'regra', oque: 'Nome do sistema de esgotamento sanitário, derivado do destino da CTS no Fluxo de escoamento.' },
      ...colsOperacionalComercial('cts'),
    ],
  },
  {
    key: 'componentes-cts-capex', icone: Wrench, titulo: 'CAPEX da CTS',
    // 5 linhas por CTS, e nenhuma coluna de hierarquia além de `cts_id`.
    escopo: { sistema: 'via-cts' },
    // Mesmo formato da aba irmã (item 29 do pedido de 05/08/2026): os
    // componentes nomeados primeiro, a regra do CAPEX depois, e só então a
    // ressalva de procedência. A diferença entre as duas listas — 5 e 4 — é o que
    // explica a CTS, e por isso a ausência da Ligação está dita, não implícita.
    desc: 'Os 4 componentes de obra de cada CTS: Coletor de tempo seco, Coletor Tronco, EEE e Linha de recalque — a Ligação não entra, porque quem liga o cliente é a sub-bacia pareada. O CAPEX é calculado (quantidade × preço unitário) e a unidade de medida é o padrão do componente. A CTS é real (o código provisório t001 é só o identificador de tela); a obra — quantidade, preço, prazos — é exemplo, nenhuma fonte traz obra.',
    zebraPor: 'cts_id',
    // Mesma ordem da aba irmã (CAPEX de componentes de sub-bacias):
    // identificação primeiro, componente depois.
    cols: [
      { coluna: 'cts_id', origem: 'un', procedencia: 'mock', oque: 'CTS dono desta obra.', exemplo: 't001' }, { coluna: 'cts_name', origem: 'un', procedencia: 'cts', oque: 'Nome/código real do CTS dono desta obra.' }, { coluna: 'componente', origem: 'un', procedencia: 'regra', oque: 'Tipo do componente de obra do CTS.', porque: 'Cada tipo tem sua própria unidade de medida padrão (ver coluna Unidade).' },
      // mesma regra da aba irmã: a unidade é o padrão do componente, não escolha
      { coluna: 'quantidade', origem: 'un', procedencia: 'vazio', oque: 'Quanto será construído do componente.', porque: 'CAPEX = quantidade × preço unitário.' }, { coluna: 'unidade', origem: 'calc', procedencia: 'regra', oque: 'Unidade de medida da quantidade, fixa por tipo de componente.' }, { coluna: 'preco_unitario', origem: 'un', procedencia: 'vazio', oque: 'Preço de mercado de uma unidade do componente.', porque: 'CAPEX = quantidade × preço unitário.' },
      { coluna: 'capex', origem: 'calc', procedencia: 'vazio', oque: 'Investimento total do componente.', porque: 'Calculado automaticamente como quantidade × preço unitário.' }, { coluna: 'opex', origem: 'un', procedencia: 'vazio', oque: 'Custo de operar a obra, por ano, depois de pronta. Informe o valor MÁXIMO (todas as ligações faturando).', porque: 'Obra ociosa não gera OPEX; a operação sobe de forma côncava até o máximo no tempo de rampa.' },
      { coluna: 'tempo_predecessoras', origem: 'un', procedencia: 'vazio', oque: 'Espera entre as obras que vêm antes ficarem prontas e esta poder começar.', porque: 'A simulação escolhe o ano de cada obra, mas respeita a ordem física. 0 = pode começar junto.' }, { coluna: 'tempo_execucao', origem: 'un', procedencia: 'vazio', oque: 'Quanto dura a construção desta obra, do início à entrega.', porque: 'Define quando a obra passa a atender e a gerar receita.' },

      /*
       * A JANELA DA OBRA — as mesmas duas da aba irmã de sub-bacia.
       *
       * A obra de CTS usa o MESMO contrato de obra: o backend cobra os dois
       * campos na mesma lista (`_OBRA`, em `pendencias.py`), e o de/para da
       * ponte (`OBRA`, em `lib/cadastroApi.ts`) é um só para as duas. Sem elas
       * aqui, a restrição vale na simulação e não há onde dizer "esta CTS é
       * obrigatória em 2027".
       */
      { coluna: 'obra_obrigatoria_ano', origem: 'un', procedencia: 'vazio', oque: 'Ano em que esta obra TEM de acontecer, por exigência contratual ou regulatória.', porque: 'O motor a força nesse ano, mesmo que o retorno não justifique. Vazio = sem exigência.', exemplo: '2027' },
      { coluna: 'obra_proibida_ate', origem: 'un', procedencia: 'vazio', oque: 'Ano até o qual esta obra NÃO pode começar.', porque: 'Impede o plano de agendar antes de uma licença, desapropriação ou obra de terceiro. Vazio = sem impedimento.', exemplo: '2029' },
      { coluna: 'wacc', origem: 'un', procedencia: 'vazio', oque: 'Custo de capital do componente, quando há financiamento nominalmente atrelado.', porque: 'Desconta CAPEX e OPEX da obra. Vazio = usa o WACC médio da unidade.' },
    ],
  },
]
