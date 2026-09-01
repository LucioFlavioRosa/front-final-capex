import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext'
import type { Papel } from '../../auth/papeis'
import { navItemsVisiveis } from '../../config/navigation'

/**
 * N5 — guarda de ROTA por papel, companheira de `RequireAuth` (que só
 * pergunta "está logado?"). Esta pergunta "o papel desta pessoa alcança este
 * módulo?" — a mesma lista de `NavItem.papeis` que decide o que aparece no
 * menu (`config/navigation.ts`), agora aplicada também a quem digita a URL
 * direto ou guardou um link antigo.
 *
 * NÃO É A DEFESA DE VERDADE — essa é o backend (`guarda_de_rota`,
 * `exigir_unidade`, `quem.admin`, que responde 403/404 de qualquer jeito).
 * Isto é só o app parar de OFERECER uma tela que o servidor vai recusar,
 * substituindo o formulário/gráfico por uma mensagem clara em vez de deixar
 * a pessoa preencher algo para levar um erro de permissão no fim.
 */
export function RequirePapel({ papeis }: { papeis: readonly Papel[] }) {
  const { user } = useAuth()

  const permitido = !!user && papeis.some((p) => user.papeis.includes(p))
  if (!permitido) return <SemAcesso />

  return <Outlet />
}

/**
 * A tela de "nenhum módulo aqui para o seu papel" — hoje é o estado real do
 * `gerenciador_usuarios`: a matriz do documento de perfis nega a ele
 * Cadastro, Simular e Resultados, e o módulo de Usuários que substituiria os
 * três ainda não existe (N6). NÃO é um redirect para `/cadastro`: essa tela
 * é justamente uma das proibidas, e mandar para lá seria trocar uma proibição
 * por outra sem dizer o que houve.
 */
export function SemAcesso() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-content flex-col items-center justify-center gap-2 px-4 text-center">
      <h1 className="text-[20px] font-bold text-ink-900">Nenhum módulo disponível para o seu perfil</h1>
      <p className="max-w-md text-[13.5px] text-ink-water">
        O seu acesso não inclui nenhuma das telas desta versão. Se você acredita que isso é um
        engano, procure quem administra os acessos da sua unidade.
      </p>
    </div>
  )
}

/**
 * Destino de "caminho desconhecido" e de "/" — troca o `<Navigate to="/cadastro">`
 * fixo de antes do N5. Fixo era coerente quando só havia perfil administrador;
 * com 8 papéis, mandar todo mundo para `/cadastro` quebraria justamente para
 * quem esse caminho é proibido (`gerenciador_usuarios`). O destino agora é o
 * PRIMEIRO módulo que o papel da pessoa alcança — e a mesma tela de
 * `SemAcesso` quando não há nenhum.
 */
export function RotaPadrao() {
  const { user } = useAuth()
  const [primeiro] = navItemsVisiveis(user?.papeis ?? [])
  if (!primeiro) return <SemAcesso />
  return <Navigate to={primeiro.path} replace />
}
