/**
 * O DICIONÁRIO DOS PARÂMETROS DA RODADA — o equivalente, aqui, ao dicionário de
 * dados do Cadastro (`domain/dicionario.ts`).
 *
 * A tela de nova simulação dispara algo que vai existir para sempre no
 * histórico, e cada controle muda o plano de investimento de um jeito que não é
 * óbvio pelo rótulo. O Cadastro já resolveu esse problema com o "?" e um painel
 * de verbete; isto é a mesma coisa, do outro lado do produto.
 *
 * HÁ UM VERBETE PARA CADA CONTROLE DA TELA, e só para eles: o painel só abre
 * por chave, então verbete sem "?" que o abra é texto que ninguém lê. O que o
 * backend fixa está documentado onde é fixado, em `app/dominio/parametros.py`.
 *
 * A FORMA É A MESMA do verbete do Cadastro de propósito: quem aprendeu a ler o
 * de um campo da ficha não precisa aprender outro formato ao abrir o de um
 * parâmetro da rodada.
 */
import type { Tom } from '@/rodada/components/pecas'

export interface Verbete {
  rotulo: string
  /** O nome técnico — o mesmo que o notebook e o motor usam. */
  tec: string
  /** Quem decide o valor: "você escolhe" ou "fixo nesta versão". */
  origem: string
  tipo: string
  oque: string
  porque: string
  exemplo: string
}

/** Quem decide o valor. Espelha o selo de origem do Cadastro. */
const VOCE = 'você escolhe'

/**
 * Tom do selo de origem. O critério é o MESMO das células do Cadastro: o que
 * vem travado tem uma cor, o que a pessoa preenche tem outra.
 *
 * "fixo nesta versão" usa o tom do travado porque é a mesma mensagem — este
 * valor não está na sua mão.
 *
 * "resultado da rodada" (os verbetes de `dicionarioResultado.ts`) ganha um tom
 * PRÓPRIO, e não o do travado: as duas coisas de fato não estão na sua mão, mas
 * por motivos opostos — uma é decisão de outra pessoa, a outra é consequência
 * calculada. Pintá-las igual apagaria justamente a distinção que o painel
 * existe para ensinar.
 */
export function tomDaOrigem(origem: string): Tom {
  if (origem.includes('resultado')) return 'azul'
  return origem.includes('fixo') || origem.includes('Databricks') ? 'neutro' : 'ambar'
}

export const DICIONARIO_RODADA: Record<string, Verbete> = {
  // ------------------------------------------------------------- 01 escopo
  UNIDADE: {
    rotulo: 'Unidade',
    tec: 'UNIDADE',
    origem: VOCE,
    tipo: 'unidade do cadastro',
    oque: 'A unidade cujo cadastro será otimizado. Cada rodada olha uma só.',
    porque:
      'É o recorte de tudo: cidades, sistemas, sub-bacias e obras vêm dela. O porte aparece no resumo, ao lado do nome.',
    exemplo: 'Unidade Baixada',
  },
  ROTULO: {
    rotulo: 'Nome da simulação',
    tec: 'ROTULO',
    origem: VOCE,
    tipo: 'texto livre',
    oque: 'O nome que identifica esta rodada no histórico.',
    porque:
      'Duas rodadas da mesma unidade só se distinguem pelo nome e pelos parâmetros. Sem ele, o histórico vira uma lista de identificadores.',
    exemplo: 'Baixada — janela 15a, foco cobertura',
  },

  // ---------------------------------------------------------- 02 orçamento
  ORCAMENTO: {
    rotulo: 'Orçamento de CAPEX',
    tec: 'ORCAMENTO',
    origem: VOCE,
    tipo: 'R$ por ano',
    oque: 'Quanto pode ser investido em cada ano-calendário.',
    porque:
      'É o teto anual que o otimizador respeita. A JANELA DE CAPEX é derivada dele — os anos com verba —, e não digitada: duas fontes para a mesma verdade divergiriam no primeiro ano zerado.',
    exemplo: '2027: 60 Mi · 2028: 50 Mi',
  },
  HORIZONTE_CAPEX: {
    rotulo: 'Horizonte',
    tec: 'HORIZONTE_CAPEX',
    origem: VOCE,
    tipo: 'anos',
    oque: 'Por quantos anos a verba única se repete.',
    porque:
      'Só existe no modo "valor único": ele monta um cronograma de N anos com a mesma verba em cada um. No modo por ano, quem define a janela é o próprio cronograma.',
    exemplo: '15',
  },
  DATA_INICIO: {
    rotulo: 'Data de início',
    tec: 'DATA_INICIO',
    origem: VOCE,
    tipo: 'AAAA-MM',
    oque: 'O mês a partir do qual as obras podem começar.',
    porque:
      'Nada inicia antes dela, e o primeiro ano-calendário fica parcial. Vazia = janeiro do ano-base do cadastro.',
    exemplo: '2027-03',
  },

  // ----------------------------------------------------------- 03 objetivo
  FOCO_COBERTURA: {
    rotulo: 'Objetivo',
    tec: 'FOCO_COBERTURA',
    origem: VOCE,
    tipo: 'Cobertura · Equilíbrio · Só VPL',
    oque: 'O que o otimizador prioriza quando VPL e cobertura entram em conflito.',
    porque:
      'Só VPL (0) maximiza retorno e ignora a meta. Cobertura primeiro (1) prioriza cumprir o contrato. Equilíbrio (0,5) pondera os dois.',
    exemplo: 'Cobertura',
  },
  PENALIDADE_COBERTURA: {
    rotulo: 'Estratégia de cobertura',
    tec: 'PENALIDADE_COBERTURA',
    origem: VOCE,
    tipo: 'meta+cobertura · meta',
    oque: 'Como o descumprimento é cobrado na função objetivo.',
    porque:
      '"meta+cobertura" penaliza não bater a meta E ficar abaixo do possível. "meta" penaliza só o descumprimento do ano.',
    exemplo: 'meta + cobertura',
  },

  // ------------------------------------------------------------- 04 receita
  BASE_RECEITA: {
    rotulo: 'Base de receita',
    tec: 'BASE_RECEITA',
    origem: VOCE,
    tipo: 'arrecadada · faturada',
    oque: 'Qual receita alimenta o ticket da simulação.',
    porque:
      'Arrecadada é o que de fato entrou — já reflete inadimplência. Faturada é o bruto. O ticket é a receita escolhida ÷ ligações atuais, então a escolha muda o VPL de toda a rodada.',
    exemplo: 'Arrecadada',
  },
  CURVA_ADOCAO: {
    rotulo: 'Curva de adesão',
    tec: 'CURVA_ADOCAO',
    origem: VOCE,
    tipo: 'scurve · linear',
    oque: 'Como as ligações novas se conectam ao longo do tempo depois da obra.',
    porque:
      'Curva S concentra a adesão no meio do período; linear distribui igual. Afeta quando a receita aparece, e portanto o VPL — não quanto ela é no total.',
    exemplo: 'Curva S',
  },

  // ------------------------------------------------- 05 o que entra no plano
  USAR_CTS: {
    rotulo: 'Coletores de tempo seco (CTS)',
    tec: 'USAR_CTS',
    origem: VOCE,
    tipo: 'considerar · ignorar',
    oque: 'Se o coletor de tempo seco entra como estrutura própria na otimização.',
    porque:
      'Considerar: a CTS tem obras, receita e cobertura próprias. Ignorar: ligações, economias, população, receita e vazão dela são somadas à sub-bacia irmã. Só faz efeito se a base tiver CTS cadastrada.',
    exemplo: 'considerar',
  },
  COBERTURA_SO_RESIDENCIAL: {
    rotulo: 'Recorte da cobertura',
    tec: 'COBERTURA_SO_RESIDENCIAL',
    origem: VOCE,
    tipo: 'todas as ligações · só residenciais',
    oque: 'Se a cobertura é medida contando só ligações e economias residenciais.',
    porque:
      'O RECORTE ACABA NA COBERTURA. Receita, VPL, vazão e CAPEX usam o total nos dois casos — quem paga a conta é a ligação, seja de casa ou de fábrica, e a indústria manda esgoto que a ETE precisa tratar. Só residenciais: universo e base atendida saem das colunas residenciais da base comercial. Todas as ligações: saem dos totais.',
    exemplo: 'todas as ligações',
  },
}
