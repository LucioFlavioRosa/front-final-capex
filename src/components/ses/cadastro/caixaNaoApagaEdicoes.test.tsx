/**
 * A CAIXA DA MACRORREGIÃO NÃO APAGA O QUE FOI DIGITADO E AINDA NÃO SALVO.
 *
 * `gravarUsaCts` grava na hora e relê o cadastro — e a primeira versão hidratava
 * o cadastro INTEIRO com o retrato do servidor, como o Salvar faz. Só que no
 * Salvar o servidor tem tudo que a tela tinha; no clique da caixa não: a pessoa
 * pode ter digitado em outra aba e ainda não salvo, e a rehidratação apagava
 * isso sem aviso. Apontado pela revisão do Codex.
 *
 * O que a caixa muda é só o que o servidor recalcula a partir dela — a lista de
 * disponíveis do Fluxo e as fichas de CTS. `HIDRATAR_ABAS` traz só essas; o
 * resto fica como a pessoa deixou.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { servidor } from '@/testes/servidor'
import { CadastroProvider, useCadastro } from './CadastroContext'

vi.mock('@/auth/AuthContext', () => ({
  useAuth: () => ({ usuario: { nome: 'dev', email: 'dev@local', papel: 'admin' }, token: 't' }),
}))

beforeAll(() => servidor.listen({ onUnhandledRequest: 'bypass' }))
afterEach(() => servidor.resetHandlers())
afterAll(() => servidor.close())

const UNIDADE = 'u1'

function servidorCom(usaCts: 'true' | 'false', semSistema: { id: string }[]) {
  servidor.use(
    http.get('/api/unidades/:id/hierarquia', () =>
      HttpResponse.json({
        unidReg: { rid: 'R', rnome: 'R', did: '', dnome: '', uid: UNIDADE, unome: 'U', waccMedio: '8', usaCts },
        empresas: [{ id: 'e1', nome: 'Empresa 1', fimConcessao: '2040' }],
        cidades: [{ id: 'c1', nome: 'Cidade 1', empId: 'e1' }],
        sistemas: [],
        topo: [],
        semSistema: semSistema.map((s) => ({ ...s, nome: s.id, tipo: 'cts', cidId: 'c1', empId: 'e1' })),
      }),
    ),
    http.get('/api/unidades/:id/contrato', () =>
      HttpResponse.json({ cidades: [{ id: 'c1', nome: 'Cidade 1', empId: 'e1', empNome: 'Empresa 1', fim: '2040' }], metas: [], fator: [] }),
    ),
    http.get('/api/unidades/:id/sub-bacias', () => HttpResponse.json({ subs: {} })),
    http.get('/api/unidades/:id/etes', () => HttpResponse.json({ etes: [] })),
    http.get('/api/unidades/:id/cts', () => HttpResponse.json({ ctss: {} })),
    http.put('/api/unidades/:id', () => HttpResponse.json({ id: UNIDADE, alteracoesGravadas: 1 })),
  )
}

function Sonda() {
  const { selecionarUnidade, setCell, gravarUsaCts, state } = useCadastro()
  const fim = state.unidade?.data['empresa']?.[0]?.data_fim_concessao ?? ''
  const soltas = (state.unidade?.data['sistema-topologia'] ?? []).filter((r) => !r.sistema_id).length
  const caixa = state.unidade?.data['unidade-regional']?.[0]?.usa_macrorregiao_cts ?? ''
  return (
    <div>
      <button onClick={() => selecionarUnidade(UNIDADE, 'U', 'R')}>escolher</button>
      <button onClick={() => setCell('empresa', 0, 'data_fim_concessao', '2050')}>digitar</button>
      <button onClick={() => void gravarUsaCts(true)}>marcar</button>
      <span data-testid="fim">{fim}</span>
      <span data-testid="soltas">{soltas}</span>
      <span data-testid="caixa">{caixa}</span>
    </div>
  )
}

describe('marcar a caixa', () => {
  it('refaz a lista do Fluxo e a caixa, mas preserva o que foi digitado noutra aba', async () => {
    // Antes: desmarcada, 7 coletores soltos.
    servidorCom('false', [{ id: 'cts_1' }, { id: 'cts_2' }, { id: 'cts_3' }, { id: 'cts_4' }, { id: 'cts_5' }, { id: 'cts_6' }, { id: 'cts_7' }])
    render(
      <CadastroProvider>
        <Sonda />
      </CadastroProvider>,
    )
    await userEvent.click(screen.getByText('escolher'))
    await waitFor(() => expect(screen.getByTestId('soltas')).toHaveTextContent('7'))
    expect(screen.getByTestId('fim')).toHaveTextContent('2040')

    // A pessoa digita na aba de empresas e NÃO salva.
    await userEvent.click(screen.getByText('digitar'))
    expect(screen.getByTestId('fim')).toHaveTextContent('2050')

    // Depois: o servidor passa a responder marcada, com UMA macrorregião.
    servidorCom('true', [{ id: 'MACRO_A' }])
    await userEvent.click(screen.getByText('marcar'))

    // A lista do Fluxo e a caixa refletem o servidor…
    await waitFor(() => expect(screen.getByTestId('soltas')).toHaveTextContent('1'))
    expect(screen.getByTestId('caixa')).toHaveTextContent('Sim')
    // …e o que foi digitado continua lá. Com `HIDRATAR` inteiro, voltaria a 2040.
    expect(screen.getByTestId('fim')).toHaveTextContent('2050')
  })
})
