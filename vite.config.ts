import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

// https://vitejs.dev/config/
/**
 * O SELO DO BUILD — a hora em que o bundle foi gerado, embutida nele.
 *
 * Em 01/10/2026 o dono do produto testou cinco vezes um codigo que nunca chegou ao
 * navegador dele: o `index.html` ia sem `Cache-Control`, e a aba servia o aplicativo
 * inteiro do cache, sem um pedido ao servidor. O cache foi consertado no nginx — mas o
 * que custou a tarde foi nao haver COMO SABER, de dentro da tela, qual build estava
 * rodando. A unica prova era o log do nginx, que so quem tem acesso ao container le.
 *
 * `__BUILD__` sai daqui porque e o build que sabe a sua propria hora. Em
 * desenvolvimento (`vite`) vale a hora em que o servidor subiu, que e igualmente util.
 */
const SELO_DO_BUILD = new Date().toISOString()

export default defineConfig({
  define: { __BUILD__: JSON.stringify(SELO_DO_BUILD) },
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    open: true,
    // Proxy para o backend em dev: mantém /api e /auth same-origin com o frontend,
    // então o cookie de sessão (httpOnly, SameSite=Lax) funciona sem CORS.
    proxy: {
      '/api': { target: 'http://localhost:8000', changeOrigin: true },
      '/auth': { target: 'http://localhost:8000', changeOrigin: true },
    },
  },
})
