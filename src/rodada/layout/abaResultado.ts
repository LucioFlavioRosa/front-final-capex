/**
 * A ABA DA TELA DE RESULTADOS — `Plano` ou `Por quê`.
 *
 * As duas respondem perguntas diferentes sobre a mesma rodada:
 *
 *   Plano    o que ENTROU — quanto vale, quando acontece, o que foi construído.
 *   Por quê  o que ficou de FORA, e a razão — categorias, elos, a narrativa.
 *
 * O corte é `entrou` × `não entrou`, e não "resultado × explicabilidade": o
 * segundo par é abstrato e não decide onde cada bloco mora. Este decide, e já
 * está nos dados — a explicabilidade fala inteiramente de `naoFaturando`,
 * categorias de exclusão e elos. A cascata do VPL explica, mas explica o que
 * entrou, então é Plano.
 *
 * MORA NA URL, e não no estado do React, por três razões:
 *
 *   - ela SOBREVIVE À DESCIDA. Quem está em modo "por quê" está caçando uma
 *     sub-bacia específica e desce global → cidade → sub-bacia sem sair do modo.
 *     Em estado de componente, cada nível remontaria no Plano.
 *   - o link é COMPARTILHÁVEL. "Olha por que esta sub-bacia ficou fora" é uma
 *     mensagem que alguém manda, e ela tem de abrir onde o remetente estava.
 *   - o botão VOLTAR funciona. Trocar de aba é navegação, e o navegador já sabe
 *     desfazer navegação.
 */
import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'

export type AbaResultado = 'plano' | 'porque'

/** O nome do parâmetro na URL: `/resultados/{run}/cidades/{id}?aba=porque`. */
export const PARAM_ABA = 'aba'

/**
 * `plano` é o padrão e NÃO aparece na URL.
 *
 * Link sem parâmetro abre no Plano — que é o que alguém que manda "o resultado
 * da rodada" quer mostrar. Só o desvio se escreve, e assim a URL comum continua
 * curta.
 */
export function lerAba(params: URLSearchParams): AbaResultado {
  return params.get(PARAM_ABA) === 'porque' ? 'porque' : 'plano'
}

export function useAbaResultado(): AbaResultado {
  const [params] = useSearchParams()
  return lerAba(params)
}

/**
 * Acrescenta a aba atual a um caminho de descida.
 *
 * Existe porque `<Link to="/caminho">` do React Router SUBSTITUI a busca: sem
 * isto, o primeiro clique numa cidade jogaria a pessoa de volta no Plano, que é
 * exatamente a continuidade que a aba na URL veio dar.
 */
export function useHrefComAba(): (to: string) => string {
  const aba = useAbaResultado()
  return useCallback(
    (to: string) => {
      if (aba === 'plano') return to
      const [caminho, busca = ''] = to.split('?')
      const params = new URLSearchParams(busca)
      params.set(PARAM_ABA, aba)
      return `${caminho}?${params}`
    },
    [aba],
  )
}
