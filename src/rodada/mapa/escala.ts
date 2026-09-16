/**
 * AS ESCALAS DO MAPA — e a divisão que as governa.
 *
 * A divisão útil não é "sequencial × divergente × categórica". É
 * **MAGNITUDE × PERCENTUAL**, e as duas pedem desenhos que não se parecem:
 *
 *   MAGNITUDE   (VPL, CAPEX, ligações novas) — quantidade absoluta. Rampa de
 *               cinco degraus + ELEVAÇÃO por posição no ranking + a colocação
 *               escrita dentro do município.
 *   PERCENTUAL  (cobertura, metas, ganho, obras) — fração de 0 a 1. A cidade
 *               vira um medidor com a própria forma: preenchida de baixo para
 *               cima até a fração, com a linha d'água no nível e a porcentagem
 *               escrita dentro.
 *
 * ## DUAS RAMPAS, UMA POR TEMA — e por que isso não é escolha de gosto
 *
 * A suposição óbvia era um coroplético só, reusado nos dois temas da rota. O
 * validador da skill `dataviz` prova que isso não existe: a ponta clara de
 * TODA rampa Aegea reprova o piso de contraste de 2:1 contra o branco
 * (`aegea-100` 1,09:1, `aegea-300` 1,43:1), e a ponta ESCURA de uma rampa
 * pensada para chão claro reprova contra `#050D28` do mesmo jeito. Não dá
 * para ter uma rampa só que funcione nos dois chãos — dá para ter DUAS,
 * cada uma validada no seu.
 *
 * `--mapa-r1..r5` e `--mapa-n1..n5` (`index.css`) trocam de VALOR conforme
 * `.rr-noturno`/`.rr-claro`, mas nunca de ORDEM: a posição 1 é sempre o
 * degrau mais FRACO e a 5 o mais FORTE — é a `escala.ts` que dá sentido à
 * posição, o tema só decide que cor cada uma é.
 *
 *   `.rr-noturno` (chão #050D28) — r1 escuro → r5 claro: a cidade ACENDE
 *                 sobre o estado escuro. Validado: ponta fraca 3,06:1.
 *   `.rr-claro`   (chão branco)  — r1 claro → r5 escuro, invertido: a cidade
 *                 ESCURECE sobre a página clara. Validado: ponta fraca (r1,
 *                 um teal customizado fora da escala nomeada porque a escala
 *                 nomeada muda de matiz ao escurecer) a 3,77:1.
 *
 * Os valores vivem em `index.css` como tokens, e não como literais aqui, pelo
 * mesmo motivo de `components/cores.ts`: cor cravada em TypeScript é cor que
 * não existe para quem edita a paleta.
 */
import type { TemaResultados } from '@/rodada/mapa/temaResultados'

/** Os cinco degraus da rampa sequencial, do mais fraco ao mais forte. */
export const RAMPA = [
  'var(--mapa-r1)',
  'var(--mapa-r2)',
  'var(--mapa-r3)',
  'var(--mapa-r4)',
  'var(--mapa-r5)',
] as const

/**
 * O braço negativo do divergente. Só o VPL e o retorno por real cruzam o zero.
 *
 * Era uma rampa coral — a última cor de fora da marca no mapa. Virou azul
 * (30/08/2026): os dois polos agora se separam por LUMINOSIDADE (turquesa
 * escuro × azul claro), não por temperatura. Ver `index.css` pelos números.
 */
export const NEGATIVO = [
  'var(--mapa-n1)',
  'var(--mapa-n2)',
  'var(--mapa-n3)',
  'var(--mapa-n4)',
  'var(--mapa-n5)',
] as const

export const COR_ZERO = 'var(--mapa-zero)'
export const COR_REPOUSO = 'var(--mapa-repouso)'
export const COR_BRILHO = 'var(--mapa-brilho)'

/**
 * CINCO DEGRAUS DISCRETOS, e não um gradiente contínuo.
 *
 * Passando de umas sete classes, vizinhas borram e o mapa vira um degradê
 * bonito e ilegível — o leitor volta à legenda a cada município. Com cinco, a
 * classe de cada cidade se lê de relance e a comparação entre duas vira
 * "mesmo degrau ou degrau diferente", que é uma pergunta que o olho responde.
 *
 * `fracao` é 0..1 dentro da faixa DA RODADA (ver `normalizar`).
 */
export function degrau(fracao: number, paleta: readonly string[] = RAMPA): string {
  const i = Math.min(paleta.length - 1, Math.max(0, Math.round(fracao * (paleta.length - 1))))
  return paleta[i]
}

/** 0..1 dentro da faixa da rodada; 0,5 quando a faixa é degenerada (todos iguais). */
export function normalizar(v: number, faixa: { min: number; max: number }) {
  if (faixa.max === faixa.min) return 0.5
  return (v - faixa.min) / (faixa.max - faixa.min)
}

/**
 * A ELEVAÇÃO — em pixels do `viewBox`, POR POSIÇÃO no ranking.
 *
 * Gráfico 3D é anti-padrão conhecido, e por um motivo específico: perspectiva
 * distorce área, então o volume passa a codificar algo que o leitor não
 * consegue medir. O que salva a elevação aqui é ela NÃO CODIFICAR QUANTIDADE
 * NENHUMA. Quem carrega o número é o ranking ao lado; quem carrega a magnitude
 * é a rampa. A elevação carrega apenas *quem está na frente*.
 *
 * E é por isso que ela sai da POSIÇÃO, nunca do valor. Numa distribuição torta
 * como a do CAPEX (R$ 0 a R$ 100 Mi na rodada de referência), elevação
 * proporcional ao valor deixaria o Rio quarenta vezes mais alto que o segundo
 * colocado e as outras dezessete coladas no chão — a tela gastaria toda a
 * profundidade disponível numa única cidade.
 *
 * Só as cinco primeiras sobem de verdade: dezenove peças levantadas é ruído, e
 * o que se quer destacar é o topo.
 */
const DEGRAUS_DE_ALTURA = [17, 12, 8, 5, 3]

export function elevacao(posicao: number, negativo: boolean): number {
  const dz = posicao < DEGRAUS_DE_ALTURA.length ? DEGRAUS_DE_ALTURA[posicao] : 0
  // O VALOR NEGATIVO AFUNDA em vez de subir — o sinal vira física, e é a única
  // vez em que a profundidade diz algo que a cor ainda não disse. Afunda menos
  // do que o positivo sobe: buraco fundo demais some atrás dos vizinhos.
  return negativo ? -Math.min(dz, 6) : dz
}

/**
 * O CORPO DO RÓTULO que vai DENTRO do município, derivado do tamanho dele.
 *
 * Aperibé não comporta o mesmo dígito que o Rio de Janeiro. Com teto e piso:
 * abaixo de 9px não se lê, e acima de 23px o número compete com o mapa em vez
 * de anotá-lo. `area` em unidades do `viewBox`.
 */
export function corpoDoRotulo(area: number): number {
  return Math.max(9, Math.min(23, Math.sqrt(area) / 3.1))
}

/**
 * A TINTA DO RÓTULO SEGUE O DEGRAU QUE ESTÁ ATRÁS DELE — e o tema decide QUAL
 * degrau é claro demais para tinta branca, porque os dois temas invertem a
 * rampa.
 *
 * No ESCURO: branco sobre `--mapa-r5` (#B5F6EE) é 1,2:1 — ilegível. O halo
 * salvaria a FORMA do dígito e não a leitura dele, daí r4/r5/n4/n5 (as pontas
 * CLARAS da rampa escura) inverterem para tinta navio + halo claro.
 *
 * No CLARO a rampa inteira é escura (é o ponto do tema) — branco lê em
 * qualquer degrau, de r1 (3,77:1) a r5 (16,9:1). Nenhuma posição precisa
 * inverter; o conjunto fica vazio de propósito, não por descuido.
 */
const DEGRAUS_CLAROS_ESCURO = new Set(['var(--mapa-r4)', 'var(--mapa-r5)', 'var(--mapa-n4)', 'var(--mapa-n5)'])
const DEGRAUS_CLAROS_CLARO = new Set<string>()

export function tintaDoRotulo(
  corDoFundo: string,
  tema: TemaResultados,
): { preenche: string; halo: string } {
  const claros = tema === 'escuro' ? DEGRAUS_CLAROS_ESCURO : DEGRAUS_CLAROS_CLARO
  return claros.has(corDoFundo)
    ? { preenche: '#052259', halo: 'rgba(255,255,255,.55)' }
    : { preenche: '#ffffff', halo: 'rgba(3,20,94,.75)' }
}
