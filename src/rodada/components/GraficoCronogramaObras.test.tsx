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
      'Preço unitário (R$)',
      'CAPEX do terreno (R$)',
      // AS DUAS PARCELAS DE MÓDULO vão SEMPRE na planilha, ainda que na tela só
      // apareçam na ETE com módulos de dois preços: o arquivo é levado para fora da
      // ferramenta, e coluna que aparece e desaparece conforme o ano quebraria
      // qualquer fórmula montada sobre ele.
      'CAPEX módulos iniciais (R$)',
      'CAPEX módulos de expansão (R$)',
      'Ano de início',
      // A LINHA DO TEMPO, SÓ EM DURAÇÃO. Nenhuma data — ver a nota no cabeçalho
      // da tabela, em `GraficoCronogramaObras.tsx`.
      'Predecessoras (meses)',
      'Obra (meses)',
      'Até a cobrança (meses)',
      'Ramp-up (meses)',
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
        497.02,
        null, // rede coletora não tem terreno
        // E não tem módulo: as duas parcelas só existem na ETE nova com dois preços.
        null,
        null,
        2028,
        4, // predecessoras
        9, // obra
        // Rede coletora não fatura: as duas saem NULAS, e não zeradas. Zero diria
        // "cobra na hora"; vazio diz "não se aplica a esta obra".
        null,
        null,
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
    // cheia.
    //
    // A COLUNA CONCLUSÃO ERA O QUE EXPLICAVA por que a obra está ali — "ela não
    // começa em 2026, ela FICA PRONTA" —, e ela saiu da tabela em 28/09/2026, com as
    // outras datas. O que sobra dizendo isso é a classificação "De terceiro" mais a
    // regra do servidor (`ANO_SQL`: obra de terceiro entra pelo ano da CONCLUSÃO,
    // porque o motor não a sequencia e ela não tem início). O teste cobra o que
    // sobrou; se um dia a explicação tiver de voltar à tela, é aqui que se vê que
    // ela não está lá.
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
    expect(screen.getByText('De terceiro')).toBeInTheDocument()
    // E NENHUMA DATA, em lugar nenhum da tabela: é a decisão de 28/09/2026, e é ela
    // que faz esta lista de terceiro não dizer mais por que 2026.
    expect(screen.queryByText('2026-05')).not.toBeInTheDocument()
    // A asserção é sobre o SUBTÍTULO, e não sobre o diálogo inteiro: a coluna
    // CAPEX das linhas mostra "R$ 0" legitimamente, e cobrar o diálogo todo
    // faria o teste falhar por causa da tabela.
    const subtitulo = screen.getByRole('dialog').querySelector('h2 + p')!
    expect(subtitulo).toHaveTextContent('136 obras · de terceiro')
    // CAPEX de terceiro é zero por definição: o subtítulo não inventa "R$ 0,0".
    expect(subtitulo).not.toHaveTextContent('R$')

    // A exportacao acompanha a tela: sem data, e com a classificacao.
    await userEvent.click(screen.getByRole('button', { name: /Exportar Excel/ }))
    const [planilha] = baixarXlsx.mock.calls[0]
    expect(planilha.linhas[0]).not.toContain('2026-05')
    expect(planilha.linhas[0]).toContain('De terceiro')
    // A classificacao vai na planilha mesmo saindo de um recorte so: o arquivo
    // deixa a ferramenta, e nada mais diria de qual filtro ele veio.
    expect(planilha.colunas.map((c: { titulo: string }) => c.titulo)).toContain('Classificação')
  })

  it('MÓDULOS DE ETE DO MESMO SISTEMA vêm como UMA linha, com a quantidade deles', async () => {
    // O pedido do dono do produto: no modo faseado cada módulo de ETE é uma obra
    // própria no banco, e a lista repetia a mesma ETE três vezes com "1 módulo"
    // em cada linha — enquanto uma rede aparece uma vez com 2.173,08 m. O
    // servidor funde os `#m*` do mesmo sistema; aqui o que se cobra é o que a
    // fusão muda NA TELA.
    servidor.use(
      http.get('/api/runs/:runId/obras', () =>
        HttpResponse.json({
          total: 1,
          itens: [
            {
              obraId: 'ete_b1e13#m1',
              obrasAgrupadas: 3,
              componente: 'ETE (módulo)',
              situacao: 'construida',
              recorte: 'escolhida',
              cidadeId: 'Belford Roxo',
              sistemaId: 'Sistema 13',
              subBaciaId: null,
              capex: 1_297_611.33,
              quantidade: 3,
              unidade: 'modulo',
              precoUnitario: 432_537.11,
              capexTerreno: 0,
              capexIniciais: null,
              capexExpansao: null,
              anoInicio: 2028,
              dataPronta: '2030-06',
              prazoMeses: 24,
            },
          ],
        }),
      ),
    )
    abrir()

    // 1. UMA linha, com os três módulos na quantidade.
    const corpo = screen.getByRole('dialog').querySelector('tbody')!
    await waitFor(() => expect(corpo.querySelectorAll('tr')).toHaveLength(1))
    expect(await screen.findByText('3')).toBeInTheDocument()

    // 2. Sem o `#m1` do primeiro módulo: a linha soma os três, e mostrar o id de
    //    um deles seria mentira sobre o que está somado ali.
    expect(screen.getByText('ete_b1e13')).toBeInTheDocument()
    expect(screen.queryByText('ete_b1e13#m1')).not.toBeInTheDocument()

    // 3. E não é link: a página de detalhe é de UMA obra, e aqui são três.
    expect(screen.queryByRole('link')).not.toBeInTheDocument()

    // 4. A conta fecha: 3 × 432.537,11 = 1.297.611,33. É o que o usuário
    //    confere de olho, e foi o defeito que ele achou na primeira versão.
    expect(screen.getByText('R$ 432.537,11')).toBeInTheDocument()
    expect(screen.getByText('R$ 1.297.611,33')).toBeInTheDocument()
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

/**
 * AS COLUNAS DE PARCELA DE MÓDULO aparecem só quando existem.
 *
 * A ETE nova pode ter módulos iniciais e de expansão a preços diferentes (pedido do
 * cliente, 29/09/2026). Nesse caso a linha não tem preço unitário — não existe um preço
 * que multiplique a quantidade —, e o dinheiro se lê nas duas parcelas.
 *
 * Quando o cadastro deixa as colunas de expansão em branco, o módulo de expansão é igual
 * ao de construção e NADA muda: um preço só, `quantidade × unitário` como sempre, e a
 * tabela não ganha coluna. É o caso de todas as ETEs de hoje, e duas colunas
 * permanentemente vazias sugeririam que falta dado onde não falta.
 */
describe('ModalDoAno — as parcelas de módulo da ETE', () => {
  const ETE = {
    obraId: 'ete_b2e27#nova',
    obrasAgrupadas: 2,
    componente: 'Módulo de ETE',
    situacao: 'construida' as const,
    cidadeId: 'Belford Roxo',
    sistemaId: 'Sistema 27',
    subBaciaId: null,
    capex: 1_060_000,
    recorte: 'escolhida' as const,
    dataPronta: '2028-10',
    quantidade: 2,
    unidade: 'modulo',
    anoInicio: 2028,
    dataInicio: '2028-01',
    prazoMeses: 9,
    mesesPredecessoras: 4,
    mesesAteCobranca: null,
    mesesRampUp: null,
    inicioPredecessoras: '2027-09',
    dataInicioFaturamento: null,
    inicioCobrancaPlena: null,
  }

  function responder(extra: Record<string, unknown>) {
    servidor.use(
      http.get('/api/runs/:runId/obras', () =>
        HttpResponse.json({ total: 1, itens: [{ ...ETE, ...extra }] }),
      ),
    )
  }

  it('com DOIS preços, abre as duas colunas e a conta fecha por elas', async () => {
    responder({
      precoUnitario: null,
      capexTerreno: 300_000,
      capexIniciais: 500_000,
      capexExpansao: 260_000,
    })
    abrir()
    // Linha fundida (pacote + expansão): mostra a ETE sem o `#nova`, que seria
    // mentira sobre o que a linha soma.
    expect(await screen.findByText('ete_b2e27')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Mód. iniciais' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Mód. expansão' })).toBeInTheDocument()
    // 300.000 + 500.000 + 260.000 = 1.060.000, que é o CAPEX da linha.
    for (const valor of ['R$ 300.000,00', 'R$ 500.000,00', 'R$ 260.000,00', 'R$ 1.060.000,00']) {
      expect(screen.getByText(valor)).toBeInTheDocument()
    }
  })

  it('com UM preço só, a tabela não ganha coluna nenhuma', async () => {
    responder({
      precoUnitario: 500_000,
      capexTerreno: 300_000,
      capexIniciais: null,
      capexExpansao: null,
      capex: 1_300_000,
    })
    abrir()
    // Linha fundida (pacote + expansão): mostra a ETE sem o `#nova`, que seria
    // mentira sobre o que a linha soma.
    expect(await screen.findByText('ete_b2e27')).toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: 'Mód. iniciais' })).toBeNull()
    expect(screen.queryByRole('columnheader', { name: 'Mód. expansão' })).toBeNull()
    // E a identidade de sempre continua na tela: 2 × 500.000 + 300.000 = 1.300.000.
    expect(screen.getByText('R$ 500.000,00')).toBeInTheDocument()
    expect(screen.getByText('R$ 1.300.000,00')).toBeInTheDocument()
  })
})
