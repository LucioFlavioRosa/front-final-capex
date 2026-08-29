/**
 * A ABA NA URL — e a continuidade que ela existe para dar.
 *
 * O que se afirma aqui é o comportamento que faz a separação valer: quem está
 * em "Por quê" continua em "Por quê" ao descer de nível. Se a aba voltasse ao
 * Plano no primeiro clique numa cidade, a divisão viraria estorvo — a pessoa
 * teria de reescolher o modo a cada nível.
 */
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { lerAba, useAbaResultado, useHrefComAba } from './abaResultado'

function Sonda() {
  const aba = useAbaResultado()
  const comAba = useHrefComAba()
  return (
    <div>
      <span data-testid="aba">{aba}</span>
      <span data-testid="href">{comAba('/resultados/r1/cidades/c9')}</span>
      <span data-testid="href-com-busca">{comAba('/resultados/r1/obras/o1?ano=2027')}</span>
    </div>
  )
}

const montar = (rota: string) =>
  render(
    <MemoryRouter initialEntries={[rota]}>
      <Routes>
        <Route path="/resultados/*" element={<Sonda />} />
      </Routes>
    </MemoryRouter>,
  )

describe('lerAba', () => {
  it('sem parâmetro é Plano — só o desvio se escreve na URL', () => {
    expect(lerAba(new URLSearchParams(''))).toBe('plano')
    expect(lerAba(new URLSearchParams('aba=porque'))).toBe('porque')
  })

  it('valor desconhecido cai no Plano, e não quebra a tela', () => {
    // Link antigo, link editado à mão, typo — nenhum desses deve dar tela em
    // branco; o pior caso é abrir na aba padrão.
    expect(lerAba(new URLSearchParams('aba=explicabilidade'))).toBe('plano')
  })
})

describe('a aba viaja na descida', () => {
  it('no Plano, o link de descida não ganha parâmetro nenhum', () => {
    montar('/resultados/r1')
    expect(screen.getByTestId('aba').textContent).toBe('plano')
    expect(screen.getByTestId('href').textContent).toBe('/resultados/r1/cidades/c9')
  })

  it('em Por quê, o link de descida leva a aba junto', () => {
    montar('/resultados/r1?aba=porque')
    expect(screen.getByTestId('aba').textContent).toBe('porque')
    expect(screen.getByTestId('href').textContent).toBe('/resultados/r1/cidades/c9?aba=porque')
  })

  it('um link que já tem busca própria não a perde', () => {
    // `?ano=2027` é o recorte que o cronograma passa ao descer para a obra.
    montar('/resultados/r1?aba=porque')
    const href = screen.getByTestId('href-com-busca').textContent ?? ''
    expect(href).toContain('ano=2027')
    expect(href).toContain('aba=porque')
  })
})
