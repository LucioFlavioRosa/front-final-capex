/**
 * A PLANILHA DO CADASTRO — o que a unidade baixa preenchido e devolve preenchido.
 *
 * ## Por que existe
 *
 * Uma unidade grande tem centenas de sub-bacias e milhares de linhas de obra.
 * Digitar isso célula a célula na grade é possível, e é o que ninguém vai fazer:
 * quem tem o dado o tem numa planilha. Então a plataforma entrega UMA planilha
 * no formato que ela mesma entende — cada aba do cadastro é uma aba do arquivo,
 * já com as linhas de hoje — e recebe a mesma planilha de volta.
 *
 * ## O que este módulo é, e o que não é
 *
 * É o MODELO do arquivo e a MESCLA da volta: quais abas, quais colunas, como um
 * número atravessa (a tela guarda tudo como texto pt-BR; o Excel quer número), e
 * como uma linha da planilha encontra a linha da tela para atualizá-la. Não sabe
 * ler nem escrever `.xlsx` — isso é `lib/planilhaCadastro.ts`, que é o único
 * lugar que importa a biblioteca. Separar os dois é o que deixa a regra testável
 * sem montar arquivo nenhum.
 *
 * ## Decisões que valem como contrato
 *
 * SÓ ENTRA O QUE O SERVIDOR GRAVA — e isso é mais do que "o que a unidade
 * preenche". A medida que veio do Databricks é SOBREPONÍVEL: a ficha de coleta
 * grava `{...bloco_db, ...params}`, com trilha de quem mudou. Então o que decide
 * é o contrato de gravação (`data/cadastroUnidade/gravavel.ts`), não a origem do
 * valor. Fica em cinza, e ignorado na volta, o que o servidor recusa: as colunas
 * derivadas (ticket, `*_com_cts`, `capex`) e as calculadas. O que o arquivo pinta de
 * âmbar e o que a GRADE deixa digitar saem do mesmo contrato — a planilha não pode
 * poder mais que a tela, senão o aviso "para mudá-la, use a tela" mentiria.
 *
 * O NOME ENTRA; O ID, NÃO. Até 01/10/2026 os dois ficavam fora, e este parágrafo dizia
 * que "criar ficha não é papel do wizard". As duas coisas mudaram no mesmo dia, e por
 * razões diferentes:
 *
 * O nome é RÓTULO, e o serviço ganhou campo para ele nas cinco entidades. O id é
 * IDENTIDADE: trocá-lo não é atualizar a linha, é apontar para outra — e é por ele que a
 * mescla casa. Então id continua se escolhendo na tela, onde há regra para conferir.
 *
 * E A LINHA COM ID DESCONHECIDO PASSOU A NASCER, nas abas de `CRIAVEL_POR_ABA`: o dono
 * do produto precisa subir unidades que não estão no Databricks, e para isso a planilha
 * tem de criar — empresa, cidade, sistema, sub-bacia, coletor e ETE, nessa ordem, que é a
 * de `ORDEM_DA_CORRENTE`. Nada é gravado na importação: a linha entra no estado, a pessoa
 * a vê na grade e clica em Salvar. É isso que torna a criação revisável, e é o que protege
 * do caso ruim — um id digitado errado virando registro novo em silêncio.
 *
 * A PLANILHA É DE UMA UNIDADE. Os ids gerados (`b001`, `s01`…) se repetem entre
 * unidades, então casar só pela chave da linha aplicaria a unidade A por cima
 * da B. A aba Unidade carrega o `unidade_id`, e a mescla recusa o arquivo de
 * outra unidade — e o arquivo sem essa aba, porque sem ela não há como saber.
 *
 * A MACRORREGIÃO DE CTS APARECE NO ARQUIVO — E SÓ SE DECIDE NA TELA. A caixa da
 * aba Unidade decide quantas CTS cada sistema comporta — marcada, uma;
 * desmarcada, quantas forem colocadas — e é isso que diz quantas fichas de CTS
 * há para preencher. Então o regime vai escrito no Leia-me, a célula da caixa vai
 * na aba Unidade, e as abas de CTS carregam a regra no cabeçalho. Mas a célula
 * NÃO VOLTA: a caixa da tela grava no servidor na hora e relê as fichas de CTS,
 * porque o regime muda quais fichas existem (a soma da macrorregião, ou cada
 * coletor). Uma planilha gerada num regime carrega as fichas daquele regime —
 * importá-la na tela em outro regime é avisado, e as abas de CTS dela ficam de
 * fora.
 *
 * A CTS ENTRA NUM SISTEMA PELA PLANILHA — só entra. A ficha e as obras de uma
 * CTS chegam da origem antes de alguém decidir em que sistema ela entra, e quem
 * preenche fora do site quer preenchê-las já. Então a aba "Dados da CTS" traz
 * também as CTS ainda fora de sistema (`sisId` vazio), e nelas a coluna
 * `sistema_id` é a única coluna de id que a planilha aceita: o id (ou o nome) de
 * um sistema da unidade. Mudar de sistema ou sair dele continua sendo pela tela,
 * onde há o desenho do fluxo para conferir. Marcada a macrorregião, um sistema
 * que já tem CTS não recebe outra — a mesma regra do seletor da tela.
 */
import { ABAS_VISIVEIS } from '../data/cadastroUnidade/blocos'
import {
  colunaCalculadaNoServidor,
  colunaGravavel,
  type ContextoDeGravacao,
} from '../data/cadastroUnidade/gravavel'
import { colunaLabel, SCHEMA } from '../data/cadastroUnidade/schema'
import type { AbaDef, ColDef, Row, UnidadeState } from '../data/cadastroUnidade/types'
import { recalcularDerivadasDaColeta } from './calc'
import { type Dados, ehCts } from './fluxo'

// ------------------------------------------------------------------ o modelo

/** A aba de instruções, sempre a primeira do arquivo. Não é aba de dado. */
export const LEIA_ME = 'Leia-me'

/**
 * A ABA DE APOIO com os sistemas da unidade — id, nome e cidade —, para quem
 * vai preencher o `sistema_id` de uma CTS ter onde procurar. É a aba oculta
 * `cidade-sistema` do cadastro; só leitura, e a mescla a ignora sem aviso.
 */
export const SISTEMAS = 'Sistemas'

/**
 * A ABA DE APOIO DO FLUXO — o nome mora aqui porque a mescla precisa IGNORÁ-LA.
 *
 * Ela existe para as duas listas suspensas da aba do Fluxo apontarem para faixas: os
 * componentes agrupados por sistema (o que torna o bloco de cada um contíguo) e as CTS
 * livres. Quem a escreve é `lib/planilhaCadastro.ts`.
 */
export const COMPONENTES = 'Componentes'

/** As abas do arquivo que não são de dado do cadastro, e que a mescla pula sem avisar. */
export const ABAS_DE_APOIO = new Set([LEIA_ME, SISTEMAS, COMPONENTES])

/**
 * O NOME DE CADA ABA NO ARQUIVO. O Excel limita a 31 caracteres e proíbe
 * `[ ] : * ? / \` — "CAPEX de componentes de sub-bacias" tem 34. Aba sem entrada
 * aqui usa o título da tela, e o teste confere que todos cabem.
 */
export const NOME_DA_PLANILHA: Record<string, string> = {
  'unidade-regional': 'Unidade',
  'componentes-subbacias-capex': 'CAPEX das sub-bacias',
}

/**
 * COLUNAS QUE A TELA NÃO MOSTRA MAS A PLANILHA PRECISA. No Fluxo, a barra de
 * escopo diz de qual sistema é cada linha e a grade não repete; no arquivo não
 * há barra, e sem as duas colunas a aba vira uma lista de trechos sem sistema.
 * Só leitura: quem coloca uma CTS num sistema pelo arquivo é a aba da CTS.
 */
const COLUNAS_EXTRAS: Record<string, ColDef[]> = {
  'sistema-topologia': [
    { coluna: 'sistema_id', origem: 'db', procedencia: 'mock' },
    { coluna: 'sistema_name', origem: 'db', procedencia: 'mock' },
  ],
}

export interface PlanilhaDaAba {
  aba: AbaDef
  /** O nome da aba no arquivo — ver `NOME_DA_PLANILHA`. */
  nome: string
  colunas: ColDef[]
  linhas: Row[]
}

export const nomeDaPlanilha = (aba: AbaDef): string => NOME_DA_PLANILHA[aba.key] ?? aba.titulo

export const colunasDaPlanilha = (aba: AbaDef): ColDef[] => [
  ...(COLUNAS_EXTRAS[aba.key] ?? []),
  ...aba.cols,
]

/** As abas do arquivo, na ordem do stepper: as visíveis, todas. */
export function planilhasDoCadastro(dados: Dados): PlanilhaDaAba[] {
  return ABAS_VISIVEIS.map((aba) => ({
    aba,
    nome: nomeDaPlanilha(aba),
    colunas: colunasDaPlanilha(aba),
    linhas: dados[aba.key] ?? [],
  }))
}

/**
 * UMA LINHA POR CIDADE NAS LISTAS, mesmo sem registro.
 *
 * Metas de cobertura e Escala de paridade são abas de "Adicionar linha": uma
 * cidade sem meta não tem linha nenhuma, e quem abre o arquivo para preencher
 * não teria onde escrever — nem saberia que a cidade existe. Então o ARQUIVO
 * leva, para cada cidade sem registro, uma linha-modelo com a cidade preenchida
 * e o resto em branco. Cidade que já tem registro vai como está.
 *
 * Só no arquivo: o estado da tela não ganha linha nenhuma, e na volta a
 * linha-modelo intocada (nada além da cidade) é ignorada em silêncio — é o que
 * mantém "baixar e importar sem mexer" sem mudar nada.
 */
const ABAS_POR_CIDADE = new Set(['metas-cobertura', 'fator-esgoto'])

/**
 * A ORDEM DA ABA DO FLUXO: cada CTS encostada no componente para onde ela escoa.
 *
 * *"todos elementos devem estar agrupados por sub bacia, atualmente você está colocando
 * todas as cts no fim da planilha"*. A carga entrega as CTS depois de tudo, e numa unidade
 * de 154 CTS elas viravam um bloco no fim do arquivo, longe do sistema a que pertencem.
 *
 * Medido no portfólio real, antes de desenhar: das 340 linhas de CTS, 116 escoam para uma
 * SUB-BACIA, 70 para uma ETE, 154 ainda não têm jusante — e NENHUM componente escoa para
 * uma CTS, que portanto é sempre nascente. É isso que permite a regra simples: a CTS vai
 * logo depois do seu jusante. Nos 116 casos ela encosta na sub-bacia, que é o pedido ao pé
 * da letra; nos 70, na ETE, que é para onde ela escoa de fato.
 *
 * As ÂNCORAS mantêm a ordem de chegada: a hierarquia já as entrega na ordem da corrente, e
 * reordená-las aqui desfaria esse trabalho. A CTS sem jusante fecha o bloco do PRÓPRIO
 * sistema — sem destino, não há onde encostá-la, e o fim do bloco dela é o seu sistema, não
 * o fim da planilha.
 */
function agrupadoPelaCorrente(linhas: Row[], dados: Dados): Row[] {
  const chave = (l: Row) => txt(l.componente_sistema_id)
  const cts = linhas.filter((l) => ehCts(dados, l))
  if (!cts.length) return linhas

  //: as CTS que encostam em alguém, pelo id do destino — e só dentro do mesmo sistema,
  //: porque jusante noutro sistema é desenho inválido e não ganha lugar emprestado aqui
  const porDestino = new Map<string, Row[]>()
  const semDestino: Row[] = []
  const sistemaDe = new Map(linhas.map((l) => [chave(l), txt(l.sistema_id)]))
  for (const c of cts) {
    const destino = txt(c.componente_sistema_id_jusante)
    const mesmoSistema = destino && sistemaDe.get(destino) === txt(c.sistema_id)
    if (!mesmoSistema) {
      semDestino.push(c)
      continue
    }
    if (!porDestino.has(destino)) porDestino.set(destino, [])
    porDestino.get(destino)!.push(c)
  }

  //: as âncoras na ordem de chegada; cada uma arrasta as CTS que escoam para ela
  const saida: Row[] = []
  const posto = new Set<string>()
  for (const l of linhas) {
    if (ehCts(dados, l)) continue
    saida.push(l)
    posto.add(chave(l))
    for (const c of porDestino.get(chave(l)) ?? []) {
      saida.push(c)
      posto.add(chave(c))
    }
  }

  //: o que sobrou, no fim do bloco do PRÓPRIO sistema: as sem destino e as que escoam para
  //: outra CTS (que o portfólio não tem, mas o arquivo não pode perder linha por isso)
  const sobrando = [...semDestino, ...cts.filter((c) => !posto.has(chave(c)))]
    .filter((c, i, todas) => todas.findIndex((o) => chave(o) === chave(c)) === i)
  if (!sobrando.length) return saida

  const ordemDoSistema = [...new Set(saida.map((l) => txt(l.sistema_id)))]
  const fim: Row[] = []
  const resultado: Row[] = []
  for (const sis of ordemDoSistema) {
    resultado.push(...saida.filter((l) => txt(l.sistema_id) === sis))
    resultado.push(...sobrando.filter((c) => txt(c.sistema_id) === sis))
  }
  //: CTS de sistema que não tem âncora nenhuma: não cabe em bloco algum, e vai no fim
  fim.push(...sobrando.filter((c) => !ordemDoSistema.includes(txt(c.sistema_id))))
  return [...resultado, ...fim]
}

export function linhasNoArquivo(planilha: PlanilhaDaAba, dados: Dados): Row[] {
  /**
   * A CTS SEM SISTEMA NÃO ENTRA NA ABA DO FLUXO.
   *
   * *"as cts têm que ficar na aba de cts somente"* — e está certo. A aba do Fluxo é o
   * DESENHO dos sistemas, e uma CTS fora de sistema não está em desenho nenhum: não tem
   * jusante, não tem sistema, e as duas colunas que ela preencheria são as que a aba não
   * aceita dela. Ela vinha porque a carga devolve as livres como linha de topologia
   * (`semSistema`), e elas desciam para o arquivo pendurando-se no fim.
   *
   * Sair do ARQUIVO não é sair do cadastro: ela está em "Dados da CTS" com o sistema em
   * branco (que é por onde se coloca), e continua na lista suspensa do ID Origem — a aba
   * de apoio `Componentes` é montada do ESTADO, não das linhas do arquivo. E a volta não
   * a apaga: linha ausente do arquivo é linha não mencionada, nunca linha removida.
   */
  if (planilha.aba.key === 'sistema-topologia') {
    return agrupadoPelaCorrente(
      planilha.linhas.filter((l) => (l.sistema_id ?? '').trim()),
      dados,
    )
  }
  if (!ABAS_POR_CIDADE.has(planilha.aba.key)) return planilha.linhas
  const comRegistro = new Set(planilha.linhas.map((l) => (l.cidade_id ?? '').trim()))
  const modelos = (dados['cidade-operacional'] ?? [])
    .filter((c) => c.cidade_id && !comRegistro.has(c.cidade_id.trim()))
    .map((c) => {
      const linha: Row = {
        emp_codigo: c.emp_codigo ?? '',
        empresa: c.empresa ?? '',
        cidade_id: c.cidade_id,
        cidade_name: c.cidade_name ?? '',
      }
      for (const col of colunasImportaveis(planilha.aba, contextoDeGravacao(dados))) linha[col] = ''
      return linha
    })
  return modelos.length ? [...planilha.linhas, ...modelos] : planilha.linhas
}

/** As abas como vão para o ARQUIVO: as da tela, com a linha-modelo por cidade nas listas. */
export function planilhasDoArquivo(dados: Dados): PlanilhaDaAba[] {
  return planilhasDoCadastro(dados).map((p) => ({ ...p, linhas: linhasNoArquivo(p, dados) }))
}

/** As linhas da aba de apoio `Sistemas`: um sistema por linha, com a cidade. */
export function linhasDeSistemas(dados: Dados): Row[] {
  const cidade = new Map((dados['cidade-operacional'] ?? []).map((c) => [c.cidade_id, c.cidade_name ?? '']))
  return (dados['cidade-sistema'] ?? []).map((s) => ({
    sistema_id: s.sistema_id ?? '',
    sistema_name: s.sistema_name ?? '',
    cidade_id: s.cidade_id ?? '',
    cidade_name: cidade.get(s.cidade_id ?? '') ?? '',
  }))
}

/**
 * A UNIDADE PREENCHE, MAS SÓ NA TELA. A caixa da macrorregião grava na hora e
 * relê o cadastro (ver o cabeçalho): na planilha ela é leitura, como uma coluna
 * do Databricks, e é assim que o arquivo a pinta.
 */
export const SO_NA_TELA = new Set(['usa_macrorregiao_cts'])

/**
 * O ID DO SISTEMA NA ABA DA CTS — a exceção à regra "id não se preenche". Só
 * nela: é a coluna por onde a CTS livre entra num sistema (ver o cabeçalho).
 */
export const COLOCA_NO_SISTEMA: Record<string, string> = { 'cts-operacional': 'sistema_id' }

/**
 * A COLUNA "Sistema" DO FLUXO é porta de colocação — e só ali.
 *
 * Nas outras abas `sistema_name` é espelho de leitura, e mudá-la lá merece o aviso de
 * "não volta". Uma isenção global tiraria o aviso do lugar em que ele está certo: foi o
 * que eu fiz primeiro, e o teste da contagem por coluna pegou.
 */
const PORTA_DO_SISTEMA: Record<string, readonly string[]> = {
  'sistema-topologia': ['sistema_id', 'sistema_name'],
  //: a PRIMEIRA porta, e a razão de `COLOCA_NO_SISTEMA` existir
  'cts-operacional': ['sistema_id'],
}

/**
 * A COLUNA ENTRA NA VOLTA? A que o `PUT` daquela ficha GRAVA — nem mais, nem menos.
 *
 * A regra era `origem === 'un'`, e estava errada por baixo. `origem` é informação
 * de APRESENTAÇÃO: diz de onde o valor veio (a base comercial, o motor, a
 * unidade), não se o servidor o aceita de volta. E o servidor aceita mais: a
 * ficha de coleta grava `{...bloco_db, ...params}`, ou seja a medida que veio do
 * Databricks é sobreponível, com trilha. Eram 30 colunas que o servidor gravava e
 * a planilha recusava — 13 na sub-bacia, 14 na CTS e 3 nas obras —, e recusava
 * calado.
 *
 * Então a regra passou a ser o CONTRATO, em `data/cadastroUnidade/gravavel.ts`,
 * onde está também o porquê de cada coluna que fica fora. Uma regra, um lugar: a
 * pintura do arquivo deriva desta, a grade deriva do mesmo contrato, e um teste
 * confere que ele concorda com os de/para que o `cadastroApi` usa no `PUT`.
 *
 * A exceção é `COLOCA_NO_SISTEMA`: ali a coluna é um id, não está no contrato
 * genérico, e o upload a lê mesmo assim por caminho próprio
 * (`colocarCtsNoSistema`).
 */
export const colunaImportavel = (aba: AbaDef, c: ColDef, ctx: ContextoDeGravacao = {}): boolean =>
  colunaGravavel(aba.key, c.coluna, ctx)

/** As colunas de uma aba que a planilha devolve, na ordem da aba. */
export const colunasImportaveis = (aba: AbaDef, ctx: ContextoDeGravacao = {}): string[] =>
  aba.cols.filter((c) => colunaImportavel(aba, c, ctx)).map((c) => c.coluna)

/**
 * O CONTEXTO DA UNIDADE para o contrato de gravação — ver `ContextoDeGravacao`.
 *
 * Mora aqui porque é da leitura do cadastro que ele sai, e os três lados o pedem: a pintura
 * do arquivo, a mescla da volta e a grade. Derivá-lo em cada um deles seria a divergência de
 * 30/09 montada outra vez, com outro nome.
 */
export const contextoDeGravacao = (dados: Dados): ContextoDeGravacao => ({
  ctsSomada: regimeDeCts(dados).macro,
})

/**
 * Como a coluna se apresenta no arquivo: editável (âmbar), ou só leitura (cinza).
 *
 * DERIVA DE `colunaImportavel`, e não repete a regra. Enquanto eram duas regras
 * parecidas, elas divergiam em 11 colunas — e a divergência tinha um lado só: o
 * arquivo pintava de âmbar ("preencha aqui") colunas que o upload DESCARTA, e
 * descarta calado, porque `aplicar` só percorre as importáveis e nunca vê a
 * coluna para avisar. Hoje as duas são a mesma pergunta: o `PUT` grava?
 *
 * Relatado por tester em 30/09/2026: "atualizo um dado de uma coluna que já vem
 * preenchida no download e ao subir não é salva". Eram `ete_name`, `sistema_id`
 * da ETE, `cts_id`, `cts_name`, `cidade_id`, `cidade_name` e as duas da aba de
 * sobreposição — todas pintadas como preenchíveis, todas ignoradas.
 *
 * A ÚNICA exceção continua sendo `COLOCA_NO_SISTEMA`: ali a coluna é um id e o
 * upload a lê mesmo assim, por um caminho próprio (`colocarCtsNoSistema`).
 */
export const editavelNaPlanilha = (aba: AbaDef, c: ColDef, ctx: ContextoDeGravacao = {}): boolean =>
  colunaImportavel(aba, c, ctx) || COLOCA_NO_SISTEMA[aba.key] === c.coluna

// -------------------------------------------------------------- o regime

export interface RegimeDeCts {
  macro: boolean
  /** "Macrorregião" ou "Microrregião". */
  nome: string
  /** A regra, em uma frase — a mesma no Leia-me, no cartão e no cabeçalho. */
  regra: string
}

/**
 * O regime da unidade, lido da caixa. É o que a planilha reflete: com a
 * macrorregião marcada, as abas de CTS trazem uma ficha por sistema; sem ela,
 * uma por coletor — colocado ou ainda esperando sistema.
 */
export function regimeDeCts(dados: Dados): RegimeDeCts {
  const macro = dados['unidade-regional']?.[0]?.usa_macrorregiao_cts === 'Sim'
  return macro
    ? {
        macro,
        nome: 'Macrorregião',
        regra:
          'Esta unidade usa macrorregião de CTS: cada sistema aceita UMA CTS. As abas ' +
          '"Dados da CTS" e "CAPEX da CTS" trazem uma ficha por macrorregião — a soma dos ' +
          'coletores dela —, as já colocadas num sistema e as que ainda esperam um (sistema ' +
          'em branco); as obras se preenchem na macrorregião, nunca no coletor.',
      }
    : {
        macro,
        nome: 'Microrregião',
        regra:
          'Esta unidade usa microrregião de CTS: cada sistema aceita mais de uma CTS. As ' +
          'abas "Dados da CTS" e "CAPEX da CTS" trazem uma ficha por coletor — os já ' +
          'colocados num sistema e os que ainda esperam um (sistema em branco) —, e as ' +
          'obras se preenchem coletor a coletor.',
      }
}

// ------------------------------------------------------- número na ida e na volta

/**
 * O CONTRATO DE NÚMERO É pt-BR ESTRITO — o mesmo do servidor (`formato.py`): a
 * tela guarda `"1.026,89"`, e é assim que o valor viaja no `PUT`. O Excel, por
 * sua vez, só soma o que é número. Então a ida converte texto pt-BR em número e
 * a volta refaz o texto, e o teste de ida e volta garante que nada se perde.
 */
const PT_BR = /^-?\d{1,3}(\.\d{3})*(,\d+)?$|^-?\d+(,\d+)?$/

/**
 * ANO E CÓDIGO NÃO GANHAM SEPARADOR DE MILHAR — `2028` não é "2.028". A lista
 * espelha `SEM_SEPARADOR` do servidor, com os nomes de coluna da tela.
 */
export const COLUNAS_SEM_SEPARADOR = new Set([
  'data_fim_concessao',
  'ano',
  'obra_obrigatoria_ano',
  'obra_proibida_ate',
])

/**
 * ID, CÓDIGO E NOME SÃO TEXTO, mesmo quando só têm dígitos. Um `cidade_id`
 * "3550308" que virasse número voltaria como "3.550.308", e a linha deixaria de
 * encontrar a cidade dela.
 *
 * `empresa` entrou na lista quando o nome passou a ser gravável (01/10/2026): não
 * termina em `_name`, e uma empresa chamada "1001" voltaria como "1.001" — gravando
 * um nome que ninguém digitou.
 */
export const ehColunaDeTexto = (col: string): boolean =>
  col.endsWith('_id') || col.endsWith('_name') || col === 'emp_codigo' || col === 'empresa'

/** Texto pt-BR → número, quando é número estrito; senão o texto como está. */
export function paraCelula(col: string, valor: string | undefined): string | number {
  const v = (valor ?? '').trim()
  if (!v || ehColunaDeTexto(col) || !PT_BR.test(v)) return v
  return Number(v.replace(/\./g, '').replace(',', '.'))
}

/** Número → texto pt-BR, como o servidor emite: inteiro sem casa, até 4 casas. */
export function ptBr(n: number, col = ''): string {
  if (!Number.isFinite(n)) return ''
  if (COLUNAS_SEM_SEPARADOR.has(col)) return n.toLocaleString('pt-BR', { useGrouping: false, maximumFractionDigits: 4 })
  return n.toLocaleString('pt-BR', { maximumFractionDigits: 4 })
}

/**
 * FÓRMULA SEM RESULTADO — o arquivo foi salvo sem calcular (LibreOffice com
 * recálculo desligado, `.xlsx` gerado por script). Não há valor a ler, e ler
 * vazio apagaria a célula em silêncio: quem mescla pula a célula e avisa.
 */
export const semResultado = (valor: unknown): boolean =>
  typeof valor === 'object' && valor !== null && 'formula' in valor && (valor as { result?: unknown }).result == null

/**
 * O QUE VEIO NA CÉLULA → o texto que a tela guarda.
 *
 * A biblioteca devolve a célula como ela é no arquivo: número, texto, data,
 * fórmula (com o resultado ao lado), texto formatado em pedaços, hiperlink. A
 * tela só conhece texto — e é o resultado que interessa, nunca a fórmula.
 */
export function daCelula(col: string, valor: unknown): string {
  if (valor == null) return ''
  if (typeof valor === 'number') return ptBr(valor, col)
  if (typeof valor === 'boolean') return valor ? 'Sim' : 'Nao'
  if (valor instanceof Date) return String(valor.getFullYear())
  if (typeof valor === 'object') {
    const o = valor as { result?: unknown; richText?: { text: string }[]; text?: unknown; error?: unknown }
    if ('error' in o) return ''
    if ('result' in o) return daCelula(col, o.result)
    if (Array.isArray(o.richText)) return o.richText.map((t) => t.text).join('').trim()
    if ('text' in o) return daCelula(col, o.text)
    return ''
  }
  return String(valor).trim()
}

// ------------------------------------------------------------------ a volta

/** Uma aba do arquivo, como a biblioteca a leu: as chaves das colunas e as linhas cruas. */
export interface AbaLida {
  colunas: string[]
  linhas: Record<string, unknown>[]
}

/** O arquivo lido: nome da aba → conteúdo. As abas de apoio não entram. */
export type PlanilhaLida = Record<string, AbaLida>

/**
 * A ORDEM EM QUE AS ABAS SÃO MESCLADAS — a da CORRENTE, não a do stepper.
 *
 * O stepper é a ordem da TELA, e ela põe o Fluxo antes das sub-bacias porque é na aba do
 * Fluxo que se desenha o sistema. Para a planilha a ordem tem de ser outra: **ninguém
 * pode ser criado antes de quem o prende à unidade**.
 *
 *     empresa → cidade → sistema → sub-bacia / coletor / ETE → fluxo
 *
 * O Fluxo vai por ÚLTIMO porque ele referencia todo mundo: colocar um componente num
 * sistema e desenhar o caminho até a ETE só faz sentido depois de os três existirem. Era
 * ele que, vindo antes, recusava uma sub-bacia criada na mesma planilha.
 *
 * Aba que não está nesta lista mantém a posição relativa dela, depois das listadas: o que
 * se declara aqui é dependência, e inventar uma ordem total obrigaria a mexer nesta lista
 * a cada aba nova.
 */
const ORDEM_DA_CORRENTE = [
  'unidade-regional',
  'empresa',
  'cidade-operacional',
  'cidade-sistema',
  'metas-cobertura',
  'fator-esgoto',
  'subbacia-operacional',
  'cts-operacional',
  'ete-capex',
  'componentes-subbacias-capex',
  'componentes-cts-capex',
  'sistema-topologia',
]

const naOrdemDaCorrente = (planilhas: PlanilhaDaAba[]): PlanilhaDaAba[] =>
  [...planilhas].sort((a, b) => {
    const ia = ORDEM_DA_CORRENTE.indexOf(a.aba.key)
    const ib = ORDEM_DA_CORRENTE.indexOf(b.aba.key)
    return (ia < 0 ? ORDEM_DA_CORRENTE.length : ia) - (ib < 0 ? ORDEM_DA_CORRENTE.length : ib)
  })

export interface ResultadoDaMescla {
  /** SÓ as abas que mudaram, prontas para `IMPORTAR_PLANILHA`. */
  dados: Dados
  /** Quantas células mudaram de valor. */
  alteracoes: number
  /** Quantas linhas a planilha trouxe, somando as abas reconhecidas. */
  linhasLidas: number
  /** O que foi ignorado e por quê — para a pessoa ler antes de salvar. */
  avisos: string[]
  /**
   * QUANTAS CÉLULAS VIERAM DIFERENTES EM COLUNA QUE NÃO VOLTA.
   *
   * Existe porque sem ele a tela dizia, com zero alterações, "nenhum valor diferente do
   * que a tela já tem" — e isso era falso justamente no caso que leva alguém a reclamar:
   * a pessoa MUDOU algo, e a mudança não entrou. O resumo precisa separar "a planilha não
   * trouxe novidade" de "trouxe, e não é coluna que volta".
   */
  naoVoltaram: number
}

/**
 * AS ABAS EM QUE A PLANILHA CRIA LINHA — e o que o nascimento de cada uma exige.
 *
 * Até 01/10/2026 a regra era o contrário: "uma linha cujo id a tela não conhece é
 * avisada e ignorada, porque criar ficha não é papel do wizard". O dono do produto
 * mudou isso depois de acrescentar uma empresa na planilha e ler *"e2sup5 não existe no
 * cadastro — ignorada"*: **as três fontes — Databricks, tela e planilha — têm de poder
 * criar e atualizar o mesmo**.
 *
 * Criar não é o mesmo que atualizar, e a diferença mora aqui:
 *
 * `exige` — as colunas sem as quais a linha não nasce. Uma empresa só com código
 *   aparece em cinco abas como linha em branco; o servidor também recusa (422), e um
 *   422 derrubaria o lote inteiro, porque o salvamento é tudo-ou-nada. Então a planilha
 *   barra antes e diz qual coluna falta.
 *
 * `herda` — as colunas que NÃO vêm do arquivo e sim do contexto. A unidade de uma
 *   empresa nova é a unidade aberta, nunca o que estiver escrito na célula: planilha de
 *   outra unidade já é recusada inteira, e aceitar o valor da célula abriria uma segunda
 *   via para o mesmo erro.
 *
 * O id vem da CHAVE da aba (`ESTRATEGIA`), que é o que a mescla já usa para casar.
 */
export interface RegraDeCriacao {
  exige: readonly string[]
  herda?: (unidade: { id: string; data: Dados }) => Row
  /**
   * COLUNAS QUE NÃO SAEM DA CÉLULA COMO ESTÃO — e a recusa, quando não dá.
   *
   * O Fluxo é o caso: a pessoa escreve o SISTEMA pelo nome (é o que a coluna mostra),
   * e a linha precisa do id. E o componente tem de existir no cadastro — o servidor
   * confere, mas um 422 derrubaria o lote inteiro, e a mensagem dele não diz em que
   * linha do arquivo o problema está.
   */
  resolve?: (
    origem: Record<string, unknown>,
    unidade: { id: string; data: Dados },
  ) => Row | { recusa: string }
}

/**
 * A CIDADE PEDIDA, por id ou nome — o mesmo par que `resolverSistema` faz com o sistema.
 *
 * Nome repetido entre cidades da unidade devolve `'ambiguo'`: adivinhar poria o coletor na
 * cidade errada, e isso só apareceria no resultado.
 */
export function resolverCidade(dados: Dados, texto: string): Row | null | 'ambiguo' {
  const cidades = dados['cidade-operacional'] ?? []
  const k = texto.trim().toLowerCase()
  if (!k) return null
  const porId = cidades.find((c) => txt(c.cidade_id).toLowerCase() === k)
  if (porId) return porId
  const porNome = cidades.filter((c) => txt(c.cidade_name).toLowerCase() === k)
  return porNome.length === 1 ? porNome[0] : porNome.length > 1 ? 'ambiguo' : null
}

/**
 * O que a sub-bacia e a ETE precisam para nascer: um SISTEMA desta unidade.
 *
 * As duas são componentes de sistema, e é por ele que chegam à unidade. A cidade vem de
 * brinde quando o sistema tem uma só — e quando ele atravessa cidades (há 12 assim na
 * base), fica em branco: inventar uma seria escolher no escuro.
 */
function resolveComSistema(
  origem: Record<string, unknown>,
  unidade: { id: string; data: Dados },
  colunaDoNome: string,
): Row | { recusa: string } {
  const pedido = txt(daCelula('sistema_id', origem.sistema_id))
    || txt(daCelula('sistema_name', origem.sistema_name))
  if (!pedido) {
    return { recusa: `informe o Sistema (o id ou o nome): é ele que diz de que unidade esta ficha é.` }
  }
  const sistema = resolverSistema(unidade.data, pedido)
  if (sistema === 'ambiguo') {
    return { recusa: `"${pedido}" é o nome de mais de um sistema — use o id (aba "${SISTEMAS}").` }
  }
  if (!sistema) {
    return { recusa: `o sistema "${pedido}" não é desta unidade — veja os ids na aba "${SISTEMAS}".` }
  }
  const extras: Row = {
    sistema_id: txt(sistema.sistema_id),
    sistema_name: txt(sistema.sistema_name),
    [colunaDoNome]: txt(daCelula(colunaDoNome, origem[colunaDoNome])),
  }
  return extras
}

export const CRIAVEL_POR_ABA: Record<string, RegraDeCriacao> = {
  'empresa': {
    exige: ['empresa'],
    herda: (unidade) => ({ unidade_id: unidade.id }),
  },
  /**
   * A CIDADE — o segundo elo da corrente de partida.
   *
   * O que a prende à unidade é a EMPRESA que a opera (`cidade_empresa`), e é ela que o
   * serviço confere. Por isso `emp_codigo` é exigido no nascimento, mesmo não sendo
   * coluna importável: trocá-lo numa cidade que já existe é mudá-la de operadora, e isso
   * não é "atualizar um campo" — fica para quando alguém pedir.
   */
  'cidade-operacional': {
    exige: ['cidade_name'],
    resolve: (origem, unidade) => {
      const pedido = txt(daCelula('emp_codigo', origem.emp_codigo))
        || txt(daCelula('empresa', origem.empresa))
      if (!pedido) {
        return {
          recusa: 'informe a Empresa (o código ou o nome): é ela que diz de que unidade '
            + 'a cidade é.',
        }
      }
      const empresas = unidade.data['empresa'] ?? []
      const k = pedido.toLowerCase()
      const achadas = empresas.filter(
        (e) => txt(e.emp_codigo).toLowerCase() === k || txt(e.empresa).toLowerCase() === k,
      )
      if (achadas.length > 1) {
        return { recusa: `"${pedido}" é o nome de mais de uma empresa — use o código.` }
      }
      if (!achadas.length) {
        return { recusa: `a empresa "${pedido}" não é desta unidade.` }
      }
      const extras: Row = {
        emp_codigo: txt(achadas[0].emp_codigo),
        empresa: txt(achadas[0].empresa),
      }
      return extras
    },
  },
  /**
   * O SISTEMA — o terceiro elo. A CIDADE é que o prende à unidade.
   *
   * A linha é o par sistema×cidade: acrescentar outra linha com o mesmo `sistema_id` e
   * outra cidade diz que ele também atende aquela, e o serviço ACRESCENTA em vez de
   * substituir.
   */
  'cidade-sistema': {
    exige: ['sistema_name'],
    resolve: (origem, unidade) => {
      const pedido = txt(daCelula('cidade_id', origem.cidade_id))
        || txt(daCelula('cidade_name', origem.cidade_name))
      if (!pedido) {
        return { recusa: 'informe a Cidade (o id ou o nome) que este sistema atende.' }
      }
      const cidade = resolverCidade(unidade.data, pedido)
      if (cidade === 'ambiguo') {
        return { recusa: `"${pedido}" é o nome de mais de uma cidade da unidade — use o id.` }
      }
      if (!cidade) {
        return { recusa: `a cidade "${pedido}" não é desta unidade.` }
      }
      const extras: Row = {
        cidade_id: txt(cidade.cidade_id),
        emp_codigo: txt(cidade.emp_codigo),
        empresa: txt(cidade.empresa),
      }
      return extras
    },
  },
  /**
   * AS TRÊS FICHAS DE COMPONENTE — sub-bacia, coletor e ETE.
   *
   * O serviço cria as três do mesmo jeito: a linha da entidade, a linha da TOPOLOGIA (sem
   * ela o componente não existe para o cadastro — não aparece no fluxo e não dá para
   * colocá-lo em sistema) e as obras com o vocabulário, vazias: 5 na sub-bacia, 4 no
   * coletor, nenhuma na ETE, cujo "componente de obra" é o módulo.
   *
   * O QUE CADA UMA EXIGE é o que a prende à unidade, porque na criação não há ficha para
   * consultar a posse. A sub-bacia e a ETE chegam pelo SISTEMA; o coletor, pela CIDADE —
   * ele nasce fora de sistema, como manda o conceito, e a cidade é o caminho que o
   * serviço usa quando não há sistema.
   *
   * O nome é exigido nas três: ficha sem nome aparece no fluxo e nas abas como linha em
   * branco, e o serviço recusa com 422 — que derrubaria o lote inteiro.
   */
  'subbacia-operacional': {
    exige: ['sub_bacia_name'],
    resolve: (origem, unidade) => resolveComSistema(origem, unidade, 'sub_bacia_name'),
  },
  'ete-capex': {
    exige: ['ete_name'],
    resolve: (origem, unidade) => resolveComSistema(origem, unidade, 'ete_name'),
  },
  'cts-operacional': {
    exige: ['cts_name'],
    resolve: (origem, unidade) => {
      //: a CIDADE, por id ou nome — é ela que diz de que unidade o coletor é
      const pedido = txt(daCelula('cidade_id', origem.cidade_id))
        || txt(daCelula('cidade_name', origem.cidade_name))
      if (!pedido) {
        return {
          recusa: 'informe a Cidade (o id ou o nome): o coletor nasce fora de sistema, e é '
            + 'a cidade que diz de que unidade ele é.',
        }
      }
      const cidade = resolverCidade(unidade.data, pedido)
      if (cidade === 'ambiguo') {
        return { recusa: `"${pedido}" é o nome de mais de uma cidade da unidade — use o id.` }
      }
      if (!cidade) {
        return { recusa: `a cidade "${pedido}" não é desta unidade.` }
      }
      const extras: Row = {
        cidade_id: txt(cidade.cidade_id),
        cidade_name: txt(cidade.cidade_name),
        emp_codigo: txt(cidade.emp_codigo),
        empresa: txt(cidade.empresa),
        //: nasce LIVRE: colocar num sistema é a aba do Fluxo ou a coluna Sistema daqui
        sistema_id: '',
        sistema_name: '',
      }
      return extras
    },
  },
  /**
   * O FLUXO: criar linha é COLOCAR UM COMPONENTE NUM SISTEMA.
   *
   * É o que o seletor "Adicionar CTS" da tela faz, e o que o servidor já sabia fazer
   * (`salvar_topologia` confere que o componente existe e aplica a regra de
   * macrorregião). O jusante fica em branco de propósito: o caminho até a ETE se
   * desenha na tela, onde há o unifilar ao lado para conferir.
   *
   * `exige: []` porque o que esta linha precisa não é uma célula preenchida, e sim um
   * sistema que EXISTA — quem diz isso é o `resolve`, com a mensagem certa para cada
   * jeito de errar.
   */
  'sistema-topologia': {
    exige: [],
    resolve: (origem, unidade) => {
      const id = txt(daCelula('componente_sistema_id', origem.componente_sistema_id))
      const componente = componenteConhecido(unidade.data, id)
      if (!componente) {
        return {
          recusa: `"${id}" não é uma sub-bacia, uma CTS nem uma ETE do cadastro — `
            + 'crie a ficha dela primeiro, na aba da entidade.',
        }
      }
      //: o id tem precedência sobre o nome; a coluna "Sistema" mostra o nome, e é por
      //: ela que quem preenche costuma informar
      const pedido = txt(daCelula('sistema_id', origem.sistema_id))
        || txt(daCelula('sistema_name', origem.sistema_name))
      if (!pedido) {
        return { recusa: 'informe o Sistema (o id ou o nome) para colocar o componente nele.' }
      }
      const sistema = resolverSistema(unidade.data, pedido)
      if (sistema === 'ambiguo') {
        return { recusa: `"${pedido}" é o nome de mais de um sistema — use o id (aba "${SISTEMAS}").` }
      }
      if (!sistema) {
        return { recusa: `o sistema "${pedido}" não é desta unidade — veja os ids na aba "${SISTEMAS}".` }
      }
      //: ANOTADO como `Row`: sem isso o TypeScript infere a união com `recusa?: undefined`,
      //: que briga com a assinatura de índice de `Row` (`[k: string]: string`).
      const extras: Row = {
        sistema_id: txt(sistema.sistema_id),
        sistema_name: txt(sistema.sistema_name),
        componente_sistema_nome: componente.nome,
        componente_tipo: componente.tipo,
        //: o caminho se desenha na tela, com o unifilar ao lado
        componente_sistema_id_jusante: '',
        componente_sistema_nome_jusante: '',
      }
      return extras
    },
  },
}

/**
 * COMO CADA ABA ENCONTRA A LINHA DA TELA.
 *
 *   'unica'  — a aba tem uma linha só (a unidade).
 *   'chave'  — uma linha por entidade, achada pelas colunas listadas.
 *   'lista'  — linhas que a unidade cria e apaga (metas, faixas): a planilha
 *              traz a lista inteira, e ela SUBSTITUI a da tela.
 */
type Estrategia =
  | { tipo: 'unica' }
  | { tipo: 'chave'; colunas: string[] }
  | { tipo: 'lista' }

const ESTRATEGIA: Record<string, Estrategia> = {
  'unidade-regional': { tipo: 'unica' },
  'empresa': { tipo: 'chave', colunas: ['emp_codigo'] },
  'cidade-operacional': { tipo: 'chave', colunas: ['cidade_id'] },
  /**
   * O SISTEMA casa pelo par SISTEMA×CIDADE, e não pelo sistema só.
   *
   * Um SES atende várias cidades (12 assim na base, um deles atravessando empresa), e
   * cada par é uma linha. Casar só por `sistema_id` faria a segunda cidade do mesmo
   * sistema sobrescrever a primeira.
   */
  'cidade-sistema': { tipo: 'chave', colunas: ['sistema_id', 'cidade_id'] },
  'metas-cobertura': { tipo: 'lista' },
  'fator-esgoto': { tipo: 'lista' },
  'ete-capex': { tipo: 'chave', colunas: ['ete_id'] },
  'sistema-topologia': { tipo: 'chave', colunas: ['componente_sistema_id'] },
  'subbacia-operacional': { tipo: 'chave', colunas: ['sub_bacia_id'] },
  'componentes-subbacias-capex': { tipo: 'chave', colunas: ['sub_bacia_id', 'componente'] },
  'cts-operacional': { tipo: 'chave', colunas: ['cts_id'] },
  'componentes-cts-capex': { tipo: 'chave', colunas: ['cts_id', 'componente'] },
}

const ABAS_DE_CTS = new Set(['cts-operacional', 'componentes-cts-capex'])

/** A primeira linha de dado do arquivo — as duas de cima são o cabeçalho. */
export const PRIMEIRA_LINHA_DE_DADO = 3

const txt = (v: unknown): string => String(v ?? '').trim()
/** A chave composta de uma linha, para casar obra por ficha + componente. */
const SEPARADOR = ' || '
const chaveDe = (linha: Record<string, unknown>, colunas: string[]): string =>
  colunas.map((c) => txt(daCelula(c, linha[c]))).join(SEPARADOR)

/** A célula da caixa aceita o que uma pessoa escreve para dizer sim ou não. */
export function simOuNao(valor: unknown): 'Sim' | 'Nao' | null {
  const v = daCelula('', valor).toLowerCase()
  if (['sim', 's', 'true', 'x', '1', 'verdadeiro'].includes(v)) return 'Sim'
  if (['nao', 'não', 'n', 'false', '0', 'falso', ''].includes(v)) return 'Nao'
  return null
}

/**
 * O VOCABULÁRIO DAS CAIXAS: `nova` (ETE) guarda 'Sim'/'Não' — com acento, como o
 * select da grade — e quem escreve "sim" na planilha não pode cair fora dele.
 */
function normalizar(col: string, valor: string): string {
  if (col !== 'nova' || !valor) return valor
  const v = simOuNao(valor)
  return v === 'Sim' ? 'Sim' : v === 'Nao' ? 'Não' : valor
}

/** Um aviso com o endereço: aba e linha do arquivo. */
const aviso = (planilha: PlanilhaDaAba, linhaDoArquivo: number, avisos: string[]) => (texto: string) =>
  avisos.push(`${planilha.nome}, linha ${linhaDoArquivo}: ${texto}`)

const linhaVazia = (linha: Record<string, unknown>): boolean =>
  Object.values(linha).every((v) => daCelula('', v) === '')

const abaDoSchema = (key: string): AbaDef => SCHEMA.find((a) => a.key === key)!

/**
 * MESCLA a planilha lida no cadastro da tela.
 *
 * Devolve só as abas que mudaram, com linhas NOVAS onde algo mudou — o estado
 * do wizard é imutável, e reaproveitar a linha da tela faria o diff do Salvar
 * não enxergar a mudança. Nada aqui grava: quem chama mostra os avisos, a
 * pessoa revê a grade e clica em Salvar.
 */
export function mesclarPlanilha(
  unidade: { id: string; data: Dados },
  lida: PlanilhaLida,
): ResultadoDaMescla {
  const atual = unidade.data
  const dados: Dados = {}
  const avisos: string[] = []
  let alteracoes = 0
  let linhasLidas = 0

  const porNome = new Map(Object.entries(lida).map(([nome, aba]) => [nome.trim().toLowerCase(), aba]))
  const planilhas = naOrdemDaCorrente(planilhasDoCadastro(atual))
  //: uma vez, e descendo para as tres estrategias — ver `contextoDeGravacao`
  const ctx = contextoDeGravacao(atual)
  //: somado pelas tres estrategias — ver `ResultadoDaMescla.naoVoltaram`
  const contagem = { naoVoltaram: 0 }
  //: as colocações que a aba do Fluxo pediu, para a ficha da CTS receber o sistema
  const colocacoes: { componente: string; sistemaId: string; sistemaNome: string }[] = []

  // DE QUE UNIDADE É O ARQUIVO — antes de qualquer linha. Ver o cabeçalho.
  const abaUnidade = porNome.get(nomeDaPlanilha(abaDoSchema('unidade-regional')).toLowerCase())
  const idDoArquivo = txt(daCelula('unidade_id', abaUnidade?.linhas[0]?.unidade_id))
  if (!abaUnidade || !idDoArquivo) {
    return {
      dados, alteracoes, linhasLidas, naoVoltaram: 0,
      avisos: ['O arquivo não tem a aba "Unidade" com o id da unidade — não dá para saber de que unidade ele é. Baixe a planilha daqui e preencha-a sem apagar abas.'],
    }
  }
  if (idDoArquivo.toLowerCase() !== unidade.id.trim().toLowerCase()) {
    return {
      dados, alteracoes, linhasLidas, naoVoltaram: 0,
      avisos: [`Esta planilha é da unidade ${idDoArquivo}, e a tela está em ${unidade.id}. Nada foi importado.`],
    }
  }

  // O REGIME EM QUE O ARQUIVO NASCEU. Diferente do da tela, as fichas de CTS
  // dele são outras (a soma da macrorregião, ou cada coletor): as abas de CTS
  // ficam de fora, e o resto entra.
  const primeira = abaUnidade.linhas[0] ?? {}
  const regimeDoArquivo = 'usa_macrorregiao_cts' in primeira ? simOuNao(primeira.usa_macrorregiao_cts) : null
  const regimeDaTela = regimeDeCts(atual).macro ? 'Sim' : 'Nao'
  const regimeDiverge = regimeDoArquivo !== null && regimeDoArquivo !== regimeDaTela
  if (regimeDiverge) {
    avisos.push(
      `A planilha foi gerada com a macrorregião de CTS ${regimeDoArquivo === 'Sim' ? 'marcada' : 'desmarcada'}, e a tela está ${regimeDaTela === 'Sim' ? 'marcada' : 'desmarcada'}: as fichas de CTS são outras. As abas "Dados da CTS" e "CAPEX da CTS" ficaram de fora — acerte a caixa na tela e baixe a planilha de novo.`,
    )
  }

  const reconhecidas = new Set<string>()
  for (const planilha of planilhas) {
    const nome = planilha.nome.trim().toLowerCase()
    const aba = porNome.get(nome)
    if (!aba) continue
    reconhecidas.add(nome)
    if (regimeDiverge && ABAS_DE_CTS.has(planilha.aba.key)) continue
    linhasLidas += aba.linhas.length

    const estrategia = ESTRATEGIA[planilha.aba.key] ?? { tipo: 'chave', colunas: [] }
    const resultado =
      estrategia.tipo === 'lista'
        ? mesclarLista(planilha, atual, aba, avisos, ctx)
        : estrategia.tipo === 'unica'
          ? mesclarUnica(planilha, aba, avisos, ctx, contagem)
          : mesclarPorChave(planilha, aba, estrategia.colunas, avisos, ctx, contagem, unidade, dados, colocacoes)
    if (resultado) {
      dados[planilha.aba.key] = resultado.linhas
      alteracoes += resultado.alteracoes
    }
  }

  /**
   * A OUTRA PONTA DO QUE O FLUXO COLOCOU — a ficha da CTS recebe o sistema.
   *
   * A aba do Fluxo decide (é lá que a coluna Sistema está à vista) e anota; aqui o
   * sistema desce para a ficha, que é de onde a tela lê "em que sistema esta CTS está".
   * Sem isto a planilha deixava as duas metades em desacordo, e o dono do produto
   * apontou: *"ao adicionar a cts no sistema temos que automaticamente preencher a
   * coluna de sistema da cts"*.
   */
  if (colocacoes.length) {
    const fichas = [...(dados['cts-operacional'] ?? atual['cts-operacional'] ?? [])]
    let mexeu = false
    for (const { componente, sistemaId, sistemaNome } of colocacoes) {
      const i = fichas.findIndex((l) => txt(l.cts_id) === componente)
      if (i < 0) continue // não é CTS: sub-bacia e ETE não têm ficha com sistema
      if (txt(fichas[i].sistema_id) === sistemaId) continue
      fichas[i] = { ...fichas[i], sistema_id: sistemaId, sistema_name: sistemaNome }
      mexeu = true
    }
    if (mexeu) dados['cts-operacional'] = fichas
  }

  // A CTS ENTRA NO SISTEMA por último: a ficha dela já foi mesclada acima, e a
  // colocação escreve em DUAS abas — a da CTS e a do Fluxo.
  const abaCts = porNome.get(nomeDaPlanilha(abaDoSchema('cts-operacional')).toLowerCase())
  if (abaCts && !regimeDiverge) {
    const colocadas = colocarCtsNoSistema(
      planilhas.find((p) => p.aba.key === 'cts-operacional')!,
      { ...atual, ...dados },
      abaCts,
      avisos,
      //: quem o FLUXO acabou de colocar não se julga aqui — ver o parâmetro
      new Set(colocacoes.map((c) => c.componente)),
    )
    if (colocadas) {
      Object.assign(dados, colocadas.dados)
      alteracoes += colocadas.alteracoes
    }
  }

  for (const nome of Object.keys(lida)) {
    const n = nome.trim().toLowerCase()
    if (!reconhecidas.has(n) && ![...ABAS_DE_APOIO].some((a) => a.toLowerCase() === n)) {
      avisos.push(`A aba "${nome}" não é uma aba do cadastro e foi ignorada.`)
    }
  }

  return { dados, alteracoes, linhasLidas, avisos, naoVoltaram: contagem.naoVoltaram }
}

interface Mesclado {
  linhas: Row[]
  alteracoes: number
}

/** Aplica as colunas importáveis de `origem` sobre `linha`. Devolve a linha nova ou null se nada mudou. */
/**
 * CÉLULA MUDADA NUMA COLUNA QUE NÃO VOLTA: conta, para avisar depois.
 *
 * A planilha traz as colunas de leitura junto — é o que dá contexto a quem
 * preenche. Mas quem edita uma delas não recebia NADA: `aplicar` só percorria as
 * importáveis, então a mudança não era rejeitada, era invisível. Para quem fez, é
 * indistinguível de um defeito — e foi exatamente o relato do tester em
 * 30/09/2026 ("atualizo um dado de uma coluna que já vem preenchida no download e
 * ao subir não é salva").
 *
 * A contagem é por COLUNA, e não por linha: uma unidade tem centenas de
 * sub-bacias, e um aviso por linha afogaria a lista que a pessoa precisa ler.
 */
function contarIgnorada(
  ignoradas: Map<string, number>,
  linha: Row,
  origem: Record<string, unknown>,
  importaveis: Set<string>,
  /** A aba, para a isenção da porta do sistema valer só onde ela existe. */
  abaKey: string,
): void {
  const porta = PORTA_DO_SISTEMA[abaKey] ?? []
  for (const col of Object.keys(origem)) {
    //: DUAS FAMÍLIAS DE COLUNA FICAM FORA, e as duas porque já têm resposta melhor:
    //:
    //: - a que COLOCA NO SISTEMA entra por caminho próprio (`colocarCtsNoSistema`) e não
    //:   está em `importaveis` — avisar que ela "não volta" seria falso;
    //: - a da CAIXA DA MACRORREGIÃO (`SO_NA_TELA`) já tem aviso dedicado, que diz em que
    //:   regime o arquivo nasceu e o que fazer. Um aviso genérico ao lado dele é ruído.
    //:
    //: Aviso falso ou repetido gasta a atenção que os verdadeiros precisam.
    // A ISENÇÃO É POR ABA, e isso importa: `COLOCA_NO_SISTEMA_TODAS` tirava `sistema_id`
    // do aviso em TODA aba, e a porta legítima é só a da CTS (e, desde 01/10, a do Fluxo).
    // Mudar o `ID Sistema` de uma ETE era ignorado sem aviso e sem contar em
    // `naoVoltaram` — perda silenciosa, que é o defeito que esta mudança existe para
    // tirar. Pego pela revisão final do Codex, depois de eu ter cometido o mesmo excesso
    // com `sistema_name` e consertado só aquele.
    if (SO_NA_TELA.has(col) || porta.includes(col)) continue
    if (importaveis.has(col) || semResultado(origem[col])) continue
    const valor = daCelula(col, origem[col])
    //: vazio na planilha não é edição: a coluna pode simplesmente não ter vindo.
    if (!valor || (linha[col] ?? '') === valor) continue
    ignoradas.set(col, (ignoradas.get(col) ?? 0) + 1)
  }
}

/**
 * Os avisos das colunas que não voltam, um por coluna.
 *
 * O FIM DA FRASE DIZ O QUE FAZER, e por isso não é um texto só. "Use a tela" é a saída
 * certa para a coluna derivada — a tela tem a conta ao lado, e a pessoa vê de onde o número
 * sai. Mas é FALSO para a medida da base de uma CTS somada: ali a tela também trava, porque
 * o servidor refaz a soma a cada gravação. Mandar a pessoa para a tela nesse caso seria
 * mandá-la ao único lugar onde a mudança também não acontece — o defeito que esta
 * sequência de mudanças existe para tirar do produto, reintroduzido pelo texto.
 */
function avisarIgnoradas(
  planilha: PlanilhaDaAba,
  ignoradas: Map<string, number>,
  avisos: string[],
  ctx: ContextoDeGravacao,
  contagem: { naoVoltaram: number },
): void {
  for (const n of ignoradas.values()) contagem.naoVoltaram += n
  const somadaNaMacro = planilha.aba.key === 'cts-operacional' && !!ctx.ctsSomada
  for (const [col, n] of [...ignoradas].sort((a, b) => b[1] - a[1])) {
    //: a coluna que SÓ a macrorregião tira: gravável no contrato, barrada por este contexto
    const barradaPelaSoma = somadaNaMacro
      && !colunaGravavel(planilha.aba.key, col, ctx)
      && colunaGravavel(planilha.aba.key, col, {})
    /**
     * CADA FAMÍLIA TEM UMA SAÍDA DIFERENTE, e por isso não há uma frase só.
     *
     * A frase era sempre "para mudá-la, use a tela", e para a maioria delas isso é FALSO:
     * o nome da empresa é `db` e a tela também não o muda. O dono do produto trocou
     * "Empresa 1 Interior1" por "Interior10" na planilha, subiu, e o aviso o mandou ao
     * único lugar onde também não dá — em 01/10/2026, depois de a mesma frase já ter
     * mentido no caso da CTS somada.
     *
     * São cinco saídas diferentes, e cada uma manda a pessoa a um lugar que funciona: a
     * CTS somada se corrige no coletor; a conta do servidor, nas colunas de que ela
     * deriva; a `calc`, em nenhum lugar — o motor a refaz; o id se escolhe na tela; e o
     * que vem da carga e o cadastro não grava se corrige na origem.
     */
    const origem = planilha.aba.cols.find((c) => c.coluna === col)?.origem
    const oQueFazer = barradaPelaSoma
      ? 'Esta unidade usa macrorregião de CTS, e esta ficha é a SOMA dos coletores: o ' +
        'servidor refaz a soma a cada gravação. Corrija o dado no coletor, na origem.'
      : colunaCalculadaNoServidor(col)
        ? 'Ela é uma conta que o servidor faz a partir das outras colunas desta linha — ' +
          'para mudá-la, corrija as colunas de que ela deriva.'
        : origem === 'calc'
          ? 'Ela é calculada pelo motor, que recalcula e ignora o valor gravado.'
          : col.endsWith('_id')
            ? 'Id não muda pela planilha: ele é o vínculo da linha, e se escolhe na tela, ' +
              'onde há a regra para conferir.'
            : 'O cadastro não grava esta coluna — ela vem da carga, e nem a planilha nem a ' +
              'tela a alteram. Para mudá-la, corrija na origem.'
    avisos.push(
      `${planilha.nome}: a coluna "${colunaLabel(col)}" não volta pela planilha — ` +
        `${n} ${n === 1 ? 'linha diferente foi ignorada' : 'linhas diferentes foram ignoradas'}. ` +
        oQueFazer,
    )
  }
}

/** Os avisos do que a planilha APAGOU, um por coluna — ver o comentário em `aplicar`. */
function avisarApagadas(
  planilha: PlanilhaDaAba,
  apagadas: Map<string, number>,
  avisos: string[],
): void {
  for (const [col, n] of [...apagadas].sort((a, b) => b[1] - a[1])) {
    avisos.push(
      `${planilha.nome}: a coluna "${colunaLabel(col)}" ficou VAZIA em ` +
        `${n} ${n === 1 ? 'linha que tinha valor' : 'linhas que tinham valor'} — ` +
        `célula em branco na planilha apaga o valor. Se não era a intenção, não salve: ` +
        `recarregue a unidade e importe o arquivo com a coluna preenchida.`,
    )
  }
}

/**
 * COLUNAS QUE A PLANILHA ATUALIZA MAS NÃO APAGA — ver o comentário em `aplicar`.
 *
 * Os quatro nomes que viraram graváveis em 01/10/2026. O serviço recusa nome vazio com
 * 422 (`nome_de_ficha`), e a recusa derrubaria o lote inteiro — o salvamento é
 * tudo-ou-nada —, então a planilha barra antes e diz o que aconteceu.
 *
 * DERIVADO DA CONVENÇÃO, e não escrito à mão: `*_name` é o sufixo de nome em todo o
 * modelo, e `empresa` é a exceção histórica (a coluna nasceu antes da convenção). Uma
 * lista declarada esqueceria o nome da próxima ficha.
 */
const naoSeApaga = (col: string): boolean => col.endsWith('_name') || col === 'empresa'

function aplicar(
  linha: Row,
  origem: Record<string, unknown>,
  colunas: string[],
  avisar: (texto: string) => void,
  abaKey: string,
  ignoradas?: Map<string, number>,
  apagadas?: Map<string, number>,
): { linha: Row; alteracoes: number } | null {
  let alteracoes = 0
  const nova: Row = { ...linha }
  if (ignoradas) contarIgnorada(ignoradas, linha, origem, new Set(colunas), abaKey)
  for (const col of colunas) {
    if (!(col in origem)) continue // coluna que a planilha não trouxe: fica como está
    if (semResultado(origem[col])) {
      avisar(`"${colunaLabel(col)}" tem uma fórmula sem resultado calculado — a célula ficou como estava.`)
      continue
    }
    const valor = normalizar(col, daCelula(col, origem[col]))
    if ((linha[col] ?? '') === valor) continue
    /**
     * NOME NÃO SE APAGA. "Célula em branco apaga o valor" vale para número: tirar um
     * preço que não deveria existir é uma correção legítima. Para o NOME não há leitura
     * equivalente — a empresa aparece em cinco abas, e sem nome a linha fica
     * inidentificável em todas —, e o servidor recusa com 422, o que derrubaria o lote
     * inteiro por causa de uma célula limpa sem intenção. Então a planilha a barra antes,
     * e diz o que aconteceu.
     */
    if (naoSeApaga(col) && !valor && (linha[col] ?? '')) {
      avisar(`"${colunaLabel(col)}" não pode ficar em branco — é o nome que identifica a linha. A célula ficou como estava.`)
      continue
    }
    //: APAGAR CONTINUA VALENDO, E PASSOU A APARECER. "Célula em branco apaga o valor" é o
    //: contrato do arquivo desde sempre (Leia-me, item 5), e é o que permite corrigir um
    //: número que não deveria existir. O que mudou em 01/10 é o ALCANCE: as medidas da base
    //: comercial entraram, e apagá-las em massa — uma coluna arrastada, um filtro mal
    //: aplicado — não é mais um erro pequeno. Então o apagamento é CONTADO e dito antes de
    //: salvar, no mesmo lugar em que a pessoa revê o resto. Não é recusa: é a chance de
    //: olhar.
    if (apagadas && valor === '' && (linha[col] ?? '') !== '') {
      apagadas.set(col, (apagadas.get(col) ?? 0) + 1)
    }
    nova[col] = valor
    alteracoes++
  }
  if (!alteracoes) return null
  /**
   * A DERIVADA ACOMPANHA O QUE MUDOU. Mexer em `universo_ligacoes` pela planilha deixava
   * `ligacoes_novas_obras` com o número antigo na linha — a tela mostrava a conta certa
   * (ela recalcula ao exibir) e o `PUT` mandava o valor velho. Enquanto as duas entradas
   * eram travadas isso não tinha como acontecer; desde que passaram a voltar pela planilha,
   * tem. O recálculo NÃO conta como alteração: `alteracoes` é o que a pessoa mudou.
   */
  return { linha: recalcularDerivadasDaColeta(nova) ?? nova, alteracoes }
}

function mesclarUnica(planilha: PlanilhaDaAba, aba: AbaLida, avisos: string[], ctx: ContextoDeGravacao, contagem: { naoVoltaram: number }): Mesclado | null {
  const linha = planilha.linhas[0]
  const origem = aba.linhas[0]
  if (!linha || !origem) return null
  const naoVoltam = new Map<string, number>()
  const apagadas = new Map<string, number>()
  const r = aplicar(linha, origem, colunasImportaveis(planilha.aba, ctx),
                    aviso(planilha, PRIMEIRA_LINHA_DE_DADO, avisos), planilha.aba.key,
                    naoVoltam, apagadas)
  avisarIgnoradas(planilha, naoVoltam, avisos, ctx, contagem)
  avisarApagadas(planilha, apagadas, avisos)
  if (!r) return null
  return { linhas: [r.linha, ...planilha.linhas.slice(1)], alteracoes: r.alteracoes }
}

function mesclarPorChave(
  planilha: PlanilhaDaAba,
  aba: AbaLida,
  chave: string[],
  avisos: string[],
  ctx: ContextoDeGravacao,
  contagem: { naoVoltaram: number },
  unidade: { id: string; data: Dados },
  /** O que as abas já mescladas mudaram — o Fluxo precisa delas para achar o sistema. */
  dados: Dados,
  /** Onde as colocações pedidas pelo Fluxo são anotadas, para a ficha da CTS receber. */
  colocacoes: { componente: string; sistemaId: string; sistemaNome: string }[],
): Mesclado | null {
  const atual = unidade.data
  const macro = regimeDeCts(atual).macro
  const colunas = colunasImportaveis(planilha.aba, ctx)
  if (!colunas.length || !chave.length) return null // aba só de leitura: nada a trazer

  const indice = new Map<string, number>()
  planilha.linhas.forEach((l, i) => {
    const k = chave.map((c) => txt(l[c])).join(SEPARADOR)
    if (!indice.has(k)) indice.set(k, i)
  })

  const linhas = [...planilha.linhas]
  const criacao = CRIAVEL_POR_ABA[planilha.aba.key]
  let alteracoes = 0
  let criadas = 0
  let ignoradas = 0
  //: as colunas que a planilha traz e NÃO leva de volta, contadas por coluna
  const naoVoltam = new Map<string, number>()
  //: e as que ela APAGOU — valor que existia e voltou vazio
  const apagadas = new Map<string, number>()
  const ehFluxo = planilha.aba.key === 'sistema-topologia'
  const nomeDoComponente = ehFluxo
    ? new Map(planilha.linhas.map((l) => [txt(l.componente_sistema_id), txt(l.componente_sistema_nome)]))
    : null

  //: O MESMO COMPONENTE DUAS VEZES NO ARQUIVO. Um componente tem UMA linha na
  //: topologia, então duas linhas pedindo sistemas diferentes é contradição — e, sem
  //: isto, a última calada venceria. Pedido do dono do produto: "algum mecanismo que
  //: impeça de adicionar uma mesma cts em mais de um sistema".
  const vistas = new Set<string>()
  aba.linhas.forEach((origem, n) => {
    if (linhaVazia(origem)) return
    const linhaDoArquivo = n + PRIMEIRA_LINHA_DE_DADO
    const k = chaveDe(origem, chave)
    if (k && vistas.has(k)) {
      avisos.push(`${planilha.nome}, linha ${linhaDoArquivo}: "${k}" aparece mais de uma vez nesta aba — só a primeira valeu.`)
      return
    }
    if (k) vistas.add(k)
    const i = indice.get(k)
    if (i === undefined) {
      const id = chave.map((c) => daCelula(c, origem[c]) || '(vazio)').join(' · ')
      /**
       * ID QUE O CADASTRO NÃO CONHECE: antes era sempre "ignorada". Agora, nas abas
       * que criam (`CRIAVEL_POR_ABA`), é uma linha NOVA.
       *
       * Nada é gravado aqui: a mescla põe a linha no estado da tela, a pessoa a vê na
       * grade e clica em Salvar. É o que torna a criação revisável — e é o que protege
       * do caso ruim, que é um id digitado errado virar registro novo em silêncio. O
       * aviso diz, em letras, que vai criar.
       */
      if (!criacao) {
        ignoradas++
        if (ignoradas <= 5) {
          avisos.push(`${planilha.nome}, linha ${linhaDoArquivo}: "${id}" não existe no cadastro — ignorada.`)
        }
        return
      }
      const semChave = chave.filter((c) => !txt(daCelula(c, origem[c])))
      if (semChave.length) {
        avisos.push(`${planilha.nome}, linha ${linhaDoArquivo}: sem ${semChave.map(colunaLabel).join(' e ')} não dá para criar a linha — ignorada.`)
        return
      }
      const faltando = criacao.exige.filter((c) => !txt(daCelula(c, origem[c])))
      if (faltando.length) {
        avisos.push(`${planilha.nome}, linha ${linhaDoArquivo}: "${id}" é uma linha NOVA e ${faltando.map(colunaLabel).join(' e ')} ${faltando.length === 1 ? 'está' : 'estão'} em branco — preencha para criá-la. Ignorada.`)
        return
      }
      /**
       * O `resolve` VÊ O QUE A MESCLA JÁ CRIOU — e não só o estado original.
       *
       * Ele lia `unidade.data`, então a cidade criada três linhas acima não existia para
       * criar o sistema, e o sistema não existia para criar a sub-bacia. Na prática a
       * pessoa teria de importar, salvar, recarregar e importar de novo, uma vez por
       * nível da corrente — o oposto de "preencher a planilha e subir tudo".
       *
       * `{...atual, ...dados}` é a visão de agora: as abas que esta mescla mudou por cima
       * das que a tela tinha. É a mesma visão que o Fluxo usa para achar o sistema.
       */
      const resolvido = criacao.resolve?.(origem, { id: unidade.id, data: { ...atual, ...dados } })
      if (resolvido && 'recusa' in resolvido) {
        avisos.push(`${planilha.nome}, linha ${linhaDoArquivo}: "${id}" é uma linha NOVA e ${resolvido.recusa}`)
        return
      }
      const nova: Row = { ...(criacao.herda?.(unidade) ?? {}), ...(resolvido ?? {}) }
      for (const c of chave) nova[c] = txt(daCelula(c, origem[c]))
      for (const c of colunas) {
        if (c in origem) nova[c] = normalizar(c, daCelula(c, origem[c]))
      }
      linhas.push(nova)
      indice.set(k, linhas.length - 1)
      criadas++
      alteracoes++
      avisos.push(`${planilha.nome}, linha ${linhaDoArquivo}: "${id}" não existe no cadastro e será CRIADA ao salvar.`)
      return
    }
    const entrada = { ...origem }

    if (ehFluxo && nomeDoComponente) {
      /**
       * A SEGUNDA PORTA DE COLOCAÇÃO — a coluna "Sistema" desta aba.
       *
       * A primeira é a aba "Dados da CTS" (`colocarCtsNoSistema`). Esta existe porque é
       * aqui que a coluna Sistema está à vista, e foi aqui que o dono do produto
       * escreveu: *"adicionei uma cts no fluxo de escoamento"*. A linha já existia — uma
       * CTS fora de sistema vem da carga com o sistema em branco —, então não era caso
       * de criar: era de preencher.
       *
       * MUDAR de sistema continua sendo pela tela: trocar desfaz um caminho já desenhado,
       * e lá há o unifilar ao lado para conferir o que se desfez.
       */
      const pedido = txt(daCelula('sistema_id', entrada.sistema_id))
        || txt(daCelula('sistema_name', entrada.sistema_name))
      const sisAtual = txt(linhas[i].sistema_id)
      const jaEstaNele = !!pedido && (
        pedido.toLowerCase() === sisAtual.toLowerCase()
        || pedido.toLowerCase() === txt(linhas[i].sistema_name).toLowerCase()
      )
      if (pedido && !jaEstaNele) {
        if (sisAtual) {
          //: NOMEIA o sistema de origem e diz onde se muda. A frase anterior era "mudar
          //: de sistema é pela tela, no Fluxo de escoamento" — e quem lia estava na aba
          //: Fluxo da planilha, então ela apontava para onde a pessoa já estava.
          const nomeAtual = txt(linhas[i].sistema_name)
          avisos.push(
            `${planilha.nome}, linha ${linhaDoArquivo}: "${k}" já está no sistema `
            + `${nomeAtual ? `${nomeAtual} (${sisAtual})` : sisAtual}, e um componente só `
            + 'fica num sistema. Tirá-lo ou movê-lo é no Cadastro, na aba "Fluxo de '
            + 'escoamento" da TELA, onde o desenho ao lado mostra o que o caminho perde.',
          )
          return
        }
        const sistema = resolverSistema({ ...atual, ...dados }, pedido)
        if (sistema === 'ambiguo') {
          avisos.push(`${planilha.nome}, linha ${linhaDoArquivo}: "${pedido}" é o nome de mais de um sistema — use o id (aba "${SISTEMAS}").`)
          return
        }
        if (!sistema) {
          avisos.push(`${planilha.nome}, linha ${linhaDoArquivo}: o sistema "${pedido}" não é desta unidade — veja os ids na aba "${SISTEMAS}".`)
          return
        }
        const sis = txt(sistema.sistema_id)
        // A MACRORREGIÃO VALE NAS DUAS PORTAS: marcada, um sistema aceita UMA CTS.
        // Contando as desta mesma planilha, para duas linhas não entrarem no mesmo
        // sistema quando só uma cabe.
        if (macro && ehCts({ ...atual, ...dados }, linhas[i]) && ctsPorSistema(linhas, sis, { ...atual, ...dados })) {
          avisos.push(`${planilha.nome}, linha ${linhaDoArquivo}: o sistema ${txt(sistema.sistema_name) || sis} já tem uma CTS, e a unidade usa macrorregião: cada sistema aceita uma só.`)
          return
        }
        linhas[i] = { ...linhas[i], sistema_id: sis, sistema_name: txt(sistema.sistema_name) }
        alteracoes++
        /**
         * AS DUAS PONTAS. A ficha da CTS também guarda o sistema — é dela que a tela lê
         * "em que sistema esta CTS está", e é a coluna que o seletor do Fluxo preenche
         * quando se coloca pela tela (`colocarCtsNoSistema` escreve nas duas abas).
         *
         * Escrever a outra aba daqui não dá: esta função mescla UMA. Então o pedido é
         * anotado e aplicado depois, em `mesclarPlanilha` — ver `colocacoes`.
         */
        colocacoes.push({ componente: k, sistemaId: sis, sistemaNome: txt(sistema.sistema_name) })
      }

      // O DESTINO SÓ SE MUDA DE QUEM JÁ ESTÁ NUM SISTEMA, e tem de ser um trecho
      // que existe. Desenhar o caminho de quem acabou de entrar é pela tela, onde
      // há o fluxo para conferir.
      const destino = txt(daCelula('componente_sistema_id_jusante', entrada.componente_sistema_id_jusante))
      const mudou = destino !== txt(linhas[i].componente_sistema_id_jusante)
      if (mudou && !txt(linhas[i].sistema_id)) {
        avisos.push(`${planilha.nome}, linha ${linhaDoArquivo}: "${k}" está fora de sistema — informe o Sistema nesta linha (ou use a aba "Dados da CTS") e desenhe o caminho na tela.`)
        return
      }
      if (mudou && destino && !nomeDoComponente.has(destino)) {
        avisos.push(`${planilha.nome}, linha ${linhaDoArquivo}: o destino "${destino}" não existe no cadastro — ignorado.`)
        return
      }
      if (mudou) entrada.componente_sistema_nome_jusante = nomeDoComponente.get(destino) ?? ''
    }

    const r = aplicar(
      linhas[i], entrada,
      ehFluxo ? [...colunas, 'componente_sistema_nome_jusante'] : colunas,
      aviso(planilha, linhaDoArquivo, avisos),
      planilha.aba.key,
      naoVoltam,
      apagadas,
    )
    if (!r) return
    linhas[i] = r.linha
    alteracoes += r.alteracoes
  })
  if (ignoradas > 5) avisos.push(`${planilha.nome}: mais ${ignoradas - 5} linha(s) com id desconhecido foram ignoradas.`)
  avisarIgnoradas(planilha, naoVoltam, avisos, ctx, contagem)
  avisarApagadas(planilha, apagadas, avisos)

  return alteracoes ? { linhas, alteracoes } : null
}

/**
 * METAS E FAIXAS: a planilha traz a lista inteira, e ela vale.
 *
 * São as abas de "Adicionar linha" — a unidade cria e apaga linhas, e não há
 * id para casar. Então a lista do arquivo substitui a da tela: linha que não
 * voltou foi apagada, linha nova foi criada. Cada linha precisa de uma cidade
 * que a unidade tenha; a empresa e o nome vêm da cidade, não da planilha.
 */
function mesclarLista(planilha: PlanilhaDaAba, atual: Dados, aba: AbaLida, avisos: string[], ctx: ContextoDeGravacao): Mesclado | null {
  const cidades = new Map(
    (atual['cidade-operacional'] ?? []).map((c) => [txt(c.cidade_id), c]),
  )
  const colunas = colunasImportaveis(planilha.aba, ctx)

  // FÓRMULA SEM RESULTADO NUMA LISTA: não há linha anterior a preservar — a
  // lista do arquivo substitui a da tela inteira —, e gravar vazio apagaria um
  // valor que existia. A aba inteira fica de fora, e o aviso diz onde.
  const semCalculo = aba.linhas.findIndex((l) => !linhaVazia(l) && colunas.some((c) => semResultado(l[c])))
  if (semCalculo >= 0) {
    const col = colunas.find((c) => semResultado(aba.linhas[semCalculo][c]))!
    avisos.push(
      `${planilha.nome}, linha ${semCalculo + PRIMEIRA_LINHA_DE_DADO}: "${colunaLabel(col)}" tem uma fórmula sem resultado calculado — a aba inteira ficou de fora. Salve o arquivo calculado e importe de novo.`,
    )
    return null
  }

  const linhas: Row[] = []
  aba.linhas.forEach((origem, n) => {
    if (linhaVazia(origem)) return
    const linhaDoArquivo = n + PRIMEIRA_LINHA_DE_DADO
    const cid = txt(daCelula('cidade_id', origem.cidade_id))
    const cidade = cidades.get(cid)
    if (!cidade) {
      avisos.push(`${planilha.nome}, linha ${linhaDoArquivo}: a cidade "${cid || '(vazio)'}" não é desta unidade — ignorada.`)
      return
    }
    // A LINHA-MODELO que o arquivo trouxe e ninguém preencheu: só a cidade, o
    // resto em branco. Não é registro — ver `linhasNoArquivo`.
    if (colunas.every((col) => daCelula(col, origem[col]) === '')) return
    const linha: Row = {
      emp_codigo: cidade.emp_codigo ?? '',
      empresa: cidade.empresa ?? '',
      cidade_id: cid,
      cidade_name: cidade.cidade_name ?? '',
    }
    for (const col of colunas) linha[col] = normalizar(col, daCelula(col, origem[col]))
    linhas.push(linha)
  })

  const igual =
    linhas.length === planilha.linhas.length &&
    linhas.every((l, i) => Object.keys({ ...l, ...planilha.linhas[i] }).every((k) => (l[k] ?? '') === (planilha.linhas[i][k] ?? '')))
  if (igual) return null
  return { linhas, alteracoes: Math.max(linhas.length, planilha.linhas.length) }
}

/**
 * A CTS LIVRE ENTRA NUM SISTEMA — a coluna `sistema_id` da aba "Dados da CTS".
 *
 * É o que o seletor "Adicionar CTS" do Fluxo faz na tela: escreve `sistema_id`
 * na linha da CTS na topologia e deixa o jusante em branco, para o caminho ser
 * desenhado depois. Aqui é o mesmo, para as CTS cujo sistema ainda está em
 * branco. Aceita o id ou o nome de um sistema da unidade (a aba `Sistemas` do
 * arquivo lista os dois). Marcada a macrorregião, um sistema que já tem CTS —
 * na tela ou nesta mesma planilha — não recebe outra.
 *
 * MUDAR OU SAIR é pela tela: trocar de sistema desfaz um caminho já desenhado,
 * e sair de um sistema pode deixar quem escoava para a CTS sem destino. As duas
 * têm o fluxo desenhado ao lado para se conferir; a planilha não tem.
 */
/**
 * O SISTEMA PEDIDO, por id ou por NOME — o que a pessoa escreve na célula.
 *
 * Extraído de `colocarCtsNoSistema` quando a aba do Fluxo passou a criar linha
 * (01/10/2026): os dois caminhos resolvem a mesma coisa, e duas cópias divergiriam.
 *
 * O nome é aceito porque é o que está à mão: a coluna "Sistema" do arquivo mostra o
 * nome, e a aba de apoio `Sistemas` lista id e nome lado a lado. Nome repetido entre
 * sistemas devolve `'ambiguo'`, e aí só o id serve — adivinhar colocaria o componente
 * no sistema errado, que é o tipo de erro que não aparece.
 */
export function resolverSistema(dados: Dados, texto: string): Row | null | 'ambiguo' {
  const sistemas = dados['cidade-sistema'] ?? []
  const k = texto.trim().toLowerCase()
  if (!k) return null
  const porId = sistemas.find((s) => txt(s.sistema_id).toLowerCase() === k)
  if (porId) return porId
  const porNome = sistemas.filter((s) => txt(s.sistema_name).toLowerCase() === k)
  return porNome.length === 1 ? porNome[0] : porNome.length > 1 ? 'ambiguo' : null
}

/** O componente existe no cadastro? Devolve a ficha e o tipo, para a linha nova. */
function componenteConhecido(
  dados: Dados,
  id: string,
): { nome: string; tipo: string } | null {
  const k = id.trim().toLowerCase()
  const achar = (aba: string, col: string, nomeCol: string, tipo: string) => {
    const l = (dados[aba] ?? []).find((x) => txt(x[col]).toLowerCase() === k)
    return l ? { nome: txt(l[nomeCol]) || id, tipo } : null
  }
  return (
    achar('subbacia-operacional', 'sub_bacia_id', 'sub_bacia_name', 'subbacia')
    ?? achar('cts-operacional', 'cts_id', 'cts_name', 'cts')
    ?? achar('ete-capex', 'ete_id', 'ete_name', 'ete')
  )
}

/** Já há CTS neste sistema, contando as linhas desta mesma planilha? */
function ctsPorSistema(linhas: Row[], sistemaId: string, dados: Dados): boolean {
  return linhas.some(
    (l) => txt(l.sistema_id) === sistemaId && ehCts(dados, l),
  )
}

function colocarCtsNoSistema(
  planilha: PlanilhaDaAba,
  dados: Dados,
  aba: AbaLida,
  avisos: string[],
  /**
   * AS QUE O FLUXO JÁ COLOCOU nesta mesma mescla — e que esta função tem de ignorar.
   *
   * Sem isto vinha um AVISO FALSO. A colocação pelo Fluxo escreve o sistema na ficha da
   * CTS, e então esta função lê a aba "Dados da CTS" do mesmo arquivo — onde `sistema_id`
   * continua VAZIO, porque o arquivo foi gerado antes da edição. Ela via ficha com sistema
   * e célula vazia, e concluía "tirar uma CTS do sistema é pela tela": exatamente o
   * contrário do que a pessoa acabou de fazer.
   *
   * Achado pela revisão do Codex em 01/10/2026, ao conferir o conserto anterior.
   */
  jaColocadasPeloFluxo: ReadonlySet<string> = new Set(),
): { dados: Dados; alteracoes: number } | null {
  //: id ou nome, pela mesma regra que a criação no Fluxo usa — ver `resolverSistema`
  const resolver = (texto: string) => resolverSistema(dados, texto)

  const cts = [...(dados['cts-operacional'] ?? [])]
  const topo = [...(dados['sistema-topologia'] ?? [])]
  const indiceCts = new Map(cts.map((l, i) => [txt(l.cts_id), i]))
  const indiceTopo = new Map(topo.map((l, i) => [txt(l.componente_sistema_id), i]))
  const macro = regimeDeCts(dados).macro

  // QUANTAS CTS CADA SISTEMA JÁ TEM, na topologia — contando as que esta
  // planilha coloca, para duas linhas não entrarem no mesmo sistema quando só
  // uma cabe.
  const ctsPorSistema = new Map<string, number>()
  for (const t of topo) {
    const sis = txt(t.sistema_id)
    if (sis && ehCts(dados, t)) ctsPorSistema.set(sis, (ctsPorSistema.get(sis) ?? 0) + 1)
  }

  let alteracoes = 0
  /**
   * UMA CTS, UMA POSIÇÃO — as que esta passagem já decidiu.
   *
   * Com tirar e mover liberados, a linha REPETIDA passava a mover o que a primeira linha
   * tinha colocado: a segunda lia a ficha já alterada e via uma mudança legítima de
   * sistema. Antes a recusa "já está no sistema" tapava isso por acidente. A duplicada
   * continua avisada por `mesclarPorChave`; aqui ela só não desfaz a primeira.
   */
  const jaDecididas = new Set<string>()
  aba.linhas.forEach((origem, n) => {
    if (linhaVazia(origem) || !('sistema_id' in origem)) return
    const avisar = aviso(planilha, n + PRIMEIRA_LINHA_DE_DADO, avisos)
    const id = txt(daCelula('cts_id', origem.cts_id))
    if (jaColocadasPeloFluxo.has(id)) return // o Fluxo resolveu esta linha
    if (jaDecididas.has(id)) return // linha repetida: a primeira vale — ver `jaDecididas`
    const i = indiceCts.get(id)
    if (i === undefined) return // já avisada em `mesclarPorChave`
    if (semResultado(origem.sistema_id)) {
      avisar(`"${colunaLabel('sistema_id')}" tem uma fórmula sem resultado calculado — a CTS não foi colocada em sistema.`)
      return
    }
    const pedido = txt(daCelula('sistema_id', origem.sistema_id))
    const atual = txt(cts[i].sistema_id)
    if (pedido.toLowerCase() === atual.toLowerCase()) return
    const t = indiceTopo.get(id)

    /**
     * TIRAR E MOVER, e não só colocar — decisão do dono do produto em 02/10/2026.
     *
     * Antes as duas eram recusadas com "é pela tela". A planilha é uma das três fontes, e
     * não a fonte de segunda classe: o que a tela faz, ela faz. Nada abaixo precisou
     * mudar — `envioDaTopologia` já manda os sistemas tocados dos dois lados, e a rota de
     * lote já grava sistemas inteiros numa transação.
     *
     * O ÓRFÃO é o risco, e a recusa é a mesma da tela e do servidor: quem escoa para a CTS
     * que sai ficaria apontando para fora do sistema. Ela lê o estado JÁ MESCLADO — esta
     * função roda depois da aba do Fluxo —, então reapontar no Fluxo e tirar a CTS na aba
     * de CTS, no mesmo arquivo, funciona. No portfólio real nada escoa para uma CTS hoje,
     * mas é esta linha que impede a planilha de arrebentar um desenho em lote.
     */
    if (atual) {
      const presos = topo
        .filter((l) => txt(l.componente_sistema_id_jusante) === id)
        .map((l) => txt(l.componente_sistema_id))
      if (presos.length) {
        avisar(
          `"${id}" não pode sair do sistema ${atual} enquanto ${presos.join(', ')} escoa(m) para ela — reaponte esse(s) primeiro, na aba "Fluxo de escoamento".`,
        )
        return
      }
    }
    if (atual && !pedido) {
      //: TIRAR. A ficha fica, e é isso que preserva o nome e permite recolocá-la depois —
      //: o servidor faz o mesmo (`remover_da_topologia` anula o sistema, não apaga a linha).
      cts[i] = { ...cts[i], sistema_id: '', sistema_name: '' }
      if (t !== undefined) {
        topo[t] = {
          ...topo[t],
          sistema_id: '',
          sistema_name: '',
          componente_sistema_id_jusante: '',
          componente_sistema_nome_jusante: '',
        }
      }
      ctsPorSistema.set(atual, Math.max(0, (ctsPorSistema.get(atual) ?? 1) - 1))
      jaDecididas.add(id)
      alteracoes++
      return
    }
    const sistema = resolver(pedido)
    if (sistema === 'ambiguo') {
      avisar(`"${pedido}" é o nome de mais de um sistema — use o id (aba "${SISTEMAS}").`)
      return
    }
    if (!sistema) {
      avisar(`o sistema "${pedido}" não é desta unidade — veja os ids na aba "${SISTEMAS}".`)
      return
    }
    const sis = txt(sistema.sistema_id)
    if (macro && (ctsPorSistema.get(sis) ?? 0) > 0) {
      avisar(`o sistema ${sistema.sistema_name || sis} já tem uma CTS, e a unidade usa macrorregião: cada sistema aceita uma só.`)
      return
    }
    if (t === undefined) {
      avisar(`"${id}" não está na topologia da unidade — a carga não a trouxe como componente; não dá para colocá-la num sistema.`)
      return
    }
    cts[i] = { ...cts[i], sistema_id: sis, sistema_name: txt(sistema.sistema_name) }
    topo[t] = {
      ...topo[t],
      sistema_id: sis,
      sistema_name: txt(sistema.sistema_name),
      //: MOVER limpa o jusante: ele era componente do sistema antigo, e lá não vale mais.
      //: Mandá-lo assim seria pedir ao servidor um desenho que ele recusa.
      ...(atual ? { componente_sistema_id_jusante: '', componente_sistema_nome_jusante: '' } : {}),
    }
    if (atual) ctsPorSistema.set(atual, Math.max(0, (ctsPorSistema.get(atual) ?? 1) - 1))
    ctsPorSistema.set(sis, (ctsPorSistema.get(sis) ?? 0) + 1)
    jaDecididas.add(id)
    alteracoes++
  })

  if (!alteracoes) return null
  return { dados: { 'cts-operacional': cts, 'sistema-topologia': topo }, alteracoes }
}

// ------------------------------------------------------------------ o Leia-me

/** O nome do arquivo: a unidade e o dia, sem espaço nem acento. */
export function nomeDoArquivo(unidade: Pick<UnidadeState, 'id'>, hoje = new Date()): string {
  const dia = hoje.toISOString().slice(0, 10)
  return `Cadastro_${unidade.id.replace(/[^\w-]/g, '_')}_${dia}.xlsx`
}

/**
 * As linhas do Leia-me — texto, uma frase por linha. A biblioteca só as
 * escreve; o conteúdo mora aqui para o teste conferir que o regime está dito.
 */
export function leiaMe(unidade: Pick<UnidadeState, 'id' | 'name' | 'regionalName'>, dados: Dados, hoje = new Date()): string[][] {
  const regime = regimeDeCts(dados)
  const planilhas = planilhasDoArquivo(dados)
  const fichasDeCts = dados['cts-operacional'] ?? []
  const semSistema = fichasDeCts.filter((c) => !txt(c.sistema_id)).length
  return [
    [`Cadastro do Otimizador CAPEX — ${unidade.name} (${unidade.id}) · ${unidade.regionalName}`],
    [`Gerada em ${hoje.toLocaleDateString('pt-BR')}, com os dados que a tela mostrava.`],
    [],
    [`Regime de CTS: ${regime.nome.toUpperCase()}`],
    [regime.regra],
    [`Fichas de CTS nesta planilha: ${fichasDeCts.length}${semSistema ? `, das quais ${semSistema} ainda sem sistema` : ''}.`],
    [],
    ['Como preencher'],
    ['1. Cada aba deste arquivo é uma aba do cadastro, já com as linhas de hoje. Não renomeie as abas nem mexa nas duas primeiras linhas.'],
    ['2. A linha 1 é o nome da coluna; a linha 2 é o código dela — é por ele que a importação reconhece a coluna.'],
    ['3. Colunas em âmbar voltam pela planilha — inclusive as que já vêm preenchidas da base: corrigir uma delas aqui sobrepõe o valor, com registro de quem mudou. Colunas em cinza são calculadas ou são a identidade da linha (id, nome): estão aqui para leitura, e o que for digitado nelas é ignorado com aviso.'],
    ['4. Os ids nunca mudam pela planilha — id se escolhe na tela, onde há regra para conferir. Mas LINHA NOVA se cria aqui: id que o cadastro não conhece, nas abas de Empresas, Municípios, Sistemas de esgoto, Sub-bacias, Dados da CTS e CAPEX das ETEs, é uma linha que vai NASCER ao salvar. Cada uma pede o que a liga à unidade — a cidade pede a empresa, o sistema pede a cidade, a sub-bacia e a ETE pedem o sistema, o coletor pede a cidade —, e o nome é sempre obrigatório. Falta algo, a importação diz o que falta e ignora a linha.'],
    ['5. Célula em branco significa "sem valor" — apagar um valor na planilha apaga na tela. Fórmula vale pelo resultado, e o arquivo precisa estar calculado ao salvar.'],
    ['6. Metas de cobertura e Escala de paridade são listas: a lista do arquivo substitui a da tela, então acrescente e apague linhas à vontade. Cidade sem registro vem com uma linha-modelo (só a cidade preenchida): preencha-a, copie-a para mais anos ou faixas, ou deixe-a em branco — em branco ela não vira registro.'],
    [`7. Dados da CTS: nas CTS com o sistema em branco, preencha "${colunaLabel('sistema_id')}" com o id (ou o nome) de um sistema da unidade — a aba "${SISTEMAS}" lista todos. Só entra: mudar de sistema ou sair dele é pela tela, e o caminho até a ETE (jusante) se desenha lá, no Fluxo de escoamento.`],
    ['8. Para tirar uma CTS do sistema, apague a coluna "ID Sistema" dela na aba "Dados da CTS"; para mudá-la de sistema, troque o id. Se alguém escoa para essa CTS, reaponte primeiro na aba "Fluxo de escoamento" — senão a linha é recusada, dizendo quem.'],
    ['9. No Fluxo de escoamento, preencha o ID Sistema PRIMEIRO: é ele que define as duas listas da linha. A de ID Origem traz as CTS que cabem naquele sistema — só as da mesma empresa, que é a regra do cadastro —, e a de ID Destino, os componentes dele. A aba "Componentes" mostra a empresa e o sistema de cada CTS. As listas são um retrato do download: mexeu na tela depois disso? Baixe a planilha de novo — ou digite o id à mão, que a lista sugere e não recusa.'],
    ['10. A caixa "usa macrorregião de CTS" se decide na tela, não aqui: ela muda quais fichas de CTS existem. Planilha gerada num regime não serve para o outro — as abas de CTS ficam de fora.'],
    ['10. Importe pelo botão "Importar planilha preenchida", na aba Unidade, na mesma unidade em que a planilha foi gerada. Nada é gravado na importação: revise a grade e clique em Salvar.'],
    [],
    ['Aba', 'O que é', 'Linhas', 'Colunas que voltam pela planilha'],
    ...planilhas.map((p) => [
      p.nome,
      p.aba.desc.split('. ')[0],
      String(p.linhas.length),
      [...colunasImportaveis(p.aba, contextoDeGravacao(dados)), ...(COLOCA_NO_SISTEMA[p.aba.key] ? [COLOCA_NO_SISTEMA[p.aba.key]] : [])]
        .map(colunaLabel)
        .join(', ') || '— (só leitura)',
    ]),
    [SISTEMAS, 'Os sistemas da unidade, para consultar o id ao colocar uma CTS', String(linhasDeSistemas(dados).length), '— (só leitura)'],
  ]
}
