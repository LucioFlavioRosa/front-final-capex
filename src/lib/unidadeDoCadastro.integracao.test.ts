/**
 * O QUE A UNIDADE INFORMA — do wizard até a tabela, contra o backend de verdade.
 *
 * São dois campos, e a mesma rota: a macrorregião de CTS e o WACC médio. Os dois
 * são digitados por gente, e nenhum vem do Databricks — por isso os dois têm de
 * voltar para o banco, e é isso que estes testes provam.
 *
 * MACRORREGIÃO DE CTS. A regra existe nos dois lados e por razões diferentes: a
 * tela desabilita o que seria recusado, e o servidor recusa de todo jeito — quem
 * desmarcar, adicionar duas e marcar de volta passaria pela tela sem passar pela
 * regra. A DECISÃO É DA UNIDADE e vale para todos os sistemas dentro dela; era
 * por sistema até a migração 016.
 *
 * WACC MÉDIO. Ficou anos editável na tela sem rota que o gravasse: quem digitava
 * perdia o valor no Salvar, calado. O teste do ida-e-volta é o que impede isso
 * de voltar a acontecer.
 *
 * Aqui se exercita o lado que a tela não consegue provar sozinha: o valor chega
 * ao banco, volta na leitura, e o limite é aplicado.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ApiError, api } from './api'
import { lerCadastro, salvarCadastro } from './cadastroApi'
import type { BaseDoCadastro } from './cadastroApi'
import type { UnidadeState } from '../data/cadastroUnidade/types'

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

/**
 * A UNIDADE PRECISA DE DUAS COISAS AO MESMO TEMPO: nenhum sistema com duas CTS
 * (senão marcar é recusado) e CTS SOLTAS de sobra (senão não há o que colocar).
 *
 * Era a uA1 porque a uB1 tinha um sistema com duas CTS. As duas eram as que
 * estavam num sistema da cidade errada, e saíram dele — hoje a uB1 tem zero
 * sistemas cheios.
 *
 * E a uA1 deixou de servir pelo outro lado: desde que a lista de CTS soltas
 * passou a ser recortada pela unidade (migração 018), a uA1 tem ZERO soltas —
 * as 151 da base são todas da uB1. Antes ela via as 151 como se fossem suas, que
 * é justamente o defeito corrigido.
 */
const UNIDADE = 'uB1'

let noAr = false

beforeAll(async () => {
  try {
    noAr = (await fetch(`${BASE}/readyz`)).ok
  } catch {
    noAr = false
  }
})

/** Devolve tudo como estava: o teste roda duas vezes seguidas sem sujar a base. */
afterAll(async () => {
  if (!noAr) return
  await api.put(`/api/unidades/${UNIDADE}`, { usaCts: false })
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

/** As CTS ainda fora de qualquer sistema — o estado de quem ainda vai montar. */
function ctsSoltas(estado: UnidadeState): string[] {
  return estado.data['sistema-topologia']
    .filter((t) => t.sistema_id === '' && t.componente_tipo === 'cts')
    .map((t) => t.componente_sistema_id)
}

/** Um sistema da unidade que hoje não tem CTS nenhuma. */
function sistemaVazio(estado: UnidadeState): string {
  const comCts = new Set(
    estado.data['sistema-topologia']
      .filter((t) => t.sistema_id && t.componente_tipo === 'cts')
      .map((t) => t.sistema_id),
  )
  // A base é de trabalho: alguém pode ter colocado uma CTS testando na tela. Um
  // teste que assume base limpa reprova por causa do uso normal do produto, e
  // ensina a ignorá-lo.
  const linha = estado.data['cidade-sistema'].find((r) => !comCts.has(r.sistema_id))
  if (!linha) throw new Error(`todos os sistemas de ${UNIDADE} já têm CTS`)
  return linha.sistema_id
}

describe('a ficha da unidade contra o backend real', () => {
  it('marcar a macrorregião no wizard chega ao banco e volta na leitura', async () => {
    if (!noAr) return console.log('backend fora do ar — pulado')

    // Parte do DESMARCADO, seja qual for o estado herdado.
    await api.put(`/api/unidades/${UNIDADE}`, { usaCts: false })

    const antes = await abrir()
    const linha = antes.data['unidade-regional'][0]
    expect(linha.usa_macrorregiao_cts).toBe('Nao')

    linha.usa_macrorregiao_cts = 'Sim'
    await salvar(antes)

    const depois = await abrir()
    expect(depois.data['unidade-regional'][0].usa_macrorregiao_cts).toBe('Sim')

    // E A MARCA NÃO VOLTOU PARA O SISTEMA: a coluna saiu de `cidade-sistema`, e
    // uma leitura que ainda a trouxesse significaria que o servidor tem duas
    // fontes para a mesma resposta.
    expect(depois.data['cidade-sistema'][0].usa_macrorregiao_cts).toBeUndefined()
  }, 300_000)

  it('o WACC médio digitado na tela chega ao banco e volta na leitura', async () => {
    if (!noAr) return console.log('backend fora do ar — pulado')

    const antes = await abrir()
    const original = antes.data['unidade-regional'][0].wacc_medio

    // UM VALOR QUE NÃO É O QUE ESTÁ LÁ, seja qual for o que esteja: comparar
    // contra um número fixo passaria por acaso se a base já o tivesse.
    const novo = original === '0,0777' ? '0,0888' : '0,0777'
    antes.data['unidade-regional'][0].wacc_medio = novo
    await salvar(antes)

    const depois = await abrir()
    expect(depois.data['unidade-regional'][0].wacc_medio).toBe(novo)

    // devolve o valor de origem
    depois.data['unidade-regional'][0].wacc_medio = original
    await salvar(depois)
    expect((await abrir()).data['unidade-regional'][0].wacc_medio).toBe(original)
  }, 300_000)

  it('gravar só o WACC não apaga a macrorregião, e vice-versa', async () => {
    if (!noAr) return console.log('backend fora do ar — pulado')

    // A ROTA É A MESMA PARA OS DOIS CAMPOS, e é isso que torna o apagamento
    // silencioso possível: um `UPDATE` de ficha inteira zeraria a coluna cuja
    // chave não veio no corpo. Aqui se prova que chave ausente não é apagamento.
    await api.put(`/api/unidades/${UNIDADE}`, { usaCts: true })
    const comMarca = await abrir()
    const wacc = comMarca.data['unidade-regional'][0].wacc_medio

    await api.put(`/api/unidades/${UNIDADE}`, { waccMedio: '0,1234' })
    const so = await abrir()
    expect(so.data['unidade-regional'][0].wacc_medio).toBe('0,1234')
    expect(so.data['unidade-regional'][0].usa_macrorregiao_cts).toBe('Sim')

    await api.put(`/api/unidades/${UNIDADE}`, { usaCts: false })
    const depois = await abrir()
    expect(depois.data['unidade-regional'][0].wacc_medio).toBe('0,1234')
    expect(depois.data['unidade-regional'][0].usa_macrorregiao_cts).toBe('Nao')

    await api.put(`/api/unidades/${UNIDADE}`, { waccMedio: wacc })
  }, 300_000)

  it('com a macrorregião marcada, o servidor recusa a SEGUNDA CTS num sistema', async () => {
    if (!noAr) return console.log('backend fora do ar — pulado')

    await api.put(`/api/unidades/${UNIDADE}`, { usaCts: true })

    const estado = await abrir()
    const soltas = ctsSoltas(estado)
    expect(soltas.length).toBeGreaterThan(1)
    const sistema = sistemaVazio(estado)

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

  it('marcar é recusado enquanto um sistema tiver duas CTS, e a recusa nomeia o sistema', async () => {
    if (!noAr) return console.log('backend fora do ar — pulado')

    // O TESTE CRIA A CONDIÇÃO em vez de procurá-la numa unidade que a tenha: só
    // assim ele diz a mesma coisa em qualquer base, e limpa o que sujou.
    await api.put(`/api/unidades/${UNIDADE}`, { usaCts: false })

    const estado = await abrir()
    const soltas = ctsSoltas(estado)
    expect(soltas.length).toBeGreaterThan(1)
    const sistema = sistemaVazio(estado)

    const u = `/api/unidades/${UNIDADE}/topologia`
    await api.put(`${u}/${soltas[0]}`, { sisId: sistema, jusante: '' })
    await api.put(`${u}/${soltas[1]}`, { sisId: sistema, jusante: '' })

    let recusa: ApiError | null = null
    try {
      await api.put(`/api/unidades/${UNIDADE}`, { usaCts: true })
    } catch (e) {
      recusa = e as ApiError
    }

    expect(recusa).not.toBeNull()
    expect(recusa!.status).toBe(422)
    // NOMEIA O SISTEMA e as CTS: é o que a caixa precisa dizer para a pessoa
    // saber onde ir tirar a excedente.
    expect(recusa!.message).toContain(sistema)
    expect(recusa!.message).toContain(soltas[0])
    expect(recusa!.message).toContain(soltas[1])

    await api.del(`${u}/${soltas[0]}`)
    await api.del(`${u}/${soltas[1]}`)
  }, 300_000)
})
