/**
 * A LINHA DA CIDADE, COMPLETADA PELO DETALHE DELA.
 *
 * O mapa e o cartão foram escritos para uma listagem (`/runs/{id}/cidades`)
 * que traz a curva de cobertura, as metas, as ligações novas, a cobertura de
 * partida e o CAPEX por ano de cada cidade. O backend daqui manda esses
 * campos só no DETALHE (`/cidades/{id}`) — e, sem eles, o cartão dizia "esta
 * rodada não publicou a curva de cobertura", e quatro camadas do mapa caíam
 * no "sem dado", numa rodada que tem tudo isso publicado.
 *
 * A saída é completar a linha com o detalhe, campo a campo, SÓ ONDE A LINHA
 * VEIO VAZIA: se um dia a listagem passar a mandar, ela ganha — o detalhe
 * nunca sobrescreve o que o servidor já disse na lista. Puro, para ser
 * testado sem rede; quem busca é `useCidadesCompletas`.
 */
import type { CapexDoAno, CidadeDetalhe, CidadeLinha } from '@/rodada/domain/resultado'

/**
 * O CAPEX de cada ano é a SOMA dos componentes daquele ano.
 *
 * `elementosPorAno` é o que o detalhe traz — o mesmo dado, aberto por
 * componente. Reais somam entre componentes (`capex` vem preenchido mesmo
 * quando `quantidade` é nula; ver `ElementoDoAno`), então a soma é o número
 * que a listagem nova mandaria pronto. Ano sem elemento não entra: a linha
 * do tempo do mapa lê "ausente" como "sem investimento", que é a verdade.
 */
export function capexPorAnoDe(detalhe: Pick<CidadeDetalhe, 'elementosPorAno'>): CapexDoAno[] {
  return detalhe.elementosPorAno
    .map((e) => ({ ano: e.ano, capex: e.porComponente.reduce((s, c) => s + (c.capex ?? 0), 0) }))
    .sort((a, b) => a.ano - b.ano)
}

export function completarComDetalhe(
  linha: CidadeLinha,
  detalhe: CidadeDetalhe | undefined,
): CidadeLinha {
  if (!detalhe) return linha
  return {
    ...linha,
    cobertura: linha.cobertura?.length ? linha.cobertura : detalhe.cobertura,
    metas: linha.metas?.length ? linha.metas : detalhe.metas,
    coberturaBasePct: linha.coberturaBasePct ?? detalhe.coberturaBasePct,
    ligacoesNovas: linha.ligacoesNovas ?? detalhe.ligacoesNovas,
    capexPorAno: linha.capexPorAno ?? capexPorAnoDe(detalhe),
  }
}
