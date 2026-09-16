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

/*
 * O NOME DA ABA É O CENÁRIO, e não uma categoria seguida dele.
 *
 * Era "Plano · obras no plano", "Por quê · sem limite de CAPEX na janela": a
 * palavra da frente não acrescentava nada que a frase já não dissesse, e ainda
 * cobrava o dobro da largura — a barra pedia 746 px e a descrição tinha de sumir
 * abaixo de `lg`, deixando o celular com três rótulos genéricos. Sem ela, cabe
 * inteira em toda largura e diz mais.
 *
 * SÓ UMA DELAS COMEÇA COM "E SE", e é o que separa as duas de orçamento. Por um
 * tempo as duas começavam assim ("e se não tivesse limite" × "e se o CAPEX
 * fosse maior") e ficavam confundíveis: a distinção inteira morava em "não
 * tivesse limite" contra "fosse maior". Hoje uma faz pergunta aberta e a outra
 * descreve um cenário FECHADO — a mesma janela, sem teto.
 *
 * A ORDEM VAI DO PRÓXIMO AO DISTANTE: o plano que existe, depois o MESMO plano
 * visto por cidade, depois o orçamento um pouco maior, e por fim o cenário sem
 * teto nenhum. As duas primeiras falam do plano REAL; as duas últimas, de
 * planos que não existem. As do meio somem fora do nível da rodada, e as duas
 * que ficam continuam nessa mesma escada.
 */
const ABAS: {
  id: AbaResultado
  rotulo: string
  /** Só no nível 1 (`/resultados/{runId}`). */
  soNaRodada?: boolean
  /** Some também quando a rodada É uma variação. */
  semVariacao?: boolean
}[] = [
  { id: 'plano', rotulo: 'Obras no plano' },
  // SÓ NO NÍVEL DA RODADA, mas VALE PARA VARIAÇÃO: o mapa compara as cidades
  // da rodada ENTRE SI, e uma variação tem cidades como qualquer outra. Não
  // desce porque no nível 2 há uma cidade só — e aí o mapa não compara nada.
  { id: 'mapa', rotulo: 'Mapeamento por Cidade', soNaRodada: true },
  // SÓ NO NÍVEL DA RODADA. A curva é do orçamento inteiro; não há sensibilidade
  // de uma cidade nem de uma obra. Mostrar a aba lá e abrir uma tela vazia seria
  // pior que não a mostrar — ela prometeria uma resposta que não existe.
  { id: 'sensibilidade', rotulo: 'E se o CAPEX fosse maior', soNaRodada: true, semVariacao: true },
  { id: 'porque', rotulo: 'Sem limite de CAPEX na janela' },
]

export function AbasResultado({ ehVariacao = false }: { ehVariacao?: boolean }) {
  const [params] = useSearchParams()
  const { pathname } = useLocation()
  const naRodada = ehNivelDaRodada(pathname)
  /* A Sensibilidade existe no nível da rodada, e só quando a rodada é um plano
     de verdade. Uma VARIAÇÃO é um ponto da curva de outra — ela tem plano, obras
     e explicabilidade próprios, mas não tem análise própria a oferecer.

     O Mapeamento não tem essa segunda condição: variação tem cidades, e o mapa
     delas responde tanto quanto o da rodada de origem. */
  const temSensibilidade = naRodada && !ehVariacao
  const atual = lerAba(params, { sensibilidade: temSensibilidade, mapa: naRodada })
  const visiveis = ABAS.filter(
    (a) => (!a.soNaRodada || naRodada) && (!a.semVariacao || !ehVariacao),
  )

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
      /* ROLA NO EIXO X EM VEZ DE QUEBRAR: as três frases somam 630 px e o
         celular tem 390. Barra de abas que quebra em duas linhas deixa de
         parecer uma barra — cada pílula vira um botão solto —, enquanto rolar é
         o gesto que a forma já sugere. `max-w-full` para o `inline-flex` não
         ignorar o limite do pai, e o scrollbar fica escondido porque as pílulas
         cortadas na borda já dizem que há mais. */
      className="mb-5 flex max-w-full gap-1 overflow-x-auto rounded-full border border-ink-200 bg-white p-1 shadow-soft [scrollbar-width:none] lg:inline-flex [&::-webkit-scrollbar]:hidden"
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
            onFocus={(e) =>
              e.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest' })
            }
            className={`shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-[13.5px] font-bold transition-colors duration-hover ease-saida ${
              ativa
                ? 'bg-water-600 text-white'
                : 'text-ink-600 hover:bg-water-50 hover:text-ink-900'
            }`}
          >
            {aba.rotulo}
          </Link>
        )
      })}
    </div>
  )
}
