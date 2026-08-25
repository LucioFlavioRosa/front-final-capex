import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { http, HttpResponse } from 'msw'
import { renderizar } from '@/testes/render'
import { servidor } from '@/testes/servidor'
import { Historico } from '@/rodada/pages/Historico'

beforeAll(() => servidor.listen({ onUnhandledRequest: 'error' }))
afterEach(() => servidor.resetHandlers())
afterAll(() => servidor.close())

/**
 * Busca a linha da rodada DENTRO da tabela.
 *
 * `findByText` cru não serve, e o motivo é a própria tela: o nome da rodada
 * aparece duas vezes — na linha e no painel do item selecionado. Isso não é
 * defeito, é o layout; o teste é que precisa dizer de qual das duas fala.
 */
async function linhaDaRodada(nome: string) {
  const tabela = await screen.findByRole('table', { name: /rodadas de simulação/i })
  const celula = await within(tabela).findByText(nome)
  return celula.closest('tr')!
}

describe('Histórico — os três estados compartilhados', () => {
  it('mostra rótulo ESPECÍFICO enquanto carrega, não "Carregando…" genérico', () => {
    renderizar(<Historico />)

    // Síncrono, e sem `await`: com o msw respondendo em memória, o estado de
    // carga dura um piscar. Esperar por ele deixaria o teste verde por engano
    // no dia em que ele deixasse de existir.
    //
    // A asserção é no `role="status"` e não no texto solto porque o rótulo
    // aparece duas vezes no DOM de propósito: uma para leitor de tela e outra
    // dentro do bloco `aria-hidden` do esqueleto.
    expect(screen.getByRole('status')).toHaveTextContent('Carregando simulações…')
  })

  it('erro de carga oferece uma saída, e não obriga a recarregar a página', async () => {
    servidor.use(http.get('/api/runs', () => new HttpResponse(null, { status: 503 })))
    renderizar(<Historico />)

    expect(
      await screen.findByText('Não foi possível carregar o histórico de simulações.'),
    ).toBeInTheDocument()
    // A saída é o ponto: sem ela, o usuário perde o contexto no F5.
    expect(screen.getByRole('button', { name: /tentar de novo/i })).toBeInTheDocument()
  })

  it('vazio distingue "não há" de "não achei"', async () => {
    servidor.use(http.get('/api/runs', () => HttpResponse.json([])))
    renderizar(<Historico />)

    expect(await screen.findByText('Nenhuma simulação ainda')).toBeInTheDocument()
    expect(screen.getByText(/Não há rodadas registradas/)).toBeInTheDocument()
  })

  it('lista vazia POR FILTRO diz que é o filtro, não ausência de dado', async () => {
    renderizar(<Historico />)
    await linhaDaRodada('Orçamento base 2031')

    await userEvent.type(screen.getByPlaceholderText(/buscar/i), 'zzzznadaexiste')

    expect(await screen.findByText('Nenhuma rodada com esses filtros')).toBeInTheDocument()
    expect(screen.getByText(/o que está escondendo as demais é o filtro/i)).toBeInTheDocument()
  })
})

describe('Histórico — favoritar é seu, comentar é de todos', () => {
  it('a estrela e o comentário NÃO são vizinhos: a estrela está na tabela', async () => {
    renderizar(<Historico />)
    const linha = await linhaDaRodada('Orçamento base 2031')

    // A estrela vive DENTRO da linha da tabela — o gesto de marcar para si.
    expect(
      within(linha).getByRole('button', { name: /favorita/i }),
    ).toBeInTheDocument()
    // E o comentário NÃO está ali.
    expect(within(linha).queryByText(/comentário/i)).not.toBeInTheDocument()
  })

  it('o comentário diz explicitamente que é compartilhado', async () => {
    renderizar(<Historico />)
    await linhaDaRodada('Orçamento base 2031')

    expect(screen.getByText('Comentário da equipe')).toBeInTheDocument()
    expect(
      screen.getByText(/Todos que acessam esta unidade leem e editam/i),
    ).toBeInTheDocument()
  })

  it('favoritar é OTIMISTA: a estrela muda antes da resposta do servidor', async () => {
    // A resposta fica presa até ESTE teste soltá-la, e não até um `setTimeout`
    // vencer. Com prazo fixo, a asserção corria contra o render: bastava a
    // árvore ficar um pouco mais pesada para o servidor responder primeiro e o
    // teste falhar sem que nada de otimista tivesse mudado.
    let liberar!: () => void
    const presa = new Promise<void>((r) => {
      liberar = r
    })
    let respondeu = false
    servidor.use(
      http.delete('/api/runs/:runId/favorita', async () => {
        await presa
        respondeu = true
        return new HttpResponse(null, { status: 204 })
      }),
    )

    renderizar(<Historico />)
    const linha = await linhaDaRodada('Orçamento base 2031')
    const estrela = within(linha).getByRole('button', { name: /desmarcar/i })
    expect(estrela).toHaveAttribute('aria-pressed', 'true')

    await userEvent.click(estrela)

    await waitFor(() => {
      expect(
        within(linha).getByRole('button', { name: /marcar/i }),
      ).toHaveAttribute('aria-pressed', 'false')
    })
    // A prova de que foi otimista: a UI virou com a resposta ainda presa.
    expect(respondeu).toBe(false)
    liberar()
  })
})

describe('Histórico — a única mutação destrutiva', () => {
  it('excluir NÃO está na linha da tabela', async () => {
    renderizar(<Historico />)
    const linha = await linhaDaRodada('Orçamento base 2031')

    expect(within(linha).queryByRole('button', { name: /excluir/i })).not.toBeInTheDocument()
    // Ele existe — no painel, longe da varredura da lista.
    expect(screen.getByRole('button', { name: /excluir simulação/i })).toBeInTheDocument()
  })

  it('a confirmação diz que o CADASTRO não é tocado', async () => {
    renderizar(<Historico />)
    await linhaDaRodada('Orçamento base 2031')

    await userEvent.click(screen.getByRole('button', { name: /excluir simulação/i }))

    expect(await screen.findByText('Excluir esta simulação?')).toBeInTheDocument()
    expect(screen.getByText(/cadastro da unidade permanecem/i)).toBeInTheDocument()
  })
})

describe('Histórico — nulo nunca vira número', () => {
  it('rodada em voo mostra o traço no VPL, e não "R$ 0"', async () => {
    renderizar(<Historico />)
    const linha = await linhaDaRodada('Teto reduzido 20%')

    const celulas = within(linha).getAllByRole('cell')
    const textos = celulas.map((c) => c.textContent)
    expect(textos).toContain('—')
    expect(textos.join(' ')).not.toMatch(/R\$\s?0\b/)
  })
})
