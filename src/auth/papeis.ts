/**
 * Vocabulário fechado de papéis — espelho de `app/dominio/papeis.py`.
 *
 * `20260810_AEG_Perfis_de_Acesso.docx` v1.0 fecha o conjunto em 8 valores.
 * Este arquivo, `app/dominio/papeis.py` e o CHECK de
 * `migrations/0018_papeis_fechados.sql` têm de dizer a MESMA coisa — mudar
 * um sem os outros dois é o jeito de um papel novo "funcionar" no backend e
 * não aparecer em lugar nenhum da tela, ou vice-versa.
 *
 * SEM CODEGEN entre Python e TS neste repo: a paridade aqui é garantida por
 * `papeis.test.ts` (uma cópia da lista, comparada contra esta) — mais fraca
 * que a paridade do lado Python, que lê a migration de verdade
 * (`tests/otimizador/test_papeis.py`). Ver o comentário no fim daquele
 * arquivo.
 */
export const ADMIN_HOLDING = 'admin_holding'
export const USUARIO_HOLDING = 'usuario_holding'
export const ADMIN_REGIONAL = 'admin_regional'
export const USUARIO_REGIONAL = 'usuario_regional'
export const ADMIN_UNIDADE = 'admin_unidade'
export const USUARIO_UNIDADE = 'usuario_unidade'
export const FINANCEIRO_HOLDING = 'financeiro_holding'
export const GERENCIADOR_USUARIOS = 'gerenciador_usuarios'

export type Papel =
  | typeof ADMIN_HOLDING
  | typeof USUARIO_HOLDING
  | typeof ADMIN_REGIONAL
  | typeof USUARIO_REGIONAL
  | typeof ADMIN_UNIDADE
  | typeof USUARIO_UNIDADE
  | typeof FINANCEIRO_HOLDING
  | typeof GERENCIADOR_USUARIOS

/** Ordem de exibição — holding → regional → unidade, admin antes de usuário
 *  comum em cada nível, os dois transversais por último. Mesma ordem de
 *  `app/dominio/papeis.py:TODOS`. */
export const TODOS_OS_PAPEIS: readonly Papel[] = [
  ADMIN_HOLDING,
  USUARIO_HOLDING,
  ADMIN_REGIONAL,
  USUARIO_REGIONAL,
  ADMIN_UNIDADE,
  USUARIO_UNIDADE,
  FINANCEIRO_HOLDING,
  GERENCIADOR_USUARIOS,
]

/**
 * "Administrador" no sentido do documento: vê e manuseia o cadastro do seu
 * escopo, e manuseia qualquer otimização do seu nível — não só as próprias.
 * Espelha `app.dominio.papeis.ADMINISTRADORES`.
 */
export const PAPEIS_ADMINISTRADORES: ReadonlySet<Papel> = new Set([
  ADMIN_HOLDING,
  ADMIN_REGIONAL,
  ADMIN_UNIDADE,
])

export function ehAdministrador(papeis: readonly Papel[]): boolean {
  return papeis.some((p) => PAPEIS_ADMINISTRADORES.has(p))
}

/**
 * Os seis papéis "de linha" — os três níveis, administrador e usuário comum
 * — que fazem cadastro, disparam simulação e leem resultado. Usada só para
 * filtrar NAVEGAÇÃO (N4/N5): esconder um item de menu é UX, não segurança —
 * a permissão de verdade é sempre imposta pelo backend (`guarda_de_rota`,
 * `exigir_unidade`, `quem.admin`). Alguém que force a URL continua batendo
 * no 403/404 do servidor mesmo que o link não apareça aqui.
 */
export const PAPEIS_OPERACIONAIS: readonly Papel[] = [
  ADMIN_HOLDING,
  USUARIO_HOLDING,
  ADMIN_REGIONAL,
  USUARIO_REGIONAL,
  ADMIN_UNIDADE,
  USUARIO_UNIDADE,
]

/** Cadastro é o único módulo que o financeiro também vê — em leitura; a
 *  matriz do documento nega a ele escrita, simulação e resultado. */
export const PAPEIS_CADASTRO: readonly Papel[] = [...PAPEIS_OPERACIONAIS, FINANCEIRO_HOLDING]

/**
 * Nome de exibição — os mesmos oito rótulos da coluna "Perfil" do documento
 * (`20260810_AEG_Perfis_de_Acesso.docx`). Usado no toggle de dev
 * (`AuthContext.tsx`) e em qualquer tela futura que precise nomear um papel
 * para gente, não para código — o módulo de Usuários (N6) é o próximo.
 */
export const ROTULO_PAPEL: Record<Papel, string> = {
  [ADMIN_HOLDING]: 'Administrador da holding',
  [USUARIO_HOLDING]: 'Usuário comum da holding',
  [ADMIN_REGIONAL]: 'Administrador regional',
  [USUARIO_REGIONAL]: 'Usuário comum regional',
  [ADMIN_UNIDADE]: 'Administrador da unidade',
  [USUARIO_UNIDADE]: 'Usuário comum da unidade',
  [FINANCEIRO_HOLDING]: 'Financeiro da holding',
  [GERENCIADOR_USUARIOS]: 'Gerenciador de usuários',
}
