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
 * `obra_proibida_ate`) NÃO ficam nas abas de CAPEX: não são cadastro, são
 * premissa de rodada, e são informadas na tela de simulação. Rótulo, largura e
 * o controle `JanelaObraInput` ficam aqui de propósito, para serem
 * reaproveitados lá.
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
 * Recebe a lista como parâmetro, e não de uma constante global: as cidades são
 * REAIS e variam por unidade (de-para regional·empresa·cidade). Uma lista fixa
 * no módulo ofereceria as mesmas cidades para qualquer unidade selecionada.
 */
export const nomeCidade = (cidades: Cidade[], id: string): string =>
  cidades.find((c) => c.id === id)?.name ?? ''

/**
 * As cidades REAIS da unidade, derivadas do próprio cadastro carregado — e não
 * de um mapa compilado à parte.
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
 * A unidade de medida não é escolha de quem preenche, é propriedade do
 * componente — uma rede sempre se mede em metro, uma EEE sempre em vazão. Como
 * select, a mesma obra chegaria em unidades diferentes de duas unidades
 * operacionais, e quantidade × preço unitário deixaria de ser comparável entre
 * linhas.
 *
 * Por isso a coluna `unidade` das DUAS abas de CAPEX (rede e CTS) tem origem
 * 'calc' e não 'un': é lida daqui a partir de `componente`, e a célula fica
 * travada. Ver `computeCalc`.
 *
 * O mapa é por COMPONENTE, não por aba, e é o que permite as duas abas
 * compartilharem a regra: Coletor Tronco, EEE e Linha de recalque aparecem nas
 * duas, e uma tabela por aba abriria espaço para a mesma obra valer metro de um
 * lado e vazão do outro. 'Coletor de tempo seco' só existe na aba da CTS.
 *
 * É 'COLETOR' de tempo seco, e não 'Coleta': é o que o C de CTS significa.
 *
 * ATENÇÃO ao renomear qualquer componente: o nome é VALOR de dado, não rótulo,
 * e o motor o classifica por SUBSTRING —
 * `otimizador_capex_v62.py`, `_codigo()`: 'tempo seco' → âncora de receita da
 * CTS, 'liga' → ligação, 'rede' → rede, 'tronco' → transporte, 'eee'/'elevat' →
 * transporte, e QUALQUER OUTRA COISA cai no `return` final, Linha de recalque.
 * Os nomes atuais preservam a palavra-chave ('tronco', 'tempo seco'). Um rename
 * que a tirasse (ex.: 'Coletor Tronco' → 'Interceptor') viraria linha de
 * recalque em silêncio.
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
  // `unidade` não está aqui: é valor derivado nas duas abas de CAPEX, as
  // únicas que têm a coluna (ver `UNIDADE_POR_COMPONENTE`). As opções que
  // um select ofereceria ('m', 'ligacao', 'un') nem vocabulário certo têm:
  // 'ligacao' é o nome de um componente, não uma unidade de medida.
  nova: [['Sim', 'Sim'], ['Não', 'Não']],

  /*
   * A RÉGUA DA COBERTURA SAIU DAQUI (migração 019): não é dado de cadastro, é a
   * lente com que se olha o cadastro, e virou parâmetro de rodada — na tela de
   * Simular, valendo para a unidade inteira.
   *
   * O QUE ELA DEIXOU COMO AVISO: o valor gravado era o código (`ligacoes`) e o
   * rótulo era a palavra em português, e mesmo com `<select>` uma cidade da base
   * ficou anos com 'ligações' acentuado gravado no lugar do valor. Onde houver
   * par código/rótulo, é o código que viaja.
   *
   * O texto abaixo era a continuação deste bloco, sobre as colunas de população
   * na sub-bacia e na CTS. Elas continuam existindo; o que mudou é que ninguém
   * mais as EXIGE pelo cadastro, porque a escolha que as exigia mora na rodada.
   * Aqui as duas colunas já apareciam sempre, em
   * `colsOperacionalComercial` — não há nada a mostrar ou esconder; o que muda é
   * a conta de completude, e essa vem pronta do servidor.
   *
   * A receita NÃO segue a régua: é sempre por ligação, em qualquer das três.
   */
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
  wacc_medio: 'WACC médio da unidade',
  ano_base: 'Ano-base do cronograma',
  // O ÚNICO QUE MANTÉM O NOME TÉCNICO, e de propósito. Os vizinhos seguem
  // `<nível>_id` e viram "ID Cidade", "ID Sistema"; a empresa não — a coluna se
  // chama `emp_codigo` no de-para da Aegea, e é por esse nome que quem confere
  // a base a procura. Chamá-la de "ID Empresa" faria procurar por `empresa_id`,
  // que não existe em lugar nenhum.
  emp_codigo: 'emp_codigo',
  empresa: 'Empresa',
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
   * Os rótulos são o par origem→destino, que é o que a tabela descreve (cada
   * linha é uma aresta do fluxo), e evitam a palavra "Nó" — jargão de grafo que
   * ninguém usa na operação.
   *
   * A ASSIMETRIA dos dois rótulos de nome é o conteúdo: origem é sempre
   * sub-bacia ou CTS; destino é sempre sub-bacia ou ETE — o tipo fica escrito no
   * cabeçalho. Os dois rótulos de ID ficam curtos porque a coluna tem 84px (ver
   * `COLS_XS`): o tipo está na coluna de nome ao lado e no tooltip.
   */
  componente_sistema_id: 'ID Origem',
  componente_sistema_nome: 'Sub-bacia/CTS de origem',
  componente_sistema_id_jusante: 'ID Destino',
  componente_sistema_nome_jusante: 'Sub-bacia/ETE de destino',
  data_fim_concessao: 'Fim da concessão',
  sub_bacia_id: 'ID Sub-bacia',
  sub_bacia_name: 'Sub-bacia',
  cts_id: 'ID CTS',
  cts_name: 'CTS',
  // "por NOVA ligação": a taxa é cobrada uma vez, no momento em que o cliente é
  // conectado pela obra — não é recorrente por ligação existente.
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
   * As CINCO colunas do recorte residencial e o ticket precisam de rótulo aqui
   * como qualquer outra: sem entrada neste mapa, `colunaLabel` devolve a própria
   * chave, e `universo_ligacoes_residencial` vira cabeçalho no template de
   * Excel. Na tela isso passa despercebido — as cinco ficam no grupo de colunas
   * de referência da ficha comercial, à direita do que se preenche.
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
   * O rótulo é por COLUNA e não por aba: uma grafia diferente na sub-bacia e na
   * CTS ("da obra" × "de obra") exigiria transformar este mapa em
   * `Record<aba, Record<coluna, string>>` por causa de uma preposição.
   */
  tempo_execucao: 'Tempo de execução da obra',
  tempo_de_execucao: 'Tempo de execução do módulo',
  // Fora do cadastro — são informadas na tela de simulação. Os rótulos ficam
  // aqui porque é lá que são reaproveitados (ver topo do arquivo).
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
  // O RÓTULO é longo de propósito; a CHAVE `capex_terreno` é o que o motor lê
  // para decidir ETE nova vs expansão e o que `CAMPOS_SO_ETE_NOVA` usa para
  // travar a célula — renomeá-la quebraria as duas coisas em silêncio.
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
 * Existe porque rótulo é espaço caro: "Origem (Sub-bacia, ETE, CTS)" cabe no
 * cabeçalho, mas colunas assim lado a lado enchem a tela de parênteses. A
 * informação não se perde, muda de lugar — do cabeçalho para o tooltip.
 *
 * Vale sobretudo para os IDs GERADOS: 'b001' não se explica sozinho, e quem
 * vê o código precisa saber que ele é provisório e não vem do Databricks.
 */
export const COLUNA_AJUDA: Record<string, string> = {
  /**
   * Os quatro verbetes do Fluxo descrevem uma regra ASSIMÉTRICA, e é ela que a
   * lista suspensa aplica: sub-bacia nunca deságua em CTS, e a lista de uma
   * sub-bacia é sempre dentro do próprio sistema.
   */
  componente_sistema_id: 'De onde o esgoto sai nesta linha: uma sub-bacia (b001) ou uma CTS (t001). Escolha na lista — cada origem aparece uma vez só, porque a saída de um nó é sempre uma.',
  componente_sistema_nome: 'Nome da sub-bacia ou da CTS de origem. Preenchido junto com o código ao lado, não se digita.',
  componente_sistema_id_jusante: 'Para onde esta linha deságua. Saindo de uma SUB-BACIA, a lista traz as outras sub-bacias do mesmo sistema e a ETE dele — sub-bacia não deságua em CTS. Saindo de uma CTS, a lista é completa: qualquer sub-bacia, CTS ou ETE, porque esse vínculo não existe em fonte nenhuma.',
  componente_sistema_nome_jusante: 'Nome do destino — o próximo passo do caminho até a estação de tratamento. Preenchido junto com o código ao lado.',
  cidade_id: 'Código provisório da cidade dentro desta unidade (c001, c002…). Gerado pelo site: o de-para não traz código de cidade. Vale só dentro deste cadastro.',
  sistema_id: 'Código provisório do sistema (s01, s02…). Gerado pelo site: nenhuma fonte traz código de sistema — o nome ao lado é que é real.',
  sub_bacia_id: 'Código provisório da sub-bacia (b001, b002…). Gerado pelo site: o CSV só traz o nome. Será substituído pelo código do Databricks.',
  ete_id: 'Código provisório da ETE (e01, e02…). Nenhuma fonte traz ETE: a aba inteira é exemplo.',
  cts_id: 'Código provisório da CTS dentro desta unidade (t001, t002…). Gerado pelo site; o código de CTS_DADOS_COMERCIAIS.csv aparece por extenso na coluna ao lado.',
  emp_codigo: 'Código real da empresa operadora no de-para. É ele que recorta a base comercial de CTS por unidade, e desde a v8 é também o nível entre unidade e cidade.',
  regional_id: 'Código real da regional (R1…R5). O de-para não traz nome descritivo, por isso a coluna ao lado repete o código.',
}

/**
 * Colunas numéricas curtas (largura mínima) — só as que também têm RÓTULO
 * curto. As colunas de prazo (`tempo_*`) NÃO entram: têm valor curto mas rótulo
 * longo ("Tempo para arrecadação", "Tempo de execução da obra"...), e na largura
 * mínima o rótulo corta no meio da palavra ("ARRECAD"/"AÇÃO") — na padrão
 * (128px) cada palavra cabe inteira numa linha.
 */
const COLS_XS = new Set([
  'ano', 'ano_base', 'wacc', 'wacc_medio', 'modulos', 'cobertura_pct', 'paridade', 'quantidade',
  /**
   * Os IDs GERADOS entram aqui porque o valor é código curto ('c001', 's01',
   * 'b001'): na largura padrão sobrariam ~44px de ar por coluna, em abas com
   * 20+ colunas. Os rótulos cabem porque são todos de palavra curta — "ID
   * Sistema", "ID Cidade", "ID Sub-bacia", "ID Origem".
   *
   * DUAS EXCEÇÕES, cada uma por um motivo:
   *
   *   `emp_codigo` — "Empresa" é palavra longa e, sozinha, é mais larga que a
   *     coluna estreita; quebra no meio, o mesmo defeito descrito acima para as
   *     colunas de prazo.
   *   `cidade_id` — nas abas de metas e paridade a célula é um <select>, e o
   *     <select> nativo exibe o rótulo INTEIRO da opção escolhida ('c001 ·
   *     BELFORD ROXO'), não só o valor. Em 84px, descontada a seta do
   *     controle, nem o código caberia. Fica na largura padrão por causa dessas
   *     duas abas; nas outras quatro, onde é campo travado mostrando 'c001',
   *     sobra espaço — é o preço de a largura ser por coluna, não por aba.
   */
  'sistema_id', 'sub_bacia_id', 'cts_id', 'ete_id',
  'componente_sistema_id', 'componente_sistema_id_jusante',
])
/** Colunas de nome/texto ou valores longos (largura maior). */
const COLS_LG = new Set([
  // 'empresa': nomes como "ÁGUAS GUARIROBA S.A." e "NX - ÁGUAS DE NOVO
  // PROGRESSO" não cabem na largura padrão.
  'regional_name', 'empresa', 'cidade_name', 'sistema_name',
  'sub_bacia_name', 'cts_name', 'ete_name',
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
  // A LARGURA ESTREITA É 124, e não menos, por causa das colunas de id: elas são
  // renderizadas em MONO (o código existe para ser comparado caractere a
  // caractere, e em proporcional `l`/`1`/`I` colapsam), e mono é mais largo.
  //
  // A conta tem duas partes, e esquecer a segunda é o erro fácil: o glifo E a
  // caixa. O id mais longo da base tem 10 caracteres (`d1b100_1_1`), que a
  // 12,5px do IBM Plex Mono pedem ~75px; a célula gasta outros ~44px antes do
  // texto (28 de `tbody td` mais 16 do `px-2` do span). 124 cobre os dois com
  // folga.
  //
  // Estreitar aqui não economiza espaço, apaga dado: em 104 um id de nove
  // caracteres (`e1b83_1_1`) já trunca para `e1b83_1…`, e isso só aparece na
  // unidade grande.
  if (COLS_XS.has(col)) return 124
  if (COLS_LG.has(col)) return 168
  return 128
}

/** Largura da coluna de ações (a lixeira), quando a aba permite remover linha. */
export const LARGURA_ACOES = 44

/**
 * A LARGURA DA TABELA de uma aba, em pixels — a soma das colunas mais a de ações.
 *
 * `temAcoes` é PARÂMETRO, e não deduzido de `aba.addRow`, porque ter ação por
 * linha não implica criar linha: a aba do Fluxo não cria e mesmo assim tem uma
 * (tirar a CTS do sistema). Deduzindo, a conta fica 44px curta justamente nela,
 * e o botão nasce fora da área visível — só alcançável com rolagem lateral.
 *
 * Mora aqui, e não dentro do `AbaGrid`, porque dois lugares precisam do MESMO
 * número: o `AbaGrid` para o `colgroup` e a barra de rolagem espelhada, e o
 * `CadastroWizard` para dimensionar a coluna esquerda do layout de duas colunas
 * na aba do Fluxo. Calculado em dois lugares, discorda de si mesmo na primeira
 * coluna nova.
 */
export const larguraDaGrade = (aba: AbaDef, temAcoes = !!aba.addRow): number =>
  aba.cols.reduce((s, c) => s + colunaLargura(c.coluna), 0) + (temAcoes ? LARGURA_ACOES : 0)

/**
 * COLUNAS ADITIVAS — aquelas cuja SOMA no rodapé da grade quer dizer algo.
 *
 * ⚠️ ESTA LISTA É UMA CLASSIFICAÇÃO DE ENGENHARIA, e não uma regra vinda do
 * cliente. Precisa de confirmação antes de a soma aparecer numa demonstração;
 * os dois grupos duvidosos estão marcados em (1) e (2) abaixo.
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
 * SUB_BACIAS_DADOS_COMERCIAIS.csv, a de CTS de CTS_DADOS_COMERCIAIS.csv. Uma
 * constante única faria o rastreio de procedência mentir em uma das duas.
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
   * As quatro APARECEM na grade de propósito. Escondê-las não as apaga: a ficha
   * chega do servidor com elas e a gravação as preserva por baixo
   * (`ultimaLeitura`, em `lib/cadastroApi.ts`) — o efeito seria um dado que
   * existe, decide a meta, e ninguém consegue conferir nem corrigir.
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
  { coluna: 'universo_economias_residencial', origem: 'db', procedencia: csv, oque: 'Quantas do universo de economias são residenciais.', porque: 'Denominador da meta quando a rodada mede cobertura em economias e pede só residencial.' },
  { coluna: 'economias_atuais_residencial', origem: 'db', procedencia: csv, oque: 'Quantas das economias já atendidas são residenciais.', porque: 'Numerador de partida da meta no recorte residencial por economias.' },
  // população não existe em nenhum CSV
  { coluna: 'universo_populacao', origem: 'un', procedencia: 'vazio', oque: 'Toda a população da área da sub-bacia, atendida ou não por esgoto.', porque: 'É o denominador da meta quando a rodada mede cobertura por população. Sem ele não dá para verificar o percentual contratado.', exemplo: '1.267' , opcional: 'só quando a rodada mede cobertura por população'},
  { coluna: 'populacao_atual', origem: 'un', procedencia: 'vazio', oque: 'População que já tem coleta de esgoto, antes das obras deste plano.', porque: 'É o numerador de partida da meta. A diferença para o universo é a população que as obras precisam atender.', exemplo: '406' , opcional: 'só quando a rodada mede cobertura por população'},
  { coluna: 'populacao_novas_obras', origem: 'calc', procedencia: 'vazio', oque: 'Calculado: universo − atendida hoje.', porque: 'É a população que as obras deste plano passam a atender. O valor gravado nesta coluna é ignorado — o motor sempre recalcula.' },
  { coluna: 'potencial_crescimento', origem: 'un', procedencia: 'vazio', oque: 'Multiplicador do universo de ligações da sub-bacia. 1,0 = sem crescimento; 1,5 = universo 50% maior.', porque: 'Amplia SÓ o denominador da meta de cobertura.', exemplo: '1,0' },
]

export const SCHEMA: AbaDef[] = [
  // --------------------------------------------------------------- Organização
  {
    /**
     * ANO-BASE — fora da tela e AUTOMÁTICO.
     *
     * `ano_base` é 'calc' e não 'un': o ano da análise é sempre o ano em que ela
     * é feita, então `computeCalc` devolve o ano corrente e não há o que digitar.
     *
     * A linha existe porque o motor lê `regional_operacional.ano_base` como o ano
     * 0 do cronograma. O valor definitivo da rodada é pedido na tela de simulação,
     * junto do orçamento — mesmo destino de `obra_obrigatoria_ano` /
     * `obra_proibida_ate` (ver topo deste arquivo).
     */
    key: 'regional-operacional', icone: CalendarBlank, titulo: 'Ano-base', bloco: 'Organização',
    ocultaNoWizard: true,
    desc: 'Ano em que o cronograma da análise começa a contar. Automático: é o ano corrente, e a rodada pode sobrescrevê-lo na tela de simulação.',
    cols: [
      { coluna: 'regional_id', origem: 'db', procedencia: 'depara', oque: 'Código da regional a que esta unidade pertence (R1 a R5).', exemplo: 'R4' },
      { coluna: 'ano_base', origem: 'calc', procedencia: 'regra', oque: 'Ano-calendário em que o cronograma de obras e receitas desta unidade começa a contar. Automático: o ano corrente.', porque: 'É o ano 0 da linha do tempo usada para posicionar os prazos das obras e descontar os fluxos de caixa. Não é digitado: o ano da análise é sempre o ano em que ela é feita.', exemplo: '2026' },
    ],
  },

  // -------------------------------------------------------------- Estrutura
  {
    key: 'unidade-regional', icone: TreeView, titulo: 'Unidade e regional',
    // A descrição NÃO menciona o WACC: ele tem cartão próprio acima da tabela,
    // com a explicação inteira. Repetir a regra da herança aqui, a 3cm de
    // distância do cartão, é a poluição que o cartão evita.
    desc: 'Topo da hierarquia da unidade: regional, diretoria e unidade, como vêm do de-para oficial da Aegea.',
    cols: [
      { coluna: 'regional_id', origem: 'db', procedencia: 'depara', oque: 'Código da regional a que esta unidade pertence (R1 a R5), vindo do de-para oficial Regional × Empresa × Cidade.', exemplo: 'R4' },
      // o de-para só traz o CÓDIGO da regional (R1…R5), não um nome descritivo:
      // esta coluna repete o código em vez de inventar um nome
      { coluna: 'regional_name', origem: 'db', procedencia: 'depara', oque: 'Nome da regional. Hoje repete o próprio código (R1…R5) porque a fonte de dados não traz um nome descritivo — pendência a confirmar com a Aegea.', exemplo: 'R4' },
      // A DIRETORIA É O NÍVEL ENTRE A REGIONAL E A UNIDADE, e as colunas ficam
      // NESTA ORDEM porque a grade é lida da esquerda para a direita: fora de
      // ordem, a tabela desenharia uma hierarquia que não é a da empresa.
      //
      // A hierarquia inteira é regional → diretoria → unidade → empresa →
      // cidade → sistema. Os três primeiros níveis estão nesta aba; os outros
      // três têm abas próprias.
      { coluna: 'diretoria_id', origem: 'db', procedencia: 'depara', oque: 'Código da diretoria a que esta unidade pertence, dentro da regional.', exemplo: 'dir-57' },
      { coluna: 'diretoria_name', origem: 'db', procedencia: 'depara', oque: 'Nome da diretoria — o nível entre a regional e a unidade (coluna DIRETORIA do extrato de portfólio).', exemplo: 'Águas do Rio' },
      { coluna: 'unidade_id', origem: 'db', procedencia: 'depara', oque: 'Código da empresa operadora (EMP_CODIGO) que identifica esta unidade no de-para da Aegea.', exemplo: '57' }, { coluna: 'unidade_name', origem: 'db', procedencia: 'depara', oque: 'Nome da empresa operadora responsável por esta unidade.', exemplo: 'Águas do Rio 04' },
      { coluna: 'wacc_medio', origem: 'un', procedencia: 'mock', oque: 'Custo médio de capital (WACC) da unidade como um todo — preenchido por Operações Financeiras.', porque: 'Toda obra de CAPEX que não tiver um WACC próprio preenchido herda este valor no cálculo do retorno — nenhuma obra fica sem taxa de desconto.', exemplo: '0,0945' },
      // As DUAS colunas que a Regional preenche nesta aba, e as duas que voltam
      // para o banco pela mesma rota (`PUT /unidades/{id}`). O resto da aba é de
      // leitura: nomes de regional e unidade vêm do Databricks.
      //
      // Cada uma tem cartão próprio acima da grade, e por isso as duas são
      // TIRADAS dela (ver `abaGrade` no wizard): o cartão e a célula escrevem na
      // mesma posição, e os dois visíveis seriam dois controles para o mesmo dado.
      {
        coluna: 'usa_macrorregiao_cts', origem: 'un', procedencia: 'vazio',
        oque: 'Marcado: a unidade usa macrorregião de CTS, e cada sistema dela aceita UMA CTS. Desmarcado: aceitam várias.',
        porque: 'Define quantos coletores de tempo seco os sistemas desta unidade comportam. O servidor recusa adicionar a segunda CTS a um sistema quando a unidade está marcada, e recusa marcar a unidade se algum sistema já tiver duas.',
        exemplo: 'Nao',
      },
    ],
  },
  {
    // ABA VISÍVEL, e não `ocultaNoWizard` como as três seguintes: é aqui que se
    // informa o FIM DA CONCESSÃO, e ele não tem outro lugar na navegação.
    //
    // Não declara `bloco`: pertence ao bloco 01, aberto pela aba do Ano-base.
    key: 'empresa', icone: GitFork, titulo: 'Empresas',
    desc: 'Liga unidade → empresa. A EMPRESA OPERADORA é o nível entre a unidade e a cidade, vem do de-para oficial e é quem assina a concessão.',
    cols: [
      { coluna: 'unidade_id', origem: 'db', procedencia: 'depara', oque: 'Código da unidade a que esta empresa pertence.', exemplo: '57' },
      { coluna: 'emp_codigo', origem: 'db', procedencia: 'depara', oque: 'Código real da empresa operadora no de-para da Aegea. É a chave da empresa, e o nível entre unidade e cidade.', exemplo: '57' },
      { coluna: 'empresa', origem: 'db', procedencia: 'depara', oque: 'Nome da empresa operadora.', exemplo: 'Águas do Rio 04' },
      { coluna: 'data_fim_concessao', origem: 'un', procedencia: 'vazio', oque: 'Ano-calendário do fim da concessão desta empresa.', porque: 'Define até quando a receita entra no VPL — depois disso, nada é contado. Quem assina a concessão é a operadora, então o ano informado aqui vale para TODOS os municípios dela: o banco o propaga.', exemplo: '2045' },
    ],
  },
  // A ORDEM DAS ABAS sai da ordem deste array, e desce a hierarquia: regional →
  // unidade → empresa → cidade → sistema → sub-bacia → CTS. Mexer na ordem aqui
  // muda a navegação do wizard.
  {
    /**
     * FORA DA TELA (`ocultaNoWizard`): não há nada a preencher — as quatro
     * colunas vêm do de-para.
     *
     * O DADO FICA, e é usado em dois lugares visíveis: a validação "cidade sem
     * faixa de paridade" e o elo empresa → cidade. A lista do <select> de cidade
     * das abas de metas e paridade NÃO vem daqui (vem do de-para, via
     * `UnidadeState.cidades`), então esconder a aba não a afeta.
     */
    key: 'cidade-empresa', icone: MapPinLine, titulo: 'Cidades atendidas',
    ocultaNoWizard: true,
    desc: 'Liga empresa → cidade. Uma linha por par empresa/cidade, tudo vindo do de-para oficial.',
    cols: [
      { coluna: 'emp_codigo', origem: 'db', procedencia: 'depara', oque: 'Código real da empresa operadora no de-para da Aegea.', exemplo: '57' }, { coluna: 'empresa', origem: 'db', procedencia: 'depara', oque: 'Nome da empresa operadora responsável por esta cidade.', exemplo: 'Águas do Rio 04' },
      // o id é gerado ('c001'); o NOME é que vem do de-para
      { coluna: 'cidade_id', origem: 'db', procedencia: 'mock', oque: 'Identifica esta cidade dentro do cadastro. Código gerado pelo site (o de-para não traz id de cidade).', exemplo: 'c001' }, { coluna: 'cidade_name', origem: 'db', procedencia: 'depara', oque: 'Nome da cidade atendida por esta unidade, vindo do de-para oficial da Aegea.', exemplo: 'Belford Roxo' },
    ],
  },
  // ----------------------------------------------------------------- Município
  {
    key: 'cidade-operacional', icone: Buildings, titulo: 'Municípios', bloco: 'Município',
    /**
     * FORA DA TELA (`ocultaNoWizard`): as 4 colunas são 'db', não há o que
     * preencher.
     *
     * A aba se chamava RÉGUA DE COBERTURA e existia para um campo só —
     * `unidade_cobertura`. Ele virou parâmetro de rodada e a aba ficou sem nada
     * que a unidade informe: emp_codigo, empresa, cidade_id e cidade_name já
     * aparecem em Organização e em Empresas.
     *
     * A ABA NÃO É APAGADA porque o DADO continua servindo: `cidade-operacional`
     * é onde a tela do Fluxo acha o NOME da cidade de um sistema, e é por ele
     * que o seletor de CTS diz de qual município a lista é.
     *
     * `escopo` e `replicarPor` saíram junto: os dois existiam para a régua —
     * recortar por cidade e replicar a escolha dentro da operadora. Sem campo
     * editável, replicar o quê?
     */
    ocultaNoWizard: true,
    desc: 'Os municípios da unidade, como vêm do de-para oficial da Aegea. A régua da cobertura saiu daqui: virou parâmetro da simulação, em Simular ▸ Cobertura medida em. O fim da concessão é da empresa, em Organização ▸ Empresas.',
    cols: [
      { coluna: 'emp_codigo', origem: 'db', procedencia: 'depara', oque: 'Código real da empresa operadora responsável por esta cidade.', exemplo: '57' }, { coluna: 'empresa', origem: 'db', procedencia: 'depara', oque: 'Nome da empresa operadora responsável por esta cidade.', exemplo: 'Águas do Rio 04' },
      { coluna: 'cidade_id', origem: 'db', procedencia: 'mock', oque: 'Identifica esta cidade dentro do cadastro.', exemplo: 'c001' }, { coluna: 'cidade_name', origem: 'db', procedencia: 'depara', oque: 'Nome da cidade.', exemplo: 'Belford Roxo' },
      // `unidade_cobertura` SAIU DAQUI. A régua da cobertura não é dado de
      // cadastro: é a lente com que se olha o cadastro, e trocá-la não corrige
      // informação nenhuma. Virou parâmetro de rodada (`UNIDADE_COBERTURA`), na
      // tela de Simular, valendo para a unidade inteira.
    ],
  },
  {
    key: 'metas-cobertura', icone: ChartLineUp, titulo: 'Metas de cobertura',
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
     * A DESCRIÇÃO EXPLICA A FAIXA ZERO em palavras, e não pela regra: "uma faixa
     * (cobertura 0) já vale como paridade constante" é correto e ilegível para
     * quem não já sabe a regra. A criação automática está em `garantirFaixaZero`.
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

  // ------------------------------------------------------------------- Sistema
  {
    /**
     * FORA DA TELA (`ocultaNoWizard`): as 5 colunas são 'db', não há o que
     * preencher — mas o dado é o mais requisitado das quatro abas ocultas.
     *
     * A tabela é a fonte de DUAS coisas que aparecem na tela: o nome de cada
     * sistema, e o filtro por sistema da lista de destino do Fluxo de escoamento
     * (a sub-bacia só deságua em sub-bacia do mesmo sistema). Esconder é seguro;
     * apagar quebra o Fluxo.
     */
    key: 'cidade-sistema', icone: FlowArrow, titulo: 'Sistemas de esgoto', bloco: 'Sistema',
    ocultaNoWizard: true,
    desc: 'Liga sistema → cidade — o universo que a otimização analisa. O primeiro sistema é real (o da amostra do Fluxo de escoamento, sem cidade porque nenhuma fonte diz qual ele atende); os demais são exemplo, e sustentam a aba de CAPEX das ETEs.',
    cols: [
      { coluna: 'emp_codigo', origem: 'db', procedencia: 'depara', oque: 'Código real da empresa operadora no de-para da Aegea — é ele que recorta os dados comerciais (sub-bacias, CTS) por unidade.', exemplo: '57' }, { coluna: 'empresa', origem: 'db', procedencia: 'depara', oque: 'Nome da empresa operadora responsável por este sistema.', exemplo: 'Águas do Rio 04' },
      // O ID é código gerado em TODAS as linhas — 'mock', e não 'misto': uma
      // coluna em que o sistema real traz o próprio nome ('Alegria') e os de
      // exemplo trazem s1/s2/s3 mistura duas coisas. O NOME é que é misto, e é
      // onde a diferença entre real e exemplo deve aparecer.
      { coluna: 'sistema_id', origem: 'db', procedencia: 'mock', oque: 'Identifica um sistema de esgotamento sanitário — o conjunto de sub-bacias que escoam até a mesma ETE.', exemplo: 's01' }, { coluna: 'sistema_name', origem: 'db', procedencia: 'misto', oque: 'Nome do sistema de esgotamento sanitário.', exemplo: 'Alegria' },
      // vazia na linha real, cidade do de-para nas de exemplo
      { coluna: 'cidade_id', origem: 'db', procedencia: 'mock', oque: 'Identifica a cidade atendida por este sistema, dentro do de-para oficial da Aegea.', exemplo: '57-BELFORD_ROXO' },
      // `usa_sistema_cts` SAIU DAQUI. A decisão de usar MACRORREGIÃO DE CTS é da
      // UNIDADE, não de cada sistema: quem opera decide uma vez e vale para
      // todos. A coluna mora em `unidade-regional` (`usa_macrorregiao_cts`), e a
      // caixa fica logo abaixo do cartão do WACC — ver lá.
    ],
  },
  {
    key: 'ete-capex', icone: Factory, titulo: 'CAPEX das ETEs',
    // Só sistema: a ETE declara `sistema_id`. Cidade seria derivação de segundo
    // grau para uma lista curta — controle sem retorno.
    escopo: { sistema: 'coluna' },
    desc: 'Módulos, custos, terreno e prazos das estações de tratamento. A capacidade ociosa é calculada automaticamente. Nenhuma fonte traz ETE: a aba inteira é exemplo.',
    cols: [
      /**
       * `ete_name` é 'un', e não 'db', pelo mesmo motivo de `sistema_id` abaixo:
       * nenhuma fonte traz ETE — a aba inteira é exemplo, e o nome que vem
       * preenchido ('ETE Alegria') é montado pelo `seed`. Travado, seria um nome
       * inventado que ninguém pode corrigir.
       *
       * `ete_id` FICA travado: é identidade gerada pelo cadastro, e é a chave que
       * o Fluxo referencia como destino. Editável, permitiria renomear um código
       * já apontado por linhas de escoamento.
       */
      { coluna: 'ete_id', origem: 'db', procedencia: 'mock', oque: 'Identifica a Estação de Tratamento de Esgoto (ETE) que recebe a vazão dos sistemas conectados a ela.', exemplo: 'e01' }, { coluna: 'ete_name', origem: 'un', procedencia: 'mock', oque: 'Nome da ETE.', porque: 'Nenhuma fonte traz estação de tratamento: o nome que vem preenchido é exemplo, e é a unidade que informa o real.' },
      /**
       * O SISTEMA QUE A ETE ATENDE — o vínculo que fecha a cadeia do Fluxo.
       *
       * A regra do destino filtrado é "as outras sub-bacias daquele sistema E a
       * ETE dele". Sem esta coluna não há como saber qual é a ETE "dele", e a
       * lista de destinos de uma sub-bacia sai sem estação — sem o único destino
       * que fecha o caminho. Quem a lê: `opcoesDestino`, para oferecer a ETE
       * certa, e `unifilarDoSistema`, para fechar o desenho na estação.
       *
       * É 'un' e não 'db' porque nenhuma fonte traz ETE ('mock': a aba inteira é
       * exemplo) — travada, ninguém conseguiria informar o vínculo. Quando o
       * Databricks trouxer ETE, vira 'db' e mais nada muda.
       *
       * É LISTA SUSPENSA dos sistemas do cadastro (ver `opcoesDaCelula`), não
       * texto livre: um código de sistema digitado errado some da lista de
       * destinos sem acusar erro nenhum.
       */
      { coluna: 'sistema_id', origem: 'un', procedencia: 'mock', oque: 'Sistema de esgotamento sanitário que esta ETE atende. Escolha na lista.', porque: 'É o que permite ao Fluxo de escoamento oferecer a ETE certa como destino das sub-bacias daquele sistema — e é o sistema que uma CTS herda quando deságua nesta estação.', exemplo: 's01' },
      { coluna: 'capacidade_por_modulo', origem: 'un', procedencia: 'mock', oque: 'Vazão que cada módulo da ETE trata.', porque: 'Define quantos módulos são necessários para a vazão conectada.', exemplo: '49' },
      { coluna: 'capex_por_modulo', origem: 'un', procedencia: 'mock', oque: 'Investimento de um módulo — o custo da expansão.' },
      { coluna: 'opex_por_modulo', origem: 'un', procedencia: 'mock', oque: 'Custo anual de operar um módulo.' },
      { coluna: 'tempo_predecessoras', origem: 'un', procedencia: 'mock', oque: 'Espera entre as obras que vêm antes ficarem prontas e esta poder começar.', porque: 'É assim que a sequência é montada: a simulação escolhe o ano de cada obra, mas respeita a ordem física. 0 = pode começar junto.', exemplo: '4' },
      { coluna: 'tempo_de_execucao', origem: 'un', procedencia: 'mock', oque: 'Quanto dura a construção de um módulo. Mesma lógica das demais obras.', porque: 'Define quando a obra passa a atender e a gerar receita.', exemplo: '9' },
      /*
       * A JANELA DA OBRA DA ETE — as mesmas duas colunas das outras abas de obra.
       *
       * Ficam AQUI, e não na tela de simulação como nas abas de CAPEX, porque o
       * motor as lê desta tabela (`otimizador_capex_v62.py:1315`): é onde se diz
       * "esta ETE é obrigatória em 2028".
       */
      { coluna: 'obra_obrigatoria_ano', origem: 'un', procedencia: 'vazio', oque: 'Ano em que esta ETE TEM de ficar pronta, por exigência contratual ou regulatória.', porque: 'O motor a força nesse ano, mesmo que o retorno não justifique. Vazio = sem exigência.', exemplo: '2028' },
      { coluna: 'obra_proibida_ate', origem: 'un', procedencia: 'vazio', oque: 'Ano até o qual esta ETE NÃO pode começar.', porque: 'Impede o plano de agendar antes de licença ambiental, desapropriação ou obra de terceiro. Vazio = sem impedimento.', exemplo: '2029' },
      { coluna: 'capacidade_nominal_atual', origem: 'un', procedencia: 'mock', oque: 'Capacidade instalada hoje.', porque: 'Com a vazão de operação, define a folga (capacidade ociosa).' },
      { coluna: 'vazao_de_operacao_atual', origem: 'un', procedencia: 'mock', oque: 'Vazão tratada hoje.' },
      { coluna: 'capacidade_ociosa', origem: 'calc', procedencia: 'mock', oque: 'Folga = capacidade nominal − vazão de operação.', porque: 'Absorve vazão nova sem exigir módulo novo.' },
      { coluna: 'nova', origem: 'un', procedencia: 'mock', oque: 'Indica se esta é uma ETE nova (greenfield) ou uma ETE existente em expansão.', porque: "Só ETE nova tem custo de terreno e número de módulos preenchíveis — os demais campos ficam travados quando a resposta é 'Não'." },
      { coluna: 'capex_terreno', origem: 'un', procedencia: 'mock', oque: 'Custo do terreno da ETE nova.', porque: 'ETE nova é um pacote único: terreno + módulos.', exemplo: '912.405' },
      { coluna: 'modulos', origem: 'un', procedencia: 'mock', oque: 'Número de módulos da ETE nova.', porque: 'Define a capacidade total do pacote (teto de vazão).', exemplo: '4' },
      { coluna: 'wacc', origem: 'un', procedencia: 'mock', oque: 'Custo de capital do componente, quando há financiamento nominalmente atrelado.', porque: 'Desconta CAPEX/OPEX e entra rateado por vazão na taxa da receita das sub-bacias. Vazio = usa o WACC médio da unidade (Operações Financeiras).', exemplo: '0,091' , opcional: 'herda o WACC médio da unidade'},
    ],
  },

  // ------------------------------------------------------------ Metas e fatores
  {
    // Listada no índice da planilha (01 Indice de Abas), sem aba própria no
    // arquivo v8 — ver ponto (1) no comentário do topo do arquivo.
    key: 'sistema-topologia', icone: Graph, titulo: 'Fluxo de escoamento',
    // A aba do print: os dois eixos, e o sistema pelo caminho 'fluxo' porque a
    // linha de CTS chega sem `sistema_id` — ele vem do destino dela.
    escopo: { cidade: 'via-sistema', sistema: 'fluxo' },
    /**
     * A ÚLTIMA FRASE DA DESCRIÇÃO é a que importa: o destino não tem fonte, é a
     * informação mais crítica da base, e errá-lo não produz erro — produz um
     * plano que libera receita sem a obra que a sustenta. Encurtar o texto é
     * possível; tirar essa frase, não.
     */
    desc: 'Para onde cada trecho escoa. Cada linha é uma sub-bacia ou uma CTS de origem, com o destino — outra sub-bacia ou a ETE — escolhido na mesma linha; encadeadas, as linhas formam o caminho até a estação de tratamento. Saindo de uma sub-bacia, a lista de destinos fica no próprio sistema; saindo de uma CTS, ela é completa. Os nomes de sistema e de sub-bacia são reais (amostra de um sistema); os códigos ao lado são provisórios, gerados aqui. O destino não existe em nenhuma fonte: é o que a unidade informa, e é a informação mais crítica da aba — um destino errado libera receita sem a infraestrutura que a sustenta. AO LADO DA TABELA, o mesmo fluxo aparece desenhado: cada caixa é uma sub-bacia, uma CTS ou a ETE, e cada seta é o caminho que o esgoto faz até a estação. Escolha o sistema na barra acima para ver o desenho dele; clicar numa caixa leva o foco para a linha dela aqui.',
    /**
     * SEM "ADICIONAR LINHA", e sem escolher a origem — as duas coisas saíram
     * juntas, e pela mesma razão.
     *
     * Cada linha desta aba É um componente, e todos eles já vêm do servidor:
     * sub-bacias e ETE porque o Databricks diz quais pertencem ao sistema, e as
     * CTS porque a base as traz todas (as ainda não colocadas chegam com o
     * sistema em branco). Não sobra ninguém para uma linha nova apontar — o
     * seletor de origem só ofereceria quem AINDA NÃO é origem, e essa lista é
     * sempre vazia — um dropdown que abre sem nenhuma opção.
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
      // fonte trazem código de sistema ou de sub-bacia. Marcá-los como dado real
      // seria enganoso duas vezes — o código é inventado aqui, e repete o nome.
      /*
       * `sistema_id` e `sistema_name` NÃO SÃO COLUNAS AQUI — e continuam no dado.
       *
       * Esta aba trabalha um sistema por vez: a barra acima diz qual, e toda
       * linha visível é dele. Repetir o mesmo valor em duas colunas, linha após
       * linha, gastava a largura que empurrava a coluna de ações para fora da
       * tela — o botão de tirar a CTS do sistema só aparecia com rolagem
       * lateral.
       *
       * `colunasDoEscopo` já trata as duas como redundantes com a barra: para
       * esta aba (`escopo.sistema === 'fluxo'`) ele tira o funil de filtro delas,
       * porque quem recorta é a barra. Não estarem na tabela é a mesma ideia.
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
       * ORIGEM é 'db' (célula travada): toda linha desta aba já vem do servidor
       * com a origem definida — não há linha nova a preencher. Ver o bloco
       * "SEM ADICIONAR LINHA" acima.
       */
      { coluna: 'componente_sistema_id', origem: 'db', procedencia: 'mock', oque: 'De onde o esgoto sai nesta linha: uma sub-bacia (b001) ou uma CTS (t001). Escolha na lista.', porque: 'Cada origem aparece uma vez só: a saída de um nó é sempre uma, e duas linhas para o mesmo nó fariam o motor manter só a última.', exemplo: 'b001' },
      /**
       * Os dois NOMES são travados, mas não vêm do Databricks: vêm da escolha do
       * código ao lado — `espelharColunas`, em `cadastroFluxo.ts`, escreve os
       * dois na mesma tecla. Ficam 'db' porque é esse o efeito de tela que 'db'
       * produz (célula travada); o `oque` é que diz de onde o valor veio.
       */
      { coluna: 'componente_sistema_nome', origem: 'db', procedencia: 'subbacias', oque: 'Nome da sub-bacia ou da CTS de origem. Preenchido junto com o código ao lado.', exemplo: 'Canal do Cunha' },
      // O destino é um par id + nome, espelhando a origem ao lado: com só o id,
      // quem confere o caminho precisa procurar o código em outra aba para saber
      // o que ele é.
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
      // A API entrega ficha por ficha e tambem manda `t.tipo`; a tela ignora e
      // deriva, porque aqui ela tem o conjunto inteiro carregado.
      { coluna: 'componente_tipo', origem: 'calc', procedencia: 'vazio', oque: 'Natureza do componente: sub-bacia, CTS ou ETE.', porque: 'Derivado da aba em que o componente tem ficha — não é digitado nem gravado. Sem ele a tela não distingue uma CTS ainda não colocada de uma sub-bacia.', exemplo: 'cts' },
      { coluna: 'componente_sistema_id_jusante', origem: 'un', procedencia: 'vazio', oque: 'Para ONDE esta linha escoa. A lista depende da origem: de uma sub-bacia, só as sub-bacias do mesmo sistema e a ETE dele; de uma CTS, qualquer sub-bacia, CTS ou ETE.', porque: 'COLUNA MAIS CRÍTICA DA BASE. Define o caminho até a ETE e quais obras liberam a receita. Um erro aqui libera receita sem infraestrutura.', exemplo: 'e01' , opcional: 'vazio no nó terminal — a ETE não drena para ninguém'},
      { coluna: 'componente_sistema_nome_jusante', origem: 'db', procedencia: 'vazio', oque: 'Nome do destino — o próximo passo do caminho até a estação de tratamento. Preenchido junto com o código ao lado.' },
    ],
  },
  /*
   * NÃO EXISTE ABA SEPARADA PARA O UNIFILAR — o desenho mora dentro da aba do
   * Fluxo, à direita da grade, ligado a ela pelo foco da linha (`Unifilar.tsx`).
   *
   * É de propósito: numa aba própria, conferir seria navegar, e o efeito de
   * escolher um destino só apareceria depois de trocar de aba. Lado a lado, a
   * conferência acontece enquanto se preenche.
   *
   * O desenho lê o cadastro real. Um SVG fixo, com nomes inventados, não serve —
   * ele parece certo justamente quando o dado está errado.
   */

  // --------------------------------------------------------------- Operação
  {
    
key: 'subbacia-operacional', icone: TreeStructure, titulo: 'Sub-bacias', bloco: 'Sub-bacia',
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
    key: 'componentes-subbacias-capex', icone: Wrench, titulo: 'CAPEX de componentes de sub-bacias',
    // 5 linhas por sub-bacia. Sem um terceiro eixo de recorte (sub-bacia): a
    // listra de `zebraPor` já dá a leitura por bloco sem custar controle.
    escopo: { cidade: 'via-sistema', sistema: 'coluna' },
    desc: 'Os 5 componentes de obra de cada sub-bacia real do sistema: Ligação, Rede, Coletor Tronco, EEE e Linha de recalque. O CAPEX é calculado (quantidade × preço unitário) e a unidade de medida é o padrão do componente.',
    // Tabela única, sem accordion: a leitura é de planilha — ver e editar tudo
    // de uma vez, não abrir bloco por bloco.
    zebraPor: 'sub_bacia_id',
    // Componente DEPOIS de sub-bacia: a hierarquia vem primeiro (sistema →
    // sub-bacia) e o componente é o detalhe dentro dela.
    //
    // A aba NÃO é exemplo de ponta a ponta: sistema e sub-bacia são os REAIS do
    // CSV de sub-bacias, os mesmos do Fluxo — daí 'subbacias' e não 'mock' nas
    // quatro primeiras colunas. Inventada é só a OBRA (quantidade, preço, OPEX,
    // prazos, WACC). `componente` é a lista fixa dos 5 do dicionário.
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
       * São as duas únicas restrições de tempo que o motor aceita POR OBRA
       * (`obra_obrigatoria_ano`, `obra_proibida_ate` em `componentes_*_capex`):
       * é aqui que se diz "esta obra é obrigatória em 2027" ou "esta não pode
       * começar antes de 2029".
       */
      { coluna: 'obra_obrigatoria_ano', origem: 'un', procedencia: 'vazio', oque: 'Ano em que esta obra TEM de acontecer, por exigência contratual ou regulatória.', porque: 'O motor a força nesse ano, mesmo que o retorno não justifique. Vazio = sem exigência.', exemplo: '2027' },
      { coluna: 'obra_proibida_ate', origem: 'un', procedencia: 'vazio', oque: 'Ano até o qual esta obra NÃO pode começar.', porque: 'Impede o plano de agendar antes de uma licença, desapropriação ou obra de terceiro. Vazio = sem impedimento.', exemplo: '2029' }, 
      { coluna: 'wacc', origem: 'un', procedencia: 'mock', oque: 'Custo de capital do componente, quando há financiamento nominalmente atrelado.', porque: 'Desconta CAPEX e OPEX da obra. Vazio = usa o WACC médio da unidade (Operações Financeiras).', exemplo: '0,091' , opcional: 'herda o WACC médio da unidade'},
    ],
  },
  // ----------------------------------------------- Coletor de tempo seco (CTS)
  {
    // Listada no índice da planilha, sem aba própria no arquivo v8 — ver
    // ponto (1) no comentário do topo. Só se aplica a unidades com CTS.
    key: 'subbacia-cts', icone: ArrowsLeftRight, titulo: 'Pareamento sub-bacia · CTS', bloco: 'Coletor de tempo seco (CTS)',
    /**
     * FORA DA NAVEGAÇÃO por causa do BACKEND, não da tela.
     *
     * As colunas abaixo são editáveis e a aba tem `addRow` — mas o backend do
     * Otimizador não serve nem aceita esta aba: `lib/cadastroApi.ts` a lista em
     * `ABAS_SEM_ESCRITA` e a devolve vazia, porque não há rota de leitura nem de
     * escrita para `input.subbacia_cts`.
     *
     * Sem a flag, a aba aparece no menu, abre vazia, oferece "Adicionar linha" e
     * descarta o que for digitado ao salvar — as três coisas em silêncio. Uma
     * aba ausente é menos danosa que uma que finge.
     *
     * ATENÇÃO ao par com a flag: uma aba oculta não tem porta de entrada nenhuma
     * (`irParaAba`/`BLOCOS` filtram aba oculta antes de montar destino), então
     * dado editável + aba oculta = dado inalcançável. Para religar: o backend
     * ganha as duas rotas, e a aba sai de `ABAS_SEM_ESCRITA` E daqui, juntas.
     */
    ocultaNoWizard: true,
    // Só tem `sub_bacia_id` e `cts_id`: o sistema vem do join. Cidade sai por
    // ser terceiro grau — sub-bacia → sistema → cidade.
    escopo: { sistema: 'via-subbacia' },
    desc: 'O Coletor de Tempo Seco (CTS) capta o esgoto que escoa em dias sem chuva e o leva até a ETE — é a "irmã" da sub-bacia, pareada 1:1 e opcional. Aqui é o de-para entre a sub-bacia e o CTS que a atende: os dois lados são reais, mas o pareamento entre eles é exemplo — nenhuma fonte diz qual CTS atende qual sub-bacia.',
    /**
     * OS DOIS CÓDIGOS SÃO 'un' PORQUE O PAREAMENTO É O PROPÓSITO DA ABA.
     *
     * Nenhuma fonte diz qual CTS atende qual sub-bacia (a própria `desc` avisa).
     * Se não vem de fonte e a unidade não pode informar, a informação não existe
     * em lugar nenhum — por isso não são 'db'.
     *
     * São LISTA SUSPENSA das entidades que existem (ver `opcoesDaCelula`), nunca
     * texto livre: um id digitado errado quebra a FK que `validarCadastro`
     * confere. Os dois NOMES ficam 'db' porque são espelho do código escolhido ao
     * lado (`espelharColunas`), e 'db' produz o efeito de tela certo — travado.
     *
     * `cts_name` está na tabela porque o id de CTS na base é um código como
     * "292_SEDEITABORAI": sem o nome ao lado não há como conferir o pareamento.
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
       * SISTEMA DA CTS — DERIVADO DO DESTINO NO FLUXO, e não integrado.
       *
       * Não existe, em fonte nenhuma, um vínculo dizendo em qual sistema de
       * sub-bacias uma CTS está: a integração nunca vai trazer isso. O vínculo
       * nasce da topologia — a partir do momento em que a CTS deságua numa
       * sub-bacia ou numa ETE, o sistema dela é o sistema desse destino.
       *
       * Daí 'calc'/'regra': o vínculo JÁ ESTÁ no Fluxo de escoamento, e pedi-lo
       * de novo em campo próprio abriria espaço para as duas informações
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
    // Mesmo formato da `desc` da aba irmã: os componentes nomeados primeiro, a
    // regra do CAPEX depois, e só então a ressalva de procedência. A diferença
    // entre as duas listas — 5 e 4 — é o que explica a CTS, e por isso a ausência
    // da Ligação está dita, não implícita.
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
       * campos na mesma lista (`_OBRA`, em `pendencias.py`), e o de/para da ponte
       * (`OBRA`, em `lib/cadastroApi.ts`) é um só para as duas — mexer aqui sem
       * mexer na aba irmã quebra os dois.
       */
      { coluna: 'obra_obrigatoria_ano', origem: 'un', procedencia: 'vazio', oque: 'Ano em que esta obra TEM de acontecer, por exigência contratual ou regulatória.', porque: 'O motor a força nesse ano, mesmo que o retorno não justifique. Vazio = sem exigência.', exemplo: '2027' },
      { coluna: 'obra_proibida_ate', origem: 'un', procedencia: 'vazio', oque: 'Ano até o qual esta obra NÃO pode começar.', porque: 'Impede o plano de agendar antes de uma licença, desapropriação ou obra de terceiro. Vazio = sem impedimento.', exemplo: '2029' },
      { coluna: 'wacc', origem: 'un', procedencia: 'vazio', oque: 'Custo de capital do componente, quando há financiamento nominalmente atrelado.', porque: 'Desconta CAPEX e OPEX da obra. Vazio = usa o WACC médio da unidade.' , opcional: 'herda o WACC médio da unidade'},
    ],
  },
]
