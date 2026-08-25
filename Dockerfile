# syntax=docker/dockerfile:1

# ---- build stage ----
FROM node:20-alpine AS build

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .

# Atalho de SSO — SÓ para build local/kind, NUNCA em produção.
#
# `.dockerignore` exclui todo `.env.*` (inclusive `.env.local`, onde
# `VITE_SKIP_AUTH=true` mora hoje) — de propósito, para nenhuma variável de
# ambiente de um dev vazar sem querer para dentro da imagem. O efeito colateral
# é que a imagem, por padrão, SEMPRE builda com o SSO real ligado — mesmo para
# quem só quer testar a UI localmente, sem Entra ID configurado.
#
# Este ARG existe para isso: default `false` (produção nunca herda o atalho
# por acidente), e quem builda para testar localmente passa
# `--build-arg VITE_SKIP_AUTH=true` explicitamente. `src/auth/AuthContext.tsx`
# já lê exatamente esta variável — nada muda lá.
ARG VITE_SKIP_AUTH=false
ENV VITE_SKIP_AUTH=$VITE_SKIP_AUTH

RUN npm run build

# ---- serve stage ----
FROM nginx:1.27-alpine AS runtime

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://localhost:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
