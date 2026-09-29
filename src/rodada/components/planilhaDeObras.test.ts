/**
 * A PLANILHA DAS OBRAS DO ANO — cabeçalho e linha não podem sair de sincronia.
 *
 * As duas são listas paralelas escritas à mão, e nada as amarra: acrescentar uma
 * coluna e esquecer o valor (ou o contrário) desloca TODAS as colunas seguintes, e o
 * arquivo sai com prazo na coluna de CAPEX sem erro nenhum. Este teste é a amarra.
 *
 * Nasceu com as colunas de fases da obra (28/09/2026), que dobraram o tamanho da
 * planilha — de 13 para 20 colunas. No mesmo dia caiu para 17: por decisão do dono do
 * produto, as CINCO datas deram lugar à duração das quatro fases. As três derivadas
 * não fechavam com a duração ao lado; as duas reais cobriam só a janela de execução e
 * escondiam as predecessoras.
 */
import { describe, expect, it } from 'vitest'
import { COLUNAS_DA_PLANILHA, linhaDaPlanilha } from '@/rodada/components/GraficoCronogramaObras'
import { brlExato, decimal, VAZIO } from '@/rodada/lib/formato'
import type { ObraLinha } from '@/rodada/domain/resultado'

const COLETA: ObraLinha = {
  obraId: 'lig_b1',
  obrasAgrupadas: 1,
  componente: 'Ligação de esgoto',
  situacao: 'construida',
  cidadeId: 'c1',
  sistemaId: 's1',
  subBaciaId: 'b1',
  capex: 693_474,
  quantidade: 242,
  unidade: 'ligacao',
  recorte: 'escolhida',
  anoInicio: 2026,
  dataPronta: '2028-03',
  precoUnitario: 2863.84,
  dataInicio: '2026-10',
  prazoMeses: 17,
  mesesPredecessoras: 8,
  inicioPredecessoras: '2026-02',
  mesesAteCobranca: 8,
  dataInicioFaturamento: '2029-09',
  mesesRampUp: 7,
  dataCobrancaPlena: '2030-04',
  capexTerreno: null,
}

/** Uma EEE: não fatura, então as três colunas de cobrança vêm vazias. */
const NAO_FATURA: ObraLinha = {
  ...COLETA,
  obraId: 'eee_b1',
  componente: 'EEE',
  mesesAteCobranca: null,
  dataInicioFaturamento: null,
  mesesRampUp: null,
}

describe('a planilha das obras do ano', () => {
  it('tem um valor por coluna, e na mesma ordem', () => {
    expect(linhaDaPlanilha(COLETA)).toHaveLength(COLUNAS_DA_PLANILHA.length)
    expect(linhaDaPlanilha(NAO_FATURA)).toHaveLength(COLUNAS_DA_PLANILHA.length)
  })

  it('cada valor cai sob o título que o descreve', () => {
    const titulos = COLUNAS_DA_PLANILHA.map((c) => c.titulo)
    const linha = linhaDaPlanilha(COLETA)
    const valor = (titulo: string) => linha[titulos.indexOf(titulo)]

    expect(valor('Obra')).toBe('lig_b1')
    expect(valor('CAPEX (R$)')).toBe(693_474)
    expect(valor('Quantidade')).toBe(242)
    expect(valor('Preço unitário (R$)')).toBe(2863.84)
    // A linha do tempo, só em duração — a ordem em que as fases acontecem.
    expect(valor('Predecessoras (meses)')).toBe(8)
    expect(valor('Obra (meses)')).toBe(17)
    expect(valor('Até a cobrança (meses)')).toBe(8)
    expect(valor('Ramp-up (meses)')).toBe(7)
    // NENHUMA DATA NA PLANILHA, e é decisão, não esquecimento (28/09/2026). As três
    // DERIVADAS não fechavam com a duração ao lado; as duas REAIS cobriam só a janela
    // de execução e escondiam as predecessoras. O arquivo acompanha a tela, senão a
    // mesma discussão reaparece no Excel.
    for (const t of ['Início do faturamento', 'Cobrança plena', 'Início das predecessoras',
                     'Início da obra', 'Fim da obra', 'Início da execução', 'Conclusão']) {
      expect(titulos).not.toContain(t)
    }
    // O ano de início FICA: é o ano da barra que abriu a lista — identificação da
    // linha, e não fase dela.
    expect(valor('Ano de início')).toBe(2026)
    // Só a ETE preenche; numa rede coletora a conta fecha sem parcela extra.
    expect(valor('CAPEX do terreno (R$)')).toBeNull()
  })

  it('a obra que não fatura sai VAZIA nas colunas de cobrança, e não zerada', () => {
    // Zero ali diria "fatura imediatamente"; vazio diz "não se aplica". A diferença
    // importa porque a planilha é feita para ser somada. E nestas obras os campos
    // carregam o default da classe `Obra` do motor (1 e 2), que não é dado do
    // cadastro — o servidor já os anula, e a planilha não pode reintroduzi-los.
    const titulos = COLUNAS_DA_PLANILHA.map((c) => c.titulo)
    const linha = linhaDaPlanilha(NAO_FATURA)
    for (const t of ['Até a cobrança (meses)', 'Ramp-up (meses)']) {
      expect(linha[titulos.indexOf(t)]).toBeNull()
    }
    // e o que é dela continua saindo
    expect(linha[titulos.indexOf('Obra (meses)')]).toBe(17)
    expect(linha[titulos.indexOf('Predecessoras (meses)')]).toBe(8)
  })

  it('as colunas de dinheiro estão marcadas para o Excel somar', () => {
    const dinheiro = COLUNAS_DA_PLANILHA.filter((c) => 'formato' in c && c.formato === 'dinheiro')
    expect(dinheiro.map((c) => c.titulo)).toEqual([
      'CAPEX (R$)',
      'Preço unitário (R$)',
      'CAPEX do terreno (R$)',
    ])
  })
})

/**
 * A CONTA TEM DE FECHAR NA TELA: quantidade × preço unitário = CAPEX.
 *
 * Defeito relatado em 28/09/2026, e o dado estava certo — nas 425 obras com
 * unitário da rodada conferida, `capex = quantidade × preco_unitario` com diferença
 * ZERO. Quem quebrava era a EXIBIÇÃO: `inteiro` arredondava a quantidade (1,17 → 1)
 * e `brl` tirava os centavos do preço (392,11 → 392). Na tela, 2.173 × 392 dava
 * 851.816 contra os 852.086 gravados, e a conferência à mão não batia.
 */
describe('os três números que o usuário multiplica', () => {
  it('a quantidade mantém as casas decimais', () => {
    expect(decimal(2173.08)).toBe('2.173,08')
    expect(decimal(1.17)).toBe('1,17')        // `inteiro` daria "1" — erro de 17%
    expect(decimal(242)).toBe('242')          // sem casa inventada quando não há
  })

  it('o preço unitário e o CAPEX saem com centavos', () => {
    expect(brlExato(392.11)).toMatch(/^R\$\s392,11$/)
    expect(brlExato(852086.3988)).toMatch(/^R\$\s852\.086,40$/)
  })

  it('a identidade fecha com os valores como são exibidos', () => {
    // O caso real da rodada conferida: rede coletora.
    const qtd = 2173.08
    const unit = 392.11
    const capex = qtd * unit
    const lido = (t: string) => Number(t.replace(/[^\d,-]/g, '').replace(',', '.'))
    expect(lido(decimal(qtd)) * lido(brlExato(unit))).toBeCloseTo(lido(brlExato(capex)), 2)
  })

  it('ausente continua virando traço, e não zero', () => {
    expect(decimal(null)).toBe(VAZIO)
    expect(brlExato(null)).toBe(VAZIO)
    expect(decimal(0)).toBe('0')             // zero é medida, e não ausência
  })
})

/**
 * O `colSpan` das mensagens de estado tem de bater com o número de colunas.
 *
 * Ele é escrito à mão e some da revisão: acrescentei oito colunas e ajustei o
 * número no chute, errando por um (18 onde eram 17) — e a tabela mudou de tamanho três
 * vezes no mesmo dia depois disso. Célula que declara mais colunas do que a tabela tem
 * empurra a borda da tabela para fora do contêiner.
 *
 * O teste lê o próprio componente, porque a contagem só existe no JSX — não há
 * estrutura de dados que a descreva.
 */
describe('a tabela do modal', () => {
  it('declara o mesmo número de colunas no cabeçalho e nas mensagens de estado', async () => {
    const fonte = await import('node:fs/promises').then((fs) =>
      fs.readFile('src/rodada/components/GraficoCronogramaObras.tsx', 'utf-8'),
    )
    const thead = fonte.slice(fonte.indexOf('<thead'), fonte.indexOf('</thead>'))
    const segundaLinha = thead.split('<tr>')[2]
    const colunas = (segundaLinha.match(/<th\b/g) ?? []).length
    const condicionais = (segundaLinha.match(/recorte === 'todas' && <th/g) ?? []).length

    const usado = fonte.match(/colSpan=\{recorte === 'todas' \? (\d+) : (\d+)\}/g) ?? []
    const mensagens = usado.filter((m) => !m.includes('? 7 :'))   // o do grupo é outro
    expect(mensagens.length).toBeGreaterThan(0)
    for (const m of mensagens) {
      const [comTodas, sem] = (m.match(/(\d+) : (\d+)/) ?? []).slice(1).map(Number)
      expect(comTodas).toBe(colunas)
      expect(sem).toBe(colunas - condicionais)
    }
  })

  it('OS GRUPOS SOMAM as colunas que eles cobrem, e as células somam o mesmo', async () => {
    // O DESALINHAMENTO RELATADO em 28/09/2026 foi exatamente isto: a segunda linha do
    // cabeçalho ganhou colunas e os `colSpan` da PRIMEIRA ficaram nos antigos (somavam
    // 10 numa tabela de 16). Cada rótulo de grupo escorrega para cima do grupo
    // seguinte, e daí para a direita todo título fica sobre a coluna errada.
    //
    // As três linhas — grupos, títulos e células — têm de somar o mesmo número, e
    // conferir só duas delas deixa passar justamente o caso que aconteceu.
    //
    // NOS DOIS MODOS DO FILTRO, e somando `colSpan` também no corpo. A primeira versão
    // deste teste olhava só o primeiro lado do ternário e contava `<td>` como 1: a
    // revisão do Codex mostrou que `colSpan={recorte === 'todas' ? 7 : 5}` passava (o
    // modo sem "Classificação" ficava errado) e que um `colSpan={2}` numa célula do
    // corpo também passava.
    const fonte = await import('node:fs/promises').then((fs) =>
      fs.readFile('src/rodada/components/GraficoCronogramaObras.tsx', 'utf-8'),
    )
    const thead = fonte.slice(fonte.indexOf('<thead'), fonte.indexOf('</thead>'))
    const [, grupos, titulos] = thead.split('<tr>')
    const celulas = fonte.slice(fonte.indexOf('{itens.map('), fonte.indexOf('</tbody>'))

    /**
     * Quantas COLUNAS um trecho ocupa, no modo pedido: cada `<th>`/`<td>` vale o seu
     * `colSpan` (1 quando não tem), e a célula condicional só conta em "todas".
     */
    const largura = (trecho: string, tag: 'th' | 'td', comTodas: boolean) => {
      const re = new RegExp(
        `(\\{recorte === 'todas' && )?<${tag}\\b([^>]*?)>`,
        'g',
      )
      let total = 0
      for (const m of trecho.matchAll(re)) {
        if (m[1] && !comTodas) continue
        const span = /colSpan=\{(?:recorte === 'todas' \? (\d+) : (\d+)|(\d+))\}/.exec(m[2])
        total += span ? Number(comTodas ? (span[1] ?? span[3]) : (span[2] ?? span[3])) : 1
      }
      return total
    }

    for (const comTodas of [true, false]) {
      const colunas = largura(titulos, 'th', comTodas)
      expect(colunas).toBeGreaterThan(10)                      // o trecho foi achado
      expect(largura(grupos, 'th', comTodas)).toBe(colunas)    // os grupos cobrem tudo
      expect(largura(celulas, 'td', comTodas)).toBe(colunas)   // e o corpo também
    }
  })
})
