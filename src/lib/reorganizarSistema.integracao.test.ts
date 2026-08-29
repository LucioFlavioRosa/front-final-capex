/**
 * REORGANIZAR UM SISTEMA E SALVAR — contra o backend de verdade.
 *
 * O defeito que este arquivo prende foi visto na tela: tirar uma CTS do sistema e
 * reapontar quem escoava para ela devolvia
 *
 *     'cts_002' não pode sair do sistema enquanto 'cts_001' escoa(m) para ele.
 *
 * com o desenho da tela já correto. A gravação mandava um `PUT` por componente e
 * escolhia a ordem por uma heurística que olhava o estado final de cada linha
 * isolada — a saída da CTS ia na frente do reapontamento que a liberava. Não era
 * caso de acertar a ordem: um reapontamento É um "solta" do ponto de vista de
 * quem ele larga, e mover uma cadeia inteira de sistema não tem ordem que passe.
 *
 * `envioDaTopologia.test.ts` prende o corpo que sai daqui. Este prende a outra
 * ponta: que o servidor ACEITA esse corpo e que o dado volta como a tela deixou.
 * Os dois juntos cobrem o caminho inteiro; nenhum dos dois sozinho pegaria a
 * volta do defeito.
 *
 * Restaura o estado no fim, para a suíte poder rodar duas vezes seguidas.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { lerCadastro, salvarCadastro } from './cadastroApi'
import type { BaseDoCadastro } from './cadastroApi'
import type { Row, UnidadeState } from '../data/cadastroUnidade/types'

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

const idDe = (t: Row) => String(t.componente_sistema_id ?? '').trim()
const jusanteDe = (t: Row) => String(t.componente_sistema_id_jusante ?? '').trim()

/**
 * Uma CTS que está num sistema, tem destino, e tem alguém escoando para ela — a
 * forma exata do caso relatado. Sem os três não há o que reorganizar.
 */
function acharOCaso(estado: UnidadeState) {
  const topo = estado.data['sistema-topologia'] ?? []
  const ehCts = new Set(
    (estado.data['cts-operacional'] ?? []).map((c) => String(c.cts_id ?? '').trim()),
  )
  for (const cts of topo) {
    const id = idDe(cts)
    if (!ehCts.has(id) || !String(cts.sistema_id ?? '').trim() || !jusanteDe(cts)) continue
    const acima = topo.find((t) => jusanteDe(t) === id)
    if (acima) return { cts, acima }
  }
  return null
}

describe('reorganizar um sistema e salvar', () => {
  it('tirar a CTS e reapontar quem escoava para ela é aceito, e o dado volta', async () => {
    if (!noAr) return console.log('backend fora do ar — pulado')

    const antes = await abrir()
    const caso = acharOCaso(antes)
    if (!caso) return console.log('sem CTS com montante no cadastro — pulado')

    const idCts = idDe(caso.cts)
    const idAcima = idDe(caso.acima)
    const sistema = String(caso.cts.sistema_id ?? '').trim()
    const destinoDaCts = jusanteDe(caso.cts)

    // O que a tela faria: a CTS sai do sistema e quem escoava para ela passa a
    // escoar direto para o destino que era dela.
    caso.acima.componente_sistema_id_jusante = destinoDaCts
    caso.cts.sistema_id = ''
    caso.cts.componente_sistema_id_jusante = ''

    await salvar(antes)

    const depois = await abrir()
    const topoDepois = depois.data['sistema-topologia'] ?? []
    const ctsDepois = topoDepois.find((t) => idDe(t) === idCts)!
    const acimaDepois = topoDepois.find((t) => idDe(t) === idAcima)!

    expect(String(ctsDepois.sistema_id ?? '').trim()).toBe('')
    expect(jusanteDe(ctsDepois)).toBe('')
    expect(jusanteDe(acimaDepois)).toBe(destinoDaCts)
    // A ficha da CTS CONTINUA no cadastro — sair do sistema não é apagar, e o
    // nome dela só existe na linha da topologia.
    expect(String(ctsDepois.componente_sistema_nome ?? '')).not.toBe('')

    // ---- devolve como estava, que é a mesma reorganização ao contrário ----
    ctsDepois.sistema_id = sistema
    ctsDepois.componente_sistema_id_jusante = destinoDaCts
    acimaDepois.componente_sistema_id_jusante = idCts
    await salvar(depois)

    const final = await abrir()
    const topoFinal = final.data['sistema-topologia'] ?? []
    const ctsFinal = topoFinal.find((t) => idDe(t) === idCts)!
    expect(String(ctsFinal.sistema_id ?? '').trim()).toBe(sistema)
    expect(jusanteDe(ctsFinal)).toBe(destinoDaCts)
    expect(jusanteDe(topoFinal.find((t) => idDe(t) === idAcima)!)).toBe(idCts)
  })

  it('salvar sem mexer na topologia não manda nada e não mexe no desenho', async () => {
    if (!noAr) return console.log('backend fora do ar — pulado')

    const antes = await abrir()
    const desenho = (antes.data['sistema-topologia'] ?? []).map(
      (t) => `${idDe(t)}|${String(t.sistema_id ?? '').trim()}|${jusanteDe(t)}`,
    )
    await salvar(antes)

    const depois = await abrir()
    expect(
      (depois.data['sistema-topologia'] ?? []).map(
        (t) => `${idDe(t)}|${String(t.sistema_id ?? '').trim()}|${jusanteDe(t)}`,
      ),
    ).toEqual(desenho)
  })
})
