/**
 * BLOCOS — o agrupamento das abas do cadastro nos 6 blocos de navegação.
 *
 * Era uma const privada dentro de `CadastroWizard.tsx`. Saiu de lá quando três
 * telas passaram a precisar do mesmo agrupamento: o wizard (navegação em dois
 * níveis), o chip de progresso (lista expandida) e a Revisão (completude por
 * aba). Manter cópias em três lugares é o caminho garantido para elas
 * discordarem entre si.
 *
 * É derivação PURA do `SCHEMA`: cada aba que declara `bloco` abre um bloco
 * novo, e as seguintes sem `bloco` pertencem a ele. Acrescentar uma aba
 * continua sendo editar um arquivo só.
 */

import { SCHEMA } from './schema'
import type { AbaDef, Row } from './types'
import { contarAba } from '../../domain/calc'

export interface Bloco {
  nome: string
  abas: AbaDef[]
}

/**
 * A ORDEM DOS DOIS PASSOS IMPORTA — e é o detalhe que faz as abas ocultas
 * (`ocultaNoWizard`) não levarem o nome do bloco embora.
 *
 * O nome de cada bloco vive na PRIMEIRA aba dele, e duas das quatro abas ocultadas
 * em 05/08/2026 eram exatamente a primeira do seu bloco: `regional-superintendencia`
 * declara "Estrutura". Filtrar antes de agrupar apagaria esse rótulo e faria as abas
 * seguintes cairem no bloco anterior.
 *
 * Então: agrupa sobre o SCHEMA inteiro, e só depois filtra dentro de cada bloco,
 * descartando bloco que ficou sem nenhuma aba visível.
 */
export const BLOCOS: Bloco[] = SCHEMA.reduce<Bloco[]>((acc, aba) => {
  if (aba.bloco || acc.length === 0) acc.push({ nome: aba.bloco ?? 'Cadastro', abas: [] })
  acc[acc.length - 1].abas.push(aba)
  return acc
}, [])
  .map((bloco) => ({ ...bloco, abas: bloco.abas.filter((a) => !a.ocultaNoWizard) }))
  .filter((bloco) => bloco.abas.length > 0)

/**
 * As abas que a Revisão e a completude consideram: as visíveis.
 *
 * Existe porque `SCHEMA` deixou de ser sinônimo de "o que aparece". Aba oculta não
 * tem campo que alguém possa preencher, então contá-la na completude produziria um
 * percentual que nunca fecha — e a Revisão bloquearia a rodada para sempre.
 * `validarCadastro` é a exceção deliberada: ela varre o SCHEMA inteiro, porque as
 * FKs das abas ocultas continuam valendo.
 *
 * O filtro tinha um segundo termo (`!a.semDados`) até 20/08/2026, para a aba de
 * representação: ela não tinha coluna nenhuma, `contarAba` devolvia `total: 0` e
 * `progressoAba` a classificava como 'so-db' — a Revisão exibiria "OK · somente
 * Databricks" para uma aba que não tinha dado nem vinha do Databricks. Com a fusão
 * do desenho na aba do Fluxo, não existe mais aba sem coluna, e o termo saiu.
 */
export const ABAS_VISIVEIS: AbaDef[] = SCHEMA.filter((a) => !a.ocultaNoWizard)

/**
 * Índice no SCHEMA → posição no stepper (bloco + aba).
 *
 * A Revisão navega por índice de SCHEMA (`irPasso`), não por bloco/aba. Sem
 * este mapa, clicar em "editar" lá levaria sempre à primeira aba.
 *
 * Aba OCULTA não tem posição: cai no `{0, 0}` do fallback. Não é caso a tratar —
 * nada na tela oferece navegação para ela (a Revisão só lista as visíveis), e o
 * fallback existia antes justamente para chave desconhecida.
 */
export const POSICAO_POR_SCHEMA: { bloco: number; aba: number }[] = SCHEMA.map((alvo) => {
  for (let b = 0; b < BLOCOS.length; b++) {
    const a = BLOCOS[b].abas.findIndex((x) => x.key === alvo.key)
    if (a !== -1) return { bloco: b, aba: a }
  }
  return { bloco: 0, aba: 0 }
})

/** Rótulo do bloco no stepper: "01 · Identificação da unidade". */
export const rotuloBloco = (i: number): string =>
  `${String(i + 1).padStart(2, '0')} · ${BLOCOS[i]?.nome ?? ''}`

/**
 * Estado de preenchimento de uma aba.
 *
 * `so-db` existe e é o valor delicado: são as abas em que NENHUMA coluna é de
 * origem 'un' (`contarAba().total === 0`), ou seja, não há nada para a unidade
 * preencher. Tratá-las como 0% faria o progresso mentir — a Revisão sempre as
 * mostrou como "OK · somente Databricks", e é essa leitura que vale.
 */
export type EstadoAba = 'so-db' | 'completa' | 'parcial' | 'vazia'

export interface ProgressoAba {
  aba: AbaDef
  estado: EstadoAba
  feitos: number
  total: number
  /** 100 quando não há nada a preencher — a aba não segura o cadastro. */
  pct: number
  /** Conta como pronta para efeito de bloqueio da rodada. */
  pronta: boolean
}

export function progressoAba(aba: AbaDef, rows: Row[]): ProgressoAba {
  const { feitos, total } = contarAba(aba.key, rows)
  const estado: EstadoAba =
    total === 0 ? 'so-db' : feitos === total ? 'completa' : feitos === 0 ? 'vazia' : 'parcial'
  return {
    aba,
    estado,
    feitos,
    total,
    pct: total === 0 ? 100 : Math.round((feitos / total) * 100),
    pronta: estado === 'so-db' || estado === 'completa',
  }
}

/**
 * Progresso de todas as abas, agrupado pelos blocos de navegação.
 *
 * Havia um `.filter(aba => !aba.semDados)` aqui, pelo mesmo motivo de
 * `ABAS_VISIVEIS`, e ele saiu com a fusão de 20/08/2026: toda aba de `BLOCOS`
 * agora tem coluna, então toda aba tem completude que significa algo.
 */
export function progressoPorBloco(
  dados: Record<string, Row[]>,
): { nome: string; indice: number; abas: ProgressoAba[] }[] {
  return BLOCOS.map((bloco, indice) => ({
    nome: bloco.nome,
    indice,
    abas: bloco.abas.map((aba) => progressoAba(aba, dados[aba.key] ?? [])),
  }))
}
