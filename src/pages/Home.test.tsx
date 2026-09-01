/**
 * A HOME NÃO BUSCA DADO — e é isso que o teste prende.
 *
 * VPL, horizonte do plano e status do cadastro custavam quatro chamadas de API
 * antes de desenhar. Esse dado tem casa própria, e a entrada não é lugar de
 * resumo.
 *
 * O que se afirma aqui é o CONTRATO da tela, não a aparência: nenhuma rede, e as
 * três portas de entrada presentes com destino certo. Se alguém reintroduzir um
 * `useQuery` aqui — que é o jeito natural de "só mostrar um numerozinho" — o
 * primeiro teste fica vermelho antes de a tela chegar em ninguém.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { renderizar } from '@/testes/render'
import { NAV_ITEMS } from '@/config/navigation'

vi.mock('@/auth/AuthContext', () => ({
  useAuth: () => ({ user: { name: 'Lúcio Flávio', email: 'lucio@exemplo.com' } }),
}))

const { Home } = await import('./Home')

let chamadas: string[] = []
beforeEach(() => {
  chamadas = []
  vi.stubGlobal('fetch', (...args: unknown[]) => {
    chamadas.push(String(args[0]))
    return Promise.reject(new Error('a Home não deve buscar nada'))
  })
})
afterEach(() => vi.unstubAllGlobals())

describe('Home', () => {
  it('não faz nenhuma chamada de rede', async () => {
    renderizar(<Home />)
    await screen.findByRole('heading', { level: 1 })
    expect(chamadas).toEqual([])
  })

  it('a manchete diz o que o produto faz, e a saudação é cortesia', async () => {
    renderizar(<Home />)
    const titulo = await screen.findByRole('heading', { level: 1 })
    expect(titulo).toHaveTextContent('Em que ordem construir')
    expect(titulo).not.toHaveTextContent('Olá')
    expect(screen.getByText('Olá, Lúcio')).toBeInTheDocument()
  })

  it('as três portas de entrada estão lá, cada uma para a sua rota', () => {
    renderizar(<Home />)
    for (const item of NAV_ITEMS) {
      const link = screen.getByRole('link', { name: new RegExp(item.title, 'i') })
      expect(link).toHaveAttribute('href', item.path)
    }
  })

  it('as fotos das ETEs têm texto alternativo que descreve a cena', () => {
    // `alt` vazio deixaria a arte muda para leitor de tela; `alt="foto"` seria
    // pior, porque ocupa o lugar da descrição sem descrever.
    renderizar(<Home />)
    const fotos = screen.getAllByRole('img')
    expect(fotos).toHaveLength(2)
    for (const foto of fotos) {
      expect(foto.getAttribute('alt') ?? '').toMatch(/estação de tratamento/i)
    }
  })
})
