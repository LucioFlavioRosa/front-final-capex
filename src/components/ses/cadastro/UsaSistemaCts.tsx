import { useId } from 'react'
import type { Row } from '../../../data/cadastroUnidade/types'

/**
 * "Este sistema usa sistema de CTS" — quantas CTS ele comporta.
 *
 * MARCADO, o sistema aceita UMA CTS. DESMARCADO, aceita quantas forem colocadas
 * nele. É regra de CADASTRO, e não de otimização: o motor nunca contou CTS por
 * sistema, e para ele uma ou duas são nós como quaisquer outros.
 *
 * FICA NA ABA DO FLUXO, ao lado do seletor de sistema, porque é aqui que se
 * escolhe um sistema por vez e se coloca CTS nele. O dado mora em
 * `cidade-sistema`, que é aba oculta — editá-lo lá seria escondê-lo de quem
 * precisa dele.
 *
 * DESABILITADA quando o sistema já tem mais de uma CTS, em vez de aceitar e
 * falhar no Salvar: o servidor recusa marcar nesse estado (422), e um controle
 * que muda de posição para depois voltar sozinho é pior que um que não se mexe e
 * diz por quê.
 */
export function UsaSistemaCts({
  sistemaId,
  sistemaNome,
  linha,
  quantasCts,
  onMudar,
}: {
  sistemaId: string
  sistemaNome: string
  /** A linha de `cidade-sistema` deste sistema — `undefined` enquanto carrega. */
  linha: Row | undefined
  quantasCts: number
  onMudar: (marcado: boolean) => void
}) {
  const id = useId()
  if (!sistemaId || !linha) return null

  const marcado = linha.usa_sistema_cts === 'Sim'
  const impedido = !marcado && quantasCts > 1

  return (
    <div className="mt-3 rounded-[10px] border border-ink-200 bg-ink-50 px-3.5 py-2.5">
      <label htmlFor={id} className="flex items-baseline gap-2 cursor-pointer">
        <input
          id={id}
          type="checkbox"
          checked={marcado}
          disabled={impedido}
          onChange={(e) => onMudar(e.target.checked)}
          className="translate-y-[1px]"
        />
        <span className="text-[13px] font-semibold text-ink-900">
          {sistemaNome || sistemaId} usa sistema de CTS
        </span>
      </label>
      <div className="mt-1 pl-6 text-[11.5px] leading-snug text-ink-water">
        {impedido ? (
          <>
            O sistema tem <strong>{quantasCts} CTS</strong>. Tire as excedentes no fluxo para poder
            marcar — marcado, ele aceita uma só.
          </>
        ) : marcado ? (
          <>
            Aceita <strong>uma CTS</strong>. Adicionar outra é recusado pelo servidor.
          </>
        ) : (
          <>
            Aceita <strong>mais de uma CTS</strong>.
            {quantasCts > 0 && ` Hoje tem ${quantasCts}.`}
          </>
        )}
      </div>
    </div>
  )
}
