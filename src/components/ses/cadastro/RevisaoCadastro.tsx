import { useState } from 'react'
import { ArrowLeft, FlagCheckered, WarningCircle, PlayCircle, CircleNotch, FloppyDisk, CheckCircle } from '@phosphor-icons/react'
import { Button } from '../../ui/Button'
import { SCHEMA } from '../../../data/cadastroUnidade/schema'
import { ABAS_VISIVEIS, progressoAba } from '../../../data/cadastroUnidade/blocos'
import { totalGeral } from '../../../domain/calc'
import { validarCadastro } from '../../../domain/validacao'
import { ApiError } from '../../../lib/api'
import { useCadastro } from './CadastroContext'
import { PainelProblemas } from './PainelProblemas'
import { ListaAbasProgresso } from './ListaAbasProgresso'

export function RevisaoCadastro() {
  const { state, irFase, irPasso, salvar, salvando, salvoEm } = useCadastro()
  const [erroSalvar, setErroSalvar] = useState<string | null>(null)
  const unidade = state.unidade
  if (!unidade) return null

  /**
   * ABAS_VISIVEIS, e não SCHEMA: as quatro abas ocultadas em 05/08/2026 não têm
   * campo que alguém possa preencher, e uma delas pendente travaria a rodada sem
   * oferecer para onde ir — a lista abaixo (também derivada das visíveis) não
   * teria o botão para chegar até ela.
   */
  const faltam = ABAS_VISIVEIS.some((s) => !progressoAba(s, unidade.data[s.key] ?? []).pronta)
  const geral = totalGeral(unidade.data)

  /**
   * Os dois portões que separam o cadastro da rodada — e são independentes.
   *
   * `faltam` é campo em branco: a rodada não teria o que ler. `criticos` é pior,
   * porque não parece problema: duplicata de PK ou elo quebrado na hierarquia
   * produzem um plano internamente coerente e ERRADO, que passa em qualquer
   * conferência posterior. Um cadastro 100% preenchido pode estar nesse estado.
   *
   * Avisos NÃO bloqueiam de propósito. Entre eles está "obras lidas como de
   * terceiros", que é intencional e válido (CAPEX 0 com prazo > 0 entra no
   * cronograma e libera a cadeia sem consumir orçamento) — travar por causa dele
   * impediria de rodar um cadastro correto.
   */
  const problemas = validarCadastro(unidade.data)
  const criticos = problemas.filter((p) => p.nivel === 'critico')
  const bloqueado = faltam || criticos.length > 0

  function abrirAba(abaKey: string) {
    const i = SCHEMA.findIndex((s) => s.key === abaKey)
    if (i !== -1) abrirPasso(i)
  }

  function abrirPasso(i: number) {
    irPasso(i)
    irFase('wizard')
  }

  /**
   * As duas ações compartilham a gravação e diferem só no que fazem depois.
   *
   * `avancar` é o que separa "guardar o trabalho" de "mandar rodar": o primeiro
   * vale em qualquer estado do cadastro, o segundo exige os dois portões
   * (completude e ausência de críticos). Um `salvar` que exigisse o cadastro
   * inteiro obrigaria a manter várias sessões de preenchimento em memória, e um
   * refresh apagaria tudo.
   *
   * Avançar só acontece se gravou. Ir para a tela de sucesso com a gravação
   * falhada seria pior do que não ter persistência nenhuma: a tela afirmaria que
   * está guardado, a pessoa fecharia o navegador confiando nisso, e o estado do
   * wizard vive só em memória.
   */
  async function gravar(avancar: boolean) {
    if (salvando) return
    setErroSalvar(null)
    try {
      await salvar()
      if (avancar) irFase('sucesso')
    } catch (e) {
      setErroSalvar(
        e instanceof ApiError
          ? e.message
          : 'Não foi possível falar com o servidor. Verifique a conexão e tente de novo.',
      )
    }
  }

  return (
    <section className="max-w-[1100px] mx-auto px-4 md:px-6 py-8 animate-fade-in">
      <button
        onClick={() => irFase('wizard')}
        className="text-sm text-ink-500 hover:text-ink-800 inline-flex items-center gap-1.5 mb-4"
      >
        <ArrowLeft weight="bold" />Voltar ao cadastro
      </button>

      <div className="rounded-2xl border border-ink-200 bg-white p-6 shadow-elev md:p-8">
        <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-ink-900">
          <FlagCheckered weight="fill" className="text-water-600" />Revisão antes de rodar
        </h2>
        <p className="mt-1 text-sm text-ink-500">
          Duas conferências antes de rodar: a consistência do cadastro e a completude por aba. Só é
          possível seguir para a simulação sem problemas críticos e com todos os campos de origem
          unidade preenchidos. Ano-base e orçamento serão pedidos ao iniciar a simulação.
        </p>

        <div className="mt-6">
          <PainelProblemas problemas={problemas} onIrParaAba={abrirAba} />
        </div>

        <h3 className="mt-7 text-[10.5px] font-semibold uppercase tracking-[.09em] text-ink-400">
          Completude por aba
        </h3>

        {/* A lista é a MESMA do popover de progresso (`ListaAbasProgresso`), na
            variante 'revisao': aqui entram o selo de estado, a contagem
            feitos/total e a origem da aba. Eram duas listas escritas duas vezes,
            com visuais diferentes para a mesma pergunta; agora o agrupamento por
            bloco é o mesmo da navegação do wizard. */}
        <div className="mt-3">
          <ListaAbasProgresso dados={unidade.data} onIrParaAba={abrirAba} variante="revisao" />
        </div>

        {faltam && (
          <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
            <WarningCircle weight="fill" className="text-amber-600 text-xl mt-0.5" />
            <div className="text-sm text-amber-800">
              <strong>Faltam campos.</strong> Clique numa aba acima para completar o que está pendente.
            </div>
          </div>
        )}

        <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t border-ink-200 pt-5">
          <div>
            <div className="text-xs uppercase tracking-wide text-ink-400">Completude geral</div>
            <div className="font-mono text-3xl font-bold text-water-700">{geral.pct}%</div>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <div className="flex flex-wrap items-center justify-end gap-2.5">
              {/* SEM `bloqueado` na condição — é o ponto do botão. Guardar o
                  trabalho não depende de o cadastro estar pronto; só rodar
                  depende. */}
              <Button
                variant="secondary"
                disabled={salvando}
                onClick={() => gravar(false)}
                className="px-5 py-3 text-base"
              >
                {salvando ? (
                  <>
                    <CircleNotch weight="bold" className="text-lg animate-spin" /> Salvando…
                  </>
                ) : (
                  <>
                    <FloppyDisk weight="fill" className="text-lg" /> Salvar
                  </>
                )}
              </Button>
              <Button
                disabled={bloqueado || salvando}
                onClick={() => gravar(true)}
                className="px-6 py-3 text-base"
              >
                <PlayCircle weight="fill" className="text-lg" /> Salvar e ir para a simulação
              </Button>
            </div>
            {salvoEm && !erroSalvar && (
              <span className="inline-flex items-center gap-1.5 text-[11.5px] text-emerald-700">
                <CheckCircle weight="fill" />
                Salvo às {salvoEm.toLocaleTimeString('pt-BR')}
              </span>
            )}
            {erroSalvar && (
              <span className="max-w-[380px] text-right text-[11.5px] text-red-600">
                {erroSalvar}
              </span>
            )}
            {bloqueado && (
              <span className="text-right text-[11.5px] text-ink-500">
                {criticos.length > 0 && faltam
                  ? `Bloqueado: ${criticos.length} problema${criticos.length === 1 ? '' : 's'} crítico${criticos.length === 1 ? '' : 's'} e campos em branco.`
                  : criticos.length > 0
                    ? `Bloqueado: resolva ${criticos.length === 1 ? 'o problema crítico' : `os ${criticos.length} problemas críticos`} acima.`
                    : 'Bloqueado: complete os campos de origem unidade.'}
              </span>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
