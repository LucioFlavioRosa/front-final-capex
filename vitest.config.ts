import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

/**
 * Configuração de teste SEPARADA do `vite.config.ts`, de propósito.
 *
 * O `vite.config.ts` é compilado pelo `tsconfig.node.json` (composite, emite
 * `vite.config.js` ao lado do fonte — ver o `.gitignore`). Enfiar o bloco
 * `test` lá dentro obrigaria o build de produção a resolver `vitest/config`,
 * que é devDependency: quem rodasse `npm ci --omit=dev` no CI quebraria no
 * `vite build`, e a mensagem apontaria para a configuração, não para a causa.
 *
 * O preço é repetir o alias `@`. É uma linha, e ela é a mesma dos outros dois
 * lugares onde o alias já vive (`vite.config.ts` e `tsconfig.json`).
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./src/testes/setup.ts'],
    // Só o módulo novo. O cadastro e a home não têm teste, e varrer `src`
    // inteiro faria o comando falhar por ausência de arquivo em vez de por
    // defeito.
    include: ['src/**/*.test.{ts,tsx}'],
    // O teste de INTEGRACAO fica fora da suite padrao: ele bate no backend de
    // verdade, e aqui o MSW (`testes/setup.ts`) intercepta toda requisicao —
    // ele passaria a testar o mock, calado, em vez do servidor. Roda por
    // `npm run test:integracao`, que sobe sem o setup do mock.
    // Fora da suite padrao, por razoes diferentes: o de INTEGRACAO bate no
    // backend de verdade (aqui o MSW o interceptaria), e o de PERF cronometra
    // render (aqui ele disputaria CPU com os outros 16 arquivos e mediria a
    // maquina). Cada um tem seu script: `test:integracao` e `test:perf`.
    exclude: [
      '**/node_modules/**',
      '**/*.integracao.test.{ts,tsx}',
      '**/*.perf.test.{ts,tsx}',
    ],
    css: false,
  },
})
