/**
 * Envia para o banco o cadastro que o frontend gera hoje em memória.
 *
 * POR QUE ESTE SCRIPT VIVE NO FRONTEND, e não no backend: a montagem do
 * cadastro de uma unidade é `seed()`, e ela combina a hierarquia real, a base
 * comercial de sub-bacia e CTS, os ids gerados e os exemplos de obra — tudo em
 * TypeScript, com regras que mudam a cada revisão com a Aegea (filtro de
 * sistemas por número de cidades, CTS recortada por EMP_CODIGO, alinhamento de
 * nome de sistema com a cidade). Reimplementar isso em Python criaria duas
 * versões da mesma regra, e a segunda começaria a divergir no primeiro ajuste.
 *
 * Então o script IMPORTA o `seed` de verdade e só faz o POST. O que vai para o
 * banco é, por construção, exatamente o que a tela mostrava.
 *
 * Uso (com o backend rodando):
 *   npx tsx scripts/semear-banco.ts 56
 *   npx tsx scripts/semear-banco.ts 56 57 --api http://127.0.0.1:8000
 *   npx tsx scripts/semear-banco.ts --todas
 */
import { seed } from './seed'
import { REGIONAL_POR_UNIDADE, nomeUnidade } from './hierarquiaReal'

const argv = process.argv.slice(2)

const iApi = argv.indexOf('--api')
const API = iApi === -1 ? 'http://127.0.0.1:8000' : argv[iApi + 1]
const todas = argv.includes('--todas')
const alvos = todas
  ? Object.keys(REGIONAL_POR_UNIDADE)
  : argv.filter((a) => !a.startsWith('--') && a !== API)

if (!alvos.length) {
  console.error('Informe ao menos um EMP_CODIGO, ou --todas.')
  process.exit(1)
}

let falhas = 0

for (const unId of alvos) {
  const nome = nomeUnidade(unId)
  const regional = REGIONAL_POR_UNIDADE[unId]

  if (!regional) {
    console.error(`  ${unId.padEnd(6)} IGNORADA — EMP_CODIGO não existe no de-para real`)
    falhas++
    continue
  }

  const unidade = seed(unId, nome, regional)
  const linhas = Object.values(unidade.data).reduce((t, rows) => t + rows.length, 0)

  const resposta = await fetch(`${API}/api/cadastro`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      unidade_id: unidade.id,
      unidade_nome: unidade.name,
      regional_nome: unidade.regionalName,
      dados: unidade.data,
    }),
  })

  if (!resposta.ok) {
    console.error(`  ${unId.padEnd(6)} FALHOU ${resposta.status} — ${await resposta.text()}`)
    falhas++
    continue
  }

  const r = (await resposta.json()) as { atualizado_em: string }
  const abas = Object.keys(unidade.data).length
  console.log(
    `  ${unId.padEnd(6)} ${nome.padEnd(24)} ${String(linhas).padStart(6)} linhas em ${abas} abas   ${r.atualizado_em}`,
  )
}

console.log(falhas ? `\n${falhas} unidade(s) com problema.` : '\nTodas gravadas.')
process.exit(falhas ? 1 : 0)
