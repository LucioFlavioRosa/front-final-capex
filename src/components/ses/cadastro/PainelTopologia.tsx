/**
 * PROBLEMAS DE TOPOLOGIA, na própria aba do Fluxo de escoamento — item 23.
 *
 * É a ÚNICA aba do cadastro com painel de problemas, e a exceção é deliberada.
 *
 * A sessão de 30/07/2026 tirou os painéis de todas as telas de cadastro e os
 * concentrou na Revisão, com um argumento que continua valendo: "um problema aqui
 * nunca é local" — "referência de sub-bacia inexistente" nasce da relação entre
 * duas abas, e mostrá-lo enquanto a pessoa digita preço unitário interrompe sem
 * oferecer nada acionável.
 *
 * A topologia é o caso que não se encaixa nesse argumento, e é por isso que Wagner
 * pediu a conferência aqui (13:51). O erro está NESTA tabela, a correção também: a
 * linha que não tem destino é a linha que a pessoa está olhando, e resolver é
 * escolher na lista suspensa ao lado. Levar isso para outra tela seria mandar
 * alguém sair da página para descobrir o que precisa fazer nela.
 *
 * A CONCILIAÇÃO com 30/07 está no escopo: este painel lista SÓ topologia, e não
 * volta a ser o painel geral em todas as abas. A Revisão segue sendo o portão que
 * bloqueia a rodada — os mesmos problemas aparecem lá, porque `validarCadastro`
 * chama `validarTopologia`.
 *
 * SILENCIOSO QUANDO ESTÁ TUDO CERTO: nada de faixa verde de "sem problemas". A
 * Revisão existe para dar essa confirmação; aqui, a ausência do painel já é ela, e
 * um cartão permanente custaria altura de tela numa aba que é uma tabela larga.
 */

import { useState } from 'react'
import { CaretDown, CaretRight, WarningCircle, XCircle } from '@phosphor-icons/react'
import type { Problema } from '../../../domain/validacao'

/** Quantos problemas ficam à vista antes de o painel virar lista recolhida. */
const VISIVEIS_SEM_EXPANDIR = 2

export function PainelTopologia({ problemas }: { problemas: Problema[] }) {
  const [aberto, setAberto] = useState(false)
  if (!problemas.length) return null

  const criticos = problemas.filter((p) => p.nivel === 'critico')
  const temCritico = criticos.length > 0
  /**
   * O cadastro nasce com TODAS as origens sem destino — é o estado inicial
   * legítimo da aba, não um erro que alguém cometeu. Por isso o painel abre
   * recolhido quando há mais problemas do que cabe ler de passagem: a lista
   * inteira ocuparia a tela antes de a tabela aparecer.
   */
  const mostrados = aberto ? problemas : problemas.slice(0, VISIVEIS_SEM_EXPANDIR)
  const ocultos = problemas.length - mostrados.length

  return (
    <div
      className={`rounded-2xl border p-4 ${
        temCritico ? 'border-danger/25 bg-red-50/40' : 'border-warning/25 bg-warning/[.06]'
      }`}
    >
      <div className="flex items-start gap-2.5">
        {temCritico ? (
          <XCircle weight="fill" className="mt-0.5 shrink-0 text-lg text-danger" />
        ) : (
          <WarningCircle weight="fill" className="mt-0.5 shrink-0 text-lg text-warning" />
        )}
        <div className="min-w-0">
          <h3 className="text-[13.5px] font-bold tracking-tight text-ink-900">
            {temCritico
              ? `${somar(criticos)} ponto${somar(criticos) === 1 ? '' : 's'} do fluxo não chega${somar(criticos) === 1 ? '' : 'm'} à ETE`
              : 'Fluxo fechado, com pontos de atenção'}
          </h3>
          <p className="mt-0.5 text-[12px] leading-snug text-ink-600">
            {temCritico
              ? 'A cadeia precisa terminar numa ETE para a receita ser liberada. Onde ela não termina, o motor para de caminhar sem acusar erro — e essas origens somem do plano.'
              : 'Nada impede a rodada. Confira abaixo o que a simulação vai assumir.'}
          </p>
        </div>
      </div>

      <ul className="mt-3 space-y-1.5">
        {mostrados.map((p, i) => (
          <li
            key={`${p.titulo}-${i}`}
            className={`rounded-lg border px-3 py-2 ${
              p.nivel === 'critico' ? 'border-danger/20 bg-red-50' : 'border-warning/25 bg-warning/10'
            }`}
          >
            <p className={`text-[12px] font-semibold ${p.nivel === 'critico' ? 'text-danger' : 'text-ink-800'}`}>
              {p.titulo}
              <span className="ml-1.5 font-normal text-ink-500">({p.ocorrencias})</span>
            </p>
            <p className="mt-0.5 text-[11.5px] leading-snug text-ink-600">{p.detalhe}</p>
          </li>
        ))}
      </ul>

      {(ocultos > 0 || aberto) && (
        <button
          type="button"
          onClick={() => setAberto((a) => !a)}
          className="mt-2 inline-flex items-center gap-1 text-[11.5px] font-semibold text-water-700 hover:underline"
        >
          {aberto ? <CaretDown weight="bold" /> : <CaretRight weight="bold" />}
          {aberto ? 'Mostrar menos' : `Ver mais ${ocultos}`}
        </button>
      )}
    </div>
  )
}

/** Ocorrências, não linhas de problema: "3 sub-bacias" diz mais que "1 problema". */
const somar = (ps: Problema[]) => ps.reduce((s, p) => s + p.ocorrencias, 0)
