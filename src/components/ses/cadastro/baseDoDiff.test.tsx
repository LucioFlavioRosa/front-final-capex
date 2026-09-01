/**
 * A BASE DO DIFF NÃO SOBREVIVE A UMA LEITURA QUE FALHOU.
 *
 * `salvarCadastro` grava a diferença entre a tela e o retrato que o servidor
 * devolveu na última leitura. Se esse retrato for de ANTES, o diff mente — e em
 * topologia mentir é mandar remoção de componente que ninguém tirou, porque o
 * corpo é a lista completa do sistema e ausência significa saída.
 *
 * O provider engole o 404 da leitura de propósito (unidade sem cadastro é caso
 * normal). O que ele NÃO pode fazer é engolir o 404 e continuar com a base
 * anterior de pé. Para unidade diferente a guarda de `unidadeId` dentro de
 * `salvarCadastro` já recusa; para a MESMA unidade relida ela passaria, e é esse
 * o furo que este teste prende.
 *
 * Vale registrar que o defeito é ANTERIOR à mudança que introduziu a base
 * explícita: o `Map` de módulo que existia antes em `cadastroApi` guardava o
 * mesmo retrato velho e nunca era limpo. O que mudou foi a posse ficar visível,
 * e com isso dar para fechar o furo — e testá-lo.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { http, HttpResponse } from 'msw'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { servidor } from '@/testes/servidor'
import { CadastroProvider, useCadastro } from './CadastroContext'

vi.mock('@/auth/AuthContext', () => ({
  useAuth: () => ({ user: { name: 'Teste', papeis: ['admin_holding'] } }),
}))

beforeAll(() => servidor.listen({ onUnhandledRequest: 'bypass' }))
// O `document` é o MESMO nos dois testes deste arquivo: sem zerar, o
// `waitFor` do segundo passa de imediato lendo o título que o primeiro deixou.
beforeEach(() => {
  document.title = ''
})
afterEach(() => servidor.resetHandlers())
afterAll(() => servidor.close())

const UNIDADE = '56'
const OUTRA = '57'

/**
 * Os CINCO endpoints de `lerCadastro`. O `servidor` compartilhado foi montado
 * para as telas de rodada e não os cobre — sem eles, a leitura falha e os dois
 * testes deste arquivo passariam pelo mesmo motivo errado.
 *
 * Cadastro VAZIO de propósito: o que se afirma aqui é sobre a base existir ou
 * não, e nenhuma linha é necessária para isso.
 */
function leituraOk() {
  servidor.use(
    http.get('/api/unidades/:id/hierarquia', () =>
      HttpResponse.json({
        unidReg: { rid: 'R4', rnome: 'Regional 4', uid: UNIDADE, unome: 'ÁGUAS DO RIO 01', waccMedio: '8' },
        empresas: [],
        cidades: [],
        sistemas: [],
        topo: [],
        semSistema: [],
      }),
    ),
    http.get('/api/unidades/:id/contrato', () =>
      HttpResponse.json({ cidades: [], metas: [], fator: [] }),
    ),
    http.get('/api/unidades/:id/sub-bacias', () => HttpResponse.json({ subs: {} })),
    http.get('/api/unidades/:id/etes', () => HttpResponse.json({ etes: [] })),
    http.get('/api/unidades/:id/cts', () => HttpResponse.json({ ctss: {} })),
  )
}

/** Uma sonda: escolhe a unidade, salva, e mostra o que aconteceu. */
function Sonda() {
  const { selecionarUnidade, salvar, state } = useCadastro()
  return (
    <div>
      <button onClick={() => selecionarUnidade(UNIDADE, 'ÁGUAS DO RIO 01', 'R4')}>escolher</button>
      <button onClick={() => selecionarUnidade(OUTRA, 'ÁGUAS DO RIO 02', 'R4')}>escolher outra</button>
      <button
        onClick={() =>
          salvar().then(
            () => (document.title = 'salvou'),
            (e: Error) => (document.title = `recusou: ${e.name}`),
          )
        }
      >
        salvar
      </button>
      <span data-testid="unidade">{state.unidadeId}</span>
    </div>
  )
}

function montar() {
  return render(
    <CadastroProvider>
      <Sonda />
    </CadastroProvider>,
  )
}

describe('a base do diff', () => {
  it('não sobrevive a uma releitura que falha na MESMA unidade', async () => {
    /**
     * A SEQUÊNCIA IMPORTA, e é ela que distingue este teste de um que passa
     * com o defeito no lugar.
     *
     * Uma unidade que nunca leu com sucesso não tem base para ficar velha — o
     * primeiro `salvar` recusaria de qualquer jeito. E uma base de OUTRA
     * unidade já é recusada pela guarda de `unidadeId` dentro de
     * `salvarCadastro`. O furo é o do meio: base boa da unidade A, uma volta
     * por B, e a releitura de A falhando. Aí o id bate, a guarda passa, e sem
     * a limpeza o diff rodaria contra o retrato de antes.
     */
    leituraOk()
    montar()
    await userEvent.click(screen.getByText('escolher'))
    await waitFor(() => expect(screen.getByTestId('unidade')).toHaveTextContent(UNIDADE))
    // A base de `UNIDADE` está de pé agora — o salvamento passa.
    await userEvent.click(screen.getByText('salvar'))
    await waitFor(() => expect(document.title).toBe('salvou'))

    // Daqui em diante o cadastro some do servidor.
    servidor.use(
      http.get('/api/unidades/:id/hierarquia', () =>
        HttpResponse.json({ erro: 'Ficha não encontrada nesta unidade.' }, { status: 404 }),
      ),
    )
    document.title = ''
    await userEvent.click(screen.getByText('escolher outra'))
    await waitFor(() => expect(screen.getByTestId('unidade')).toHaveTextContent(OUTRA))
    await userEvent.click(screen.getByText('escolher'))
    await waitFor(() => expect(screen.getByTestId('unidade')).toHaveTextContent(UNIDADE))

    await userEvent.click(screen.getByText('salvar'))
    // Recusa é a resposta certa: sem retrato atual, gravar seria adivinhar.
    await waitFor(() => expect(document.title).toBe('recusou: CadastroSemLeitura'))
  })

  it('existe quando a leitura vai bem — a guarda não bloqueia o caminho normal', async () => {
    // Sem este par, o teste acima passaria com o provider quebrado de outro
    // jeito: recusar SEMPRE também faria `CadastroSemLeitura` aparecer.
    leituraOk()
    montar()
    await userEvent.click(screen.getByText('escolher'))
    await waitFor(() => expect(screen.getByTestId('unidade')).toHaveTextContent(UNIDADE))

    await userEvent.click(screen.getByText('salvar'))
    await waitFor(() => expect(document.title).toBe('salvou'))
  })
})
