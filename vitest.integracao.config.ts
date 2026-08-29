import { defineConfig } from 'vitest/config'
import { fileURLToPath, URL } from 'node:url'

/**
 * Testes que batem no BACKEND DE VERDADE.
 *
 * Config separada por uma razão só, e ela é o ponto inteiro destes testes: aqui
 * **não há `setupFiles`**. A suíte padrão sobe o MSW (`src/testes/setup.ts`),
 * que intercepta toda requisição — um teste de integração rodando sob ele
 * passaria a exercitar o mock, calado, e continuaria verde no dia em que o
 * servidor mudasse de formato. Que é exatamente o que ele existe para pegar.
 *
 * `environment: node` porque não há tela envolvida: o que se testa é a tradução
 * entre o payload do backend e o formato que o wizard consome.
 *
 * Como rodar:
 *
 *     docker compose ... up -d        # o Otimizador no 8000
 *     npm run test:integracao
 *
 * Sem backend no ar, os testes se PULAM sozinhos em vez de reprovar — quem está
 * mexendo na tela não deve ser barrado por não ter subido o banco.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    globals: false,
    /**
     * UM ARQUIVO POR VEZ. Todos escrevem na MESMA uB1, e cada um desfaz o que fez
     * no fim — o que só funciona se ninguém estiver mexendo no meio.
     *
     * Em paralelo já era corrida (o `adicionarCts` muda o número de linhas da
     * topologia enquanto outro arquivo a lê), e com a gravação do sistema INTEIRO
     * a corrida deixou de ser só teste vermelho: o corpo é a lista completa do
     * sistema, então salvar a partir de uma leitura velha expulsa o componente que
     * outro arquivo acabou de colocar. Serializar é a única forma de o resultado
     * não depender de quem chegar primeiro.
     */
    fileParallelism: false,
    include: ['src/**/*.integracao.test.{ts,tsx}'],
    css: false,
    /**
     * `VITE_API_URL` é OBRIGATÓRIO aqui, e não no navegador.
     *
     * O cliente (`lib/api.ts`) monta caminho relativo — `/api/...` — porque em
     * dev o proxy do Vite e, em produção, o mesmo domínio resolvem a origem. Em
     * Node não há origem nenhuma, e `fetch('/api/…')` estoura com "Invalid URL"
     * antes de sair da máquina.
     */
    env: { VITE_API_URL: process.env.VITE_API_URL ?? 'http://localhost:8000' },
  },
})
