/**
 * Controle das janelas de obra — `obra_obrigatoria_ano` e `obra_proibida_ate`.
 *
 * ⚠️ SEM USO NO CADASTRO desde 30/07/2026, de propósito. As duas colunas saíram
 * das abas de CAPEX na sessão com a Aegea: obrigar ou proibir uma obra não é
 * cadastro da unidade, é premissa de uma rodada — muda a cada simulação, sem
 * alterar a base. O destino delas é a TELA DE SIMULAÇÃO, que hoje não existe na
 * `main` (vive em `prototipos_frontend`, como `pages/Otimizacao.tsx`, e lá o
 * card "Restrições vindas da base" ainda é somente leitura).
 *
 * Este arquivo fica parado à espera dessa tela em vez de ser apagado porque a
 * armadilha que ele resolve (descrita abaixo) é a mesma lá — e é justamente o
 * tipo de raciocínio que se perde quando o código volta do histórico do git.
 * Ver ANALISE-MUDANCAS-AEGEA-30-07.md, item 9.
 *
 * As duas colunas guardam um código, não um número:
 *
 *   obra_obrigatoria_ano :  0 = não é obrigatória
 *                          -1 = obrigatória em qualquer ano
 *                        AAAA = obrigatória naquele ano exato
 *   obra_proibida_ate    :  0 = sem restrição
 *                        AAAA = não pode começar até aquele ano
 *
 * Num campo de texto livre com o placeholder "0 | -1 | AAAA", alguém escreve
 * `2030` querendo dizer "proibida a partir de 2030" e obtém o oposto, ou digita
 * `1` e cria uma obrigatoriedade no ano 1. O código fica gravado, o motor lê sem
 * reclamar e o plano sai errado — silenciosamente. Por isso a escolha vira
 * seletor, e o ano só aparece quando ele é a resposta certa.
 */

import type { Row } from '../../../data/cadastroUnidade/types'

type Campo = 'obra_obrigatoria_ano' | 'obra_proibida_ate'
type Modo = 'nao' | 'qualquer' | 'ano'

const OPCOES: Record<Campo, { valor: Modo; rotulo: string }[]> = {
  obra_obrigatoria_ano: [
    { valor: 'nao', rotulo: 'Não obrigatória' },
    { valor: 'qualquer', rotulo: 'Obrigatória — qualquer ano' },
    { valor: 'ano', rotulo: 'Obrigatória em…' },
  ],
  // "RESTRIÇÃO" SAIU DO VOCABULÁRIO (item 13): o campo não é uma punição, é a
  // data em que a obra pode começar. A palavra ficava nos dois rótulos e no
  // `aria-label` abaixo. Só o texto mudou — os códigos gravados (0 | AAAA) são
  // os mesmos, e é neles que o motor se baseia.
  obra_proibida_ate: [
    { valor: 'nao', rotulo: 'Sem data mínima' },
    { valor: 'ano', rotulo: 'Não pode começar até…' },
  ],
}

function lerModo(bruto: string): Modo {
  const v = bruto.trim()
  if (v === '' || v === '0') return 'nao'
  if (v === '-1') return 'qualquer'
  return 'ano'
}

interface JanelaObraInputProps {
  campo: Campo
  row: Row
  onChange: (col: string, value: string) => void
}

export function JanelaObraInput({ campo, row, onChange }: JanelaObraInputProps) {
  const bruto = row[campo] ?? ''
  const modo = lerModo(bruto)
  const ano = modo === 'ano' ? bruto.trim() : ''

  function trocarModo(novo: Modo) {
    if (novo === 'nao') onChange(campo, '0')
    else if (novo === 'qualquer') onChange(campo, '-1')
    // 'ano' começa vazio de propósito: gravar um ano-palpite seria pior que
    // deixar o campo pedindo o valor
    else onChange(campo, '')
  }

  const cls =
    'rounded-md border border-aegea-300 bg-white px-2 py-1 text-sm outline-none transition duration-hover ease-saida ' +
    'focus:border-aegea-600 focus:ring-2 focus:ring-aegea-500/30'

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <select
        value={modo}
        onChange={(e) => trocarModo(e.target.value as Modo)}
        aria-label={
          campo === 'obra_obrigatoria_ano' ? 'Obrigatoriedade da obra' : 'Data de início da obra'
        }
        className={`${cls} w-full min-w-0`}
      >
        {OPCOES[campo].map((o) => (
          <option key={o.valor} value={o.valor}>{o.rotulo}</option>
        ))}
      </select>
      {modo === 'ano' && (
        <input
          value={ano}
          inputMode="numeric"
          maxLength={4}
          placeholder="AAAA"
          aria-label="Ano"
          onChange={(e) => onChange(campo, e.target.value.replace(/\D/g, '').slice(0, 4))}
          className={`${cls} w-full min-w-0 font-mono ${ano.length === 4 ? '' : 'border-amber-300 bg-amber-50'}`}
        />
      )}
    </div>
  )
}
