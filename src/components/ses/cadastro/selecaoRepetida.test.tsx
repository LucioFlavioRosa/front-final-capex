/**
 * CLICAR NA UNIDADE QUE JÁ ESTÁ ESCOLHIDA NÃO PODE APAGAR O CADASTRO.
 *
 * Era o que acontecia, e o defeito atingia em cheio a PRIMEIRA unidade de cada
 * regional — justamente a que a tela auto-escolhe e destaca, ou seja, a que a
 * pessoa clica.
 *
 *   1. escolher a regional → a lista chega → a tela auto-escolhe a primeira
 *   2. o efeito de carga lê o cadastro e hidrata
 *   3. a pessoa clica na unidade que queria (a mesma) → `SELECT_UNIDADE`
 *      recriava `unidade` com `data` vazio
 *   4. o efeito depende de `unidadeId`, que não mudou → não roda de novo
 *
 * O cadastro sumia em silêncio, e a tela ainda exibia "100% · 0 de 0 campos
 * obrigatórios" — 0 de 0 dá 100%, então o vazio se anunciava como completo.
 *
 * QUEM GANHAVA A CORRIDA DECIDIA, e o rápido perdia: a unidade que responde em
 * ~218ms hidratava antes do segundo clique e era apagada em 6 de 6 tentativas; a
 * mais lenta chegava depois e sobrevivia. É por isso que uma suíte inteira verde
 * convivia com a maior unidade da base não abrindo.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { http, HttpResponse } from 'msw'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { servidor } from '@/testes/servidor'
import { CadastroProvider, useCadastro } from './CadastroContext'

vi.mock('@/auth/AuthContext', () => ({
  useAuth: () => ({ user: { name: 'Teste', papeis: ['admin_holding'] } }),
}))

beforeAll(() => servidor.listen({ onUnhandledRequest: 'bypass' }))
afterEach(() => servidor.resetHandlers())
afterAll(() => servidor.close())

const UNIDADE = '56'

/** Uma leitura com UMA sub-bacia: o suficiente para "sumiu" ser detectável. */
beforeEach(() => {
  servidor.use(
    http.get('/api/unidades/:id/hierarquia', () =>
      HttpResponse.json({
        unidReg: { rid: 'R4', rnome: 'Regional 4', did: '', dnome: '', uid: UNIDADE, unome: 'Unidade', waccMedio: '8', usaCts: 'false' },
        empresas: [],
        cidades: [],
        sistemas: [],
        topo: [],
        semSistema: [],
      }),
    ),
    http.get('/api/unidades/:id/contrato', () =>
      HttpResponse.json({ cidades: [], metas: [], fator: [] }),
    ),
    http.get('/api/unidades/:id/sub-bacias', () =>
      HttpResponse.json({ subs: { b1: { nome: 'Sub-bacia 1', db: {}, params: {}, obras: [] } } }),
    ),
    http.get('/api/unidades/:id/etes', () => HttpResponse.json({ etes: [] })),
    http.get('/api/unidades/:id/cts', () => HttpResponse.json({ ctss: {} })),
  )
})

function Sonda() {
  const { selecionarUnidade, state } = useCadastro()
  const linhas = state.unidade?.data['subbacia-operacional']?.length ?? -1
  return (
    <div>
      <button onClick={() => selecionarUnidade(UNIDADE, 'Unidade', 'R4')}>escolher</button>
      <span data-testid="linhas">{linhas}</span>
    </div>
  )
}

describe('escolher a mesma unidade duas vezes', () => {
  it('não apaga o cadastro que já tinha sido lido', async () => {
    render(
      <CadastroProvider>
        <Sonda />
      </CadastroProvider>,
    )

    // 1ª escolha (o equivalente à auto-seleção) e a leitura que ela dispara.
    await userEvent.click(screen.getByText('escolher'))
    // `toHaveTextContent` casa por SUBSTRING, e o estado apagado renderiza
    // `-1` — que contém '1'. A comparação aqui é exata de propósito: com a
    // frouxa, este teste passava com o defeito no lugar.
    await waitFor(() => expect(screen.getByTestId('linhas').textContent).toBe('1'))

    // 2ª escolha: o clique da pessoa na unidade em destaque.
    await userEvent.click(screen.getByText('escolher'))

    // O `waitFor` acima já provou que hidratou; aqui o que se afirma é que
    // CONTINUA hidratado. Sem a guarda de idempotência isto vira '0'.
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.getByTestId('linhas').textContent).toBe('1')
  })
})
