/**
 * A HIERARQUIA DA HOME — o que é manchete e o que é cortesia.
 *
 * Até 29/08/2026 o maior e mais pesado texto da página era "Olá, Fulano.", e a
 * resposta que a pessoa veio buscar ficava no parágrafo abaixo. Estes testes
 * prendem a inversão, porque ela é exatamente o tipo de coisa que volta sozinha
 * na próxima mexida: trocar um `<h1>` por um `<div>` não quebra build, não
 * quebra tipo, e ninguém percebe até alguém abrir a tela.
 *
 * O que se afirma aqui é sobre PAPEL, não sobre pixel: quem é o `h1`. Tamanho e
 * peso são classes do Tailwind e mudam de tempos em tempos; o papel não deve.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { http, HttpResponse } from 'msw'
import { screen, waitFor, within } from '@testing-library/react'
import { renderizar } from '@/testes/render'
import { servidor } from '@/testes/servidor'

// A Home só usa o nome de quem entrou; montar o AuthProvider de verdade traria
// MSAL para um teste que não é sobre login.
vi.mock('@/auth/AuthContext', () => ({
  useAuth: () => ({ user: { name: 'Lúcio Flávio', email: 'lucio@exemplo.com' } }),
}))

const { Home } = await import('./Home')

beforeAll(() => servidor.listen({ onUnhandledRequest: 'error' }))
afterEach(() => servidor.resetHandlers())
afterAll(() => servidor.close())

/**
 * A prontidão da unidade. `pendencias` é o que o endpoint devolve de verdade;
 * `completude` é opcional e hoje NÃO vem — por isso os dois viajam separados
 * aqui, e `pendencias: 0` sozinho já significa cadastro fechado.
 */
function comProntidao({ pendencias, completude }: { pendencias: number; completude?: number }) {
  servidor.use(
    http.get('/api/unidades/:id/prontidao', () =>
      HttpResponse.json({
        unidadeId: '56',
        unidadeNome: 'ÁGUAS DO RIO 01',
        pendencias,
        faltando: [],
        ...(completude === undefined ? {} : { completude }),
      }),
    ),
  )
}

describe('Home', () => {
  it('a MANCHETE é o veredito do trabalho, não a saudação', async () => {
    comProntidao({ pendencias: 38, completude: 94 })
    renderizar(<Home />)

    // O `h1` já existe durante o carregamento (com "Carregando o histórico…"),
    // então esperar o PAPEL aparecer não basta — espera-se o veredito.
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Faltam 6% do cadastro'),
    )
    // A saudação continua na tela — mas como cortesia, e não como manchete.
    expect(screen.getByText('Olá, Lúcio')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).not.toHaveTextContent('Olá')
  })

  it('cadastro fechado vira uma frase que autoriza, e não um número', async () => {
    comProntidao({ pendencias: 0 })
    renderizar(<Home />)
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('está pronta para simular'),
    )
  })

  it('o horizonte do plano traz um item por ano, legível sem enxergar a barra', async () => {
    comProntidao({ pendencias: 38, completude: 94 })
    renderizar(<Home />)

    // A lista É a tabela equivalente: cada ano carrega contagem e CAPEX no nome
    // acessível. Sem isso o quadro seria uma imagem muda para leitor de tela.
    const lista = await screen.findByRole('list', { name: /Obras por ano do plano/i })
    const anos = within(lista).getAllByRole('listitem')
    expect(anos).toHaveLength(1) // a fixture do cronograma tem um ano
    expect(lista).toHaveTextContent('2028')
    expect(lista).toHaveTextContent('2 obras')
  })

  it('sem percentual, o veredito sai das PENDÊNCIAS — que é o que o servidor manda', async () => {
    // `/prontidao` não devolve `completude`. Enquanto não devolver, contar
    // campos que faltam responde melhor que "está cadastrada", que não diz nada.
    comProntidao({ pendencias: 38 })
    renderizar(<Home />)
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
        'Faltam 38 campos no cadastro',
      ),
    )
  })

  it('sem rodada publicada, o horizonte convida em vez de mostrar quadro vazio', async () => {
    servidor.use(http.get('/api/runs', () => HttpResponse.json([])))
    renderizar(<Home />)

    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
        'Nenhuma simulação publicada ainda',
      ),
    )
    expect(
      screen.getByText(/O horizonte aparece aqui depois da primeira simulação/i),
    ).toBeInTheDocument()
  })
})
