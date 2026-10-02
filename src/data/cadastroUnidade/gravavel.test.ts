/**
 * O CONTRATO DE GRAVAÇÃO TEM DE SER O QUE O `PUT` REALMENTE MANDA.
 *
 * `GRAVAVEL_POR_ABA` existe porque a regra anterior era um palpite: a planilha decidia o
 * que aceitar de volta por `origem === 'un'`, que é informação de APRESENTAÇÃO. Trocá-la
 * pelo contrato só vale a pena se o contrato não virar, por sua vez, outro palpite — e um
 * palpite escrito à mão em arquivo separado é exatamente o que se desfaz com o tempo.
 *
 * Então aqui o contrato é confrontado com os de/para que o `cadastroApi` usa para MONTAR o
 * corpo da requisição. A direção que importa é esta: nada que o contrato libere pode faltar
 * no corpo — liberar uma coluna que o `PUT` não carrega é prometer gravação e entregar
 * silêncio, que é o defeito de 30/09/2026 de volta, com outro nome.
 *
 * A direção contrária NÃO é erro, e por isso é declarada: há coluna que o corpo carrega e o
 * contrato deixa de fora de propósito (a `unidade` da obra, fixa por tipo de componente; o
 * `componente`, que é a chave de casamento). Declarada uma por uma, acrescentar coluna ao
 * `PUT` sem decidir se ela entra na planilha quebra este teste — que é o ponto.
 */
import { describe, expect, it } from 'vitest'
import { DB, OBRA, PARAMS, COLUNAS_DA_ETE, JANELA_DA_ETE } from '../../lib/cadastroApi'
import { GRAVAVEL_POR_ABA, colunaGravavel } from './gravavel'
import { SCHEMA } from './schema'

/** Os nomes de coluna que um de/para do `cadastroApi` manda no corpo. */
const colunasDo = (mapa: Record<string, string>): string[] => Object.values(mapa)

/**
 * O NOME VIAJA FORA DOS DE/PARA — na raiz do corpo, como `nome`.
 *
 * Os mapas (`DB`, `PARAMS`, `COLUNAS_DA_ETE`) descrevem os BLOCOS da ficha; o nome não
 * está em bloco nenhum, porque no banco ele mora noutra tabela
 * (`sistema_topologia.componente_sistema_nome`). Então ele entra aqui à mão, e esta é a
 * única coisa deste arquivo que não sai de um mapa do `cadastroApi` — declarada, para o
 * teste continuar valendo como confronto e não passar a mentir por omissão.
 */
const NOME_NO_CORPO: Record<string, readonly string[]> = {
  'subbacia-operacional': ['sub_bacia_name'],
  'cts-operacional': ['cts_name'],
  'ete-capex': ['ete_name'],
}

const MOTIVO_DERIVADA = 'universo − atuais: o motor recalcula e ignora o banco; ver recalcularDerivadasDaColeta'
const DERIVADAS_DA_COLETA: Record<string, string> = {
  ligacoes_novas_obras: MOTIVO_DERIVADA,
  economias_novas_obras: MOTIVO_DERIVADA,
  populacao_novas_obras: MOTIVO_DERIVADA,
}

/**
 * Aba → o corpo que o `PUT` dela monta, e o que fica fora do contrato COM MOTIVO.
 *
 * Só as abas cujo corpo vem de um de/para do `cadastroApi`. As outras (`wacc_medio`,
 * `data_fim_concessao`, as listas de metas e faixas, o jusante do Fluxo) são campo avulso
 * numa chamada própria, e o teste de ponta a ponta da planilha é quem as cobre.
 */
const CORPO_DO_PUT: Record<string, { corpo: string[]; foraDeProposito: Record<string, string> }> = {
  /**
   * As três `*_novas_obras` são o caso que este teste existe para pegar: o `PUT` as
   * carrega, e mesmo assim ninguém as digita. São `universo − atuais`, e o motor as
   * recalcula ignorando o banco — liberá-las seria pedir um número que nunca é lido.
   * Quem as mantém certas é `recalcularDerivadasDaColeta`.
   */
  'subbacia-operacional': {
    corpo: [...colunasDo(DB), ...colunasDo(PARAMS), ...NOME_NO_CORPO['subbacia-operacional']],
    foraDeProposito: DERIVADAS_DA_COLETA,
  },
  'cts-operacional': {
    corpo: [...colunasDo(DB), ...colunasDo(PARAMS), ...NOME_NO_CORPO['cts-operacional']],
    foraDeProposito: DERIVADAS_DA_COLETA,
  },
  'componentes-subbacias-capex': {
    corpo: colunasDo(OBRA),
    foraDeProposito: {
      componente: 'metade da chave de casamento: mudá-la é trocar de obra, não atualizar esta',
      unidade: 'fixa por tipo de componente — é o que faz quantidade × preço ser comparável',
    },
  },
  'componentes-cts-capex': {
    corpo: colunasDo(OBRA),
    foraDeProposito: {
      componente: 'metade da chave de casamento: mudá-la é trocar de obra, não atualizar esta',
      unidade: 'fixa por tipo de componente — é o que faz quantidade × preço ser comparável',
    },
  },
  'ete-capex': {
    // o prazo e a janela da obra viajam ao lado das colunas de `ETE`, fora do objeto `ete`
    corpo: [...colunasDo(COLUNAS_DA_ETE), ...colunasDo(JANELA_DA_ETE), ...NOME_NO_CORPO['ete-capex']],
    foraDeProposito: {},
  },
}

describe('o contrato de gravação', () => {
  it('não libera coluna que o PUT não manda', () => {
    const prometidasSemCorpo: string[] = []
    for (const [aba, { corpo }] of Object.entries(CORPO_DO_PUT)) {
      for (const col of GRAVAVEL_POR_ABA[aba] ?? []) {
        if (!corpo.includes(col)) prometidasSemCorpo.push(`${aba}.${col}`)
      }
    }
    expect(prometidasSemCorpo).toEqual([])
  })

  it('o que o PUT manda e o contrato não libera está declarado, uma coluna por motivo', () => {
    for (const [aba, { corpo, foraDeProposito }] of Object.entries(CORPO_DO_PUT)) {
      const semDecisao = corpo.filter((col) => !colunaGravavel(aba, col) && !(col in foraDeProposito))
      expect(semDecisao, `${aba}: coluna no corpo do PUT sem decisão declarada`).toEqual([])
      // e o contrário: motivo declarado para coluna que não está mais no corpo é motivo morto
      const motivoSemColuna = Object.keys(foraDeProposito).filter((col) => !corpo.includes(col))
      expect(motivoSemColuna, `${aba}: motivo declarado para coluna fora do PUT`).toEqual([])
    }
  })

  it('toda coluna do contrato existe na aba que a declara', () => {
    // Erro de digitação num contrato escrito à mão não dá erro em lugar nenhum: a coluna
    // simplesmente nunca casa, e a planilha volta a recusar calado.
    const inexistentes: string[] = []
    for (const [aba, colunas] of Object.entries(GRAVAVEL_POR_ABA)) {
      const def = SCHEMA.find((a) => a.key === aba)
      expect(def, `aba "${aba}" do contrato não existe no SCHEMA`).toBeDefined()
      const doSchema = new Set((def!.cols ?? []).map((c) => c.coluna))
      for (const col of colunas) if (!doSchema.has(col)) inexistentes.push(`${aba}.${col}`)
    }
    expect(inexistentes).toEqual([])
  })

  it('a CTS somada não grava medida da base — o servidor refaz a soma', () => {
    /**
     * Achado pela revisão do Codex em 01/10/2026 e confirmado no backend: ao gravar a ficha
     * de uma macrorregião, `_gravar_coleta` recebe o bloco `db` SUBSTITUÍDO por
     * `_somas_de_hoje`. O comentário de lá enuncia a premissa que a liberação quebrou —
     * "as medidas do Databricks não são digitadas: são travadas na tela".
     *
     * Liberar a medida ali seria deixar a pessoa digitar para ver o valor voltar no
     * próximo salvamento, que é o defeito que esta mudança existe para tirar do produto.
     */
    for (const col of ['ligacoes_atuais', 'receita_faturada_media_mensal']) {
      expect(colunaGravavel('cts-operacional', col), `${col} fora da macrorregião`).toBe(true)
      expect(colunaGravavel('cts-operacional', col, { ctsSomada: true }), col).toBe(false)
    }
    // O servidor só refaz o bloco `db`: o que a Regional preenche continua gravável.
    expect(colunaGravavel('cts-operacional', 'preco_por_ligacao', { ctsSomada: true })).toBe(true)
    // E a sub-bacia não tem soma nenhuma: o regime da CTS não a alcança.
    expect(colunaGravavel('subbacia-operacional', 'ligacoes_atuais', { ctsSomada: true })).toBe(true)
  })

  it('nenhum id, nome ou derivada entrou pela porta de trás', () => {
    // O contrato é escrito à mão, e a tentação de acrescentar "só esta" é o que o
    // desmonta. Id e nome são a identidade da linha; `*_com_cts` e os tickets são conta
    // do servidor, que recusa o campo no corpo.
    const proibidas: string[] = []
    for (const [aba, colunas] of Object.entries(GRAVAVEL_POR_ABA)) {
      for (const col of colunas) {
        //: o NOME saiu desta lista em 01/10/2026 — ele é rótulo, não identidade, e o
        //: serviço ganhou o campo. O ID continua: trocá-lo é apontar para outro registro.
        const ehIdentidade = col.endsWith('_id') || col === 'emp_codigo'
        const ehDerivada = col.endsWith('_com_cts') || col.startsWith('ticket_medio') || col === 'capex'
        if (ehIdentidade || ehDerivada) proibidas.push(`${aba}.${col}`)
      }
    }
    expect(proibidas).toEqual([])
  })
})
