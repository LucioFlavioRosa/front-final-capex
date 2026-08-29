import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { CaretRight } from '@phosphor-icons/react'
import {
  useCidade,
  useCidades,
  useFluxo,
  useRunMeta,
  useSubBacia,
} from '@/rodada/api/queries'
import { useCrumbsAtuais } from '@/rodada/state/Crumbs'
import type { NoFluxo } from '@/rodada/domain/resultado'
import { inteiro, vazao } from '@/rodada/lib/formato'

/**
 * A árvore de escopo dos cinco níveis — a coluna fixa do design de 19/08.
 *
 * Três decisões que ela carrega:
 *
 * 1. **É NAVEGAÇÃO, não estado.** Cada nó é um `<NavLink>` para a rota plana do
 *    nível, e não um `onClick` que troca uma aba interna. As rotas seguem
 *    planas, o deep link segue funcionando, e Ctrl+clique abre duas sub-bacias
 *    lado a lado — que é a segunda coisa que se faz nesta tela.
 *
 * 2. **Os filhos são BUSCADOS SOB DEMANDA, e pelas queries que as próprias
 *    páginas usam.** Não há endpoint de hierarquia: cidade sai de `/cidades`,
 *    sistema sai do detalhe da cidade, sub-bacia sai do fluxo do sistema e
 *    elemento sai do detalhe da sub-bacia. Como as `queryKey` são as MESMAS das
 *    páginas, expandir um galho já aquece o cache do nível que você vai abrir —
 *    o clique seguinte não refaz requisição nenhuma.
 *
 * 3. **O galho do nível atual abre sozinho, mas pode ser fechado.** A
 *    ancestralidade vem dos `to` do breadcrumb (as rotas são planas, então a
 *    URL não a carrega) e é MESCLADA no estado do usuário, em vez de unida a
 *    cada render: unir a cada render travaria o galho aberto e o caret ficaria
 *    inerte.
 */

/**
 * O ESTADO DE UMA SUB-BACIA NO PLANO — três valores, e não dois.
 *
 * A Aegea pediu "um ícone na árvore" para separar o que foi priorizado do que
 * ficou de fora (item 10 de 26/08), com marcação verde e vermelha no print. Só
 * que priorizada e faturando não são a mesma coisa, e o estado do meio é o mais
 * caro dos três: a sub-bacia recebeu obra, o CAPEX foi gasto, e ela não fatura
 * porque falta outra obra da cadeia até a ETE — é a categoria "travada por obra
 * da cadeia" da explicabilidade. Um ícone binário apagaria exatamente esse caso,
 * que é dinheiro comprometido sem retorno.
 *
 * Obra de terceiro conta como "recebeu obra": ela acontece e a cadeia existe,
 * só não sai do nosso CAPEX — o mesmo critério da coluna "Componentes no plano"
 * do nível 3.
 */
export type EstadoNoPlano = 'fatura' | 'obra-sem-receita' | 'fora'

function estadoNoPlano(no: NoFluxo): EstadoNoPlano {
  if (no.fatura) return 'fatura'
  const temObra = no.componentes.some(
    (c) => c.situacao === 'construida' || c.situacao === 'terceiro',
  )
  return temObra ? 'obra-sem-receita' : 'fora'
}

const PONTO: Record<EstadoNoPlano, { classe: string; titulo: string }> = {
  // Cheio: entrou no plano e gera receita.
  fatura: { classe: 'bg-success', titulo: 'No plano · fatura' },
  // Contorno âmbar: o oco é a metade que falta — obra feita, receita não.
  'obra-sem-receita': {
    classe: 'border-[1.5px] border-warning bg-transparent',
    titulo: 'No plano · recebeu obra e não fatura',
  },
  // Vazio e cinza: não entrou.
  fora: { classe: 'border-[1.5px] border-ink-300 bg-transparent', titulo: 'Fora do plano' },
}

function PontoEstado({ estado }: { estado: EstadoNoPlano }) {
  const p = PONTO[estado]
  return (
    <span
      title={p.titulo}
      aria-label={p.titulo}
      role="img"
      className={`ml-1 inline-block h-[7px] w-[7px] shrink-0 rounded-full ${p.classe}`}
    />
  )
}

/** Cada nível tem prefixo próprio para a chave não colidir entre tipos. */
const chaveCidade = (id: string) => `c:${id}`
const chaveSistema = (id: string) => `s:${id}`
const chaveSub = (id: string) => `b:${id}`

/** Extrai as chaves de abertura dos `to` do breadcrumb e da URL corrente. */
function chavesDaTrilha(caminhos: string[]): string[] {
  const fora: string[] = []
  for (const p of caminhos) {
    const cid = /\/cidades\/([^/?#]+)/.exec(p)
    if (cid) fora.push(chaveCidade(decodeURIComponent(cid[1])))
    const sis = /\/sistemas\/([^/?#]+)/.exec(p)
    if (sis) fora.push(chaveSistema(decodeURIComponent(sis[1])))
    const sub = /\/sub-bacias\/([^/?#]+)/.exec(p)
    if (sub) fora.push(chaveSub(decodeURIComponent(sub[1])))
  }
  return fora
}

export function ArvoreEscopo({ runId }: { runId: string }) {
  const meta = useRunMeta(runId)
  const crumbs = useCrumbsAtuais()
  const { pathname } = useLocation()

  const daTrilha = useMemo(
    () => chavesDaTrilha([...crumbs.map((c) => c.to ?? ''), pathname]),
    [crumbs, pathname],
  )

  // A raiz nasce aberta: uma árvore que abre fechada esconde justamente a
  // informação pela qual ela existe.
  const [abertos, setAbertos] = useState<Set<string>>(new Set(['u']))

  /**
   * "MOSTRAR SÓ O QUE ESTÁ NO PLANO" — o pedido real por trás do ícone.
   *
   * Nasce DESLIGADO: a árvore é o mapa do escopo da rodada, e um mapa que abre
   * escondendo 82% do território mente sobre o tamanho do problema. Quem quer a
   * lista curta pede por ela.
   *
   * Filtra só SUB-BACIA. Esconder cidade e sistema vazios exigiria carregar o
   * fluxo de todos os sistemas de todas as cidades só para desenhar a árvore —
   * hoje cada galho é buscado sob demanda, e é isso que a mantém instantânea. O
   * rodapé diz que o recorte é de sub-bacias, para o galho que sobra vazio não
   * parecer defeito.
   */
  const [soNoPlano, setSoNoPlano] = useState(false)

  // MESCLA (não união a cada render): o galho do nível atual nasce aberto, e
  // depois disso quem manda é o usuário.
  const assinatura = daTrilha.join('|')
  useEffect(() => {
    if (!assinatura) return
    setAbertos((atual) => {
      const faltando = assinatura.split('|').filter((k) => k && !atual.has(k))
      if (faltando.length === 0) return atual
      const novo = new Set(atual)
      faltando.forEach((k) => novo.add(k))
      return novo
    })
  }, [assinatura])

  const alternar = (chave: string) =>
    setAbertos((atual) => {
      const novo = new Set(atual)
      if (novo.has(chave)) novo.delete(chave)
      else novo.add(chave)
      return novo
    })

  const ctx = { runId, abertos, alternar, soNoPlano }

  return (
    <nav aria-label="Escopo da rodada" className="carta sticky top-6 self-start overflow-hidden">
      <div className="border-b border-ink-200 bg-water-50 px-4 py-3">
        <div className="text-[11px] font-semibold uppercase tracking-[.05em] text-ink-water">
          Escopo
        </div>
        <label className="mt-2 flex cursor-pointer items-center gap-2 text-[11.5px] text-ink-600">
          <input
            type="checkbox"
            checked={soNoPlano}
            onChange={(e) => setSoNoPlano(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-ink-300 text-water-600 focus:ring-water-600/25"
          />
          Mostrar só o que está no plano
        </label>
      </div>
      <div className="max-h-[calc(100vh-14rem)] overflow-y-auto p-2">
        <Linha
          nivel={0}
          chave="u"
          rotulo={meta.data?.unidadeNome ?? 'Unidade'}
          detalhe="visão geral"
          to={`/resultados/${runId}`}
          abertos={abertos}
          alternar={alternar}
        />
        {abertos.has('u') && <RamoCidades {...ctx} nivel={1} />}
      </div>
      <div className="border-t border-ink-200 px-4 py-3">
        <p className="text-[11.5px] leading-snug text-ink-500">
          Cinco níveis: unidade, cidade, sistema, sub-bacia e obra.
        </p>
        <ul className="mt-2 flex flex-col gap-1 text-[11px] text-ink-500">
          <li className="flex items-center gap-1.5">
            <PontoEstado estado="fatura" /> no plano e faturando
          </li>
          <li className="flex items-center gap-1.5">
            <PontoEstado estado="obra-sem-receita" /> recebeu obra e não fatura
          </li>
          <li className="flex items-center gap-1.5">
            <PontoEstado estado="fora" /> fora do plano
          </li>
        </ul>
        {soNoPlano && (
          <p className="mt-2 text-[11px] leading-snug text-ink-400">
            O recorte esconde sub-bacias; cidade e sistema continuam listados mesmo sem nenhuma.
          </p>
        )}
      </div>
    </nav>
  )
}

interface Ctx {
  runId: string
  abertos: Set<string>
  alternar: (chave: string) => void
  /** Esconde as sub-bacias que ficaram fora do plano — ver `ArvoreEscopo`. */
  soNoPlano: boolean
}

/**
 * Uma linha da árvore: caret e rótulo são alvos SEPARADOS.
 *
 * Se abrir e navegar fossem o mesmo clique, olhar o que existe dentro de uma
 * cidade exigiria trocar de tela — e a árvore serve justamente para descobrir a
 * forma da rodada sem sair de onde se está.
 */
function Linha({
  nivel,
  rotulo,
  detalhe,
  to,
  chave,
  temFilhos = true,
  marca,
  abertos,
  alternar,
}: {
  nivel: number
  rotulo: string
  detalhe?: ReactNode
  to: string
  chave: string
  temFilhos?: boolean
  /** O ponto de estado, à direita do nome — só a sub-bacia tem um. */
  marca?: ReactNode
} & Omit<Ctx, 'runId' | 'soNoPlano'>) {
  const aberto = abertos.has(chave)
  return (
    <div className="flex items-center gap-0.5" style={{ paddingLeft: nivel * 14 }}>
      {temFilhos ? (
        <button
          type="button"
          onClick={() => alternar(chave)}
          aria-expanded={aberto}
          aria-label={`${aberto ? 'Recolher' : 'Expandir'} ${rotulo}`}
          className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-ink-400 transition-colors duration-hover ease-saida hover:bg-ink-100 hover:text-ink-600"
        >
          <CaretRight
            weight="bold"
            className={`text-[10px] transition-transform duration-hover ease-saida ${
              aberto ? 'rotate-90' : ''
            }`}
          />
        </button>
      ) : (
        <span className="h-6 w-6 shrink-0" />
      )}
      <NavLink
        to={to}
        end
        className={({ isActive }) =>
          `min-w-0 flex-1 rounded-lg px-2 py-1.5 transition-colors duration-hover ease-saida ${
            isActive
              ? 'bg-water-50 text-water-700'
              : 'text-ink-700 hover:bg-ink-50 hover:text-water-600'
          }`
        }
      >
        <span className="flex items-center gap-0.5 text-[13px] font-semibold">
          <span className="min-w-0 truncate">{rotulo}</span>
          {marca}
        </span>
        {detalhe && (
          <span className="mt-px block truncate text-[11px] font-normal text-ink-400">
            {detalhe}
          </span>
        )}
      </NavLink>
    </div>
  )
}

/** Enquanto o galho carrega, a linha diz isso — não fica um vão silencioso. */
function Carregando({ nivel }: { nivel: number }) {
  return (
    <div className="px-2 py-1.5 text-[11.5px] text-ink-400" style={{ paddingLeft: nivel * 14 + 30 }}>
      carregando…
    </div>
  )
}

function Vazio({ nivel, texto }: { nivel: number; texto: string }) {
  return (
    <div className="px-2 py-1.5 text-[11.5px] text-ink-400" style={{ paddingLeft: nivel * 14 + 30 }}>
      {texto}
    </div>
  )
}

function RamoCidades({ runId, abertos, alternar, soNoPlano, nivel }: Ctx & { nivel: number }) {
  const cidades = useCidades(runId)
  if (cidades.isPending) return <Carregando nivel={nivel} />
  if (!cidades.data?.length) return <Vazio nivel={nivel} texto="sem cidades" />
  return (
    <>
      {cidades.data.map((c) => {
        const chave = chaveCidade(c.id)
        return (
          <div key={c.id}>
            <Linha
              nivel={nivel}
              chave={chave}
              rotulo={c.nome}
              detalhe={`${inteiro(c.sistemas)} sistema(s)`}
              to={`/resultados/${runId}/cidades/${c.id}`}
              abertos={abertos}
              alternar={alternar}
            />
            {abertos.has(chave) && (
              <RamoSistemas
                runId={runId}
                cidadeId={c.id}
                abertos={abertos}
                alternar={alternar}
                soNoPlano={soNoPlano}
                nivel={nivel + 1}
              />
            )}
          </div>
        )
      })}
    </>
  )
}

function RamoSistemas({
  runId,
  cidadeId,
  abertos,
  alternar,
  soNoPlano,
  nivel,
}: Ctx & { cidadeId: string; nivel: number }) {
  const cidade = useCidade(runId, cidadeId)
  if (cidade.isPending) return <Carregando nivel={nivel} />
  if (!cidade.data?.sistemas.length) return <Vazio nivel={nivel} texto="sem sistemas" />
  return (
    <>
      {cidade.data.sistemas.map((s) => {
        const chave = chaveSistema(s.id)
        return (
          <div key={s.id}>
            <Linha
              nivel={nivel}
              chave={chave}
              rotulo={s.nome}
              detalhe={`${inteiro(s.subbacias)} sub-bacia(s)`}
              to={`/resultados/${runId}/sistemas/${s.id}`}
              abertos={abertos}
              alternar={alternar}
            />
            {abertos.has(chave) && (
              <RamoSubBacias
                runId={runId}
                sistemaId={s.id}
                abertos={abertos}
                alternar={alternar}
                soNoPlano={soNoPlano}
                nivel={nivel + 1}
              />
            )}
          </div>
        )
      })}
    </>
  )
}

function RamoSubBacias({
  runId,
  sistemaId,
  abertos,
  alternar,
  soNoPlano,
  nivel,
}: Ctx & { sistemaId: string; nivel: number }) {
  const fluxo = useFluxo(runId, sistemaId)
  if (fluxo.isPending) return <Carregando nivel={nivel} />
  if (!fluxo.data?.nos.length) return <Vazio nivel={nivel} texto="sem sub-bacias" />

  // O recorte é aplicado DEPOIS de carregar, e não numa query própria: o
  // payload é o mesmo que a página do sistema já usa, e filtrar aqui é o que
  // permite ligar e desligar o interruptor sem nova requisição.
  const nos = soNoPlano ? fluxo.data.nos.filter((n) => estadoNoPlano(n) !== 'fora') : fluxo.data.nos
  if (!nos.length) return <Vazio nivel={nivel} texto="nenhuma sub-bacia no plano" />

  return (
    <>
      {nos.map((n) => {
        const chave = chaveSub(n.id)
        return (
          <div key={n.id}>
            <Linha
              nivel={nivel}
              chave={chave}
              rotulo={n.id}
              marca={<PontoEstado estado={estadoNoPlano(n)} />}
              /* "não fatura" é informação, não ausência: a sub-bacia existe e
                 recebe obra, só não gera receita direta. */
              detalhe={`${vazao(n.vazao)}${n.fatura ? '' : ' · não fatura'}`}
              to={`/resultados/${runId}/sub-bacias/${n.id}`}
              abertos={abertos}
              alternar={alternar}
            />
            {abertos.has(chave) && (
              <RamoElementos
                runId={runId}
                subId={n.id}
                abertos={abertos}
                alternar={alternar}
                soNoPlano={soNoPlano}
                nivel={nivel + 1}
              />
            )}
          </div>
        )
      })}
    </>
  )
}

function RamoElementos({
  runId,
  subId,
  abertos,
  alternar,
  soNoPlano,
  nivel,
}: Ctx & { subId: string; nivel: number }) {
  const sub = useSubBacia(runId, subId)
  if (sub.isPending) return <Carregando nivel={nivel} />
  if (!sub.data?.elementos.length) return <Vazio nivel={nivel} texto="sem obras" />

  // O recorte desce até a obra pelo mesmo critério: "no plano" é a obra que o
  // otimizador escolheu, mais a de terceiro, que acontece sem CAPEX nosso.
  const elementos = soNoPlano
    ? sub.data.elementos.filter(
        (e) => e.situacao === 'construida' || e.situacao === 'terceiro',
      )
    : sub.data.elementos
  if (!elementos.length) return <Vazio nivel={nivel} texto="nenhuma obra no plano" />

  return (
    <>
      {elementos.map((e) => (
        <Linha
          key={e.obraId}
          nivel={nivel}
          chave={`e:${e.obraId}`}
          temFilhos={false}
          rotulo={e.obraId}
          detalhe={e.componente}
          to={`/resultados/${runId}/obras/${e.obraId}`}
          abertos={abertos}
          alternar={alternar}
        />
      ))}
    </>
  )
}
