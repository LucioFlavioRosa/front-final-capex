import { ehCampoWacc } from '../data/cadastroUnidade/wacc'
import { ehAdministrador, FINANCEIRO_HOLDING, type Papel } from './papeis'

/**
 * Quem pode digitar em QUAL campo do cadastro — espelho, no front, da mesma
 * regra de três ramos que `app/cadastro/routes.py::salvar_cadastro` já
 * impõe no servidor (N7/N8, 18/08/2026):
 *
 *   administrador   edita qualquer campo
 *   financeiro      edita só os campos de WACC (`data/cadastroUnidade/wacc.ts`)
 *   os demais       não editam nada
 *
 * Isto é PREVENÇÃO, não a permissão de verdade — essa continua sendo o
 * servidor, que recusa com 403 mesmo que esta função (ou uma versão dela com
 * bug) diga "sim". O que isto evita é a pessoa preencher um campo, salvar, e
 * só então descobrir que aquele campo não era dela — perdendo, no mesmo
 * golpe, qualquer edição legítima que tivesse feito junto (o POST é tudo-ou-
 * nada: um campo fora do escopo derruba o salvamento inteiro).
 */
export function podeEditarCampoCadastro(
  papeis: readonly Papel[],
  abaKey: string,
  coluna: string,
): boolean {
  if (ehAdministrador(papeis)) return true
  if (papeis.includes(FINANCEIRO_HOLDING)) return ehCampoWacc(abaKey, coluna)
  return false
}
