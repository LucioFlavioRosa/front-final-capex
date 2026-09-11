/**
 * O SELETOR DE CTS É RECORTADO PELA EMPRESA DO SISTEMA.
 *
 * Já foi pela cidade, e a história está no cabeçalho de `AdicionarCts`. Em
 * resumo: sem recorte a lista oferecia a base inteira (151 candidatas, duas
 * efetivamente colocadas em sistema de outra cidade); por cidade ela escondia
 * quem cabe, porque um sistema pode estar em mais de um município (migração 022)
 * — um coletor de Mesquita pertence ao Sarapuí tanto quanto um de Belford Roxo.
 *
 * A empresa é a régua que sobrevive: sub-bacia, coletor e macrorregião carregam
 * `emp_codigo`, e é a mesma chave que agrupa a macrorregião. E é um CONJUNTO,
 * porque um sistema pode estar em cidades de empresas diferentes.
 */
import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { AdicionarCts } from './AdicionarCts'
import type { Row } from '../../../data/cadastroUnidade/types'

const cts = (id: string, empresa: string, macro = 'false'): Row => ({
  sistema_id: '',
  componente_sistema_id: id,
  componente_sistema_nome: `CTS ${id}`,
  componente_tipo: 'cts',
  emp_codigo: empresa,
  macro,
})

/** `ehCts` cai em `componente_tipo` quando o id não tem ficha — é o caso aqui. */
const DADOS = { 'cts-operacional': [] } as never

function abrir(topo: Row[], empresas: string[], nome = 'Empresa 1') {
  return render(
    <AdicionarCts
      sistemaId="s1"
      sistemaNome="Sistema 1"
      empresasDoSistema={new Set(empresas)}
      empresasNome={nome}
      topo={topo}
      dados={DADOS}
      limitada={false}
      onAdicionar={vi.fn()}
    />,
  )
}

describe('o seletor de CTS é recortado pela empresa do sistema', () => {
  const TOPO: Row[] = [cts('daqui', 'e1'), cts('de-fora', 'e2'), cts('sem-dono', '')]

  it('oferece a CTS da empresa e NÃO a de outra empresa', () => {
    abrir(TOPO, ['e1'])
    const opcoes = within(screen.getByRole('combobox'))
    expect(opcoes.getByRole('option', { name: 'CTS daqui' })).toBeInTheDocument()
    expect(opcoes.queryByRole('option', { name: 'CTS de-fora' })).not.toBeInTheDocument()
    // E DIZ DE QUE EMPRESA A LISTA É: um recorte sem rótulo é uma lista curta sem
    // explicação, e quem não achar a CTS que procura não sabe por quê.
    expect(screen.getByRole('option', { name: /livres? de Empresa 1/ })).toBeInTheDocument()
  })

  it('um sistema em cidades de DUAS empresas oferece as CTS das duas', () => {
    // Saracuruna: Duque de Caxias é a 57, Magé é a 56. O recorte é um conjunto.
    abrir(TOPO, ['e1', 'e2'], 'Empresa 1 e Empresa 2')
    const opcoes = within(screen.getByRole('combobox'))
    expect(opcoes.getByRole('option', { name: 'CTS daqui' })).toBeInTheDocument()
    expect(opcoes.getByRole('option', { name: 'CTS de-fora' })).toBeInTheDocument()
  })

  it('a CTS sem empresa continua ofertada, num grupo à parte', () => {
    abrir(TOPO, ['e1'])
    const grupo = screen.getByRole('group', { name: 'Sem empresa cadastrada' })
    expect(within(grupo).getByRole('option', { name: 'CTS sem-dono' })).toBeInTheDocument()
    // Fora do grupo, e não solta no meio das da empresa: misturada, a lista
    // voltaria a afirmar um dono que ela não sabe.
    expect(within(grupo).queryByRole('option', { name: 'CTS daqui' })).not.toBeInTheDocument()
  })

  it('sistema sem cidade (logo sem empresa) não duplica a lista nem promete recorte', () => {
    abrir(TOPO, [])
    // A CTS sem dono aparece UMA vez só.
    expect(screen.getAllByRole('option', { name: 'CTS sem-dono' })).toHaveLength(1)
    // E as das empresas não aparecem — não há como saber se cabem.
    expect(screen.queryByRole('option', { name: 'CTS daqui' })).not.toBeInTheDocument()
    expect(screen.getByRole('option', { name: /sem empresa cadastrada/ })).toBeInTheDocument()
    expect(screen.getByText(/não é recortada/)).toBeInTheDocument()
  })

  it('sem nenhuma CTS da empresa, o seletor diz qual empresa está vazia', () => {
    abrir([cts('de-fora', 'e2')], ['e9'], 'Empresa 9')
    expect(screen.getByRole('combobox')).toBeDisabled()
    expect(screen.getByRole('option', { name: 'Nenhuma CTS livre de Empresa 9' })).toBeInTheDocument()
  })
})

describe('a macrorregião segue a mesma régua', () => {
  const MACRO = cts('MACRO_A', 'e1', 'true')

  it('é oferecida num sistema da empresa dela', () => {
    abrir([MACRO, cts('de-fora', 'e2')], ['e1'])
    const opcoes = within(screen.getByRole('combobox'))
    expect(opcoes.getByRole('option', { name: 'CTS MACRO_A' })).toBeInTheDocument()
    expect(opcoes.queryByRole('option', { name: 'CTS de-fora' })).not.toBeInTheDocument()
  })

  it('NÃO é oferecida num sistema de outra empresa', () => {
    abrir([MACRO], ['e2'])
    expect(screen.queryByRole('option', { name: 'CTS MACRO_A' })).not.toBeInTheDocument()
  })

  it('o rótulo diz "macrorregiões" quando é isso que a lista tem', () => {
    abrir([MACRO], ['e1'])
    expect(screen.getByText(/Só aparecem macrorregiões de/)).toBeInTheDocument()
  })
})
