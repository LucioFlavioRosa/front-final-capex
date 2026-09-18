import { useRef, useState } from 'react'
import { CircleNotch, DownloadSimple, UploadSimple } from '@phosphor-icons/react'
import type { UnidadeState } from '../../../data/cadastroUnidade/types'
import { mesclarPlanilha, regimeDeCts, type ResultadoDaMescla } from '../../../domain/planilha'
import { baixarPlanilha, lerPlanilha } from '../../../lib/planilhaCadastro'
import { Button } from '../../ui/Button'
import { useToast } from '../../ui/Toaster'

/**
 * "Preencher por planilha" — baixar o cadastro como Excel e devolvê-lo preenchido.
 *
 * FICA NA ABA DA UNIDADE, LOGO ABAIXO DA CAIXA DA MACRORREGIÃO, e a posição é
 * a mensagem: a caixa decide quantas CTS cada sistema comporta, e é isso que
 * diz quantas fichas de CTS a planilha traz para preencher. Quem marca ou
 * desmarca vê, na linha de baixo, que a planilha muda junto — o texto do cartão
 * diz o regime, e o arquivo o carrega no Leia-me e no cabeçalho das abas de CTS.
 *
 * A PLANILHA SAI DO QUE A TELA TEM AGORA, edições não salvas incluídas. É o que
 * se espera de "baixar o que estou vendo"; quem quer o que está no servidor
 * recarrega antes.
 *
 * A IMPORTAÇÃO NÃO GRAVA. Ela mescla na tela (`IMPORTAR_PLANILHA`), lista o que
 * ignorou, e a pessoa revê a grade e clica em Salvar — o mesmo caminho de quem
 * digitou à mão, com o mesmo diff, a mesma trilha e as mesmas recusas do
 * servidor. Um botão que gravasse direto passaria por cima das três.
 *
 * Os avisos ficam no cartão, e não só num toast: são a lista do que NÃO entrou,
 * e ninguém confere uma lista de dez linhas em quatro segundos de toast.
 */
export function PlanilhaDaUnidade({
  unidade,
  onImportado,
}: {
  unidade: UnidadeState
  /** Recebe o resultado da mescla — quem chama põe `dados` no estado. */
  onImportado: (resultado: ResultadoDaMescla) => void
}) {
  const { toast } = useToast()
  const regime = regimeDeCts(unidade.data)
  const [baixando, setBaixando] = useState(false)
  const [importando, setImportando] = useState(false)
  const [avisos, setAvisos] = useState<string[]>([])
  const [resumo, setResumo] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function baixar() {
    setBaixando(true)
    try {
      const nome = await baixarPlanilha(unidade)
      toast(`Planilha ${nome} gerada.`, 'success')
    } catch (erro) {
      toast(`Não foi possível gerar a planilha: ${erro instanceof Error ? erro.message : String(erro)}`, 'warning')
    } finally {
      setBaixando(false)
    }
  }

  async function importar(arquivo: File) {
    setImportando(true)
    setAvisos([])
    setResumo(null)
    try {
      const lida = await lerPlanilha(await arquivo.arrayBuffer())
      const resultado = mesclarPlanilha(unidade, lida)
      setAvisos(resultado.avisos)
      const abas = Object.keys(resultado.dados).length
      if (abas) {
        onImportado(resultado)
        setResumo(
          `${resultado.alteracoes} ${resultado.alteracoes === 1 ? 'valor alterado' : 'valores alterados'} em ${abas} ${abas === 1 ? 'aba' : 'abas'} — revise e clique em Salvar.`,
        )
        toast('Planilha importada. Revise os campos e clique em Salvar.', 'success')
      } else {
        setResumo(`Nada mudou: ${resultado.linhasLidas} ${resultado.linhasLidas === 1 ? 'linha lida' : 'linhas lidas'}, nenhum valor diferente do que a tela já tem.`)
        toast('A planilha não trouxe nada diferente do que a tela já tem.', 'info')
      }
    } catch (erro) {
      toast(`Não foi possível ler a planilha: ${erro instanceof Error ? erro.message : String(erro)}`, 'warning')
    } finally {
      setImportando(false)
    }
  }

  return (
    <div className="rounded-2xl border border-water-200 bg-water-50 p-5" data-testid="planilha-da-unidade">
      <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-3">
        <div className="max-w-xl">
          <h3 className="text-[14px] font-bold tracking-tight text-ink-900">Preencher por planilha</h3>
          <p className="mt-2 text-[12.5px] leading-relaxed text-ink-600">
            Baixe o cadastro inteiro como Excel — uma aba por tabela, já com as linhas de hoje —,
            preencha fora daqui e traga de volta.{' '}
            <strong className="font-semibold text-ink-900">
              A planilha segue o regime de {regime.nome.toLowerCase()} de CTS
            </strong>{' '}
            {regime.macro
              ? 'marcado acima: cada macrorregião tem uma ficha (a soma dos coletores) para preencher as obras — inclusive as que ainda esperam sistema, cujo sistema você informa na própria planilha.'
              : 'desmarcado acima: cada coletor tem a própria ficha de obras — inclusive os que ainda esperam sistema, cujo sistema você informa na própria planilha.'}{' '}
            Mudou a caixa, baixe de novo.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" onClick={baixar} disabled={baixando}>
            {baixando ? (
              <>
                <CircleNotch weight="bold" className="animate-spin" /> Gerando…
              </>
            ) : (
              <>
                <DownloadSimple weight="bold" /> Baixar planilha preenchida
              </>
            )}
          </Button>
          {/* `<input type=file>` disparado por um `<button>`: o input nativo não é
              estilizável, e é o padrão de qualquer "escolher arquivo" custom. */}
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            data-testid="arquivo-da-planilha"
            onChange={(e) => {
              const arquivo = e.target.files?.[0]
              e.target.value = ''
              if (arquivo) void importar(arquivo)
            }}
          />
          <Button
            variant="secondary"
            size="sm"
            onClick={() => inputRef.current?.click()}
            disabled={importando}
          >
            {importando ? (
              <>
                <CircleNotch weight="bold" className="animate-spin" /> Importando…
              </>
            ) : (
              <>
                <UploadSimple weight="bold" /> Importar planilha preenchida
              </>
            )}
          </Button>
        </div>
      </div>

      {resumo ? (
        <p role="status" className="mt-3 text-[12.5px] font-semibold text-ink-900">
          {resumo}
        </p>
      ) : null}
      {avisos.length ? (
        <div role="alert" className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2">
          <p className="text-[12px] font-semibold text-[#8A4B0A]">
            {avisos.length === 1 ? 'Um aviso — o que ficou de fora:' : `${avisos.length} avisos — o que ficou de fora:`}
          </p>
          <ul className="mt-1 max-h-48 list-disc space-y-0.5 overflow-y-auto pl-5 text-[12px] leading-relaxed text-ink-700">
            {avisos.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
