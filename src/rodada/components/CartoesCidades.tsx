import { useState } from 'react'
import { Table, GridFour } from '@phosphor-icons/react'
import { Link } from 'react-router-dom'
import { CelulaLink, Cartao } from '@/rodada/components/pecas'
import { brlMi, deTotal, inteiro, pct } from '@/rodada/lib/formato'
import type { CidadeLinha } from '@/rodada/domain/resultado'

/**
 * AS CIDADES DA RODADA — cartão com CAPEX e VPL no cabeçalho (item 17 do
 * feedback de 26/08), ou a tabela ordenável, à escolha.
 *
 * TROCAR VIROU "OFERECER OS DOIS" (contraproposta D-01, combinada com o
 * cliente): a tabela é o único caminho pra ORDENAR as cidades por VPL, CAPEX ou
 * cobertura — justamente a comparação que o item 8 pediu (posição no ranking).
 *
 * OS MINI-GRÁFICOS SAÍRAM DAQUI EM 27/08. Cada cartão tinha um sparkline de
 * cobertura, e com uma dúzia de cidades a tela virava uma parede de gráficos
 * pequenos demais para ler ("tem muitos gráficos na tela, tá muito poluído").
 * A evolução de cobertura contra meta agora vive num quadro só, em tamanho de
 * leitura, com seletor de cidade — `GraficoMetaCobertura`. O cartão ficou com
 * o que ele faz bem: comparar números entre cidades de relance.
 */
export function CartoesCidades({ runId, cidades }: { runId: string | undefined; cidades: CidadeLinha[] }) {
  const [visao, setVisao] = useState<'cartoes' | 'tabela'>('cartoes')

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <div className="inline-flex gap-1 rounded-[9px] bg-ink-200 p-[3px]">
          <BotaoVisao ativo={visao === 'cartoes'} onClick={() => setVisao('cartoes')} icone={GridFour}>
            Cartões
          </BotaoVisao>
          <BotaoVisao ativo={visao === 'tabela'} onClick={() => setVisao('tabela')} icone={Table}>
            Tabela
          </BotaoVisao>
        </div>
      </div>

      {visao === 'cartoes' ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {cidades.map((c) => (
            <CartaoCidade key={c.id} runId={runId} cidade={c} />
          ))}
        </div>
      ) : (
        <TabelaCidades runId={runId} cidades={cidades} />
      )}
    </div>
  )
}

function BotaoVisao({
  ativo,
  onClick,
  icone: Icone,
  children,
}: {
  ativo: boolean
  onClick: () => void
  icone: typeof Table
  children: string
}) {
  return (
    <button
      type="button"
      aria-pressed={ativo}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-semibold transition-colors duration-hover ease-saida ${
        ativo ? 'bg-white text-ink-800 shadow-sm' : 'text-ink-500 hover:text-ink-700'
      }`}
    >
      <Icone weight="bold" className="text-[13px]" />
      {children}
    </button>
  )
}

/**
 * Um cartão — o card inteiro é o link de drill-down, e não só o nome: numa
 * grade de gráficos pequenos, restringir o alvo clicável ao texto do título
 * faria a maior parte da área do card não reagir ao clique, que é o oposto do
 * que uma grade de cartões promete visualmente.
 */
function CartaoCidade({ runId, cidade: c }: { runId: string | undefined; cidade: CidadeLinha }) {
  return (
    <Link to={`/resultados/${runId}/cidades/${c.id}`} className="contents">
      <article className="carta flex min-w-0 flex-col gap-2.5 p-4 no-underline transition-shadow duration-hover ease-saida hover:shadow-elev">
        <div className="flex min-w-0 items-baseline justify-between gap-2">
          <span className="min-w-0 truncate text-[13.5px] font-bold text-ink-800">{c.nome}</span>
        </div>
        {/* CAPEX E VPL NO NOME, como pedido — logo abaixo do título, e não
            dentro dele, para o nome da cidade continuar legível em cidades
            com nome longo. */}
        <div className="flex items-baseline gap-3 font-mono text-[11px] text-ink-500">
          <span>
            CAPEX <b className="font-semibold text-ink-700">{brlMi(c.capex)}</b>
          </span>
          <span>
            VPL <b className="font-semibold text-ink-700">{brlMi(c.vpl)}</b>
          </span>
        </div>

        <div className="flex items-baseline justify-between gap-2 border-t border-ink-100 pt-2 text-[11px] text-ink-500">
          <span>
            Cobertura <b className="font-mono font-semibold text-ink-700">{pct(c.coberturaFimPct)}</b>
          </span>
          <span>
            Metas{' '}
            <b className="font-mono font-semibold text-ink-700">
              {deTotal(c.metasAtingidas, c.metasTotal)}
            </b>
          </span>
        </div>
      </article>
    </Link>
  )
}

/** A tabela ordenável — a mesma que existia antes do redesenho em cartões. */
function TabelaCidades({ runId, cidades }: { runId: string | undefined; cidades: CidadeLinha[] }) {
  return (
    <Cartao tabela>
      <div className="min-w-0 overflow-x-auto">
        <table>
          <caption className="sr-only">Cidades da rodada</caption>
          <thead>
            <tr>
              <th scope="col">Cidade</th>
              <th scope="col" data-r>
                Cobertura final
              </th>
              <th scope="col" data-r>
                Metas
              </th>
              <th scope="col" data-r>
                CAPEX
              </th>
              <th scope="col" data-r>
                VPL
              </th>
              <th scope="col" data-r>
                Sistemas
              </th>
            </tr>
          </thead>
          <tbody>
            {cidades.map((c) => (
              <tr key={c.id}>
                <td>
                  <CelulaLink to={`/resultados/${runId}/cidades/${c.id}`}>{c.nome}</CelulaLink>
                </td>
                <td data-m>{pct(c.coberturaFimPct)}</td>
                <td data-m>{deTotal(c.metasAtingidas, c.metasTotal)}</td>
                <td data-m>{brlMi(c.capex)}</td>
                <td data-m>{brlMi(c.vpl)}</td>
                <td data-m>{inteiro(c.sistemas)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Cartao>
  )
}
