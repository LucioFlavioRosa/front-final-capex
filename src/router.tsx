import { createBrowserRouter, createHashRouter } from 'react-router-dom'
import { AppLayout } from './components/layout/AppLayout'
import { RequireAuth } from './components/auth/RequireAuth'
import { RequirePapel, RotaPadrao } from './components/auth/RequirePapel'
import { PAPEIS_CADASTRO, PAPEIS_OPERACIONAIS } from './auth/papeis'
import { Login } from './pages/Login'
import { Cadastro } from './pages/Cadastro'
import { Home } from './pages/Home'
import { CascaResultado } from './rodada/layout/CascaResultado'
import { Historico } from './rodada/pages/Historico'
import { Global } from './rodada/pages/Global'
import { Cidade } from './rodada/pages/Cidade'
import { Sistema } from './rodada/pages/Sistema'
import { SubBacia } from './rodada/pages/SubBacia'
import { Elemento } from './rodada/pages/Elemento'
import { Simular } from './rodada/pages/Simular'

/**
 * As rotas do app: Login público, o resto atrás de sessão.
 *
 * A HOME é a raiz. Ela chegou a ficar desligada enquanto os números dela eram
 * de exemplo — e o motivo registrado na época continua válido como regra:
 * tela com número inventado rouba a atenção da que está pronta. Hoje ela lê do
 * backend, então voltou.
 *
 * CAMINHO DESCONHECIDO (N5, 18/08/2026): deixou de cair fixo no Cadastro — com
 * 8 papéis isso quebraria para `gerenciador_usuarios`, que não pode acessá-lo.
 * `RotaPadrao` (`components/auth/RequirePapel.tsx`) decide em tempo de render,
 * pelo papel de quem está logado: primeiro módulo que a pessoa alcança, ou a
 * tela de "sem módulo nenhum" quando não há um.
 */
/**
 * `createHashRouter` quando VITE_ROUTER_HASH=true — só o build de ARQUIVO ÚNICO
 * usa isso (`scripts/exportar-html-unico.mjs`).
 *
 * O motivo é `file://`: sem servidor, o caminho da URL é o caminho do arquivo
 * no disco ('/C:/Users/.../ses-cadastro.html'), que não casa com rota nenhuma —
 * e `pushState` em file:// é bloqueado pelo navegador, então o redirect para
 * '/cadastro' morreria com SecurityError e a tela ficaria branca. Com hash, a
 * navegação vira '#/cadastro' e funciona sem servidor nenhum.
 *
 * O app servido de verdade (Azure SWA, nginx, `npm run dev`) continua no
 * browser router: URL limpa, e o `staticwebapp.config.json`/`nginx.conf` já
 * fazem o fallback de SPA que ele exige.
 */
const criarRouter = import.meta.env.VITE_ROUTER_HASH === 'true'
  ? createHashRouter
  : createBrowserRouter

export const router = criarRouter([
  { path: '/login', element: <Login /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppLayout />,
        children: [
          /**
           * N5 — cada módulo entra sob o `RequirePapel` com a MESMA lista de
           * `config/navigation.ts` que decide o que aparece no menu. Não é a
           * defesa de verdade (essa é o backend); é o app parar de oferecer
           * uma tela que o servidor recusaria — ver `RequirePapel.tsx`.
           */
          // A HOME É A RAIZ de novo. Ela ficou desligada enquanto mostrava
          // números de exemplo — "uma home com números de exemplo rouba a
          // atenção da única tela pronta para ser discutida", e estava certo.
          // Hoje ela lê do backend: última rodada publicada, KPIs dela,
          // completude e porte da unidade. Sem rodada, diz que não há, em vez de
          // inventar.
          //
          // Sem `RequirePapel`: ela não é módulo, é o painel de quem entrou, e
          // qualquer papel a alcança. O que ela mostra já é recortado pelo
          // servidor, que só devolve rodada de unidade que a pessoa enxerga.
          { path: '/', element: <Home /> },
          {
            element: <RequirePapel papeis={PAPEIS_CADASTRO} />,
            children: [{ path: '/cadastro', element: <Cadastro /> }],
          },
          {
            element: <RequirePapel papeis={PAPEIS_OPERACIONAIS} />,
            children: [
              { path: '/simular', element: <Simular /> },
              /**
               * AS ROTAS DE RESULTADO SÃO PLANAS, e isso é decisão preservada do
               * repo de origem: `/resultados/:runId/sistemas/:id` não carrega a
               * cidade no caminho, ainda que o sistema pertença a uma.
               *
               * O motivo é o deep link: quem recebe a URL de um sistema por e-mail
               * não sabe (nem deveria precisar saber) a ancestralidade dele. A
               * hierarquia vem no payload, e o breadcrumb sai do `CrumbsProvider`
               * da `CascaResultado`, não da URL.
               *
               * A casca é rota-pai só para segurar o provider e o chip do Trilho —
               * ela não acrescenta segmento nenhum ao caminho.
               */
              {
                path: '/resultados',
                element: <CascaResultado />,
                children: [
                  { index: true, element: <Historico /> },
                  { path: ':runId', element: <Global /> },
                  { path: ':runId/cidades/:cidadeId', element: <Cidade /> },
                  { path: ':runId/sistemas/:sistemaId', element: <Sistema /> },
                  { path: ':runId/sub-bacias/:subId', element: <SubBacia /> },
                  { path: ':runId/obras/:obraId', element: <Elemento /> },
                ],
              },
            ],
          },
          // "Caminho desconhecido" e "sem papel nenhum" convergem na mesma
          // decisão: ir para o primeiro módulo que o papel alcança, ou dizer
          // que não há nenhum. Fixo em `/cadastro` (como era antes do N5)
          // quebraria para `gerenciador_usuarios`, para quem essa é
          // justamente a tela proibida.
          { path: '*', element: <RotaPadrao /> },
        ],
      },
    ],
  },
])
