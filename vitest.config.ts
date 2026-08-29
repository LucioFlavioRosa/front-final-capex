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
    // Fora da suíte padrão, e cada um por sua razão.
    //
    // Os de PERF cronometram render: aqui eles disputariam CPU com os outros
    // arquivos e passariam a medir a máquina, não o código. Rodam sozinhos, por
    // `npm run test:perf`.
    //
    // Os de INTEGRAÇÃO batem no backend de verdade, e aqui o MSW
    // (`testes/setup.ts`) intercepta toda requisição — eles passariam a testar o
    // mock, calados, e seguiriam verdes no dia em que o servidor mudasse de
    // formato. Que é exatamente o que existem para pegar.
    exclude: [
      '**/node_modules/**',
      '**/*.integracao.test.{ts,tsx}',
      '**/*.perf.test.{ts,tsx}',
    ],
    css: false,
  },
})
