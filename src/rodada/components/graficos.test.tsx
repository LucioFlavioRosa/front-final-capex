import { describe, expect, it } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderizar } from '@/testes/render'
import { GraficoCobertura } from '@/rodada/components/graficos'
import type { MetaCobertura, PontoCobertura } from '@/rodada/domain/resultado'

/**
 * O PLACAR DE METAS NÃO PODE REPROVAR O QUE NINGUÉM JULGOU.
 *
 * O motor ignora meta com ano >= `anos_capex` — ela nunca entra em `metas_det`
 * — e depois a reinjeta no detalhe com `atingida: None`, de propósito, para que
 * "100% das metas" não engane quem lê.
 *
 * A tela desfazia esse cuidado. `atingida` estava tipado `boolean` quando o
 * backend manda `null`, então `m.atingida ? 'sim' : 'não'` compilava sem um
 * aviso e o `null` caía no `else`: a tabela afirmava "não" sobre uma meta que
 * o motor nem avaliou. Reportar falha inexistente é pior que omitir.
 *
 * Estes testes existem porque o defeito era SILENCIOSO: nenhuma das duas
 * pontas reclamava, e `graficos.tsx` não tinha teste nenhum.
 */

const COBERTURA: PontoCobertura[] = [
  { ano: 2030, coberturaPct: 82.4 },
  { ano: 2035, coberturaPct: 91.0 },
]

/** 2030 batida, 2035 furada, 2045 FORA da janela de CAPEX — a não avaliada. */
const METAS: MetaCobertura[] = [
  { ano: 2030, alvoPct: 80, realizadoPct: 82.4, atingida: true, dentroDaJanela: true },
  { ano: 2035, alvoPct: 95, realizadoPct: 91.0, atingida: false, dentroDaJanela: true },
  { ano: 2045, alvoPct: 99, realizadoPct: 91.0, atingida: null, dentroDaJanela: false },
]

function abrirQuadro() {
  renderizar(<GraficoCobertura cobertura={COBERTURA} metas={METAS} escopo="Cidade X" />)
  return screen.getByText('Cobertura realizada × meta').closest('figure')!
}

async function abrirTabela() {
  const quadro = abrirQuadro()
  await userEvent.click(within(quadro).getByRole('tab', { name: 'Tabela' }))
  return within(quadro).getByRole('table')
}

describe('Cobertura × meta — meta fora da janela de CAPEX não é reprovada', () => {
  it('meta não avaliada não aparece como "não"', async () => {
    const tabela = await abrirTabela()
    const linha = within(tabela).getByText('2045').closest('tr')!

    expect(within(linha).getByText('fora da janela')).toBeInTheDocument()
    // O assert que trava a regressão: "Não atingida" nesta linha é a afirmação
    // falsa — o motor não julgou esta meta, então não há falha a reportar.
    expect(within(linha).queryByText('Não atingida')).not.toBeInTheDocument()
    expect(within(linha).queryByText('Atingida')).not.toBeInTheDocument()
  })

  it('meta dentro da janela continua dizendo atingida e não atingida', async () => {
    const tabela = await abrirTabela()
    // A correção não pode ter apagado o julgamento de quem FOI julgado — seria
    // trocar uma omissão por outra.
    const batida = within(tabela).getByText('2030').closest('tr')!
    expect(within(batida).getByText('Atingida')).toBeInTheDocument()

    const furada = within(tabela).getByText('2035').closest('tr')!
    expect(within(furada).getByText('Não atingida')).toBeInTheDocument()
  })

  it('ano de meta SEM ponto de cobertura não desaparece da tabela', async () => {
    // 2045 está em `metas` e NÃO está em `cobertura`. Derivar as linhas só da
    // série de cobertura apagava esta linha — e é justamente a meta de fora da
    // janela, a que mais precisa ficar conferível.
    const tabela = await abrirTabela()
    const linha = within(tabela).getByText('2045').closest('tr')!
    // Alvo presente, cobertura ausente e dita como ausente (traço), nunca zero.
    expect(within(linha).getByText('99,0%')).toBeInTheDocument()
    expect(within(linha).getByText('—')).toBeInTheDocument()
  })

  it('o contador conta só as metas da janela, e diz que é da janela', () => {
    const quadro = abrirQuadro()
    // Três metas no contrato, duas na janela, uma atingida. O denominador NUNCA
    // é 3: cobrar do plano uma meta além do horizonte que ele planeja é o mesmo
    // erro pelo outro lado.
    expect(quadro).toHaveTextContent('1 de 2 metas na janela atingidas')
    expect(quadro).not.toHaveTextContent('de 3 metas')
  })
})
