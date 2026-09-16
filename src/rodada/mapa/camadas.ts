import { brMi, brl, brlMi, inteiro, pct } from '@/rodada/lib/formato'
import type { CidadeLinha } from '@/rodada/domain/resultado'

/**
 * O CATÁLOGO DE CAMADAS DO MAPA — uma entrada por leitura possível.
 *
 * É uma lista de dados, e não um `switch` espalhado pela tela, porque toda
 * camada responde às mesmas perguntas (que valor tem esta cidade, como
 * escrevê-lo, o que vai escrito DENTRO do município, em que grupo ela aparece)
 * e a tela só precisa saber percorrer isso. Acrescentar uma leitura passa a ser
 * acrescentar uma entrada — não editar o mapa, a legenda e o ranking em três
 * lugares.
 *
 * ## AS TRÊS FORMAS
 *
 *   `repouso`     nenhum dado escolhido. Cor única, sem altura e sem número —
 *                 o mapa afirma pertencimento e mais nada. É o estado em que a
 *                 tela abre.
 *   `magnitude`   quantidade absoluta. Rampa de cinco degraus, elevação por
 *                 posição no ranking, e a COLOCAÇÃO escrita no município.
 *   `percentual`  fração de 0 a 1. Preenchimento parcial por ÁREA, linha
 *                 d'água no nível, e a PORCENTAGEM escrita no município.
 *
 * A divisão entre as duas últimas não é estética: num coroplético, quantidade
 * absoluta reproduz o tamanho do município — o Rio sai escuro porque o Rio é
 * grande, e o mapa vira um mapa de população. Fração não tem esse problema, e
 * ganha um desenho que dispensa legenda.
 *
 * PERCENTUAL NÃO NORMALIZA PELA FAIXA DA RODADA, e é a diferença que mais
 * importa entre as duas: "60% de cobertura" preenche 60% do município, não "a
 * posição de 60% entre a menor e a maior cobertura das dezenove" — que é outra
 * afirmação, e a que faria a cidade menos pior da rodada aparecer cheia.
 *
 * ## `valor` PODE DEVOLVER `null`, E ISSO É O CORAÇÃO DO ARQUIVO
 *
 * `null` é "não sei", e a tela o pinta como HACHURA — nunca como zero. Os dois
 * casos em que aparece são reais e diferentes: a cidade não tem aquele dado
 * nesta rodada, ou o SERVIDOR é anterior a 29/08/2026 e não manda o campo
 * (§7.7 do `RELATORIO-DADOS-POR-CIDADE-MAPA.md`). Uma cidade sem
 * `coberturaBasePct` não tem ganho de cobertura igual a zero — ela tem ganho
 * desconhecido, e as duas leituras são opostas.
 *
 * ## OS GRUPOS
 *
 *   `kpi`         a camada é a DECOMPOSIÇÃO POR CIDADE de um KPI da faixa do
 *                 topo. O KPI é o total; o mapa mostra de onde ele vem. Por
 *                 isso o seletor não é um controle à parte: é o próprio KPI,
 *                 clicável.
 *   `derivada`    a leitura não tem KPI porque só existe por cidade — não há
 *                 "CAPEX por ligação da unidade" que signifique alguma coisa.
 *                 Ganham um seletor próprio dentro do painel do mapa.
 *   `repouso`     o estado inicial, que divide o seletor com as derivadas.
 */

export type FormaDaCamada = 'repouso' | 'magnitude' | 'percentual'

/**
 * A FORMA QUE A CAMADA TOMA DENTRO DO CARTÃO DE UMA CIDADE.
 *
 * Uma camada devolve UM NÚMERO por cidade — é o que o mapa precisa e é tudo
 * que `valor()` promete. O cartão precisa de uma SÉRIE, e a série não sai do
 * número: ela depende de onde aquele número mora no payload. Daí um segundo
 * campo, e não uma inferência a partir de `forma`.
 *
 *   `nenhum`         só o repouso. Não há dado escolhido, não há o que plotar.
 *   `coberturaMetas` a trajetória de cobertura contra as metas contratuais —
 *                    `CidadeLinha.cobertura` + `.metas`, JÁ EM MEMÓRIA.
 *   `capexPorAno`    o desembolso ano a ano — `CidadeLinha.capexPorAno`,
 *                    também já em memória.
 *   `composicaoVpl`  a decomposição do VPL (o fluxo de escoamento da cidade).
 *                    É a ÚNICA que precisa de requisição: `cascata` só existe
 *                    em `CidadeDetalhe`, o payload do nível 2.
 *   `distribuicao`   esta cidade contra as outras dezoito, na camada corrente.
 *                    Não é o plano B de quem não achou uma série: é a resposta
 *                    certa para uma grandeza sem eixo do tempo (retorno por
 *                    real, CAPEX por ligação), porque a pergunta que o mapa
 *                    acabou de levantar é "esta cidade é boa ou ruim NISTO?".
 *
 * `distribuicao` também é oferecida como ALTERNATIVA em toda camada que tem
 * outra forma — o cartão mostra um alternador quando as duas existem. Ela sai
 * de graça: `usePintura` já ordenou as cidades e já escolheu a cor de cada uma
 * para pintar o mapa.
 */
export type FormaDoGrafico =
  | 'nenhum'
  | 'coberturaMetas'
  | 'capexPorAno'
  | 'composicaoVpl'
  | 'distribuicao'

/**
 * O que a camada sabe além da linha da cidade.
 *
 * `ano` é a linha do tempo: `null` é o plano inteiro, e um número recorta o
 * CAPEX naquele ano. Mora no contexto e não numa camada separada porque "CAPEX
 * do plano" e "CAPEX de 2032" são a mesma leitura em recortes diferentes —
 * duplicar a camada faria legenda, escala e rótulo saírem de sincronia.
 */
export interface Contexto {
  ano: number | null
}

export interface Camada {
  chave: string
  rotulo: string
  nota: string
  forma: FormaDaCamada
  /**
   * O gráfico que o cartão de UMA cidade desenha nesta camada. OBRIGATÓRIO de
   * propósito: uma camada nova sem ele compila hoje e abre um cartão vazio
   * amanhã, que é o tipo de buraco que só aparece em produção.
   */
  grafico: FormaDoGrafico
  grupo: 'repouso' | 'kpi' | 'derivada'
  /** Chave do verbete no dicionário de resultado, quando existe. */
  ajuda?: string
  /**
   * A grandeza cruza o zero? Só então a paleta é divergente, com o zero no
   * meio: numa sequencial, "prejuízo pequeno" e "lucro pequeno" sairiam da
   * mesma cor e a fronteira que decide se a cidade se paga sumiria do mapa.
   */
  divergente?: boolean
  /** `null` = sem dado; a cidade sai hachurada. */
  valor: (c: CidadeLinha, ctx: Contexto) => number | null
  /** O valor por extenso — vai no ranking e na dica do mapa. */
  texto: (c: CidadeLinha, ctx: Contexto) => string
  /** Formata um ponto qualquer da escala — é o que a legenda escreve nas pontas. */
  escala: (v: number) => string
  /**
   * A escala cresce para BAIXO (menor é "mais"). Só o ano de entrada usa: a
   * cidade que entra primeiro é a que o plano priorizou, e ela tem de ser a
   * mais forte — e a primeira do ranking.
   */
  inverter?: boolean
  /**
   * O `valor` desta camada RESPONDE a `ctx.ano`?
   *
   * Declarado, e não inferido: quem decide se o seletor de ano aparece é o
   * painel (`SeletorDeAno`, em `PainelMapeamento.tsx`), e ele não tem como
   * saber, olhando a função, se ela lê `ctx.ano` ou o ignora. Sem a marca, a
   * escolha era entre mostrar o seletor sempre — um controle que não faz nada
   * em cinco das seis camadas — ou casar o painel com a string `'capex'`, que
   * quebra calado na camada nova que também recortar por ano.
   */
  porAno?: boolean
}

/** Divisão que devolve `null` em vez de `Infinity`/`NaN` quando não há denominador. */
function razao(a: number | null | undefined, b: number | null | undefined): number | null {
  if (a == null || b == null || b === 0) return null
  return a / b
}

/** O CAPEX da cidade no recorte pedido: o plano inteiro, ou um ano só. */
function capexNoRecorte(c: CidadeLinha, ctx: Contexto): number | null {
  if (ctx.ano == null) return c.capex
  // Servidor sem `capexPorAno` não permite recortar por ano — e "não permite"
  // é diferente de "esta cidade não gastou nada em 2032".
  if (!c.capexPorAno) return null
  return c.capexPorAno.find((a) => a.ano === ctx.ano)?.capex ?? 0
}

/** A chave do estado de repouso — nenhum dado escolhido. Exportada porque a
 *  tela abre nela e o seletor precisa nomeá-la. */
export const REPOUSO = 'repouso'

export const CAMADAS: Camada[] = [
  {
    /**
     * O ESTADO DE REPOUSO — e ele é uma camada, não a ausência de uma.
     *
     * A tela abre aqui. Abrir já no VPL faria a primeira coisa que o usuário vê
     * ser uma afirmação que ele não pediu, e um mapa cheio de números e alturas
     * antes de ele saber o que está olhando. Em repouso o mapa diz uma coisa
     * só: "estas são as suas dezenove cidades". Escolher o dado é o gesto
     * seguinte, e é dele.
     *
     * Modelá-lo como camada, e não como `camada = null` espalhado pela tela,
     * economiza um caso especial em cada consumidor — mapa, legenda, ranking e
     * seletor tratam repouso como tratam qualquer outra.
     */
    chave: REPOUSO,
    rotulo: 'Cidades da unidade',
    nota: 'Nenhum dado escolhido — o mapa mostra só quais cidades a unidade opera',
    forma: 'repouso',
    grafico: 'nenhum',
    grupo: 'repouso',
    // O valor existe e é o mesmo para todas: é o que faz toda cidade da rodada
    // aparecer pintada em vez de hachurada. Zero seria igualmente válido; o que
    // não pode é `null`, que significaria "não sei quais são".
    valor: () => 1,
    texto: () => '',
    escala: () => '',
  },

  // ── grupo `kpi` — a decomposição dos números da faixa do topo ─────────────
  {
    chave: 'vpl',
    rotulo: 'VPL do plano',
    nota: 'Valor presente líquido do plano em cada cidade',
    forma: 'magnitude',
    // A única camada que pede requisição — e ela vale a pena: "por que o VPL
    // desta cidade é esse" só se responde decompondo o VPL, e a decomposição
    // não cabe num número.
    grafico: 'composicaoVpl',
    grupo: 'kpi',
    ajuda: 'VPL_PLANO',
    divergente: true,
    valor: (c) => c.vpl,
    texto: (c) => brlMi(c.vpl),
    escala: brMi,
  },
  {
    /**
     * CAPEX É MAGNITUDE, E MAGNITUDE NÃO É COR SOZINHA.
     *
     * Enquanto esta camada foi coroplética pura, ela produzia um mapa de PORTE
     * DE MUNICÍPIO travestido de mapa de investimento: o polígono maior recebia
     * mais tinta pelo simples fato de ocupar mais área. Com a rampa em cinco
     * degraus e a elevação por posição, o tamanho do município deixa de
     * participar da leitura de quem investiu mais.
     */
    chave: 'capex',
    rotulo: 'CAPEX total',
    nota: 'Investimento alocado à cidade',
    forma: 'magnitude',
    grafico: 'capexPorAno',
    grupo: 'kpi',
    ajuda: 'CAPEX_TOTAL',
    // A ÚNICA que recorta por ano hoje — `capexNoRecorte` lê `ctx.ano`.
    porAno: true,
    valor: capexNoRecorte,
    texto: (c, ctx) => brlMi(capexNoRecorte(c, ctx)),
    escala: brMi,
  },
  {
    chave: 'cobertura',
    rotulo: 'Cobertura final',
    nota: 'Cobertura de esgoto ao fim do plano',
    forma: 'percentual',
    grafico: 'coberturaMetas',
    grupo: 'kpi',
    ajuda: 'COBERTURA_FINAL',
    valor: (c) => c.coberturaFimPct / 100,
    texto: (c) => pct(c.coberturaFimPct),
    escala: (v) => pct(v * 100),
  },
  /**
   * "Metas contratuais cumpridas" e "Obras priorizadas" saíram do mapa em
   * 31/08/2026 — pedido do usuário: as duas dizem menos sobre o TERRITÓRIO do
   * que sobre o CONTRATO ou o PROCESSO do otimizador, e não puxam decisão
   * geográfica do jeito que cobertura, VPL e CAPEX puxam. Continuam na faixa
   * de KPI do topo (`FaixaKpiSeletor`, em `ResultadosRefactor.tsx`) — só saem
   * do coroplético.
   */

  // ── grupo `derivada` — leituras que só existem por cidade ─────────────────
  {
    /**
     * A COBERTURA FINAL MEDE O ESTADO; ESTA MEDE O QUE O PLANO FEZ.
     *
     * É a diferença entre "o Rio está em 29%" e "o plano não encostou no Rio", e
     * a segunda é a que muda decisão. Na rodada de referência há doze cidades
     * com Δ = 0, e um mapa só de cobertura final não distingue a cidade que já
     * era boa da que foi abandonada — as duas ficam claras pelo mesmo motivo
     * aparente e por motivos opostos.
     */
    chave: 'ganhoCobertura',
    rotulo: 'Ganho de cobertura',
    nota: 'Quantos pontos percentuais de cobertura o plano acrescenta',
    forma: 'percentual',
    // O ganho É a distância entre os dois extremos da curva de cobertura — o
    // mesmo quadro, lido da base até o fim.
    grafico: 'coberturaMetas',
    grupo: 'derivada',
    valor: (c) =>
      c.coberturaBasePct == null ? null : (c.coberturaFimPct - c.coberturaBasePct) / 100,
    // SEM "p.p.": era tecnicamente mais preciso (é a DIFERENÇA entre dois
    // percentuais, não um percentual em si), mas o usuário pediu só o número
    // — a mesma unidade que toda outra camada percentual já mostra sem
    // qualificação, e "12,4 p.p." ao lado de "34,0%" na legenda lia como dois
    // tipos de dado diferentes quando são o mesmo eixo.
    texto: (c) =>
      c.coberturaBasePct == null ? '—' : pct(c.coberturaFimPct - c.coberturaBasePct),
    escala: (v) => pct(v * 100),
  },
  {
    chave: 'ligacoes',
    rotulo: 'Ligações novas',
    nota: 'Quantas casas o plano conecta na cidade',
    forma: 'magnitude',
    grafico: 'distribuicao',
    grupo: 'derivada',
    valor: (c) => c.ligacoesNovas ?? null,
    texto: (c) => inteiro(c.ligacoesNovas),
    escala: inteiro,
  },
  {
    /**
     * O CRITÉRIO DO OTIMIZADOR, DESENHADO.
     *
     * É intensidade (um custo unitário), e é exatamente por esta grandeza que a
     * cidade cara por ligação fica de fora. Explica o mapa de cobertura sem
     * abrir nenhuma outra tela.
     */
    chave: 'capexPorLigacao',
    rotulo: 'CAPEX por ligação',
    nota: 'Quanto custa cada ligação que o plano acrescenta na cidade',
    forma: 'magnitude',
    // Intensidade não tem trajetória: é a razão entre dois totais do plano
    // inteiro. O que responde alguma coisa é onde ela cai entre as dezenove —
    // que é literalmente o critério pelo qual a cidade cara ficou de fora.
    grafico: 'distribuicao',
    grupo: 'derivada',
    valor: (c) => razao(c.capex, c.ligacoesNovas),
    texto: (c) => {
      const v = razao(c.capex, c.ligacoesNovas)
      return v == null ? '—' : `${brl(v)}/lig`
    },
    escala: (v) => `${brl(v)}/lig`,
  },
  /**
   * "Retorno por real" e "Ano de entrada" saíram do mapa em 31/08/2026, pelo
   * mesmo pedido que tirou metas e obras: intensidade adimensional e
   * sequência de atendimento são leituras finas de PROCESSO do otimizador, e
   * o usuário prefere o coroplético restrito ao que muda decisão territorial
   * de relance — cobertura, VPL, CAPEX, ganho, ligações, CAPEX por ligação.
   * Nenhuma das duas tinha KPI equivalente na faixa do topo, então a remoção
   * aqui é o fim delas na tela — não uma migração como a de metas/obras.
   */
]

export const CAMADA_POR_CHAVE = new Map(CAMADAS.map((c) => [c.chave, c]))
