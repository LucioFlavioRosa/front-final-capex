import { DownloadSimple } from '@phosphor-icons/react'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toaster'

/**
 * "Exportar tabelas" — o botão que o produto final tem e o backend ainda não.
 *
 * Ele existe na tela de propósito (decisão de 20/08): o lugar dele no topo do
 * nível é parte do desenho, e descobrir isso depois obrigaria a remontar a
 * barra de ações. O que ele NÃO faz é fingir: não há endpoint de exportação, e
 * um botão que aparenta baixar e não baixa é pior que um que diz que ainda não
 * dá.
 *
 * Por isso `aria-disabled` em vez de `disabled`: um botão desabilitado sai da
 * ordem de tabulação e o leitor de tela nunca o anuncia, então quem navega por
 * teclado não fica sabendo que a exportação está prevista. Assim ele é
 * alcançável, anuncia-se como indisponível, e ao ser acionado explica por quê.
 */
export function BotaoExportar() {
  const { toast } = useToast()
  return (
    <Button
      pill
      variant="secondary"
      aria-disabled="true"
      onClick={() =>
        toast('A exportação de tabelas ainda não está disponível nesta versão.', 'info')
      }
    >
      <DownloadSimple weight="bold" /> Exportar tabelas
    </Button>
  )
}
