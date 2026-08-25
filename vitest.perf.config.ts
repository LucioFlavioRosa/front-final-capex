import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

/**
 * Medição de custo de render — config própria porque o número exige a máquina
 * quieta.
 *
 * A primeira versão deste teste vivia na suíte padrão e media 50ms sozinho
 * contra 9.600ms rodando junto com outros 16 arquivos. Cronômetro disputando
 * CPU com 16 processos mede o computador, não o componente — e um teste que
 * reprova por carga alheia é pior que teste nenhum: ensina a ignorar a suíte.
 *
 *     npm run test:perf
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
    include: ['src/**/*.perf.test.{ts,tsx}'],
    // Um arquivo por vez, sem paralelismo: é o ponto inteiro desta config.
    fileParallelism: false,
    css: false,
    /**
     * Mesma razão de `vitest.integracao.config.ts`: `lib/api.ts` monta caminho
     * relativo, e fora do navegador não há origem — `fetch('/api/…')` estoura
     * com "Invalid URL". Vale para as medições que abrem a aba com o cadastro
     * REAL, já que o custo de abrir depende de quanto o recorte corta, e isso
     * depende do dado.
     */
    env: { VITE_API_URL: process.env.VITE_API_URL ?? 'http://localhost:8000' },
  },
})
