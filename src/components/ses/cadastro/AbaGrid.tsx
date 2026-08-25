import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Plus, Question, Trash } from '@phosphor-icons/react'
import type { AbaDef, Cidade, ColDef, Origem, Row } from '../../../data/cadastroUnidade/types'
import { CIDADE_EDITAVEL_EM, COLUNA_AJUDA, LARGURA_ACOES, colunaLabel, colunaLargura, ehAditiva, larguraDaGrade } from '../../../data/cadastroUnidade/schema'
import { DICT } from '../../../domain/dict'
import { computeCalc } from '../../../lib/cadastroCalc'
import { colunasDoEscopo } from '../../../lib/cadastroEscopo'
import type { Dados } from '../../../lib/cadastroFluxo'
import { Tooltip } from '../../ui/Tooltip'
import { useAuth } from '../../../auth/AuthContext'
import { podeEditarCampoCadastro } from '../../../auth/permissoesCadastro'
import type { Papel } from '../../../auth/papeis'
import { useSelecaoGrade, type Edicao } from './useSelecaoGrade'
import { AbaCell } from './AbaCell'
import { FiltroColuna } from './FiltroColuna'

/**
 * Filtro só entra em aba grande. Nas de 1 a 11 linhas (Ano-base tem 1,
 * Superintendências 1, Concessão poucas) o funil seria ruído puro: rola menos
 * do que a altura da tela e se lê inteira de uma vez.
 */
const MIN_LINHAS_PARA_FILTRO = 15

const badgeTone: Record<Origem, string> = {
  db: 'text-water-600 bg-water-50 border border-water-200',
  un: 'text-amber-600 bg-amber-50 border border-amber-300',
  calc: 'text-ink-600 bg-ink-100 border border-ink-200',
}
const badgeLabel: Record<Origem, string> = { db: 'DB', un: 'un', calc: 'fx' }

/** Tecla na dica de atalhos. */
function Tecla({ children }: { children: string }) {
  return (
    <kbd className="rounded border border-ink-200 bg-ink-50 px-1 font-mono text-[10.5px] text-ink-600">
      {children}
    </kbd>
  )
}

function OrigemBadge({ origem }: { origem: Origem }) {
  return (
    <span className={`text-[9px] font-bold rounded px-[3px] whitespace-nowrap align-middle ${badgeTone[origem]}`}>
      {badgeLabel[origem]}
    </span>
  )
}

/**
 * O SELO DE PROCEDÊNCIA SAIU DA GRADE (07/08/2026), e a decisão foi do cliente.
 *
 * Ele nasceu em 30/07 do pedido "precisamos de um tracking melhor do que é
 * informação mockada e o que é dado real", e virou um ícone por cabeçalho de coluna
 * mais uma legenda de cinco linhas. Quatro dias depois, o mesmo interlocutor pediu o
 * contrário — Wagner, 04/08: *"essa legenda de dado real, isso aqui sai depois, né?
 * Só fica essa parte da legendinha do Databricks, você preenche, calculado."*
 *
 * Não é contradição: o que ele pediu em 30/07 era saber DURANTE A CONSTRUÇÃO no que
 * podia confiar; agora que a base real está carregada, o selo de "dado real" ficou em
 * quase toda coluna e passou a ser ruído. O que restou de útil — a origem
 * (DB / un / fx), que diz quem edita o quê — é justamente o que ele pediu para ficar.
 *
 * O `procedencia` NÃO saiu do SCHEMA: continua obrigatório em cada `ColDef`, e é ele
 * que obriga quem acrescenta coluna a declarar se aquilo é dado ou invenção. A
 * informação continua rastreada no código e nos documentos de análise — deixou de
 * ocupar pixel de cabeçalho.
 *
 * Se um dia o alerta de exemplo fictício fizer falta na tela, o caminho mais barato
 * é ressuscitar só o ⚗ de `mock` (era o único selo que avisava de risco), e não os
 * sete.
 */

/**
 * O "?" DA COLUNA — a ajuda de campo, agora no cabeçalho (item 26).
 *
 * O pedido da Aegea foi mover a explicação da CÉLULA para o CABEÇALHO, e a razão
 * era espaço: o ícone por célula (`AbaCellWithDict`, aposentado) comia ~20px de
 * dentro de colunas de 84px, repetido em toda linha de uma aba de 22 colunas.
 *
 * A primeira tentativa passou o texto para o atributo `title` nativo do `<th>` — e
 * estava errada, ainda que o conteúdo estivesse no lugar certo: `title` não tem
 * indício visual nenhum. Quem não soubesse que a explicação existe não teria como
 * descobrir, e o resultado prático foi a ajuda DESAPARECER da tela. Um ícone por
 * COLUNA custa 13px uma vez, não uma vez por linha — que era o problema original.
 *
 * O conteúdo é o mesmo verbete de antes, na mesma ordem: nome técnico (o
 * vocabulário com que a Aegea se refere ao campo), a nota da coluna quando existe
 * (`COLUNA_AJUDA` — "b001 é código provisório"), e então o que é / por que importa
 * / exemplo. O SCHEMA é a fonte primária; `DICT` cobre as colunas cujo verbete
 * negociado ainda não foi embutido nele.
 */
/** Texto reduzido ao essencial, para comparar duas redações do mesmo conteúdo. */
const soLetras = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')

function AjudaColuna({ col, coldef }: { col: string; coldef: ColDef }) {
  const verbete = DICT[col]
  const oque = coldef.oque ?? verbete?.oque
  const porque = coldef.porque ?? verbete?.porque
  const exemplo = coldef.exemplo ?? verbete?.exemplo
  const nota = COLUNA_AJUDA[col]

  // Coluna sem nada a dizer não ganha ícone: um "?" que abre caixa vazia é pior
  // que a ausência dele.
  if (!oque && !nota) return null

  /**
   * `COLUNA_AJUDA` e `oque` se SOBREPÕEM em várias colunas, e não por descuido: as
   * duas foram escritas da mesma fonte, em momentos diferentes — a primeira para
   * caber num tooltip curto, a segunda como verbete do dicionário. Nas quatro
   * colunas do Fluxo de escoamento elas dizem literalmente a mesma frase, e a dica
   * saía com o texto repetido em dois parágrafos seguidos.
   *
   * Quando uma contém a outra, sobra a MAIS COMPLETA — que costuma ser a nota, por
   * levar a explicação do prefixo do código ("b001 é sub-bacia, t001 é CTS").
   */
  const sobrepostas = !!nota && !!oque && (soLetras(nota).includes(soLetras(oque)) || soLetras(oque).includes(soLetras(nota)))
  const notaExibida = sobrepostas ? undefined : nota
  const oqueExibido = sobrepostas && nota && oque ? (nota.length >= oque.length ? nota : oque) : oque

  return (
    <Tooltip
      content={
        <>
          <p><strong className="font-mono text-[12px]">{col}</strong></p>
          {notaExibida && <p>{notaExibida}</p>}
          {oqueExibido && <p><strong>O que é:</strong> {oqueExibido}</p>}
          {porque && <p><strong>Por que importa:</strong> {porque}</p>}
          {exemplo && <p><strong>Exemplo:</strong> <em>{exemplo}</em></p>}
        </>
      }
    >
      <Question
        weight="bold"
        aria-label={`Ajuda: ${colunaLabel(col)}`}
        className="inline cursor-help align-middle text-[12px] text-ink-400 transition-colors duration-hover ease-saida hover:text-water-600"
      />
    </Tooltip>
  )
}

interface AbaGridProps {
  aba: AbaDef
  rows: Row[]
  /** Cidades da unidade — alimentam o select de cidade das abas de metas/paridade. */
  cidades: Cidade[]
  /**
   * O cadastro inteiro, de passagem para a `AbaCell`: célula derivada de outra
   * aba (sistema da CTS) e lista suspensa que depende de outras abas (destino do
   * fluxo). A grade não lê nada disso — só entrega. Ver `AbaCellProps.dados`.
   */
  dados: Dados
  onCell: (ri: number, col: string, value: string) => void
  onAddRow: () => void
  onDelRow: (ri: number) => void
  /**
   * A GRADE SÓ ACEITA DIGITAÇÃO QUANDO A TELA LIBERA.
   *
   * `false` deixa tudo somente leitura, mesmo para quem tem permissão de editar
   * — é o modo "olhar sem mexer", e o botão Editar da tela é quem o liga. Sem
   * isso, uma tabela de mil linhas fica sempre armada: um clique fora de lugar
   * altera dado de cadastro sem nenhuma intenção declarada.
   *
   * O padrão é `true` para não mudar as telas que ainda não têm o botão.
   */
  edicaoLiberada?: boolean
  /**
   * UMA AÇÃO POR LINHA, além do lixo de "remover linha".
   *
   * Nasceu para tirar uma CTS do sistema, na aba do Fluxo: é ação sobre a
   * POSIÇÃO do componente, não sobre a linha — a linha continua existindo, e o
   * componente volta para a lista dos sem sistema.
   *
   * Vem em três pedaços, e não num objeto, porque objeto literal nasceria novo a
   * cada render e derrubaria o `memo` de `AbaGridRow` — o mesmo defeito que já
   * custou 300ms por tecla aqui.
   */
  acaoRotulo?: string
  acaoVisivelEm?: (row: Row) => boolean
  onAcaoLinha?: (ri: number) => void
  /** Escrita em lote — o colar de uma seleção de várias células. */
  onCells: (edicoes: { ri: number; col: string; value: string }[]) => void
  /** Avisa a tela quando o filtro é limpo por efeito colateral (ex.: nova linha). */
  onAviso?: (mensagem: string) => void
  /**
   * O RECORTE DA BARRA DE ESCOPO, como PREDICADO — e é de propósito que não seja
   * `{cidadeId, sistemaId}`.
   *
   * A grade não sabe o que é cidade nem sistema, e não precisa: quem resolve os
   * joins de cada aba é `cadastroEscopo`, no `CadastroWizard`. Aqui chega uma
   * pergunta de sim/não por linha, que entra no MESMO `useMemo` de `visiveis` que
   * os filtros de coluna. É o que garante que a tradução de índice continue
   * valendo para um recorte só — ver o comentário de `visiveis`.
   */
  filtroEscopo?: (row: Row) => boolean
  /** Limpa o recorte da barra. Chamado ao adicionar linha, junto dos filtros. */
  onLimparEscopo?: () => void
  /**
   * A LINHA EM FOCO SAINDO DA GRADE, em índice ORIGINAL — o canal que liga a
   * tabela ao unifilar na aba do Fluxo. `null` quando não há foco.
   *
   * Índice original, e não visível: quem recebe usa para achar a linha em
   * `unidade.data`, que é indexada pelo array inteiro.
   */
  onFocoLinha?: (idx: number | null) => void
  /**
   * PEDIDO DE FOCO VINDO DE FORA — o clique numa caixa do unifilar.
   *
   * `nonce` existe porque clicar DUAS VEZES no mesmo nó tem de reagir das duas:
   * sem ele o objeto seria igual ao anterior e o efeito não rodaria.
   */
  focarLinha?: { idx: number; nonce: number } | null
}

/** Espelha as regras de bloqueio do `AbaCell` — o que ele desabilita, o colar não escreve. */
const CAMPOS_SO_ETE_NOVA = ['capex_terreno', 'modulos']

function celulaEditavel(aba: AbaDef, row: Row | undefined, col: string, origem: Origem): boolean {
  if (!row) return false
  if (origem === 'calc') return false
  if (aba.key === 'ete-capex' && CAMPOS_SO_ETE_NOVA.includes(col) && row.nova !== 'Sim') return false
  if (origem === 'db') return col === 'cidade_id' && CIDADE_EDITAVEL_EM.includes(aba.key)
  return true
}

/**
 * `celulaEditavel` acima é a regra ESTRUTURAL (campo calculado, vindo do
 * Databricks, ETE que não é nova) — a mesma para todo mundo. Esta soma o
 * PAPEL de quem está olhando: administrador edita o que a regra estrutural
 * libera; financeiro só WACC; o resto não edita nada — espelho de
 * `podeEditarCampoCadastro` (`auth/permissoesCadastro.ts`), que por sua vez
 * espelha o que `POST /api/cadastro` já impõe no servidor.
 *
 * Travar aqui é PREVENÇÃO — o servidor decide de verdade —, e o motivo de
 * fazer o esforço mesmo assim: sem isto, alguém sem permissão digita, clica
 * Salvar, e o 403 derruba o lote inteiro — inclusive uma edição de WACC
 * legítima que tivesse ido junto, porque o salvamento é tudo-ou-nada.
 */
function podeEditarCelula(
  aba: AbaDef,
  row: Row | undefined,
  col: string,
  origem: Origem,
  papeis: readonly Papel[],
): boolean {
  return celulaEditavel(aba, row, col, origem) && podeEditarCampoCadastro(papeis, aba.key, col)
}

/**
 * BARRA DE ROLAGEM NO TOPO — espelha a de baixo, acima do cabeçalho.
 *
 * Em abas largas (Sub-bacias tem 20 colunas, CTS 22) a barra nativa fica no
 * rodapé da tabela, que só aparece depois de rolar a PÁGINA até o fim: para
 * andar de lado era preciso descer, arrastar, e subir de volta para ler o
 * cabeçalho da coluna que apareceu. Aqui a barra fica onde a leitura começa.
 *
 * São dois elementos que rolam juntos, e não um `position: sticky` sobre a
 * barra nativa — o navegador não deixa reposicionar a barra de um container.
 * O de cima é uma div vazia com a largura da tabela dentro; o `overflow-x`
 * dela produz uma barra real, e cada um escreve o `scrollLeft` do outro.
 *
 * `sincronizando` corta o ciclo: escrever `scrollLeft` dispara `scroll` no
 * outro elemento, que escreveria de volta no primeiro — em telas com rolagem
 * suave isso vira tremor. O flag faz o eco ser ignorado.
 */
function useRolagemEspelhada(larguraTabela: number) {
  const topoRef = useRef<HTMLDivElement>(null)
  const corpoRef = useRef<HTMLDivElement>(null)
  const sincronizando = useRef(false)
  const [transborda, setTransborda] = useState(false)

  // Só faz sentido mostrar a barra quando a tabela realmente não cabe — e isso
  // muda com o tamanho da janela e com a aba escolhida, não só na montagem.
  useEffect(() => {
    const corpo = corpoRef.current
    if (!corpo) return
    const medir = () => setTransborda(corpo.scrollWidth > corpo.clientWidth + 1)
    medir()
    const ro = new ResizeObserver(medir)
    ro.observe(corpo)
    return () => ro.disconnect()
  }, [larguraTabela])

  const espelhar = useCallback((de: HTMLDivElement | null, para: HTMLDivElement | null) => {
    if (!de || !para || sincronizando.current) return
    sincronizando.current = true
    para.scrollLeft = de.scrollLeft
    // rAF em vez de liberar na hora: o `scroll` do outro elemento chega no
    // próximo frame, não neste. Liberar antes dele deixaria o eco passar.
    requestAnimationFrame(() => { sincronizando.current = false })
  }, [])

  return {
    topoRef,
    corpoRef,
    transborda,
    aoRolarTopo: () => espelhar(topoRef.current, corpoRef.current),
    aoRolarCorpo: () => espelhar(corpoRef.current, topoRef.current),
  }
}

/**
 * COLUNA NUMÉRICA — descoberta pelos DADOS, e não declarada no schema.
 *
 * A alternativa seria um campo `tipo` em cada `ColDef`, e ela foi descartada
 * por custo: são 15 abas e mais de 200 colunas, e o campo teria de ser
 * preenchido uma a uma para entregar alinhamento, que é acabamento visual.
 * Ler o dado responde a mesma pergunta sem tocar em nenhuma das 200.
 *
 * A decisão é por COLUNA, nunca por célula: uma coluna onde só algumas linhas
 * são números ficaria com o texto pulando de lado a cada linha, que é pior que
 * não alinhar nada.
 *
 * Os IDs ficam de fora à força. `emp_codigo` é código real e às vezes só
 * dígitos ('1234'), e as colunas `*_id` geradas poderiam virar dígitos puros
 * um dia — nos dois casos o valor É um rótulo, e rótulo se lê da esquerda.
 */
const AMOSTRA_NUMERICA = 30

function paraNumero(valor: string): number | null {
  const s = valor.trim()
  if (s === '' || s === '—') return null
  // Aceita as duas convenções que aparecem na base: '1.234,56' (pt-BR, como a
  // Aegea envia) e '1234.56' (como o motor devolve).
  const n = Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s)
  return Number.isFinite(n) ? n : null
}

const ehNumero = (valor: string) => paraNumero(valor) !== null

/**
 * ERRO LOCAL NA CÉLULA — e a fronteira com o Painel de problemas.
 *
 * A decisão de 30/07/2026 com a Aegea é que erro NÃO vai para o lado do campo:
 * a duplicata de ID mora na Revisão porque a linha conflitante está em OUTRA
 * aba, e um alerta ali interromperia sem ser acionável. Essa decisão continua
 * valendo, e o `PainelProblemas` não perdeu nada.
 *
 * O que entra aqui é só o erro que se conserta ONDE ESTÁ, e hoje existe
 * exatamente um tipo assim: valor não-numérico em coluna numérica. Repare que
 * isto NÃO é regra de negócio inventada — é consistência de tipo, derivada do
 * que a própria coluna já é (`useColunasNumericas`). Nenhum limite, faixa ou
 * obrigatoriedade foi criado aqui; isso depende de decisão de produto.
 *
 * `calc` fica fora: o valor é do motor, não da pessoa, e ela não tem como
 * corrigi-lo na célula.
 */
function erroLocal(valor: string, col: string, origem: Origem, numericas: Set<string>): string | null {
  if (origem === 'calc') return null
  if (!numericas.has(col) || valor.trim() === '') return null
  if (ehNumero(valor)) return null
  return 'Esta coluna é numérica e este valor não é um número — o motor vai ignorar a linha.'
}

const fmt = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 })

/**
 * DENSIDADE DA GRADE — três alturas de linha, e a escolha fica salva.
 *
 * Com 1.047 linhas, altura de linha é tempo de trabalho: a compacta mostra ~24
 * linhas por tela onde a confortável mostra ~14. Não existe resposta única
 * (quem confere dado quer o máximo na tela; quem digita o dia inteiro quer
 * respiro), então é preferência, não decisão de design.
 *
 * `localStorage` e não estado do React: a escolha tem de sobreviver ao recarregar
 * a página, senão a pessoa reescolhe toda manhã. E não vai para o backend porque
 * é preferência de máquina, não de conta — a mesma pessoa pode querer compacto
 * no notebook e confortável no monitor grande.
 */
type Densidade = 'compacta' | 'padrao' | 'confortavel'
const DENSIDADE_PAD: Record<Densidade, { cel: string; label: string }> = {
  compacta: { cel: 'py-0.5', label: 'Compacta' },
  padrao: { cel: 'py-1.5', label: 'Padrão' },
  confortavel: { cel: 'py-3', label: 'Confortável' },
}
const CHAVE_DENSIDADE = 'ses:grade:densidade'

function useDensidade() {
  const [densidade, setDensidade] = useState<Densidade>(() => {
    // try/catch: `localStorage` lança em janela privada de alguns navegadores, e
    // uma grade que não abre por causa de uma preferência de layout seria um
    // preço absurdo. Falhando, cai no padrão.
    try {
      const salvo = localStorage.getItem(CHAVE_DENSIDADE)
      if (salvo === 'compacta' || salvo === 'padrao' || salvo === 'confortavel') return salvo
    } catch { /* sem localStorage: fica no padrão */ }
    return 'padrao'
  })

  const escolher = useCallback((d: Densidade) => {
    setDensidade(d)
    try { localStorage.setItem(CHAVE_DENSIDADE, d) } catch { /* preferência não persiste, e só */ }
  }, [])

  return { densidade, escolher }
}

function useColunasNumericas(aba: AbaDef, rows: Row[], dados: Dados) {
  /**
   * As dependências são `aba.key` e `rows.length`, DE PROPÓSITO — e não `rows`
   * e `dados`, que é o que o exhaustive-deps pediria.
   *
   * Alinhamento é propriedade da coluna, não do valor: ele não deve mudar
   * porque alguém digitou um dígito. Com `rows`/`dados` nas dependências, os
   * 660 `computeCalc` da amostra rodariam a cada tecla digitada na grade —
   * caro e sem efeito nenhum na tela.
   */
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => {
    const set = new Set<string>()
    for (const { coluna, origem } of aba.cols) {
      if (coluna.endsWith('_id') || coluna === 'emp_codigo') continue
      let vistos = 0
      let todosNumeros = true
      for (const row of rows.slice(0, AMOSTRA_NUMERICA)) {
        const v =
          origem === 'calc'
            ? String(computeCalc(coluna, row, { abaKey: aba.key, dados }) ?? '')
            : row[coluna] ?? ''
        if (v.trim() === '' || v === '—') continue
        vistos++
        if (!ehNumero(v)) { todosNumeros = false; break }
      }
      // `vistos > 0`: coluna inteiramente vazia não tem evidência de nada, e
      // alinhar à direita por chute deixaria os placeholders desalinhados dos
      // valores que chegarem depois.
      if (todosNumeros && vistos > 0) set.add(coluna)
    }
    return set
  }, [aba.key, rows.length])
}

/**
 * Listra de fundo por bloco (`aba.zebraPor`) — puramente visual, sem agrupar
 * nem esconder linha nenhuma. Alterna a cada mudança de valor da coluna, e
 * assume que as linhas do mesmo bloco já chegam consecutivas no array; se não
 * chegarem (import futuro fora de ordem), a listra some, mas os dados
 * continuam corretos — ver comentário de `zebraPor` em `types.ts`.
 */
function useZebra(rows: Row[], zebraPor: string | undefined) {
  return useMemo(() => {
    if (!zebraPor) return null
    let clara = false
    return rows.map((row, i) => {
      const novoBloco = i === 0 || (row[zebraPor] ?? '') !== (rows[i - 1][zebraPor] ?? '')
      if (novoBloco && i !== 0) clara = !clara
      return { clara, novoBloco: novoBloco && i !== 0 }
    })
  }, [rows, zebraPor])
}

/** As abas cuja célula consulta OUTRAS abas — seletor de entidade ou coluna
 *  calculada que olha para fora da linha. Ver `dadosDaCelula`. */
const PRECISAM_DO_CADASTRO = new Set([
  'sistema-topologia',
  'ete-capex',
  'cts-operacional',
  'subbacia-cts',
])

/** Identidade estável para as abas que não consultam nada fora da linha. */
const SEM_CADASTRO = {} as Dados

export function AbaGrid({
  aba, rows, cidades, dados, onCell, onAddRow, onDelRow, onCells, onAviso,
  filtroEscopo, onLimparEscopo, onFocoLinha, focarLinha,
  edicaoLiberada = true, acaoRotulo, acaoVisivelEm, onAcaoLinha,
}: AbaGridProps) {
  // Papel de quem está olhando — decide, campo a campo, o que `podeEditarCelula`
  // libera. `[]` (deslogado/carregando) não edita nada, que é o default seguro.
  // A coluna de ações existe se a aba cria linhas OU se a tela deu uma ação de
  // linha. Antes ela dependia só de `addRow`, e uma ação sem `addRow` ficava
  // sem lugar para aparecer.
  const temAcoes = !!aba.addRow || !!onAcaoLinha
  const { user } = useAuth()
  const papeis = user?.papeis ?? []

  /**
   * Filtros por coluna: `nome da coluna → conjunto de valores aceitos`.
   * Ausente ou `null` = coluna sem filtro.
   *
   * Vive no estado local e RESETA ao trocar de aba (a chave do efeito é
   * `aba.key`): filtro que sobrevive à navegação faz a pessoa voltar numa aba,
   * ver 3 linhas onde havia 1.047, e concluir que perdeu dados.
   */
  const [filtros, setFiltros] = useState<Record<string, Set<string> | null>>({})
  useEffect(() => { setFiltros({}) }, [aba.key])

  const colunasFiltraveis = rows.length >= MIN_LINHAS_PARA_FILTRO

  /**
   * AS COLUNAS QUE A BARRA DE ESCOPO JÁ GOVERNA PERDEM O FUNIL.
   *
   * Duas maneiras de filtrar sistema na mesma tela — a barra e o funil de
   * `sistema_name` — são dois controles que podem discordar, e o segundo é o que
   * não tem para onde apontar quando o primeiro já recortou a lista de valores.
   */
  const semFunil = useMemo(() => colunasDoEscopo(aba), [aba])

  /**
   * TRADUÇÃO DE ÍNDICE — o ponto crítico do filtro.
   *
   * O reducer do `CadastroContext` escreve por POSIÇÃO no array original
   * (`rows.map((r, i) => i === action.ri ? ...)`). Se a grade renderizar uma
   * lista filtrada e mandar para fora o índice do que está na tela, a escrita
   * cai na linha errada — silenciosamente, o pior tipo de bug de planilha.
   *
   * Então `visiveis` guarda o índice original de cada linha exibida, e TODA
   * saída (`onCell`, `onCells`, `onDelRow`) é traduzida antes de sair daqui.
   * `useSelecaoGrade` não sabe que filtro existe: para ele `totalLinhas` é o
   * que está visível, e é assim que copiar/colar passa a operar dentro do
   * recorte — o mesmo comportamento do Excel com filtro ativo.
   */
  const visiveis = useMemo(() => {
    const ativos = Object.entries(filtros).filter(([, s]) => s !== null) as [string, Set<string>][]
    let lista = rows.map((row, idx) => ({ row, idx }))
    // O recorte da barra ANTES dos filtros de coluna, e no mesmo memo: os dois
    // compõem em E, e `idx` continua sendo a posição no array original.
    if (filtroEscopo) lista = lista.filter(({ row }) => filtroEscopo(row))
    if (!ativos.length) return lista
    return lista.filter(({ row }) => ativos.every(([col, aceitos]) => aceitos.has(row[col] ?? '')))
  }, [rows, filtros, filtroEscopo])

  const qtdFiltros = useMemo(
    () => Object.values(filtros).filter((s) => s !== null).length,
    [filtros],
  )

  const zebra = useZebra(useMemo(() => visiveis.map((v) => v.row), [visiveis]), aba.zebraPor)

  const colunasNumericas = useColunasNumericas(aba, rows, dados)

  const { densidade, escolher } = useDensidade()

  /**
   * Somas das colunas aditivas presentes nesta aba — ver `COLUNAS_ADITIVAS`.
   *
   * Colunas `calc` entram, e por isso o `computeCalc` aparece aqui: `capex` é
   * derivada, e é justamente o total que a Aegea pergunta primeiro. O custo é
   * uma passada pelas linhas VISÍVEIS por edição — aritmética, na ordem de
   * microssegundos, contra a alternativa de omitir o número que mais importa.
   */
  const somas = useMemo(() => {
    const out: { col: string; total: number }[] = []
    for (const { coluna, origem } of aba.cols) {
      if (!ehAditiva(coluna)) continue
      let total = 0
      let algum = false
      for (const { row } of visiveis) {
        const bruto = origem === 'calc'
          ? String(computeCalc(coluna, row, { abaKey: aba.key, dados }) ?? '')
          : row[coluna] ?? ''
        const n = paraNumero(bruto)
        if (n === null) continue
        total += n
        algum = true
      }
      if (algum) out.push({ col: coluna, total })
    }
    return out
  }, [aba, visiveis, dados])

  /** Células editáveis e vazias no recorte visível — o "falta isto" do rodapé. */
  const pendentes = useMemo(() => {
    let n = 0
    for (const { row } of visiveis) {
      for (const { coluna, origem } of aba.cols) {
        if (!celulaEditavel(aba, row, coluna, origem)) continue
        if ((row[coluna] ?? '') === '') n++
      }
    }
    return n
  }, [visiveis, aba])

  /** Erros locais no recorte visível — ver `erroLocal`. */
  const erros = useMemo(() => {
    let n = 0
    for (const { row } of visiveis) {
      for (const { coluna, origem } of aba.cols) {
        if (erroLocal(row[coluna] ?? '', coluna, origem, colunasNumericas)) n++
      }
    }
    return n
  }, [visiveis, aba, colunasNumericas])

  // Mesmo cálculo que o `CadastroWizard` usa para dimensionar a coluna da
  // esquerda na aba do Fluxo — ver `larguraDaGrade`.
  const larguraTabela = useMemo(() => larguraDaGrade(aba, temAcoes), [aba, temAcoes])

  /**
   * O QUE A CÉLULA PRECISA SABER sobre o resto do cadastro — por ABA.
   *
   * Duas forças opostas se encontram aqui, e as duas já morderam:
   *
   *   CORREÇÃO  `opcoesDaCelula` monta o catálogo a partir das fichas. Sem
   *   `subbacia-operacional`, `cts-operacional` e `ete-capex` ele não reconhece
   *   componente nenhum, e o seletor de destino do Fluxo abre VAZIO — sem erro,
   *   só uma lista sem opções.
   *
   *   CUSTO  `dados` inteiro muda de identidade a cada tecla. Descê-lo para as
   *   linhas mantém o `memo` de `AbaGridRow` sempre errado, e uma unidade real
   *   repinta 15 mil células por tecla — 378ms medidos contra 49ms.
   *
   * A saída não é escolher um lado: é notar que POUCAS abas precisam olhar para
   * fora da linha. Só quatro têm seletor de entidade ou coluna calculada que
   * consulta outra aba. As demais — inclusive as duas maiores, sub-bacias e
   * componentes de CAPEX, onde se digita número atrás de número — recebem um
   * objeto vazio e ESTÁVEL, e o `memo` funciona nelas.
   *
   * Na aba do Fluxo o custo continua: editar o jusante muda `sistema-topologia`,
   * que está na fatia, e as linhas repintam. É a aba onde se escolhe em lista e
   * se digita pouco, então é o lado certo para pagar.
   */
  // SEM `useMemo`: um `useMemo` com `dados` na lista de dependências devolveria
  // um `{}` NOVO a cada tecla — o objeto vazio precisa ser o MESMO sempre, e por
  // isso é constante de módulo (`SEM_CADASTRO`). Foi o que fez a primeira versão
  // desta correção não mudar nada: 314ms, idênticos aos de antes.
  const dadosDaCelula = PRECISAM_DO_CADASTRO.has(aba.key) ? dados : SEM_CADASTRO
  const rolagem = useRolagemEspelhada(larguraTabela)

  const podeEditar = useCallback(
    (ri: number, ci: number) => {
      const def = aba.cols[ci]
      return def ? podeEditarCelula(aba, visiveis[ri]?.row, def.coluna, def.origem, papeis) : false
    },
    [aba, visiveis, papeis],
  )

  const valorDe = useCallback(
    (ri: number, ci: number) => visiveis[ri]?.row[aba.cols[ci]?.coluna ?? ''] ?? '',
    [aba.cols, visiveis],
  )

  const aplicarEdicoes = useCallback(
    (edicoes: Edicao[]) =>
      onCells(
        edicoes.map(({ ri, ci, value }) => ({
          ri: visiveis[ri].idx,
          col: aba.cols[ci].coluna,
          value,
        })),
      ),
    [aba.cols, onCells, visiveis],
  )

  const sel = useSelecaoGrade({
    totalLinhas: visiveis.length,
    totalColunas: aba.cols.length,
    podeEditar,
    valorDe,
    onAplicar: aplicarEdicoes,
  })

  /**
   * A LINHA EM FOCO INDO PARA FORA — em índice ORIGINAL.
   *
   * `sel.foco.ri` é índice do VISÍVEL, e é o mesmo cuidado de `aplicarEdicoes`:
   * quem está fora indexa `unidade.data`, que é o array inteiro. Traduzir aqui
   * é o que impede o unifilar de acender o nó errado quando há filtro ativo.
   *
   * Calculado fora do efeito para o efeito depender de um NÚMERO, e não do
   * objeto `foco`: andar de coluna na mesma linha não avisa ninguém de nada.
   */
  const idxFocado = sel.foco ? visiveis[sel.foco.ri]?.idx ?? null : null
  useEffect(() => {
    onFocoLinha?.(idxFocado)
  }, [idxFocado, onFocoLinha])

  /**
   * PEDIDO DE FOCO VINDO DE FORA — o clique numa caixa do unifilar.
   *
   * A dependência é só `focarLinha` (por isso o disable): reexecutar quando
   * `visiveis` muda faria a grade pular de volta para a linha pedida a cada
   * tecla digitada em qualquer outra.
   *
   * `focus()` antes do `scrollIntoView` não é redundância: é o que devolve o
   * teclado à grade — `onKeyDown`, `onCopy` e `onPaste` vivem no container e só
   * recebem o evento porque ele borbulha do elemento focado (ver `focarNoDom`
   * em `useSelecaoGrade`).
   */
  useEffect(() => {
    if (!focarLinha) return
    const ri = visiveis.findIndex((v) => v.idx === focarLinha.idx)
    if (ri === -1) return
    sel.selecionarCelula(ri, 0)
    requestAnimationFrame(() => {
      const celula = rolagem.corpoRef.current?.querySelector<HTMLElement>(`[data-celula="${ri}-0"]`)
      celula?.focus({ preventScroll: true })
      celula?.scrollIntoView({ block: 'center' })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focarLinha])

  /**
   * Adicionar linha com filtro ativo: a linha nasce vazia, quase certamente
   * não passa no filtro, e desapareceria no instante em que foi criada. Limpar
   * os filtros antes é a única saída que não parece bug.
   */
  function adicionarLinha() {
    // O recorte da barra sai junto, e pelo mesmo motivo: a linha nasce vazia,
    // não casa com cidade nem sistema nenhum, e desapareceria ao ser criada.
    const recortada = visiveis.length !== rows.length
    if (recortada) {
      setFiltros({})
      onLimparEscopo?.()
      onAviso?.('Filtros e recorte limpos para mostrar a linha nova.')
    }
    onAddRow()
  }

  return (
    <div
      ref={sel.containerRef}
      onKeyDown={sel.onKeyDown}
      onCopy={sel.onCopy}
      onPaste={sel.onPaste}
      onMouseUp={sel.aoSoltarMouse}
      onMouseLeave={sel.aoSoltarMouse}
    >
      {/* A BARRA DE CIMA FICOU SÓ COM O FILTRO (11/08/2026).
          O botão "Adicionar linha" desceu para o fim da grade, como linha
          fantasma: quando se termina de preencher a última linha, o cursor está
          lá embaixo, não 40 linhas acima. E a dica de atalhos foi para o rodapé
          — como parágrafo fixo no topo ela era ruído permanente ocupando a
          largura inteira, todo dia, para uma informação que se lê uma vez. */}
      {qtdFiltros > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setFiltros({})}
            className="inline-flex items-center gap-2 rounded-full bg-water-50 px-3 py-1.5 text-[12.5px] font-semibold text-water-700 transition-colors duration-hover ease-saida hover:bg-water-100"
          >
            {qtdFiltros} {qtdFiltros === 1 ? 'filtro' : 'filtros'} · limpar
          </button>
        </div>
      )}
      {/* `aria-hidden` + sem foco: para o teclado e o leitor de tela esta barra
          não existe — quem navega assim usa as setas do próprio grid, e um
          segundo alvo de tabulação que não mostra nada só atrapalharia. */}
      {rolagem.transborda && (
        <div
          ref={rolagem.topoRef}
          onScroll={rolagem.aoRolarTopo}
          aria-hidden="true"
          title="Arraste para ver as demais colunas"
          className="barra-rolagem-topo mb-1.5 overflow-x-auto overflow-y-hidden"
        >
          <div style={{ width: larguraTabela, height: 1 }} />
        </div>
      )}
      {/*
        A GRADE PASSOU A ROLAR POR DENTRO (11/08/2026), e é isso que destrava
        o cabeçalho fixo.

        `position: sticky` se ancora no ancestral que rola. Enquanto quem rolava
        era a PÁGINA e este container só tinha `overflow-x`, o `sticky` do
        `thead` não tinha onde grudar — pior: `overflow-x: auto` já faz o
        navegador calcular `overflow-y: auto`, então o container era um
        contêiner de rolagem de altura infinita, e o cabeçalho grudava num topo
        que nunca saía da tela.

        Com altura máxima, a rolagem vertical acontece aqui dentro: o cabeçalho
        gruda de verdade, e a coluna de identidade pode grudar à esquerda pelo
        mesmo mecanismo. É o comportamento que qualquer planilha tem, e a
        alternativa (cabeçalho flutuante posicionado por JS) custaria muito mais
        e quebraria na primeira mudança de layout.

        `13rem` é o que fica acima da grade: cabeçalho da aplicação (56px),
        título da aba, stepper e a barra de rolagem espelhada.
      */}
      <div
        ref={rolagem.corpoRef}
        onScroll={rolagem.aoRolarCorpo}
        className="max-h-[calc(100vh-13rem)] overflow-auto rounded-lg border border-ink-200"
      >
        <table
          className="table-fixed border-collapse min-w-full"
          style={{ width: larguraTabela }}
        >
          <colgroup>
            {aba.cols.map(({ coluna: col }) => (
              <col key={col} style={{ width: colunaLargura(col) }} />
            ))}
            {temAcoes && <col style={{ width: LARGURA_ACOES }} />}
          </colgroup>
          {/* z-20: acima das células normais (z-0) e da coluna congelada
              (z-10), para o canto superior esquerdo — que é as duas coisas ao
              mesmo tempo — não deixar linha passar por baixo. */}
          <thead className="sticky top-0 z-20">
            <tr>
              {aba.cols.map((coldef, ci) => {
                const { coluna: col, origem } = coldef
                const congelada = ci === 0 && rolagem.transborda
                return (
                <th
                  key={col}
                  style={congelada ? { left: 0 } : undefined}
                  data-congelada={congelada ? '1' : undefined}
                  // O `title` carrega SÓ o nome técnico da coluna — o vocabulário
                  // com que a Aegea se refere ao campo. A explicação inteira vive
                  // no "?" ao lado (ver `AjudaColuna`), que é visível; repeti-la
                  // aqui daria duas dicas concorrentes sobre o mesmo cabeçalho.
                  title={col}
                  // Três regras globais de `thead th` (index.css) precisam cair aqui,
                  // e as três pelo mesmo motivo: largura.
                  //
                  //   whitespace-nowrap → whitespace-normal : sem isso o rótulo longo
                  //     estoura a largura fixa da coluna e vaza por cima da vizinha.
                  //   uppercase → normal-case  |  tracking-[.085em] → tracking-normal :
                  //     MAIÚSCULA com espaçamento entre letras é MUITO mais larga que
                  //     texto normal. Era a causa real de "PRAZO DAS PREDE/CESSO/RAS" —
                  //     em caixa normal a palavra inteira cabe numa linha.
                  //
                  // `break-words` é rede de segurança: só age quando uma palavra
                  // é mais larga que a coluna inteira. Sem ele o texto TRANSBORDA
                  // para a coluna vizinha (foi o que causou o selo do
                  // "Quantidade" por cima do "Unidade de medida").
                  //
                  // `bg-ink-50` deixou de ser enfeite e virou requisito: um
                  // cabeçalho grudado sem fundo opaco deixa as linhas passarem
                  // por baixo dele enquanto a grade rola.
                  className={`whitespace-normal normal-case tracking-normal text-left align-bottom font-semibold text-ink-600 px-2 py-2 border-b border-ink-200 bg-ink-50 text-[12px] leading-tight break-words ${
                    congelada ? 'sticky z-30 shadow-congelada' : ''
                  }`}
                >
                  {/* O espaço antes do selo é o que dá ao navegador um PONTO DE
                      QUEBRA: com `margin` sozinha (sem espaço) não existe onde
                      quebrar, e o selo transborda a coluna em vez de descer de
                      linha. É o bug das colunas sobrepostas. */}
                  {colunaLabel(col)}{' '}
                  <span className="whitespace-nowrap">
                    <OrigemBadge origem={origem} /> <AjudaColuna col={col} coldef={coldef} />
                    {colunasFiltraveis && !semFunil.has(col) && (
                      <FiltroColuna
                        rotulo={colunaLabel(col)}
                        // `rows` e o nome da coluna, e NÃO `rows.map(...)`: o
                        // array pronto era descartado a cada render e ainda
                        // furava o memo do filtro. Ver o comentário de `Props`
                        // em `FiltroColuna`.
                        linhas={rows}
                        coluna={col}
                        selecionados={filtros[col] ?? null}
                        onChange={(s) => setFiltros((f) => ({ ...f, [col]: s }))}
                      />
                    )}
                  </span>
                </th>
                )
              })}
              {temAcoes && <th className="border-b border-ink-200 bg-ink-50" />}
            </tr>
          </thead>
          <tbody>
            {visiveis.map(({ row, idx }, ri) => {
              // Props primitivas (não o objeto intervalo) para o memo do row
              // funcionar: linha fora da seleção não re-renderiza a cada seta.
              const dentro = !!sel.intervalo && ri >= sel.intervalo.r0 && ri <= sel.intervalo.r1
              return (
                <AbaGridRow
                  key={idx}
                  aba={aba}
                  row={row}
                  ri={ri}
                  // O ÍNDICE ORIGINAL vai como PROP, e não capturado numa closure.
                  //
                  // Aqui havia `onCell={(_, col, value) => onCell(idx, …)}` e
                  // `onDelRow={() => onDelRow(idx)}`. Funcionavam, e anulavam o
                  // `memo` desta linha: as duas funções nasciam de novo a cada
                  // render do pai, então TODA linha via props novas e repintava.
                  // Com 751 sub-bacias × 20 colunas isso é ~15 mil células por
                  // tecla digitada — 322ms medidos, e a tela "demorando para
                  // responder ao clique".
                  idxOriginal={idx}
                  cidades={cidades}
                  dados={dadosDaCelula}
                  onCell={onCell}
                  onDelRow={onDelRow}
                  // PRIMITIVO, calculado aqui: a linha recebe `sim/nao`, e não
                  // a função que decide — assim o `memo` dela compara booleano.
                  acaoRotulo={acaoRotulo}
                  mostrarAcao={!!acaoVisivelEm?.(row)}
                  onAcao={onAcaoLinha}
                  edicaoLiberada={edicaoLiberada}
                  faixaClara={zebra?.[ri].clara ?? false}
                  novoBloco={zebra?.[ri].novoBloco ?? false}
                  selC0={dentro ? sel.intervalo!.c0 : -1}
                  selC1={dentro ? sel.intervalo!.c1 : -1}
                  focoCi={sel.foco?.ri === ri ? sel.foco.ci : -1}
                  editando={sel.editando}
                  onPressionar={sel.aoPressionarCelula}
                  onEntrar={sel.aoEntrarNaCelula}
                  onEditar={sel.iniciarEdicao}
                  numericas={colunasNumericas}
                  congelar={rolagem.transborda}
                  padCel={DENSIDADE_PAD[densidade].cel}
                  papeis={papeis}
                />
              )
            })}
            {!visiveis.length && (
              <tr>
                <td colSpan={aba.cols.length + (temAcoes ? 1 : 0)} className="py-8 text-center text-ink-400 text-sm">
                  {rows.length ? 'Nenhuma linha passa nos filtros.' : 'Nenhuma linha.'}
                </td>
              </tr>
            )}
            {/* LINHA FANTASMA — o "Adicionar linha" que era botão no topo.
                Fica no fim porque é onde a pessoa está quando acaba de
                preencher a última linha. É um <button> de verdade dentro da
                célula, e não um onClick no <tr>: linha clicável não recebe
                foco de teclado nem se anuncia como ação. */}
            {aba.addRow && (
              <tr>
                <td colSpan={aba.cols.length + 1} className="border-b border-ink-100 p-0">
                  <button
                    type="button"
                    onClick={adicionarLinha}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12.5px] font-medium text-ink-400 transition-colors duration-hover ease-saida hover:bg-aegea-50 hover:text-aegea-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-water-600"
                  >
                    <Plus weight="bold" className="text-[13px]" />
                    Nova linha
                  </button>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/*
        RODAPÉ DE AGREGADOS — a contagem de linhas mais o que falta preencher.

        A contagem sozinha já existia, e o total ao lado dela é o que impede a
        pessoa de achar que o filtro apagou dados ("84 linhas" sem o "de 1.047"
        parece perda).

        AS SOMAS saem de `COLUNAS_ADITIVAS` (schema.ts), e só aparecem as colunas
        aditivas que esta aba tem. A lista é classificação de engenharia e está
        marcada como pendente de confirmação da Aegea — em especial receita e
        vazão. Percentual, taxa, ano e prazo ficam de fora de propósito: somar
        ano daria "18.234", que PARECE plausível, e é o pior defeito de um rodapé.

        "N a preencher" conta célula EDITÁVEL e vazia dentro do recorte visível,
        usando a mesma `celulaEditavel` que decide o que a grade deixa digitar —
        se um dia a regra de bloqueio mudar, a contagem acompanha sozinha.
      */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-ink-200 pt-3 text-[12px] text-ink-500">
        <span className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono tabular-nums">
          <span>
            {/* A condição é `visiveis !== rows`, e não `qtdFiltros > 0`: o
                recorte da barra de escopo também esconde linha, e sem o total
                ao lado "84 linhas" se lê como perda de dado. */}
            {visiveis.length !== rows.length
              ? `${visiveis.length} de ${rows.length} linhas`
              : `${rows.length} linha${rows.length === 1 ? '' : 's'}`}
          </span>
          {pendentes > 0 && (
            <span className="text-amber-700">
              {pendentes} {pendentes === 1 ? 'campo a preencher' : 'campos a preencher'}
            </span>
          )}
          {pendentes === 0 && rows.length > 0 && <span className="text-aegea-700">nada pendente</span>}
          {erros > 0 && (
            <span className="font-semibold text-danger">
              {erros === 1 ? '1 valor não numérico' : `${erros} valores não numéricos`}
            </span>
          )}
          {somas.map(({ col, total }) => (
            <span key={col} title={`Soma de ${colunaLabel(col)} nas linhas visíveis`} className="text-ink-600">
              Σ {colunaLabel(col)} <strong className="font-semibold">{fmt.format(total)}</strong>
            </span>
          ))}
        </span>
        <span className="flex items-center gap-3">
          {/* Seletor de densidade — some em aba pequena, onde altura de linha
              não é problema nenhum e o controle seria só mais um botão. */}
          {rows.length >= MIN_LINHAS_PARA_FILTRO && (
            <span className="flex items-center gap-0.5 rounded-lg bg-ink-100 p-0.5" role="group" aria-label="Densidade das linhas">
              {(Object.keys(DENSIDADE_PAD) as Densidade[]).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => escolher(d)}
                  aria-pressed={densidade === d}
                  title={`Linhas ${DENSIDADE_PAD[d].label.toLowerCase()}s`}
                  className={`rounded-md px-2 py-1 text-[11px] font-semibold transition-colors duration-hover ease-saida ${
                    densidade === d ? 'bg-white text-water-700 shadow-sm' : 'text-ink-500 hover:text-ink-700'
                  }`}
                >
                  {DENSIDADE_PAD[d].label}
                </button>
              ))}
            </span>
          )}
          {/* A dica de atalhos desceu do topo para cá: quem descobre a grade
              olha o rodapé, e aqui ela não rouba a largura da tela toda. */}
          <span className="text-[11.5px] leading-snug text-ink-400">
            Setas navegam · <Tecla>Shift</Tecla>+setas seleciona · <Tecla>Ctrl</Tecla>+<Tecla>C</Tecla>/
            <Tecla>V</Tecla> copia e cola · <Tecla>Enter</Tecla> edita
            {colunasFiltraveis && qtdFiltros === 0 && ' · funil no cabeçalho filtra'}
          </span>
        </span>
      </div>
    </div>
  )
}

const AbaGridRow = memo(function AbaGridRow({
  aba, row, ri, idxOriginal, cidades, dados, onCell, onDelRow, acaoRotulo, mostrarAcao, onAcao,
  edicaoLiberada, faixaClara, novoBloco,
  selC0, selC1, focoCi, editando, onPressionar, onEntrar, onEditar, numericas, congelar, padCel, papeis,
}: {
  aba: AbaDef; row: Row; ri: number
  /** Posição da linha no array COMPLETO — `ri` é a posição entre as visíveis. */
  idxOriginal: number
  cidades: Cidade[]
  dados: Dados
  onCell: (ri: number, col: string, value: string) => void
  onDelRow: (ri: number) => void
  acaoRotulo?: string
  /** Já resolvido pelo pai — booleano, para o `memo` comparar barato. */
  mostrarAcao: boolean
  onAcao?: (ri: number) => void
  /** A tela liberou a digitação? Booleano, pelo mesmo motivo dos de cima. */
  edicaoLiberada: boolean
  faixaClara: boolean
  novoBloco: boolean
  /** Colunas alinhadas à direita — ver `useColunasNumericas`. */
  numericas: Set<string>
  /** Congela a primeira coluna. Só quando a tabela transborda de lado. */
  congelar: boolean
  /** Padding vertical da célula — vem da densidade escolhida (`DENSIDADE_PAD`). */
  padCel: string
  /** Faixa de colunas selecionadas nesta linha; -1 quando a linha está fora da seleção. */
  selC0: number
  selC1: number
  /** Coluna do foco, se ele estiver nesta linha; -1 caso contrário. */
  focoCi: number
  editando: boolean
  onPressionar: (ri: number, ci: number, shift: boolean) => void
  onEntrar: (ri: number, ci: number) => void
  onEditar: (ri: number, ci: number) => void
  /** Papel de quem está olhando — decide, junto de `celulaEditavel`, o que trava. */
  papeis: readonly Papel[]
}) {
  // A coluna congelada precisa de fundo OPACO próprio: ela desliza por cima das
  // vizinhas, e `bg-white` da <tr> não pinta a célula, pinta a linha atrás dela.
  // O tom acompanha a zebra para a listra não quebrar no congelamento.
  const fundoCongelada = faixaClara ? 'bg-[#f7f9fc]' : 'bg-white'

  return (
    <tr
      className={`group hover:bg-ink-50/60 ${faixaClara ? 'bg-ink-50/40' : 'bg-white'} ${
        novoBloco ? 'border-t-2 border-t-ink-200' : ''
      }`}
    >
      {aba.cols.map((coldef, ci) => {
        const { coluna: col, origem } = coldef
        const selecionada = selC0 !== -1 && ci >= selC0 && ci <= selC1
        const focada = focoCi === ci
        const congelada = ci === 0 && congelar
        const erro = erroLocal(row[col] ?? '', col, origem, numericas)
        // `edicaoLiberada` entra ANTES da permissão: quem não tem permissão
        // nunca edita, e quem tem só edita com o modo ligado.
        const permitida = edicaoLiberada && podeEditarCelula(aba, row, col, origem, papeis)
        return (
          <td
            key={col}
            data-celula={`${ri}-${ci}`}
            onMouseDown={(e) => onPressionar(ri, ci, e.shiftKey)}
            onMouseEnter={() => onEntrar(ri, ci)}
            onDoubleClick={() => onEditar(ri, ci)}
            style={congelada ? { left: 0 } : undefined}
            // `relative` ancora a camada de seleção abaixo. A cor NÃO pode vir
            // como fundo do <td>: o <input> tem fundo próprio (branco, âmbar de
            // campo vazio, azul de Databricks) e cobre quase toda a célula —
            // sobraria cor só nos 8px de padding, que foi o motivo de a seleção
            // "não aparecer" em várias células.
            tabIndex={-1}
            title={erro ?? undefined}
            className={`relative border-b border-ink-100 px-2 outline-none ${padCel} ${
              // Foco em NAVY, seleção em turquesa — duas cores para duas coisas.
              // Antes as duas eram da família turquesa e era preciso olhar duas
              // vezes para saber qual célula recebia a digitação.
              // O erro vence o foco: a célula errada precisa continuar vermelha
              // enquanto a pessoa está dentro dela, que é quando ela conserta.
              erro
                ? 'outline outline-2 -outline-offset-2 outline-danger'
                : focada
                  ? 'outline outline-2 -outline-offset-2 outline-water-600'
                  : ''
            } ${congelada ? `sticky z-10 ${fundoCongelada} shadow-congelada group-hover:bg-ink-50` : ''}`}
          >
            {/* AbaCell direto, sem o "?" por célula que existia aqui
                (`AbaCellWithDict`, aposentado em 07/08/2026 — item 26 do pedido
                da Aegea): o ícone de 16px comia ~20px de dentro de colunas de
                84px, em abas de até 22 colunas. A explicação de campo passou a
                viver só no cabeçalho, via `title` do <th> — que é onde ela custa
                zero pixel de tabela. */}
            <AbaCell
              abaKey={aba.key}
              col={col}
              origem={origem}
              row={row}
              cidades={cidades}
              dados={dados}
              onChange={(c, v) => onCell(idxOriginal, c, v)}
              numerica={numericas.has(col)}
              // Fora do modo de edição o input é só a "cara" da célula: não
              // aceita digitação direta (quem trata a tecla é o grid, que
              // decide entre navegar e começar a editar). SEM PERMISSÃO
              // (`permitida`) a célula fica travada nesta forma SEMPRE — não
              // só fora do foco — porque não existe modo de edição para quem
              // não pode editar (N7/N8: administrador tudo, financeiro só
              // WACC, os demais nada).
              somenteLeitura={!permitida || !(focada && editando)}
              // E `bloqueada` é SÓ a permissão — ver o comentário da prop em
              // `AbaCell`. Passar `somenteLeitura` aqui fecharia toda lista
              // suspensa do cadastro para o mouse.
              bloqueada={!permitida}
            />
            {/* Camada de seleção POR CIMA do campo (pointer-events-none deixa o
                clique passar). A célula em foco fica sem tinta e só com o
                contorno, como no Excel: ela é a que recebe o que for digitado. */}
            {selecionada && !focada && (
              <span aria-hidden="true" className="pointer-events-none absolute inset-0 bg-aegea-500/25" />
            )}
          </td>
        )
      })}
      {(aba.addRow || onAcao) && (
        <td className="px-2 py-1.5 border-b border-ink-100 whitespace-nowrap text-right">
          {aba.addRow && (
            <button
              onClick={() => onDelRow(idxOriginal)}
              aria-label="Remover linha"
              className="text-ink-300 hover:text-danger"
            >
              <Trash weight="bold" />
            </button>
          )}
          {onAcao && mostrarAcao && (
            <button
              type="button"
              onClick={() => onAcao(idxOriginal)}
              className="rounded-[6px] border border-ink-200 px-2 py-0.5 text-[11px] font-semibold text-ink-500 hover:border-danger hover:text-danger"
            >
              {acaoRotulo}
            </button>
          )}
        </td>
      )}
    </tr>
  )
})
