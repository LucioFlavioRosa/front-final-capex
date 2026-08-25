import { CadastroProvider, useCadastro } from '../components/ses/cadastro/CadastroContext'
import { SelecaoUnidade } from '../components/ses/cadastro/SelecaoUnidade'
import { CadastroWizard } from '../components/ses/cadastro/CadastroWizard'
import { RevisaoCadastro } from '../components/ses/cadastro/RevisaoCadastro'
import { SucessoCadastro } from '../components/ses/cadastro/SucessoCadastro'

export function Cadastro() {
  return (
    <CadastroProvider>
      <CadastroFlow />
    </CadastroProvider>
  )
}

function CadastroFlow() {
  const { state } = useCadastro()

  switch (state.fase) {
    case 'wizard':
      return <CadastroWizard />
    case 'revisao':
      return <RevisaoCadastro />
    case 'sucesso':
      return <SucessoCadastro />
    case 'selecao':
    default:
      return <SelecaoUnidade />
  }
}
