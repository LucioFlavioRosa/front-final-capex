import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useState, type ReactNode } from 'react'
import { SCHEMA, cidadesDoCadastro, nomeCidade } from '../../../data/cadastroUnidade/schema'
import { lerCadastro, salvarCadastro } from '../../../lib/cadastroApi'
import { ApiError } from '../../../lib/api'
import { garantirFaixaZero } from '../../../lib/cadastroCalc'
import { espelharColunas } from '../../../lib/cadastroFluxo'
import type { UnidadeState } from '../../../data/cadastroUnidade/types'

export type Fase = 'selecao' | 'wizard' | 'revisao' | 'sucesso'

interface CadastroState {
  fase: Fase
  regionalId: string
  unidadeId: string
  unidade: UnidadeState | null
  passo: number
}

/**
 * NENHUMA UNIDADE ABERTA POR PADRÃO (17/08/2026).
 *
 * Havia uma — ÁGUAS DO RIO 04 (57) — montada por `seed()` a partir de
 * `hierarquiaReal.ts` compilado no bundle. As duas coisas saíram juntas: a
 * regra do projeto passou a ser "o banco é a única fonte, em toda tela", e
 * `seed()` é justamente o gerador que fabricava um cadastro de exemplo sem
 * perguntar ao banco nada.
 *
 * A tela de seleção (`SelecaoUnidade`) busca as unidades reais por
 * `useRegionais`/`useUnidades` (`lib/organizacaoApi.ts`, que lê
 * `input.unidade_regional`). Escolher uma dispara `SELECT_UNIDADE`, que cria
 * um estado VAZIO — sem linha nenhuma — e o `useEffect` de hidratação abaixo
 * o preenche com o que `GET /api/cadastro/{id}` devolver. Sem cadastro salvo,
 * o vazio é o estado final: nenhum dado inventado toma o lugar dele.
 */
const initialState: CadastroState = {
  fase: 'selecao',
  regionalId: '',
  unidadeId: '',
  unidade: null,
  passo: 0,
}

type Action =
  | { type: 'SELECT_REGIONAL'; regionalId: string }
  | { type: 'SELECT_UNIDADE'; unidadeId: string; nome: string; regionalId: string }
  | { type: 'INICIAR_CADASTRO' }
  | { type: 'SET_CELL'; abaKey: string; ri: number; col: string; value: string }
  | { type: 'SET_CELLS'; abaKey: string; edicoes: { ri: number; col: string; value: string }[] }
  | { type: 'ADD_ROW'; abaKey: string }
  | { type: 'DEL_ROW'; abaKey: string; ri: number }
  | { type: 'IR_PASSO'; passo: number }
  | { type: 'IR_FASE'; fase: Fase }
  | { type: 'GARANTIR_FAIXA_ZERO' }
  | { type: 'HIDRATAR'; unidadeId: string; dados: UnidadeState['data'] }
  | { type: 'IMPORTAR_PLANILHA'; dados: UnidadeState['data'] }

/**
 * PREENCHIMENTO ACOMPANHADO — as colunas que uma escolha preenche junto.
 *
 * Existia como um `if` cravado no reducer: `cidade_id` escolhido nas abas de metas
 * e paridade preenchia `cidade_name` ao lado, para não exigir duas seleções da
 * mesma coisa. O item 22 trouxe o segundo caso — no Fluxo de escoamento, escolher
 * o código da origem ou do destino preenche o nome (e, na origem, o sistema) — e
 * dois `if` com nomes de coluna cravados em dois `case` do mesmo reducer é o
 * caminho garantido para eles divergirem.
 *
 * Então a regra virou função, e ela vale para os DOIS caminhos de escrita: a
 * digitação (`SET_CELL`) e o colar em lote (`SET_CELLS`). O segundo é o que
 * importa proteger — colar 200 códigos numa coluna sem levar os nomes junto
 * deixaria 200 linhas com o código novo e o nome antigo, e nada na tela
 * denunciaria isso.
 */
function colunasAcompanhantes(
  unidade: UnidadeState,
  abaKey: string,
  col: string,
  valor: string,
): Record<string, string> {
  const ABAS_COM_CIDADE = ['fator-esgoto', 'metas-cobertura']
  if (ABAS_COM_CIDADE.includes(abaKey) && col === 'cidade_id') {
    return { cidade_name: nomeCidade(unidade.cidades, valor) }
  }
  return espelharColunas(unidade.data, abaKey, col, valor)
}

function reducer(state: CadastroState, action: Action): CadastroState {
  switch (action.type) {
    case 'SELECT_REGIONAL':
      return { ...state, regionalId: action.regionalId, unidadeId: '', unidade: null }

    case 'SELECT_UNIDADE':
      return {
        ...state,
        regionalId: action.regionalId,
        unidadeId: action.unidadeId,
        // Sem linha nenhuma: o efeito de hidratação (`GET /api/cadastro/{id}`)
        // substitui `data` assim que a resposta chegar — ver `HIDRATAR`. Sem
        // cadastro salvo para esta unidade, o vazio É o estado final.
        unidade: {
          id: action.unidadeId,
          name: action.nome,
          regionalName: action.regionalId,
          cidades: [],
          data: {},
        },
      }

    case 'INICIAR_CADASTRO':
      return { ...state, fase: 'wizard', passo: 0 }

    case 'SET_CELL': {
      if (!state.unidade) return state
      const rows = state.unidade.data[action.abaKey] ?? []
      const acompanham = colunasAcompanhantes(
        state.unidade, action.abaKey, action.col, action.value,
      )
      const newRows = rows.map((r, i) =>
        (i === action.ri ? { ...r, [action.col]: action.value, ...acompanham } : r),
      )
      return {
        ...state,
        unidade: { ...state.unidade, data: { ...state.unidade.data, [action.abaKey]: newRows } },
      }
    }

    /**
     * Escrita em lote — o colar de uma seleção de células (ver
     * `useSelecaoGrade`). Vem como lista porque colar um valor sobre 200
     * células precisa ser UM dispatch: 200 `SET_CELL` seriam 200 re-renders da
     * grade inteira, e o estado intermediário de cada um é lixo.
     */
    case 'SET_CELLS': {
      if (!state.unidade || !action.edicoes.length) return state
      const rows = state.unidade.data[action.abaKey] ?? []
      const unidade = state.unidade

      const patchPorLinha = new Map<number, Record<string, string>>()
      for (const { ri, col, value } of action.edicoes) {
        const patch = patchPorLinha.get(ri) ?? {}
        // Mesma regra do SET_CELL, e é aqui que ela mais importa: um colar sobre
        // 200 células passa por este laço 200 vezes, e cada código escrito leva o
        // nome (e o sistema) junto.
        Object.assign(patch, { [col]: value }, colunasAcompanhantes(unidade, action.abaKey, col, value))
        patchPorLinha.set(ri, patch)
      }

      const newRows = rows.map((r, i) => {
        const patch = patchPorLinha.get(i)
        return patch ? { ...r, ...patch } : r
      })
      return {
        ...state,
        unidade: { ...state.unidade, data: { ...state.unidade.data, [action.abaKey]: newRows } },
      }
    }

    case 'ADD_ROW': {
      if (!state.unidade) return state
      const aba = SCHEMA.find((s) => s.key === action.abaKey)
      if (!aba?.novo) return state
      const rows = state.unidade.data[action.abaKey] ?? []
      return {
        ...state,
        unidade: {
          ...state.unidade,
          data: { ...state.unidade.data, [action.abaKey]: [...rows, aba.novo()] },
        },
      }
    }

    case 'DEL_ROW': {
      if (!state.unidade) return state
      const rows = state.unidade.data[action.abaKey] ?? []
      return {
        ...state,
        unidade: {
          ...state.unidade,
          data: { ...state.unidade.data, [action.abaKey]: rows.filter((_, i) => i !== action.ri) },
        },
      }
    }

    /**
     * Faixa de cobertura 0 da escala de paridade (item 30 de 05/08/2026).
     *
     * A regra vive em `garantirFaixaZero`; aqui só o disparo. Ela é chamada ao
     * ENTRAR na aba — ver o comentário da função para por que não a cada tecla.
     *
     * O `=== rows` é o que mantém isso inofensivo: sem nada a criar, a função devolve
     * o MESMO array, e sair com `state` intocado evita um render a cada visita à aba
     * (e uma sequência infinita se algum dia isso for chamado de dentro de um efeito
     * que dependa do estado).
     */
    case 'GARANTIR_FAIXA_ZERO': {
      if (!state.unidade) return state
      const rows = state.unidade.data['fator-esgoto'] ?? []
      const comFaixaZero = garantirFaixaZero(rows)
      if (comFaixaZero === rows) return state
      return {
        ...state,
        unidade: {
          ...state.unidade,
          data: { ...state.unidade.data, 'fator-esgoto': comFaixaZero },
        },
      }
    }

    /**
     * SUBSTITUI o estado local pelo que está gravado no banco.
     *
     * A comparação de id não é zelo excessivo: a busca é assíncrona e o usuário
     * pode trocar de unidade enquanto ela viaja. Sem a guarda, a resposta da
     * unidade anterior chegaria depois e sobrescreveria a atual — com dados de
     * outra unidade, e sem nada na tela denunciando.
     *
     * A substituição é total, e não mesclagem com o estado vazio de
     * `SELECT_UNIDADE`. Mesclar produziria um cadastro que não é nem o salvo
     * nem o vazio, e ninguém conseguiria dizer de onde veio cada linha.
     *
     * `cidades` é DERIVADO junto, da aba `cidade-operacional` que acabou de
     * chegar (ver `cidadesDoCadastro`) — não vem mais de um mapa compilado.
     */
    case 'HIDRATAR': {
      if (!state.unidade || state.unidade.id !== action.unidadeId) return state
      return {
        ...state,
        unidade: { ...state.unidade, data: action.dados, cidades: cidadesDoCadastro(action.dados) },
      }
    }

    /**
     * O UPLOAD do template preenchido — a volta do botão "Baixar template".
     *
     * MESCLA, e não substitui como `HIDRATAR`: o template só cobre as 12 abas
     * visíveis do wizard (`template_excel.PLANILHAS`), e as três abas ocultas
     * da hierarquia (Ano-base, Superintendências, Cidades atendidas — ver
     * `ocultaNoWizard` em types.ts) não entram nele. Uma substituição total
     * zeraria essas três em silêncio; a mescla troca só as abas que a
     * planilha de fato trouxe, campo por campo.
     *
     * `cidades` é recalculado sobre o resultado da mescla, não sobre
     * `action.dados` isolado — a aba `cidade-operacional` pode ter chegado
     * junto (é uma das 12), e sem reler o estado completo o select de cidade
     * ficaria com a lista de ANTES do import.
     */
    case 'IMPORTAR_PLANILHA': {
      if (!state.unidade) return state
      const data = { ...state.unidade.data, ...action.dados }
      return {
        ...state,
        unidade: { ...state.unidade, data, cidades: cidadesDoCadastro(data) },
      }
    }

    case 'IR_PASSO':
      return { ...state, passo: action.passo }

    case 'IR_FASE':
      return { ...state, fase: action.fase }

    default:
      return state
  }
}

interface CadastroContextValue {
  state: CadastroState
  selecionarRegional: (regionalId: string) => void
  selecionarUnidade: (unidadeId: string, nome: string, regionalId: string) => void
  iniciarCadastro: () => void
  setCell: (abaKey: string, ri: number, col: string, value: string) => void
  setCells: (abaKey: string, edicoes: { ri: number; col: string; value: string }[]) => void
  addRow: (abaKey: string) => void
  delRow: (abaKey: string, ri: number) => void
  /** Mescla no estado o `dados` que voltou de `importarTemplateCadastro`. */
  importarPlanilha: (dados: UnidadeState['data']) => void
  irPasso: (passo: number) => void
  irFase: (fase: Fase) => void
  /** Cria a faixa de cobertura 0 das cidades com uma paridade só (item 30). */
  garantirFaixaZeroParidade: () => void
  /**
   * Grava o cadastro como ele está, completo ou não.
   *
   * NÃO checa completude nem problemas críticos, e isso é a regra, não um
   * descuido: preencher o cadastro leva várias sessões, e exigir 100% para
   * poder guardar significaria manter tudo em memória até o fim — um refresh de
   * página apagaria o trabalho. Completude e ausência de críticos são portão
   * para RODAR o otimizador, não para persistir.
   *
   * Rejeita em caso de falha; quem chama decide como avisar.
   */
  salvar: () => Promise<void>
  salvando: boolean
  /** Momento do último salvamento bem-sucedido nesta sessão, ou null. */
  salvoEm: Date | null
}

const CadastroCtx = createContext<CadastroContextValue | null>(null)

export function CadastroProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState)

  /**
   * ESTA callback é estável de propósito, e as outras não precisam ser.
   *
   * O objeto de `value` é recriado a cada mudança de estado (o `useMemo` depende de
   * `state`), então todas as funções dele trocam de identidade a cada tecla digitada.
   * Para as demais isso é irrelevante — quem as chama é um `onChange`.
   *
   * Esta é chamada de dentro de um `useEffect` no wizard, e aí a identidade é o
   * comportamento: como dependência instável, o efeito re-rodaria a cada tecla e a
   * faixa de cobertura 0 nasceria no meio da digitação da primeira faixa — o oposto
   * do "só ao entrar na aba" que a regra pede. Com `useCallback` sobre `dispatch`
   * (que o React garante estável), o efeito roda uma vez por visita à aba.
   */
  const garantirFaixaZeroParidade = useCallback(
    () => dispatch({ type: 'GARANTIR_FAIXA_ZERO' }),
    [],
  )

  /**
   * Busca no banco o cadastro da unidade selecionada.
   *
   * É a metade que faltava da persistência: sem isto, reabrir o site mostraria
   * de novo o `seed` local e daria a impressão de que nada foi salvo — ou pior,
   * a impressão de que foi, já que o seed tem a mesma cara.
   *
   * 404 é resultado esperado, não erro: significa que esta unidade nunca foi
   * salva, e o `seed` é exatamente o que deve ficar na tela. Só falha de
   * verdade vai para o console.
   *
   * `cancelado` cobre a troca rápida de unidade — o dispatch tardio de uma
   * requisição obsoleta é descartado aqui, e a guarda por id no reducer é a
   * segunda linha de defesa.
   */
  const unidadeId = state.unidadeId
  useEffect(() => {
    if (!unidadeId) return
    let cancelado = false

    lerCadastro(unidadeId)
      .then((registro) => {
        if (!cancelado) dispatch({ type: 'HIDRATAR', unidadeId, dados: registro.dados })
      })
      .catch((erro) => {
        if (erro instanceof ApiError && erro.status === 404) return
        console.error('Falha ao carregar o cadastro salvo:', erro)
      })

    return () => {
      cancelado = true
    }
  }, [unidadeId])

  const [salvando, setSalvando] = useState(false)
  const [salvoEm, setSalvoEm] = useState<Date | null>(null)
  const unidadeAtual = state.unidade

  /**
   * SALVA E RELÊ — as duas coisas, e a segunda não é zelo.
   *
   * Há dado que só o servidor sabe montar, e a CTS recém-colocada é o caso: o
   * botão "Adicionar CTS" escreve o `sistema_id` na linha do Fluxo, e mais nada,
   * porque a FICHA dela (`cts-operacional`) vem de `GET /unidades/{u}/cts`, que
   * serve as CTS DA UNIDADE — e uma CTS livre não era de unidade nenhuma quando
   * a tela carregou.
   *
   * Sem reler, a CTS ficava meio existente na tela depois de salva: sem tipo na
   * coluna `componente_tipo` (que `tipoDoNo` deriva da aba onde há ficha), fora
   * da lista de destinos dos outros componentes (`opcoesDestino` monta a lista
   * a partir de `cts-operacional`) e ausente da aba "Dados da CTS", que é
   * justamente onde se ia preencher o resto dela. Três sintomas, uma causa.
   *
   * A releitura é a MESMA de `lerCadastro` na carga, e por isso não inventa
   * nada: o que volta é o que o servidor tem, agora com a CTS dentro da unidade.
   *
   * Falha na releitura NÃO desfaz o salvo — ele já aconteceu. O estado fica como
   * estava e a próxima carga resolve; avisar "não salvou" seria mentira.
   */
  const salvar = useCallback(async () => {
    if (!unidadeAtual) return
    setSalvando(true)
    try {
      await salvarCadastro(unidadeAtual)
      setSalvoEm(new Date())
      try {
        const registro = await lerCadastro(unidadeAtual.id)
        dispatch({ type: 'HIDRATAR', unidadeId: unidadeAtual.id, dados: registro.dados })
      } catch (erro) {
        console.error('Salvou, mas falhou ao reler o cadastro:', erro)
      }
    } finally {
      // No finally, e não depois do await: sem isso uma falha deixaria o botão
      // travado em "Salvando…" para sempre, sem caminho de volta a não ser
      // recarregar a página — e recarregar é justamente o que perde o trabalho.
      setSalvando(false)
    }
  }, [unidadeAtual])

  const value = useMemo<CadastroContextValue>(() => ({
    state,
    selecionarRegional: (regionalId) => dispatch({ type: 'SELECT_REGIONAL', regionalId }),
    selecionarUnidade: (unidadeId, nome, regionalId) =>
      dispatch({ type: 'SELECT_UNIDADE', unidadeId, nome, regionalId }),
    iniciarCadastro: () => dispatch({ type: 'INICIAR_CADASTRO' }),
    setCell: (abaKey, ri, col, value) => dispatch({ type: 'SET_CELL', abaKey, ri, col, value }),
    setCells: (abaKey, edicoes) => dispatch({ type: 'SET_CELLS', abaKey, edicoes }),
    addRow: (abaKey) => dispatch({ type: 'ADD_ROW', abaKey }),
    delRow: (abaKey, ri) => dispatch({ type: 'DEL_ROW', abaKey, ri }),
    importarPlanilha: (dados) => dispatch({ type: 'IMPORTAR_PLANILHA', dados }),
    irPasso: (passo) => dispatch({ type: 'IR_PASSO', passo }),
    irFase: (fase) => dispatch({ type: 'IR_FASE', fase }),
    garantirFaixaZeroParidade,
    salvar,
    salvando,
    salvoEm,
  }), [state, garantirFaixaZeroParidade, salvar, salvando, salvoEm])

  return <CadastroCtx.Provider value={value}>{children}</CadastroCtx.Provider>
}

export function useCadastro(): CadastroContextValue {
  const ctx = useContext(CadastroCtx)
  if (!ctx) throw new Error('useCadastro deve ser usado dentro de <CadastroProvider>')
  return ctx
}
