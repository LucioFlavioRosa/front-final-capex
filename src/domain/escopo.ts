/**
 * O ESCOPO DAS ABAS — empresa + sistema, o par de filtros que recorta toda a grade.
 *
 * A barra recorta TODAS as abas do cadastro, e este arquivo é a parte que não é
 * tela — dado a resolver, sem React.
 *
 * O PROBLEMA QUE ELE RESOLVE, e é um só: **nenhuma aba tem as duas colunas.**
 * A de metas tem `cidade_id` e nenhum sistema; a de CAPEX da CTS não tem nem um
 * nem outro, só `cts_id`; a de Sub-bacias tem `sistema_name` real e `sistema_id`
 * VAZIO (o join sistema→sub-bacia vive no Fluxo, e o schema diz isso na própria
 * coluna). Cada aba chega ao mesmo par por um caminho diferente, e o caminho é
 * declarado no SCHEMA (`AbaDef.escopo`), não descoberto aqui.
 *
 * A CHAVE DE SISTEMA É OPACA, e essa é a decisão que faz o resto funcionar.
 * Ela é o `sistema_id` quando ele existe e o `sistema_name` quando não — nunca
 * uma tentativa de reconciliar os dois entre abas. O motivo é concreto: o código
 * de sistema é GERADO e vive em `cidade-sistema`; o nome é o dado real do CSV. Uma
 * aba pode ter só o nome, e forçá-la a achar o código produziria linha que não
 * casa com opção nenhuma — ou seja, filtro que esconde dado sem dizer por quê.
 *
 * E A INVARIANTE QUE FECHA O DESENHO: as opções saem das LINHAS da aba, não de
 * uma lista de referência. Toda opção oferecida tem, por construção, pelo menos
 * uma linha — então escolher qualquer coisa na barra nunca devolve tabela vazia.
 */

import type { AbaDef, EscopoAba, FonteEmpresa, FonteSistema, Row } from '../data/cadastroUnidade/types'
import { type Dados, type Sistema, sistemaDoNo, sistemasDoFluxo } from './fluxo'

const txt = (v: unknown): string => String(v ?? '').trim()

const SEM_SISTEMA: Sistema = { id: '', nome: '' }

/** O recorte escolhido na barra. `''` em qualquer eixo = "todos". */
export interface Escopo {
  empresaId: string
  sistemaId: string
}

export const SEM_ESCOPO: Escopo = { empresaId: '', sistemaId: '' }

export const escopoAtivo = (e: Escopo): boolean => !!e.empresaId || !!e.sistemaId

/**
 * A chave de um sistema no escopo — ver o comentário do topo sobre ela ser opaca.
 * Vazia quando o sistema não foi resolvido, e aí a linha simplesmente não entra
 * em opção nenhuma.
 */
export const chaveSistema = (s: Sistema): string => s.id || s.nome

// ---------------------------------------------------------------- índice

interface IndiceEscopo {
  /** Chave de sistema → nome legível, para o rótulo da opção. */
  nomePorSistema: Map<string, string>
  /**
   * Chave de sistema → cidades que o declaram em `cidade-sistema`. Indexado pelo
   * ID **e** pelo NOME, de propósito: a chave que chega aqui depende da aba, e a
   * consulta não pode falhar por a aba ter resolvido o sistema pelo nome.
   */
  cidadesPorSistema: Map<string, Set<string>>
  /** Cidade → empresa que a opera (`cidade-empresa`; toda cidade tem uma). */
  empresaPorCidade: Map<string, string>
  /**
   * Chave de sistema → empresas das cidades dele. Derivado de `cidadesPorSistema`
   * e `empresaPorCidade`, uma vez: é a pergunta que a barra faz por linha e o
   * seletor de CTS faz por sistema, e as duas a faziam refazendo o cruzamento.
   */
  empresasPorSistema: Map<string, Set<string>>
  /** Empresa → nome legível (`empresa`), para o rótulo da opção. */
  nomePorEmpresa: Map<string, string>
  /**
   * `sub_bacia_id` → chave de sistema, pelo CAPEX de componentes. Complementa
   * `sistemaDoNo`: ele resolve a sub-bacia pelo `sistema_name` da linha dela, e
   * esta aba é a única outra fonte que traz o vínculo com o código.
   */
  sistemaPorSubbaciaCapex: Map<string, string>
}

/**
 * Mesmo padrão de cache do `indice` de `cadastroFluxo`, e pelo mesmo motivo: o
 * `dados` é imutável (todo write do reducer cria objeto novo), então a chave é
 * exata e o `WeakMap` deixa o estado velho ser coletado. Sem isto os mapas seriam
 * reconstruídos a cada tecla digitada em qualquer célula.
 */
const cache = new WeakMap<Dados, IndiceEscopo>()

function indice(dados: Dados): IndiceEscopo {
  const emCache = cache.get(dados)
  if (emCache) return emCache

  const nomePorSistema = new Map<string, string>()
  const cidadesPorSistema = new Map<string, Set<string>>()

  const cidadesDe = (chave: string) => {
    let s = cidadesPorSistema.get(chave)
    if (!s) cidadesPorSistema.set(chave, (s = new Set()))
    return s
  }

  for (const r of dados['cidade-sistema'] ?? []) {
    const id = txt(r.sistema_id)
    const nome = txt(r.sistema_name)
    const cidade = txt(r.cidade_id)
    if (id && nome && !nomePorSistema.has(id)) nomePorSistema.set(id, nome)
    if (nome && !nomePorSistema.has(nome)) nomePorSistema.set(nome, nome)
    // Sistema sem cidade declarada NÃO é descartado: ele entra com conjunto
    // vazio e só aparece em "Todas as cidades" — é o caso do sistema real da
    // amostra, e é por isso que "todas" é o padrão da barra.
    if (id) cidadesDe(id)
    if (nome) cidadesDe(nome)
    if (cidade) {
      if (id) cidadesDe(id).add(cidade)
      if (nome) cidadesDe(nome).add(cidade)
    }
  }

  for (const r of dados['sistema-topologia'] ?? []) {
    const id = txt(r.sistema_id)
    const nome = txt(r.sistema_name)
    if (id && nome && !nomePorSistema.has(id)) nomePorSistema.set(id, nome)
  }

  const sistemaPorSubbaciaCapex = new Map<string, string>()
  for (const r of dados['componentes-subbacias-capex'] ?? []) {
    const sb = txt(r.sub_bacia_id)
    const chave = txt(r.sistema_id) || txt(r.sistema_name)
    if (sb && chave && !sistemaPorSubbaciaCapex.has(sb)) sistemaPorSubbaciaCapex.set(sb, chave)
    const nome = txt(r.sistema_name)
    if (chave && nome && !nomePorSistema.has(chave)) nomePorSistema.set(chave, nome)
  }

  const empresaPorCidade = new Map<string, string>()
  for (const r of dados['cidade-empresa'] ?? []) {
    const c = txt(r.cidade_id)
    const e = txt(r.emp_codigo)
    if (c && e && !empresaPorCidade.has(c)) empresaPorCidade.set(c, e)
  }
  const nomePorEmpresa = new Map<string, string>()
  for (const r of dados['empresa'] ?? []) {
    const e = txt(r.emp_codigo)
    if (e && !nomePorEmpresa.has(e)) nomePorEmpresa.set(e, txt(r.empresa) || e)
  }

  const empresasPorSistema = new Map<string, Set<string>>()
  for (const [chave, cidades] of cidadesPorSistema) {
    const empresas = new Set<string>()
    for (const c of cidades) {
      const e = empresaPorCidade.get(c)
      if (e) empresas.add(e)
    }
    empresasPorSistema.set(chave, empresas)
  }

  const novo: IndiceEscopo = {
    nomePorSistema, cidadesPorSistema, sistemaPorSubbaciaCapex, empresaPorCidade, nomePorEmpresa,
    empresasPorSistema,
  }
  cache.set(dados, novo)
  return novo
}

// ------------------------------------------------------------- resolvedores

/** O sistema de uma linha, pelo caminho que a aba declarou. */
export function sistemaDaLinhaEscopo(dados: Dados, fonte: FonteSistema, row: Row): Sistema {
  const ix = indice(dados)
  const comNome = (id: string, nome: string): Sistema => ({
    id,
    nome: nome || ix.nomePorSistema.get(id) || '',
  })

  switch (fonte) {
    case 'coluna': {
      const id = txt(row.sistema_id)
      const nome = txt(row.sistema_name)
      if (id) return comNome(id, nome)
      return nome ? { id: '', nome } : SEM_SISTEMA
    }
    /**
     * A aba do Fluxo: a linha de SUB-BACIA traz `sistema_id`; a de CTS chega com
     * ele vazio, e aí quem responde é `sistemaDoNo` caminhando até o destino —
     * o sistema de uma CTS é o do destino dela (item 21).
     */
    case 'fluxo': {
      const id = txt(row.sistema_id)
      if (id) return comNome(id, txt(row.sistema_name))
      return sistemaDoNo(dados, txt(row.componente_sistema_id))
    }
    case 'via-subbacia': {
      const sb = txt(row.sub_bacia_id)
      const pelo = sistemaDoNo(dados, sb)
      if (chaveSistema(pelo)) return pelo
      const capex = ix.sistemaPorSubbaciaCapex.get(sb)
      return capex ? comNome(capex, '') : SEM_SISTEMA
    }
    case 'via-cts':
      return sistemaDoNo(dados, txt(row.cts_id))
  }
}

/**
 * As cidades que um sistema atende, procuradas pelo id E pelo nome — ver
 * `cidadesPorSistema`. Vazio é resposta legítima: sistema sem cidade declarada
 * existe, e só aparece em "Todas as cidades".
 */
export function cidadesDoSistema(dados: Dados, s: Sistema): string[] {
  const ix = indice(dados)
  const uniao = new Set<string>()
  for (const k of [s.id, s.nome]) {
    if (!k) continue
    for (const c of ix.cidadesPorSistema.get(k) ?? []) uniao.add(c)
  }
  return [...uniao]
}

/** A empresa de uma cidade, ou `''` se a carga não a vinculou. */
const empresaDaCidade = (dados: Dados, cidade: string): string =>
  indice(dados).empresaPorCidade.get(cidade) ?? ''

/**
 * AS EMPRESAS DE UM SISTEMA — as das cidades dele, procuradas pelo id E pelo
 * nome como em `cidadesDoSistema`. Mais de uma é normal: um sistema pode estar
 * em cidades de empresas diferentes (Saracuruna: Duque de Caxias e Magé). É a
 * régua do seletor de CTS do Fluxo e do eixo `via-sistema` da barra — a outra
 * metade da chave `(sistema_cts, emp_codigo)` da macrorregião.
 */
export function empresasDoSistema(dados: Dados, s: Sistema): string[] {
  const ix = indice(dados)
  const uniao = new Set<string>()
  for (const k of [s.id, s.nome]) {
    if (!k) continue
    for (const e of ix.empresasPorSistema.get(k) ?? []) uniao.add(e)
  }
  return [...uniao]
}

/** O nome legível de uma empresa (`empresa`), ou o código quando não veio. */
export const nomeDaEmpresa = (dados: Dados, empresaId: string): string =>
  indice(dados).nomePorEmpresa.get(empresaId) ?? empresaId

/** As empresas de uma linha, pelo caminho que a aba declarou. */
export function empresasDaLinhaEscopo(
  dados: Dados,
  escopo: EscopoAba,
  fonte: FonteEmpresa,
  row: Row,
): string[] {
  if (fonte === 'via-cidade') {
    const e = empresaDaCidade(dados, txt(row.cidade_id))
    return e ? [e] : []
  }
  // 'via-sistema': as empresas das cidades do sistema — o vínculo
  // cidade↔sistema é de cadastro, não de linha.
  if (!escopo.sistema) return []
  return empresasDoSistema(dados, sistemaDaLinhaEscopo(dados, escopo.sistema, row))
}

/** A linha entra no recorte? Eixo em `''` não filtra nada. */
export function casaComEscopo(dados: Dados, aba: AbaDef, row: Row, escopo: Escopo): boolean {
  const def = aba.escopo
  if (!def) return true

  if (escopo.sistemaId && def.sistema) {
    if (chaveSistema(sistemaDaLinhaEscopo(dados, def.sistema, row)) !== escopo.sistemaId) return false
  }
  if (escopo.empresaId && def.empresa) {
    if (!empresasDaLinhaEscopo(dados, def, def.empresa, row).includes(escopo.empresaId)) return false
  }
  return true
}

// ---------------------------------------------------------------- opções

export interface OpcaoEscopo {
  value: string
  label: string
}

export interface OpcoesEscopo {
  /** `[]` quando a aba não declara o eixo de empresa. */
  empresas: OpcaoEscopo[]
  /** `[]` quando a aba não declara o eixo de sistema. */
  sistemas: (OpcaoEscopo & { empresas: Set<string> })[]
}

const VAZIAS: OpcoesEscopo = { empresas: [], sistemas: [] }

/**
 * As opções da barra, montadas a partir das LINHAS da aba — ver a invariante no
 * comentário do topo.
 *
 * Uma passada só pelas linhas, resolvendo os dois eixos de cada uma. O eixo que a
 * aba não declara sai como lista vazia, e a barra não desenha o controle.
 */
export function opcoesEscopo(dados: Dados, aba: AbaDef, rows: Row[]): OpcoesEscopo {
  const def = aba.escopo
  if (!def) return VAZIAS

  const empresasVistas = new Set<string>()
  const sistemas = new Map<string, { nome: string; empresas: Set<string> }>()

  for (const row of rows) {
    // O sistema é resolvido UMA vez por linha e reaproveitado pela empresa: com
    // 'via-sistema' as duas perguntas têm a mesma resposta no meio, e a aba de
    // CAPEX de componentes tem 5 linhas por sub-bacia — resolver duas vezes
    // dobraria o custo de uma passada que roda a cada tecla digitada.
    const s = def.sistema ? sistemaDaLinhaEscopo(dados, def.sistema, row) : null
    const empresasDaLinha = !def.empresa
      ? []
      : def.empresa === 'via-sistema'
        ? s
          ? empresasDoSistema(dados, s)
          : []
        : empresasDaLinhaEscopo(dados, def, def.empresa, row)

    if (s) {
      const k = chaveSistema(s)
      if (k) {
        let alvo = sistemas.get(k)
        if (!alvo) sistemas.set(k, (alvo = { nome: s.nome, empresas: new Set() }))
        else if (!alvo.nome && s.nome) alvo.nome = s.nome
        for (const e of empresasDaLinha) alvo.empresas.add(e)
      }
    }
    for (const e of empresasDaLinha) empresasVistas.add(e)
  }

  const opcEmpresas: OpcaoEscopo[] = def.empresa
    ? [
        { value: '', label: 'Todas as empresas' },
        ...[...empresasVistas]
          .map((id) => ({ value: id, label: nomeDaEmpresa(dados, id) }))
          .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR')),
      ]
    : []

  /**
   * SEM "TODOS OS SISTEMAS" — o sistema é sempre um.
   *
   * A opção existia e não servia a ninguém: a aba do Fluxo desenha o unifilar de
   * UM sistema, e depois que as colunas `sistema_id`/`sistema_name` saíram da
   * grade (elas repetiam o que a barra diz), "todos" mostrava linhas sem dizer
   * de qual sistema cada uma era. Nas abas de dados ela era pior ainda: é
   * exatamente o modo que monta 3.755 linhas e leva 4 segundos para abrir.
   *
   * A empresa MANTÉM o "todas", e a assimetria é proposital: a empresa é o
   * filtro grosso que encurta a lista de sistemas, e escolher uma antes de
   * escolher o sistema é conveniência, não obrigação.
   */
  const opcSistemas = def.sistema
    ? [
        ...[...sistemas.entries()]
          .map(([value, { nome, empresas }]) => ({
            // 's01 · Alegria' quando a chave é o código; só o nome quando a
            // chave já É o nome — repetir 'Alegria · Alegria' seria ruído.
            value,
            label: nome && nome !== value ? `${value} · ${nome}` : value,
            empresas,
          }))
          .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR', { numeric: true })),
      ]
    : []

  return { empresas: opcEmpresas, sistemas: opcSistemas }
}

/**
 * Os sistemas que sobram depois da empresa escolhida.
 *
 * "Todos os sistemas" fica sempre; um sistema sem empresa (sem cidade declarada)
 * sai quando há empresa escolhida, e é a mesma regra documentada em `indice`.
 */
export const sistemasVisiveis = (opcoes: OpcoesEscopo, empresaId: string) =>
  empresaId ? opcoes.sistemas.filter((s) => !s.value || s.empresas.has(empresaId)) : opcoes.sistemas

/**
 * O SISTEMA COM QUE A ABA DO FLUXO ABRE — e não é o primeiro da lista.
 *
 * A regra vem da aba de representação, que esta absorveu: abrir num sistema sem
 * nenhum destino escolhido mostraria o desenho vazio justamente onde ele deveria
 * demonstrar para que serve. Então: o primeiro que tem destino, e o primeiro da
 * lista só se nenhum tiver.
 *
 * `''` (todos os sistemas) fica de fora de propósito — o desenho precisa de um.
 */
export function sistemaPadraoDoFluxo(dados: Dados): string {
  const { sistemas } = sistemasDoFluxo(dados)
  return (sistemas.find((s) => s.comDestino > 0) ?? sistemas[0])?.id ?? ''
}

/**
 * O RECORTE COM QUE A ABA ABRE — e por que ela não abre em "todos".
 *
 * A aba de obras de sub-bacia tem 3.755 linhas numa unidade média. Abrindo sem
 * recorte, a grade monta as 3.755 × 13 colunas — perto de 49 mil células — e
 * mede 3.940ms para aparecer e 601ms por tecla digitada. Recortada num sistema
 * são ~25 linhas: 24ms e 4ms. Duas ordens de grandeza, medidas.
 *
 * Escolhe o eixo MAIS FINO que a aba declara: sistema quando existe, empresa
 * quando não. É a mesma navegação que o cadastro por fichas já fazia — empresa,
 * depois sistema — e a barra continua lá para trocar ou abrir para todos.
 *
 * DEVOLVE VAZIO quando a aba não tem barra: recortar sem oferecer como mudar o
 * recorte esconderia linhas sem saída. Quem decide se a barra aparece é a tela
 * (`MIN_LINHAS_PARA_ESCOPO`), e por isso ela passa `temBarra`.
 */
export function escopoInicial(opcoes: OpcoesEscopo, temBarra: boolean): Escopo {
  if (!temBarra) return SEM_ESCOPO
  // A PRIMEIRA OPÇÃO REAL, e não a primeira da lista: a barra abre com um item
  // de valor vazio — o "todos" —, e escolhê-lo devolveria justamente o recorte
  // nenhum que este helper existe para evitar.
  const real = (opcoes: OpcaoEscopo[]) => opcoes.find((o) => o.value)?.value ?? ''

  const sistema = real(opcoes.sistemas)
  if (sistema) return { empresaId: '', sistemaId: sistema }
  const empresa = real(opcoes.empresas)
  if (empresa) return { empresaId: empresa, sistemaId: '' }
  return SEM_ESCOPO
}

/** As colunas que a barra já governa — nelas o funil do cabeçalho sai da tela. */
export function colunasDoEscopo(aba: AbaDef): Set<string> {
  const fora = new Set<string>()
  if (!aba.escopo) return fora
  if (aba.escopo.sistema === 'coluna' || aba.escopo.sistema === 'fluxo') {
    fora.add('sistema_id')
    fora.add('sistema_name')
  }
  return fora
}


/**
 * ABAIXO DISTO A BARRA DE ESCOPO NÃO APARECE — mesmo número e mesma razão do
 * `MIN_LINHAS_PARA_FILTRO` do funil de coluna: numa aba que se lê inteira de
 * uma vez, filtrar dá mais trabalho que ler.
 */
export const MIN_LINHAS_PARA_ESCOPO = 15

/**
 * A aba mostra a barra de escopo com este tanto de linhas?
 *
 * UMA REGRA, num lugar só: a tela a usa para decidir o recorte inicial e para
 * desenhar a barra, e os testes de abertura a usam para medir o que a grade
 * monta. Dois testes já a tinham reescrito à mão — e passavam mesmo se as abas
 * da CTS perdessem a barra. Quais abas não esperam as linhas é declaração da
 * própria aba (`EscopoAba.barraSempre`), como o resto do escopo dela.
 *
 * "Sempre" tem um limite que não é daqui: `FiltroEscopo` ainda se esconde quando
 * o eixo tem UMA opção só — um seletor de uma opção é decoração.
 */
export const barraDeEscopoVisivel = (aba: AbaDef, linhas: number): boolean =>
  !!aba.escopo && (!!aba.escopo.barraSempre || linhas >= MIN_LINHAS_PARA_ESCOPO)
