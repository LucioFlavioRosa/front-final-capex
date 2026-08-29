import { TreeStructure, Play, ChartLineUp, type Icon } from '@phosphor-icons/react'
import { PAPEIS_CADASTRO, PAPEIS_OPERACIONAIS, type Papel } from '../auth/papeis'

export interface NavItem {
  /** Rótulo curto usado no menu principal */
  label: string
  /**
   * Rótulo completo, usado nos cards da Home.
   *
   * NÃO é o `label` repetido: no menu o contexto ("estou na plataforma") já está
   * dado e o rótulo curto basta; no card da Home ele precisa se explicar
   * sozinho, ao lado de outros dois. Onde os dois eram idênticos, o par não
   * estava fazendo trabalho nenhum.
   */
  title: string
  path: string
  icon: Icon
  description: string
  /**
   * Quem vê este módulo no menu, no rodapé e nos cards da Home (N4). Esconder
   * um item é conveniência de leitura — a rota continua protegida pelo
   * backend independentemente disto; ver o comentário em
   * `auth/papeis.ts:PAPEIS_OPERACIONAIS`.
   */
  papeis: readonly Papel[]
}

/**
 * Módulos da plataforma — fonte única para o menu e para os cards da Home.
 *
 * DE 1 PARA 3 ITENS (17/08/2026, fase 9). É só isto que o Trilho precisou para
 * absorver as telas novas: o `Header.tsx` não mudou de layout, e o indicador
 * deslizante que estava implementado e desligado desde 11/08 por
 * `NAV_ITEMS.length > 1` acende sozinho agora que há mais de um módulo.
 *
 * A ordem é a do fluxo de trabalho — preparar a base, disparar, ler o que saiu
 * —, e não alfabética nem por frequência de uso.
 */
export const NAV_ITEMS: NavItem[] = [
  {
    label: 'Cadastro',
    title: 'Cadastro da unidade',
    path: '/cadastro',
    icon: TreeStructure,
    // Escrito do lado de quem usa, e não do lado do sistema: "abas da base" e
    // "origem unidade em destaque" são vocabulário interno, e a oração depois do
    // travessão fazia um segundo trabalho que não era dela. O que a pessoa faz
    // aqui é preencher o cadastro de uma unidade até ele fechar — e o que ela
    // ganha com isso é poder simular.
    description: 'Preencha o cadastro de uma unidade até ele fechar 100% e liberar a simulação.',
    // O financeiro entra aqui em leitura (a matriz do documento dá a ele
    // consulta de cadastro); a escrita é negada pelo backend, não pelo menu.
    papeis: PAPEIS_CADASTRO,
  },
  {
    label: 'Simular',
    title: 'Nova simulação',
    path: '/simular',
    icon: Play,
    description: 'Dispare uma rodada do otimizador com orçamento e parâmetros próprios.',
    papeis: PAPEIS_OPERACIONAIS,
  },
  {
    label: 'Resultados',
    title: 'Resultados das rodadas',
    path: '/resultados',
    icon: ChartLineUp,
    description: 'Histórico de rodadas e o drill-down de cidade até a obra.',
    papeis: PAPEIS_OPERACIONAIS,
  },
]

/**
 * Os módulos que ESTE conjunto de papéis vê — a mesma lista para o menu, o
 * rodapé e os cards da Home (N4). `financeiro_holding` some de Simular e
 * Resultados; `gerenciador_usuarios` some dos três (o módulo de Usuários
 * dele ainda não existe — N6).
 */
export function navItemsVisiveis(papeisDoUsuario: readonly Papel[]): NavItem[] {
  return NAV_ITEMS.filter((item) => item.papeis.some((p) => papeisDoUsuario.includes(p)))
}
