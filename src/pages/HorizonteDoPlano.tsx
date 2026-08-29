/**
 * O HORIZONTE DO PLANO — a abertura da Home.
 *
 * A Home abria com o VPL a 60px sobre uma faixa navy em gradiente, dois números
 * de apoio ao lado. É a abertura genérica de qualquer dashboard, de qualquer
 * domínio, e não dizia o que ESTE produto faz.
 *
 * O que ele faz é **ordenar obras no tempo**. O artefato característico deste
 * mundo é a sequência: quando cada obra entra, e portanto quando cada sub-bacia
 * começa a faturar. Uma faixa com a forma do plano responde isso de uma olhada;
 * um número grande responde "quanto", que é a segunda pergunta, não a primeira.
 * O VPL não sumiu — desceu para onde ele é, um dos fatos do plano.
 *
 * SÉRIE ÚNICA, de propósito. O `GraficoCronogramaObras` das telas de resultado
 * já mostra o mesmo cronograma EMPILHADO POR COMPONENTE, com legenda, tabela
 * equivalente e drill-down por ano — e é lá que a composição deve ser lida. Sete
 * séries empilhadas aqui, num quadro de 100px sem rótulo direto, quebraria a
 * regra que o próprio `index.css` escreve (onde os sete aparecem juntos, a
 * identidade não pode ser só a cor). Aqui a pergunta é outra e mais simples:
 * "que forma tem o plano no tempo?". Uma série responde, e quem quiser a
 * composição segue o link.
 *
 * SUPERFÍCIE CLARA, porque é a regra da casa: `.viz-root` diz que gráfico nunca
 * vive sobre `.band-surface`, que é azul de marca saturado e engoliria a série.
 * A cor é `--viz-seq-4` (#2e4ec9) — o degrau de MAGNITUDE, que é o que uma
 * contagem é, e o único da rampa que passa na faixa de luminosidade do
 * validador (`--viz-seq-5`, #01209b, reprova: L 0,341).
 */
import { Link } from 'react-router-dom'
import { ArrowRight } from '@phosphor-icons/react'
import { int, milhoes } from '../lib/format'
import type { AnoDeObras } from '../rodada/domain/resultado'

/**
 * Largura máxima de uma coluna.
 *
 * ERA 56px, E ESTAVA ERRADO — só deu para saber vendo renderizado. O raciocínio
 * era que o vazio à direita "diria que o horizonte é curto"; na tela, dois
 * blocos estreitos encostados na esquerda de uma carta larga não dizem isso,
 * dizem gráfico quebrado. Vazio não fala; vazio só parece falta.
 *
 * Com 120px e o grupo CENTRADO quando há poucos anos, o mesmo dado lê como uma
 * faixa curta e deliberada. O teto continua existindo para o caso oposto: sem
 * ele, dois anos viram duas lajes de 500px.
 */
const LARGURA_MAX = 120

/** Até aqui, cada ano ganha o número em cima e o grupo fica centrado. */
const POUCOS = 6

/** Altura do quadro. Alta o bastante para a diferença entre anos ser visível. */
const ALTURA = 104

function rotuloCurto(ano: number, muitos: boolean): string {
  return muitos ? `'${String(ano).slice(2)}` : String(ano)
}

export function HorizonteDoPlano({
  anos,
  carregando,
  runId,
}: {
  anos: AnoDeObras[]
  carregando: boolean
  runId: string | null
}) {
  const total = anos.reduce((s, a) => s + a.obras, 0)
  const teto = Math.max(1, ...anos.map((a) => a.obras))
  // Acima de oito colunas o ano de quatro dígitos não cabe sem colidir.
  const muitos = anos.length > 8
  // Poucos anos: o grupo se centra e cada coluna leva o número. Rótulo em toda
  // coluna é ruído quando são vinte; com dois, é a informação.
  const poucos = anos.length <= POUCOS
  const alinhamento = poucos ? 'justify-center' : ''
  // Rótulo direto SÓ no pico — número em toda coluna é ruído, e o pico é o que
  // a pessoa procura ("em que ano o plano se concentra?").
  const anoPico = anos.reduce<AnoDeObras | null>((m, a) => (!m || a.obras > m.obras ? a : m), null)

  if (carregando) {
    return (
      <div className="flex items-end gap-[2px]" style={{ height: ALTURA }} aria-hidden="true">
        {[0.5, 0.8, 0.35, 0.6].map((f, i) => (
          <div
            key={i}
            className="w-full animate-pulse rounded-t-[4px] bg-ink-100"
            style={{ maxWidth: LARGURA_MAX, height: `${f * 100}%` }}
          />
        ))}
      </div>
    )
  }

  if (!anos.length) {
    return (
      <p className="text-[13px] leading-relaxed text-ink-500" style={{ minHeight: ALTURA }}>
        O horizonte aparece aqui depois da primeira simulação publicada — ele mostra em que anos as
        obras entram.
      </p>
    )
  }

  return (
    <div className="viz-root">
      <ol
        className={`flex items-end gap-[2px] ${alinhamento}`}
        style={{ height: ALTURA }}
        // A lista É a tabela equivalente: cada item carrega ano, contagem e
        // CAPEX no nome acessível, na ordem do tempo. Num quadro de dois a vinte
        // itens isso serve melhor que uma tabela paralela escondida.
        aria-label={`Obras por ano do plano — ${int(total)} no total`}
      >
        {anos.map((a) => {
          const altura = Math.max(3, Math.round((a.obras / teto) * 100))
          const terceiros = a.obrasTerceiro > 0 ? `, ${int(a.obrasTerceiro)} de terceiros` : ''
          return (
            <li
              key={a.ano}
              className="group relative flex h-full w-full flex-col justify-end"
              style={{ maxWidth: LARGURA_MAX }}
            >
              {poucos && (
                <div
                  aria-hidden="true"
                  className="mb-1 text-center font-mono text-[12.5px] font-semibold tabular-nums text-ink-700"
                >
                  {int(a.obras)}
                </div>
              )}
              <div
                className="w-full rounded-t-[4px] transition-[height] duration-mover ease-saida"
                style={{ height: `${altura}%`, background: 'var(--viz-seq-4)' }}
                aria-hidden="true"
              />
              <span className="sr-only">
                {a.ano}: {int(a.obras)} obras, {milhoes(a.capex)}
                {terceiros}
              </span>
              {/* Balão por marca. `pointer-events-none` para o alvo continuar
                  sendo a coluna inteira, e não o próprio balão. */}
              <div
                role="tooltip"
                className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-ink-900 px-2.5 py-1.5 text-[11.5px] font-medium text-white shadow-elev group-hover:block"
              >
                <span className="font-mono">{a.ano}</span> · {int(a.obras)} obras ·{' '}
                {milhoes(a.capex)}
                {terceiros}
              </div>
            </li>
          )
        })}
      </ol>

      <div className={`mt-2 flex items-end gap-[2px] ${alinhamento}`} aria-hidden="true">
        {anos.map((a) => (
          <div
            key={a.ano}
            className="w-full text-center font-mono text-[10.5px] tabular-nums text-ink-400"
            style={{ maxWidth: LARGURA_MAX }}
          >
            {rotuloCurto(a.ano, muitos)}
          </div>
        ))}
      </div>

      {anoPico && (
        <p className="mt-3 text-[12.5px] leading-relaxed text-ink-500">
          {/* Com rótulo direto em toda coluna, repetir o pico seria dizer duas
              vezes a mesma coisa — aí a frase só carrega o caminho para o
              cronograma completo. */}
          {!poucos && (
            <>
              Pico em <span className="font-mono text-ink-700">{anoPico.ano}</span>, com{' '}
              <strong className="font-semibold text-ink-800">{int(anoPico.obras)} obras</strong>.{' '}
            </>
          )}
          {runId && (
            <Link
              to="/resultados"
              className="inline-flex items-center gap-1 font-semibold text-water-600 underline-offset-2 hover:underline"
            >
              Ver o cronograma por componente
              <ArrowRight weight="bold" className="text-[11px]" />
            </Link>
          )}
        </p>
      )}
    </div>
  )
}
