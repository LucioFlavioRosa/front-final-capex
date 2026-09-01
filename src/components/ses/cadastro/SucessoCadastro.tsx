import { CheckCircle } from '@phosphor-icons/react'
import { Button } from '../../ui/Button'
import { useCadastro } from './CadastroContext'

export function SucessoCadastro() {
  const { irFase } = useCadastro()

  return (
    <section className="max-w-[720px] mx-auto px-4 py-20 text-center animate-fade-in">
      <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-green-50 text-success text-4xl">
        <CheckCircle weight="fill" />
      </div>
      <h2 className="mt-6 text-2xl font-bold tracking-tight text-ink-900">Dados da unidade salvos</h2>
      <p className="text-ink-water mt-2">
        As abas foram gravadas. Na sequência você informa o ano-base e o orçamento e dispara a otimização.
      </p>
      <div className="mt-8 flex gap-3 justify-center">
        <Button variant="secondary" onClick={() => irFase('wizard')}>Voltar ao cadastro</Button>
        <Button onClick={() => irFase('selecao')}>Outra unidade</Button>
      </div>
    </section>
  )
}
