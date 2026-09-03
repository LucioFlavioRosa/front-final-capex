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
import { AbasResultado } from './AbasResultado'
import {
  ehNivelDaRodada,
  lerAba,
  useAbaResultado,
  useHrefComAba,
} from './abaResultado'

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


describe('Sensibilidade — a aba que é um LUGAR, e não um modo', () => {
  it('só é lida por quem a aceita; todo o resto enxerga Plano', () => {
    // É a proteção das telas escritas como `aba === 'plano' ? A : B`. Sem ela,
    // um `aba=sensibilidade` colado numa URL de cidade cairia no ramo do "por
    // quê" — a explicabilidade apareceria sob o rótulo errado.
    const p = new URLSearchParams('aba=sensibilidade')
    expect(lerAba(p)).toBe('plano')
    expect(lerAba(p, true)).toBe('sensibilidade')
  })

  it('NÃO desce: clicar numa cidade a partir dela leva ao Plano da cidade', () => {
    // A curva é do orçamento inteiro. Levá-la junto abriria uma cidade com uma
    // aba que não mostra nada — e a pergunta "e se o CAPEX fosse maior?" não se
    // recorta por cidade.
    montar('/resultados/r1?aba=sensibilidade')
    expect(screen.getByTestId('href').textContent).toBe('/resultados/r1/cidades/c9')
  })

  it('e Por quê continua descendo — a diferença entre modo e lugar', () => {
    montar('/resultados/r1?aba=porque')
    expect(screen.getByTestId('href').textContent).toBe('/resultados/r1/cidades/c9?aba=porque')
  })
})

describe('ehNivelDaRodada', () => {
  it('reconhece o nível 1, com e sem barra final', () => {
    expect(ehNivelDaRodada('/resultados/run_2026')).toBe(true)
    expect(ehNivelDaRodada('/resultados/run_2026/')).toBe(true)
  })

  it('recusa os níveis abaixo e a própria lista', () => {
    expect(ehNivelDaRodada('/resultados/run_2026/cidades/c9')).toBe(false)
    expect(ehNivelDaRodada('/resultados/run_2026/obras/o1')).toBe(false)
    expect(ehNivelDaRodada('/resultados')).toBe(false)
  })
})


/**
 * A BARRA DE ABAS numa rodada que é uma VARIAÇÃO.
 *
 * Uma variação é uma rodada completa: abre em `/resultados/{id}`, tem plano,
 * obras e explicabilidade. Por isso ela ganhava também a aba de Sensibilidade —
 * e a tela oferecia analisar a sensibilidade de um ponto de sensibilidade.
 * Aceitar a oferta gravaria variações de variação, com linhagem apontando para o
 * meio da curva de outra rodada.
 */
describe('AbasResultado numa variação', () => {
  const abrir = (rota: string, ehVariacao: boolean) =>
    render(
      <MemoryRouter initialEntries={[rota]}>
        <Routes>
          <Route path="/resultados/*" element={<AbasResultado ehVariacao={ehVariacao} />} />
        </Routes>
      </MemoryRouter>,
    )

  // AS ABAS SÃO CHAMADAS PELO CENÁRIO, e não por uma categoria. As buscas aqui
  // seguem o nome visível — "Plano", "Por quê" e "Sensibilidade" saíram da tela
  // porque não acrescentavam nada que a frase já não dissesse.
  it('a rodada comum tem as três abas', () => {
    abrir('/resultados/r1', false)
    expect(screen.getByRole('tab', { name: /CAPEX fosse maior/ })).toBeInTheDocument()
  })

  it('a variação NÃO oferece a aba de sensibilidade', () => {
    abrir('/resultados/r1', true)
    expect(screen.queryByRole('tab', { name: /CAPEX fosse maior/ })).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Obras no plano/ })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Sem limite de CAPEX/ })).toBeInTheDocument()
  })

  it('e uma URL com `aba=sensibilidade` numa variação cai no Plano', () => {
    // Esconder o botão não fecha o caminho: a aba vive na URL, e um link antigo
    // chega aqui sem passar pela barra.
    abrir('/resultados/r1?aba=sensibilidade', true)
    const ativa = screen.getAllByRole('tab').find((b) => b.getAttribute('aria-selected') === 'true')
    expect(ativa).toHaveTextContent('Obras no plano')
  })
})
