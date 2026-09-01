/**
 * VIVE EM `scripts/`, e não em `src/`, porque não é código de tela.
 *
 * A regra do projeto é "o banco é a única fonte, em toda tela": o
 * `CadastroContext` não chama `seed()` para abrir uma unidade — parte de um
 * estado vazio e hidrata com `GET /api/cadastro/{id}`. Este arquivo é um
 * GERADOR, para `semear-banco.ts`: quem precisar povoar o banco com um cadastro
 * de exemplo roda o script, que importa `seed` daqui e faz o
 * `POST /api/cadastro`. Nenhum arquivo de `src/` importa
 * este módulo.
 */
import type { Cidade, Row, UnidadeState } from '../src/data/cadastroUnidade/types'
import {
  CIDADES_POR_UNIDADE, REGIONAIS_REAIS, REGIONAL_POR_UNIDADE, UNIDADES_POR_REGIONAL_REAL,
} from './hierarquiaReal'
import { UNIDADE_POR_COMPONENTE } from '../src/data/cadastroUnidade/schema'

/**
 * Regionais e unidades REAIS, do de-para
 * `DEPARA_REGIONAL_EMP_CODIGO_EMPRSA_CIDADE.csv`: 5 regionais, 53 unidades.
 *
 * Substituem os mocks `rA`/`rB` que existiam aqui (e a terceira lista, ainda
 * diferente, que estava hardcoded em `SelecaoUnidade.tsx`). `unidade_id` agora
 * é o EMP_CODIGO real da empresa operadora.
 */
export const REGIONAIS = REGIONAIS_REAIS
export const UNIDADES_POR_REGIONAL = UNIDADES_POR_REGIONAL_REAL

/**
 * IDS GERADOS — o esquema de códigos provisórios do cadastro.
 *
 * O PROBLEMA que ele resolve: sem ele, quatro colunas de ID mostram o mesmo
 * texto da coluna de nome ao lado — `sub_bacia_id` = 'Canal do Cunha' ao lado de
 * `sub_bacia_name`, `cidade_id` = '57-BELFORD_ROXO' ao lado de 'BELFORD ROXO'.
 * Cada uma gasta a largura de uma coluna repetindo o que já está dito, em abas
 * que têm 20+ colunas.
 *
 * A REGRA: ID é código curto e tipado; NOME é o texto legível. Quando a fonte
 * traz só um dos dois, o que falta é GERADO — nunca duplicado.
 *
 *   c001…  cidade            (gerar-hierarquia.mjs, sequencial por unidade)
 *   p01    superintendência  (uma por unidade)
 *   s01…   sistema
 *   b001…  sub-bacia         (gerar-dados-comerciais.mjs, ordem do CSV)
 *   t001…  CTS               (gerar-dados-comerciais.mjs, por EMP_CODIGO)
 *   e01…   ETE
 *
 * No Fluxo de escoamento o prefixo trabalha: origem e destino podem ser
 * sub-bacia, ETE ou CTS, e 'b004 → e01' já se lê como "sub-bacia deságua em ETE"
 * sem consultar outra aba.
 *
 * O QUE FICOU REAL: `regional_id` (R1…R5) e `unidade_id`/`emp_codigo` (o
 * EMP_CODIGO, '56'). Os dois JÁ SÃO códigos de verdade, curtos, e não repetem
 * nome nenhum — e o EMP_CODIGO é justamente o que recorta a base comercial de
 * CTS por unidade.
 *
 * O CTS foi o caso de fronteira, e caiu na segunda rodada: o único
 * identificador do CSV já é um código ('195_PAVUNARIO_DE_MELO'), o que parecia
 * argumento para preservá-lo como id. Só que ele é LONGO, e o resultado na tela
 * eram duas colunas truncadas mostrando '195_PAVUNARI' e '195_PAVUNARIO_DE'.
 * O código real não se perdeu: vive em `cts_name`, onde cabe por extenso.
 *
 * Todos os gerados estão marcados 'mock' no SCHEMA. São PROVISÓRIOS: quando o
 * Databricks trouxer o código real de cada entidade, ele entra no lugar e mais
 * nada na tela muda — o nome já vive em coluna própria.
 */

/**
 * Os componentes de obra, na ordem física do dicionário.
 *
 * Os nomes são VALORES de dado, não rótulos, e precisam bater exatamente com as
 * chaves de
 * `UNIDADE_POR_COMPONENTE` (senão a unidade de medida da linha exibe '—') e com
 * as chaves de `CAPEX_EXEMPLO` abaixo. Ver a nota sobre a classificação por
 * substring no motor, em `schema.ts`.
 */
const ORDEM_COMPONENTES_CTS = ['Coletor de tempo seco', 'Coletor Tronco', 'EEE', 'Linha de recalque']
/** Os 5 componentes de obra de uma sub-bacia, na ordem física do dicionário. */
const ORDEM_COMPONENTES_REDE = ['Ligação', 'Rede', 'Coletor Tronco', 'EEE', 'Linha de recalque']

/**
 * Números de obra de exemplo, aplicados só à PRIMEIRA sub-bacia da amostra.
 *
 * Nenhuma fonte traz obra: quantidade, preço, OPEX, prazos e WACC são
 * inventados, e ficam marcados 'mock' no SCHEMA. Existem numa sub-bacia só, e
 * não em todas as 19, por dois motivos: uma linha preenchida basta para
 * demonstrar o CAPEX calculado (quantidade × preço unitário) e o encadeamento
 * de prazos; e replicar os mesmos números por 19 sub-bacias faria uma base
 * inventada PARECER carga real, que é exatamente o que o rastreio de
 * procedência existe para evitar.
 *
 * As demais nascem vazias — âmbar de "a preencher", que é a verdade.
 */
const CAPEX_EXEMPLO: Record<string, Record<string, string>> = {
  'Ligação': { quantidade: '1896', preco_unitario: '784', opex: '49.847', tempo_predecessoras: '10', tempo_execucao: '15', wacc: '0,091' },
  'Rede': { quantidade: '2472', preco_unitario: '450,00', opex: '22.100', tempo_predecessoras: '0', tempo_execucao: '12', wacc: '0,091' },
  'Coletor Tronco': { quantidade: '0', preco_unitario: '1.200,00', opex: '', tempo_predecessoras: '', tempo_execucao: '16', wacc: '0,091' },
  'EEE': { quantidade: '0', preco_unitario: '', opex: '', tempo_predecessoras: '', tempo_execucao: '', wacc: '0,091' },
  'Linha de recalque': { quantidade: '436', preco_unitario: '900,00', opex: '11.390', tempo_predecessoras: '7', tempo_execucao: '12', wacc: '0,067' },
}
const CAPEX_VAZIO: Record<string, string> = {
  quantidade: '', preco_unitario: '', opex: '', tempo_predecessoras: '', tempo_execucao: '', wacc: '',
}

/**
 * AMOSTRA REAL de sistema · sub-bacia para o Fluxo de escoamento.
 *
 * A relação sistema → sub-bacia EXISTE na base: a coluna `SES` de
 * `SUB_BACIAS_DADOS_COMERCIAIS.csv` dá 1.047 sub-bacias distribuídas em 93
 * sistemas, cada sub-bacia em exatamente um sistema (verificado: zero
 * sub-bacias com mais de um SES). É a mesma coluna que já preenche "Sistema" na
 * aba Sub-bacias.
 *
 * UM sistema serve de amostra: as 1.047 de uma vez deixariam o Fluxo de
 * escoamento com 1.047 linhas numa grade sem virtualização, e a base de
 * sub-bacias não tem recorte por unidade (as mesmas apareceriam em qualquer
 * unidade selecionada). O escolhido é o sistema da PRIMEIRA sub-bacia do CSV —
 * assim o Fluxo de escoamento mostra o mesmo sistema que aparece no topo da aba
 * Sub-bacias, em vez de um recorte que parece arbitrário.
 *
 * `sistema_id` recebe o próprio nome do SES: o CSV não traz código de sistema,
 * e é a mesma convenção já aplicada a `sub_bacia_id`/`sub_bacia_name`.
 *
 * O que continua SEM FONTE, e por isso vazio: o DESTINO de cada linha — quem
 * deságua em quem até a ETE. É campo da unidade.
 */
/**
 * A BASE COMERCIAL NÃO ENTRA NO BUNDLE — estas duas constantes ficam vazias.
 *
 * Embutida, ela seria um arquivo gerado de 873 KB (1.047 sub-bacias com receita
 * faturada e arrecadada, e 304 CTS) contra 1.087 KB de JavaScript publicado: a
 * maior parte do que o navegador baixa seria dado comercial do cliente,
 * protegido apenas pela senha compartilhada do Static Web App. Dado comercial
 * não sai do servidor.
 *
 * Essas abas nascem VAZIAS e são preenchidas pelo que vem de
 * `GET /api/cadastro/{unidade}` — ver `HIDRATAR` no CadastroContext. O cadastro
 * DEPENDE do banco: sem a API respondendo, a unidade abre sem sub-bacia e sem
 * CTS, e isso é intencional. A saída não é reintroduzir o arquivo, é semear a
 * unidade no banco (`scripts/semear-banco.ts`).
 *
 * As constantes ficam como listas vazias, e não some o código que as usa, porque
 * o resto do seed já trata os dois casos: há guardas em `cidade-sistema`,
 * `subbacia-cts` e nos filtros do final do arquivo para quando não existe
 * sistema-amostra nem CTS. Elas foram escritas para as 51 unidades que nunca
 * tiveram CTS na base — e agora valem para todas.
 */
const SISTEMA_AMOSTRA = ''
const SUBBACIAS_DA_AMOSTRA: Row[] = []

/**
 * Gera os dados de uma unidade. As colunas com fonte real (hierarquia, cidades,
 * base comercial de sub-bacia e CTS) vêm dos CSVs; as demais continuam exemplo
 * fictício, sinalizado linha a linha. Chaves e abas seguem `SCHEMA`, que
 * reproduz o dicionário de dados da planilha v8.
 *
 * `unId` é o EMP_CODIGO da unidade — é ele que recorta as CTS e as cidades.
 */
export function seed(unId: string, unName: string, regionalId?: string): UnidadeState {
  const data: Record<string, import('./types').Row[]> = {}

  const regional = regionalId ?? REGIONAL_POR_UNIDADE[unId] ?? ''
  /** Cidades reais da unidade (de-para). Vazio só se o EMP_CODIGO não existir lá. */
  const cidades: Cidade[] = CIDADES_POR_UNIDADE[unId] ?? []
  /**
   * EMP_CODIGO / EMPRESA do de-para do Wagner, repetidos nas abas que a Aegea
   * pediu (cidades, sistemas, concessão, metas, paridade, CTS).
   *
   * Hoje carregam o mesmo valor de `unidade_id`/`unidade_name`, porque é assim
   * que o de-para chega: uma linha por REGIONAL · EMP_CODIGO · EMPRESA · CIDADE,
   * e o cadastro é sempre de uma empresa só. São colunas próprias porque "EMPRESA
   * é a mesma coisa que UNIDADE?" é pergunta aberta com a Aegea.
   */
  const empresa = { emp_codigo: unId, empresa: unName }

  // `regional_name` recebe o próprio código (R1…R5): o de-para não traz nome
  // descritivo de regional, e inventar um seria fabricar dado. Mesmo critério
  // já aplicado a sub_bacia_id/sub_bacia_name. Pendência com a Aegea.
  data['unidade-regional'] = [
    { regional_id: regional, regional_name: regional, unidade_id: unId, unidade_name: unName, wacc_medio: '0,0945' },
  ]
  data['regional-operacional'] = [
    { regional_id: regional, ano_base: '2026' },
  ]
  /**
   * A EMPRESA É O NÍVEL ENTRE UNIDADE E CIDADE (modelo de dados v8).
   *
   * Até a v7 havia aqui uma linha de reserva ('p01', nome vazio) para o elo
   * unidade → superintendência → cidade fechar na validação: o nível não vinha
   * de fonte nenhuma, e o de-para pulava de empresa direto para cidade. A v8
   * removeu o reservado e promoveu a EMPRESA OPERADORA, que é real — então o
   * `empresa` montado acima, que antes só acompanhava as linhas de cidade,
   * passa a ser a própria linha da hierarquia.
   */
  data['empresa'] = [{ unidade_id: unId, ...empresa }]
  // Cidades reais da unidade, vindas do de-para.
  data['cidade-empresa'] = cidades.map((c) => ({
    ...empresa, cidade_id: c.id, cidade_name: c.name,
  }))
  /**
   * SISTEMA não tem fonte. Os sistemas s1/s2/s3 seguem fictícios (o fluxo de escoamento e
   * o CAPEX de rede abaixo referenciam esses ids), mas passam a se pendurar nas
   * PRIMEIRAS CIDADES REAIS da unidade em vez de em c1/c2/c3 inexistentes — sem
   * isso o elo cidade-sistema → cidade quebraria em toda unidade.
   */
  /**
   * Duas naturezas convivem aqui de propósito, mas agora só na coluna de NOME:
   *
   *   - O sistema REAL da amostra (`SISTEMA_AMOSTRA`), que alimenta o Fluxo de escoamento.
   *     Fica com CIDADE VAZIA: nenhuma fonte diz qual cidade cada SES atende, e
   *     a coluna é 'db' — travada, o vazio é o recado de que falta integração.
   *   - Os sistemas FICTÍCIOS pendurados nas primeiras cidades reais. Existem só
   *     para sustentar os exemplos de CAPEX de ETE, que seguem mockados.
   *
   * O ID é UNIFORME: s01, s02, s03, s04, inclusive no sistema real. Misturar —
   * o real trazendo o próprio nome ('Alegria') e os fictícios trazendo s1/s2/s3 —
   * empilha duas coisas na mesma coluna. Como não existe código de sistema em
   * fonte nenhuma, o código é gerado para todos; o NOME ao lado é que diz o que é
   * real e o que não é.
   */
  const codigoSistema = (i: number) => `s${String(i + 1).padStart(2, '0')}`
  /** Id do sistema-amostra — o Fluxo e o CAPEX de sub-bacias se penduram nele. */
  const idSistemaAmostra = codigoSistema(0)
  data['cidade-sistema'] = [
    ...(SISTEMA_AMOSTRA
      ? [{ ...empresa, cidade_id: '', sistema_id: idSistemaAmostra, sistema_name: SISTEMA_AMOSTRA }]
      : []),
    ...cidades.slice(0, 3).map((c, i) => ({
      // +1 quando existe amostra: ela já ocupou o s01
      ...empresa, cidade_id: c.id,
      sistema_id: codigoSistema(SISTEMA_AMOSTRA ? i + 1 : i),
      sistema_name: `Sistema ${c.name} 1`,
    })),
  ]
  /**
   * Fluxo de escoamento REAL (amostra): uma linha por sub-bacia do sistema escolhido, com
   * o nome do SES e o da sub-bacia vindos da base. O nó de destino fica vazio —
   * é a cadeia, que não tem fonte e a unidade preenche.
   */
  data['sistema-topologia'] = SUBBACIAS_DA_AMOSTRA.map((r) => ({
    sistema_id: idSistemaAmostra,
    sistema_name: SISTEMA_AMOSTRA,
    componente_sistema_id: r.sub_bacia_id,
    componente_sistema_nome: r.sub_bacia_name,
    componente_sistema_id_jusante: '',
    componente_sistema_nome_jusante: '',
  }))
  // Cidades reais; `data_fim_concessao` vazio porque nenhuma fonte traz o ano —
  // é campo 'un', a unidade preenche.
  data['cidade-operacional'] = cidades.map((c) => ({
    ...empresa, cidade_id: c.id, cidade_name: c.name, data_fim_concessao: '',
  }))
  // Dados reais (Databricks) de SUB_BACIAS_DADOS_COMERCIAIS.csv — ver
  // ANALISE-CSV-DADOS-COMERCIAIS.md para o mapeamento campo a campo. O CSV é
  // uma base única, sem recorte por unidade/regional, então as mesmas 1.047
  // sub-bacias aparecem para qualquer unidade selecionada. O de-para resolve
  // isso para CTS (via EMP_CODIGO), não para sub-bacia: não há coluna de empresa
  // no CSV de sub-bacias.
  data['subbacia-operacional'] = []
  /**
   * CAPEX de sub-bacias — as 5 obras físicas de cada uma, na ordem do
   * dicionário: Ligação → Rede → Coletor Tronco → EEE → Linha de recalque.
   *
   * SUB-BACIA E SISTEMA são REAIS: as 19 sub-bacias do sistema-amostra, as
   * MESMAS que a aba Fluxo de escoamento mostra e que existem na aba Sub-bacias.
   *
   * Não é só nome de verdade na tela: `componentes-subbacias-capex.sub_bacia_id`
   * é chave estrangeira de `subbacia-operacional` (ver `elos` em
   * cadastroValidacao.ts). Uma sub-bacia inventada aqui não existe lá, e toda
   * unidade abre a
   * Revisão com "Referência de sub-bacia inexistente" em vermelho.
   *
   * O que continua exemplo é só a OBRA: quantidade, preço, OPEX, prazos e
   * WACC, numa sub-bacia só (ver `CAPEX_EXEMPLO`). Nenhum CSV traz obra.
   *
   * `sistema_id`/`sistema_name` são redundantes com `sistema-topologia` (que já
   * liga a sub-bacia ao sistema) e existem aqui só para a grade poder exibir o
   * sistema antes da sub-bacia sem fazer um join a cada render.
   *
   * `obra_obrigatoria_ano`/`obra_proibida_ate` saíram: viraram premissa da
   * simulação, não cadastro (ver topo de schema.ts).
   */
  data['componentes-subbacias-capex'] = SUBBACIAS_DA_AMOSTRA.flatMap((sb, i) =>
    ORDEM_COMPONENTES_REDE.map((componente) => ({
      sistema_id: idSistemaAmostra,
      sistema_name: SISTEMA_AMOSTRA,
      sub_bacia_id: sb.sub_bacia_id,
      sub_bacia_name: sb.sub_bacia_name,
      componente,
      ...(i === 0 ? CAPEX_EXEMPLO[componente] : CAPEX_VAZIO),
      unidade: UNIDADE_POR_COMPONENTE[componente] ?? '',
      capex: '',
    })),
  )
  // ETEs: 'e01'/'e02' no padrão de dois dígitos dos demais ids gerados.
  data['ete-capex'] = [
    { ete_id: 'e01', ete_name: 'ETE Sistema Maricá 1', capacidade_por_modulo: '49', capex_por_modulo: '415.175', opex_por_modulo: '65.934', tempo_predecessoras: '0', tempo_de_execucao: '12', capacidade_nominal_atual: '0', vazao_de_operacao_atual: '0', capacidade_ociosa: '', nova: 'Sim', capex_terreno: '912.405', modulos: '4', wacc: '0,091' },
    { ete_id: 'e02', ete_name: 'ETE Sistema Itaboraí 1', capacidade_por_modulo: '', capex_por_modulo: '', opex_por_modulo: '', tempo_predecessoras: '', tempo_de_execucao: '', capacidade_nominal_atual: '0', vazao_de_operacao_atual: '0', capacidade_ociosa: '', nova: 'Sim', capex_terreno: '', modulos: '', wacc: '0,091' },
  ]
  /**
   * Metas e faixas de paridade seguem sendo EXEMPLO (a unidade cria as linhas),
   * mas agora sobre a primeira cidade real da unidade — antes apontavam para
   * c1/c2, ids que não existem mais em `cidade-empresa` e que fariam a
   * validação acusar cidade inexistente em toda unidade.
   */
  const cidadeExemplo = cidades[0]
  data['metas-cobertura'] = cidadeExemplo
    ? [
        { ...empresa, cidade_id: cidadeExemplo.id, cidade_name: cidadeExemplo.name, ano: '2028', cobertura_pct: '48' },
        { ...empresa, cidade_id: cidadeExemplo.id, cidade_name: cidadeExemplo.name, ano: '2033', cobertura_pct: '70' },
        { ...empresa, cidade_id: cidadeExemplo.id, cidade_name: cidadeExemplo.name, ano: '2045', cobertura_pct: '90' },
      ]
    : []
  data['fator-esgoto'] = cidadeExemplo
    ? ['0', '40', '60', '80'].map((cobertura_pct) => ({
        ...empresa, cidade_id: cidadeExemplo.id, cidade_name: cidadeExemplo.name, cobertura_pct, paridade: '0,80',
      }))
    : []

  /**
   * Dados reais (Databricks) de CTS_DADOS_COMERCIAIS.csv, RECORTADOS POR
   * UNIDADE: a coluna EMP_CODIGO do CSV é o código da empresa operadora
   * (56 = ÁGUAS DO RIO 01 com 102 CTS, 57 = ÁGUAS DO RIO 04 com 202), e é ela
   * que recorta.
   *
   * As outras 51 unidades ficam com lista vazia — correto, não é falta de
   * carga: essa base comercial só cobre as duas unidades da regional R4.
   */
  // Vazio desde que a base comercial saiu do bundle — ver a nota em
  // SISTEMA_AMOSTRA. As CTS da unidade vêm do banco, junto com o resto.
  const ctsReais: Row[] = []
  data['cts-operacional'] = ctsReais.map((r) => ({ ...empresa, ...r }))

  /**
   * Pareamento e CAPEX de CTS agora usam as CTS REAIS da unidade, não mais um
   * `cts1` inventado.
   *
   * O mock antigo referenciava um CTS que não existe em `cts-operacional`, e a
   * validação (com razão) acusava "referência de CTS inexistente" em toda
   * unidade — inclusive nas 51 que não têm CTS nenhum. Agora: sem CTS na base,
   * as duas abas ficam vazias; com CTS, o exemplo se pendura nas primeiras
   * reais. O de-para 1:1 sub-bacia · CTS segue sendo exemplo (a sub-bacia
   * continua mockada), mas ao menos os dois lados existem.
   */
  const ctsExemplo = ctsReais.slice(0, 2)
  data['componentes-cts-capex'] = ctsExemplo.flatMap((cts) =>
    ORDEM_COMPONENTES_CTS.map((componente) => ({
      cts_id: cts.cts_id, cts_name: cts.cts_name, componente,
      // padrão do componente, igual à aba de CAPEX de rede — a tela a exibe
      // derivada, e gravar o mesmo valor evita dado e tela discordando
      quantidade: '', unidade: UNIDADE_POR_COMPONENTE[componente] ?? '',
      preco_unitario: '', capex: '', opex: '',
      tempo_predecessoras: '', tempo_execucao: '', wacc: '',
    })),
  )

  /**
   * Alinhamento final das abas que dependem de `cidade-sistema` (fluxo de
   * escoamento, CAPEX de sub-bacias, ETEs) com os sistemas que de fato existem lá.
   *
   * Duas coisas acontecem aqui, e as duas são consequência de `cidade-sistema`
   * ter deixado de ser fixo (c1/c2/c3) para nascer das cidades reais:
   *
   *   1. FILTRO. A unidade pode ter menos de 3 cidades — várias têm uma só. Sem
   *      filtrar, a linha do sistema 's03' sobreviveria num cadastro
   *      onde 's03' não existe, e a validação acusaria (com razão) referência de
   *      sistema inexistente. O mock encolhe junto com o número de cidades.
   *   2. RÓTULO. O id do sistema é fictício de qualquer forma, mas o NOME não
   *      pode contradizer a cidade ao lado — sem isso uma unidade do Piauí
   *      mostraria "Sistema Maricá 1".
   *
   * Some quando o Databricks passar a alimentar sistema e fluxo de escoamento.
   */
  const nomeSistema = new Map(data['cidade-sistema'].map((r) => [r.sistema_id, r.sistema_name]))
  /** ETE fictícia → sistema que ela atende, conforme o destino no fluxo. */
  const sistemaDaEte: Record<string, string> = { e01: codigoSistema(0), e02: codigoSistema(1) }

  // `sistema_name` foi acrescentado ao Fluxo de escoamento (pedido da Aegea: o nome do SES
  // ao lado do id) — e, como o resto do mock, precisa acompanhar a cidade real.
  data['sistema-topologia'] = [
    ...data['sistema-topologia']
      .filter((r) => nomeSistema.has(r.sistema_id))
      .map((r) => ({ ...r, sistema_name: nomeSistema.get(r.sistema_id) ?? '' })),
    /**
     * UMA LINHA POR CTS DA UNIDADE.
     *
     * Não é simetria com as sub-bacias: a CTS PRECISA de linha aqui,
     * porque é dela que sai o único vínculo que diz a que sistema a CTS pertence
     * (item 21). Sem a linha, o campo Sistema da aba Dados da CTS não tem de onde
     * ser derivado, e a CTS fica fora de qualquer cadeia até a ETE.
     *
     * Vão TODAS as CTS da unidade, não uma amostra: cada uma é infraestrutura
     * real que deságua em algum lugar, e escolher algumas deixaria as outras
     * invisíveis num cadastro que se diz completo. São 202 na maior unidade —
     * acima do limiar de filtro da grade (15 linhas), então o funil do cabeçalho
     * entra e a aba se navega como as de sub-bacia.
     *
     * SISTEMA VAZIO de propósito, e é o ponto do item 21: a CTS não tem sistema
     * próprio em fonte nenhuma. Ele aparece derivado assim que o destino for
     * escolhido — e o filtro acima, que descarta linha sem sistema conhecido, não
     * pode alcançá-las: por isso elas entram DEPOIS dele.
     */
    ...ctsReais.map((cts) => ({
      sistema_id: '',
      sistema_name: '',
      componente_sistema_id: cts.cts_id,
      componente_sistema_nome: cts.cts_name,
      componente_sistema_id_jusante: '',
      componente_sistema_nome_jusante: '',
    })),
  ]
  // FILTRO DE SEGURANÇA: o CAPEX de sub-bacias nasce sobre sub-bacias e sistema
  // REAIS, e o sistema-amostra sempre existe em `cidade-sistema` — na prática
  // este filtro não corta nada. Fica porque o dia em que não existir (CSV vazio,
  // recorte por unidade) é melhor a aba ficar vazia do que despejar 95 linhas
  // apontando para um sistema que a validação não acha.
  data['componentes-subbacias-capex'] = data['componentes-subbacias-capex']
    .filter((r) => nomeSistema.has(r.sistema_id))
  // `sistema_id` sai daqui e passa a ser COLUNA da aba (item 22): o vínculo ETE →
  // sistema era um mapa privado deste arquivo, usado só para montar o nome da
  // estação, e a lista de destinos do Fluxo precisa lê-lo para oferecer "a ETE
  // daquele sistema". Ver o comentário da coluna em `schema.ts`.
  data['ete-capex'] = data['ete-capex']
    .filter((r) => nomeSistema.has(sistemaDaEte[r.ete_id]))
    .map((r) => ({
      ...r,
      sistema_id: sistemaDaEte[r.ete_id],
      ete_name: `ETE ${nomeSistema.get(sistemaDaEte[r.ete_id])}`,
    }))

  /**
   * Pareamento sub-bacia · CTS — depois do filtro acima, de propósito: ele
   * precisa de uma sub-bacia que SOBREVIVEU (a unidade pode ter menos sistemas
   * que o mock supõe) e de um CTS que EXISTE na base desta unidade. Faltando
   * qualquer um dos dois lados, a aba fica vazia em vez de apontar para um id
   * inexistente — que era o que fazia a validação acusar CTS órfão em todas as
   * 53 unidades.
   */
  const subBaciaParaCts = data['sistema-topologia'][0]
  data['subbacia-cts'] = ctsExemplo.length && subBaciaParaCts
    ? [{
        sub_bacia_id: subBaciaParaCts.componente_sistema_id,
        sub_bacia_name: subBaciaParaCts.componente_sistema_nome,
        cts_id: ctsExemplo[0].cts_id,
        cts_name: ctsExemplo[0].cts_name,
      }]
    : []

  return { id: unId, name: unName, regionalName: regional, cidades, data }
}
