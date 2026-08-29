/**
 * Cliente HTTP mínimo para o backend.
 *
 * Em dev, o Vite faz proxy de /api e /auth para o backend (localhost:8000),
 * então as chamadas são same-origin e o cookie de sessão (httpOnly) viaja
 * automaticamente. Em produção (Cenário 1, mesmo domínio), idem.
 *
 * `VITE_API_URL` só é necessário se o backend ficar em outra origem.
 */
const API_BASE = import.meta.env.VITE_API_URL ?? ''

/**
 * O login do mock de dev ATUAL — só existe com `VITE_SKIP_AUTH=true`.
 *
 * ATÉ 18/08/2026, o toggle de perfil (`AuthContext.tsx`) trocava só o `user`
 * exibido na tela: o MENU mudava, mas toda chamada de rede continuava
 * autenticada como o mesmo `dev@local` de sempre — porque nada aqui dizia ao
 * backend qual perfil estava "logado". Era por isso que `/api/regionais`
 * devolvia a MESMA lista (ou a mesma lista vazia) não importa qual dos 8
 * perfis estivesse selecionado: o filtro por escopo (`app/api/organizacao.py`)
 * roda sobre a identidade REAL da requisição, não sobre o mock da tela.
 *
 * `X-Usuario-Dev` é o mecanismo que `app/api/deps.py` já tinha, pronto,
 * para exatamente isto — só nunca tinha sido ligado no cliente HTTP. Ele só
 * vale enquanto `config().exige_auth` for falso (mesma condição de
 * `VITE_SKIP_AUTH`); em produção, com o SSO ligado, este cabeçalho é
 * ignorado pelo backend.
 */
let loginDeDev: string | null = null

/** Chamado pelo `AuthContext` sempre que o mock de perfil muda. */
export function definirLoginDeDev(login: string | null): void {
  loginDeDev = login
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }

  /**
   * Os três predicados que as telas de rodada usam para escolher a MENSAGEM.
   *
   * Vieram do client do repo de origem porque a alternativa é cada tela
   * comparar números de status na mão — e foi assim que, lá, um 403 chegou a
   * ser mostrado como "erro do servidor, tente de novo", mandando o usuário
   * repetir uma ação que nunca iria funcionar.
   */
  /** Sessão inválida ou sem concessão de acesso à unidade. Repetir não resolve. */
  get naoAutorizado(): boolean {
    return this.status === 401 || this.status === 403
  }

  /** O servidor recusou o conteúdo enviado (validação). */
  get invalido(): boolean {
    return this.status === 400 || this.status === 422
  }

  /** Alguém alterou o mesmo recurso antes — ou a rodada já foi publicada. */
  get conflito(): boolean {
    return this.status === 409
  }
}

/** Extrai a mensagem de erro no mesmo formato que `request` já trata (`erro` →
 * `detail` → `message` → statusText), para os dois clientes abaixo não
 * divergirem de como `ApiError` já fala com o resto do app. */
async function erroDoBody(res: Response): Promise<string> {
  try {
    const body = await res.json()
    return body.erro ?? body.detail ?? body.message ?? res.statusText
  } catch {
    return res.statusText
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include', // manda o cookie de sessão
    headers: {
      'Content-Type': 'application/json',
      ...(loginDeDev ? { 'X-Usuario-Dev': loginDeDev } : {}),
      ...(init?.headers ?? {}),
    },
    ...init,
  })

  if (!res.ok) {
    let message = res.statusText
    try {
      const body = await res.json()
      /**
       * `erro` ANTES de `detail`, e o motivo está registrado no plano de
       * integração: a fase 5 trouxe o `erros.registrar(app)` do repo do Lucio,
       * cujos handlers de `RequestValidationError` e `HTTPException` são
       * GLOBAIS. O formato de erro do backend inteiro passou de
       * `{"detail": …}` para `{"erro": …}` — inclusive nas rotas antigas do
       * cadastro. Sem esta linha, toda mensagem de erro do app cairia no
       * `res.statusText` e o usuário leria "Bad Request" no lugar da frase que
       * o servidor escreveu.
       *
       * `detail` fica como fallback porque a padronização do backend é a fase
       * 10: até lá, rota que ainda não passou pelos handlers novos responde no
       * formato velho.
       */
      message = body.erro ?? body.detail ?? body.message ?? message
    } catch {
      /* corpo não-JSON */
    }
    throw new ApiError(res.status, message)
  }

  if (res.status === 204) return undefined as T

  /**
   * Resposta 200 que não é JSON quase sempre significa que a requisição nunca
   * chegou à API.
   *
   * No Static Web App é um modo de falha concreto: o `navigationFallback` e o
   * `responseOverrides` do staticwebapp.config.json reescrevem rota não
   * encontrada para /index.html com status 200. Sem esta checagem, o
   * `res.json()` estouraria um SyntaxError sobre '<' inesperado — mensagem que
   * não aponta para lugar nenhum e manda quem depura procurar defeito no
   * backend, que sequer foi acionado.
   */
  const tipo = res.headers.get('content-type') ?? ''
  if (!tipo.includes('json')) {
    throw new ApiError(
      res.status,
      `A API respondeu ${res.status} com ${tipo || 'tipo desconhecido'} em vez de JSON. ` +
        'A rota provavelmente não chegou ao backend e caiu no fallback da SPA.',
    )
  }

  return res.json() as Promise<T>
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  /**
   * `put` e `del` entraram com as telas de rodada (favorita, comentário,
   * exclusão). O cadastro não os usa — ele salva por `post`.
   *
   * `put` sem corpo é chamada válida e frequente aqui: `PUT /favorita` é
   * idempotente e não carrega payload; o estado pedido É o estado final.
   */
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
}

/**
 * Baixa um arquivo binário (o template de cadastro) e devolve o nome sugerido
 * pelo servidor.
 *
 * Fora de `request()` de propósito: aquele client assume corpo JSON — tanto no
 * `Content-Type` do pedido quanto no `res.json()` da resposta — e um .xlsx é
 * as duas coisas que ele recusa. Duplicar só o transporte (credenciais,
 * cabeçalho de dev, formato de erro) evita reescrever tudo isso na tela de
 * cadastro.
 */
export async function apiBlob(
  path: string,
): Promise<{ blob: Blob; nomeArquivo: string }> {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: loginDeDev ? { 'X-Usuario-Dev': loginDeDev } : {},
  })
  if (!res.ok) throw new ApiError(res.status, await erroDoBody(res))

  // `attachment; filename="Template_Cadastro_57.xlsx"` — o nome vem do
  // servidor porque só ele sabe o nome e a versão da unidade; inventar um nome
  // aqui duplicaria essa decisão em dois lugares.
  const cabecalho = res.headers.get('content-disposition') ?? ''
  const nomeArquivo = /filename="([^"]+)"/.exec(cabecalho)?.[1] ?? 'template.xlsx'
  return { blob: await res.blob(), nomeArquivo }
}

/**
 * Sobe um arquivo (multipart/form-data) e devolve o JSON de resposta.
 *
 * Sem `Content-Type` manual: o navegador o define sozinho, com o boundary do
 * multipart embutido — escrevê-lo à mão é o erro classico que faz o servidor
 * não conseguir separar as partes do formulário.
 */
export async function apiUpload<T>(path: string, arquivo: File): Promise<T> {
  const form = new FormData()
  form.append('arquivo', arquivo)
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: loginDeDev ? { 'X-Usuario-Dev': loginDeDev } : {},
    body: form,
  })
  if (!res.ok) throw new ApiError(res.status, await erroDoBody(res))
  return res.json() as Promise<T>
}
