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
  sistemasVisiveis, barraDeEscopoVisivel, MIN_LINHAS_PARA_ESCOPO,
  cidadesVisiveis, colunasDoEscopo, escopoAtivo } from '../../../domain/escopo'
import { FiltroEscopo } from './FiltroEscopo'
import { ADMIN_UNIDADE } from '../../../auth/papeis'
import { BLOCOS } from '../../../data/cadastroUnidade/blocos'
import { espelharColunas, opcoesDaCelula } from '../../../domain/fluxo'
import { AbaGrid } from './AbaGrid'
import { Unifilar } from './Unifilar'

/**
 * A BARRA DE ESCOPO — e o teste sem o qual ela não pode existir.
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
 *   s03 — sistema SEM CIDADE declarada em `cidade-sistema` (logo sem empresa).
 *         Não é caso de borda inventado: é o do sistema real da amostra, e é a
 *         razão de "Todas as empresas" ser o padrão da barra.
 */
const DADOS: Dados = {
  // O EIXO DA BARRA É A EMPRESA (migração 022: sistema em várias cidades). As
  // duas cidades são de empresas diferentes, para o eixo ter dois valores.
  'cidade-empresa': [
    { cidade_id: 'c001', emp_codigo: '57', empresa: 'Águas do Rio 04', cidade_name: 'Belford Roxo' },
    { cidade_id: 'c002', emp_codigo: '56', empresa: 'Águas do Rio 01', cidade_name: 'Nova Iguaçu' },
  ],
  'empresa': [
    { emp_codigo: '57', empresa: 'Águas do Rio 04' },
    { emp_codigo: '56', empresa: 'Águas do Rio 01' },
  ],
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
    const { empresas, sistemas } = opcoesEscopo(DADOS, aba('sistema-topologia'), FLUXO)

    // Os três sistemas vêm das 5 linhas do fluxo. NÃO há opção "todos os
    // sistemas": o sistema é sempre um — ver `opcoesEscopo`. A EMPRESA mantém o
    // "todas", e a assimetria é proposital. Ordem: pelo NOME (Águas do Rio 01
    // é a 56, Águas do Rio 04 é a 57).
    expect(sistemas.map((s) => s.value)).toEqual(['s01', 's02', 's03'])
    expect(empresas.map((c) => c.value)).toEqual(['', '56', '57'])

    // E cada opção realmente devolve linha:
    for (const s of sistemas.filter((x) => x.value)) {
      const passa = FLUXO.filter((r) =>
        casaComEscopo(DADOS, aba('sistema-topologia'), r, { empresaId: '', sistemaId: s.value }),
      )
      expect(passa.length).toBeGreaterThan(0)
    }
  })

  it('o sistema sem cidade declarada (logo sem empresa) só aparece em "Todas as empresas"', () => {
    const opcoes = opcoesEscopo(DADOS, aba('sistema-topologia'), FLUXO)
    expect(sistemasVisiveis(opcoes, '').map((s) => s.value)).toContain('s03')
    expect(sistemasVisiveis(opcoes, '57').map((s) => s.value)).toEqual(['s01'])
  })

  it('recortar por EMPRESA leva o sistema inteiro, cidade a cidade', () => {
    // s01 passa a estar em DUAS cidades de empresas diferentes. Pela empresa 56
    // ele aparece (c002 é da 56), e todas as linhas dele passam — não só as da
    // cidade c002. Era isso que o recorte por cidade escondia.
    const dados: Dados = {
      ...DADOS,
      'cidade-sistema': [
        ...DADOS['cidade-sistema'],
        { sistema_id: 's01', sistema_name: 'Alegria', cidade_id: 'c002' },
      ],
    }
    const opcoes = opcoesEscopo(dados, aba('sistema-topologia'), FLUXO)
    expect(sistemasVisiveis(opcoes, '56').map((s) => s.value)).toEqual(['s01', 's02'])
    const deS01 = FLUXO.filter((r) =>
      casaComEscopo(dados, aba('sistema-topologia'), r, { empresaId: '56', sistemaId: 's01' }),
    ).map((r) => r.componente_sistema_id)
    expect(deS01).toEqual(['b001', 'b002', 't001'])
  })

  it('nenhuma opção de sistema é vazia — não existe "todos os sistemas"', () => {
    // A opção existia e não servia: a aba do Fluxo desenha o unifilar de UM
    // sistema, e nas abas de dados "todos" é o modo que monta milhares de linhas
    // e leva segundos para abrir.
    const { sistemas } = opcoesEscopo(DADOS, aba('sistema-topologia'), FLUXO)
    expect(sistemas.every((s) => !!s.value)).toBe(true)
  })

  it('recortar por sistema leva a CTS junto do sistema que ela herdou', () => {
    const dentro = FLUXO.filter((r) =>
      casaComEscopo(DADOS, aba('sistema-topologia'), r, { empresaId: '', sistemaId: 's01' }),
    ).map((r) => r.componente_sistema_id)
    expect(dentro).toEqual(['b001', 'b002', 't001'])
  })

  it('eixo em "" não filtra nada', () => {
    const todas = FLUXO.filter((r) =>
      casaComEscopo(DADOS, aba('sistema-topologia'), r, { empresaId: '', sistemaId: '' }),
    )
    expect(todas).toHaveLength(FLUXO.length)
  })

  it('a aba do Fluxo abre no primeiro sistema COM destino, não no primeiro da lista', () => {
    // s01 e s02 e s03 estão em ordem alfabética por nome (Alegria, Bonsucesso,
    // Pavuna); s01 é o único com destino escolhido em mais de uma linha.
    expect(sistemaPadraoDoFluxo(DADOS)).toBe('s01')
  })
})

// ------------------------------------------------ o eixo da cidade, no Município

describe('escopo — a cidade é o eixo fino das abas do Município', () => {
  const metas = aba('metas-cobertura')
  const paridade = aba('fator-esgoto')
  // c002 é da empresa 56 em `cidade-empresa`; as linhas de METAS trazem 57 na
  // coluna, mas o eixo lê o vínculo do cadastro, não a coluna da linha.
  const DADOS_METAS: Dados = { ...DADOS, 'metas-cobertura': METAS }

  it('as duas abas do Município declaram o eixo; as do sistema, não', () => {
    expect(metas.escopo?.cidade).toBe('coluna')
    expect(paridade.escopo?.cidade).toBe('coluna')
    expect(aba('sistema-topologia').escopo?.cidade).toBeUndefined()
    expect(aba('subbacia-operacional').escopo?.cidade).toBeUndefined()
  })

  it('as opções saem das linhas, com "Todas as cidades" primeiro e a empresa de cada uma', () => {
    const { cidades } = opcoesEscopo(DADOS_METAS, metas, METAS)
    expect(cidades.map((c) => c.value)).toEqual(['', 'c001', 'c002'])
    expect(cidades.map((c) => c.label)).toEqual(['Todas as cidades', 'Belford Roxo', 'Nova Iguaçu'])
    expect(cidades.map((c) => c.empresa)).toEqual(['', '57', '56'])
    // aba sem o eixo: lista vazia, e a barra não desenha o controle
    expect(opcoesEscopo(DADOS, aba('sistema-topologia'), FLUXO).cidades).toEqual([])
  })

  it('recortar por cidade deixa só as linhas dela; "" não filtra', () => {
    const deC001 = METAS.filter((r) => casaComEscopo(DADOS_METAS, metas, r, { empresaId: '', sistemaId: '', cidadeId: 'c001' }))
    expect(deC001.map((r) => r.ano)).toEqual(['2030', '2031'])
    const todas = METAS.filter((r) => casaComEscopo(DADOS_METAS, metas, r, { empresaId: '', sistemaId: '', cidadeId: '' }))
    expect(todas).toHaveLength(METAS.length)
    expect(escopoAtivo({ empresaId: '', sistemaId: '', cidadeId: 'c001' })).toBe(true)
  })

  it('a empresa escolhida encolhe a lista de cidades, e "todas" fica', () => {
    const opcoes = opcoesEscopo(DADOS_METAS, metas, METAS)
    expect(cidadesVisiveis(opcoes, '56').map((c) => c.value)).toEqual(['', 'c002'])
    expect(cidadesVisiveis(opcoes, '').map((c) => c.value)).toEqual(['', 'c001', 'c002'])
  })

  it('a barra governa as colunas da cidade: o funil do cabeçalho sai delas', () => {
    expect(colunasDoEscopo(metas)).toEqual(new Set(['cidade_id', 'cidade_name']))
  })

  it('trocar de empresa devolve a cidade que não é dela para "todas"', () => {
    const opcoes = opcoesEscopo(DADOS_METAS, metas, METAS)
    const onEscopo = vi.fn()
    render(
      <FiltroEscopo opcoes={opcoes} escopo={{ empresaId: '', sistemaId: '', cidadeId: 'c002' }} onEscopo={onEscopo} />,
    )
    // c002 é da 56; escolher a 57 não pode manter uma cidade que a lista da 57 não oferece.
    // O primeiro combobox da barra é o da empresa (o de sistema não aparece: a aba não o tem).
    fireEvent.click(screen.getAllByRole('button', { expanded: false })[0])
    fireEvent.click(screen.getByRole('option', { name: /Águas do Rio 04/ }))
    expect(onEscopo).toHaveBeenLastCalledWith({ empresaId: '57', sistemaId: '', cidadeId: '' })
    cleanup()
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

  it('o fluxo de escoamento vive no bloco do SISTEMA', () => {
    // Escrito pelo SIGNIFICADO, e não por índice de bloco: prender `BLOCOS[0]` e
    // `BLOCOS[2]` amarra o teste à ordem, que é incidental, e não ao invariante.
    //
    // A topologia é a MALHA DO SISTEMA: é chaveada por `sistema_id` e descreve
    // como os componentes daquele sistema se ligam até a ETE. Desenha as
    // sub-bacias, mas quem ela descreve é o sistema — e é aí que se procura por
    // ela.
    const bloco = BLOCOS.find((b) => b.abas.some((a) => a.key === 'sistema-topologia'))
    expect(bloco?.nome).toBe('Sistema')
  })

  it('toda aba da navegação tem coluna', () => {
    for (const b of BLOCOS) for (const a of b.abas) expect(a.cols.length).toBeGreaterThan(0)
  })
})

/**
 * O CADASTRO DESCE A HIERARQUIA, E NUNCA SOBE.
 *
 * A ordem das abas é pela HIERARQUIA, e não por assunto ("Operação", "Metas e
 * fatores"): assunto não coincide com hierarquia, e uma sequência por assunto
 * sobe e desce de nível, obrigando quem preenche a voltar a um nível que já
 * tinha deixado para trás. Cada aba desce um nível ou fica no mesmo.
 *
 * Este teste é a trava. Uma aba nova posta no lugar errado do `SCHEMA` falha
 * aqui, com o nome dela e o nível de onde ela regrediu — e não numa revisão de
 * tela seis meses depois.
 */
describe('a sequência do cadastro desce a hierarquia', () => {
  /** O nível de cada aba visível, do topo da organização até o coletor. */
  const NIVEL: Record<string, number> = {
    'unidade-regional': 1,
    empresa: 2,
    'cidade-operacional': 3,
    'metas-cobertura': 3,
    'fator-esgoto': 3,
    'ete-capex': 4,
    // A topologia é do sistema, e não da sub-bacia: ela descreve a malha de um
    // `sistema_id`. Por isso 4, e por isso ela fecha o bloco do Sistema.
    'sistema-topologia': 4,
    'subbacia-operacional': 5,
    'componentes-subbacias-capex': 5,
    'cts-operacional': 6,
    'componentes-cts-capex': 6,
  }

  it('nenhuma aba volta a um nível já preenchido', () => {
    const ordem = BLOCOS.flatMap((b) => b.abas.map((a) => a.key))
    const regressoes: string[] = []
    let maximo = 0
    for (const chave of ordem) {
      const n = NIVEL[chave]
      expect(n, `aba \`${chave}\` sem nível declarado neste teste`).toBeDefined()
      if (n < maximo) regressoes.push(`${chave} (nível ${n}, depois de ${maximo})`)
      maximo = Math.max(maximo, n)
    }
    expect(regressoes).toEqual([])
  })

  it('os cinco blocos são os níveis, na ordem', () => {
    expect(BLOCOS.map((b) => b.nome)).toEqual([
      'Organização',
      'Município',
      'Sistema',
      'Sub-bacia',
      'Coletor de tempo seco (CTS)',
    ])
  })

  it('a aba de Empresas é navegável — é onde o fim da concessão se informa', () => {
    // Ela era `ocultaNoWizard` de quando a superintendência era um nível de
    // reserva. Voltar a ocultá-la deixaria a concessão sem lugar de entrada.
    const chaves = BLOCOS.flatMap((b) => b.abas.map((a) => a.key))
    expect(chaves).toContain('empresa')
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
 * O QUE O CADASTRO DEIXA DE FATO PREENCHER — a auditoria, virada teste.
 *
 * O sintoma que ela pega é "sou administrador e mesmo assim não consigo editar
 * vários campos". O papel não é a causa: `podeEditarCampoCadastro` libera tudo
 * para administrador. Quem trava é `celulaEditavel`, pela regra estrutural
 * "coluna `origem: 'db'` ninguém digita" —
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

describe('quando a barra de escopo aparece', () => {
  it('uma aba comum espera o mínimo de linhas', () => {
    const sub = aba('subbacia-operacional')
    expect(barraDeEscopoVisivel(sub, MIN_LINHAS_PARA_ESCOPO - 1)).toBe(false)
    expect(barraDeEscopoVisivel(sub, MIN_LINHAS_PARA_ESCOPO)).toBe(true)
  })

  it('as abas da CTS e a do Fluxo não esperam: com a macrorregião marcada há UMA CTS por sistema', () => {
    // Dois testes de abertura reescreviam a regra dos 15 à mão, e passavam
    // mesmo se as abas da CTS perdessem a barra. Este prende a exceção.
    for (const k of ['sistema-topologia', 'cts-operacional', 'componentes-cts-capex']) {
      expect(barraDeEscopoVisivel(aba(k), 2)).toBe(true)
    }
  })

  it('aba sem eixo declarado nunca tem barra, por mais linhas que tenha', () => {
    expect(barraDeEscopoVisivel(aba('unidade-regional'), 1000)).toBe(false)
  })
})
