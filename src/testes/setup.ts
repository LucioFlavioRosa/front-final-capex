import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

/**
 * `cleanup` explícito porque `globals: false`.
 *
 * A Testing Library só registra o `afterEach` sozinha quando as globais do
 * Vitest estão ligadas. Com `globals: false` — que é o que evita que
 * `describe`/`it` vazem para o autocomplete do app inteiro — o registro não
 * acontece, e o DOM de um teste sobreviveria para o seguinte. O modo de falha é
 * traiçoeiro: `getByRole` passa a achar DOIS elementos e o teste quebra
 * acusando ambiguidade, num arquivo que não tem nada de errado.
 */
afterEach(() => {
  cleanup()
})
