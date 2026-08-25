/**
 * Tipos do RESULTADO de uma rodada do otimizador.
 *
 * Diferenca fundamental para o resto deste app: aqui e LEITURA PURA. O cadastro
 * tem reducer, rascunho e trilha de override porque o usuario edita; resultado de
 * rodada e imutavel — um `run_id` publicado nunca muda. Por isso nada aqui tem
 * equivalente de escrita, e as queries podem cachear para sempre (ver
 * `api/queriesResultado.ts`).
 *
 * A tela NUNCA reexecuta o otimizador e NUNCA recomputa totais: as tabelas
 * `run_*` ja vem reconciliadas do Databricks (a soma dos VPL por sub-bacia = VPL
 * do plano; CAPEX de `run_mes` = `run_ano` = `run_meta`). Se um numero parecer
 * errado, o bug esta na materializacao, nao aqui.
 */

/** Status do solver, como o CP-SAT devolve. INFEASIBLE = rodada sem resultado. */
import type { Pedido } from '@/rodada/domain/pedido'

export type StatusSolver = 'OPTIMAL' | 'FEASIBLE' | 'INFEASIBLE'

/**
 * Parametros com que a rodada foi feita (de `run_meta`). Aparecem como chips no
 * header em todos os niveis: sem eles, dois resultados diferentes da mesma
 * unidade sao indistinguiveis na tela.
 */
export interface ParametrosRodada {
  /** 'arrecadada' = o que entrou · 'faturada' = o que era para entrar. */
  baseReceita: 'arrecadada' | 'faturada'
  /** CTS orcada a parte (true) ou demanda somada a sub-bacia pareada (false). */
  usarCts: boolean
  /** Anos em que uma obra pode COMECAR (a conclusao pode passar disso). */
  janelaCapex: number
  /** Teto total do orcamento, em R$. */
  orcamento: number
  /** 0 = so VPL · 1 = so cobertura. */
  focoCobertura: number
  coberturaSoResidencial: boolean
}

/**
 * Um card do historico de simulacoes (nivel 0). E a capa da rodada: o suficiente
 * para comparar rodadas sem abrir nenhuma.
 *
 * Rodada INFEASIBLE nao tem metricas — o solver nao chegou a um plano. Por isso
 * `metricas` e opcional, e a UI mostra o aviso em vez de zeros (que seriam
 * mentira: zero VPL e um resultado, "nao houve resultado" e outra coisa).
 */
/**
 * O estado de uma rodada na LISTA, que e mais largo que o do solver.
 *
 * O historico mostra as rodadas EM VOO (o que esta rodando agora, o que falhou
 * hoje) alem das publicadas — sem isso, quem fechasse o modal de acompanhamento
 * perdia a rodada de vista, e a tela mais operacional do produto era cega para o
 * estado operacional.
 */
/**
 * `CANCELADA` entra aqui junto com o botão de cancelar: enquanto o endpoint
 * respondia 501 o valor era inalcançável, e a migração 008 o pôs no CHECK de
 * `controle.run_status`. Sem ele no tipo, a rodada cancelada cairia no ramo final
 * do card e diria "Na fila, ainda não começou a rodar" — sobre algo que alguém
 * mandou parar.
 */
export type StatusRodada = StatusSolver | 'PENDENTE' | 'RODANDO' | 'ERRO' | 'CANCELADA'

/** A anotação de uma rodada. Ver `RunResumo.comentario`. */
export interface ComentarioDaRodada {
  texto: string
  /** Quem escreveu por ÚLTIMO — não é dono, é a última mão. */
  autor: string | null
  atualizadoEm: string | null
}

export interface RunResumo {
  runId: string
  nome: string
  unidadeId: string
  unidadeNome: string
  dataHora: string
  autor: string
  /** Segundos de solver — ajuda a explicar VIAVEL(limite de tempo). */
  duracaoS: number | null
  status: StatusRodada
  favorita: boolean
  /**
   * A anotação de quem ANALISA a rodada, escrita depois de ver o resultado.
   *
   * Não confundir com `nome`: aquele é dado no disparo e descreve a intenção;
   * este é escrito depois e descreve a conclusão. É a única parte mutável de uma
   * rodada, e é COMPARTILHADA — por isso vem com autor e data, que é o mínimo
   * para o texto significar algo num campo que qualquer um pode reescrever.
   *
   * AUSENTE quando ninguém anotou. O backend não devolve `{texto: ''}`: apagar o
   * texto apaga a linha, então "sem comentário" tem uma representação só.
   */
  comentario?: ComentarioDaRodada | null
  /**
   * A rodada tem resultado gravado em `otim_*`?
   *
   * Separa as duas metades da lista, e nao da para deduzir pelo `status`: uma
   * rodada pode estar RODANDO (sem resultado) ou ERRO (idem), e so a publicada
   * tem metricas, parametros e drill-down. O front usava `status` para isso e
   * quebrava — `parametros` vinha `undefined` e a tela inteira caia.
   */
  publicada: boolean
  /** 0..100. So nas em voo; a publicada esta em 100 por definicao. */
  progresso?: number
  /** Causa da falha, quando o job ou a fila reportaram uma. */
  erro?: string | null
  /**
   * O que o SOLVER chegou a devolver, quando chegou — `"VIAVEL(limite de tempo) |
   * obrig 106/126  VPL=-227.126.290"`.
   *
   * Existe porque uma rodada pode morrer ENTRE o solver e a publicacao. Quando
   * isso acontece nao ha nada em `otim_*` e o card mostrava so "ERRO": o plano
   * tinha sido calculado, o VPL tambem, e os dois viviam apenas numa linha de log
   * do executor. Ausente quando o solver nem chegou a rodar — e a ausencia diz
   * isso.
   */
  solver?: string | null
  /** Ausente enquanto a rodada nao publica: eles saem de `otim_meta`. */
  parametros?: ParametrosRodada
  metricas?: MetricasCapa
  /**
   * As variaveis com que a rodada foi PEDIDA — mais de vinte, contra os seis de
   * `parametros`. Ver `domain/pedido.ts`.
   *
   * `null` quando a rodada foi publicada sem passar pela fila: o pacote de
   * producao publica direto, e ai nao ha `run_request` de onde tirar o pedido.
   * A tela diz isso em vez de mostrar lista vazia, que se leria como "rodou sem
   * parametro nenhum".
   */
  pedido?: Pedido | null
}

export interface MetricasCapa {
  vpl: number
  capex: number
  /** CAPEX / orcamento, em %. Perto de 100 = o teto foi o gargalo. */
  usoOrcamentoPct: number
  obrasConstruidas: number
  obrasTotal: number
  coberturaFimPct: number
  metasAtingidas: number
  metasTotal: number
  ebitdaTotal: number
}

/** KPIs do nivel global (de `run_meta`). */
export interface RunMeta {
  runId: string
  nome: string
  unidadeId: string
  unidadeNome: string
  dataHora: string
  autor: string
  status: StatusSolver
  /** Texto do solver como ele veio ('OTIMO | OBRIG 3/3', 'VIAVEL(limite de tempo)'). */
  statusTexto: string
  parametros: ParametrosRodada
  kpis: KpisGlobais
}

export interface KpisGlobais {
  vpl: number
  capexTotal: number
  opexTotal: number
  receitaTotal: number
  obrasConstruidas: number
  obrasTotal: number
  obrigatoriasConstruidas: number
  obrigatoriasTotal: number
  subbaciasFaturando: number
  subbaciasTotal: number
  coberturaFimPct: number
  metasAtingidas: number
  metasTotal: number
}

/**
 * Os 6 niveis da hierarquia. `historico` e a porta de entrada; os outros cinco sao
 * o drill-down descrito na spec.
 */

/*
 * A ORDEM CANONICA DOS NIVEIS — global > cidade > sistema > subbacia > elemento —
 * era uma constante `NIVEIS` aqui, sem nenhum consumidor: o breadcrumb e a
 * navegacao a reimplementam cada um por conta propria. `historico` NAO e um
 * degrau: ele e a raiz.
 *
 * A constante saiu — e, com ela, o tipo `NivelResultado`, que existia so para
 * tipa-la. O encadeamento e o proprio argumento: um simbolo sem leitor sustentava
 * outro sem leitor, e os dois juntos davam a impressao de que a ordem estava
 * garantida em algum lugar. Nao estava. Ela e regra de produto, e vive aqui em
 * texto ate alguem precisar dela de verdade — o que e honesto, ao contrario de um
 * tipo pendurado fingindo que impoe alguma coisa.
 */

/**
 * NOMES CANONICOS DE COMPONENTE — duas regras do handoff, que nao tem onde ser
 * verificadas em codigo e por isso ficam escritas aqui, no arquivo que define o
 * vocabulario do resultado:
 *
 *   1. "Linha de recalque" e o nome canonico. Nao "recalque", nao "linha".
 *   2. TRANSPORTE NUNCA E AGRUPADO. Tronco, EEE e Linha de recalque aparecem
 *      sempre separados, nunca somados num "Transporte" — agrupar esconde
 *      exatamente o que o usuario precisa ver para entender o gargalo.
 *
 * (Havia duas listas constantes aqui, `COMPONENTES_SUBBACIA` e `COMPONENTES_CTS`,
 * sem nenhum consumidor: o `knip` as apontou e o `tsc` confirmou. As listas
 * sairam; as regras, nao — elas valem para quem renderizar componente, e o texto
 * era a unica coisa viva nelas.)
 */

/** Situacao de uma obra na topologia e nas tabelas — dirige a cor. */
export type SituacaoObra = 'construida' | 'nao-construida' | 'terceiro' | 'sem-obra'

/**
 * Estrutura que aparece como no da topologia. A CTS e visualmente distinta
 * (cabecalho azul, selo "· CTS", "↔ sub-bacia pareada") porque e uma decisao de
 * negocio diferente, nao uma sub-bacia qualquer.
 */
export type TipoEstrutura = 'subbacia' | 'cts'

// ===========================================================================
//  NIVEL 1 — painel global
// ===========================================================================

/**
 * Uma parcela do fluxo de escoamento (waterfall). O mesmo tipo serve aos tres niveis que tem
 * fluxo de escoamento (global, cidade e sub-bacia) — e por isso o componente de grafico e um
 * so.
 *
 * `tipo` dirige a cor pela SEMANTICA, nao pelo sinal: o total e ink escuro mesmo
 * sendo positivo, porque ele nao "entra valor" — ele E o valor.
 */
/*
 * O CAMPO CONTINUA `cascata` NOS TRES PAYLOADS, e nao e esquecimento do renome
 * de 20/08/2026 (quando "cascata" saiu do frontend em favor de "fluxo de
 * escoamento").
 *
 * `api.get<PainelGlobal>` faz cast direto da resposta — nao existe camada de
 * traducao entre o JSON e o tipo. Entao o nome da propriedade E a chave que o
 * servidor manda (`niveis.py`, chaves "cascata" em /painel, /cidades/{id} e
 * /subbacias/{id}). Renomear so aqui faria o valor chegar como `undefined` e o
 * grafico abrir vazio, sem erro nenhum.
 *
 * Para apagar tambem esta ocorrencia, os dois lados mudam no mesmo commit:
 * `_cascata()` e as tres chaves em `app/infra/repositorios/niveis.py`, mais os
 * mocks de `testes/servidor.ts` e `pages/Global.test.tsx`.
 */
export interface ParcelaFluxoEscoamento {
  rotulo: string
  valor: number
  tipo: 'entra' | 'sai' | 'total'
}

/** Uma linha de `run_ano`: desembolso, receita e o teto daquele ano. */
export interface AnoFinanceiro {
  ano: number
  capex: number
  opex: number
  receita: number
  /** Teto anual de CAPEX. Nulo = ano fora da janela de orcamento. */
  tetoCapex: number | null
}

/**
 * Um elemento de obra, somado sobre as obras CONSTRUIDAS (`run_obra`). Transporte
 * NUNCA agrupado.
 *
 * Tres leituras do mesmo elemento, e e de proposito que venham juntas: quanto custou,
 * quantas obras, e quanto foi entregue. Elas alimentam DOIS graficos que leem esta
 * mesma lista — se viessem separadas, os dois poderiam discordar sobre quais obras
 * entraram na conta.
 */
export interface CapexPorComponente {
  componente: string
  capex: number
  pctDoTotal: number
  /** Quantas obras deste elemento foram construidas. */
  obras: number
  /**
   * Quanto foi construido na unidade FISICA do elemento — 14.823 m de rede, 8.012
   * ligacoes, 9 unidades de EEE. Na ETE e a CAPACIDADE acrescentada pelos modulos.
   *
   * `null` quando nao ha o que medir: a ETE nova nao tem capacidade publicada por
   * sistema, e um elemento que aparece com mais de uma unidade no cadastro nao pode
   * ser somado. A tela mostra travessao — zero seria lido como "nada construido".
   */
  unidadesConstruidas: number | null
  /** A unidade de `unidadesConstruidas` (`m`, `ligacao`, `un`, `L/s de capacidade`). */
  unidade: string | null
  /** Só a ETE tem módulo. `null` nos demais componentes. */
  modulosConstruidos: number | null
}

/**
 * Quantidade FISICA construida num ano, quebrada por componente (barra
 * empilhada) — substitui a contagem de obras: "obra" não é métrica
 * padronizada (uma obra pode ser 1 metro ou 1.000), decisão da reunião de
 * validação de 18/08.
 *
 * `precoUnitario` vem da mesma linha que `quantidade` de propósito — CAPEX do
 * componente naquele ano ÷ quantidade daquele ano. Se viesse de uma consulta
 * separada, os dois gráficos que leem esta lista poderiam discordar sobre o
 * que entrou na conta.
 */
export interface ElementoDoAno {
  ano: number
  porComponente: {
    componente: string
    /** `null` quando não houve construção do componente no ano — não é 0. */
    quantidade: number | null
    /** A unidade de `quantidade` (`m`, `un`...). `null` junto com ela. */
    unidade: string | null
    /** `null` nas mesmas condições de `quantidade` — não dá para dividir por nada. */
    precoUnitario: number | null
    /**
     * CAPEX do componente no ano.
     *
     * NÃO segue a regra de `quantidade`/`unidade`: reais somam entre unidades
     * físicas diferentes, então este campo vem preenchido mesmo no ano em que
     * a unidade não é única. É o que faz a leitura por CAPEX ser a única das
     * três que nunca esconde um ano de obra.
     */
    capex: number | null
  }[]
}

/** EBITDA de um ano — saida CALCULADA, fora da funcao objetivo. */
export interface EbitdaAno {
  ano: number
  ebitda: number
  /** EBITDA / receita operacional. Nulo quando nao houve receita no ano. */
  margemPct: number | null
}

/** Tudo que o nivel global desenha, num payload so. */
export interface PainelGlobal {
  anos: AnoFinanceiro[]
  cascata: ParcelaFluxoEscoamento[]
  capexPorComponente: CapexPorComponente[]
  elementosPorAno: ElementoDoAno[]
  /** Ano em que o CAPEX termina — vira linha de referencia em varios graficos. */
  fimCapex: number
}

/** Serie de EBITDA + total, da unidade ou de uma cidade. */
export interface PainelEbitda {
  anos: EbitdaAno[]
  total: number
  /** Primeiro ano com EBITDA positivo; nulo se nunca vira. */
  anoViraPositivo: number | null
  fimCapex: number
}

/** Linha da tabela de cidades do nivel global. */
export interface CidadeLinha {
  id: string
  nome: string
  vpl: number
  capex: number
  coberturaFimPct: number
  metasAtingidas: number
  metasTotal: number
  sistemas: number
}

// ===========================================================================
//  NIVEL 2 — cidade
// ===========================================================================

/** Um ponto da curva de cobertura da cidade (`run_cobertura`). */
export interface PontoCobertura {
  ano: number
  coberturaPct: number
}

/** Uma meta de cobertura (`run_meta_cobertura`). */
export interface MetaCobertura {
  ano: number
  alvoPct: number
  realizadoPct: number
  /**
   * `null` QUANDO A META ESTA FORA DA JANELA DE CAPEX, e o tipo precisa dizer
   * isso. O motor ignora meta com ano >= `anos_capex` (ela nunca entra em
   * `metas_det`) e depois a reinjeta no detalhe com `atingida: None`, de
   * proposito — "senao '100% das metas' engana quem le".
   *
   * Enquanto isto era `boolean`, `m.atingida ? 'sim' : 'nao'` compilava sem um
   * aviso e a tela afirmava "nao" sobre meta que ninguem avaliou: pior que
   * omitir, porque reporta falha inexistente. Quem consome tem tres estados.
   */
  atingida: boolean | null
  /** Meta fora da janela de CAPEX nao e cobrada da rodada. */
  dentroDaJanela: boolean
}

/**
 * Uma faixa da escada de paridade cadastrada (`snapshot__fator_esgoto`):
 * a partir de `coberturaPct` de cobertura, a paridade vale `paridade`.
 */
export interface FaixaParidade {
  coberturaPct: number
  paridade: number
  /** Faixa em que a cidade estava antes do plano. */
  ehBase: boolean
  /** Faixa em que a cidade termina o plano. */
  ehFinal: boolean
}

/**
 * Paridade esgoto/agua e o efeito-base.
 *
 * A causalidade que a tela e OBRIGADA a explicitar: o degrau de faixa e a origem
 * da barra "Efeito-base paridade" do fluxo de escoamento, porque o reajuste vale tambem para
 * as ligacoes JA existentes — nao so para as novas.
 */
export interface Paridade {
  faixas: FaixaParidade[]
  paridadeInicial: number
  paridadeFinal: number
  /** Houve mudanca de faixa? Sem degrau, nao ha efeito-base. */
  houveDegrau: boolean
  /** VP do efeito-base, em R$. */
  vpEfeitoBase: number
  /** Quanto o efeito-base representa do VPL da cidade. */
  pctDoVplDaCidade: number
}

/** Linha da tabela de sistemas da cidade. */
export interface SistemaLinha {
  id: string
  nome: string
  subbacias: number
  faturando: number
  capex: number
  /** Ocupacao da ETE. NULO quando a capacidade e 0 — a tela mostra "—", nao 0%. */
  ocupacaoPct: number | null
}

export interface CidadeDetalhe {
  id: string
  nome: string
  /** Ano do fim da concessao — o eixo da cobertura vai ate ele. */
  fimConcessao: number
  fimCapex: number
  capexTotal: number
  vpl: number
  ligacoesNovas: number
  coberturaBasePct: number
  coberturaFinalPct: number
  cobertura: PontoCobertura[]
  metas: MetaCobertura[]
  cascata: ParcelaFluxoEscoamento[]
  /** Mesmo recorte do painel global, só que desta cidade (validação de 18/08). */
  elementosPorAno: ElementoDoAno[]
  paridade: Paridade
  sistemas: SistemaLinha[]
}

// ===========================================================================
//  NIVEL 3 — topologia do sistema
// ===========================================================================

/** Um componente dentro de um no da topologia. */
export interface ComponenteNo {
  /** Nome canonico do componente — as duas regras estao no topo do arquivo:
   *  "Linha de recalque" e o nome, e transporte NUNCA e agrupado. */
  nome: string
  /** Id da obra — leva ao nivel 5. */
  obraId: string | null
  situacao: SituacaoObra
  capex: number
  precoUnitario: number | null
  quantidade: number | null
  unidade: string | null
  anoInicio: number | null
  /** Meses de execucao — o que aparece em "terceiro · prazo 7m". */
  prazoMeses: number | null
}

export interface NoTopologia {
  id: string
  tipo: TipoEstrutura
  vazao: number
  /** Sub-bacia que fatura tem cabecalho teal; a que nao fatura, ink. */
  fatura: boolean
  /** Só para CTS: a sub-bacia pareada 1:1 (de `snapshot__subbacia_cts`). */
  pareadaCom: string | null
  /** Para onde escoa. `null` = liga direto na ETE. */
  jusante: string | null
  componentes: ComponenteNo[]
}

export interface EteTopologia {
  id: string
  nome: string
  /** Capacidade instalada. Zero e possivel — e o caso que gera ocupacao nula. */
  capacidade: number
  vazaoConectada: number
  /** NULO quando a capacidade e 0: a conta nao existe, e a tela mostra "—". */
  ocupacaoPct: number | null
  /** Em vermelho quando > 0. */
  vazaoNaoAtendida: number
  modulos: ComponenteNo[]
}

export interface Topologia {
  sistemaId: string
  sistemaNome: string
  cidadeId: string
  cidadeNome: string
  subbacias: number
  faturando: number
  capexConstruido: number
  nos: NoTopologia[]
  ete: EteTopologia
  /** Mesmo recorte do painel global, só que deste sistema (validação de 18/08). */
  elementosPorAno: ElementoDoAno[]
}

// ===========================================================================
//  NIVEL 4 — sub-bacia (explicabilidade)
// ===========================================================================

/** Receita da sub-bacia num ano (`run_subbacia_ano`). */
export interface ReceitaAno {
  ano: number
  direta: number
  /** So aparece no ano da conexao — o tooltip diz isso. */
  indireta: number
}

/**
 * A explicabilidade que hoje sai como texto de console e vira UI estruturada.
 * `elo` e o que trava a cadeia: um id de obra, que a tela linka para o nivel 5.
 */
export interface Explicacao {
  categoria: string
  elo: string | null
  narrativa: string
  /** "Se fosse ligada agora", em valor presente. */
  seFosseLigada: {
    receita: number
    capexSozinha: number
    opex: number
    saldoSozinha: number
    saldoComRateio: number
  } | null
}

/**
 * Linha da tabela de elementos da sub-bacia.
 *
 * As colunas sao as do prototipo: elemento, componente, quantidade, preco
 * unitario, CAPEX, inicio e decisao. Quantidade e preco estao aqui, e nao so na
 * ficha, porque e olhando para eles que se entende um CAPEX que parece alto — a
 * pergunta "e caro por que?" se responde na propria tabela.
 */
export interface ElementoLinha {
  obraId: string
  componente: string
  situacao: SituacaoObra
  quantidade: number | null
  unidade: string | null
  precoUnitario: number | null
  capex: number
  anoInicio: number | null
  /** Meses de execucao — o que sustenta o "terceiro · prazo Nm". */
  prazoMeses: number | null
}

export interface SubBaciaDetalhe {
  id: string
  tipo: TipoEstrutura
  pareadaCom: string | null
  cidadeId: string
  cidadeNome: string
  sistemaId: string
  sistemaNome: string
  fatura: boolean
  vazao: number
  vpl: number
  cascata: ParcelaFluxoEscoamento[]
  /** Mesmo recorte do painel global, só que desta única sub-bacia (validação de 18/08). */
  elementosPorAno: ElementoDoAno[]
  receita: ReceitaAno[]
  explicacao: Explicacao
  /** Caminho de jusante ate a ETE, na ordem. */
  caminho: string[]
  elementos: ElementoLinha[]
}

// ===========================================================================
//  NIVEL 5 — elemento (a obra)
// ===========================================================================

/** Quem rateia esta obra. As fracoes somam 1 (o portao de qualidade garante). */
export interface DependenciaObra {
  subbaciaId: string
  vazao: number
  fracaoRateio: number
  capexRateado: number
  fatura: boolean
}

export interface ObraDetalhe {
  obraId: string
  componente: string
  /** Nome exibido, com "(CTS)" quando a obra e de um no de CTS. */
  rotulo: string
  situacao: SituacaoObra
  cidadeId: string
  cidadeNome: string
  sistemaId: string
  sistemaNome: string
  subbaciaId: string
  /** 'Aegea' ou 'Terceiro'. Obra de terceiro nao consome orcamento. */
  responsavel: string
  obrigatoria: boolean
  quantidade: number | null
  unidade: string | null
  precoUnitario: number | null
  capex: number
  opexAno: number
  prazoMeses: number | null
  mesMaisCedo: number | null
  wacc: number
  /**
   * De onde veio o WACC: 'proprio' = financiamento contratado para a obra;
   * 'medio' = o campo veio vazio e herdou o `wacc_medio` da unidade. A tela e
   * obrigada a mostrar a origem — sao coisas economicamente diferentes.
   */
  waccOrigem: 'proprio' | 'medio'
  /**
   * Base comercial da sub-bacia a que a obra serve. Nao e enfeite: e o que
   * transforma o CAPEX de um numero absoluto em algo comparavel — R$ 223 mil e
   * caro ou barato depende de quantas ligacoes ele destrava e de quanto cada uma
   * fatura. O `precoPorLigacao` e a razao entre os dois.
   */
  ligacoesNovas: number | null
  ticketMedio: number | null
  precoPorLigacao: number | null
  /** CAPEX ja construido e o que ainda falta na cadeia desta sub-bacia. */
  capexConstruido: number | null
  capexQueFalta: number | null
  dataInicio: string | null
  dataPronta: string | null
  categoria: string | null
  elo: string | null
  narrativa: string | null
  dependencias: DependenciaObra[]
}
