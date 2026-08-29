/**
 * Mapa COMPONENTE → cor, e é a única fonte dele.
 *
 * A regra que o `index.css` declara e que este arquivo faz valer: **a cor segue
 * a ENTIDADE, nunca o rank**. Azul é "Rede coletora" em todos os gráficos, em
 * todas as telas; um filtro que remova séries não repinta as que sobraram.
 *
 * Por isso o mapa é por NOME e não por índice do array. Ordenar o CAPEX por
 * componente em ordem decrescente — que é o que a tela faz — mudaria a cor de
 * todo mundo se a cor viesse da posição.
 *
 * As chaves são os rótulos que o backend manda em `run_componente.componente`.
 */
export const COR_COMPONENTE: Record<string, string> = {
  'Rede coletora': 'var(--viz-rede)',
  Tronco: 'var(--viz-tronco)',
  'Ligação de esgoto': 'var(--viz-ligacao)',
  EEE: 'var(--viz-eee)',
  'Linha de recalque': 'var(--viz-lr)',
  'ETE (módulo)': 'var(--viz-ete)',
  'Coletor de tempo seco': 'var(--viz-cts)',
}

/**
 * Cor de um componente que não está no mapa.
 *
 * Cinza, e de propósito: um componente novo no backend NÃO deve ganhar uma cor
 * gerada. Cor gerada é indistinguível de um slot existente sob daltonismo e
 * quebra a validação da paleta em silêncio. Cinza é visivelmente "não
 * classificado", e quem vir cinza numa tela sabe que falta mapear aqui.
 */
export const COR_DESCONHECIDA = 'var(--viz-ink-muted)'

export function corDoComponente(nome: string): string {
  return COR_COMPONENTE[nome] ?? COR_DESCONHECIDA
}

/**
 * Séries FINANCEIRAS não usam os slots de componente.
 *
 * Se capex/opex/receita pegassem os slots 1–3 por conveniência, azul
 * significaria "Rede coletora" num quadro e "CAPEX" no quadro ao lado, dentro
 * da mesma tela. Entrada e saída de dinheiro é POLARIDADE, e o par divergente
 * existe exatamente para isso.
 */
export const COR = {
  entra: 'var(--viz-pos)',
  sai: 'var(--viz-neg)',
  total: 'var(--viz-ink)',
  neutro: 'var(--viz-mid)',
  grid: 'var(--viz-grid)',
  eixo: 'var(--viz-axis)',
  tinta: 'var(--viz-ink)',
  tinta2: 'var(--viz-ink-2)',
  mudo: 'var(--viz-ink-muted)',
  /** Lavagem do cursor de hover do recharts — cor da marca, e não RGB cravado. */
  cursor: 'color-mix(in srgb, var(--viz-pos) 5%, transparent)',
} as const

/**
 * CAPEX e OPEX são as duas saídas, e precisam ser distinguíveis entre si.
 *
 * O divergente puro daria a mesma cor às duas. A saída é usar o vermelho do
 * divergente para o CAPEX (a saída dominante, e a que o teto limita) e um passo
 * da rampa sequencial para o OPEX — mesma família, magnitude menor, sem invadir
 * nenhum slot de componente.
 */
export const COR_FLUXO = {
  capex: 'var(--viz-fluxo-sai)',
  opex: 'var(--viz-seq-3)',
  receita: 'var(--viz-fluxo-entra)',
  /** Único vermelho do quadro, e com legenda própria — nunca identidade de série. */
  teto: 'var(--viz-critical)',
  /** CAPEX acumulado — a linha que era a Curva S, incorporada ao desembolso
   *  por ano (decisão da reunião de validação de 18/08). Eixo próprio, cor
   *  própria: a mesma da antiga Curva S, para quem já conhecia o quadro. */
  acumulado: 'var(--viz-fluxo-primaria)',
} as const

/**
 * O fluxo de escoamento do VPL (Global/Cidade/Sub-bacia) — porte do design de 19/08.
 *
 * Três cores, e nenhuma delas é o par divergente `COR.entra`/`COR.sai`: aquele
 * é vermelho/azul porque em muitos gráficos "sai" é alerta. Num fluxo de escoamento de
 * VPL, "sai" é CAPEX/OPEX/impostos — saída ESPERADA, não problema —, e o
 * design usa turquesa para receita e azul para as saídas, sem vermelho nenhum.
 * `entraTexto` é mais escuro que `entra`: o rótulo de valor fica sobre fundo
 * branco, e a barra pode ficar sobre o próprio fundo do quadro.
 */
export const COR_FLUXO_ESCOAMENTO = {
  entra: 'var(--viz-fluxo-entra)',
  entraTexto: 'var(--viz-fluxo-entra-texto)',
  sai: 'var(--viz-fluxo-sai)',
  total: 'var(--viz-fluxo-total)',
} as const

/**
 * Alvo × realizado das metas de cobertura (Cidade).
 *
 * Três cores, e nenhuma vem dos slots de componente: meta não é entidade de
 * obra. O alvo é premissa contratual e fica em cinza-azulado; o realizado
 * carrega o veredito na cor, o que faz a leitura não depender de comparar
 * alturas de barra a olho.
 */
export const COR_META = {
  alvo: 'var(--viz-meta-alvo)',
  atingida: 'var(--viz-meta-atingida)',
  perdida: 'var(--viz-meta-perdida)',
} as const
