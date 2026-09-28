/**
 * A PLANILHA DAS OBRAS DO ANO — cabeçalho e linha não podem sair de sincronia.
 *
 * As duas são listas paralelas escritas à mão, e nada as amarra: acrescentar uma
 * coluna e esquecer o valor (ou o contrário) desloca TODAS as colunas seguintes, e o
 * arquivo sai com prazo na coluna de CAPEX sem erro nenhum. Este teste é a amarra.
 *
 * Nasceu com as colunas de fases da obra (28/09/2026), que dobraram o tamanho da
 * planilha — de 13 para 21 colunas.
 */
import { describe, expect, it } from 'vitest'
import { COLUNAS_DA_PLANILHA, linhaDaPlanilha } from '@/rodada/components/GraficoCronogramaObras'
import { brlExato, decimal, VAZIO } from '@/rodada/lib/formato'
import type { ObraLinha } from '@/rodada/domain/resultado'

const COLETA: ObraLinha = {
  obraId: 'lig_b1',
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
    // a linha do tempo, na ordem em que acontece
    expect(valor('Predecessoras (meses)')).toBe(8)
    expect(valor('Início das predecessoras')).toBe('2026-02')
    expect(valor('Início da execução')).toBe('2026-10')
    expect(valor('Prazo (meses)')).toBe(17)
    expect(valor('Conclusão')).toBe('2028-03')
    expect(valor('Até a cobrança (meses)')).toBe(8)
    expect(valor('Início do faturamento')).toBe('2029-09')
    expect(valor('Ramp-up (meses)')).toBe(7)
  })

  it('a obra que não fatura sai VAZIA nas três colunas de cobrança, e não zerada', () => {
    // Zero ali diria "fatura imediatamente"; vazio diz "não se aplica". A diferença
    // importa porque a planilha é feita para ser somada.
    const titulos = COLUNAS_DA_PLANILHA.map((c) => c.titulo)
    const linha = linhaDaPlanilha(NAO_FATURA)
    for (const t of ['Até a cobrança (meses)', 'Início do faturamento', 'Ramp-up (meses)']) {
      expect(linha[titulos.indexOf(t)]).toBeNull()
    }
    // e o que é dela continua saindo
    expect(linha[titulos.indexOf('Prazo (meses)')]).toBe(17)
    expect(linha[titulos.indexOf('Início da execução')]).toBe('2026-10')
  })

  it('as colunas de dinheiro estão marcadas para o Excel somar', () => {
    const dinheiro = COLUNAS_DA_PLANILHA.filter((c) => 'formato' in c && c.formato === 'dinheiro')
    expect(dinheiro.map((c) => c.titulo)).toEqual(['CAPEX (R$)', 'Preço unitário (R$)'])
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
