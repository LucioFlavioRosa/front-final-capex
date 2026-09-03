/**
 * A ABA DA TELA DE RESULTADOS — `Plano`, `Por quê` e `Sensibilidade`.
 *
 * As três respondem perguntas diferentes sobre a mesma rodada:
 *
 *   Plano         o que ENTROU — quanto vale, quando acontece, o que foi construído.
 *   Por quê       o que ficou de FORA, e a razão — as obras, os tópicos, o cenário.
 *   Sensibilidade o que MUDARIA com mais orçamento — o teto e a curva.
 *
 * O corte entre as duas primeiras é `entrou` × `não entrou`, e não "resultado ×
 * explicabilidade": o segundo par é abstrato e não decide onde cada bloco mora.
 * Este decide, e já está nos dados — a explicabilidade fala inteiramente de
 * obras que NÃO foram construídas: os tópicos, os elos e o cenário de quanto
 * teria de ser o orçamento. A cascata do VPL explica, mas explica o que
 * entrou, então é Plano.
 *
 * A terceira fala de um plano que NÃO EXISTE — o que aconteceria com outro
 * orçamento. Ela morava dentro do Plano e sufocava lá: são três curvas, uma
 * tabela de teto e um gráfico de obras disputando espaço com o plano de verdade,
 * e quem chegava ao painel da rodada já tinha passado por tudo isso.
 *
 * ## DUAS SÃO MODOS; A TERCEIRA É UM LUGAR
 *
 * `plano` e `porque` são modos de olhar QUALQUER nível, e por isso sobrevivem à
 * descida: quem está caçando o motivo de uma sub-bacia desce global → cidade →
 * sub-bacia sem sair do modo.
 *
 * `sensibilidade` não é um modo: é uma tela, e ela só existe no nível da rodada
 * — a curva é do orçamento inteiro, e não há resposta dela para uma cidade ou
 * uma obra. Então ela NÃO desce (clicar numa cidade a partir dela leva ao Plano
 * da cidade, que é a única coisa que existe lá) e NÃO é lida em nível nenhum
 * além do global (uma URL colada à mão cai no Plano em vez de renderizar uma
 * tela vazia).
 *
 * MORA NA URL, e não no estado do React, por três razões:
 *
 *   - ela SOBREVIVE À DESCIDA (as duas que são modo).
 *   - o link é COMPARTILHÁVEL. "Olha por que esta sub-bacia ficou fora" é uma
 *     mensagem que alguém manda, e ela tem de abrir onde o remetente estava.
 *   - o botão VOLTAR funciona. Trocar de aba é navegação, e o navegador já sabe
 *     desfazer navegação.
 */
import { useCallback } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'

export type AbaResultado = 'plano' | 'porque' | 'sensibilidade'

/** O nome do parâmetro na URL: `/resultados/{run}/cidades/{id}?aba=porque`. */
export const PARAM_ABA = 'aba'

/**
 * O nível 1 é `/resultados/{runId}` e nada mais — é onde a Sensibilidade existe.
 *
 * Pelo CAMINHO, e não por `useParams`: o que decide é a forma da URL, e lê-la
 * direto dispensa saber em qual rota da tabela o componente foi montado. A
 * `AbasResultado` vive na casca, que é rota-pai de todos os níveis.
 */
export function ehNivelDaRodada(pathname: string): boolean {
  return /^\/resultados\/[^/]+\/?$/.test(pathname)
}

/**
 * `plano` é o padrão e NÃO aparece na URL.
 *
 * Link sem parâmetro abre no Plano — que é o que alguém que manda "o resultado
 * da rodada" quer mostrar. Só o desvio se escreve, e assim a URL comum continua
 * curta.
 *
 * `aceitaSensibilidade` é `false` por padrão, e o default é a parte importante:
 * todo nível abaixo da rodada continua enxergando só `plano`/`porque` sem
 * precisar saber que a terceira aba existe. Sem isso, um `aba=sensibilidade`
 * colado numa URL de cidade cairia no ramo do "por quê" nas telas escritas como
 * `aba === 'plano' ? A : B` — mostrando a explicabilidade sob o rótulo errado.
 */
export function lerAba(params: URLSearchParams, aceitaSensibilidade = false): AbaResultado {
  const bruto = params.get(PARAM_ABA)
  if (bruto === 'porque') return 'porque'
  if (bruto === 'sensibilidade' && aceitaSensibilidade) return 'sensibilidade'
  return 'plano'
}

export function useAbaResultado(opcoes?: { comSensibilidade?: boolean }): AbaResultado {
  const [params] = useSearchParams()
  return lerAba(params, opcoes?.comSensibilidade ?? false)
}

/**
 * Acrescenta a aba atual a um caminho de descida.
 *
 * Existe porque `<Link to="/caminho">` do React Router SUBSTITUI a busca: sem
 * isto, o primeiro clique numa cidade jogaria a pessoa de volta no Plano, que é
 * exatamente a continuidade que a aba na URL veio dar.
 *
 * SÓ `porque` DESCE. `plano` é o default e não precisa ser escrito;
 * `sensibilidade` não existe abaixo da rodada, e levá-la junto produziria uma
 * cidade com uma aba que não abre nada. Descer a partir dela é sair dela — o que
 * é correto: a pergunta "e se o CAPEX fosse maior?" não se recorta por cidade.
 */
export function useHrefComAba(): (to: string) => string {
  const aba = useAbaResultado({ comSensibilidade: true })
  return useCallback(
    (to: string) => {
      if (aba !== 'porque') return to
      const [caminho, busca = ''] = to.split('?')
      const params = new URLSearchParams(busca)
      params.set(PARAM_ABA, aba)
      return `${caminho}?${params}`
    },
    [aba],
  )
}

/** `true` quando a aba de sensibilidade está aberta no nível em que ela existe. */
export function useSensibilidadeAberta(): boolean {
  const { pathname } = useLocation()
  const aba = useAbaResultado({ comSensibilidade: true })
  return aba === 'sensibilidade' && ehNivelDaRodada(pathname)
}
