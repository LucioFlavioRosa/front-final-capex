/**
 * O FLUXO DE ESCOAMENTO COMO GRAFO — a leitura que os itens 21, 22 e 23 pedem.
 *
 * Até 07/08/2026 a aba `sistema-topologia` era um par de colunas de texto livre:
 * quem preenchia digitava o código do destino de cabeça, e a única checagem
 * existente ("destino que não existe") só rodava na Revisão. Os três pedidos de
 * 05/08 mudam isso de lugar — o destino vira lista suspensa filtrada (22), o
 * sistema da CTS passa a ser DERIVADO do destino (21) e a topologia é conferida
 * na própria aba (23) — e os três precisam da mesma coisa: enxergar as linhas do
 * fluxo como arestas de um grafo, com os nós resolvidos contra as abas onde eles
 * de fato existem.
 *
 * É aqui que essa leitura mora, e ela é PURA: recebe o estado do cadastro e
 * devolve resposta, sem tocar em React nem em nada mutável. `cadastroCalc`,
 * `cadastroValidacao`, o `CadastroContext` e a `AbaCell` são todos clientes.
 *
 * TRÊS TIPOS DE NÓ, e o prefixo do código diz qual é (`IDS GERADOS`, em seed.ts):
 *
 *   b001…  sub-bacia   — vive em `subbacia-operacional`
 *   t001…  CTS         — vive em `cts-operacional`
 *   e01…   ETE         — vive em `ete-capex`
 *
 * O prefixo é só pista de leitura para quem olha a tela: aqui o tipo é resolvido
 * por BUSCA na aba correspondente, nunca pela letra. Quando o Databricks trouxer
 * os códigos reais de cada entidade, o prefixo some e este arquivo continua
 * valendo.
 */

import type { Row } from '../data/cadastroUnidade/types'

export type Dados = Record<string, Row[]>
export type TipoNo = 'subbacia' | 'cts' | 'ete' | 'desconhecido'

export interface Sistema {
  id: string
  nome: string
}

const VAZIO: Sistema = { id: '', nome: '' }

const txt = (v: unknown): string => String(v ?? '').trim()

interface Indice {
  subbacia: Map<string, Row>
  cts: Map<string, Row>
  ete: Map<string, Row>
  /** Nome do sistema → código gerado (s01…). O CSV de sub-bacias só traz o nome. */
  idSistemaPorNome: Map<string, string>
  /** Código do nó de origem → a linha do fluxo que sai dele. */
  origem: Map<string, Row>
}

/**
 * O índice é CARO e o `dados` é IMUTÁVEL — então cabe cache, e ele é exato.
 *
 * `subbacia-operacional` tem 1.047 linhas, e `computeCalc` é chamado uma vez por
 * célula derivada a cada render da grade. Reconstruir os mapas em toda chamada
 * seria varrer a base inteira umas cem vezes por tecla digitada.
 *
 * A chave é o próprio objeto `dados`, e é o reducer que garante a correção: toda
 * escrita cria um objeto novo (`{...state.unidade.data, [aba]: novasLinhas}`), então
 * dado alterado é chave nova, e cache velho nunca é servido. `WeakMap` porque o
 * estado antigo deve poder ser coletado assim que o React o soltar.
 */
const cacheIndice = new WeakMap<Dados, Indice>()

function indice(dados: Dados): Indice {
  const emCache = cacheIndice.get(dados)
  if (emCache) return emCache

  const porChave = (aba: string, col: string) => {
    const m = new Map<string, Row>()
    for (const r of dados[aba] ?? []) {
      const k = txt(r[col])
      if (k && !m.has(k)) m.set(k, r)
    }
    return m
  }

  const idSistemaPorNome = new Map<string, string>()
  for (const r of dados['cidade-sistema'] ?? []) {
    const nome = txt(r.sistema_name)
    const id = txt(r.sistema_id)
    if (nome && id && !idSistemaPorNome.has(nome)) idSistemaPorNome.set(nome, id)
  }

  const novo: Indice = {
    subbacia: porChave('subbacia-operacional', 'sub_bacia_id'),
    cts: porChave('cts-operacional', 'cts_id'),
    ete: porChave('ete-capex', 'ete_id'),
    idSistemaPorNome,
    origem: porChave('sistema-topologia', 'componente_sistema_id'),
  }
  cacheIndice.set(dados, novo)
  return novo
}

export function tipoDoNo(dados: Dados, id: string): TipoNo {
  const k = txt(id)
  if (!k) return 'desconhecido'
  const ix = indice(dados)
  if (ix.subbacia.has(k)) return 'subbacia'
  if (ix.cts.has(k)) return 'cts'
  if (ix.ete.has(k)) return 'ete'
  return 'desconhecido'
}

/** Nome legível de um nó, buscado na aba onde ele existe. '' quando não existe. */
export function nomeDoNo(dados: Dados, id: string): string {
  const k = txt(id)
  if (!k) return ''
  const ix = indice(dados)
  const r = ix.subbacia.get(k) ?? ix.cts.get(k) ?? ix.ete.get(k)
  if (!r) return ''
  return txt(r.sub_bacia_name) || txt(r.cts_name) || txt(r.ete_name)
}

/** Rótulo do nó nas listas suspensas: 'b004 · Canal do Cunha'. */
export const rotuloNo = (dados: Dados, id: string): string => {
  const nome = nomeDoNo(dados, id)
  return nome ? `${id} · ${nome}` : id
}

/**
 * SISTEMA DE UM NÓ — e é aqui que o item 21 acontece.
 *
 * Cada tipo responde de um jeito, e a CTS é o caso que motivou o pedido:
 *
 *   SUB-BACIA — o vínculo é real e vem do CSV (coluna SES). O nome do sistema
 *     está na própria linha de `subbacia-operacional`; o código (s01…) é gerado e
 *     vive em `cidade-sistema`, então ele é buscado pelo nome.
 *   ETE — o sistema que ela atende é coluna própria da aba de CAPEX das ETEs.
 *   CTS — NÃO TEM vínculo em fonte nenhuma. Wagner, 34:37: *"não existe, na CTS,
 *     um vínculo que diga em qual sistema de sub-bacias essa CTS está. Não existe
 *     essa informação em nenhum lugar."* Existe um "sistema de CTS" na base, mas
 *     ele não tem relação com o sistema das sub-bacias. Então o sistema da CTS é o
 *     do NÓ PARA ONDE ELA DESÁGUA — é o que o fluxo já diz, e pedir de novo em
 *     campo próprio só abriria espaço para as duas informações discordarem.
 *
 * `visitados` é a proteção contra ciclo, e ele é alcançável: uma CTS pode desaguar
 * em outra CTS (regra do item 22), e duas apontando uma para a outra fariam esta
 * função se chamar para sempre. Com o conjunto, a segunda visita devolve vazio —
 * o mesmo que a validação de topologia (item 23) já reporta como cadeia que não
 * fecha.
 */
export function sistemaDoNo(dados: Dados, id: string, visitados = new Set<string>()): Sistema {
  const k = txt(id)
  if (!k || visitados.has(k)) return VAZIO
  visitados.add(k)

  const ix = indice(dados)

  /**
   * A TOPOLOGIA MANDA, e vem antes de tudo.
   *
   * `sistema_topologia.sistema_id` diz em que sistema o componente esta — para
   * sub-bacia, CTS e ETE igualmente. Antes esta funcao perguntava a cada ficha
   * (a sub-bacia carregava o nome do sistema, a ETE o id) e, para a CTS,
   * DERIVAVA o sistema seguindo o destino dela no fluxo, recursivamente.
   *
   * A derivacao era consequencia do modelo antigo, em que o vinculo CTS↔sistema
   * nao existia em fonte nenhuma. Hoje existe: e a coluna que a tela do Fluxo
   * preenche ao adicionar a CTS. Derivar por cima disso daria respostas
   * diferentes para a mesma pergunta — uma CTS recem-adicionada, ainda sem
   * jusante, ficaria "sem sistema" mesmo estando num.
   */
  const naTopologia = txt(ix.origem.get(k)?.sistema_id)
  if (naTopologia) {
    return { id: naTopologia, nome: nomeSistemaPorId(dados, naTopologia) }
  }

  const sb = ix.subbacia.get(k)
  if (sb) {
    const nome = txt(sb.sistema_name)
    return { id: ix.idSistemaPorNome.get(nome) ?? txt(sb.sistema_id), nome }
  }

  const ete = ix.ete.get(k)
  if (ete) {
    const id2 = txt(ete.sistema_id)
    return { id: id2, nome: txt(ete.sistema_name) || nomeSistemaPorId(dados, id2) }
  }

  if (ix.cts.has(k)) {
    const linha = ix.origem.get(k)
    const destino = txt(linha?.componente_sistema_id_jusante)
    if (!destino) return VAZIO
    return sistemaDoNo(dados, destino, visitados)
  }

  return VAZIO
}

function nomeSistemaPorId(dados: Dados, id: string): string {
  if (!id) return ''
  for (const [nome, sid] of indice(dados).idSistemaPorNome) if (sid === id) return nome
  return ''
}

/** Sistema de uma CTS, derivado do destino dela no fluxo (item 21). */
export const sistemaDaCts = (dados: Dados, ctsId: string): Sistema => sistemaDoNo(dados, ctsId)

/** Os nós que aparecem como ORIGEM no fluxo, na ordem em que a aba os lista. */
const origensDoFluxo = (dados: Dados): string[] =>
  (dados['sistema-topologia'] ?? [])
    .map((r) => txt(r.componente_sistema_id))
    .filter(Boolean)

/**
 * CATÁLOGO DAS LISTAS SUSPENSAS — cache, e ele não é otimização prematura.
 *
 * As opções dependem só do cadastro, mas a célula que as pede é uma POR LINHA, e
 * a aba do Fluxo passou a ter uma linha por sub-bacia da amostra mais uma por CTS
 * da unidade — 221 na maior. A primeira versão montava a lista de origens dentro
 * de `opcoesOrigem`, varrendo as 1.047 sub-bacias da base e derivando o sistema de
 * cada uma: 221 × 1.047 travessias a cada render da grade, ou seja, a cada tecla
 * digitada em qualquer célula da aba. A grade não terminava de desenhar.
 *
 * Aqui a varredura acontece UMA VEZ por versão do cadastro, e o que sobra por
 * linha é filtrar uma lista de algumas centenas de códigos já prontos. Mesma
 * chave e mesma garantia de `indice`: o reducer cria um objeto novo a cada
 * escrita, então cache velho nunca é servido.
 */
interface Catalogo {
  /** Sub-bacias que o fluxo modela, na ordem da aba. */
  subbaciasDoFluxo: string[]
  /**
   * TODAS as sub-bacias do cadastro (1.047 na unidade 56), e não só as que o
   * fluxo modela. É a lista do pareamento sub-bacia · CTS: lá a pergunta é "qual
   * sub-bacia este coletor atende", e ela não depende de a sub-bacia já ter
   * escoamento declarado.
   */
  subbaciasTodas: string[]
  ctss: string[]
  etes: string[]
  /** Sistemas do cadastro: `[id, 'id · nome']`. Lista do vínculo ETE → sistema. */
  sistemas: [string, string][]
  /** Código do nó → código do sistema dele. Evita re-derivar a cada filtro. */
  sistemaDe: Map<string, string>
  /** Rótulo 'b004 · Canal do Cunha' de cada nó, montado uma vez só. */
  rotulos: Map<string, string>
  /**
   * Quem pode ser origem de uma linha NOVA: as sub-bacias dos sistemas que o
   * fluxo já modela, mais todas as CTS, menos quem já é origem de alguma linha
   * (a saída de um nó é sempre uma).
   */
  origensLivres: string[]
}

const cacheCatalogo = new WeakMap<Dados, Catalogo>()

function catalogo(dados: Dados): Catalogo {
  const emCache = cacheCatalogo.get(dados)
  if (emCache) return emCache

  const origens = origensDoFluxo(dados)
  const usados = new Set(origens)

  const sistemaDe = new Map<string, string>()
  const sistemaCache = (id: string): string => {
    const j = sistemaDe.get(id)
    if (j !== undefined) return j
    const s = sistemaDoNo(dados, id).id
    sistemaDe.set(id, s)
    return s
  }

  const subbaciasDoFluxo = origens.filter((id) => tipoDoNo(dados, id) === 'subbacia')
  const subbaciasTodas = (dados['subbacia-operacional'] ?? [])
    .map((r) => txt(r.sub_bacia_id))
    .filter(Boolean)
  const ctss = (dados['cts-operacional'] ?? []).map((r) => txt(r.cts_id)).filter(Boolean)
  const etes = (dados['ete-capex'] ?? []).map((r) => txt(r.ete_id)).filter(Boolean)

  /**
   * Os sistemas saem de `cidade-sistema` (a aba oculta que guarda o par id+nome)
   * e do próprio fluxo, porque nem todo sistema do fluxo precisa estar declarado
   * lá. Sem nome, o rótulo é o código puro — melhor que omitir a opção.
   */
  const nomeSistema = new Map<string, string>()
  for (const aba of ['cidade-sistema', 'sistema-topologia'] as const) {
    for (const r of dados[aba] ?? []) {
      const id = txt(r.sistema_id)
      if (!id) continue
      const nome = txt(r.sistema_name)
      if (!nomeSistema.has(id) || (!nomeSistema.get(id) && nome)) nomeSistema.set(id, nome)
    }
  }
  const sistemas: [string, string][] = [...nomeSistema.entries()]
    .map(([id, nome]) => [id, nome ? `${id} · ${nome}` : id] as [string, string])
    .sort((a, b) => a[1].localeCompare(b[1], 'pt-BR', { numeric: true }))

  const sistemasDoFluxo = new Set(subbaciasDoFluxo.map(sistemaCache).filter(Boolean))
  etes.forEach(sistemaCache)

  const origensLivres = [
    ...(dados['subbacia-operacional'] ?? [])
      .map((r) => txt(r.sub_bacia_id))
      .filter((id) => id && !usados.has(id) && sistemasDoFluxo.has(sistemaCache(id))),
    ...ctss.filter((id) => !usados.has(id)),
  ]

  const rotulos = new Map<string, string>()
  for (const id of [...subbaciasDoFluxo, ...subbaciasTodas, ...ctss, ...etes, ...origensLivres]) {
    if (!rotulos.has(id)) rotulos.set(id, rotuloNo(dados, id))
  }

  const novo: Catalogo = {
    subbaciasDoFluxo, subbaciasTodas, ctss, etes, sistemas, sistemaDe, rotulos, origensLivres,
  }
  cacheCatalogo.set(dados, novo)
  return novo
}

const comRotulo = (cat: Catalogo, ids: string[]): [string, string][] =>
  ids.map((id) => [id, cat.rotulos.get(id) ?? id])

/**
 * OPÇÕES DE DESTINO — a regra do item 22, e a assimetria dela é o conteúdo.
 *
 * Wagner formulou três vezes até fechar (29:53): *"quando um nó origem for uma
 * sub-bacia, a lista suspensa de destinos dela vai ser as sub-bacias do sistema e
 * a ETE daquele sistema. Quando a linha for uma CTS, vai poder ser todas as
 * sub-bacias, todas as outras CTS e todas as ETEs."*
 *
 * O motivo de a sub-bacia ser filtrada e a CTS não veio dos dois interlocutores,
 * de ângulos diferentes. Lúcio (27:23): o filtro MITIGA ERRO DE PREENCHIMENTO,
 * porque o vínculo sub-bacia → sistema existe no Databricks e pode ser cobrado.
 * Wagner (28:39), sobre a CTS: *"aí vai ser a listagem completa, não vai ter como
 * minimizar erro nesse caso, porque a gente não tem esse vínculo — e eu nem sei,
 * eu nem quero ter, quais CTS podem ir para quais."*
 *
 * Duas regras a mais saíram da mesma conversa e estão embutidas aqui:
 *
 *   SUB-BACIA NUNCA DESÁGUA EM CTS (27:57 — *"eu acho que nunca vai acontecer de
 *     uma sub-bacia esgotar numa CTS; o contrário pode"*). Por isso a lista da
 *     sub-bacia não tem CTS nenhuma, nem as do próprio sistema.
 *   A SAÍDA É SEMPRE UMA (36:34 — *"uma sub-bacia não é possível ser destinada
 *     para duas; a saída é sempre uma"*). Isso é o que faz a aba ter uma linha por
 *     origem, e está garantido em `opcoesOrigem`, não aqui.
 *
 * A ETE vem por último de propósito: ela é o fim do caminho, e a lista fica
 * lendo-se como o percurso — as vizinhas primeiro, a estação depois.
 */
export function opcoesDestino(dados: Dados, row: Row): [string, string][] {
  const origem = txt(row.componente_sistema_id)
  const cat = catalogo(dados)

  /**
   * QUALQUER COMPONENTE DO MESMO SISTEMA — sub-bacia, CTS ou ETE.
   *
   * A regra e a do servidor, e nao uma escolha de tela: o jusante tem de apontar
   * para dentro do mesmo sistema (a ETE que fecha o caminho e a DELE), e nao pode
   * ser o proprio componente. O resto ele aceita.
   *
   * Duas listas erradas viviam aqui. Para origem sub-bacia, o destino oferecia
   * so sub-bacias e ETEs — a CTS ficava de fora, e nao havia como declarar que
   * uma sub-bacia escoa para o coletor. Para origem CTS, nao havia filtro NENHUM:
   * a lista oferecia componentes de outros sistemas, que o servidor recusa (422).
   * As duas vinham do modelo antigo, em que a CTS nao tinha sistema.
   *
   * ORIGEM SEM SISTEMA herda a lista completa, e nao um select vazio que
   * pareceria quebrado: e o estado de uma CTS recem-adicionada em unidade cujo
   * cadastro ainda esta sendo montado.
   */
  // `cat.sistemaDe` e um cache PARCIAL: ele so tem os ids que alguem ja
  // resolveu. Consulta-lo direto devolvia `undefined` para a CTS — que nunca
  // passava por ali —, e `undefined !== meu` a excluia da lista em silencio. O
  // resolvedor abaixo usa o cache quando ele tem a resposta e calcula quando
  // nao tem.
  const sistemaDe = (id: string) => cat.sistemaDe.get(id) ?? sistemaDoNo(dados, id).id
  const meu = sistemaDe(origem)
  const mesmoSistema = (id: string) => !meu || sistemaDe(id) === meu
  return comRotulo(
    cat,
    [...cat.subbaciasDoFluxo, ...cat.ctss, ...cat.etes].filter(
      (id) => id !== origem && mesmoSistema(id),
    ),
  )
}

/**
 * OPÇÕES DE ORIGEM — o outro lado do item 22, e o que torna a aba editável.
 *
 * Até aqui não havia como cadastrar um escoamento que o `seed` não tivesse
 * criado: a aba não tinha "Adicionar linha". Com o item 28 dizendo que cada linha
 * é "uma sub-bacia OU uma CTS de origem", ela precisa das duas coisas — a linha
 * nova e a lista de quem pode ocupá-la.
 *
 * O que a lista oferece: as sub-bacias dos sistemas que o fluxo já modela e todas
 * as CTS da unidade. Não são as 1.047 sub-bacias da base — a base não tem recorte
 * por unidade, e despejá-las aqui daria uma lista impossível de usar e cheia de
 * sub-bacia de outra ponta do país.
 *
 * O QUE JÁ É ORIGEM SAI DA LISTA, e é a regra da saída única (Wagner, 36:34):
 * duas linhas com a mesma origem seriam dois destinos para o mesmo nó, e o motor
 * indexa os nós por id — ele ficaria com o último e perderia o outro em silêncio.
 * É a mesma duplicata que `validarCadastro` já acusa; aqui ela fica impossível de
 * criar.
 *
 * A lista NÃO depende da linha, e é de propósito: como toda origem já usada sai
 * dela, o valor da própria linha também sai — e uma lista igual para as 221
 * linhas é uma lista só, montada uma vez. Quem repõe o valor atual no `<select>` é
 * a `AbaCell`, que já precisava fazer isso para o caso do código órfão.
 */
export function opcoesOrigem(dados: Dados): [string, string][] {
  const cat = catalogo(dados)
  return comRotulo(cat, cat.origensLivres)
}

/**
 * AS CÉLULAS QUE SÃO LISTA SUSPENSA DE ENTIDADE — e por que isto deixou de ser
 * um `Set` de nomes de coluna.
 *
 * Era `COLUNAS_DINAMICAS`, um conjunto de duas colunas usado com um
 * `abaKey === 'sistema-topologia'` cravado ao lado, no `AbaCell`. Serviu enquanto
 * a única aba com escolha de entidade era a do Fluxo.
 *
 * DEIXOU DE SERVIR em 20/08/2026, quando a auditoria de "o que o cadastro NÃO
 * deixa preencher" achou duas lacunas reais — e as duas eram células que
 * precisavam justamente desta lista:
 *
 *   `subbacia-cts` — a aba do pareamento não tinha UMA célula editável. Os quatro
 *     campos eram 'db', e a aba não tinha "Adicionar linha": ela era uma tela de
 *     cadastro onde nada podia ser cadastrado. Declarar qual CTS atende qual
 *     sub-bacia é o propósito inteiro dela.
 *   `ete-capex.sistema_id` — o vínculo ETE → sistema estava travado, e nenhuma
 *     fonte o traz ("a aba inteira é exemplo"). Ou seja: era impossível dizer qual
 *     sistema uma ETE atende — e é exatamente esse vínculo que `opcoesDestino`
 *     precisa para oferecer a ETE como destino, e que `unifilarDoSistema` precisa
 *     para fechar o desenho.
 *
 * Devolve `null` quando a célula não é lista, que é o caso da esmagadora maioria.
 */
export function opcoesDaCelula(
  dados: Dados,
  abaKey: string,
  col: string,
  row: Row,
): [string, string][] | null {
  if (abaKey === 'sistema-topologia') {
    if (col === 'componente_sistema_id') return opcoesOrigem(dados)
    if (col === 'componente_sistema_id_jusante') return opcoesDestino(dados, row)
    return null
  }
  if (abaKey === 'subbacia-cts') {
    const cat = catalogo(dados)
    // TODAS as sub-bacias, não só as do fluxo: o pareamento não depende de a
    // sub-bacia já ter escoamento declarado. E todas as CTS, pelo mesmo motivo
    // que `opcoesDestino` não filtra CTS — o vínculo CTS↔sistema não existe em
    // fonte nenhuma (Wagner, 28:39).
    if (col === 'sub_bacia_id') return comRotulo(cat, cat.subbaciasTodas)
    if (col === 'cts_id') return comRotulo(cat, cat.ctss)
    return null
  }
  if (abaKey === 'ete-capex' && col === 'sistema_id') return catalogo(dados).sistemas
  return null
}

/**
 * PREENCHIMENTO ACOMPANHADO — o nome (e o sistema) que vêm junto do código.
 *
 * A célula do fluxo guarda o CÓDIGO, mas a aba mostra código e nome lado a lado,
 * e o sistema na primeira coluna. Escolher 'b004' precisa preencher os três, ou a
 * linha fica com o código novo e o nome do anterior — que é exatamente o tipo de
 * divergência que ninguém percebe olhando a tela.
 *
 * É a generalização da regra que `cidade_id → cidade_name` já tinha no reducer:
 * ali era um `if` com o nome da coluna cravado, aqui é uma função por aba. Sem
 * isso, colar em lote (que escreve por `SET_CELLS`) deixaria nome e id
 * divergentes em 200 linhas de uma vez.
 *
 * O SISTEMA só acompanha quando a origem é SUB-BACIA. Para CTS ele fica em branco
 * de propósito: uma CTS não tem sistema próprio, o dela é derivado do destino
 * (item 21) e aparece calculado na aba Dados da CTS. Gravar aqui um sistema para
 * a CTS seria fabricar o vínculo que Wagner disse não existir.
 */
export function espelharColunas(
  dados: Dados,
  abaKey: string,
  col: string,
  valor: string,
): Record<string, string> {
  /**
   * O PAREAMENTO SUB-BACIA · CTS entrou aqui em 20/08/2026, junto de os dois
   * códigos dele deixarem de ser travados (ver `opcoesDaCelula`). Os nomes
   * continuam 'db' na tela e é isto que os preenche — sem o espelho, escolher a
   * CTS deixaria o nome da anterior ao lado do código novo.
   */
  if (abaKey === 'subbacia-cts') {
    if (col === 'sub_bacia_id') return { sub_bacia_name: nomeDoNo(dados, valor) }
    if (col === 'cts_id') return { cts_name: nomeDoNo(dados, valor) }
    return {}
  }

  if (abaKey !== 'sistema-topologia') return {}

  if (col === 'componente_sistema_id_jusante') {
    return { componente_sistema_nome_jusante: nomeDoNo(dados, valor) }
  }

  if (col === 'componente_sistema_id') {
    const sistema = tipoDoNo(dados, valor) === 'subbacia' ? sistemaDoNo(dados, valor) : VAZIO
    return {
      componente_sistema_nome: nomeDoNo(dados, valor),
      sistema_id: sistema.id,
      sistema_name: sistema.nome,
    }
  }

  return {}
}

/**
 * CAMINHO ATÉ A ETE — a mesma caminhada que o motor faz, reproduzida aqui.
 *
 * `otimizador_capex_v62.py:120`:
 *
 *   def caminho(cen,no):
 *       seg=[];cur=no;g=0
 *       while cur!="ETE" and cur in cen.nos and g<200: seg.append(cur);cur=cen.nos[cur].jusante;g+=1
 *       return seg
 *
 * O `g<200` é proteção contra ciclo e o `cur in cen.nos` é a saída para destino
 * vazio — e nos DOIS casos o caminho termina sem ETE, a sub-bacia nunca fatura, e
 * nada acusa erro. É essa falha silenciosa que o item 23 antecipa. Aqui a mesma
 * caminhada devolve o motivo da parada, em vez de só parar.
 */
export type FimDoCaminho = 'ete' | 'sem-destino' | 'destino-inexistente' | 'ciclo'

/**
 * ============================================================================
 * A REPRESENTAÇÃO (UNIFILAR) — item 34, pedido na reunião de 04/08/2026.
 * ============================================================================
 *
 * O pedido é de Wagner (15:01), depois de perguntar onde o unifilar tinha ido
 * parar (13:27): *"podem ficar numa aba só, mas mostrando o unifilar. E aí, se
 * vocês quiserem, dá até para botar uns filtros que são respectivos a esses
 * dados. Eu quero filtrar os unifilares que estão na cidade tal."* Lúcio fechou o
 * formato (16:50): *"talvez criar uma aba só para mostrar a representação, porque
 * daí a pessoa cadastra tudo e tal, até para não ficar misturando assunto — e daí
 * vai lá na outra, você digita qual cidade, qual sistema você quer mostrar."*
 *
 * Wagner também fixou a ordem (15:17): *"a topologia tem que vir primeiro"* — o
 * Fluxo de escoamento é onde se preenche, a representação é onde se confere.
 *
 * O QUE ESTAS FUNÇÕES SÃO: a mesma leitura de grafo que os itens 21–23 já fazem,
 * agora devolvida como desenho — nós com nível e arestas. Elas não sabem nada de
 * pixel; posição é assunto de `Unifilar.tsx`.
 *
 * A FONTE É A ABA DO FLUXO, e essa escolha é deliberada. `tipoDoNo` e `nomeDoNo`
 * resolvem o nó contra a aba onde ele vive, o que é o certo e é o que dá o TIPO —
 * mas hoje há cadastro no banco cujas colunas de entidade vêm com o nome da
 * planilha do otimizador (`sub_bacia` em vez de `sub_bacia_id`), e nele a busca
 * não acha nada. Como o id, o nome e a aresta estão na PRÓPRIA linha do fluxo
 * (`componente_sistema_nome`, `_id_jusante`), o desenho continua correto nos dois
 * casos: o que se perde é o tipo, e nó de tipo desconhecido é desenhado neutro em
 * vez de sumir. Um desenho que só funciona com uma das duas cargas seria pior.
 */

export interface NoUnifilar {
  id: string
  nome: string
  tipo: TipoNo
  /** 1 = cabeceira (nada deságua nele). A ETE termina no último. */
  nivel: number
  /** Não declarou destino — a cadeia morre aqui. Nunca vale para ETE. */
  pontaSolta: boolean
  /** O caminho a partir daqui volta sobre si mesmo (a regra 3 da validação). */
  emCiclo: boolean
}

export interface ArestaUnifilar {
  de: string
  para: string
}

export interface UnifilarSistema {
  /** Os nós que formam o fluxo de escoamento, mais as ETEs do sistema. */
  nos: NoUnifilar[]
  arestas: ArestaUnifilar[]
  /**
   * Origens sem entrada NEM saída. Ficam fora do desenho de propósito: não são
   * fluxo de escoamento, são lista — e como caixa solta numa faixa de 18 (o que o cadastro
   * real da unidade 56 tem hoje) elas empurrariam o fluxo de escoamento para fora da tela
   * sem desenhar uma única seta.
   */
  soltos: NoUnifilar[]
  niveis: number
}

export interface SistemaDoFluxo extends Sistema {
  /** Cidades que declaram este sistema em `cidade-sistema`. Vazio quando nenhuma. */
  cidades: string[]
  linhas: number
  comDestino: number
}

export interface SistemasDoFluxo {
  sistemas: SistemaDoFluxo[]
  /**
   * Origens cujo sistema ainda não dá para saber: CTS sem destino escolhido. O
   * sistema da CTS É o do destino dela (item 21), então antes da escolha ela não
   * pertence a sistema nenhum e não pode aparecer em nenhum desenho. São 102 na
   * unidade 56 — número grande o suficiente para a tela ter de explicá-lo, em vez
   * de deixar a pessoa procurando as CTS que não estão lá.
   */
  semSistema: number
}

/**
 * O sistema de uma linha do fluxo: o declarado, ou o derivado do destino.
 *
 * A coluna `sistema_id` da aba vem preenchida para sub-bacia e vazia para CTS —
 * ver `espelharColunas`, que se recusa a fabricar o vínculo que Wagner disse não
 * existir (34:37). Para a CTS, quem responde é `sistemaDoNo`, caminhando até
 * achar quem tem sistema próprio.
 */
const sistemaDaLinha = (dados: Dados, row: Row): string =>
  txt(row.sistema_id) || sistemaDoNo(dados, txt(row.componente_sistema_id)).id

/** Os sistemas que a aba do Fluxo descreve, para a lista suspensa da representação. */
export function sistemasDoFluxo(dados: Dados): SistemasDoFluxo {
  const cidadesPorSistema = new Map<string, string[]>()
  const nomePorId = new Map<string, string>()
  for (const r of dados['cidade-sistema'] ?? []) {
    const sid = txt(r.sistema_id)
    if (!sid) continue
    const nome = txt(r.sistema_name)
    if (nome && !nomePorId.has(sid)) nomePorId.set(sid, nome)
    const cid = txt(r.cidade_id)
    // Sistema sem cidade declarada NÃO é descartado: é o caso do sistema real da
    // amostra ('nenhuma fonte diz qual cidade ele atende', ver `cidade-sistema`
    // no schema). Ele entra com a lista de cidades vazia, e só aparece quando o
    // filtro de cidade está em "todas" — que é por isso que "todas" é o padrão.
    if (!cidadesPorSistema.has(sid)) cidadesPorSistema.set(sid, [])
    if (cid) cidadesPorSistema.get(sid)!.push(cid)
  }

  const acc = new Map<string, SistemaDoFluxo>()
  let semSistema = 0

  for (const r of dados['sistema-topologia'] ?? []) {
    if (!txt(r.componente_sistema_id)) continue
    const sid = sistemaDaLinha(dados, r)
    if (!sid) {
      semSistema++
      continue
    }
    let s = acc.get(sid)
    if (!s) {
      s = {
        id: sid,
        nome: nomePorId.get(sid) || txt(r.sistema_name),
        cidades: cidadesPorSistema.get(sid) ?? [],
        linhas: 0,
        comDestino: 0,
      }
      acc.set(sid, s)
    }
    s.linhas++
    if (txt(r.componente_sistema_id_jusante)) s.comDestino++
  }

  return {
    sistemas: [...acc.values()].sort((a, b) => (a.nome || a.id).localeCompare(b.nome || b.id, 'pt-BR')),
    semSistema,
  }
}

/**
 * O desenho de um sistema: nós, arestas e níveis.
 *
 * NÍVEL POR KAHN, e não pela recursão que o unifilar antigo usava. A recursão
 * (`1 + max(nivel dos predecessores)`) estourava a pilha em ciclo, e ciclo aqui
 * não é hipótese: é a terceira regra da validação de topologia, e a aba permite
 * criá-lo com duas escolhas na lista suspensa. Kahn termina sempre, e o que
 * sobra sem entrar na ordenação é exatamente o que está preso em ciclo — que
 * então vai para um nível próprio, no fim, marcado.
 */
export function unifilarDoSistema(dados: Dados, sistemaId: string): UnifilarSistema {
  const alvo = txt(sistemaId)
  const nos = new Map<string, NoUnifilar>()
  const arestas: ArestaUnifilar[] = []
  const temSaida = new Set<string>()
  const temEntrada = new Set<string>()

  const anotar = (id: string, nomeNaLinha: string): NoUnifilar => {
    const existente = nos.get(id)
    if (existente) {
      if (!existente.nome) existente.nome = nomeNaLinha
      return existente
    }
    const novo: NoUnifilar = {
      id,
      // O nome da aba de entidade vem primeiro (é o que o resto da tela mostra);
      // o da própria linha do fluxo é a rede de segurança descrita no topo.
      nome: nomeDoNo(dados, id) || nomeNaLinha,
      tipo: tipoDoNo(dados, id),
      nivel: 1,
      pontaSolta: false,
      emCiclo: false,
    }
    nos.set(id, novo)
    return novo
  }

  for (const r of dados['sistema-topologia'] ?? []) {
    const origem = txt(r.componente_sistema_id)
    if (!origem || sistemaDaLinha(dados, r) !== alvo) continue

    anotar(origem, txt(r.componente_sistema_nome))
    const destino = txt(r.componente_sistema_id_jusante)
    if (!destino) continue

    /**
     * O DESTINO ENTRA MESMO SENDO DE OUTRO SISTEMA, e isso é dado, não descuido:
     * a CTS pode desaguar em qualquer sub-bacia, CTS ou ETE (item 22, sem filtro
     * nenhum). Cortar a aresta na fronteira do sistema esconderia justamente o
     * caso em que o esgoto sai do sistema — e é o desenho que existe para
     * mostrar isso.
     */
    anotar(destino, txt(r.componente_sistema_nome_jusante))
    arestas.push({ de: origem, para: destino })
    temSaida.add(origem)
    temEntrada.add(destino)
  }

  /**
   * A ETE DO SISTEMA ENTRA SEMPRE, mesmo sem nada desaguando nela.
   *
   * É a âncora do desenho: sem ela, o sistema cujas origens ainda não têm
   * destino — o estado em que TODO cadastro nasce, e o da unidade 56 hoje —
   * abriria a aba com um retângulo vazio. Com ela, a leitura é imediata: a
   * estação está ali, e nada chega nela ainda.
   */
  for (const r of dados['ete-capex'] ?? []) {
    const id = txt(r.ete_id)
    if (id && txt(r.sistema_id) === alvo) anotar(id, txt(r.ete_name))
  }

  // ---- níveis (Kahn) ----
  const entrada = new Map<string, number>()
  for (const id of nos.keys()) entrada.set(id, 0)
  for (const a of arestas) entrada.set(a.para, (entrada.get(a.para) ?? 0) + 1)

  const fila = [...nos.keys()].filter((id) => (entrada.get(id) ?? 0) === 0)
  const ordenados = new Set<string>(fila)
  for (let i = 0; i < fila.length; i++) {
    const atual = fila[i]
    const nivelAtual = nos.get(atual)!.nivel
    for (const a of arestas) {
      if (a.de !== atual) continue
      const vizinho = nos.get(a.para)!
      if (vizinho.nivel < nivelAtual + 1) vizinho.nivel = nivelAtual + 1
      const restante = (entrada.get(a.para) ?? 0) - 1
      entrada.set(a.para, restante)
      if (restante === 0 && !ordenados.has(a.para)) {
        ordenados.add(a.para)
        fila.push(a.para)
      }
    }
  }

  const maiorNivel = [...ordenados].reduce((m, id) => Math.max(m, nos.get(id)!.nivel), 0)
  for (const no of nos.values()) {
    if (!ordenados.has(no.id)) {
      no.emCiclo = true
      no.nivel = maiorNivel + 1
    }
    // Ponta solta: não tem para onde escoar. A ETE é a exceção — ela É o fim do
    // caminho, e marcá-la seria acusar de defeito o único nó que deve terminar.
    no.pontaSolta = !temSaida.has(no.id) && no.tipo !== 'ete'
  }

  const soltos: NoUnifilar[] = []
  const noFluxo: NoUnifilar[] = []
  for (const no of nos.values()) {
    const isolado = !temSaida.has(no.id) && !temEntrada.has(no.id) && no.tipo !== 'ete'
    ;(isolado ? soltos : noFluxo).push(no)
  }

  // Renumera os níveis para não deixar buraco depois de tirar os soltos: sem
  // isso um sistema todo solto deixaria a ETE no nível 2, com uma faixa vazia
  // acima dela.
  const usados = [...new Set(noFluxo.map((n) => n.nivel))].sort((a, b) => a - b)
  const novoNivel = new Map(usados.map((n, i) => [n, i + 1]))
  for (const no of noFluxo) no.nivel = novoNivel.get(no.nivel) ?? 1

  return {
    nos: noFluxo.sort((a, b) => a.nivel - b.nivel || a.id.localeCompare(b.id)),
    arestas: arestas.filter((a) => nos.has(a.de) && nos.has(a.para)),
    soltos: soltos.sort((a, b) => a.id.localeCompare(b.id)),
    niveis: usados.length,
  }
}

export function caminhoAteEte(dados: Dados, origem: string): FimDoCaminho {
  const ix = indice(dados)
  const visitados = new Set<string>()
  let atual = txt(origem)

  for (let g = 0; g < 200; g++) {
    if (visitados.has(atual)) return 'ciclo'
    visitados.add(atual)

    if (ix.ete.has(atual)) return 'ete'

    const linha = ix.origem.get(atual)
    // O nó existe no cadastro mas não tem linha no fluxo (nunca é origem): a
    // cadeia morre nele. É o mesmo estrago do destino em branco, e o texto do
    // problema é o mesmo — por isso o mesmo veredito.
    if (!linha) return tipoDoNo(dados, atual) === 'desconhecido' ? 'destino-inexistente' : 'sem-destino'

    const destino = txt(linha.componente_sistema_id_jusante)
    if (!destino) return 'sem-destino'
    if (ix.ete.has(destino)) return 'ete'
    atual = destino
  }
  return 'ciclo'
}
