/**
 * O ESCOPO DAS ABAS — cidade + sistema, o par de filtros que recorta toda a grade.
 *
 * O controle nasceu dentro da aba de representação (item 34): dois `Combobox` que
 * escolhiam qual sistema desenhar. Em 20/08/2026 ele virou a barra de TODAS as
 * abas, e este arquivo é a parte que não é tela — dado a resolver, sem React.
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

import type { AbaDef, Cidade, EscopoAba, FonteCidade, FonteSistema, Row } from '../data/cadastroUnidade/types'
import { type Dados, type Sistema, sistemaDoNo, sistemasDoFluxo } from './cadastroFluxo'

const txt = (v: unknown): string => String(v ?? '').trim()

const SEM_SISTEMA: Sistema = { id: '', nome: '' }

/** O recorte escolhido na barra. `''` em qualquer eixo = "todos". */
export interface Escopo {
  cidadeId: string
  sistemaId: string
}

export const SEM_ESCOPO: Escopo = { cidadeId: '', sistemaId: '' }

export const escopoAtivo = (e: Escopo): boolean => !!e.cidadeId || !!e.sistemaId

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

  const novo: IndiceEscopo = { nomePorSistema, cidadesPorSistema, sistemaPorSubbaciaCapex }
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

/** As cidades de uma linha. Mais de uma é normal: um sistema pode atender várias. */
export function cidadesDaLinhaEscopo(
  dados: Dados,
  escopo: EscopoAba,
  fonte: FonteCidade,
  row: Row,
): string[] {
  if (fonte === 'coluna') {
    const c = txt(row.cidade_id)
    return c ? [c] : []
  }
  // 'via-sistema': o vínculo cidade↔sistema é de cadastro, não de linha.
  if (!escopo.sistema) return []
  return cidadesDoSistema(dados, sistemaDaLinhaEscopo(dados, escopo.sistema, row))
}

/** A linha entra no recorte? Eixo em `''` não filtra nada. */
export function casaComEscopo(dados: Dados, aba: AbaDef, row: Row, escopo: Escopo): boolean {
  const def = aba.escopo
  if (!def) return true

  if (escopo.sistemaId && def.sistema) {
    if (chaveSistema(sistemaDaLinhaEscopo(dados, def.sistema, row)) !== escopo.sistemaId) return false
  }
  if (escopo.cidadeId && def.cidade) {
    if (!cidadesDaLinhaEscopo(dados, def, def.cidade, row).includes(escopo.cidadeId)) return false
  }
  return true
}

// ---------------------------------------------------------------- opções

export interface OpcaoEscopo {
  value: string
  label: string
}

export interface OpcoesEscopo {
  /** `[]` quando a aba não declara o eixo de cidade. */
  cidades: OpcaoEscopo[]
  /** `[]` quando a aba não declara o eixo de sistema. */
  sistemas: (OpcaoEscopo & { cidades: Set<string> })[]
}

const VAZIAS: OpcoesEscopo = { cidades: [], sistemas: [] }

/**
 * As opções da barra, montadas a partir das LINHAS da aba — ver a invariante no
 * comentário do topo.
 *
 * Uma passada só pelas linhas, resolvendo os dois eixos de cada uma. O eixo que a
 * aba não declara sai como lista vazia, e a barra não desenha o controle.
 */
export function opcoesEscopo(
  dados: Dados,
  cidadesDaUnidade: Cidade[],
  aba: AbaDef,
  rows: Row[],
): OpcoesEscopo {
  const def = aba.escopo
  if (!def) return VAZIAS

  const cidadesVistas = new Set<string>()
  const sistemas = new Map<string, { nome: string; cidades: Set<string> }>()

  for (const row of rows) {
    // O sistema é resolvido UMA vez por linha e reaproveitado pela cidade: com
    // 'via-sistema' as duas perguntas têm a mesma resposta no meio, e a aba de
    // CAPEX de componentes tem 5 linhas por sub-bacia — resolver duas vezes
    // dobraria o custo de uma passada que roda a cada tecla digitada.
    const s = def.sistema ? sistemaDaLinhaEscopo(dados, def.sistema, row) : null
    const cidadesDaLinha = !def.cidade
      ? []
      : def.cidade === 'coluna'
        ? (txt(row.cidade_id) ? [txt(row.cidade_id)] : [])
        : s
          ? cidadesDoSistema(dados, s)
          : []

    if (s) {
      const k = chaveSistema(s)
      if (k) {
        let alvo = sistemas.get(k)
        if (!alvo) sistemas.set(k, (alvo = { nome: s.nome, cidades: new Set() }))
        else if (!alvo.nome && s.nome) alvo.nome = s.nome
        for (const c of cidadesDaLinha) alvo.cidades.add(c)
      }
    }
    for (const c of cidadesDaLinha) cidadesVistas.add(c)
  }

  const nomeCidade = new Map(cidadesDaUnidade.map((c) => [c.id, c.name]))

  const opcCidades: OpcaoEscopo[] = def.cidade
    ? [
        { value: '', label: 'Todas as cidades' },
        ...[...cidadesVistas]
          .map((id) => ({ value: id, label: nomeCidade.get(id) ?? id }))
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
   * A cidade MANTÉM o "todas", e a assimetria é proposital: a cidade é o filtro
   * grosso que encurta a lista de sistemas, e escolher uma antes de escolher o
   * sistema é conveniência, não obrigação.
   */
  const opcSistemas = def.sistema
    ? [
        ...[...sistemas.entries()]
          .map(([value, { nome, cidades }]) => ({
            // 's01 · Alegria' quando a chave é o código; só o nome quando a
            // chave já É o nome — repetir 'Alegria · Alegria' seria ruído.
            value,
            label: nome && nome !== value ? `${value} · ${nome}` : value,
            cidades,
          }))
          .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR', { numeric: true })),
      ]
    : []

  return { cidades: opcCidades, sistemas: opcSistemas }
}

/**
 * Os sistemas que sobram depois da cidade escolhida.
 *
 * "Todos os sistemas" fica sempre; um sistema sem cidade declarada sai quando há
 * cidade escolhida, e é a mesma regra documentada em `indice`.
 */
export const sistemasVisiveis = (opcoes: OpcoesEscopo, cidadeId: string) =>
  cidadeId ? opcoes.sistemas.filter((s) => !s.value || s.cidades.has(cidadeId)) : opcoes.sistemas

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
 * Escolhe o eixo MAIS FINO que a aba declara: sistema quando existe, cidade
 * quando não. É a mesma navegação que o cadastro por fichas já fazia — cidade,
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
  if (sistema) return { cidadeId: '', sistemaId: sistema }
  const cidade = real(opcoes.cidades)
  if (cidade) return { cidadeId: cidade, sistemaId: '' }
  return SEM_ESCOPO
}

/** As colunas que a barra já governa — nelas o funil do cabeçalho sai da tela. */
export function colunasDoEscopo(aba: AbaDef): Set<string> {
  const fora = new Set<string>()
  if (!aba.escopo) return fora
  if (aba.escopo.cidade === 'coluna') {
    fora.add('cidade_id')
    fora.add('cidade_name')
  }
  if (aba.escopo.sistema === 'coluna' || aba.escopo.sistema === 'fluxo') {
    fora.add('sistema_id')
    fora.add('sistema_name')
  }
  return fora
}
