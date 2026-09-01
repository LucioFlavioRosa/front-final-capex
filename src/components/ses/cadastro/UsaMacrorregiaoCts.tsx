import { useId } from 'react'
import type { Row } from '../../../data/cadastroUnidade/types'

/**
 * "Esta unidade usa macrorregião de CTS" — quantas CTS cada sistema dela comporta.
 *
 * MARCADO, um coletor de tempo seco atende à região e cada sistema da unidade
 * aceita UMA CTS. DESMARCADO, aceitam quantas forem colocadas neles. É regra de
 * CADASTRO, e não de otimização: o motor nunca contou CTS por sistema, e para
 * ele uma ou duas são nós como quaisquer outros.
 *
 * MACRORREGIÃO, e não "sistema de CTS", que era como a caixa se chamava. Além de
 * ser o nome que a operação usa, o antigo colidia com `sistema`, que no cadastro
 * é outra coisa — o conjunto de sub-bacias que escoam para a mesma ETE. A frase
 * dizia "sistema" duas vezes com dois sentidos, e a caixa ficava numa aba cheia
 * de sistemas do outro tipo.
 *
 * A DECISÃO É DA UNIDADE, e não de cada sistema. Quem opera decide uma vez e
 * vale para todos — é a regra de negócio, e é também o que torna a caixa
 * respondível: "este sistema usa CTS?" é uma pergunta que ninguém tinha como
 * responder 997 vezes, uma por sistema.
 *
 * FICA NA ABA DA UNIDADE, logo abaixo do cartão do WACC médio, porque é a outra
 * coisa que a unidade declara sobre si inteira. As duas ficam juntas, e a aba
 * deixa de ser só hierarquia vinda do Databricks.
 *
 * DESABILITADA quando algum sistema já tem mais de uma CTS, em vez de aceitar e
 * falhar no Salvar: o servidor recusa marcar nesse estado (422), e um controle
 * que muda de posição para depois voltar sozinho é pior que um que não se mexe e
 * diz por quê — nomeando os sistemas que impedem.
 */
export function UsaMacrorregiaoCts({
  linha,
  sistemasCheios,
  onMudar,
}: {
  /** A linha de `unidade-regional` — `undefined` enquanto carrega. */
  linha: Row | undefined
  /** Nomes dos sistemas que hoje têm mais de uma CTS. Vazio: nada impede. */
  sistemasCheios: string[]
  onMudar: (marcado: boolean) => void
}) {
  const id = useId()
  if (!linha) return null

  const marcado = linha.usa_macrorregiao_cts === 'Sim'
  const impedido = !marcado && sistemasCheios.length > 0

  return (
    <div className="rounded-2xl border border-water-200 bg-water-50 p-5">
      <label htmlFor={id} className="flex items-baseline gap-2.5 cursor-pointer">
        <input
          id={id}
          type="checkbox"
          checked={marcado}
          disabled={impedido}
          onChange={(e) => onMudar(e.target.checked)}
          className="translate-y-[1px]"
        />
        <span className="text-[14px] font-bold tracking-tight text-ink-900">
          Esta unidade usa macrorregião de CTS
        </span>
      </label>
      <p className="mt-2 max-w-xl pl-[26px] text-[12.5px] leading-relaxed text-ink-600">
        {impedido ? (
          <>
            Não dá para marcar agora:{' '}
            <strong className="font-semibold text-ink-900">
              {sistemasCheios.length === 1
                ? `o sistema ${sistemasCheios[0]} tem mais de uma CTS`
                : `${sistemasCheios.length} sistemas têm mais de uma CTS`}
            </strong>
            {sistemasCheios.length > 1 && ` (${sistemasCheios.join(', ')})`}. Tire as excedentes
            no Fluxo de escoamento — na macrorregião, cada sistema tem uma CTS só.
          </>
        ) : marcado ? (
          <>
            Um coletor de tempo seco atende à região, e{' '}
            <strong className="font-semibold text-ink-900">
              cada sistema desta unidade aceita uma CTS
            </strong>
            . Adicionar uma segunda é recusado pelo servidor.
          </>
        ) : (
          <>
            <strong className="font-semibold text-ink-900">
              Os sistemas desta unidade aceitam mais de uma CTS
            </strong>{' '}
            cada. Marque se a operação é organizada em macrorregião de CTS — vale para todos
            os sistemas da unidade.
          </>
        )}
      </p>
    </div>
  )
}
