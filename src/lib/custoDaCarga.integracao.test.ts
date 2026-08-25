/**
 * QUANTO CUSTA ABRIR O CADASTRO DE UMA UNIDADE.
 *
 * Contra o backend de verdade, com dado de verdade. Separa as três parcelas que
 * a intuição confunde — rede, montagem e cópia — para a decisão de arquitetura
 * ser tomada sobre a que pesa, e não sobre a que parece pesar.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { lerCadastro } from './cadastroApi'

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
const UNIDADE = 'uB1'

let noAr = false
beforeAll(async () => {
  try {
    noAr = (await fetch(`${BASE}/readyz`)).ok
  } catch {
    noAr = false
  }
})

describe('custo de abrir a unidade', () => {
  it('mede rede, parse, montagem e cópia', async () => {
    if (!noAr) return console.log('backend fora do ar — pulado')

    const rotas = ['hierarquia', 'contrato', 'sub-bacias', 'etes', 'cts']

    // ---- rede + parse, rota a rota ----
    const brutos: Record<string, string> = {}
    let rede = 0
    for (const r of rotas) {
      const t = performance.now()
      brutos[r] = await (await fetch(`${BASE}/api/unidades/${UNIDADE}/${r}`)).text()
      rede += performance.now() - t
    }

    let parse = 0
    for (const r of rotas) {
      const t = performance.now()
      JSON.parse(brutos[r])
      parse += performance.now() - t
    }

    const bytes = rotas.reduce((a, r) => a + brutos[r].length, 0)

    // ---- o caminho inteiro que a tela percorre ----
    const t0 = performance.now()
    const lido = await lerCadastro(UNIDADE)
    const total = performance.now() - t0

    const linhas = Object.entries(lido.dados)
      .map(([aba, rows]) => [aba, rows.length] as const)
      .sort((a, b) => b[1] - a[1])
    const soma = linhas.reduce((a, [, n]) => a + n, 0)

    // ---- a cópia profunda que `ultimaLeitura` guarda ----
    const t1 = performance.now()
    JSON.parse(JSON.stringify(lido.dados))
    const copia = performance.now() - t1

    console.log(
      `\n[carga] ${(bytes / 1024).toFixed(0)} KB em 5 rotas\n` +
        `[carga] rede=${rede.toFixed(0)}ms  parse=${parse.toFixed(0)}ms  ` +
        `copia=${copia.toFixed(0)}ms  lerCadastro TOTAL=${total.toFixed(0)}ms\n` +
        `[carga] ${soma} linhas em ${linhas.length} abas\n` +
        linhas
          .filter(([, n]) => n > 0)
          .map(([aba, n]) => `[carga]   ${String(n).padStart(5)}  ${aba}`)
          .join('\n'),
    )

    expect(soma).toBeGreaterThan(0)
  }, 300_000)
})
