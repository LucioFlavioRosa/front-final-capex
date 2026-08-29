/**
 * "Usa sistema de CTS" — do wizard até a tabela, contra o backend de verdade.
 *
 * A regra existe nos dois lados e por razões diferentes: a tela desabilita o que
 * seria recusado, e o servidor recusa de todo jeito — quem desmarcar, adicionar
 * duas e marcar de volta passaria pela tela sem passar pela regra.
 *
 * Aqui se exercita o lado que a tela não consegue provar sozinha: a marca chega
 * ao banco, volta na leitura, e o limite é aplicado.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ApiError, api } from './api'
import { lerCadastro, salvarCadastro } from './cadastroApi'
import type { BaseDoCadastro } from './cadastroApi'
import type { UnidadeState } from '../data/cadastroUnidade/types'

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
const UNIDADE = 'uB1'

let noAr = false
let sistema = ''

beforeAll(async () => {
  try {
    noAr = (await fetch(`${BASE}/readyz`)).ok
  } catch {
    noAr = false
  }
})

/** Devolve tudo como estava: o teste roda duas vezes seguidas sem sujar a base. */
afterAll(async () => {
  if (!noAr || !sistema) return
  await api.put(`/api/unidades/${UNIDADE}/sistemas/${sistema}`, { usaCts: false })
})

/**
 * A BASE PAREADA COM O ESTADO QUE VEIO COM ELA.
 *
 * `salvarCadastro` passou a exigir a linha-base como parâmetro — antes ela vinha
 * de um `Map` escondido dentro de `cadastroApi`. Guardar num `let` solto daria
 * certo por sorte (a base do último `abrir` seria a de qualquer salvamento);
 * o `WeakMap` amarra cada base ao seu estado, e aí a ordem das chamadas não
 * importa.
 */
const bases = new WeakMap<UnidadeState, BaseDoCadastro>()

/** Salva o estado com a base que a leitura dele devolveu. */
function salvar(estado: UnidadeState) {
  const base = bases.get(estado)
  if (!base) throw new Error('estado montado sem `abrir()` — não há base para o diff')
  return salvarCadastro(estado, base)
}

async function abrir(): Promise<UnidadeState> {
  const lido = await lerCadastro(UNIDADE)
  const estado: UnidadeState = {
    id: lido.unidade_id,
    name: lido.unidade_nome,
    regionalName: lido.regional_nome,
    cidades: [],
    data: lido.dados,
  }
  bases.set(estado, lido.base)
  return estado
}

describe('usa_sistema_cts contra o backend real', () => {
  it('marcar no wizard chega ao banco e volta na leitura', async () => {
    if (!noAr) return console.log('backend fora do ar — pulado')

    const antes = await abrir()

    // ESCOLHE UM SISTEMA SEM CTS, em vez do primeiro da lista.
    //
    // A base é de trabalho: alguém pode ter marcado um sistema ou colocado uma
    // CTS testando na tela — e foi o que aconteceu na primeira execução deste
    // teste. Um teste que assume base limpa reprova por causa do uso normal do
    // produto, e ensina a ignorá-lo.
    const comCts = new Set(
      antes.data['sistema-topologia']
        .filter((t) => t.sistema_id && t.componente_tipo === 'cts')
        .map((t) => t.sistema_id),
    )
    const linha = antes.data['cidade-sistema'].find((r) => !comCts.has(r.sistema_id))!
    expect(linha).toBeDefined()
    sistema = linha.sistema_id

    // Parte do DESMARCADO, seja qual for o estado herdado.
    await api.put(`/api/unidades/${UNIDADE}/sistemas/${sistema}`, { usaCts: false })
    linha.usa_sistema_cts = 'Nao'

    linha.usa_sistema_cts = 'Sim'
    await salvar(antes)

    const depois = await abrir()
    const relida = depois.data['cidade-sistema'].find((r) => r.sistema_id === sistema)
    expect(relida?.usa_sistema_cts).toBe('Sim')
  }, 300_000)

  it('com a marca, o servidor recusa a SEGUNDA CTS no sistema', async () => {
    if (!noAr) return console.log('backend fora do ar — pulado')

    // CTS fora de sistema — o estado de quem ainda vai montar. Colocar a
    // primeira passa; a segunda tem de ser recusada.
    const estado = await abrir()
    const soltas = estado.data['sistema-topologia']
      .filter((t) => t.sistema_id === '' && t.componente_tipo === 'cts')
      .map((t) => t.componente_sistema_id)
    expect(soltas.length).toBeGreaterThan(1)

    const u = `/api/unidades/${UNIDADE}/topologia`
    await api.put(`${u}/${soltas[0]}`, { sisId: sistema, jusante: '' })

    let recusa: ApiError | null = null
    try {
      await api.put(`${u}/${soltas[1]}`, { sisId: sistema, jusante: '' })
    } catch (e) {
      recusa = e as ApiError
    }

    expect(recusa).not.toBeNull()
    expect(recusa!.status).toBe(422)
    // A mensagem NOMEIA a CTS que já está lá — é ela que vai para o toast.
    expect(recusa!.message).toContain(soltas[0])

    // devolve a primeira CTS para fora do sistema
    await api.del(`${u}/${soltas[0]}`)
  }, 300_000)
})
