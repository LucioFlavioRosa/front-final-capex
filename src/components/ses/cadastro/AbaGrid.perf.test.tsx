/**
 * QUANTO CUSTA UMA TECLA na grade do cadastro.
 *
 * Não mede beleza de código: mede o que o usuário sente. A grade renderiza
 * TODAS as linhas (não há virtualização), então uma unidade real — 751
 * sub-bacias × 20 colunas ≈ 15 mil células — só responde rápido se o `memo` da
 * linha (`AbaGridRow`) estiver funcionando. Basta UMA prop instável para ele
 * nunca acertar, e aí cada tecla repinta a planilha inteira.
 *
 * O teto não é meta de engenharia: é o limite acima do qual digitar numa célula
 * deixa de parecer imediato. jsdom é mais lento que o navegador, então o número
 * aqui é conservador — o que importa é a ORDEM de grandeza, e ela denuncia a
 * regressão no dia em que alguém devolver uma closure inline para a linha.
 */
import { describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { AbaGrid } from './AbaGrid'
import { SCHEMA } from '@/data/cadastroUnidade/schema'
import type { Dados } from '@/domain/fluxo'
import type { Row } from '@/data/cadastroUnidade/types'

// A grade consulta o papel de quem olha para decidir o que é editável. Aqui o
// assunto é custo de render, e o AuthProvider de verdade exigiria sessão.
//
// O retorno é HOISTED, e isso não é detalhe: devolver `{ user: { papeis: [...] } }`
// literal a cada chamada dá um array novo por render, e `papeis` desce até a
// linha — o `memo` de `AbaGridRow` erraria sempre, e o teste mediria o defeito
// do mock em vez do custo do componente.
// O papel REAL, e nao um 'admin' inventado: `podeEditarCampoCadastro` compara
// com as constantes de `auth/papeis`, e um valor que nao existe la reprova em
// silencio — a celula fica travada e o teste mede a trava, nao o componente.
const SESSAO = { user: { papeis: ['admin_holding'] } }
vi.mock('@/auth/AuthContext', () => ({ useAuth: () => SESSAO }))

// jsdom não tem `ResizeObserver`, e a grade usa um para saber se a tabela
// transborda (congelar a primeira coluna). Stub vazio: aqui só interessa o
// tempo de render, e nada mede largura em jsdom de todo jeito.
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver

const LINHAS = 751

/**
 * O TETO, e de onde ele veio.
 *
 * Medido nesta máquina, com o mount já quente: ~45ms com o `memo` da linha
 * funcionando, ~325ms sem ele — comprovado revertendo a correção e medindo de
 * novo. O teto fica entre os dois, mais perto do defeito que do bom: ele existe
 * para acusar a VOLTA de uma prop instável, não para perseguir milissegundos.
 *
 * Só vale com a máquina quieta, e é por isso que este arquivo tem config e
 * script próprios (`npm run test:perf`).
 */
const TETO_MS = 150

const aba = SCHEMA.find((a) => a.key === 'subbacia-operacional')!

function linhas(n: number): Row[] {
  return Array.from({ length: n }, (_, i) => {
    const r: Row = {}
    for (const c of aba.cols) r[c.coluna] = ''
    r.sub_bacia_id = `b${i}`
    r.sub_bacia_name = `Sub-bacia ${i}`
    r.sistema_id = `s${i % 40}`
    return r
  })
}

/** Monta a grade, aquece, edita uma célula e devolve o custo desse re-render. */
function custoDeUmaTecla(quantas: number): number {
  const rows = linhas(quantas)

  // ESTÁVEIS, como o wizard agora os passa (`useCallback`). Declará-los inline
  // aqui reproduziria o defeito que este teste existe para vigiar, e a razão
  // não mudaria por mais que o app melhorasse.
  const nada = () => {}
  const cidades: never[] = []
  const topologia: Row[] = []

  const tela = (r: Row[]) => {
    // `dados` muda de identidade a cada edição, como o reducer faz — mas a
    // FATIA que a grade repassa às linhas (`sistema-topologia`) não muda.
    const dados = { 'subbacia-operacional': r, 'sistema-topologia': topologia } as unknown as Dados
    return (
      <AbaGrid
        aba={aba}
        rows={r}
        cidades={cidades}
        dados={dados}
        onCell={nada}
        onAddRow={nada}
        onDelRow={nada}
        onCells={nada}
        onAviso={nada}
      />
    )
  }

  const { rerender, unmount } = render(tela(rows))

  // AQUECE: o primeiro re-render depois do mount paga efeitos e refs, e mediria
  // a montagem em vez da edição.
  rerender(tela(rows))

  // Uma tecla numa célula: só UMA linha muda de identidade.
  const mexidas = [...rows]
  mexidas[10] = { ...mexidas[10], vazao_contribuicao: '42' }

  const t0 = performance.now()
  rerender(tela(mexidas))
  const gasto = performance.now() - t0

  unmount()
  return gasto
}

describe('custo de um render da grade', () => {
  it(`editar uma célula entre ${LINHAS} linhas custa menos de ${TETO_MS}ms`, () => {
    const gasto = custoDeUmaTecla(LINHAS)
    console.log(`[perf] uma célula entre ${LINHAS} linhas: ${gasto.toFixed(0)}ms`)
    expect(gasto).toBeLessThan(TETO_MS)
  }, 120_000)
})
