/**
 * O QUE FICOU FORA — em obras, em três tópicos.
 *
 * A seção agrupava SUB-BACIAS que não faturam. A troca de unidade não é de
 * rótulo: obra de transporte não tem sub-bacia própria, então **85% do CAPEX
 * que ficou de fora não cabia na lista antiga** — 4.531 obras e R$ 4,4 bi
 * invisíveis, contra R$ 773 Mi que a tela mostrava.
 *
 * O QUE ESTES TESTES PROTEGEM não é o desenho: é o que o desenho promete.
 * Sobretudo o terceiro tópico, que é a regra do domínio virando tela — só
 * ligação e CTS faturam, o resto é CAPEX e OPEX que existe para o esgoto chegar
 * à ETE. Se ele voltar a sumir, o número de cima deixa de fechar com as partes.
 */
import { describe, expect, it } from 'vitest'
import { screen, within } from '@testing-library/react'
import { renderizar } from '@/testes/render'
import { EXPLICABILIDADE, EXPLICABILIDADE_VAZIA } from '@/testes/servidor'
import { SecaoPorQue } from './SecaoPorQue'
import type { ExplicabilidadeGlobal } from '@/rodada/domain/resultado'

const abrir = (dados: ExplicabilidadeGlobal) =>
  renderizar(<SecaoPorQue dados={dados} runId="r1" />)

describe('a seção do que ficou fora', () => {
  it('conta OBRAS, e não sub-bacias', async () => {
    abrir(EXPLICABILIDADE as ExplicabilidadeGlobal)
    expect(await screen.findByText(/6\.765 de 7\.605 obras/)).toBeInTheDocument()
    expect(screen.queryByText(/sub-bacias não faturam/)).not.toBeInTheDocument()
  })

  it('são três tópicos, e o de transporte é o que carrega o dinheiro', async () => {
    abrir(EXPLICABILIDADE as ExplicabilidadeGlobal)

    expect(await screen.findByText('Não coube no orçamento')).toBeInTheDocument()
    expect(screen.getByText('Não se pagam')).toBeInTheDocument()
    expect(screen.getByText('Dependem de outra obra')).toBeInTheDocument()

    // R$ 4,4 bi — o número que a tela antiga não tinha onde mostrar.
    expect(screen.getByText(/4\.442,4/)).toBeInTheDocument()
  })

  it('o tópico sem receita NÃO exibe "0 ligações"', async () => {
    // Zero ali não é "não medimos": é a regra do domínio. Escrito, seria lido
    // como falha de dado — e a obra de transporte passaria por incompleta.
    const so3 = {
      ...EXPLICABILIDADE,
      topicos: [{ ...EXPLICABILIDADE.topicos[2], ligacoes: 0 }],
    } as ExplicabilidadeGlobal
    abrir(so3)

    const bloco = (await screen.findByText('Dependem de outra obra')).closest('div') as HTMLElement
    expect(within(bloco).queryByText(/ligações/)).not.toBeInTheDocument()
  })

  it('a amostra se anuncia como amostra', async () => {
    // Dez linhas sob um título de "1.142" seriam lidas como a lista inteira.
    abrir(EXPLICABILIDADE as ExplicabilidadeGlobal)
    expect(await screen.findByText(/1 maiores de 1\.142, por CAPEX/)).toBeInTheDocument()
  })

  it('as obras de terceiro ficam fora da conta, e a tela diz por quê', async () => {
    abrir(EXPLICABILIDADE as ExplicabilidadeGlobal)
    expect(await screen.findByText(/560 são de terceiros/)).toBeInTheDocument()
  })

  it('nada fora do plano é ausência de seção, e não seção vazia', () => {
    const { container } = abrir(EXPLICABILIDADE_VAZIA as ExplicabilidadeGlobal)
    expect(container).toBeEmptyDOMElement()
  })
})
