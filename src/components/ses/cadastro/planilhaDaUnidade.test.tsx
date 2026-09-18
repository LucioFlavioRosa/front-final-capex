/**
 * O CARTÃO "PREENCHER POR PLANILHA".
 *
 * O contrato do componente: o texto diz o regime que a caixa acima decidiu;
 * baixar chama o gerador com a unidade DA TELA; importar lê o arquivo, mescla e
 * entrega o resultado a quem chama — sem gravar — e deixa os avisos à vista.
 * Ler e escrever `.xlsx` de verdade é assunto de `lib/planilhaCadastro.test`.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, screen, waitFor } from '@testing-library/react'
import { renderizar } from '@/testes/render'
import { unidadeDeTeste } from '@/testes/cadastroDePlanilha'
import { PlanilhaDaUnidade } from './PlanilhaDaUnidade'
import * as arquivo from '@/lib/planilhaCadastro'
import type { PlanilhaLida } from '@/domain/planilha'

vi.mock('@/lib/planilhaCadastro', () => ({
  baixarPlanilha: vi.fn(async () => 'Cadastro_uT1_2026-09-17.xlsx'),
  lerPlanilha: vi.fn(async (): Promise<PlanilhaLida> => ({})),
}))

const baixar = vi.mocked(arquivo.baixarPlanilha)
const ler = vi.mocked(arquivo.lerPlanilha)

/** Sobe um arquivo pelo input escondido. O conteúdo não importa: `lerPlanilha` é o mock. */
function subir() {
  const input = screen.getByTestId('arquivo-da-planilha') as HTMLInputElement
  const f = new File(['x'], 'cadastro.xlsx')
  Object.defineProperty(f, 'arrayBuffer', { value: async () => new ArrayBuffer(1) })
  fireEvent.change(input, { target: { files: [f] } })
}

beforeEach(() => {
  baixar.mockClear()
  ler.mockClear()
})

describe('o cartão da planilha', () => {
  it('diz o regime que a caixa decidiu', () => {
    const { unmount } = renderizar(<PlanilhaDaUnidade unidade={unidadeDeTeste(true)} onImportado={vi.fn()} />)
    expect(screen.getByText(/regime de macrorregião de CTS/)).toBeInTheDocument()
    expect(screen.getByText(/cada macrorregião tem uma ficha/)).toBeInTheDocument()
    unmount()
    renderizar(<PlanilhaDaUnidade unidade={unidadeDeTeste(false)} onImportado={vi.fn()} />)
    expect(screen.getByText(/regime de microrregião de CTS/)).toBeInTheDocument()
    expect(screen.getByText(/cada coletor tem a própria ficha de obras/)).toBeInTheDocument()
  })

  it('baixar gera a planilha da unidade que está na tela', async () => {
    const unidade = unidadeDeTeste()
    renderizar(<PlanilhaDaUnidade unidade={unidade} onImportado={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /Baixar planilha preenchida/ }))
    await waitFor(() => expect(baixar).toHaveBeenCalledWith(unidade))
  })

  it('importar mescla e entrega só as abas que mudaram, sem gravar', async () => {
    ler.mockResolvedValueOnce({
      Unidade: { colunas: ['unidade_id'], linhas: [{ unidade_id: 'uT1' }] },
      'Sub-bacias': { colunas: ['sub_bacia_id', 'preco_por_ligacao'], linhas: [{ sub_bacia_id: 'b1', preco_por_ligacao: 2000 }] },
    })
    const onImportado = vi.fn()
    renderizar(<PlanilhaDaUnidade unidade={unidadeDeTeste()} onImportado={onImportado} />)
    subir()
    await waitFor(() => expect(onImportado).toHaveBeenCalledTimes(1))
    const r = onImportado.mock.calls[0][0]
    expect(Object.keys(r.dados)).toEqual(['subbacia-operacional'])
    expect(r.dados['subbacia-operacional'][0].preco_por_ligacao).toBe('2.000')
    expect(screen.getByRole('status')).toHaveTextContent('1 valor alterado em 1 aba — revise e clique em Salvar.')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('o que ficou de fora fica listado no cartão, e não some', async () => {
    ler.mockResolvedValueOnce({
      Unidade: { colunas: ['unidade_id'], linhas: [{ unidade_id: 'uT1' }] },
      'Sub-bacias': { colunas: ['sub_bacia_id', 'preco_por_ligacao'], linhas: [{ sub_bacia_id: 'b99', preco_por_ligacao: 1 }] },
      Rascunho: { colunas: ['a'], linhas: [{ a: 1 }] },
    })
    const onImportado = vi.fn()
    renderizar(<PlanilhaDaUnidade unidade={unidadeDeTeste()} onImportado={onImportado} />)
    subir()
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(onImportado).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('2 avisos')
    expect(screen.getByRole('alert')).toHaveTextContent(/"b99" não existe no cadastro/)
    expect(screen.getByRole('alert')).toHaveTextContent(/"Rascunho" não é uma aba do cadastro/)
    expect(screen.getByRole('status')).toHaveTextContent(/Nada mudou/)
  })

  it('planilha de outra unidade: nada entra, e o aviso diz de qual é', async () => {
    ler.mockResolvedValueOnce({
      Unidade: { colunas: ['unidade_id'], linhas: [{ unidade_id: 'uB2' }] },
      'Sub-bacias': { colunas: ['sub_bacia_id', 'preco_por_ligacao'], linhas: [{ sub_bacia_id: 'b1', preco_por_ligacao: 1 }] },
    })
    const onImportado = vi.fn()
    renderizar(<PlanilhaDaUnidade unidade={unidadeDeTeste()} onImportado={onImportado} />)
    subir()
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    expect(onImportado).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('Esta planilha é da unidade uB2, e a tela está em uT1. Nada foi importado.')
  })

  it('arquivo que não abre vira aviso, e o cartão continua utilizável', async () => {
    ler.mockRejectedValueOnce(new Error('zip inválido'))
    renderizar(<PlanilhaDaUnidade unidade={unidadeDeTeste()} onImportado={vi.fn()} />)
    subir()
    await waitFor(() => expect(screen.getByText(/Não foi possível ler a planilha: zip inválido/)).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /Importar planilha preenchida/ })).toBeEnabled()
  })
})
