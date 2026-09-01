/**
 * Espelho de `app/cadastro/permissoes.py::CAMPOS_WACC` — os quatro campos de
 * WACC do cadastro, por aba. O financeiro edita os quatro sem distinção entre
 * eles, e não com o recorte fino que o documento de perfis sugere (ver
 * `docs/PENDENCIAS.md`, ambiguidades A2/A3).
 *
 * SEM checagem automática de paridade com o lado Python — ao contrário de
 * `auth/papeis.ts` (que tem `papeis.test.ts` comparando com uma cópia da
 * lista), esta lista não tem teste de espelho. Mudar um lado sem o outro faz
 * a TELA achar que um campo é editável e o SERVIDOR recusar — o que ainda é
 * seguro (o servidor manda), só vira uma UX ruim, não um buraco de permissão.
 */
export const CAMPOS_WACC: Readonly<Record<string, readonly string[]>> = {
  'unidade-regional': ['wacc_medio'],
  'componentes-subbacias-capex': ['wacc'],
  'ete-capex': ['wacc'],
  'componentes-cts-capex': ['wacc'],
}

export function ehCampoWacc(abaKey: string, coluna: string): boolean {
  return (CAMPOS_WACC[abaKey] ?? []).includes(coluna)
}
