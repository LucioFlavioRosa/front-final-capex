/**
 * O CONTROLE DAS ABAS, na casca — e não em cada nível.
 *
 * Ele mora aqui por duas razões. A primeira é continuidade: a aba sobrevive à
 * descida, e quem está caçando o motivo de uma sub-bacia desce três níveis sem
 * sair do modo. A segunda é de natureza — escolher a aba é dizer QUE PERGUNTA se
 * está fazendo, e isso pertence à moldura, não ao conteúdo.
 *
 * Segmentado, e não as abas de sublinhado que o cadastro usa: lá elas separam
 * PARTES do mesmo assunto (as tabelas de um bloco), aqui separam dois MODOS de
 * olhar a mesma rodada. Forma diferente para relação diferente.
 */
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import {
  ehNivelDaRodada,
  lerAba,
  PARAM_ABA,
  type AbaResultado,
} from '@/rodada/layout/abaResultado'

const ABAS: { id: AbaResultado; rotulo: string; descricao: string; soNaRodada?: boolean }[] = [
  { id: 'plano', rotulo: 'Plano', descricao: 'o que entrou' },
  { id: 'porque', rotulo: 'Por quê', descricao: 'o que ficou de fora' },
  // SÓ NO NÍVEL DA RODADA. A curva é do orçamento inteiro; não há sensibilidade
  // de uma cidade nem de uma obra. Mostrar a aba lá e abrir uma tela vazia seria
  // pior que não a mostrar — ela prometeria uma resposta que não existe.
  {
    id: 'sensibilidade',
    rotulo: 'Sensibilidade',
    descricao: 'e se o CAPEX fosse maior',
    soNaRodada: true,
  },
]

export function AbasResultado({ ehVariacao = false }: { ehVariacao?: boolean }) {
  const [params] = useSearchParams()
  const { pathname } = useLocation()
  /* A Sensibilidade existe no nível da rodada, e só quando a rodada é um plano
     de verdade. Uma VARIAÇÃO é um ponto da curva de outra — ela tem plano, obras
     e explicabilidade próprios, mas não tem análise própria a oferecer. */
  const temSensibilidade = ehNivelDaRodada(pathname) && !ehVariacao
  const atual = lerAba(params, temSensibilidade)
  const visiveis = ABAS.filter((a) => !a.soNaRodada || temSensibilidade)

  /** O mesmo caminho, trocando só a aba. `plano` não escreve parâmetro. */
  const href = (aba: AbaResultado) => {
    const novo = new URLSearchParams(params)
    if (aba === 'plano') novo.delete(PARAM_ABA)
    else novo.set(PARAM_ABA, aba)
    const busca = novo.toString()
    return busca ? `${pathname}?${busca}` : pathname
  }

  return (
    <div
      role="tablist"
      aria-label="O que olhar nesta rodada"
      className="mb-5 inline-flex gap-1 rounded-full border border-ink-200 bg-white p-1 shadow-soft"
    >
      {visiveis.map((aba) => {
        const ativa = aba.id === atual
        return (
          <Link
            key={aba.id}
            to={href(aba.id)}
            role="tab"
            aria-selected={ativa}
            /* `replace` para a troca de aba não encher o histórico: alternar
               cinco vezes e apertar Voltar deve sair do nível, não desfazer os
               cinco cliques. Descer de nível continua empilhando normalmente. */
            replace
            className={`rounded-full px-4 py-2 text-[13.5px] font-bold transition-colors duration-hover ease-saida ${
              ativa
                ? 'bg-water-600 text-white'
                : 'text-ink-600 hover:bg-water-50 hover:text-ink-900'
            }`}
          >
            {aba.rotulo}
            <span
              className={`ml-2 font-normal ${ativa ? 'text-white/70' : 'text-ink-water'}`}
            >
              {aba.descricao}
            </span>
          </Link>
        )
      })}
    </div>
  )
}
