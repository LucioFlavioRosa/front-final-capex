/**
 * As regras da nova simulação. Testáveis sem tela porque tudo em
 * `domain/simulacao.ts` é função pura — que é o motivo de ter sido escrito assim.
 */
import { describe, expect, it } from 'vitest'
import {
  bloqueado,
  corpoDaRodada,
  derivarOrcamento,
  estadoInicial,
  etapaDe,
  MILHAO,
  num,
  numOuNulo,
  rotuloFoco,
  validar,
  resumirFaltando,
  type Prontidao,
} from '@/rodada/domain/simulacao'

const PRONTA: Prontidao = { unidadeId: 'u1', unidadeNome: 'Unidade Litoral', pendencias: 0 }
const PENDENTE: Prontidao = { unidadeId: 'u2', unidadeNome: 'Unidade Serrana', pendencias: 46 }

describe('num — parsing pt-BR com a notação do notebook', () => {
  it('COM vírgula, o ponto é separador de milhar', () => {
    expect(num('1.234,5')).toBe(1234.5)
    expect(num('60.000,00')).toBe(60000)
  })

  it('SEM vírgula, o ponto é decimal — é como o notebook escreve', () => {
    // Esta e a metade da regra que quase todo mundo erra: `0.35` copiado do
    // notebook nao pode virar 35.
    expect(num('0.35')).toBe(0.35)
    expect(num('60.5')).toBe(60.5)
  })

  it('vírgula sozinha é decimal', () => {
    expect(num('0,35')).toBe(0.35)
  })

  it('lixo é RECUSADO, não parcialmente aceito', () => {
    // O projeto de cadastro ja pagou por um parser tolerante: parseFloat('123abc')
    // devolvia 123 e o lixo contaminava CAPEX em silencio. Aqui seria pior — um
    // "12abc" num ano do orcamento viraria verba que ninguem digitou.
    expect(numOuNulo('12abc')).toBeNull()
    expect(numOuNulo('abc')).toBeNull()
    expect(numOuNulo('1.2.3')).toBeNull()
    expect(numOuNulo('')).toBeNull()
    // Para somas e derivacoes, invalido conta como 0.
    expect(num('12abc')).toBe(0)
  })
})

describe('cronograma inválido bloqueia em vez de enviar outra coisa', () => {
  it('ano repetido bloqueia — o rodapé somaria os dois, o payload manda um', () => {
    const e = { ...estadoInicial(), unidadeId: 'u1' }
    e.orcamento = [
      { ano: '2026', valor: '10' },
      { ano: '2026', valor: '20' },
    ]
    // O total mostra 30...
    expect(derivarOrcamento(e).total).toBe(30)
    // ...mas o payload so leva um dos dois. Por isso bloqueia.
    expect(Object.keys(corpoDaRodada(e).orcamento ?? {})).toEqual(['2026'])
    const c = validar(e, PRONTA)
    expect(bloqueado(c)).toBe(true)
    expect(c.some((x) => x.texto.includes('repetido'))).toBe(true)
  })

  it('ano ou valor inválido bloqueia', () => {
    const e = { ...estadoInicial(), unidadeId: 'u1' }
    e.orcamento = [{ ano: 'abcd', valor: '10' }]
    expect(bloqueado(validar(e, PRONTA))).toBe(true)

    const e2 = { ...estadoInicial(), unidadeId: 'u1' }
    e2.orcamento = [{ ano: '2026', valor: '12abc' }]
    expect(bloqueado(validar(e2, PRONTA))).toBe(true)
  })

  it('verba negativa bloqueia', () => {
    const e = { ...estadoInicial(), unidadeId: 'u1' }
    e.orcamento = [{ ano: '2026', valor: '-5' }]
    expect(bloqueado(validar(e, PRONTA))).toBe(true)
  })
})

describe('derivarOrcamento', () => {
  it('a janela é derivada dos anos COM verba, não do tamanho da lista', () => {
    const e = estadoInicial()
    e.orcamento = [
      { ano: '2026', valor: '60' },
      { ano: '2027', valor: '0' },
      { ano: '2028', valor: '40' },
    ]
    const d = derivarOrcamento(e)
    expect(d.total).toBe(100)
    // 2027 esta na lista mas nao tem verba: nao entra na contagem.
    expect(d.anosComVerba).toEqual([2026, 2028])
    expect(d.janelaTexto).toBe('2026–2028 (2 anos)')
  })

  it('o pico é o default do teto de execução', () => {
    const e = estadoInicial()
    expect(derivarOrcamento(e).pico).toBe(60)
  })

  it('no modo valor único, divide o TOTAL igualmente pelo horizonte', () => {
    const e = {
      ...estadoInicial(),
      modoOrcamento: 'unico' as const,
      orcamentoValor: '400',
      horizonte: '8',
    }
    const d = derivarOrcamento(e)
    // orcamentoValor e o TOTAL do plano — a soma dos anos tem de bater com ele,
    // e nao com ele multiplicado pelo horizonte.
    expect(d.total).toBe(400)
    expect(d.valores[0]).toBe(50)
    expect(d.anosComVerba.length).toBe(8)
  })

  it('cronograma zerado não inventa janela', () => {
    const e = estadoInicial()
    e.orcamento = [{ ano: '2026', valor: '0' }]
    expect(derivarOrcamento(e).janelaTexto).toBe('sem verba')
  })
})

describe('validar — o que bloqueia e o que só avisa', () => {
  it('sem unidade, bloqueia', () => {
    expect(bloqueado(validar(estadoInicial(), undefined))).toBe(true)
  })

  it('cadastro com pendências bloqueia, e diz quantas', () => {
    const e = { ...estadoInicial(), unidadeId: 'u2' }
    const c = validar(e, PENDENTE)
    expect(bloqueado(c)).toBe(true)
    expect(c[0].texto).toContain('46 campos pendentes')
  })

  it('componente faltando vira linha própria, com a ficha e o nome', () => {
    // O total ("46 campos pendentes") não ajuda quem precisa corrigir ISTO: a
    // linha do componente que falta nem aparece na ficha, então a pessoa não tem
    // como descobri-la abrindo a tela. Enquanto havia base literal era pior — a
    // ficha mostrava a linha, preenchida com números de template.
    const c = validar(
      { ...estadoInicial(), unidadeId: 'u2' },
      {
        ...PENDENTE,
        faltando: [
          {
            tipo: 'sub-bacia',
            id: 'a1b25_1_1',
            componente: 'Coletor tronco',
            detalhe: 'Falta o componente Coletor tronco nesta sub-bacia.',
          },
        ],
      },
    )
    expect(bloqueado(c)).toBe(true)
    expect(c.some((x) => x.texto.includes('sub-bacia a1b25_1_1'))).toBe(true)
    expect(c.some((x) => x.texto.includes('Coletor tronco'))).toBe(true)
  })

  it('lista longa é cortada, e o corte DIZ quantos ficaram de fora', () => {
    // Trinta linhas vermelhas viram uma parede que ninguém lê. Silenciar as
    // demais seria pior: a pessoa corrigiria cinco e levaria a mesma recusa.
    const faltando = Array.from({ length: 9 }, (_, i) => ({
      tipo: 'sub-bacia',
      id: `b${i}`,
      componente: 'Rede coletora',
      detalhe: '',
    }))
    const frases = resumirFaltando(faltando)
    expect(frases).toHaveLength(6) // 5 + a linha do resto
    expect(frases[5]).toContain('mais 4')
  })

  it('servidor que não manda `faltando` não quebra o checklist', () => {
    // Compatibilidade com backend anterior a esta mudança: o campo é opcional, e
    // ausência é lista vazia — nunca um estouro no meio do render.
    expect(resumirFaltando(undefined)).toEqual([])
  })

  it('orçamento zerado bloqueia', () => {
    const e = { ...estadoInicial(), unidadeId: 'u1', orcamento: [{ ano: '2026', valor: '0' }] }
    expect(bloqueado(validar(e, PRONTA))).toBe(true)
  })

  it('não há mais aviso sobre metas — não há mais o que escolher', () => {
    // O checklist avisava "as metas serão ignoradas nesta rodada". A escolha que
    // gerava esse aviso saiu: as metas vêm sempre da base, e o único descarte é
    // por ano de CAPEX, que o motor faz sozinho e não é decisão de quem dispara.
    const c = validar({ ...estadoInicial(), unidadeId: 'u1' }, PRONTA)
    expect(c.some((x) => x.texto.includes('metas'))).toBe(false)
  })

  it('o corpo NÃO carrega os flags de ETE — o tratamento é da ficha, não da rodada', () => {
    // ETE nova (terreno + módulos informados) entra como pacote único; a que já
    // existe é expandida em módulos. Quem decide é o dado de CADA ETE, no motor.
    // `ETE_FASEADA` oferecia desligar isso — e o modo desligado trata a expansão
    // pior. `ETE_FIXO` era morto: o motor sai do fluxo antes de olhar para ele.
    const corpo = corpoDaRodada({ ...estadoInicial(), unidadeId: 'u1' })
    expect('ete_faseada' in corpo).toBe(false)
    expect('ete_fixo' in corpo).toBe(false)
  })

  it('tudo em ordem não gera nem bloqueio nem aviso', () => {
    const e = { ...estadoInicial(), unidadeId: 'u1' }
    const c = validar(e, PRONTA)
    expect(c.every((x) => x.severidade === 'ok')).toBe(true)
  })
})

describe('corpoDaRodada', () => {
  it('converte milhões para reais', () => {
    const e = { ...estadoInicial(), unidadeId: 'u1' }
    const corpo = corpoDaRodada(e)
    expect(corpo.orcamento?.['2026']).toBe(60 * MILHAO)
  })

  it('só manda anos COM verba no cronograma', () => {
    const e = { ...estadoInicial(), unidadeId: 'u1' }
    e.orcamento = [
      { ano: '2026', valor: '60' },
      { ano: '2027', valor: '0' },
    ]
    expect(Object.keys(corpoDaRodada(e).orcamento ?? {})).toEqual(['2026'])
  })

  it('o corpo NÃO carrega redistribuição nem teto de execução', () => {
    // Os dois saíram da tela por decisão do produto: a verba de cada ano é a do
    // cronograma, e o otimizador não a move entre anos. O teto só existia DENTRO
    // da redistribuição — sem ela, o teto de cada ano já é a verba dele.
    // `parametros.py` continua sabendo fazer o pré-processamento; voltar é
    // reintroduzir o interruptor.
    const corpo = corpoDaRodada({ ...estadoInicial(), unidadeId: 'u1' })
    expect('redistribuir_orcamento' in corpo).toBe(false)
    expect('teto_execucao_anual' in corpo).toBe(false)
  })

  it('o corpo NÃO carrega metas_cobertura — a fonte não é escolha da rodada', () => {
    // Ausente, e não `'cadastro'`: chave que não viaja é o jeito de o job usar o
    // proprio default (carregar da base). Mandar um valor fixo daria a impressão
    // de que existe alternativa.
    expect('metas_cobertura' in corpoDaRodada({ ...estadoInicial(), unidadeId: 'u1' })).toBe(false)
  })

  it('o corpo NÃO carrega afinação de execução', () => {
    // `max_time_s` e `workers` são execução, não decisão de negócio. O tempo é
    // fixado em 5000s pelo backend (e viaja no `params`, para o histórico
    // registrar); os workers ficam com o padrão do executor.
    const corpo = corpoDaRodada({ ...estadoInicial(), unidadeId: 'u1' })
    expect('max_time_s' in corpo).toBe(false)
    expect('workers' in corpo).toBe(false)
  })

  it('o corpo NÃO carrega peso_cidade — todas as cidades pesam 1', () => {
    // A ausência É o padrão pedido: o motor multiplica por
    // `peso_cidade.get(cidade, 1.0)`, então sem o parâmetro o multiplicador é 1
    // para todas. Mandar `{}` daria no mesmo e sugeriria que há escolha.
    expect('peso_cidade' in corpoDaRodada({ ...estadoInicial(), unidadeId: 'u1' })).toBe(false)
  })

  it('no modo valor único manda orcamento_anual + horizonte, e não o mapa', () => {
    const e = { ...estadoInicial(), unidadeId: 'u1', modoOrcamento: 'unico' as const }
    const corpo = corpoDaRodada(e)
    expect(corpo.orcamento).toBeUndefined()
    // orcamentoValor (default '50') e o TOTAL; o motor quer verba ANUAL — a
    // divisao pelo horizonte (default 8) acontece antes do payload sair.
    expect(corpo.orcamento_anual).toBe((50 * MILHAO) / 8)
    expect(corpo.horizonte_capex).toBe(8)
  })

  it('os defaults enviados são os do notebook', () => {
    const corpo = corpoDaRodada({ ...estadoInicial(), unidadeId: 'u1' })
    expect(corpo.foco_cobertura).toBe(1)
    expect(corpo.penalidade_cobertura).toBe('meta+cobertura')
    expect(corpo.base_receita).toBe('arrecadada')
    expect(corpo.curva_adocao).toBe('scurve')
    expect(corpo.usar_cts).toBe(true)
    // O default e NAO recortar: a meta conta todas as ligacoes, como sempre contou.
    // Trocar o default mudaria em silencio o significado de toda rodada antiga.
    expect(corpo.cobertura_so_residencial).toBe(false)
  })
})

describe('rótulos', () => {
  it('o foco ganha um rótulo legível nas três escolhas da tela', () => {
    expect(rotuloFoco(0)).toBe('só VPL')
    expect(rotuloFoco(0.5)).toBe('equilíbrio')
    expect(rotuloFoco(1)).toBe('cobertura em 1º lugar')
  })

  it('valor fora das três ainda responde — o payload aceita a faixa toda', () => {
    // A tela so produz 0, 0,5 e 1, mas um pedido montado fora dela pode trazer
    // qualquer valor entre 0 e 1. O resumo nao pode ficar sem rotulo por isso.
    expect(rotuloFoco(0.2)).toBe('equilíbrio')
    expect(rotuloFoco(0.8)).toBe('equilíbrio')
  })

  it('as etapas do progresso seguem a ordem do job', () => {
    expect(etapaDe(0)).toContain('Lendo dados')
    expect(etapaDe(30)).toContain('modelo')
    expect(etapaDe(60)).toContain('solver')
    expect(etapaDe(95)).toContain('Materializando')
    expect(etapaDe(100)).toContain('Concluída')
  })

  it('na fila NÃO anuncia etapa nenhuma — nada está executando', () => {
    // PENDENTE nao e progresso zero: e ausencia de execucao. Dizer "Lendo dados
    // da unidade" ali afirma uma atividade que nao acontece, e contradiz o motivo
    // da fila que aparece na linha seguinte do mesmo modal.
    expect(etapaDe(0, true)).not.toContain('Lendo dados')
    expect(etapaDe(0, true)).toContain('fila')
  })

  it('o texto da fila não repete o motivo, que é do backend', () => {
    // Quem explica a espera e o bloco `fila`, o unico que conhece executores e
    // posicao. Duas frases dizendo a mesma coisa envelheceriam separadas.
    const t = etapaDe(0, true)
    expect(t).not.toMatch(/executor|vaga/i)
  })
})
