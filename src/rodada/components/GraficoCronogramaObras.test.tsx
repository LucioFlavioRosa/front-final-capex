import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { http, HttpResponse } from 'msw'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderizar } from '@/testes/render'
import { servidor } from '@/testes/servidor'
import { ModalDoAno, type AnoFiltrado } from '@/rodada/components/GraficoCronogramaObras'

// O formato do arquivo é assunto de `lib/xlsx.test.ts`, que abre o ZIP que sai.
// Aqui a pergunta é outra e não se confunde com aquela: O QUE a tela entrega ao
// escritor — quais colunas, com que valores e sob que nome de arquivo.
const baixarXlsx = vi.hoisted(() => vi.fn())
vi.mock('@/rodada/lib/xlsx', () => ({ baixarXlsx }))

beforeAll(() => servidor.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  servidor.resetHandlers()
  baixarXlsx.mockClear()
})
afterAll(() => servidor.close())

const RESUMO: AnoFiltrado = {
  ano: 2028,
  obras: 2,
  capex: 500_366,
  porComponente: [],
}

function abrir(ano: number | null = 2028, aoFechar = () => {}) {
  return renderizar(
    <ModalDoAno
      runId="run_x"
      ano={ano}
      recorte="todas"
      resumo={RESUMO}
      aoFechar={aoFechar}
    />,
  )
}

/**
 * O MODAL DAS OBRAS DE UM ANO.
 *
 * O clique numa barra do cronograma abre a lista daquele ano, e a lista tem de
 * poder sair em planilha — é o caminho de quem vai cruzar o plano com o
 * cadastro fora da ferramenta.
 */
describe('ModalDoAno', () => {
  it('lista as obras do ano pedido', async () => {
    abrir()
    expect(await screen.findByText('rede_b2b27_1_2')).toBeInTheDocument()
    // As colunas que a tela ganhou junto com o modal, por caber mais largura.
    expect(screen.getByText('Sistema 27')).toBeInTheDocument()
    expect(screen.getByText('b2b27_1_2')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toHaveTextContent('Obras de 2028')
    expect(screen.getByRole('dialog')).toHaveTextContent('2 obras')
  })

  it('NÃO CONSULTA NADA enquanto nenhum ano está aberto', () => {
    // `onUnhandledRequest: 'error'` não pegaria isto — a rota existe. O que se
    // protege aqui é o custo: uma consulta por ano na montagem da tela de
    // resultados, para um detalhe que a maioria das visitas nunca abre.
    const espiao = vi.fn()
    servidor.use(http.get('/api/runs/:runId/obras', () => (espiao(), HttpResponse.json({ total: 0, itens: [] }))))
    const { container } = abrir(null)
    expect(container).toBeEmptyDOMElement()
    expect(espiao).not.toHaveBeenCalled()
  })

  it('exporta as obras do ano com as colunas e os valores da lista', async () => {
    abrir()
    await screen.findByText('rede_b2b27_1_2')
    await userEvent.click(screen.getByRole('button', { name: /Exportar Excel/ }))

    expect(baixarXlsx).toHaveBeenCalledTimes(1)
    const [planilha, arquivo] = baixarXlsx.mock.calls[0]

    expect(arquivo).toBe('obras-2028-run_x.xlsx')
    expect(planilha.nome).toBe('Obras de 2028')
    expect(planilha.colunas.map((c: { titulo: string }) => c.titulo)).toEqual([
      'Obra',
      'Componente',
      'Cidade',
      'Sistema',
      'Sub-bacia',
      'Situação',
      'Classificação',
      'CAPEX (R$)',
      'Quantidade',
      'Unidade',
      'Ano de início',
      'Conclusão',
      'Prazo (meses)',
    ])
    expect(planilha.linhas).toEqual([
      [
        'rede_b2b27_1_2',
        'Rede coletora',
        'Belford Roxo',
        'Sistema 27',
        'b2b27_1_2',
        'Construída', // o rótulo da tela, e não o `construida` do protocolo
        'Escolhida',
        190_342, // reais CHEIOS, como número — a coluna precisa somar
        383,
        'm',
        2028,
        '2028-09',
        9,
      ],
    ])
  })

  it('não exporta planilha vazia — o botão fica indisponível sem perder o foco', async () => {
    servidor.use(
      http.get('/api/runs/:runId/obras', () => HttpResponse.json({ total: 0, itens: [] })),
    )
    abrir()
    await screen.findByText(/Nenhuma obra com ano de execução/)

    const botao = screen.getByRole('button', { name: /Exportar Excel/ })
    expect(botao).toHaveAttribute('aria-disabled', 'true')
    // `aria-disabled` e não `disabled`: continua alcançável pelo teclado e se
    // anuncia como indisponível, em vez de sumir da ordem de tabulação.
    expect(botao).not.toBeDisabled()
    await userEvent.click(botao)
    expect(baixarXlsx).not.toHaveBeenCalled()
  })

  it('avisa quando o ano tem mais obras do que a página trouxe', async () => {
    // A planilha promete "as obras do ano". Se um dia um ano estourar o teto de
    // 500 do endpoint, o aviso conta em vez de o arquivo mentir por omissão.
    servidor.use(
      http.get('/api/runs/:runId/obras', () =>
        HttpResponse.json({
          total: 640,
          itens: [
            {
              obraId: 'rede_1',
              componente: 'Rede coletora',
              situacao: 'construida',
              recorte: 'escolhida',
              cidadeId: 'Belford Roxo',
              sistemaId: 'Sistema 27',
              subBaciaId: null,
              capex: 1000,
              quantidade: null,
              unidade: null,
              anoInicio: 2028,
              dataPronta: '2028-09',
              prazoMeses: null,
            },
          ],
        }),
      ),
    )
    abrir()
    expect(await screen.findByText(/640 obras e a lista mostra as/)).toBeInTheDocument()
  })

  it('ANO SÓ DE TERCEIRO abre uma lista cheia, e não um modal vazio', async () => {
    // O caso que a segunda série criou: 2026 tem 136 conclusões de terceiro e
    // nenhuma obra da Aegea. Se o filtro de ano tivesse continuado só em
    // `data_inicio`, clicar naquela barra abriria um modal vazio sobre uma barra
    // cheia — e a coluna Conclusão é o que explica por que a obra está ali.
    servidor.use(
      http.get('/api/runs/:runId/obras', () =>
        HttpResponse.json({
          total: 1,
          itens: [
            {
              obraId: 'eee_e1b25_3_1',
              componente: 'EEE',
              situacao: 'terceiro',
              recorte: 'terceiro',
              cidadeId: 'Buzios Interior1',
              sistemaId: 'Sistema 25 Interior1',
              subBaciaId: 'e1b25_3_1',
              capex: 0,
              quantidade: 0,
              unidade: 'un',
              anoInicio: null,
              dataPronta: '2026-05',
              prazoMeses: 4,
            },
          ],
        }),
      ),
    )
    renderizar(
      <ModalDoAno
        runId="run_x"
        ano={2026}
        recorte="terceiro"
        resumo={{ ano: 2026, obras: 136, capex: 0, porComponente: [] }}
        aoFechar={() => {}}
      />,
    )

    expect(await screen.findByText('eee_e1b25_3_1')).toBeInTheDocument()
    expect(screen.getByText('2026-05')).toBeInTheDocument()
    // A asserção é sobre o SUBTÍTULO, e não sobre o diálogo inteiro: a coluna
    // CAPEX das linhas mostra "R$ 0,0 mi" legitimamente, e cobrar o diálogo todo
    // faria o teste falhar por causa da tabela.
    const subtitulo = screen.getByRole('dialog').querySelector('h2 + p')!
    expect(subtitulo).toHaveTextContent('136 obras · de terceiro')
    // CAPEX de terceiro é zero por definição: o subtítulo não inventa "R$ 0,0".
    expect(subtitulo).not.toHaveTextContent('R$')

    // E a exportacao leva a data que justifica a linha estar neste ano.
    await userEvent.click(screen.getByRole('button', { name: /Exportar Excel/ }))
    const [planilha] = baixarXlsx.mock.calls[0]
    expect(planilha.linhas[0]).toContain('2026-05')
    expect(planilha.linhas[0]).toContain('De terceiro')
    // A classificacao vai na planilha mesmo saindo de um recorte so: o arquivo
    // deixa a ferramenta, e nada mais diria de qual filtro ele veio.
    expect(planilha.colunas.map((c: { titulo: string }) => c.titulo)).toContain('Classificação')
  })

  it('fecha pelo botão Fechar e pelo X do cabeçalho', async () => {
    const aoFechar = vi.fn()
    abrir(2028, aoFechar)
    await screen.findByText('rede_b2b27_1_2')

    // Dois controles fecham e ambos se chamam "Fechar": o X do cabecalho, que
    // o `Modal` poe em todo modal do app, e o botao do rodape que o pedido
    // desta tela nomeou. Os dois valem, e o teste cobra os dois.
    const fechar = screen.getAllByRole('button', { name: 'Fechar' })
    expect(fechar).toHaveLength(2)
    for (const b of fechar) await userEvent.click(b)
    await waitFor(() => expect(aoFechar).toHaveBeenCalledTimes(2))
  })
})
