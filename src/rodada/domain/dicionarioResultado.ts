/**
 * O DICIONÁRIO DOS NÚMEROS DE RESULTADO — o irmão de `dicionario.ts`, do outro
 * lado do produto.
 *
 * Aquele explica o que se ESCOLHE antes de disparar; este explica o que se LÊ
 * depois. A separação é a mesma do domínio: um parâmetro é uma decisão de quem
 * roda, um KPI é uma consequência que o motor calculou — e as duas coisas
 * respondem a perguntas diferentes ("o que isto muda?" contra "de onde isto
 * saiu?").
 *
 * POR QUE ELE EXISTE. Meia dúzia de rótulos de resultado geram sempre a mesma
 * pergunta — "o que é isto?" sobre Faturando, Ocupação da ETE, Componentes,
 * Obras que travam, Receita arrecadada ou faturada, Sub-bacias faturando.
 * Renomear cada um resolve meia dúzia de perguntas; um verbete por número
 * resolve a classe inteira, inclusive as perguntas que ainda não foram feitas.
 *
 * O `tec` AQUI É A COLUNA DO BANCO, e não um parâmetro do motor. Em
 * `dicionario.ts` o nome técnico serve para reconhecer o controle no notebook;
 * aqui ele serve para achar o número na tabela materializada — que é o que
 * alguém faz quando desconfia do valor na tela. Conferidos um a um contra
 * `app/infra/repositorios/resultado.py` e `niveis.py`.
 */
import type { Verbete } from '@/rodada/domain/dicionario'

/** Quem produziu o número. Espelha o selo de origem dos outros dois dicionários. */
const MOTOR = 'resultado da rodada'

export const DICIONARIO_RESULTADO: Record<string, Verbete> = {
  // ------------------------------------------------------------- nível 1
  VPL_PLANO: {
    rotulo: 'VPL do plano',
    tec: 'otim_meta.vpl − vp_efeito_base',
    origem: MOTOR,
    tipo: 'R$, valor presente',
    oque:
      'A soma do valor presente de todas as sub-bacias do plano: receita menos CAPEX e OPEX, descontados pelo WACC até a data-base. O efeito-base de paridade fica DE FORA — ele é receita que existiria sem o plano.',
    porque:
      'É o placar do plano, e o que comparar entre duas rodadas da mesma unidade. Uma ressalva: o otimizador ainda ESCOLHE o plano maximizando o VPL com o efeito-base incluído, então este número não é exatamente a função que ele maximizou — a diferença é o efeito-base, que aparece à parte no detalhe da sub-bacia.',
    exemplo: 'R$ 451,3 Mi',
  },
  CAPEX_TOTAL: {
    rotulo: 'CAPEX total',
    tec: 'otim_meta.capex_total',
    origem: MOTOR,
    tipo: 'R$, nominal',
    oque: 'O investimento das obras que entraram no plano — quantidade × preço unitário, somado.',
    porque:
      'É o que consome o orçamento. Comparado com o teto informado, diz se a verba foi o gargalo da rodada (ver "Uso do orçamento").',
    exemplo: 'R$ 312,6 Mi',
  },
  OPEX_TOTAL: {
    rotulo: 'OPEX total',
    tec: 'otim_meta.opex_total',
    origem: MOTOR,
    tipo: 'R$, nominal',
    oque:
      'O custo de operar as obras depois de prontas, somado ao longo do horizonte. Obra ociosa não gera OPEX: ele sobe conforme as ligações entram.',
    porque: 'Entra no VPL com sinal negativo e é o que separa receita bruta de resultado.',
    exemplo: 'R$ 121,6 Mi',
  },
  RECEITA_TOTAL: {
    rotulo: 'Receita',
    tec: 'otim_meta.receita_total',
    origem: MOTOR,
    tipo: 'R$, nominal',
    oque:
      'A receita de esgoto que o plano gera no horizonte, na base escolhida na rodada — arrecadada (o que efetivamente entra em caixa) ou faturada (o que é emitido). O rótulo do KPI mostra qual das duas.',
    porque:
      'A escolha entre arrecadada e faturada muda o VPL: a arrecadada já desconta inadimplência, e é por isso que a base viaja com a rodada e aparece junto do número.',
    exemplo: 'R$ 1.602,9 Mi (arrecadada)',
  },
  OBRAS_PRIORIZADAS: {
    rotulo: 'Obras priorizadas',
    tec: 'otim_meta.obras_construidas / obras_total',
    origem: MOTOR,
    tipo: 'contagem',
    oque:
      'Quantas obras o otimizador escolheu executar, do total de obras candidatas da unidade. Candidata é toda obra com CAPEX ou prazo — um elemento que existe na ficha e não gera obra não entra no denominador.',
    porque:
      'É o tamanho do plano. O denominador não é meta: ele é o universo do que poderia ser feito, e a maior parte fica de fora por orçamento ou por não se pagar (ver "Por que nem tudo fatura").',
    exemplo: '370 de 2.238',
  },
  SUBBACIAS_FATURANDO: {
    rotulo: 'Sub-bacias que passam a faturar',
    tec: 'otim_meta.subbacias_faturando / subbacias_total',
    origem: MOTOR,
    tipo: 'contagem',
    oque:
      'Quantas sub-bacias terminam o plano com a cadeia completa até a ETE e, por isso, gerando receita.',
    porque:
      'Não é o mesmo que "recebeu obra". Uma sub-bacia pode ter CAPEX executado e não faturar, quando falta outra obra da cadeia — é a categoria "travada por obra da cadeia" da explicabilidade. Por isso o plano tem sempre mais obras do que sub-bacias faturando.',
    exemplo: '130 de 722',
  },
  COBERTURA_FINAL: {
    rotulo: 'Cobertura final',
    tec: 'otim_meta.cobertura_final_pct',
    origem: MOTOR,
    tipo: '%',
    oque:
      'A cobertura de esgoto no último ano do horizonte, medida na régua de cada cidade — ligações, economias ou população, conforme o cadastro da concessão.',
    porque:
      'É contra ela que as metas contratuais são verificadas. A régua é atributo da cidade e não da rodada, porque é o contrato que a define.',
    exemplo: '52,2%',
  },
  METAS_CUMPRIDAS: {
    rotulo: 'Metas contratuais cumpridas',
    tec: 'otim_meta.metas_total − metas_nao_atingidas',
    origem: MOTOR,
    tipo: 'contagem',
    oque:
      'Quantas metas de cobertura o plano cumpre, das que são exigíveis dentro da janela de CAPEX desta rodada.',
    porque:
      'O denominador é só a janela porque o motor não considera meta com ano fora dela — contá-las faria uma rodada de janela curta parecer fracasso quando ela cumpriu tudo o que podia. Metas de anos posteriores continuam no contrato; elas só não são julgadas por esta rodada.',
    exemplo: '19 de 46',
  },
  USO_ORCAMENTO: {
    rotulo: 'Uso do orçamento',
    tec: 'capex_total ÷ orcamento_total',
    origem: MOTOR,
    tipo: '%',
    oque: 'Quanto do teto de investimento informado na rodada foi efetivamente consumido pelo plano.',
    porque:
      'Perto de 100% significa que a verba foi o gargalo — havia obra que se pagava e ficou de fora por falta de teto, e aumentar o orçamento mudaria o resultado. Bem abaixo de 100% significa o contrário: o limite foi a viabilidade das obras, não o dinheiro.',
    exemplo: '83,4%',
  },
  RANKING_VPL: {
    rotulo: 'Posição no ranking de VPL',
    tec: 'otim_cidade.vpl',
    origem: MOTOR,
    tipo: 'posição',
    oque: 'A colocação desta cidade entre as cidades da rodada, ordenadas pelo VPL do plano de cada uma.',
    porque:
      'Situa a cidade dentro da rodada sem obrigar a voltar ao nível 1 e ler a tabela inteira. Cidade com VPL negativo aparece no fim da lista: a posição é descritiva, não um juízo sobre a cidade.',
    exemplo: '3º de 12',
  },

  // ------------------------------------------------------------- nível 3
  OCUPACAO_ETE: {
    rotulo: 'Uso da capacidade da ETE',
    tec: 'otim_sistema.ocupacao_pct',
    origem: MOTOR,
    tipo: '%',
    oque:
      'Vazão conectada dividida pela capacidade instalada da ETE, onde a capacidade instalada é a folga inicial mais os módulos que o plano construiu.',
    porque:
      'Diz se a ETE é o gargalo do sistema. Com folga, o que trava as sub-bacias é o transporte; sem folga, é o tratamento — e a saída passa a ser módulo novo, não rede nova. Acima de 100% não é um plano válido: é sinal de dado inconsistente entre capacidade e vazão.',
    exemplo: '78,4%',
  },
  SISTEMA_FATURANDO: {
    rotulo: 'Sub-bacias com receita no plano',
    tec: 'otim_sistema.sub_bacias_faturando',
    origem: MOTOR,
    tipo: 'contagem',
    oque:
      'Quantas sub-bacias deste sistema terminam o plano gerando receita — cadeia completa até a ETE.',
    porque:
      'É o mesmo conceito do nível 1, no recorte do sistema. Sub-bacia que recebeu obra e não fatura continua contando no CAPEX e não conta aqui, e essa diferença é o que o diagrama de escoamento mostra em vermelho.',
    exemplo: '7',
  },

  // -------------------------------------------------- explicabilidade
}
