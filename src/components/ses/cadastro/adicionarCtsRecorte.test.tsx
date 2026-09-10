/**
 * A CTS OFERECIDA TEM DE SER DA CIDADE DO SISTEMA.
 *
 * O seletor oferecia TODAS as CTS livres da base — e o código dizia, em
 * comentário, que não poderia ser diferente: *"CTS fora de sistema não tem
 * cidade, nem empresa, nem unidade"*. A premissa era falsa. A fonte sempre soube
 * onde cada CTS está (o extrato de portfólio traz CIDADE e CTS na mesma linha);
 * quem tinha perdido o dado era o esquema, e a migração 018 o devolveu.
 *
 * O QUE ISSO CUSTAVA, medido na base: 151 CTS livres, TODAS de uma unidade só,
 * oferecidas às cinco. E duas CTS (`cts_001`, `cts_002`) efetivamente colocadas
 * num sistema de outra cidade — o erro que este recorte impede.
 *
 * Como a cidade determina empresa, unidade, diretoria e regional, recortar por
 * ela recorta pelos cinco níveis de uma vez.
 *
 * O SEGUNDO TESTE é o que evita trocar um defeito por outro: `cidade_id` é
 * nulável, e um filtro que só olhasse a igualdade esconderia a CTS sem cidade —
 * que existe no banco e ficaria sem forma nenhuma de ser colocada. Ela aparece,
 * separada e rotulada.
 */
import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { AdicionarCts } from './AdicionarCts'
import type { Row } from '../../../data/cadastroUnidade/types'

const cts = (id: string, cidade: string, macro = 'false'): Row => ({
  sistema_id: '',
  componente_sistema_id: id,
  componente_sistema_nome: `CTS ${id}`,
  componente_tipo: 'cts',
  cidade_id: cidade,
  macro,
})

/** As três livres: uma na cidade do sistema, uma noutra, uma sem cidade. */
const TOPO: Row[] = [cts('daqui', 'c1'), cts('de-fora', 'c2'), cts('sem-lugar', '')]

/** `ehCts` cai em `componente_tipo` quando o id não tem ficha — é o caso aqui. */
const DADOS = { 'cts-operacional': [] } as never

function abrir() {
  return render(
    <AdicionarCts
      sistemaId="s1"
      sistemaNome="Sistema 1"
      cidadeDoSistema="c1"
      cidadeNome="Belford Roxo"
      topo={TOPO}
      dados={DADOS}
      limitada={false}
      onAdicionar={vi.fn()}
    />,
  )
}

describe('o seletor de CTS é recortado pela cidade do sistema', () => {
  it('oferece a CTS da cidade e NÃO a de outra cidade', () => {
    abrir()

    const opcoes = within(screen.getByRole('combobox'))
    expect(opcoes.getByRole('option', { name: 'CTS daqui' })).toBeInTheDocument()
    expect(opcoes.queryByRole('option', { name: 'CTS de-fora' })).not.toBeInTheDocument()

    // E DIZ DE QUE CIDADE A LISTA É: um recorte sem rótulo é uma lista curta sem
    // explicação, e quem não achar a CTS que procura não sabe por quê.
    expect(screen.getByRole('option', { name: /livres em Belford Roxo/ })).toBeInTheDocument()
  })

  it('a CTS sem cidade continua ofertada, num grupo à parte', () => {
    abrir()

    const grupo = screen.getByRole('group', { name: 'Sem cidade cadastrada' })
    expect(within(grupo).getByRole('option', { name: 'CTS sem-lugar' })).toBeInTheDocument()

    // Fora do grupo, e não solta no meio das da cidade: misturada, a lista
    // voltaria a afirmar um lugar que ela não sabe.
    expect(within(grupo).queryByRole('option', { name: 'CTS daqui' })).not.toBeInTheDocument()
  })

  it('sistema sem cidade não duplica a lista nem promete um recorte', () => {
    // `cidadeDoSistema` vazio casava com as CTS de cidade vazia por igualdade
    // (`'' === ''`), e elas entravam NAS DUAS listas: as mesmas opções duas
    // vezes, com a mesma `key`, e o contador dizendo o dobro. O recorte sumia
    // justamente quando não havia por onde recortar.
    render(
      <AdicionarCts
        sistemaId="s1"
        sistemaNome="Sistema 1"
        cidadeDoSistema=""
        cidadeNome="—"
        topo={TOPO}
        dados={DADOS}
        limitada={false}
        onAdicionar={vi.fn()}
      />,
    )

    // A CTS sem lugar aparece UMA vez só.
    expect(screen.getAllByRole('option', { name: 'CTS sem-lugar' })).toHaveLength(1)
    // E a tela não promete um município que não tem.
    expect(screen.getByRole('option', { name: /sem cidade cadastrada/ })).toBeInTheDocument()
    expect(screen.getByText(/não é recortada por município/)).toBeInTheDocument()
  })

  it('sem nenhuma CTS na cidade, o seletor diz qual cidade está vazia', () => {
    render(
      <AdicionarCts
        sistemaId="s1"
        sistemaNome="Sistema 1"
        cidadeDoSistema="c9"
        cidadeNome="Mesquita"
        topo={[cts('de-fora', 'c2')]}
        dados={DADOS}
        limitada={false}
        onAdicionar={vi.fn()}
      />,
    )

    expect(screen.getByRole('combobox')).toBeDisabled()
    expect(screen.getByRole('option', { name: 'Nenhuma CTS livre em Mesquita' })).toBeInTheDocument()
  })
})

/**
 * A MACRORREGIÃO É A EXCEÇÃO DO RECORTE, e é o único caso.
 *
 * O recorte acima protege quem coloca um COLETOR. Uma macrorregião atende à
 * REGIÃO e pode cruzar município por definição — ela reporta a cidade de mais
 * ligações, e só. Recortada como coletor, sumia de todos os sistemas das outras
 * cidades que atende: medido na base de 03/09/2026, `MACRO_A` abrange `d1c1`,
 * `d1c5` e `d1c13`, reporta `d1c1`, e ficava invisível nos 20 sistemas que a
 * unidade tem nas outras duas — enquanto o servidor a aceitava sem reclamar.
 */
describe('a macrorregião não é recortada por município', () => {
  const MACRO = cts('MACRO_A', 'c1', 'true')

  it('é oferecida num sistema de OUTRA cidade', () => {
    render(
      <AdicionarCts
        sistemaId="s9"
        sistemaNome="Sistema 9"
        cidadeDoSistema="c5"
        cidadeNome="Nova Iguaçu"
        topo={[MACRO, cts('de-fora', 'c2')]}
        dados={DADOS}
        limitada={false}
        onAdicionar={vi.fn()}
      />,
    )

    const opcoes = within(screen.getByRole('combobox'))
    expect(opcoes.getByRole('option', { name: 'CTS MACRO_A' })).toBeInTheDocument()
    // O coletor comum de outra cidade continua fora — a exceção é só dela.
    expect(opcoes.queryByRole('option', { name: 'CTS de-fora' })).not.toBeInTheDocument()
  })

  it('aparece UMA vez só, e não também no grupo das sem cidade', () => {
    // Uma macrorregião sem cidade dominante (grupo cujos membros não têm cidade)
    // cairia nas duas listas se a exclusão do segundo filtro faltasse: as mesmas
    // opções duas vezes, com a mesma `key`.
    render(
      <AdicionarCts
        sistemaId="s9"
        sistemaNome="Sistema 9"
        cidadeDoSistema="c5"
        cidadeNome="Nova Iguaçu"
        topo={[cts('MACRO_B', '', 'true')]}
        dados={DADOS}
        limitada={false}
        onAdicionar={vi.fn()}
      />,
    )

    expect(screen.getAllByRole('option', { name: 'CTS MACRO_B' })).toHaveLength(1)
  })

  it('num sistema SEM cidade, ainda é oferecida', () => {
    render(
      <AdicionarCts
        sistemaId="s9"
        sistemaNome="Sistema 9"
        cidadeDoSistema=""
        cidadeNome="—"
        topo={[MACRO, cts('sem-lugar', '')]}
        dados={DADOS}
        limitada={false}
        onAdicionar={vi.fn()}
      />,
    )

    expect(screen.getByRole('option', { name: 'CTS MACRO_A' })).toBeInTheDocument()
  })
})
