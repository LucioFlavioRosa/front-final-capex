/**
 * CRIAR EMPRESA PELA PLANILHA, COM ARQUIVO DE VERDADE.
 *
 * O teste do domínio prova a regra com abas fabricadas à mão, e ele passa. O dono do
 * produto, na tela, continua lendo *"a1sup5 não existe no cadastro — ignorada"* — com o
 * bundle novo confirmado pelo log do servidor. Então o defeito está entre as duas coisas:
 * no que a biblioteca ESCREVE no arquivo e LÊ de volta, e não na regra.
 *
 * Este teste faz o caminho inteiro — gerar o `.xlsx`, acrescentar a linha como uma pessoa
 * acrescentaria no Excel, ler de volta, mesclar — porque é o único jeito de pegar um
 * defeito que vive na junta.
 */
import { describe, expect, it } from 'vitest'
import ExcelJS from 'exceljs'
import { gerarPlanilha, lerPlanilha, LIMITE_DA_DICA, PRIMEIRA_LINHA_DE_DADO } from './planilhaCadastro'
import { mesclarPlanilha } from '../domain/planilha'
import { unidadeDeTeste } from '../testes/cadastroDePlanilha'

async function abrir(buffer: ArrayBuffer): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buffer)
  return wb
}

describe('criar empresa pela planilha, arquivo de verdade', () => {
  it('a linha acrescentada no Excel é criada, e não ignorada', async () => {
    const unidade = unidadeDeTeste()
    const wb = await abrir(await gerarPlanilha(unidade))
    const ws = wb.getWorksheet('Empresas')!

    //: os códigos ficam na linha 2 — é por eles que a importação reconhece a coluna
    const codigos = (ws.getRow(2).values as unknown[]).map((v) => String(v ?? ''))
    const col = (nome: string) => {
      const i = codigos.indexOf(nome)
      expect(i, `a aba Empresas do arquivo não tem a coluna "${nome}"`).toBeGreaterThan(0)
      return i
    }

    // A LINHA NOVA, como alguém a escreve: depois da última, só com o que se sabe.
    const nova = ws.getRow(ws.rowCount + 1)
    nova.getCell(col('emp_codigo')).value = 'a1sup5'
    nova.getCell(col('empresa')).value = 'Empresa Nova do Teste'
    nova.getCell(col('data_fim_concessao')).value = 2050
    nova.commit()

    const lida = await lerPlanilha((await wb.xlsx.writeBuffer()) as ArrayBuffer)

    //: primeiro: a biblioteca leu a linha nova?
    const abaLida = lida['Empresas']
    expect(abaLida, 'a aba Empresas não foi lida').toBeDefined()
    const crua = abaLida.linhas.find((l) => String(l.emp_codigo ?? '') === 'a1sup5')
    expect(crua, `a linha nova não foi lida. Linhas: ${JSON.stringify(abaLida.linhas)}`).toBeDefined()

    const r = mesclarPlanilha(unidade, lida)
    const criada = r.dados['empresa']?.find((l) => l.emp_codigo === 'a1sup5')
    expect(criada, `não criou. Avisos: ${JSON.stringify(r.avisos)}`).toBeDefined()
    expect(criada).toMatchObject({
      emp_codigo: 'a1sup5',
      empresa: 'Empresa Nova do Teste',
      data_fim_concessao: '2050',
      unidade_id: 'uT1',
    })
    expect(r.avisos.join(' ')).toContain('será CRIADA ao salvar')
  })

  it('a linha nova NÃO precisa das colunas de leitura preenchidas', async () => {
    // `unidade_id` vem do contexto, não da célula — quem acrescenta a linha não deveria
    // ter de descobrir o id da unidade para preenchê-lo.
    const unidade = unidadeDeTeste()
    const wb = await abrir(await gerarPlanilha(unidade))
    const ws = wb.getWorksheet('Empresas')!
    const codigos = (ws.getRow(2).values as unknown[]).map((v) => String(v ?? ''))
    const nova = ws.getRow(ws.rowCount + 1)
    nova.getCell(codigos.indexOf('emp_codigo')).value = 'a1sup9'
    nova.getCell(codigos.indexOf('empresa')).value = 'Só código e nome'
    nova.commit()
    const r = mesclarPlanilha(unidade, await lerPlanilha((await wb.xlsx.writeBuffer()) as ArrayBuffer))
    const criada = r.dados['empresa']?.find((l) => l.emp_codigo === 'a1sup9')
    expect(criada, `não criou. Avisos: ${JSON.stringify(r.avisos)}`).toBeDefined()
    expect(criada?.unidade_id).toBe('uT1')
  })

  it('o sistema da CTS tem lista suspensa, apontando para a aba Sistemas', async () => {
    /**
     * *"queria que todas as automações que temos na parte de preenchimento no front
     * fossem de alguma maneira para a planilha"* — 01/10/2026.
     *
     * Na tela esta coluna é um `select`. No arquivo era texto livre: a pessoa digitava o
     * nome e descobria o erro uma importação depois.
     *
     * POR FAIXA, e não por lista literal: a fórmula de uma lista embutida cabe em 255
     * caracteres, e uma unidade com 30 sistemas estoura — o Excel abre reclamando.
     */
    const unidade = unidadeDeTeste()
    const wb = await abrir(await gerarPlanilha(unidade))
    const ws = wb.getWorksheet('Dados da CTS')!
    const codigos = (ws.getRow(2).values as unknown[]).map((v) => String(v ?? ''))
    const ci = codigos.indexOf('sistema_id')
    expect(ci).toBeGreaterThan(0)
    const validacao = ws.getRow(3).getCell(ci).dataValidation
    expect(validacao, 'a célula do sistema não tem lista suspensa').toBeDefined()
    expect(validacao!.type).toBe('list')
    //: a faixa aponta para a coluna de id da aba de apoio, com o nome entre aspas
    expect(validacao!.formulae?.[0]).toBe("'Sistemas'!$A$3:$A$4")
    expect(validacao!.allowBlank).toBe(true)
  })

  it('as DUAS listas do Fluxo dependem da LINHA: origem pela empresa, destino pelo sistema', async () => {
    /**
     * O PEDIDO, em 02/10/2026: *"quando eu criar uma linha na aba fluxo de escoamento, na
     * coluna ID Origem tem que aparecer uma lista suspensa as cts que não estão ligadas a
     * nenhum outro sistema, e na coluna ID Destino a lista suspensa deve conter os ID
     * Origem que pertencem ao mesmo sistema ID Sistema"*.
     *
     * Duas listas de naturezas diferentes, e a segunda é o problema interessante: ela
     * depende da LINHA. A validação do Excel não sabe de linha — a não ser com `INDIRECT`
     * sobre um nome definido, um por sistema, que é o que a aba `Componentes` permite.
     *
     * Isso também conserta o que a revisão do Codex apontou na primeira versão: a lista do
     * destino apontava para a coluna inteira e oferecia componentes de TODOS os sistemas.
     */
    const unidade = unidadeDeTeste()
    const wb = await abrir(await gerarPlanilha(unidade))
    const ws = wb.getWorksheet('Fluxo de escoamento')!
    const codigos = (ws.getRow(2).values as unknown[]).map((v) => String(v ?? ''))
    const iOrigem = codigos.indexOf('componente_sistema_id')
    const iDestino = codigos.indexOf('componente_sistema_id_jusante')
    const iSistema = codigos.indexOf('sistema_id')

    const letraSis = String.fromCharCode(64 + iSistema)
    const origem = ws.getRow(3).getCell(iOrigem).dataValidation
    expect(origem, 'o ID Origem não tem lista suspensa').toBeDefined()
    //: DEPENDE DA LINHA desde 02/10/2026: a lista recorta por EMPRESA do sistema daquela
    //: linha, porque pôr todas as CTS fez a lista oferecer o que o servidor recusa
    expect(origem!.formulae?.[0]).toBe(`=INDIRECT("org_"&$${letraSis}3)`)
    expect(ws.getRow(4).getCell(iOrigem).dataValidation?.formulae?.[0])
      .toBe(`=INDIRECT("org_"&$${letraSis}4)`)

    const destino = ws.getRow(3).getCell(iDestino).dataValidation
    expect(destino, 'o ID Destino não tem lista suspensa').toBeDefined()
    //: `$A` é a coluna do ID Sistema (absoluta) e `3` é a linha (RELATIVA) — é isso que
    //: faz cada linha resolver o nome do próprio sistema
    expect(destino!.formulae?.[0]).toBe(`=INDIRECT("sis_"&$${letraSis}3)`)
    //: e a linha 4 resolve pela linha 4, não pela 3
    expect(ws.getRow(4).getCell(iDestino).dataValidation?.formulae?.[0])
      .toBe(`=INDIRECT("sis_"&$${letraSis}4)`)

    // SUGEREM, NÃO RECUSAM: a linha existente pode ter origem que não está entre as
    // livres, e travar a célula impediria colar em massa. `showErrorMessage` sai AUSENTE
    // do arquivo (a biblioteca omite o `false`), e ausente é o mesmo que não recusar.
    expect(destino!.showErrorMessage).not.toBe(true)
    expect(destino!.showInputMessage).toBe(true)
  })

  it('as linhas VAZIAS do Fluxo já vêm com as duas listas', async () => {
    // "Quando eu criar uma linha" quer dizer digitar ABAIXO da última, e validação do
    // Excel é por célula: sem estender, a linha nova nasce sem lista — justo no momento em
    // que a lista serve.
    const unidade = unidadeDeTeste()
    const wb = await abrir(await gerarPlanilha(unidade))
    const ws = wb.getWorksheet('Fluxo de escoamento')!
    const codigos = (ws.getRow(2).values as unknown[]).map((v) => String(v ?? ''))
    const dados = (unidade.data['sistema-topologia'] ?? []).length
    const linha = ws.getRow(PRIMEIRA_LINHA_DE_DADO + dados)
    expect(linha.getCell(codigos.indexOf('componente_sistema_id')).value, 'tem de estar vazia').toBeFalsy()
    expect(linha.getCell(codigos.indexOf('componente_sistema_id')).dataValidation?.formulae?.[0])
      .toContain('INDIRECT("org_"')
    expect(linha.getCell(codigos.indexOf('componente_sistema_id_jusante')).dataValidation?.formulae?.[0])
      .toContain('INDIRECT')
  })

  it('os nomes definidos existem, e cobrem o bloco de cada sistema', async () => {
    /**
     * O ELO QUE SUSTENTA A LISTA DO DESTINO. `=INDIRECT("sis_"&$A3)` só resolve se o nome
     * `sis_<sistema>` existir no arquivo — e, não existindo, a lista sai VAZIA em silêncio,
     * que é o pior jeito de falhar: a célula parece ter lista e não oferece nada.
     *
     * Medi a ida e volta antes de desenhar assim; este teste é o que prende a medição.
     */
    const unidade = unidadeDeTeste()
    const wb = await abrir(await gerarPlanilha(unidade))
    const nomes = (wb.definedNames as unknown as { model: { name: string; ranges: string[] }[] }).model
    const porNome = new Map(nomes.map((n) => [n.name, n.ranges]))

    //: um nome por sistema que tem componente — o fixture tem o s1
    expect(porNome.get('sis_s1'), `nomes: ${[...porNome.keys()].join(', ')}`).toBeDefined()
    expect(porNome.get('sis_s1')![0]).toContain('Componentes')
    //: e o das CTS livres
    //: UM NOME POR SISTEMA também para as origens, na coluna K — as CTS que cabem nele
    expect(porNome.get('org_s1'), 'falta a faixa de origens de s1').toBeDefined()
    expect(porNome.get('org_s1')![0]).toContain('$K$')

    //: a faixa do sistema aponta para a coluna B (o id do componente), não para outra
    expect(porNome.get('sis_s1')![0]).toContain('$B$')
  })

  it('a aba Componentes agrupa por sistema, e lista TODAS as CTS com o sistema de hoje', async () => {
    // A CONTIGUIDADE é o ponto nas colunas de sistema: a faixa de um sistema só existe se
    // as linhas dele forem vizinhas, e é ela que o nome definido cobre.
    const unidade = unidadeDeTeste()
    const wb = await abrir(await gerarPlanilha(unidade))
    const ws = wb.getWorksheet('Componentes')!
    const codigos = (ws.getRow(2).values as unknown[]).map((v) => String(v ?? ''))
    expect(codigos).toEqual(expect.arrayContaining([
      'sistema_id', 'componente_sistema_id', 'cts', 'cts_empresa', 'cts_sistema', 'origem_cts',
    ]))
    const sistemas: string[] = []
    const cts: { id: string; sistema: string; emp: string }[] = []
    for (let n = PRIMEIRA_LINHA_DE_DADO; n <= ws.rowCount; n++) {
      const sis = String(ws.getRow(n).getCell(1).value ?? '')
      if (sis) sistemas.push(sis)
      const id = String(ws.getRow(n).getCell(codigos.indexOf('cts')).value ?? '')
      if (id) {
        cts.push({
          id,
          emp: String(ws.getRow(n).getCell(codigos.indexOf('cts_empresa')).value ?? ''),
          sistema: String(ws.getRow(n).getCell(codigos.indexOf('cts_sistema')).value ?? ''),
        })
      }
    }
    //: a empresa está à vista: a lista recorta por ela, e esconder a régua foi o que o
    //: dono do produto apontou na tela em 01/10 — "para evitar qualquer desalinhamento"
    expect(cts.every((c) => c.emp)).toBe(true)
    //: agrupado = cada sistema aparece num bloco só
    expect(sistemas).toEqual([...sistemas].sort())
    expect(sistemas.length).toBeGreaterThan(0)

    //: TODAS as CTS, e cada uma com o sistema onde está hoje
    expect(cts.map((c) => c.id)).toEqual(['cts_002', 'cts_001'])
    expect(cts.find((c) => c.id === 'cts_002')!.sistema, 'a livre vem sem sistema').toBe('')
    expect(cts.find((c) => c.id === 'cts_001')!.sistema).toBe('s1')
    //: AS LIVRES PRIMEIRO: a lista do ID Origem é esta coluna, e a ordem é o que coloca o
    //: caso comum no topo do que se abre
    expect(cts[0].sistema).toBe('')
  })

  it('a lista de origem só oferece CTS da EMPRESA do sistema', async () => {
    /**
     * O relato, em 02/10/2026, ao salvar uma planilha com o desenho certo:
     *
     *     A macrorregião 'Calumbê|d1sup3|uB1' é da empresa 'd1sup3', e o sistema 'd1s10' é
     *     de 'd1sup1'. Uma macrorregião só entra em sistema da empresa que a opera.
     *
     * Era efeito direto de pôr TODAS as CTS na lista: ela passou a oferecer o que o
     * servidor recusa. A régua do servidor é a EMPRESA, e vale igual para coletor comum e
     * macrorregião. É a mesma régua da tela, pela mesma função (`empresasDoSistema`).
     *
     * Este teste monta uma CTS de OUTRA empresa — o fixture tem só uma — e exige que ela
     * fique fora da faixa do sistema, e que a da empresa certa fique dentro.
     */
    const base = unidadeDeTeste()
    const unidade = {
      ...base,
      data: {
        ...base.data,
        'cts-operacional': [
          ...(base.data['cts-operacional'] ?? []),
          { emp_codigo: '99', empresa: 'Outra Operadora', cts_id: 'cts_de_outra', cts_name: 'De Outra', sistema_id: '' },
        ],
        'sistema-topologia': [
          ...(base.data['sistema-topologia'] ?? []),
          { sistema_id: '', componente_sistema_id: 'cts_de_outra', componente_sistema_nome: 'De Outra', componente_tipo: 'cts', emp_codigo: '99' },
        ],
      },
    }
    const wb = await abrir(await gerarPlanilha(unidade))
    const comps = wb.getWorksheet('Componentes')!
    const codigos = (comps.getRow(2).values as unknown[]).map((v) => String(v ?? ''))
    const iSis = codigos.indexOf('origem_sistema')
    const iCts = codigos.indexOf('origem_cts')

    const deS1: string[] = []
    for (let n = PRIMEIRA_LINHA_DE_DADO; n <= comps.rowCount; n++) {
      if (String(comps.getRow(n).getCell(iSis).value ?? '') !== 's1') continue
      deS1.push(String(comps.getRow(n).getCell(iCts).value ?? ''))
    }
    //: s1 é da empresa 57 (a cidade c1), e a CTS livre dessa empresa cabe nele
    expect(deS1).toContain('cts_002')
    //: a de outra empresa NÃO — era o que o servidor recusava depois, longe daqui
    expect(deS1).not.toContain('cts_de_outra')
    //: e a que já está em s1 não se oferece a si mesma: não mudaria nada
    expect(deS1).not.toContain('cts_001')

    //: mas ela existe no arquivo, na coluna de consulta — some da lista, não do cadastro
    const todas: string[] = []
    for (let n = PRIMEIRA_LINHA_DE_DADO; n <= comps.rowCount; n++) {
      const id = String(comps.getRow(n).getCell(codigos.indexOf('cts')).value ?? '')
      if (id) todas.push(id)
    }
    expect(todas).toContain('cts_de_outra')
  })

  it('TODA dica de célula cabe no que o Excel aceita, em toda aba', async () => {
    /**
     * O DEFEITO QUE ISTO PEGA, e que já chegou ao ar uma vez: uma dica de 286 caracteres.
     *
     * Acima de 255 o Excel não trunca — ele RECUSA abrir o arquivo (`0x800A03EC`) e, no
     * modo reparo, descarta a mensagem. A `exceljs` grava e relê qualquer tamanho, então
     * o teste de ida e volta passou feliz, e passariam também os outros 599: nenhum
     * media dica nenhuma. Quem mediu foi o Excel, na revisão.
     *
     * Varre as DUAS unidades de teste e todas as abas, porque a dica que estourar amanhã
     * não vai ser esta — e o arquivo inteiro cai junto com ela.
     */
    for (const macro of [true, false]) {
      const wb = await abrir(await gerarPlanilha(unidadeDeTeste(macro)))
      let vistas = 0
      for (const ws of wb.worksheets) {
        ws.eachRow((row) => {
          row.eachCell((cell) => {
            const v = cell.dataValidation as { prompt?: string; promptTitle?: string } | undefined
            if (!v?.prompt && !v?.promptTitle) return
            vistas++
            const onde = `${ws.name}!${cell.address}`
            expect((v.prompt ?? '').length, `dica longa em ${onde}`).toBeLessThanOrEqual(LIMITE_DA_DICA)
            //: o TÍTULO da dica tem teto próprio, e menor: 32
            expect((v.promptTitle ?? '').length, `título longo em ${onde}`).toBeLessThanOrEqual(32)
          })
        })
      }
      //: se nada foi visto, o teste não está provando nada — e foi assim que o 286 passou
      expect(vistas, 'nenhuma dica encontrada: o teste ficou cego').toBeGreaterThan(0)
    }
  })

  it('a aba das ETEs leva as duas colunas do módulo de expansão', async () => {
    // O outro sintoma do mesmo relato: "não vejo as duas colunas novas na ete". No
    // ARQUIVO elas têm de estar, com o código na linha 2 e âmbar no cabeçalho.
    const unidade = unidadeDeTeste()
    const wb = await abrir(await gerarPlanilha(unidade))
    const ws = wb.getWorksheet('CAPEX das ETEs')!
    const codigos = (ws.getRow(2).values as unknown[]).map((v) => String(v ?? ''))
    expect(codigos).toContain('capacidade_por_modulo_expansao')
    expect(codigos).toContain('capex_por_modulo_expansao')
    //: e o rótulo da linha 1 diz "inicial" nas duas do pacote de construção
    const rotulos = (ws.getRow(1).values as unknown[]).map((v) => String(v ?? ''))
    expect(rotulos).toContain('Capacidade por módulo inicial')
    expect(rotulos).toContain('CAPEX por módulo inicial')
  })
})
