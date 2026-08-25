# SES Frontend — Aegea

Frontend da **Plataforma de Otimização de Sequenciamento de Obras de Esgotamento Sanitário (SES)**.

Primeira versão: design system extraído do protótipo (`prototipo-aegea-h15.html`), navegação entre as 5 telas e a Home completa.

## Stack

- **React 18** + **TypeScript**
- **Vite** (dev server / build)
- **Tailwind CSS** (design tokens: paleta `aegea` / `water` / `ink`, fontes Inter + Playfair Display)
- **React Router** (navegação)
- **Phosphor Icons** (`@phosphor-icons/react`)

## Como rodar

```bash
npm install
npm run dev      # servidor de desenvolvimento em http://localhost:5173
npm run build    # build de produção (type-check + Vite)
npm run preview  # pré-visualiza o build
```

## Estrutura

```
src/
├── auth/           # AuthContext (autenticação mock — substituir por MSAL/Azure AD)
├── components/
│   ├── auth/       # RequireAuth (proteção de rotas)
│   ├── brand/      # Logo Aegea, MicrosoftLogo
│   ├── layout/     # AppLayout, Header, Footer
│   ├── ses/        # Unifilar (cascata SVG), ParetoChart, modais de cadastro
│   └── ui/         # Button, Badge, Modal, Toaster, PageHeader
├── config/         # navigation.ts (fonte única do menu e cards)
├── data/           # mock.ts + ses.ts (dados de exemplo — substituir pela ses-api)
├── lib/            # format.ts (helpers pt-BR)
├── pages/          # Login, Home, Cadastro, Otimizacao, Resultados, Historico
├── router.tsx      # rotas (/login público, demais protegidas)
├── main.tsx        # entrypoint
└── index.css       # Tailwind + estilos base
```

> **v1 de design.** Todas as telas usam dados de exemplo (`data/ses.ts`) — não há
> persistência nem backend. Formulários e uploads são visuais (fecham com toast, não gravam).
> O motor de otimização é simulado apenas na animação de Loading.

## Autenticação (SSO)

A tela `/login` simula o fluxo do **Azure Entra ID**. Nesta versão a autenticação é
**mock**: `AuthContext` guarda o usuário em `localStorage` e as rotas internas são protegidas
por `RequireAuth`. Para a integração real, trocar `login()`/`logout()` em
[src/auth/AuthContext.tsx](src/auth/AuthContext.tsx) por chamadas do MSAL
(`@azure/msal-browser` / `@azure/msal-react`) e derivar o `role` dos grupos do Azure AD.

## Design system

Os tokens ficam em `tailwind.config.js`:

- **aegea** — verde institucional (ações primárias, VPL)
- **water** — azul água (SES / hidráulica, CAPEX)
- **ink** — neutros (texto, bordas, fundos)
- `success` / `warning` / `danger`
- Fontes: `font-sans` (Inter) e `font-display` (Playfair Display, itálico)
- Sombras: `shadow-soft`, `shadow-elev`

## Próximos passos

- Detalhar Cadastro SES (abas, tabelas, unifilar SVG, modais)
- Detalhar Otimização (formulário + loading) e Resultados (Pareto + sequência)
- Histórico e integração com a API (`ses-api`)
