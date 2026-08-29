import { beforeAll, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { SCHEMA } from '../../../data/cadastroUnidade/schema'
import type { AbaDef, Row } from '../../../data/cadastroUnidade/types'
import type { Dados } from '../../../domain/fluxo'
import {
  casaComEscopo,
  chaveSistema,
  opcoesEscopo,
  sistemaDaLinhaEscopo,
  sistemaPadraoDoFluxo,
  sistemasVisiveis,
} from '../../../domain/escopo'
import { ADMIN_UNIDADE } from '../../../auth/papeis'
import { BLOCOS } from '../../../data/cadastroUnidade/blocos'
import { espelharColunas, opcoesDaCelula } from '../../../domain/fluxo'
import { AbaGrid } from './AbaGrid'
import { Unifilar } from './Unifilar'

/**
 * A BARRA DE ESCOPO (20/08/2026) — e o teste que ela não podia estrear sem.
 *
 * O risco desta feature não é a barra não filtrar: é ela filtrar e a ESCRITA cair
 * na linha errada. O reducer do `CadastroContext` escreve por POSIÇÃO no array
 * original (`rows.map((r, i) => i === action.ri ? …)`), e a grade renderiza uma
 * lista recortada. Se o índice do que está na tela vazar para fora sem tradução,
 * a pessoa digita numa linha e o valor aparece em outra — sem erro, sem log, sem
 * jeito de perceber até alguém conferir a planilha.
 *
 * Daí a divisão dos dois blocos abaixo: o primeiro prova que o recorte escolhe as
 * linhas certas, o segundo prova que a escrita sai com o índice certo depois de
 * recortado.
 */

// ---------------------------------------------------------------- fixture

vi.mock('../../../auth/AuthContext', () => ({
  useAuth: () => ({ user: { papeis: [ADMIN_UNIDADE] } }),
}))

beforeAll(() => {
  // A grade mede a si mesma para decidir se mostra a barra de rolagem espelhada,
  // e rola a linha pedida para o meio quando o desenho manda foco. jsdom não tem
  // nenhuma das duas — sem os dublês o componente lança na montagem.
  if (!('ResizeObserver' in globalThis)) {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver
  }
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => {})
})

const aba = (key: string): AbaDef => {
  const a = SCHEMA.find((x) => x.key === key)
  if (!a) throw new Error(`aba ${key} não existe no SCHEMA`)
  return a
}

/**
 * Um cadastro mínimo com as três formas que o vínculo sistema↔linha assume de
 * verdade na base:
 *
 *   s01 — sub-bacias com `sistema_id` na linha do fluxo, e uma CTS que chega SEM
 *         sistema e o herda do destino (item 21).
 *   s02 — um sistema de uma sub-bacia só, sem destino escolhido.
 *   s03 — sistema SEM CIDADE declarada em `cidade-sistema`. Não é caso de borda
 *         inventado: é o do sistema real da amostra, e é a razão de "Todas as
 *         cidades" ser o padrão da barra.
 */
const DADOS: Dados = {
  'cidade-sistema': [
    { sistema_id: 's01', sistema_name: 'Alegria', cidade_id: 'c001' },
    { sistema_id: 's02', sistema_name: 'Bonsucesso', cidade_id: 'c002' },
    { sistema_id: 's03', sistema_name: 'Pavuna', cidade_id: '' },
  ],
  'subbacia-operacional': [
    { sub_bacia_id: 'b001', sub_bacia_name: 'Canal do Cunha', sistema_id: '', sistema_name: 'Alegria' },
    { sub_bacia_id: 'b002', sub_bacia_name: 'Faria-Timbó', sistema_id: '', sistema_name: 'Alegria' },
    { sub_bacia_id: 'b010', sub_bacia_name: 'Sarapuí', sistema_id: '', sistema_name: 'Bonsucesso' },
    { sub_bacia_id: 'b020', sub_bacia_name: 'Acari', sistema_id: '', sistema_name: 'Pavuna' },
  ],
  'cts-operacional': [{ cts_id: 't001', cts_name: 'CTS Leste', sistema_id: '', sistema_name: '' }],
  'ete-capex': [{ ete_id: 'e01', ete_name: 'ETE Alegria', sistema_id: 's01' }],
  'sistema-topologia': [
    { sistema_id: 's01', sistema_name: 'Alegria', componente_sistema_id: 'b001', componente_sistema_id_jusante: 'b002' },
    { sistema_id: 's02', sistema_name: 'Bonsucesso', componente_sistema_id: 'b010', componente_sistema_id_jusante: '' },
    { sistema_id: 's01', sistema_name: 'Alegria', componente_sistema_id: 'b002', componente_sistema_id_jusante: 'e01' },
    { sistema_id: '', sistema_name: '', componente_sistema_id: 't001', componente_sistema_id_jusante: 'b002' },
    { sistema_id: 's03', sistema_name: 'Pavuna', componente_sistema_id: 'b020', componente_sistema_id_jusante: '' },
  ],
  'componentes-subbacias-capex': [],
}

const FLUXO = DADOS['sistema-topologia']

const METAS: Row[] = [
  { emp_codigo: '57', empresa: 'Águas do Rio 04', cidade_id: 'c001', cidade_name: 'Belford Roxo', ano: '2030', cobertura_pct: '40' },
  { emp_codigo: '57', empresa: 'Águas do Rio 04', cidade_id: 'c002', cidade_name: 'Nova Iguaçu', ano: '2030', cobertura_pct: '50' },
  { emp_codigo: '57', empresa: 'Águas do Rio 04', cidade_id: 'c001', cidade_name: 'Belford Roxo', ano: '2031', cobertura_pct: '60' },
]

// ------------------------------------------------------- o recorte escolhe certo

describe('escopo — a linha resolve o sistema pelo caminho que a aba declara', () => {
  it('linha de sub-bacia usa o `sistema_id` dela; linha de CTS herda do destino', () => {
    const porSubbacia = sistemaDaLinhaEscopo(DADOS, 'fluxo', FLUXO[0])
    expect(chaveSistema(porSubbacia)).toBe('s01')

    // A CTS chega com `sistema_id` vazio — quem responde é o destino dela (b002,
    // que é do s01). É o item 21, e é o único eixo que exige caminhar o grafo.
    const porCts = sistemaDaLinhaEscopo(DADOS, 'fluxo', FLUXO[3])
    expect(chaveSistema(porCts)).toBe('s01')
  })

  it('na aba de Sub-bacias o vínculo vem do NOME, porque o `sistema_id` chega vazio', () => {
    const linha = DADOS['subbacia-operacional'][2]
    expect(linha.sistema_id).toBe('')
    expect(chaveSistema(sistemaDaLinhaEscopo(DADOS, 'via-subbacia', linha))).toBe('s02')
  })

  it('as opções saem das LINHAS — então toda opção oferecida tem pelo menos uma linha', () => {
    const { cidades, sistemas } = opcoesEscopo(DADOS, [], aba('sistema-topologia'), FLUXO)

    // Os três sistemas vêm das 5 linhas do fluxo. NÃO há opção "todos os
    // sistemas": o sistema é sempre um — ver `opcoesEscopo`. A CIDADE mantém o
    // "todas", e a assimetria é proposital.
    expect(sistemas.map((s) => s.value)).toEqual(['s01', 's02', 's03'])
    expect(cidades.map((c) => c.value)).toEqual(['', 'c001', 'c002'])

    // E cada opção realmente devolve linha:
    for (const s of sistemas.filter((x) => x.value)) {
      const passa = FLUXO.filter((r) =>
        casaComEscopo(DADOS, aba('sistema-topologia'), r, { cidadeId: '', sistemaId: s.value }),
      )
      expect(passa.length).toBeGreaterThan(0)
    }
  })

  it('o sistema sem cidade declarada só aparece em "Todas as cidades"', () => {
    const opcoes = opcoesEscopo(DADOS, [], aba('sistema-topologia'), FLUXO)
    expect(sistemasVisiveis(opcoes, '').map((s) => s.value)).toContain('s03')
    expect(sistemasVisiveis(opcoes, 'c001').map((s) => s.value)).toEqual(['s01'])
  })

  it('nenhuma opção de sistema é vazia — não existe "todos os sistemas"', () => {
    // A opção existia e não servia: a aba do Fluxo desenha o unifilar de UM
    // sistema, e nas abas de dados "todos" é o modo que monta milhares de linhas
    // e leva segundos para abrir.
    const { sistemas } = opcoesEscopo(DADOS, [], aba('sistema-topologia'), FLUXO)
    expect(sistemas.every((s) => !!s.value)).toBe(true)
  })

  it('recortar por sistema leva a CTS junto do sistema que ela herdou', () => {
    const dentro = FLUXO.filter((r) =>
      casaComEscopo(DADOS, aba('sistema-topologia'), r, { cidadeId: '', sistemaId: 's01' }),
    ).map((r) => r.componente_sistema_id)
    expect(dentro).toEqual(['b001', 'b002', 't001'])
  })

  it('eixo em "" não filtra nada', () => {
    const todas = FLUXO.filter((r) =>
      casaComEscopo(DADOS, aba('sistema-topologia'), r, { cidadeId: '', sistemaId: '' }),
    )
    expect(todas).toHaveLength(FLUXO.length)
  })

  it('a aba do Fluxo abre no primeiro sistema COM destino, não no primeiro da lista', () => {
    // s01 e s02 e s03 estão em ordem alfabética por nome (Alegria, Bonsucesso,
    // Pavuna); s01 é o único com destino escolhido em mais de uma linha.
    expect(sistemaPadraoDoFluxo(DADOS)).toBe('s01')
  })
})

// ---------------------------------------------- a escrita sai com o índice certo

describe('AbaGrid — o recorte não desloca a escrita (tradução de índice)', () => {
  /** Só a cidade c002, que é a linha de índice ORIGINAL 1 das três de METAS. */
  const soC002 = (row: Row) => row.cidade_id === 'c002'

  function montar(onCell = vi.fn(), onDelRow = vi.fn()) {
    render(
      <AbaGrid
        aba={aba('metas-cobertura')}
        rows={METAS}
        cidades={[
          { id: 'c001', name: 'Belford Roxo' },
          { id: 'c002', name: 'Nova Iguaçu' },
        ]}
        dados={{ ...DADOS, 'metas-cobertura': METAS }}
        onCell={onCell}
        onAddRow={vi.fn()}
        onDelRow={onDelRow}
        onCells={vi.fn()}
        filtroEscopo={soC002}
      />,
    )
    return { onCell, onDelRow }
  }

  it('mostra só a linha do recorte, e diz de quantas', () => {
    montar()
    expect(screen.getByText('1 de 3 linhas')).toBeInTheDocument()
    expect(screen.getAllByLabelText('Remover linha')).toHaveLength(1)
  })

  it('remover a linha visível remove a de índice ORIGINAL 1, não a 0', () => {
    const { onDelRow } = montar()
    fireEvent.click(screen.getByLabelText('Remover linha'))
    expect(onDelRow).toHaveBeenCalledWith(1)
  })

  it('editar a célula visível escreve na linha de índice ORIGINAL 1', () => {
    const { onCell } = montar()

    // `cobertura_pct` é a 6ª coluna da aba (índice 5); a linha visível é a 0.
    const celula = document.querySelector<HTMLElement>('[data-celula="0-5"]')
    expect(celula).not.toBeNull()

    // Duplo clique entra em edição — é o que destrava o input (ver
    // `somenteLeitura` em `AbaGridRow`).
    fireEvent.doubleClick(celula!)
    const campo = celula!.querySelector('input')
    expect(campo).not.toBeNull()
    fireEvent.change(campo!, { target: { value: '77' } })

    expect(onCell).toHaveBeenCalledWith(1, 'cobertura_pct', '77')
  })

  it('sem recorte, a linha visível 0 é a original 0 — o controle do teste acima', () => {
    const onCell = vi.fn()
    render(
      <AbaGrid
        aba={aba('metas-cobertura')}
        rows={METAS}
        cidades={[]}
        dados={{ ...DADOS, 'metas-cobertura': METAS }}
        onCell={onCell}
        onAddRow={vi.fn()}
        onDelRow={vi.fn()}
        onCells={vi.fn()}
      />,
    )
    const celula = document.querySelector<HTMLElement>('[data-celula="0-5"]')!
    fireEvent.doubleClick(celula)
    fireEvent.change(celula.querySelector('input')!, { target: { value: '11' } })
    expect(onCell).toHaveBeenCalledWith(0, 'cobertura_pct', '11')
  })
})

// ------------------------------------------------- o elo com o desenho (nível 3)

describe('AbaGrid — o foco da linha sai em índice original', () => {
  it('focar a célula da linha visível avisa o índice ORIGINAL', () => {
    const onFocoLinha = vi.fn()
    render(
      <AbaGrid
        aba={aba('metas-cobertura')}
        rows={METAS}
        cidades={[]}
        dados={{ ...DADOS, 'metas-cobertura': METAS }}
        onCell={vi.fn()}
        onAddRow={vi.fn()}
        onDelRow={vi.fn()}
        onCells={vi.fn()}
        filtroEscopo={(row) => row.cidade_id === 'c002'}
        onFocoLinha={onFocoLinha}
      />,
    )
    // Monta sem foco: o primeiro aviso é `null`.
    expect(onFocoLinha).toHaveBeenLastCalledWith(null)

    fireEvent.mouseDown(document.querySelector('[data-celula="0-4"]')!)
    expect(onFocoLinha).toHaveBeenLastCalledWith(1)
  })
})


// ------------------------------------------------- a fusão das duas abas (nível 3)

describe('a aba de representação foi absorvida pela do Fluxo', () => {
  it('não existe mais aba `fluxo-unifilar` na navegação', () => {
    const chaves = BLOCOS.flatMap((b) => b.abas.map((a) => a.key))
    expect(chaves).not.toContain('fluxo-unifilar')
    expect(chaves).toContain('sistema-topologia')
  })

  it('o bloco 01 passou de três abas para duas', () => {
    expect(BLOCOS[0].abas.map((a) => a.key)).toEqual(['unidade-regional', 'sistema-topologia'])
  })

  it('o bloco 03 chama-se Sub-bacia', () => {
    expect(BLOCOS[2].nome).toBe('Sub-bacia')
  })

  it('toda aba da navegação tem coluna — era o que `semDados` marcava', () => {
    for (const b of BLOCOS) for (const a of b.abas) expect(a.cols.length).toBeGreaterThan(0)
  })
})

describe('Unifilar — o desenho ao lado da tabela', () => {
  it('desenha uma caixa por nó do sistema escolhido', () => {
    render(<Unifilar dados={DADOS} sistemaId="s01" onFocarOrigem={vi.fn()} />)
    // b001 → b002 → e01, mais a CTS t001 que deságua em b002.
    for (const id of ['b001', 'b002', 'e01', 't001']) {
      expect(screen.getByText(new RegExp(`^${id}`))).toBeInTheDocument()
    }
  })

  it('"Todos os sistemas" não desenha, e explica por quê', () => {
    render(<Unifilar dados={DADOS} sistemaId="" onFocarOrigem={vi.fn()} />)
    expect(screen.getByText(/Escolha/)).toBeInTheDocument()
    // Nao `querySelector('svg')`: o icone do estado vazio TAMBEM e um svg.
    // O desenho e o unico com `role=img` (ver o aria-label do Desenho).
    expect(document.querySelector('[role="img"]')).toBeNull()
  })

  it('o destaque é um anel A MAIS, e não troca a cor semântica da caixa', () => {
    const { container: semFoco } = render(
      <Unifilar dados={DADOS} sistemaId="s01" onFocarOrigem={vi.fn()} />,
    )
    const antes = semFoco.querySelectorAll('rect').length
    cleanup()

    const { container: comFoco } = render(
      <Unifilar
        dados={DADOS}
        sistemaId="s01"
        destaque={{ origem: 'b001', destino: 'b002' }}
        onFocarOrigem={vi.fn()}
      />,
    )
    expect(comFoco.querySelectorAll('rect').length).toBe(antes + 1)
  })

  it('clicar numa caixa pede foco para a origem dela', () => {
    const onFocarOrigem = vi.fn()
    render(<Unifilar dados={DADOS} sistemaId="s01" onFocarOrigem={onFocarOrigem} />)
    const caixa = screen.getByText(/^b001/).closest('g')
    fireEvent.click(caixa!)
    expect(onFocarOrigem).toHaveBeenCalledWith('b001')
  })

  it('sem nenhuma linha com sistema, diz que o desenho nasce da tabela', () => {
    render(<Unifilar dados={{}} sistemaId="s01" onFocarOrigem={vi.fn()} />)
    expect(screen.getByText(/Nenhuma linha da tabela tem sistema/)).toBeInTheDocument()
  })
})


// ------------------------------------- o que o cadastro deixa de fato preencher

/**
 * A AUDITORIA DE 20/08/2026, virada teste.
 *
 * O relato foi "estou usando o super admin e mesmo assim não consigo editar vários
 * campos". O papel não era a causa: `super-admin` entrega `admin_holding`, e
 * `podeEditarCampoCadastro` libera tudo para administrador. Quem travava era
 * `celulaEditavel`, pela regra estrutural "coluna `origem: 'db'` ninguém digita" —
 * e ela estava certa em quase toda ocorrência (nome espelhado do código ao lado,
 * dado real que se corrige na fonte, identidade gerada).
 *
 * Em duas ela estava errada, e o teste abaixo é o que impede a volta: coluna que
 * NÃO vem de fonte nenhuma e NÃO é espelho de outra célula, travada, é informação
 * que não existe em lugar nenhum — nem no Databricks, nem no cadastro.
 */
describe('nenhuma aba do cadastro é intocável', () => {
  it('toda aba visível tem pelo menos uma coluna que a unidade preenche', () => {
    for (const b of BLOCOS) {
      for (const a of b.abas) {
        const editaveis = a.cols.filter((c) => c.origem === 'un').map((c) => c.coluna)
        expect(editaveis, `aba "${a.titulo}" (${a.key}) não tem nenhuma coluna 'un'`).not.toHaveLength(0)
      }
    }
  })

  it('o pareamento sub-bacia · CTS deixa escolher os dois lados, e ganhou linha nova', () => {
    const pareamento = aba('subbacia-cts')
    expect(pareamento.addRow).toBe(true)
    const un = pareamento.cols.filter((c) => c.origem === 'un').map((c) => c.coluna)
    expect(un).toEqual(['sub_bacia_id', 'cts_id'])
  })

  it('a ETE deixa informar o nome e o sistema que ela atende', () => {
    const un = aba('ete-capex').cols.filter((c) => c.origem === 'un').map((c) => c.coluna)
    expect(un).toContain('ete_name')
    // `sistema_id` é o vínculo de que `opcoesDestino` e `unifilarDoSistema`
    // dependem; travado, não havia como declará-lo.
    expect(un).toContain('sistema_id')
    // `ete_id` continua travado: é identidade, e o Fluxo aponta para ela.
    expect(aba('ete-capex').cols.find((c) => c.coluna === 'ete_id')?.origem).toBe('db')
  })
})

describe('opcoesDaCelula — as células que escolhem entidade', () => {
  it('o pareamento oferece TODAS as sub-bacias, não só as do fluxo', () => {
    const opcoes = opcoesDaCelula(DADOS, 'subbacia-cts', 'sub_bacia_id', {})
    expect(opcoes?.map(([id]) => id)).toEqual(['b001', 'b002', 'b010', 'b020'])
  })

  it('o pareamento oferece as CTS do cadastro', () => {
    expect(opcoesDaCelula(DADOS, 'subbacia-cts', 'cts_id', {})?.map(([id]) => id)).toEqual(['t001'])
  })

  it('a ETE escolhe o sistema numa lista, com nome no rótulo', () => {
    const opcoes = opcoesDaCelula(DADOS, 'ete-capex', 'sistema_id', {})
    expect(opcoes?.map(([id]) => id)).toEqual(['s01', 's02', 's03'])
    expect(opcoes?.[0][1]).toBe('s01 · Alegria')
  })

  it('célula que não é lista devolve null — que é a maioria', () => {
    expect(opcoesDaCelula(DADOS, 'ete-capex', 'capex_por_modulo', {})).toBeNull()
    expect(opcoesDaCelula(DADOS, 'metas-cobertura', 'cobertura_pct', {})).toBeNull()
  })

  it('escolher um lado do pareamento preenche o nome ao lado', () => {
    expect(espelharColunas(DADOS, 'subbacia-cts', 'sub_bacia_id', 'b010')).toEqual({
      sub_bacia_name: 'Sarapuí',
    })
    expect(espelharColunas(DADOS, 'subbacia-cts', 'cts_id', 't001')).toEqual({
      cts_name: 'CTS Leste',
    })
  })
})
