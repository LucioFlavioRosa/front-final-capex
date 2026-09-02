/**
 * CADASTRO — a ponte entre o wizard e as rotas normalizadas do backend.
 *
 * ## O que mudou, e por quê
 *
 * Antes este módulo falava com `POST /api/cadastro`, que gravava o estado do
 * wizard inteiro como um DOCUMENTO (`{aba: [{coluna: valor}]}`) e sobrescrevia a
 * unidade a cada chamada. O backend do Otimizador não tem essa rota, e não é
 * lacuna: ele grava **uma ficha por vez**, em tabelas normalizadas, e cada
 * gravação carrega junto a trilha de override, a contagem de pendências e —
 * na topologia — validações que recusam um sistema incoerente.
 *
 * Gravar por documento passaria por cima das três. Por isso a adaptação é aqui,
 * no transporte, e não no backend: o wizard continua sendo o que era, e este
 * módulo traduz.
 *
 * ## O encaixe é quase 1:1
 *
 * As 15 abas do `SCHEMA` são as 15 tabelas de cadastro do backend, e as colunas
 * têm os mesmos nomes das colunas do banco. O que difere é o RECORTE das rotas,
 * que agrupam por ficha em vez de por tabela:
 *
 *   GET /unidades/{u}/hierarquia   unidade-regional, empresa,
 *                                  cidade-empresa, cidade-sistema,
 *                                  sistema-topologia
 *   GET /unidades/{u}/contrato     cidade-operacional, metas-cobertura, fator-esgoto
 *   GET /unidades/{u}/sub-bacias   subbacia-operacional, componentes-subbacias-capex
 *   GET /unidades/{u}/etes         ete-capex
 *   GET /unidades/{u}/cts          cts-operacional, componentes-cts-capex
 *
 * ## O que este módulo NÃO grava, e por quê
 *
 * O backend não expõe escrita para NOME — de regional, empresa, cidade
 * ou sistema —, nem para `regional-operacional` (ano-base). Eles vêm do
 * Databricks. As abas correspondentes continuam sendo LIDAS e exibidas; o que
 * elas não fazem é voltar para o banco. `ABAS_SEM_ESCRITA` lista todas, e
 * `salvarCadastro` as ignora explicitamente em vez de tentar e falhar — falha
 * silenciosa aqui seria pior que ausência.
 *
 * `unidade-regional` é meio-termo, e por isso NÃO está naquela lista: os nomes
 * de regional e unidade não gravam, mas `wacc_medio` e `usa_macrorregiao_cts`
 * sim, pelo mesmo `PUT /unidades/{id}`. São os dois campos da unidade que ninguém
 * importa do Databricks — quem os informa é gente. A decisão de usar
 * macrorregião de CTS é da unidade e vale para todos os sistemas dentro dela —
 * era por sistema até a migração 016.
 *
 * `subbacia-cts` não é lida nem gravada, e some da tela. O pareamento
 * CTS↔sub-bacia é SOBREPOSIÇÃO DE ÁREA, e nunca significou pertencimento — quem
 * diz em que sistema a CTS está é a topologia. Servi-la vazia deixaria uma aba
 * que só pode enganar.
 */
import { api, apiBlob, apiUpload } from './api'
import type { Row, UnidadeState } from '../data/cadastroUnidade/types'

export interface CadastroSalvo {
  ok: boolean
  unidade_id: string
  criado_em: string
  atualizado_em: string
}

export interface CadastroLido {
  unidade_id: string
  unidade_nome: string
  regional_nome: string
  dados: UnidadeState['data']
  criado_em: string
  atualizado_em: string
  /**
   * O que o SERVIDOR devolveu, intocado — a linha-base do diff de
   * `salvarCadastro`. Guarde-a e entregue-a na hora de salvar; ver
   * `BaseDoCadastro`.
   */
  base: BaseDoCadastro
}

// ---------------------------------------------------------------- payloads
// Só o que este módulo lê. Não são os tipos completos do backend de propósito:
// declarar aqui o payload inteiro criaria uma segunda definição para envelhecer
// junto com a de lá.

interface Hierarquia {
  unidReg: {
    rid: string
    rnome: string
    /** A diretoria, entre a regional e a unidade. `''` até a carga trazê-la. */
    did: string
    dnome: string
    uid: string
    unome: string
    waccMedio: string
    /** `'true'`/`'false'`. Marcada, cada sistema da unidade aceita uma CTS só. */
    usaCts: string
  }
  empresas: { id: string; nome: string; fimConcessao: string }[]
  cidades: { id: string; nome: string; empId: string }[]
  sistemas: { id: string; nome: string; cidId: string; usaCts?: string }[]
  topo: { sis: string; id: string; nome: string; jus: string; tipo?: string }[]
  /** Componentes fora de qualquer sistema — hoje, as CTS ainda não colocadas. */
  semSistema?: { id: string; nome: string; tipo?: string }[]
}

interface Contrato {
  cidades: { id: string; nome: string; empId: string; empNome: string; fim: string; cob: string }[]
  metas: { cid: string; ano: string; pct: string }[]
  fator: { cid: string; cob: string; par: string }[]
}

type Obra = Record<string, string>

interface FichaColeta {
  nome?: string
  sisId?: string
  sistema?: string
  jusante?: string
  db: Record<string, string>
  params: Record<string, string>
  obrasOverride: Record<string, Obra>
}

interface SubBacias {
  subs: Record<string, FichaColeta>
}

interface Cts {
  ctss: Record<string, FichaColeta>
}

interface Etes {
  etes: Record<string, string>[]
}

// ------------------------------------------------------------- de/para
/**
 * As chaves curtas do backend ↔ as colunas do wizard.
 *
 * O backend agrupa a ficha de coleta em dois blocos — `db` (veio do Databricks,
 * travado na tela) e `params` (a Regional preenche) — e usa chaves curtas. O
 * wizard usa o nome da coluna do banco. É o único de/para real deste módulo; o
 * resto das abas já bate nome a nome.
 */
const DB: Record<string, string> = {
  fat: 'receita_faturada_media_mensal',
  arr: 'receita_arrecadada_media_mensal',
  ligU: 'universo_ligacoes',
  ligA: 'ligacoes_atuais',
  ligN: 'ligacoes_novas_obras',
  ecoU: 'universo_economias',
  ecoA: 'economias_atuais',
  ecoN: 'economias_novas_obras',
  // O RECORTE RESIDENCIAL. Estava fora deste de/para e, por tabela, fora da
  // tela: a ficha chegava com os quatro, a grade não os mostrava, e a gravação
  // os preservava por baixo (ver `BaseDoCadastro`). Dado que existe, decide meta,
  // e ninguém conseguia conferir.
  ligURes: 'universo_ligacoes_residencial',
  ligARes: 'ligacoes_atuais_residencial',
  ecoURes: 'universo_economias_residencial',
  ecoARes: 'economias_atuais_residencial',
}

const PARAMS: Record<string, string> = {
  preco: 'preco_por_ligacao',
  tarr: 'tempo_arrecadacao',
  ramp: 'tempo_ramp_up',
  vaz: 'vazao_contribuicao',
  popU: 'universo_populacao',
  popA: 'populacao_atual',
  popN: 'populacao_novas_obras',
  pot: 'potencial_crescimento',
}

/**
 * SÓ LEITURA — o servidor calcula e não recebe de volta.
 *
 * `ticket` é receita ÷ ligações, feito no servidor, e ele o exclui do contrato
 * de gravação de propósito: "exigi-lo no corpo obrigaria o cliente a devolver
 * uma conta que o servidor mesmo fez" (`cadastro.py::CAMPOS_DB`). Fica fora do
 * `DB` acima porque aquele mapa serve os DOIS sentidos — incluí-lo ali o mandaria
 * de volta no `PUT`, e o servidor recusaria a ficha por campo desconhecido.
 */
const DB_DERIVADO: Record<string, string> = {
  ticket: 'ticket_medio',
}

/** Obra: índice do backend ↔ colunas de `componentes-*-capex`. */
const OBRA: Record<string, string> = {
  nome: 'componente',
  qtd: 'quantidade',
  un: 'unidade',
  preco: 'preco_unitario',
  opex: 'opex',
  tPred: 'tempo_predecessoras',
  dur: 'tempo_execucao',
  anoObrig: 'obra_obrigatoria_ano',
  proibAte: 'obra_proibida_ate',
  wacc: 'wacc',
}

const ETE: Record<string, string> = {
  capMod: 'capacidade_por_modulo',
  capexMod: 'capex_por_modulo',
  opexMod: 'opex_por_modulo',
  tExec: 'tempo_de_execucao',
  capNom: 'capacidade_nominal_atual',
  vazOp: 'vazao_de_operacao_atual',
  nova: 'nova',
  terreno: 'capex_terreno',
  modulos: 'modulos',
  wacc: 'wacc',
}

/** Inverte um de/para, para o caminho da gravação. */
const inverso = (m: Record<string, string>): Record<string, string> =>
  Object.fromEntries(Object.entries(m).map(([k, v]) => [v, k]))

// `empresa` NAO ENTRA AQUI: a aba grava, por `PUT /empresas/{emp_codigo}` — e o
// unico campo dela, o fim da concessao, e justamente o que a tela existe para
// informar. Ver `salvarCadastro`.
export const ABAS_SEM_ESCRITA = [
  'regional-operacional',
  'cidade-empresa',
  'subbacia-cts',
] as const

/**
 * O ÚLTIMO PAYLOAD LIDO de cada unidade, para a gravação não apagar o que a
 * tela não mostra.
 *
 * O backend exige a ficha INTEIRA no `PUT` — é o que torna a gravação
 * idempotente. Mas o wizard não exibe todas as colunas que a ficha tem: o
 * recorte residencial (`ligURes`, `ecoARes`…) e as colunas de sobreposição de
 * CTS (`*_com_cts`) existem no banco e não estão no `SCHEMA`. Montar o corpo só
 * com o que a tela tem gravaria NULO nelas — perda silenciosa de dado que
 * ninguém pediu para mudar.
 *
 * Então o corpo sai do que veio do servidor, com as colunas do wizard aplicadas
 * por cima. `salvarCadastro` EXIGE esta base: sem ela, recusa em vez de adivinhar.
 *
 * ERA UM `Map` DE MÓDULO, preenchido por `lerCadastro` e lido por
 * `salvarCadastro` pelas costas. A assinatura dizia que bastava a unidade, e não
 * bastava: era preciso ter lido antes, no mesmo processo. Restrição de ordem faz
 * parte da interface tanto quanto o tipo — e escondê-la custou caro em dois
 * lugares. Gravar só tinha teste de integração, contra backend no ar, porque não
 * havia como montar uma base falsa; e o estado de módulo compartilhado ajudou a
 * criar a corrida que obrigou a serializar a suíte de integração.
 *
 * Agora a base é um VALOR: `lerCadastro` devolve, quem salva entrega. O tipo
 * cobra, o teste fabrica, e não há estado escondido entre as duas chamadas.
 */
export interface BaseDoCadastro {
  /**
   * De QUEM é esta base.
   *
   * O `Map` era chaveado por unidade, e isso não era detalhe: trocar de unidade
   * e salvar antes de a leitura nova chegar buscava a chave nova, não achava, e
   * recusava. Com a base solta esse acidente vira gravar a unidade A com a
   * régua da B, que apagaria coluna de verdade. Por isso o id viaja junto e
   * `salvarCadastro` confere.
   */
  unidadeId: string
  subs: SubBacias
  cts: Cts
  etes: Etes
  dados: UnidadeState['data']
}

/**
 * Mudou em relação ao que o servidor devolveu?
 *
 * `salvarCadastro` grava ficha a ficha, e uma unidade real tem milhares delas —
 * a uB1 tem 751 sub-bacias, 155 ETEs e 1.057 componentes de topologia. Mandar
 * todas a cada clique em Salvar levava ~40s e ~2.000 requisições para gravar um
 * campo. Pior que a lentidão: cada `PUT` desnecessário é uma chance a mais de
 * esbarrar numa validação por causa de algo que ninguém editou.
 *
 * A comparação é entre a LINHA DA TELA e a linha que a leitura montou — as duas
 * têm a mesma forma, porque saem do mesmo código. Igual, não vai.
 */
function igual(a: Row | undefined, b: Row | undefined): boolean {
  if (!a || !b) return false
  const chaves = new Set([...Object.keys(a), ...Object.keys(b)])
  for (const k of chaves) if ((a[k] ?? '') !== (b[k] ?? '')) return false
  return true
}

/**
 * CAMPO EM BRANCO É AUSÊNCIA — vai como `null`, e não como `""`.
 *
 * A grade trata toda célula como texto, então "não preenchido" chega aqui como
 * string vazia. Para alguns campos isso é indiferente; para os que o servidor
 * conta como pendência com `IS NULL`, não é: gravar `""` cria um valor, e o
 * campo passa a parecer preenchido.
 *
 * O caso concreto é `unidade_cobertura` (a régua da cobertura). A conta de
 * completude é `(o.unidade_cobertura IS NULL)::int` — um `""` faria a cidade
 * contar como pronta e liberaria a simulação sem ninguém ter escolhido a régua.
 *
 * A conversão mora AQUI, e não no servidor, porque quem inventou o `""` foi esta
 * camada: é a grade que transforma ausência em texto vazio. Desfazer isso na
 * borda de saída é devolver o dado à forma em que ele chegou.
 */
function vazioEhAusencia(v: string | undefined): string | null {
  const s = (v ?? '').trim()
  return s || null
}

/** Indexa as linhas de uma aba por uma coluna-chave, para o de/para da gravação. */
function porChave(linhas: Row[] | undefined, col: string): Map<string, Row> {
  const m = new Map<string, Row>()
  for (const l of linhas ?? []) if (l[col]) m.set(l[col], l)
  return m
}

// ------------------------------------------------------------------ leitura
export async function lerCadastro(unidadeId: string): Promise<CadastroLido> {
  const u = encodeURIComponent(unidadeId)
  const [hier, contrato, subs, etes, cts] = await Promise.all([
    api.get<Hierarquia>(`/api/unidades/${u}/hierarquia`),
    api.get<Contrato>(`/api/unidades/${u}/contrato`),
    api.get<SubBacias>(`/api/unidades/${u}/sub-bacias`),
    api.get<Etes>(`/api/unidades/${u}/etes`),
    api.get<Cts>(`/api/unidades/${u}/cts`),
  ])

  // `dados` entra na base junto: ele e a LINHA-BASE contra a qual a gravacao
  // decide o que mudou. Sem ele, salvar mandaria a unidade inteira. A CÓPIA
  // PROFUNDA é o que mantém a base imune à edição da tela — o wizard muta as
  // linhas que recebe, e sem a cópia a base viraria o próprio estado editado e
  // o diff nunca acusaria mudança nenhuma.
  const montarBase = (dados: UnidadeState['data']): BaseDoCadastro => ({
    unidadeId,
    subs,
    cts,
    etes,
    dados: JSON.parse(JSON.stringify(dados)),
  })

  const nomeSistema = new Map(hier.sistemas.map((s) => [s.id, s.nome]))
  const nomeComponente = new Map(hier.topo.map((t) => [t.id, t.nome]))
  const nomeCidade = new Map(contrato.cidades.map((c) => [c.id, c.nome]))
  /**
   * A EMPRESA DE CADA MUNICÍPIO — para as abas que são por cidade mas mostram o
   * nível acima dela.
   *
   * As três abas do bloco Município (régua, metas, paridade) declaram
   * `emp_codigo` e `empresa`, e as três montavam a linha com string vazia fixa:
   * a coluna existia na tela e nunca teve dado. O servidor sempre soube — a
   * cidade tem uma empresa por definição (`cidade_empresa`) —, faltava trazer e
   * ligar aqui.
   */
  const empresaDaCidade = new Map(
    contrato.cidades.map((c) => [c.id, { cod: c.empId ?? '', nome: c.empNome ?? '' }]),
  )

  const dados: UnidadeState['data'] = {
    'unidade-regional': [
      {
        regional_id: hier.unidReg.rid,
        regional_name: hier.unidReg.rnome,
        unidade_id: hier.unidReg.uid,
        unidade_name: hier.unidReg.unome,
        diretoria_id: hier.unidReg.did,
        diretoria_name: hier.unidReg.dnome,
        wacc_medio: hier.unidReg.waccMedio,
        // `usaCts` chega como `'true'`/`'false'` e vira `Sim`/`Nao` — o
        // vocabulário que o wizard usa nas outras colunas de sim/não.
        usa_macrorregiao_cts: hier.unidReg.usaCts === 'true' ? 'Sim' : 'Nao',
      },
    ],

    // Sem rota de leitura própria: o ano-base é da regional, e o backend não o
    // expõe. A linha existe para a aba não sumir; o campo fica em branco.
    'regional-operacional': [{ regional_id: hier.unidReg.rid, ano_base: '' }],

    'empresa': hier.empresas.map((s) => ({
      unidade_id: hier.unidReg.uid,
      emp_codigo: s.id,
      empresa: s.nome,
      data_fim_concessao: s.fimConcessao,
    })),

    // O NOME DA EMPRESA VEM POR BUSCA, e não vazio como antes: a hierarquia
    // manda as empresas numa lista e as cidades noutra, ligadas pelo código.
    // Deixar a coluna em branco obrigava quem lê a aba a cruzar as duas de
    // cabeça — e era o que acontecia enquanto o nível era só um reservado.
    'cidade-empresa': hier.cidades.map((c) => ({
      emp_codigo: c.empId,
      empresa: hier.empresas.find((e) => e.id === c.empId)?.nome ?? '',
      cidade_id: c.id,
      cidade_name: c.nome,
    })),

    'cidade-sistema': hier.sistemas.map((s) => ({
      emp_codigo: '',
      empresa: '',
      sistema_id: s.id,
      sistema_name: s.nome,
      cidade_id: s.cidId,
    })),

    // A topologia traz TAMBÉM o que está fora de sistema (`semSistema`), com
    // `sistema_id` em branco: é o estado normal de uma CTS antes de a Regional
    // decidir em que sistema ela entra, e escondê-la faria a tela dizer que ela
    // não existe.
    'sistema-topologia': [
      ...hier.topo.map((t) => ({
        sistema_id: t.sis,
        sistema_name: nomeSistema.get(t.sis) ?? '',
        componente_sistema_id: t.id,
        componente_sistema_nome: t.nome,
        componente_tipo: t.tipo ?? '',
        componente_sistema_id_jusante: t.jus,
        componente_sistema_nome_jusante: nomeComponente.get(t.jus) ?? '',
      })),
      ...(hier.semSistema ?? []).map((t) => ({
        sistema_id: '',
        sistema_name: '',
        componente_sistema_id: t.id,
        componente_sistema_nome: t.nome,
        componente_tipo: t.tipo ?? '',
        componente_sistema_id_jusante: '',
        componente_sistema_nome_jusante: '',
      })),
    ],

    // `emp_codigo`/`empresa` vinham vazios FIXOS aqui — a coluna existia na aba e
    // nunca teve dado. Agora vêm do servidor, que sempre soube (a cidade tem uma
    // empresa por definição, é o elo `cidade_empresa`).
    //
    // `data_fim_concessao` saiu: a coluna não está mais nesta aba, e mandá-la
    // faria a linha carregar um campo que a tela não mostra.
    'cidade-operacional': contrato.cidades.map((c) => ({
      emp_codigo: c.empId ?? '',
      empresa: c.empNome ?? '',
      cidade_id: c.id,
      cidade_name: c.nome,
      unidade_cobertura: c.cob ?? '',
    })),

    'metas-cobertura': contrato.metas.map((m) => ({
      emp_codigo: empresaDaCidade.get(m.cid)?.cod ?? '',
      empresa: empresaDaCidade.get(m.cid)?.nome ?? '',
      cidade_id: m.cid,
      cidade_name: nomeCidade.get(m.cid) ?? '',
      ano: m.ano,
      cobertura_pct: m.pct,
    })),

    'fator-esgoto': contrato.fator.map((f) => ({
      emp_codigo: empresaDaCidade.get(f.cid)?.cod ?? '',
      empresa: empresaDaCidade.get(f.cid)?.nome ?? '',
      cidade_id: f.cid,
      cidade_name: nomeCidade.get(f.cid) ?? '',
      cobertura_pct: f.cob,
      paridade: f.par,
    })),

    'subbacia-operacional': Object.entries(subs.subs).map(([id, f]) =>
      linhaDeColeta(id, f, 'sub_bacia_id', 'sub_bacia_name'),
    ),

    'componentes-subbacias-capex': Object.entries(subs.subs).flatMap(([id, f]) =>
      linhasDeObra(f, { sub_bacia_id: id, sub_bacia_name: f.nome ?? id, sistema_id: f.sisId ?? '', sistema_name: f.sistema ?? '' }),
    ),

    'ete-capex': etes.etes.map((e) => {
      const linha: Row = { ete_id: e.id ?? '', ete_name: e.nome ?? e.id ?? '', sistema_id: e.sisId ?? '' }
      for (const [curto, coluna] of Object.entries(ETE)) linha[coluna] = e[curto] ?? ''
      linha.capacidade_ociosa = e.ociosa ?? ''
      // Prazo e janela da obra da ETE. `tPred` já era lido aqui, mas o servidor
      // nunca o mandava — chegava sempre vazio. Agora manda os três.
      linha.tempo_predecessoras = e.tPred ?? ''
      linha.obra_obrigatoria_ano = e.anoObrig ?? ''
      linha.obra_proibida_ate = e.proibAte ?? ''
      return linha
    }),

    'subbacia-cts': [],

    'cts-operacional': Object.entries(cts.ctss).map(([id, f]) => ({
      emp_codigo: '',
      empresa: '',
      ...linhaDeColeta(id, f, 'cts_id', 'cts_name'),
      sistema_id: f.sisId ?? '',
      sistema_name: f.sistema ?? '',
    })),

    'componentes-cts-capex': Object.entries(cts.ctss).flatMap(([id, f]) =>
      linhasDeObra(f, { cts_id: id, cts_name: f.nome ?? id }),
    ),
  }

  return {
    unidade_id: hier.unidReg.uid,
    unidade_nome: hier.unidReg.unome,
    regional_nome: hier.unidReg.rnome,
    dados,
    criado_em: '',
    atualizado_em: '',
    // A base sai JUNTO com a leitura, e não por um canal lateral: quem lê é
    // quem pode salvar, e o tipo passa a dizer isso.
    base: montarBase(dados),
  }
}

/** Ficha de coleta (sub-bacia ou CTS) → linha do wizard. */
function linhaDeColeta(id: string, f: FichaColeta, colId: string, colNome: string): Row {
  const linha: Row = {
    sistema_id: f.sisId ?? '',
    sistema_name: f.sistema ?? '',
    [colId]: id,
    [colNome]: f.nome ?? id,
  }
  for (const [curto, coluna] of Object.entries(DB)) linha[coluna] = f.db?.[curto] ?? ''
  for (const [curto, coluna] of Object.entries(DB_DERIVADO)) linha[coluna] = f.db?.[curto] ?? ''
  for (const [curto, coluna] of Object.entries(PARAMS)) linha[coluna] = f.params?.[curto] ?? ''
  return linha
}

/** As obras de uma ficha → uma linha por componente, na ordem do índice. */
function linhasDeObra(f: FichaColeta, fixas: Row): Row[] {
  return Object.keys(f.obrasOverride ?? {})
    .sort((a, b) => Number(a) - Number(b))
    .map((i) => {
      const o = f.obrasOverride[i] ?? {}
      const linha: Row = { ...fixas }
      for (const [curto, coluna] of Object.entries(OBRA)) linha[coluna] = o[curto] ?? ''
      // `capex` é derivado (quantidade × preço) e o backend recusa recebê-lo.
      // Aqui ele é só exibição, como o wizard já o trata (`origem: 'calc'`).
      linha.capex = ''
      return linha
    })
}

// ----------------------------------------------------------------- gravação
export class CadastroSemLeitura extends Error {
  constructor(unidadeId: string) {
    super(
      `O cadastro de ${unidadeId} não foi lido nesta sessão. Recarregue a unidade antes de ` +
        'salvar — sem o dado do servidor, gravar apagaria as colunas que a tela não mostra.',
    )
    this.name = 'CadastroSemLeitura'
  }
}

/**
 * Grava o cadastro, uma ficha por vez.
 *
 * SEQUENCIAL, e não em paralelo: as recusas do backend dependem umas das outras
 * (tirar um componente do sistema só vale se ninguém mais escoa para ele), e
 * disparar tudo de uma vez tornaria o resultado dependente de quem chegasse
 * primeiro. Uma unidade grande manda centenas de requisições — é o custo de
 * gravar com trilha por ficha, e é o que o wizard trocava por um POST só.
 *
 * A ORDEM importa, e é por isso que a topologia vai por último — ela é a única
 * parte que NÃO é gravada ficha a ficha: o sistema inteiro vai num `PUT` só, e o
 * servidor confere o desenho final em vez de cada passo até ele. Dentro do
 * cadastro sobrou uma dependência de ordem, a do `usaCts` da UNIDADE:
 * desmarcar precisa valer antes de a segunda CTS entrar, e marcar só depois de
 * as excedentes saírem — por isso a marcação é a última coisa que sai daqui. O
 * WACC não tem ordem, e viaja junto da primeira ida à rota da unidade.
 */
/**
 * A topologia agrupada por sistema: `sistema → (componente → jusante)`.
 *
 * Quem está FORA de sistema fica de fora do mapa, e é isso que faz a ausência
 * significar remoção do lado do servidor: ele recebe a lista completa de cada
 * sistema e tira dele quem não veio. Um componente sem sistema não pertence a
 * lista nenhuma, e por isso não precisa ser mencionado para sair.
 */
function porSistema(linhas: Row[] | undefined): Map<string, Map<string, string>> {
  const mapa = new Map<string, Map<string, string>>()
  for (const t of linhas ?? []) {
    const componente = String(t.componente_sistema_id ?? '').trim()
    const sistema = String(t.sistema_id ?? '').trim()
    if (!componente || !sistema) continue
    if (!mapa.has(sistema)) mapa.set(sistema, new Map())
    mapa.get(sistema)!.set(componente, String(t.componente_sistema_id_jusante ?? '').trim())
  }
  return mapa
}

/** O desenho do sistema é o mesmo? Ausente e vazio são a mesma coisa aqui. */
function mesmoDesenho(a?: Map<string, string>, b?: Map<string, string>): boolean {
  const antes = a ?? new Map<string, string>()
  const depois = b ?? new Map<string, string>()
  if (antes.size !== depois.size) return false
  for (const [componente, jusante] of antes) {
    if (depois.get(componente) !== jusante) return false
  }
  return true
}

export type EnvioDeTopologia = {
  sistemas: { id: string; componentes: { id: string; jusante: string }[] }[]
}

/**
 * O corpo do `PUT` de topologia, ou `null` quando nenhum sistema mudou.
 *
 * Exportada porque é AQUI que mora a decisão que já esteve errada uma vez: o
 * envio anterior era um `PUT` por componente, ordenado por uma heurística que
 * mandava a saída da CTS antes do reapontamento de quem escoava para ela. O
 * servidor recusava, e o teste que faltava era exatamente este — qual sistema
 * vai, e com quais componentes dentro.
 *
 * Vão os sistemas cujo DESENHO mudou, dos dois lados: um sistema que só perdeu
 * componentes também mudou, e é a ausência dele na lista que o remove.
 */
export function envioDaTopologia(
  antes: Row[] | undefined,
  depois: Row[] | undefined,
): EnvioDeTopologia | null {
  const mapaAntes = porSistema(antes)
  const mapaDepois = porSistema(depois)
  const tocados = [...new Set([...mapaAntes.keys(), ...mapaDepois.keys()])]
    .filter((sistema) => !mesmoDesenho(mapaAntes.get(sistema), mapaDepois.get(sistema)))
    .sort()
  if (!tocados.length) return null
  return {
    sistemas: tocados.map((sistema) => ({
      id: sistema,
      componentes: [...(mapaDepois.get(sistema) ?? new Map<string, string>())].map(
        ([componente, jusante]) => ({ id: componente, jusante }),
      ),
    })),
  }
}

export async function salvarCadastro(
  unidade: UnidadeState,
  base: BaseDoCadastro,
): Promise<CadastroSalvo> {
  const u = encodeURIComponent(unidade.id)
  // A base é de OUTRA unidade: recusa, e não grava. Ver `BaseDoCadastro.unidadeId`.
  if (base?.unidadeId !== unidade.id) throw new CadastroSemLeitura(unidade.id)

  const d = unidade.data
  const dbInv = inverso(DB)
  const paramsInv = inverso(PARAMS)
  const obraInv = inverso(OBRA)

  // ---- empresa: o fim da concessao, que desce para as cidades dela ----
  const empresaBase = porChave(base.dados['empresa'], 'emp_codigo')
  for (const e of d['empresa'] ?? []) {
    if (!e.emp_codigo) continue
    if (igual(e, empresaBase.get(e.emp_codigo))) continue
    await api.put(`/api/unidades/${u}/empresas/${encodeURIComponent(e.emp_codigo)}`, {
      empresa: { fim: e.data_fim_concessao ?? '' },
    })
  }

  // ---- contrato: a cidade e as metas/faixas dela formam UMA ficha ----
  const metasPorCidade = agrupar(d['metas-cobertura'] ?? [], (r) => r.cidade_id)
  const fatorPorCidade = agrupar(d['fator-esgoto'] ?? [], (r) => r.cidade_id)
  const metasBase = agrupar(base.dados['metas-cobertura'] ?? [], (r) => r.cidade_id)
  const fatorBase = agrupar(base.dados['fator-esgoto'] ?? [], (r) => r.cidade_id)
  const cidadeBase = porChave(base.dados['cidade-operacional'], 'cidade_id')
  for (const c of d['cidade-operacional'] ?? []) {
    if (!c.cidade_id) continue
    // A cidade e suas metas/faixas sao UMA ficha: qualquer das tres mudando,
    // ela vai inteira — e o backend a recebe inteira, que e o que torna o PUT
    // idempotente.
    const mesmaCidade = igual(c, cidadeBase.get(c.cidade_id))
    const mesmasMetas = listasIguais(metasPorCidade.get(c.cidade_id), metasBase.get(c.cidade_id))
    const mesmasFaixas = listasIguais(fatorPorCidade.get(c.cidade_id), fatorBase.get(c.cidade_id))
    if (mesmaCidade && mesmasMetas && mesmasFaixas) continue
    await api.put(`/api/unidades/${u}/contrato/${encodeURIComponent(c.cidade_id)}`, {
      // `cob` VAI SEMPRE, mesmo vazio. O PUT substitui a ficha inteira e lê
      // `cidade.get("cob")` sem default: a chave ausente vira NULL no banco.
      // Omitir o campo aqui APAGA a régua de todas as cidades gravadas — sem
      // erro, e sem ninguém ter tocado nela.
      // `fim` NAO VAI: a concessao e da empresa, e tem PUT proprio. O backend
      // ignora a chave se ela vier, e o upsert preserva o valor que a cidade ja
      // tem.
      cidade: {
        id: c.cidade_id,
        nome: c.cidade_name,
        cob: vazioEhAusencia(c.unidade_cobertura),
      },
      metas: (metasPorCidade.get(c.cidade_id) ?? []).map((m) => ({
        cid: m.cidade_id,
        ano: m.ano ?? '',
        pct: m.cobertura_pct ?? '',
      })),
      fator: (fatorPorCidade.get(c.cidade_id) ?? []).map((f) => ({
        cid: f.cidade_id,
        cob: f.cobertura_pct ?? '',
        par: f.paridade ?? '',
      })),
    })
  }

  // ---- coleta: sub-bacia e CTS são a mesma ficha em duas rotas ----
  await gravarColeta(u, 'sub-bacias', 'sub_bacia_id', d, base, 'subbacia-operacional',
    'componentes-subbacias-capex', base.subs.subs, { dbInv, paramsInv, obraInv })

  await gravarColeta(u, 'cts', 'cts_id', d, base, 'cts-operacional',
    'componentes-cts-capex', base.cts.ctss, { dbInv, paramsInv, obraInv })

  // ---- ETE ----
  const eteBase = porChave(base.dados['ete-capex'], 'ete_id')
  for (const e of d['ete-capex'] ?? []) {
    if (!e.ete_id || igual(e, eteBase.get(e.ete_id))) continue
    const ficha: Record<string, string> = {}
    for (const [curto, coluna] of Object.entries(ETE)) ficha[curto] = e[coluna] ?? ''
    ficha.tPred = e.tempo_predecessoras ?? ''
    ficha.anoObrig = e.obra_obrigatoria_ano ?? ''
    ficha.proibAte = e.obra_proibida_ate ?? ''
    // `ociosa` NÃO volta: é derivada (nominal − vazão de operação), e o motor
    // avisa quando o valor gravado discorda da conta. Mesma regra do `ticket`.
    await api.put(`/api/unidades/${u}/etes/${encodeURIComponent(e.ete_id)}`, { ete: ficha })
  }

  // ---- a unidade: WACC médio e a macrorregião de CTS ----
  //
  // Os dois campos que a unidade informa, na mesma rota. SÓ VAI O QUE MUDOU, e
  // é o que impede o pedido de apagar o outro: o servidor deixa como está a
  // coluna cuja chave não veio.
  const unidAntes = base.dados['unidade-regional']?.[0]
  const unidAgora = d['unidade-regional']?.[0]
  const ctsAgora = unidAgora?.usa_macrorregiao_cts
  const ctsMudou = ctsAgora !== undefined && ctsAgora !== unidAntes?.usa_macrorregiao_cts
  const waccMudou =
    unidAgora?.wacc_medio !== undefined && unidAgora.wacc_medio !== unidAntes?.wacc_medio

  const gravarUnidade = (comCts: boolean) => {
    const corpo: Record<string, unknown> = {}
    if (comCts) corpo.usaCts = ctsAgora === 'Sim'
    if (waccMudou) corpo.waccMedio = unidAgora?.wacc_medio ?? ''
    return api.put(`/api/unidades/${u}`, corpo)
  }

  // DESMARCAR VAI ANTES da topologia: sem isto, colocar a segunda CTS num
  // sistema é recusada pelo servidor por uma marcação que a pessoa acabou de
  // tirar na mesma tela. Marcar vai DEPOIS, logo abaixo, pela razão simétrica.
  //
  // O WACC PEGA CARONA NA PRIMEIRA IDA, seja qual for o sentido da caixa: ele não
  // tem dependência de ordem nenhuma, e mandá-lo à parte seria uma requisição a
  // mais para gravar duas colunas da mesma linha.
  if ((ctsMudou && ctsAgora !== 'Sim') || waccMudou) await gravarUnidade(ctsMudou && ctsAgora !== 'Sim')

  // ---- topologia: o SISTEMA INTEIRO, numa transação só ----
  //
  // Aqui havia um PUT por componente, ordenado por uma heurística de "quem solta
  // vai antes de quem liga" — e ela estava errada, de um jeito que só aparecia na
  // reorganização: `solta` olhava o estado final da PRÓPRIA linha, então tirar a
  // CTS do sistema (sem sistema ⇒ solta) ia na frente de reapontar quem escoava
  // para ela (com jusante ⇒ liga). O servidor recebia a saída da CTS enquanto o
  // banco ainda tinha alguém apontando para ela, e recusava com razão.
  //
  // Não havia heurística que consertasse: um reapontamento É um "solta" do ponto
  // de vista de quem ele larga, e mover uma cadeia inteira de sistema não tem
  // ordem que funcione — o estado intermediário é que é impossível, não o final.
  //
  // `componentes` é a lista COMPLETA de cada sistema: quem está lá hoje e não vem
  // na lista sai dele. É assim que remover se expressa, e é o que torna o envio
  // idempotente. Só vão os sistemas cujo desenho mudou.
  const envio = envioDaTopologia(base.dados['sistema-topologia'], d['sistema-topologia'])
  if (envio) await api.put(`/api/unidades/${u}/topologia`, envio)

  // MARCAR VAI DEPOIS da topologia: o servidor recusa marcar enquanto algum
  // sistema tiver duas CTS, e tirar a excedente é justamente o que a topologia
  // acabou de gravar. Aqui o WACC já foi na ida de cima.
  if (ctsMudou && ctsAgora === 'Sim') await api.put(`/api/unidades/${u}`, { usaCts: true })

  const agora = new Date().toISOString()
  return { ok: true, unidade_id: unidade.id, criado_em: agora, atualizado_em: agora }
}

/**
 * Grava as fichas de coleta de uma tabela.
 *
 * O corpo parte do que o SERVIDOR devolveu (`base`) e recebe por cima o que a
 * tela tem. É o que impede a gravação de zerar coluna que o wizard não exibe —
 * ver `BaseDoCadastro`.
 */
async function gravarColeta(
  u: string,
  rota: 'sub-bacias' | 'cts',
  colId: string,
  d: UnidadeState['data'],
  base: { dados: UnidadeState['data'] },
  abaFicha: string,
  abaObras: string,
  servidor: Record<string, FichaColeta>,
  inv: { dbInv: Record<string, string>; paramsInv: Record<string, string>; obraInv: Record<string, string> },
): Promise<void> {
  const obras = agrupar(d[abaObras] ?? [], (r) => r[colId])
  const obrasBase = agrupar(base.dados[abaObras] ?? [], (r) => r[colId])
  const fichaBase = porChave(base.dados[abaFicha], colId)

  for (const linha of d[abaFicha] ?? []) {
    const id = linha[colId]
    if (!id) continue
    const anterior = servidor[id]
    if (!anterior) continue // ficha que o servidor não conhece: criar não é papel do wizard
    // Nem a ficha nem as obras dela mudaram: não há o que gravar.
    if (igual(linha, fichaBase.get(id)) && listasIguais(obras.get(id), obrasBase.get(id))) continue

    const db = { ...anterior.db }
    const params = { ...anterior.params }
    for (const [coluna, valor] of Object.entries(linha)) {
      if (inv.dbInv[coluna]) db[inv.dbInv[coluna]] = valor
      if (inv.paramsInv[coluna]) params[inv.paramsInv[coluna]] = valor
    }

    const obrasOverride: Record<string, Obra> = {}
    const doWizard = obras.get(id) ?? []
    for (const [i, o] of Object.entries(anterior.obrasOverride ?? {})) {
      const linhaObra = doWizard.find((x) => x.componente === o.nome)
      const obra: Obra = { ...o }
      if (linhaObra) {
        for (const [coluna, valor] of Object.entries(linhaObra)) {
          if (inv.obraInv[coluna]) obra[inv.obraInv[coluna]] = valor
        }
      }
      obrasOverride[i] = obra
    }

    await api.put(`/api/unidades/${u}/${rota}/${encodeURIComponent(id)}`, {
      db,
      params,
      obrasOverride,
    })
  }
}

function agrupar(linhas: Row[], chave: (r: Row) => string | undefined): Map<string, Row[]> {
  const mapa = new Map<string, Row[]>()
  for (const l of linhas) {
    const k = chave(l)
    if (!k) continue
    const atual = mapa.get(k)
    if (atual) atual.push(l)
    else mapa.set(k, [l])
  }
  return mapa
}

/** Duas listas de linhas dizem a mesma coisa? Ordem conta — ela é do wizard. */
function listasIguais(a: Row[] | undefined, b: Row[] | undefined): boolean {
  const x = a ?? []
  const y = b ?? []
  if (x.length !== y.length) return false
  return x.every((linha, i) => igual(linha, y[i]))
}

/* ===========================================================================
 *  TEMPLATE DE EXCEL — baixar e importar
 *
 *  As duas funções abaixo vieram do front do cliente e falam com rotas que o
 *  backend do Otimizador AINDA NÃO TEM: `GET /api/cadastro/{u}/template` e
 *  `POST /api/cadastro/{u}/importar`, servidas lá por `app/cadastro/routes.py`
 *  e `app/cadastro/template_excel.py`.
 *
 *  Ficam aqui, e não fora, porque os botões que as chamam vieram junto com o
 *  resto do wizard. Enquanto as rotas não existirem, cada botão responde 404 e
 *  o `CadastroWizard` mostra o erro do servidor num toast — falha visível, que
 *  é o que se quer: um botão que não faz nada e não diz nada é pior.
 *
 *  O resto deste módulo é o adaptador para as rotas normalizadas — `lerCadastro`
 *  e `salvarCadastro` acima —, e ele não passa por aqui.
 * ======================================================================== */

/**
 * Baixa o template Excel desta unidade e dispara o download no navegador.
 *
 * `URL.createObjectURL` e o clique sintético são o jeito padrão de entregar um
 * blob como download sem navegar a aba para longe da tela de cadastro.
 */
export async function baixarTemplateCadastro(unidadeId: string): Promise<void> {
  const { blob, nomeArquivo } = await apiBlob(
    `/api/cadastro/${encodeURIComponent(unidadeId)}/template`,
  )
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nomeArquivo
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/**
 * Sobe a planilha preenchida e devolve `dados` no formato de
 * `UnidadeState['data']` — pronto para mesclar no estado do wizard.
 *
 * NÃO salva no banco: o servidor só lê e devolve. Quem chama decide o que fazer
 * com o resultado — no wizard, mesclar no estado e deixar a pessoa revisar antes
 * de clicar em Salvar.
 */
export function importarTemplateCadastro(
  unidadeId: string,
  arquivo: File,
): Promise<{ dados: Record<string, Row[]> }> {
  return apiUpload(`/api/cadastro/${encodeURIComponent(unidadeId)}/importar`, arquivo)
}
