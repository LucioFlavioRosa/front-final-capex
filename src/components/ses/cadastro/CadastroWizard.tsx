/**
 * Wizard do cadastro da unidade.
 *
 * Até a Fase 6 esta tela era uma FACHADA: renderizava `PreviewTable` sobre
 * células literais de `mockupTabelas.ts`, transcritas de um protótipo HTML.
 * Nada era editável e nenhum número vinha de fonte de dados — enquanto
 * `AbaGrid` e o `CadastroContext` já existiam, prontos e desconectados. Agora
 * a tela é dirigida pelo SCHEMA e escreve no contexto.
 *
 * Os blocos do stepper saem do próprio SCHEMA (campo `bloco`), e não de uma
 * lista paralela: acrescentar uma aba passa a ser editar um arquivo, não dois
 * que precisam concordar entre si.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft, ArrowRight, Info, FloppyDisk, CircleNotch, PencilSimple,
  DownloadSimple, UploadSimple,
} from '@phosphor-icons/react'
import { BLOCOS, POSICAO_POR_SCHEMA, rotuloBloco } from '../../../data/cadastroUnidade/blocos'
import { useIndicador } from '../../ui/useIndicador'
import { larguraDaGrade } from '../../../data/cadastroUnidade/schema'
import type { Row } from '../../../data/cadastroUnidade/types'
import { ApiError } from '../../../lib/api'
import { baixarTemplateCadastro, importarTemplateCadastro } from '../../../lib/cadastroApi'
import {
  type Escopo,
  SEM_ESCOPO,
  casaComEscopo,
  escopoAtivo,
  escopoInicial,
  opcoesEscopo,
  sistemaPadraoDoFluxo,
} from '../../../domain/escopo'
import { useCadastro } from './CadastroContext'
import { Button } from '../../ui/Button'
import { useToast } from '../../ui/Toaster'
import { AbaGrid } from './AbaGrid'
import { ChipProgresso } from './PainelProgresso'
import { FiltroEscopo } from './FiltroEscopo'
import { PainelTopologia } from './PainelTopologia'
import { UsaSistemaCts } from './UsaSistemaCts'
import { AdicionarCts } from './AdicionarCts'
import { Unifilar, type DestaqueUnifilar } from './Unifilar'
import { validarTopologia } from '../../../domain/validacao'
import { ehCts } from '../../../domain/fluxo'

/**
 * OS BANNERS VERDES "DADOS REAIS" SAÍRAM (07/08/2026), junto da legenda de
 * procedência — é o mesmo pedido (item 25).
 *
 * Eram três, no topo das abas de CAPEX de sub-bacias, Sub-bacias e Dados da CTS, e
 * diziam parágrafo por parágrafo o que naquela aba era carga real e o que era exemplo.
 * Na revisão de 04/08 o cliente confirmou a remoção aba por aba ("vai ser removido
 * também"), pelo mesmo motivo da legenda: eram andaime de construção, úteis enquanto
 * a base era metade invenção, e viraram parágrafo que ninguém lê depois que os dados
 * reais chegaram.
 *
 * O conteúdo não se perdeu — o essencial de cada um está na `desc` da própria aba
 * (que continua no SCHEMA e é conteúdo negociado), e o mapeamento campo a campo vive
 * em ANALISE-CSV-DADOS-COMERCIAIS.md.
 *
 * `AvisoSemCts` FICOU, e é outra coisa: não fala de procedência, fala de uma aba
 * VAZIA — e vazio sem explicação vira ticket de bug.
 */

/**
 * A base comercial de CTS só cobre as duas unidades da regional R4 (as que têm
 * EMP_CODIGO no CSV). Nas outras 51 a aba fica vazia — e vazio sem explicação
 * lê-se como carga que falhou, então o aviso diz explicitamente que não é isso.
 */
function AvisoSemCts() {
  return (
    <div className="flex items-start gap-2.5 rounded-2xl border border-ink-200 bg-ink-50 p-4">
      <Info weight="fill" className="mt-0.5 shrink-0 text-lg text-ink-400" />
      <p className="text-[12.5px] leading-snug text-ink-600">
        <strong className="font-semibold">Esta unidade não tem CTS na base.</strong> Não é falha de
        carga: o coletor de tempo seco é a exceção, e a base comercial hoje só traz CTS para as
        unidades da regional R4. Se a sua unidade tiver CTS, ela pode ser adicionada aqui.
      </p>
    </div>
  )
}

/**
 * A ABA DO FLUXO — uma so desde 20/08/2026, quando ela absorveu a Representacao.
 *
 * Era um `Set` de duas chaves: `sistema-topologia` (onde se preenchia) e
 * `fluxo-unifilar` (onde se conferia). Continua constante nomeada, e nao literal
 * espalhado, porque tres coisas desta tela dependem dela: o painel de problemas
 * de topologia, o layout em duas colunas e o elo de foco entre grade e desenho.
 */
const ABA_DO_FLUXO = 'sistema-topologia'

/**
 * ABAIXO DISTO A BARRA DE ESCOPO NAO APARECE — mesmo numero e mesma razao do
 * `MIN_LINHAS_PARA_FILTRO` do funil de coluna: numa aba que se le inteira de uma
 * vez, filtrar da mais trabalho que ler.
 *
 * A aba do Fluxo e a excecao e ganha a barra sempre: nela o controle nao recorta
 * so a tabela, ele escolhe qual sistema o desenho ao lado mostra.
 */
const MIN_LINHAS_PARA_ESCOPO = 15

/**
 * O CROMO DA GRADE — 20px que não são folga estética.
 *
 * A coluna da esquerda tem de ser mais larga que a TABELA, não igual a ela: o
 * container que rola tem 1px de borda de cada lado e mostra a barra de rolagem
 * VERTICAL (a grade rola por dentro, `max-h-[calc(100vh-13rem)]`). Com a coluna
 * exatamente do tamanho da tabela, sobram ~783px de 800 para 800px de conteúdo —
 * e aparece uma barra HORIZONTAL. Ou seja: a tabela cabia, e ficava cortada pela
 * própria moldura. Foi o defeito relatado em 20/08/2026.
 */
const CROMO_DA_GRADE = 20

export function CadastroWizard() {
  const {
    state, irFase, setCell, setCells, addRow, delRow, importarPlanilha,
    garantirFaixaZeroParidade, salvar, salvando,
  } = useCadastro()
  const { toast } = useToast()
  const unidade = state.unidade
  const [blocoIdx, setBlocoIdx] = useState(() => POSICAO_POR_SCHEMA[state.passo]?.bloco ?? 0)
  const [abaIdx, setAbaIdx] = useState(() => POSICAO_POR_SCHEMA[state.passo]?.aba ?? 0)

  // a Revisão muda `passo` e volta para o wizard; aqui isso vira bloco + aba
  useEffect(() => {
    const pos = POSICAO_POR_SCHEMA[state.passo]
    if (!pos) return
    setBlocoIdx(pos.bloco)
    setAbaIdx(pos.aba)
  }, [state.passo])

  const bloco = BLOCOS[blocoIdx]
  const abaAtualIdx = Math.min(abaIdx, bloco.abas.length - 1)
  const aba = bloco.abas[abaAtualIdx]
  const rows = useMemo(() => unidade?.data[aba.key] ?? [], [unidade, aba.key])

  // As duas fileiras do stepper ESCORREGAM até o item ativo (`useIndicador`,
  // a mesma técnica do Trilho) em vez de trocar de cor num corte seco.
  const indicadorBloco = useIndicador<HTMLDivElement>(String(blocoIdx))
  const indicadorAba = useIndicador<HTMLDivElement>(`${blocoIdx}.${abaAtualIdx}`)

  /**
   * OS CINCO CALLBACKS DA GRADE, estáveis por `useCallback`.
   *
   * Eram closures inline no JSX. Cada render do wizard criava funções novas, a
   * grade as repassava para as 751 linhas, e o `memo` de `AbaGridRow` nunca
   * acertava — cada tecla repintava a planilha inteira.
   *
   * Dependem só de `aba.key` (e dos despachos, que o reducer mantém estáveis),
   * então trocam de identidade ao trocar de aba, e não a cada tecla. É a
   * diferença entre repintar uma linha e repintar 751.
   */
  const abaKey = aba.key
  const aoEditarCelula = useCallback(
    (ri: number, col: string, value: string) => setCell(abaKey, ri, col, value),
    [abaKey, setCell],
  )
  const aoEditarCelulas = useCallback(
    (edicoes: { ri: number; col: string; value: string }[]) => setCells(abaKey, edicoes),
    [abaKey, setCells],
  )
  const aoAdicionarLinha = useCallback(() => addRow(abaKey), [abaKey, addRow])
  const aoRemoverLinha = useCallback((ri: number) => delRow(abaKey, ri), [abaKey, delRow])
  const aoAvisar = useCallback((m: string) => toast(m, 'info'), [toast])

  const ehFluxo = aba.key === ABA_DO_FLUXO

  /**
   * A CTS APARECE NO FLUXO. Ficou oculta entre 21 e 29/08 por pedido daquela
   * data ("não vamos usar CTS no fluxo de escoamento no momento") — a lógica
   * seguiu intacta o tempo todo, era só a UI que saía.
   *
   * Voltou porque a regra que ela expõe é a que se quer usar: marcada, a caixa
   * "usa sistema de CTS" limita o sistema a UMA CTS; desmarcada, ele aceita
   * quantas forem colocadas. Sem esses dois controles não há onde marcar nem
   * onde adicionar, e a regra existe só no servidor.
   */
  const mostrarCtsNoFluxo: boolean = true

  /**
   * EDITAR É UM ATO DECLARADO, e não o estado natural da tela.
   *
   * A grade nasce somente leitura. Sem isso, uma tabela de mil linhas fica
   * sempre armada: um clique fora de lugar altera cadastro sem nenhuma
   * intenção — e como o Salvar manda tudo o que mudou, o engano viajaria junto
   * com o trabalho legítimo.
   *
   * O modo VOLTA A FECHAR ao trocar de aba (a chave do efeito é `aba.key`): o
   * consentimento foi para aquela tabela, não para o cadastro inteiro.
   */
  const [editando, setEditando] = useState(false)
  useEffect(() => {
    setEditando(false)
  }, [aba.key])

  // ------------------------------------------------------- barra de escopo
  /**
   * O RECORTE VIVE AQUI, e nao dentro do `AbaGrid`, por uma razao que so a aba do
   * Fluxo revela: nela o mesmo par de controles recorta a TABELA e escolhe qual
   * sistema o DESENHO mostra. Dois donos discordariam na primeira troca.
   */
  /**
   * O RECORTE É DERIVADO NO RENDER, e não definido num efeito.
   *
   * Ele morava num `useEffect`, e efeito roda DEPOIS da pintura: ao entrar numa
   * aba, a grade montava com TODAS as linhas — 3.755 na de obras, 1.057 na do
   * Fluxo — e só então o recorte chegava e ela remontava com poucas. O usuário
   * pagava o render inteiro para ver um recorte. Medido: 3.940ms para abrir a
   * aba de obras, contra 43ms recortada.
   *
   * Aqui o estado guarda só a ESCOLHA MANUAL, por aba. Sem escolha, vale o
   * recorte inicial — calculado no mesmo render em que a grade é montada, então
   * ela nunca chega a ver a lista inteira.
   *
   * A chave é por aba porque trocar de aba e voltar deve devolver o que a
   * pessoa tinha escolhido, e não recomeçar do padrão. A aba do Fluxo abre num
   * sistema ESCOLHIDO, e nao em "todos": e a regra que ela herdou da
   * Representacao — abrir sem sistema mostraria o desenho vazio justamente onde
   * ele deveria demonstrar para que serve (ver `sistemaPadraoDoFluxo`).
   */
  const [escolhaDeEscopo, setEscolhaDeEscopo] = useState<Record<string, Escopo>>({})

  const escopo = useMemo<Escopo>(() => {
    const escolhido = escolhaDeEscopo[aba.key]
    if (escolhido) return escolhido
    if (!unidade) return SEM_ESCOPO
    if (aba.key === ABA_DO_FLUXO) {
      return { cidadeId: '', sistemaId: sistemaPadraoDoFluxo(unidade.data) }
    }
    // TODA aba grande abre RECORTADA, no eixo mais fino que ela declara. A regra
    // de quando a barra existe é a mesma de `mostrarBarra` abaixo, e precisa
    // ser: recortar sem oferecer como trocar o recorte esconderia linhas.
    const linhas = unidade.data[aba.key] ?? []
    const temBarra = !!aba.escopo && linhas.length >= MIN_LINHAS_PARA_ESCOPO
    return escopoInicial(opcoesEscopo(unidade.data, unidade.cidades, aba, linhas), temBarra)
    // `unidade?.id` e não `unidade`: esta última muda a cada tecla digitada, e o
    // recorte se refaria no meio do preenchimento. É a mesma dependência que o
    // efeito antigo usava, pelo mesmo motivo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aba, unidade?.id, escolhaDeEscopo])

  const setEscopo = useCallback(
    (e: Escopo) => setEscolhaDeEscopo((atual) => ({ ...atual, [aba.key]: e })),
    [aba.key],
  )

  // ------------------------------------------------- "usa sistema de CTS"
  /**
   * O dado mora em `cidade-sistema` (aba oculta) e a caixa aparece no Fluxo.
   * Aqui os dois se encontram: a linha do sistema escolhido, quantas CTS ele já
   * tem hoje, e as ações que escrevem de volta na aba certa.
   */
  const sistemasDoCadastro = unidade?.data['cidade-sistema']
  const sistemaEscolhido = useMemo(
    () => sistemasDoCadastro?.find((r) => r.sistema_id === escopo.sistemaId),
    [sistemasDoCadastro, escopo.sistemaId],
  )
  const topoDoCadastro = unidade?.data[ABA_DO_FLUXO]
  const dadosDoCadastro = unidade?.data
  const ctsDoSistema = useMemo(() => {
    if (!escopo.sistemaId || !dadosDoCadastro) return 0
    // Pelo TIPO do componente, e nao pela aba `cts-operacional`: aquela lista as
    // CTS cadastradas, entao usa-la para reconhecer uma CTS seria circular.
    return (topoDoCadastro ?? []).filter(
      (t) => t.sistema_id === escopo.sistemaId && ehCts(dadosDoCadastro, t),
    ).length
  }, [topoDoCadastro, dadosDoCadastro, escopo.sistemaId])

  /**
   * COLOCA a CTS no sistema escolhido — escrevendo `sistema_id` na LINHA DELA na
   * aba do Fluxo. O `sistema_id` saiu das COLUNAS da grade (a barra acima já diz
   * qual é o sistema), mas continua no DADO, e é ele que este controle escreve.
   *
   * O jusante fica em branco de propósito: para onde a CTS escoa é a próxima
   * decisão, e adivinhá-la seria inventar topologia.
   */
  const aoAdicionarCts = useCallback(
    (componenteId: string) => {
      const ri = (topoDoCadastro ?? []).findIndex((t) => t.componente_sistema_id === componenteId)
      if (ri < 0) return
      // As duas colunas numa edição só: `sistema_name` acompanha o `sistema_id`
      // porque é ele que a gravação e o unifilar leem. Em dois dispatches a
      // linha ficaria por um quadro com o sistema certo e o nome em branco.
      setCells(ABA_DO_FLUXO, [
        { ri, col: 'sistema_id', value: escopo.sistemaId },
        { ri, col: 'sistema_name', value: sistemaEscolhido?.sistema_name ?? '' },
      ])
      toast(`CTS adicionada a ${sistemaEscolhido?.sistema_name || escopo.sistemaId}.`, 'info')
    },
    [topoDoCadastro, escopo.sistemaId, sistemaEscolhido, setCells, toast],
  )

  /**
   * TIRA A CTS DO SISTEMA — a linha FICA, com sistema e jusante em branco.
   *
   * É o espelho de `aoAdicionarCts`: apagar a linha perderia o NOME do
   * componente, que só existe na topologia, e a CTS sumiria da lista de
   * disponíveis em vez de voltar para ela.
   */
  const aoTirarDoSistema = useCallback(
    (ri: number) => {
      const linha = (topoDoCadastro ?? [])[ri]
      if (!linha) return
      setCells(ABA_DO_FLUXO, [
        { ri, col: 'sistema_id', value: '' },
        { ri, col: 'sistema_name', value: '' },
        { ri, col: 'componente_sistema_id_jusante', value: '' },
      ])
      toast(`${linha.componente_sistema_nome || linha.componente_sistema_id} saiu do sistema.`, 'info')
    },
    [topoDoCadastro, setCells, toast],
  )

  /** A ação de linha só existe para CTS que ESTÁ num sistema. */
  const ehCtsColocada = useCallback(
    (row: Row) => !!dadosDoCadastro && !!row.sistema_id && ehCts(dadosDoCadastro, row),
    [dadosDoCadastro],
  )

  /**
   * A AÇÃO DE LINHA DA ABA — só o Fluxo tem uma, e só para CTS colocada.
   *
   * `useMemo` e não literal no JSX: a `AbaGrid` compara esta prop por
   * referência para poupar o `memo` das linhas, e um objeto nascendo a cada
   * render devolveria os 300ms por tecla que já custaram caro aqui. As três
   * dependências são estáveis (`ehFluxo` é booleano, as outras duas são
   * `useCallback`), então o objeto só troca quando a aba troca.
   */
  const acaoDoFluxo = useMemo(
    () =>
      ehFluxo
        ? { rotulo: 'tirar do sistema', visivelEm: ehCtsColocada, ao: aoTirarDoSistema }
        : undefined,
    [ehFluxo, ehCtsColocada, aoTirarDoSistema],
  )


  const aoMudarUsaCts = useCallback(
    (marcado: boolean) => {
      const ri = (sistemasDoCadastro ?? []).findIndex((r) => r.sistema_id === escopo.sistemaId)
      if (ri < 0) return
      setCell('cidade-sistema', ri, 'usa_sistema_cts', marcado ? 'Sim' : 'Nao')
    },
    [sistemasDoCadastro, escopo.sistemaId, setCell],
  )

  const opcoes = useMemo(
    () =>
      unidade && aba.escopo
        ? opcoesEscopo(unidade.data, unidade.cidades, aba, rows)
        : { cidades: [], sistemas: [] },
    [unidade, aba, rows],
  )

  /**
   * O recorte vira PREDICADO antes de descer para a grade — ver `filtroEscopo` em
   * `AbaGridProps`. `undefined` quando nao ha recorte, para o `useMemo` de
   * `visiveis` la nao filtrar nada a toa.
   */
  const filtroEscopo = useMemo(() => {
    if (!unidade || !aba.escopo || !escopoAtivo(escopo)) return undefined
    const dados = unidade.data
    return (row: Row) => casaComEscopo(dados, aba, row, escopo)
  }, [unidade, aba, escopo])

  const limparEscopo = useCallback(() => setEscopo(SEM_ESCOPO), [])

  // ------------------------------------------------ o elo tabela <-> desenho
  /**
   * `linhaFoco` e a linha em foco na grade, em indice ORIGINAL (a grade traduz
   * antes de avisar). `pedidoFoco` e o caminho inverso: o clique numa caixa do
   * desenho pedindo a grade que selecione aquela linha.
   *
   * `nonce` no pedido porque clicar duas vezes no mesmo no tem de reagir das duas
   * — sem ele o objeto seria igual e o efeito da grade nao rodaria.
   */
  const [linhaFoco, setLinhaFoco] = useState<number | null>(null)
  const [pedidoFoco, setPedidoFoco] = useState<{ idx: number; nonce: number } | null>(null)

  useEffect(() => {
    setLinhaFoco(null)
    setPedidoFoco(null)
  }, [aba.key])

  const aoFocarLinha = useCallback((idx: number | null) => setLinhaFoco(idx), [])

  const destaque = useMemo<DestaqueUnifilar | null>(() => {
    if (!ehFluxo || linhaFoco === null) return null
    const row = rows[linhaFoco]
    const origem = (row?.componente_sistema_id ?? '').trim()
    if (!origem) return null
    return { origem, destino: (row.componente_sistema_id_jusante ?? '').trim() }
  }, [ehFluxo, linhaFoco, rows])

  /**
   * Clique numa caixa do desenho -> foco na linha daquela ORIGEM.
   *
   * Um no pode aparecer no desenho sem ter linha propria: ele e o DESTINO de
   * alguem e ainda nao declarou para onde escoa (e uma ETE nunca tem linha — ela
   * e o fim do caminho). Ai nao ha para onde levar o foco, e dizer isso e melhor
   * que um clique que nao faz nada.
   */
  const focarOrigem = useCallback(
    (id: string) => {
      const idx = rows.findIndex((r) => (r.componente_sistema_id ?? '').trim() === id)
      if (idx === -1) {
        toast(`${id} nao tem linha propria aqui — aparece so como destino de outra.`, 'info')
        return
      }
      setPedidoFoco((p) => ({ idx, nonce: (p?.nonce ?? 0) + 1 }))
    },
    [rows, toast],
  )

  /**
   * Ao ENTRAR na escala de paridade, criar a faixa de cobertura 0 das cidades que
   * têm uma paridade só (item 30). A dependência é `aba.key`, então roda uma vez por
   * visita à aba e não durante a digitação — ver `garantirFaixaZero`.
   */
  useEffect(() => {
    if (aba.key === 'fator-esgoto') garantirFaixaZeroParidade()
  }, [aba.key, garantirFaixaZeroParidade])

  /**
   * O WACC MÉDIO SAI DA GRADE e vira cartão (item 24 do pedido de 05/08/2026).
   *
   * Ele era a ÚNICA célula editável de uma aba com quatro colunas travadas de
   * hierarquia, e o cliente diagnosticou o efeito: *"está roubando um pouco da
   * atenção do preenchimento"* (Wagner) — o olho vai para a tabela, e o único número
   * que a unidade tem de informar naquele bloco é o que menos aparece.
   *
   * A coluna é retirada de `aba.cols` só na hora de desenhar a grade. É de propósito
   * que o SCHEMA não muda: `contarAba` continua contando `wacc_medio` na completude e
   * `validarCadastro` continua checando "WACC ausente sem média para herdar", porque
   * o cartão escreve na MESMA célula (`data['unidade-regional'][0].wacc_medio`). Se
   * ele guardasse estado próprio, tela, contagem e payload passariam a discordar.
   */
  const abaGrade = useMemo(
    () => (aba.key === 'unidade-regional'
      ? { ...aba, cols: aba.cols.filter((c) => c.coluna !== 'wacc_medio') }
      : aba),
    [aba],
  )

  /**
   * Os problemas de topologia, nas DUAS abas do fluxo (itens 23 e 34).
   *
   * O painel nasceu na aba do Fluxo, onde o erro se corrige. Ele passa a aparecer
   * também na Representação porque foi ali que Wagner pediu a conferência
   * (14:19: *"lembra que a gente tinha uma validação? Essa demonstração deveria
   * estar aqui no cadastro"*) — o desenho mostra QUE um nó está solto, e o painel
   * diz QUAIS e o que isso custa. Um sem o outro é meia resposta.
   *
   * O `useMemo` importa: a checagem caminha o grafo inteiro por origem, e a aba
   * tem uma linha por sub-bacia da amostra MAIS uma por CTS da unidade — 221 na
   * maior. Sem memo isso rodaria a cada tecla digitada em qualquer célula.
   *
   * A condição está DENTRO do memo, e não em volta dele, porque hook não pode ser
   * chamado condicionalmente: fora das abas de fluxo ele devolve a lista vazia sem
   * caminhar nada.
   */
  const problemasTopologia = useMemo(
    () => (aba.key === ABA_DO_FLUXO && unidade ? validarTopologia(unidade.data) : []),
    [aba.key, unidade],
  )

  if (!unidade) return null

  const ultimaDoBloco = abaAtualIdx === bloco.abas.length - 1
  const ultimoBloco = blocoIdx === BLOCOS.length - 1

  const mostrarBarra = !!aba.escopo && (ehFluxo || rows.length >= MIN_LINHAS_PARA_ESCOPO)

  /** A coluna da esquerda no layout de duas colunas — ver `CROMO_DA_GRADE`. */
  // `ehFluxo` porque é a única aba com ação de linha sem `addRow` — ver
  // `larguraDaGrade`.
  const larguraColunaGrade = larguraDaGrade(abaGrade, !!abaGrade.addRow || ehFluxo) + CROMO_DA_GRADE

  /**
   * A GRADE MAIS A LEGENDA DE ORIGEM, num fragmento — porque na aba do Fluxo as
   * duas vão juntas para a COLUNA DA ESQUERDA, e a legenda (DB / un / fx) é sobre
   * células, não sobre o desenho ao lado.
   *
   * A legenda vem DEPOIS da tabela desde 04/08/2026: a grade já termina numa faixa
   * de metadados (contagem de linhas, somas, dica de atalhos) e a legenda é da
   * mesma natureza — chave de leitura, não instrução de entrada. Quem abre a aba lê
   * título → descrição → dados; a chave dos selos só é procurada quando um selo
   * chama atenção, e aí ela está no caminho do olho, logo abaixo.
   */
  const grade = (
    <>
      <AbaGrid
        aba={abaGrade}
        rows={rows}
        cidades={unidade.cidades}
        dados={unidade.data}
        // ESTÁVEIS (`useCallback` acima). Eram closures inline, e cada render
        // do wizard dava props novas à grade — que as repassava para as 751
        // linhas, anulando o `memo` de cada uma.
        onCell={aoEditarCelula}
        onAddRow={aoAdicionarLinha}
        onDelRow={aoRemoverLinha}
        onCells={aoEditarCelulas}
        onAviso={aoAvisar}
        edicaoLiberada={editando}
        acaoDeLinha={acaoDoFluxo}
        filtroEscopo={filtroEscopo}
        onLimparEscopo={limparEscopo}
        onFocoLinha={ehFluxo ? aoFocarLinha : undefined}
        focarLinha={ehFluxo ? pedidoFoco : null}
      />
      <div className="mt-4 border-t border-ink-100 pt-3.5">
        <Legenda />
      </div>
    </>
  )

  function irParaAba(abaKey: string) {
    const bi = BLOCOS.findIndex((b) => b.abas.some((a) => a.key === abaKey))
    if (bi === -1) return
    setBlocoIdx(bi)
    setAbaIdx(BLOCOS[bi].abas.findIndex((a) => a.key === abaKey))
  }

  /**
   * Salva de qualquer aba, a qualquer momento.
   *
   * Sem checagem de completude de propósito — ver o comentário de `salvar` no
   * CadastroContext. O aviso é toast, e não uma faixa fixa, porque salvar aqui é
   * ação de rotina no meio do preenchimento: um elemento permanente na tela
   * roubaria espaço de uma grade que já tem 22 colunas na aba mais larga.
   */
  async function salvarAgora() {
    try {
      await salvar()
      toast('Cadastro salvo.', 'success')
    } catch (erro) {
      toast(
        erro instanceof ApiError
          ? `Não foi possível salvar: ${erro.message}`
          : 'Não foi possível falar com o servidor. O cadastro NÃO foi salvo.',
        'warning',
      )
    }
  }

  /**
   * BAIXAR TEMPLATE — o Excel que a Regional preenche fora do site.
   *
   * Já vem com as linhas desta unidade (uma por sub-bacia, CTS, ETE, cidade e
   * nó do fluxo que existem de verdade no cadastro) — ver
   * `app/cadastro/template_excel.py`. Pode ser chamado ANTES de qualquer
   * dado existir na tela (unidade recém-selecionada, cadastro nunca salvo):
   * o template é gerado do banco, não do estado local.
   */
  const [baixando, setBaixando] = useState(false)
  async function baixarTemplate() {
    if (!unidade) return
    setBaixando(true)
    try {
      await baixarTemplateCadastro(unidade.id)
    } catch (erro) {
      toast(
        erro instanceof ApiError
          ? `Não foi possível gerar o template: ${erro.message}`
          : 'Não foi possível falar com o servidor.',
        'warning',
      )
    } finally {
      setBaixando(false)
    }
  }

  /**
   * IMPORTAR PLANILHA — a volta do template preenchido.
   *
   * O upload só MESCLA no estado em tela (ver `IMPORTAR_PLANILHA` no
   * reducer) — não grava no banco. A pessoa revê o que entrou (o âmbar de
   * obrigatório em branco já aparece na grade, célula por célula) e decide
   * clicar em Salvar, como faria depois de digitar à mão.
   *
   * `<input type=file>` disparado por um `<button>` porque o input nativo do
   * navegador não é estilizável — o mesmo padrão que qualquer "escolher
   * arquivo" custom usa.
   */
  const inputArquivoRef = useRef<HTMLInputElement>(null)
  const [importando, setImportando] = useState(false)
  async function importarArquivo(arquivo: File) {
    if (!unidade) return
    setImportando(true)
    try {
      const { dados } = await importarTemplateCadastro(unidade.id, arquivo)
      importarPlanilha(dados)
      toast('Planilha importada. Revise os campos e clique em Salvar.', 'success')
    } catch (erro) {
      toast(
        erro instanceof ApiError
          ? `Não foi possível importar: ${erro.message}`
          : 'Não foi possível falar com o servidor.',
        'warning',
      )
    } finally {
      setImportando(false)
    }
  }

  function avancar() {
    if (!ultimaDoBloco) return setAbaIdx(abaAtualIdx + 1)
    if (!ultimoBloco) {
      setBlocoIdx(blocoIdx + 1)
      setAbaIdx(0)
      return
    }
    irFase('revisao')
  }

  return (
    /*
      A ABA DO FLUXO USA MAIS LARGURA QUE O RESTO DO CADASTRO, e o número saiu de
      medição, não de gosto.

      `max-w-content` são 1400px. Descontados 48 de padding da página e 40 do
      cartão, sobram 1312 para o conteúdo — e a tabela do Fluxo, que tem largura
      fixa, come 820 deles. Ficam 468 para o desenho, que num sistema de cinco nós
      num nível pede 988. Era isso que aparecia cortado.

      1800px dão 1712 de conteúdo e 868 para o desenho, e a partir de ~1900px de
      janela ele cabe inteiro. Nas outras abas o teto continua sendo 1400: elas não
      têm nada ao lado da grade, e uma linha de 1800px de largura para uma tabela de
      5 colunas é pior que a folga.
    */
    <section
      className={`mx-auto animate-fade-in px-4 py-6 md:px-6 ${
        ehFluxo ? 'max-w-[1800px]' : 'max-w-content'
      }`}
    >
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <button
            type="button"
            onClick={() => irFase('selecao')}
            className="inline-flex items-center gap-1.5 border-0 bg-none p-0 text-xs font-semibold text-ink-water transition-colors duration-hover ease-saida hover:text-water-600"
          >
            <ArrowLeft weight="bold" className="text-[13px]" />
            Voltar para seleção de unidade
          </button>
          <h1 className="mt-2 text-[26px] font-extrabold leading-[1.12] tracking-tight text-water-600">
            {unidade.name}
          </h1>
          {/* O id agora é o EMP_CODIGO real da empresa (de-para regional ·
              empresa · cidade), não mais uma sigla derivada do nome
              ('UN-NOR-LIT') — é esse código que identifica a unidade na base. */}
          <span className="mt-[5px] block font-mono text-xs text-ink-water">
            {unidade.id} · {unidade.regionalName}
          </span>
        </div>
        {/* O CHIP DE PROGRESSO entra aqui, no eixo do título e da ação — era uma
            coluna fixa de 336px à direita da grade (`PainelProgresso`). A troca é
            de 07/08/2026: 336px de cromo permanente eram caros numa tela cuja aba
            mais larga tem 22 colunas, e a grade os usa melhor. Ver o comentário
            no topo de `PainelProgresso`. */}
        <div className="flex flex-wrap items-end gap-5">
          <ChipProgresso
            dados={unidade.data}
            onIrParaAba={irParaAba}
            onIrParaRevisao={() => irFase('revisao')}
          />
          {/* EDITAR abre a tabela; SALVAR fecha e manda. Dois botões, e não um
              campo sempre aberto: ver o comentário de `editando`. */}
          <Button
            variant={editando ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setEditando((e) => !e)}
          >
            <PencilSimple weight="fill" /> {editando ? 'Concluir edição' : 'Editar'}
          </Button>
          {/* BAIXAR/IMPORTAR TEMPLATE — o ciclo de preencher fora do site. Ficam
              juntos e ANTES de Salvar/Editar na leitura, porque baixar o
              template costuma ser o primeiro passo de quem chega numa unidade
              grande (milhares de sub-bacias) e não vai digitar linha por linha
              na grade. */}
          <input
            ref={inputArquivoRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={(e) => {
              const arquivo = e.target.files?.[0]
              e.target.value = ''
              if (arquivo) void importarArquivo(arquivo)
            }}
          />
          <Button
            variant="secondary"
            size="sm"
            onClick={() => inputArquivoRef.current?.click()}
            disabled={importando}
          >
            {importando ? (
              <>
                <CircleNotch weight="bold" className="animate-spin" /> Importando…
              </>
            ) : (
              <>
                <UploadSimple weight="bold" /> Importar planilha
              </>
            )}
          </Button>
          <Button variant="secondary" size="sm" onClick={baixarTemplate} disabled={baixando}>
            {baixando ? (
              <>
                <CircleNotch weight="bold" className="animate-spin" /> Gerando…
              </>
            ) : (
              <>
                <DownloadSimple weight="bold" /> Baixar template
              </>
            )}
          </Button>
          {/* Salvar vem ANTES de "Revisão antes de rodar" e em variante
              secundária: é a ação frequente, mas não é a que fecha o fluxo. */}
          <Button variant="secondary" size="sm" onClick={salvarAgora} disabled={salvando}>
            {salvando ? (
              <>
                <CircleNotch weight="bold" className="animate-spin" /> Salvando…
              </>
            ) : (
              <>
                <FloppyDisk weight="fill" /> Salvar
              </>
            )}
          </Button>
          <Button variant="primary" size="sm" onClick={() => irFase('revisao')}>
            Revisão antes de rodar
          </Button>
        </div>
      </div>

      {/* blocos */}
      <div
        ref={indicadorBloco.containerRef}
        className="relative mt-6 flex gap-1 overflow-x-auto rounded-[11px] bg-ink-200 p-1"
      >
        {BLOCOS.map((b, i) => (
          <button
            key={b.nome}
            type="button"
            data-indicador={i === blocoIdx ? '1' : undefined}
            onClick={() => { setBlocoIdx(i); setAbaIdx(0) }}
            className={`relative z-10 min-w-[150px] flex-1 whitespace-nowrap rounded-lg border border-transparent px-3 py-2.5 text-[12.5px] font-semibold transition-colors duration-hover ease-saida ${
              i === blocoIdx ? 'text-water-700' : 'text-ink-600 hover:bg-white/60'
            }`}
          >
            {rotuloBloco(i)}
          </button>
        ))}
        {indicadorBloco.estilo && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-1 rounded-lg bg-white shadow-soft transition-[transform,width] duration-mover ease-saida"
            style={{ width: indicadorBloco.estilo.width, transform: `translateX(${indicadorBloco.estilo.left}px)` }}
          />
        )}
      </div>

      {/* abas do bloco */}
      <div
        ref={indicadorAba.containerRef}
        className="relative mt-5 flex gap-5 overflow-x-auto border-b border-ink-200"
        role="tablist"
      >
        {bloco.abas.map((a, i) => (
          <button
            key={a.key}
            type="button"
            role="tab"
            aria-selected={i === abaAtualIdx}
            data-indicador={i === abaAtualIdx ? '1' : undefined}
            onClick={() => setAbaIdx(i)}
            className={`whitespace-nowrap border-0 border-b-2 border-transparent bg-none pb-[11px] text-[13.5px] transition-colors duration-hover ease-saida ${
              i === abaAtualIdx ? 'font-semibold text-ink-900' : 'text-ink-500 hover:text-ink-800'
            }`}
          >
            {a.titulo}
          </button>
        ))}
        {indicadorAba.estilo && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute bottom-0 h-0.5 rounded-t-sm bg-water-600 transition-[transform,width] duration-mover ease-saida"
            style={{ width: indicadorAba.estilo.width, transform: `translateX(${indicadorAba.estilo.left}px)` }}
          />
        )}
      </div>

      {/* Uma coluna só: a lateral de 336px do progresso saiu para o chip no topo. */}
      <div className="mt-5">
        <div className="min-w-0 space-y-5">
          {aba.key === 'cts-operacional' && rows.length === 0 && <AvisoSemCts />}

          {aba.key === 'unidade-regional' && <CartaoWacc />}

          {/* Acima da tabela, e não abaixo: os problemas de topologia dizem o que
              procurar NELA. Depois da grade, numa aba de 200+ linhas, ficariam
              fora da tela justamente enquanto se preenche. */}
          <PainelTopologia problemas={problemasTopologia} />

          <div className="min-w-0 rounded-2xl border border-ink-200 bg-white p-5">
            {/* Sem a legenda ao lado (ela desceu para depois da tabela, pedido da
                Aegea de 04/08), o cabeçalho é só título + descrição — e a
                descrição recupera a largura que disputava com ela: o
                `justify-between` que havia aqui comprimia as duas. */}
            <div className="min-w-0">
              <h2 className="flex items-center gap-2 text-[15px] font-bold tracking-tight text-ink-900">
                <aba.icone weight="fill" className="text-water-600" />
                {aba.titulo}
              </h2>
              <p className="mt-1 max-w-3xl text-[12.5px] text-ink-500">{aba.desc}</p>
            </div>

            {/* A BARRA DE ESCOPO fica DENTRO do cartão, entre a descrição e o
                conteúdo, e não acima dele: ela recorta tudo o que vem abaixo — na
                aba do Fluxo, a tabela E o desenho. Fora do cartão pareceria
                controle da tela inteira, incluindo o stepper. */}
            {mostrarBarra && (
              <div className="mt-4">
                <FiltroEscopo opcoes={opcoes} escopo={escopo} onEscopo={setEscopo} />
                {/* Só na aba do Fluxo, e só com um sistema escolhido: a pergunta
                    "quantas CTS este sistema comporta" não tem resposta para
                    "todos os sistemas". Ver `mostrarCtsNoFluxo` acima. */}
                {mostrarCtsNoFluxo && ehFluxo && unidade && (
                  <>
                    <UsaSistemaCts
                      sistemaId={escopo.sistemaId}
                      sistemaNome={sistemaEscolhido?.sistema_name ?? ''}
                      linha={sistemaEscolhido}
                      quantasCts={ctsDoSistema}
                      onMudar={aoMudarUsaCts}
                    />
                    <AdicionarCts
                      sistemaId={escopo.sistemaId}
                      sistemaNome={sistemaEscolhido?.sistema_name ?? ''}
                      topo={topoDoCadastro ?? []}
                      dados={unidade.data}
                      limitada={sistemaEscolhido?.usa_sistema_cts === 'Sim' && ctsDoSistema > 0}
                      onAdicionar={aoAdicionarCts}
                    />
                  </>
                )}
              </div>
            )}

            <div className="mt-4">
              {ehFluxo ? (
                /*
                  DUAS COLUNAS NA ABA DO FLUXO — e a quebra em 1340px é medida, não
                  escolhida.

                  A COLUNA DA ESQUERDA é MEDIDA, não escolhida: `larguraDaGrade` soma
                  as larguras das colunas da aba (84+168+84+168+84+168 mais 44 da coluna
                  de ações = 800px no Fluxo) e `CROMO_DA_GRADE` acrescenta a moldura que
                  rola. É o que faz a tabela caber inteira em vez de ficar cortada por
                  17px de borda e barra de rolagem.

                  A DA DIREITA é o que sobra (`flex-1`), e o desenho se ajusta a ela —
                  ver `ENCOLHIMENTO_MAXIMO` em `Unifilar`. Essa é a inversão que resolve
                  o corte: a tabela tem largura própria e não negocia; o desenho tem
                  `viewBox` e reescala. Dimensionar na ordem contrária (desenho fixo,
                  tabela no que sobra) cortaria a tabela, que é justamente a que não
                  sabe encolher.

                  Lado a lado, e não empilhado, por um motivo só: o desenho acompanha a
                  LINHA EM FOCO na tabela. Empilhado, cada clique numa linha atualizaria
                  um desenho fora da tela — o recurso não existiria na prática. Abaixo de
                  1360px de janela (820 + 24 de gap + 460 da largura mínima do desenho,
                  mais 48 de padding) não há como dar largura decente aos dois, e aí
                  empilhar é melhor que apertar.

                  A coluna da direita é `sticky` porque a grade rola por DENTRO
                  (`max-h-[calc(100vh-13rem)]`): o desenho fica parado enquanto a
                  tabela corre. E ela ganha altura máxima própria, porque um sistema de
                  6 níveis dá ~630px de SVG mais a legenda e a lista de nós soltos.
                */
                <div className="flex flex-col gap-6 min-[1360px]:flex-row min-[1360px]:items-start">
                  <div
                    className="min-w-0 min-[1360px]:flex-none"
                    style={{ width: `min(100%, ${larguraColunaGrade}px)` }}
                  >
                    {grade}
                  </div>
                  <div className="min-w-0 min-[1360px]:sticky min-[1360px]:top-6 min-[1360px]:max-h-[calc(100vh-8rem)] min-[1360px]:flex-1 min-[1360px]:overflow-y-auto">
                    <Unifilar
                      dados={unidade.data}
                      sistemaId={escopo.sistemaId}
                      destaque={destaque}
                      onFocarOrigem={focarOrigem}
                    />
                  </div>
                </div>
              ) : (
                grade
              )}
            </div>

            <div className="mt-5 flex items-center justify-end gap-3 border-t border-ink-200 pt-4">
              <Button variant="secondary" size="sm" onClick={avancar}>
                {ultimaDoBloco && ultimoBloco ? 'Ir para a revisão' : 'Próxima aba'}
                <ArrowRight weight="bold" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

/**
 * CARTÃO DO WACC MÉDIO — item 24 do pedido de 05/08/2026.
 *
 * Escreve na mesma célula que a grade escrevia (`unidade-regional[0].wacc_medio`);
 * ver o comentário de `abaGrade` acima para por que isso não é detalhe.
 *
 * O texto ao lado é o segundo pedido do mesmo trecho da reunião: *"aqui é para
 * preencher o ponderado de capital, e aí bota esse disclaimer — quando uma obra não
 * tem seu WACC próprio, ela herda dessa média. Ficou muito direto, esse textinho pode
 * dar uma melhorada"* (Wagner, 7:35). O que estava só no tooltip da coluna passou a
 * ser a explicação do cartão.
 */
function CartaoWacc() {
  const { state, setCell } = useCadastro()
  const valor = state.unidade?.data['unidade-regional']?.[0]?.wacc_medio ?? ''
  const vazio = valor.trim() === ''

  return (
    <div className="flex flex-wrap items-start gap-x-8 gap-y-4 rounded-2xl border border-water-200 bg-water-50 p-5">
      <div className="min-w-[190px]">
        <label htmlFor="wacc-medio" className="block text-[14px] font-bold tracking-tight text-ink-900">
          WACC médio da unidade
        </label>
        <input
          id="wacc-medio"
          value={valor}
          onChange={(e) => setCell('unidade-regional', 0, 'wacc_medio', e.target.value)}
          placeholder="0,0945"
          inputMode="decimal"
          /* Mesma gramática de estado das células da grade (ver AbaCell): âmbar
             tracejado quando falta, branco com borda de marca quando está feito. O
             cartão muda o TAMANHO do campo, não a linguagem visual. */
          className={`mt-2 w-full max-w-[170px] rounded-lg px-3 py-2 font-mono text-[19px] tabular-nums outline-none transition-colors duration-hover ease-saida ${
            vazio
              ? 'border border-dashed border-amber-400 bg-amber-50 text-ink-800 placeholder:text-ink-400'
              : 'border border-water-200 bg-white text-ink-900'
          }`}
        />
      </div>
      <p className="max-w-xl flex-1 text-[12.5px] leading-relaxed text-ink-600">
        Custo médio ponderado de capital da unidade como um todo, preenchido por
        Operações Financeiras.{' '}
        <strong className="font-semibold text-ink-900">
          Toda obra de CAPEX que não tiver um WACC próprio herda este valor
        </strong>{' '}
        no cálculo do retorno — é o que garante que nenhuma obra entre na simulação sem
        taxa de desconto. Informe como decimal: 0,0945 são 9,45% ao ano.
      </p>
    </div>
  )
}

/**
 * Legenda de ORIGEM — quem edita o quê.
 *
 * DB = vem do Databricks e se corrige na origem; un = a unidade preenche, e é o que a
 * completude conta; fx = o motor calcula e ignora o que estiver gravado.
 *
 * Era um par de legendas até 07/08/2026: esta e a de PROCEDÊNCIA (dado real ×
 * exemplo × sem fonte). A segunda saiu por pedido do cliente — ver o comentário no
 * topo de `AbaGrid`, que explica por que o mesmo interlocutor pediu o selo em 30/07 e
 * a remoção dele quatro dias depois.
 */
function Legenda() {
  const origens = [
    { sigla: 'DB', texto: 'vem do Databricks — não editável', cls: 'text-water-600 bg-water-50 border-water-200' },
    { sigla: 'un', texto: 'você preenche', cls: 'text-amber-600 bg-amber-50 border-amber-300' },
    { sigla: 'fx', texto: 'calculado', cls: 'text-ink-600 bg-ink-100 border-ink-200' },
  ]
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {origens.map((i) => (
        <li key={i.sigla} className="flex items-center gap-1.5 text-[11px] text-ink-500">
          <span className={`rounded border px-[3px] text-[9px] font-bold ${i.cls}`}>{i.sigla}</span>
          {i.texto}
        </li>
      ))}
    </ul>
  )
}
