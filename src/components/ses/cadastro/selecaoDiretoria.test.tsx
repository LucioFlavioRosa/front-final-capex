/**
 * A SELEÇÃO É UMA CASCATA DE TRÊS NÍVEIS: regional → diretoria → unidade.
 *
 * A diretoria entrou entre a regional e a unidade quando o cliente confirmou a
 * hierarquia (01/09): `regional → diretoria → unidade → empresa → cidade →
 * sistema`. Antes a tela ia da regional direto para a unidade.
 *
 * O QUE ESTE TESTE PROTEGE não é o passo do meio existir — isso se vê na tela.
 * É o caso em que ele ESCONDE uma unidade: `diretoria_id` é nulável de propósito
 * (a carga pode trazer a unidade antes do nível acima), e um filtro ingênuo por
 * diretoria faria essa unidade sumir da tela — existindo no banco, acessível
 * pela URL, e sem forma de ser escolhida. É o tipo de defeito que nenhuma tela
 * acusa: a lista simplesmente vem menor.
 *
 * O mock tem exatamente essa assimetria: a 57 está numa diretoria, a 56 não.
 *
 * AS BUSCAS SÃO POR BOTÃO, e não por texto: o nome da unidade aparece DUAS vezes
 * na tela — na lista e no cartão do recorte —, e uma busca por texto casaria com
 * o resumo mesmo quando a lista estivesse vazia. Só a lista é clicável.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { http, HttpResponse } from 'msw'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { servidor } from '@/testes/servidor'
import { renderizar } from '@/testes/render'
import { CadastroProvider } from './CadastroContext'
import { SelecaoUnidade } from './SelecaoUnidade'

vi.mock('@/auth/AuthContext', () => ({
  useAuth: () => ({ user: { name: 'Teste', papeis: ['admin_holding'], tudo: true, unidades: [] } }),
}))

beforeAll(() => servidor.listen({ onUnhandledRequest: 'bypass' }))
afterEach(() => servidor.resetHandlers())
afterAll(() => servidor.close())

/**
 * A auto-seleção da unidade dispara a LEITURA do cadastro dela. Ela não é o
 * assunto aqui, mas sem estes handlers cada teste tenta rede de verdade e
 * despeja um `fetch failed` por tentativa.
 */
beforeEach(() => {
  servidor.use(
    http.get('/api/unidades/:id/hierarquia', () =>
      HttpResponse.json({
        unidReg: { rid: 'R4', rnome: 'R4', did: '', dnome: '', uid: '57', unome: 'U', waccMedio: '8', usaCts: 'false' },
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
    http.get('/api/unidades/:id/sub-bacias', () => HttpResponse.json({ subs: {} })),
    http.get('/api/unidades/:id/etes', () => HttpResponse.json({ etes: [] })),
    http.get('/api/unidades/:id/cts', () => HttpResponse.json({ ctss: {} })),
  )
})

function abrir() {
  return renderizar(
    <CadastroProvider>
      <SelecaoUnidade />
    </CadastroProvider>,
  )
}

const naLista = (nome: RegExp) => screen.queryByRole('button', { name: nome })
const R01 = /ÁGUAS DO RIO 01/
const R04 = /ÁGUAS DO RIO 04/

describe('a seleção em cascata com a diretoria', () => {
  it('escolhida a regional, a primeira diretoria entra sozinha e recorta as unidades', async () => {
    abrir()

    await userEvent.click(await screen.findByRole('button', { name: 'R4' }))

    // A diretoria entra sem clique — o mesmo que já valia para a unidade um
    // nível abaixo. Sem isso, trocar de regional deixava duas listas vazias.
    const escolhida = await screen.findByRole('button', { name: 'Águas do Rio' })
    await waitFor(() => expect(escolhida.className).toContain('border-water-600'))

    // E a lista de unidades é a DA DIRETORIA: a 57 está nela, a 56 não.
    await waitFor(() => expect(naLista(R04)).toBeInTheDocument())
    expect(naLista(R01)).not.toBeInTheDocument()
  })

  it('a unidade sem diretoria continua escolhível, sob "Sem diretoria"', async () => {
    abrir()

    await userEvent.click(await screen.findByRole('button', { name: 'R4' }))
    await waitFor(() => expect(naLista(R04)).toBeInTheDocument())

    // O grupo só existe porque HÁ unidade sem diretoria — não é uma opção fixa.
    await userEvent.click(screen.getByRole('button', { name: 'Sem diretoria' }))

    await waitFor(() => expect(naLista(R01)).toBeInTheDocument())
    expect(naLista(R04)).not.toBeInTheDocument()
  })

  it('trocar de regional derruba a diretoria escolhida', async () => {
    // Uma diretoria pertence a UMA regional. Mantê-la escolhida ao trocar
    // deixaria a tela filtrando as unidades novas por uma diretoria que não é
    // delas — e a lista viria vazia, sem nada explicando por quê.
    abrir()

    await userEvent.click(await screen.findByRole('button', { name: 'R4' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Sem diretoria' }))
    await waitFor(() => expect(naLista(R01)).toBeInTheDocument())

    await userEvent.click(screen.getByRole('button', { name: 'R4' }))

    // Volta para a primeira diretoria, e não fica em "Sem diretoria".
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Águas do Rio' }).className).toContain(
        'border-water-600',
      ),
    )
    expect(naLista(R01)).not.toBeInTheDocument()
  })
})
