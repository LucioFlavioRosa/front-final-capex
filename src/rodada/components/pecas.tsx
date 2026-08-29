import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/Badge'
import { BotaoAjuda } from '@/rodada/components/Dicionario'
import { ocupacaoEte } from '@/rodada/lib/formato'
import type { SituacaoObra, StatusRodada } from '@/rodada/domain/resultado'

/**
 * Peças que os seis níveis de resultado repetem.
 *
 * Estão aqui, e não copiadas por tela, pelo mesmo motivo dos três estados
 * compartilhados: quando cada nível decide sozinho como mostrar um KPI, a
 * mesma grandeza ganha duas aparências e o usuário deixa de reconhecê-la ao
 * descer um degrau.
 */

/**
 * O bloco de identidade + KPIs de um nível de resultado.
 *
 * Era uma faixa navy (`Band`) e virou carta clara no redesign de 19/08, por um
 * motivo de leitura e não de gosto: ela fica logo acima da grade de gráficos,
 * que é obrigatoriamente clara (ver a regra de superfície em index.css). Duas
 * superfícies fortes empilhadas competem, e nenhuma das duas lê como a
 * principal — o número que a tela existe para mostrar perdia justamente para o
 * fundo que devia destacá-lo.
 *
 * Identidade e KPIs vivem na MESMA carta, e não em duas: o "Nível 3 · Sistema"
 * é o que diz a que recorte os números pertencem, e separá-los em dois cartões
 * permite ler o número sem o recorte.
 */
export function FaixaKpi({
  nivel,
  titulo,
  subtitulo,
  acoes,
  destaque,
  itens,
  rodape,
}: {
  nivel?: string
  titulo?: string
  subtitulo?: ReactNode
  acoes?: ReactNode
  /** `ajuda` é a chave do verbete no dicionário de resultado — ver `Tile`. */
  destaque?: { rotulo: string; valor: ReactNode; ajuda?: string }
  itens: { rotulo: string; valor: ReactNode; ajuda?: string }[]
  rodape?: ReactNode
}) {
  const corpo = (
    <>
      {destaque && (
        <KpiDestaque rotulo={destaque.rotulo} valor={destaque.valor} ajuda={destaque.ajuda} />
      )}
      {itens.length > 0 && (
        // `escada`: os KPIs entram um pouco depois do outro em vez de todos
        // no mesmo quadro — é a faixa do topo de cada nível de resultado, não
        // uma grade de trabalho repetitivo, então a entrada tem sentido aqui.
        <div
          className={`tiles escada grid-cols-2 md:grid-cols-4 ${destaque ? 'mt-5' : ''}`}
        >
          {itens.map((i) => (
            <Tile key={i.rotulo} rotulo={i.rotulo} valor={i.valor} ajuda={i.ajuda} />
          ))}
        </div>
      )}
      {rodape && (
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1.5 border-t border-ink-100 pt-3.5 text-[11.5px] text-ink-500">
          {rodape}
        </div>
      )}
    </>
  )

  // Sem `nivel`/`titulo` ela é só a carta de KPIs — é o que os níveis que já
  // têm identidade em outro lugar usam.
  if (!nivel && !titulo) return <div className="carta p-[22px] md:px-6">{corpo}</div>

  return (
    <CabecalhoNivel
      nivel={nivel ?? ''}
      titulo={titulo ?? ''}
      subtitulo={subtitulo}
      acoes={acoes}
    >
      {corpo}
    </CabecalhoNivel>
  )
}

/**
 * `valor` cai em VAZIO ('—') quando vem `undefined`/`null`/string vazia — não
 * fica em branco. Bug pré-existente encontrado ao inspecionar uma rodada sem
 * `BASE_RECEITA` no params_extra: o rodapé mostrava "Base de receita" seguido
 * de nada, indistinguível de um erro de layout. Um traço afirma "sem dado",
 * célula em branco não afirma nada.
 */
/**
 * O NÚMERO DE OCUPAÇÃO DE UMA ETE, MARCADO QUANDO PASSA DE 100% (defeito X-02,
 * achado revisando os prints de 26/08 — um mostrava 2.734,2%).
 *
 * `ocupacaoEte` (em `lib/formato.ts`) já decide SE é inconsistente; este
 * componente só decide COMO mostrar isso — vermelho com um aviso, sem
 * esconder o número real. Usado no nível 3 (KPI e diagrama) e na tabela de
 * sistemas do nível 2, então mora aqui e não copiado em cada tela.
 */
export function ValorOcupacao({ pct }: { pct: number | null }) {
  const { texto, inconsistente } = ocupacaoEte(pct)
  if (!inconsistente) return <>{texto}</>
  return (
    <span
      className="text-danger"
      title="Acima de 100% não é um plano válido — sinal de capacidade e vazão publicadas sem restrição entre si. Ver o defeito X-02."
    >
      {texto} ⚠
    </span>
  )
}

export function ItemRodape({ rotulo, valor }: { rotulo: string; valor: ReactNode }) {
  const vazio = valor === undefined || valor === null || valor === ''
  return (
    <span>
      {rotulo}{' '}
      <b className="font-mono font-semibold tabular-nums text-ink-800">
        {vazio ? '—' : valor}
      </b>
    </span>
  )
}

/** Título de uma seção dentro de uma tela de resultado. */
export function TituloSecao({ children, nota }: { children: ReactNode; nota?: ReactNode }) {
  return (
    <div className="mb-2.5 mt-5 flex items-baseline justify-between gap-4">
      <h2 className="text-[15px] font-bold text-ink-800">{children}</h2>
      {nota && <span className="text-[11px] text-ink-400">{nota}</span>}
    </div>
  )
}

/**
 * Card branco com título — o envelope de tabela de drill-down.
 *
 * `tabela` liga a gramática de tabela do design (cabeçalho em faixa, sem
 * filete na última linha) e tira o padding: a faixa do cabeçalho precisa
 * encostar na borda da carta, senão fica uma moldura branca em volta dela.
 */
export function Cartao({
  titulo,
  nota,
  ajuda,
  tabela = false,
  children,
  className = '',
}: {
  titulo?: string
  nota?: ReactNode
  /** Chave do verbete — o "?" ao lado do título do cartão. Ver `Tile`. */
  ajuda?: string
  tabela?: boolean
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={`carta min-w-0 overflow-hidden ${tabela ? '' : titulo ? 'p-4 md:p-5' : 'p-1.5'} ${
        tabela ? 'carta-tabela' : ''
      } ${className}`}
    >
      {titulo && (
        <div
          className={`flex items-baseline justify-between gap-4 ${
            tabela ? 'border-b border-ink-200 px-[18px] py-3.5' : 'mb-2.5'
          }`}
        >
          <div className="flex items-center gap-1.5 text-[13px] font-bold text-ink-800">
            <span>{titulo}</span>
            {ajuda && <BotaoAjuda chave={ajuda} texto={titulo} />}
          </div>
          {nota && <span className="text-[11px] text-ink-500">{nota}</span>}
        </div>
      )}
      {children}
    </div>
  )
}

/**
 * Primeira célula de uma linha que desce um nível.
 *
 * É um `<Link>` de verdade, e não um `onClick` na `<tr>`: o drill-down precisa
 * abrir em nova aba com Ctrl+clique — comparar duas cidades lado a lado é a
 * segunda coisa que se faz nesta tela — e precisa ser alcançável por teclado.
 */
export function CelulaLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="font-semibold text-water-600 transition-colors duration-hover ease-saida hover:text-water-700 hover:underline"
    >
      {children}
    </Link>
  )
}

const SITUACAO: Record<SituacaoObra, { texto: string; tom: 'success' | 'ink' | 'water' | 'warning' }> = {
  construida: { texto: 'Construída', tom: 'success' },
  'nao-construida': { texto: 'Não construída', tom: 'warning' },
  terceiro: { texto: 'De terceiro', tom: 'water' },
  'sem-obra': { texto: 'Sem obra', tom: 'ink' },
}

/**
 * Situação da obra como chip.
 *
 * Os quatro valores não são graus da mesma coisa: "de terceiro" é obra que
 * existe mas não é nossa, e "sem obra" é ausência de necessidade. Pintá-los com
 * tonalidades do mesmo cinza faria o usuário perguntar duas vezes por que
 * aquela linha não tem custo, por dois motivos diferentes.
 */
export function ChipSituacao({ situacao }: { situacao: SituacaoObra }) {
  const s = SITUACAO[situacao] ?? { texto: situacao, tom: 'ink' as const }
  return (
    <Badge tone={s.tom} dot>
      {s.texto}
    </Badge>
  )
}


// ===========================================================================
//  Gramática do design de 19/08 — as peças que histórico e resultados repetem
// ===========================================================================

export type Tom = 'teal' | 'azul' | 'ambar' | 'vermelho' | 'neutro'

/**
 * Etiqueta chapada: fundo tingido, sem borda e sem bolinha.
 *
 * Convive com o `Badge` do kit em vez de substituí-lo. A diferença não é
 * estética: o `Badge` tem borda e ponto porque é usado solto no meio de texto,
 * onde precisa se destacar do parágrafo. A etiqueta aqui vive numa COLUNA de
 * tabela, alinhada com dezenas de irmãs — ali a borda de cada uma soma um
 * quadriculado que compete com a grade da própria tabela.
 */
const TONS_TAG: Record<Tom, string> = {
  teal: 'bg-aegea-50 text-aegea-700',
  azul: 'bg-water-50 text-water-700',
  ambar: 'bg-warning/10 text-[#8A4B0A]',
  vermelho: 'bg-red-50 text-danger',
  neutro: 'bg-ink-100 text-ink-600',
}

export function Tag({
  tom = 'neutro',
  children,
  className = '',
}: {
  tom?: Tom
  children: ReactNode
  className?: string
}) {
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full px-2.5 py-[3px] text-[12px] font-semibold ${TONS_TAG[tom]} ${className}`}
    >
      {children}
    </span>
  )
}

/**
 * Os sete estados de uma rodada, com o rótulo que o design escolheu.
 *
 * `FEASIBLE` NÃO se chama "Concluída" aqui, e é a correção mais importante da
 * tabela: o solver devolveu um plano válido mas estourou o tempo antes de
 * provar que era o melhor. Chamar isso de concluída, ao lado de um `OPTIMAL`
 * pintado da mesma cor, faz o número parecer ótimo quando ele é apenas viável —
 * e a diferença é o que decide se vale rodar de novo. Daí rótulo e cor
 * próprios, mais o aviso no painel.
 */
export const STATUS_RODADA: Record<StatusRodada, { texto: string; tom: Tom }> = {
  OPTIMAL: { texto: 'Concluída', tom: 'teal' },
  FEASIBLE: { texto: 'Apenas viável', tom: 'ambar' },
  INFEASIBLE: { texto: 'Inviável', tom: 'vermelho' },
  PENDENTE: { texto: 'Na fila', tom: 'neutro' },
  RODANDO: { texto: 'Executando', tom: 'azul' },
  ERRO: { texto: 'Falhada', tom: 'vermelho' },
  CANCELADA: { texto: 'Cancelada', tom: 'neutro' },
}

/** Estados em que a rodada ainda está em voo — o servidor pode mudá-los sozinho. */
const EM_VOO = new Set<StatusRodada>(['PENDENTE', 'RODANDO'])

export function TagStatus({ status }: { status: StatusRodada }) {
  const s = STATUS_RODADA[status] ?? { texto: status, tom: 'neutro' as Tom }
  const emVoo = EM_VOO.has(status)
  return (
    <Tag tom={s.tom} className={emVoo ? 'relative overflow-hidden' : undefined}>
      {s.texto}
      {/* A rodada em voo pode mudar sozinha (ver `useRuns`, `refetchInterval`) —
          o sweep é o que diz "isto está acontecendo agora" enquanto se espera. */}
      {emVoo && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 animate-sweep bg-gradient-to-r from-transparent via-white/50 to-transparent"
        />
      )}
    </Tag>
  )
}

/**
 * Rótulo + valor de um tile dentro de uma grade `.tiles`.
 *
 * `ajuda` é a chave do verbete no dicionário de resultado — quando vem, o "?"
 * aparece ao lado do rótulo. Ele fica DEPOIS do rótulo e não antes pela mesma
 * razão do formulário: o número é o que se lê primeiro, e o "?" é o segundo
 * gesto de quem não reconheceu o nome. Fora de um `ProvedorDicionario` o botão
 * simplesmente não renderiza, então um tile com `ajuda` continua correto em
 * qualquer tela.
 */
export function Tile({
  rotulo,
  valor,
  ajuda,
}: {
  rotulo: string
  valor: ReactNode
  ajuda?: string
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[12px] text-ink-500">
        <span>{rotulo}</span>
        {ajuda && <BotaoAjuda chave={ajuda} texto={rotulo} />}
      </div>
      <div className="mt-1 font-mono text-[16px] font-semibold tabular-nums text-ink-800">
        {valor}
      </div>
    </div>
  )
}

/**
 * O número que a tela existe para mostrar: rótulo miúdo em caixa alta e o valor
 * em corpo grande.
 *
 * Fica em superfície CLARA, e não numa faixa navy: no design a faixa escura
 * saiu do miolo dos resultados justamente porque ela competia com o gráfico
 * logo abaixo — duas superfícies fortes empilhadas e nenhuma das duas lê como
 * a principal.
 */
export function KpiDestaque({
  rotulo,
  valor,
  tom = 'text-aegea-700',
  ajuda,
}: {
  rotulo: string
  valor: ReactNode
  tom?: string
  ajuda?: string
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-[.05em] text-ink-water">
        <span>{rotulo}</span>
        {ajuda && <BotaoAjuda chave={ajuda} texto={rotulo} />}
      </div>
      <div
        className={`mt-1.5 font-mono text-[34px] font-semibold leading-none tracking-tight tabular-nums md:text-[40px] ${tom}`}
      >
        {valor}
      </div>
    </div>
  )
}

/**
 * Recado tingido — o parágrafo que explica um estado em vez de deixar o traço
 * do valor ausente se explicar sozinho.
 */
export function Aviso({ tom = 'neutro', children }: { tom?: Tom; children: ReactNode }) {
  const fundo: Record<Tom, string> = {
    teal: 'bg-aegea-50 text-aegea-800',
    azul: 'bg-water-50 text-water-800',
    ambar: 'bg-warning/10 text-[#8A4B0A]',
    vermelho: 'bg-red-50 text-danger',
    neutro: 'bg-ink-100 text-ink-600',
  }
  return (
    <p className={`rounded-[10px] px-3.5 py-3 text-[13px] leading-relaxed ${fundo[tom]}`}>
      {children}
    </p>
  )
}

/**
 * Bloco de identidade de um nível: a etiqueta do degrau, o nome e o que mais
 * couber à direita.
 *
 * A etiqueta "Nível N · …" não é enfeite. Os cinco níveis reusam os mesmos
 * quadros (fluxo de escoamento e EBITDA aparecem em três deles), então um print de tela
 * sem o degrau escrito é indistinguível do print do nível de cima — e o que
 * muda entre os dois é o significado de cada número.
 */
export function CabecalhoNivel({
  nivel,
  titulo,
  subtitulo,
  acoes,
  children,
}: {
  nivel: string
  titulo: string
  subtitulo?: ReactNode
  acoes?: ReactNode
  children?: ReactNode
}) {
  return (
    <div className="carta p-[22px] md:px-6">
      <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-3">
            <Tag tom="azul" className="uppercase tracking-[.05em] !text-[11px]">
              {nivel}
            </Tag>
            <h1 className="m-0 text-[24px] font-bold leading-tight tracking-tight text-water-600 md:text-[26px]">
              {titulo}
            </h1>
          </div>
          {subtitulo && <p className="mt-2 text-[13px] text-ink-500">{subtitulo}</p>}
        </div>
        {acoes && <div className="flex flex-wrap items-center gap-2">{acoes}</div>}
      </div>
      {children && <div className="mt-5">{children}</div>}
    </div>
  )
}

/**
 * A trilha dos níveis, acima da carta de identidade.
 *
 * Fica FORA da carta de propósito: ela é a única coisa da tela que fala do
 * caminho e não do conteúdo, e dentro da carta ela viraria mais uma linha de
 * metadado do nível — que é justamente o que ela não é.
 */
export function Trilha({ itens }: { itens: { rotulo: string; to?: string }[] }) {
  if (itens.length === 0) return null
  return (
    <nav aria-label="Trilha de navegação" className="mb-3 flex flex-wrap items-center gap-2">
      {itens.map((c, i) => (
        <span key={`${c.rotulo}-${i}`} className="flex items-center gap-2">
          {c.to ? (
            <Link
              to={c.to}
              className="rounded-md text-[12.5px] font-semibold text-ink-500 transition-colors duration-hover ease-saida hover:text-water-600"
            >
              {c.rotulo}
            </Link>
          ) : (
            <span className="text-[12.5px] font-semibold text-ink-800">{c.rotulo}</span>
          )}
          {i < itens.length - 1 && <span className="text-[12px] text-ink-300">&rsaquo;</span>}
        </span>
      ))}
    </nav>
  )
}
