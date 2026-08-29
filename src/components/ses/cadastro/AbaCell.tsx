import { useEffect, useRef } from 'react'
import { CIDADE_EDITAVEL_EM, PLACEHOLDER, SELECTS } from '../../../data/cadastroUnidade/schema'
import { computeCalc } from '../../../domain/calc'
import { opcoesDaCelula, rotuloNo, type Dados } from '../../../domain/fluxo'
import type { Cidade, Origem, Row } from '../../../data/cadastroUnidade/types'

/**
 * As duas colunas de NOME do Fluxo de escoamento não vêm mais do Databricks: são
 * escritas junto com o código escolhido ao lado (ver `espelharColunas`). Continuam
 * travadas — o que 'db' faz na tela é o certo — mas o tooltip padrão de 'db'
 * ("para corrigir, altere na origem") mandaria a pessoa procurar no Databricks um
 * valor que ela acabou de escolher dois campos à esquerda.
 */
const COLUNAS_ESPELHO = new Set(['componente_sistema_nome', 'componente_sistema_nome_jusante'])

interface AbaCellProps {
  abaKey: string
  col: string
  origem: Origem
  row: Row
  /**
   * Cidades da unidade, para o select de `cidade_id`. Chega por prop (e não de
   * uma constante importada) porque a lista é real e varia por unidade — ver
   * `UnidadeState.cidades`.
   */
  cidades: Cidade[]
  /**
   * O CADASTRO INTEIRO — o encanamento que os itens 21 e 22 exigiram.
   *
   * Uma célula que só enxerga a própria linha bastava até 07/08/2026. Deixou de
   * bastar em duas frentes ao mesmo tempo: o sistema da CTS é derivado de OUTRA
   * ABA (item 21), e as opções do destino no Fluxo dependem de quem são as outras
   * sub-bacias, as CTS e as ETEs (item 22). Como é o mesmo encanamento, os dois
   * itens foram feitos juntos — separados, seria descer `dados` por
   * `CadastroWizard` → `AbaGrid` → `AbaCell` duas vezes.
   */
  dados: Dados
  onChange: (col: string, value: string) => void
  /**
   * Célula fora do modo de edição. O campo continua desenhado igual e ainda
   * recebe foco (é assim que a navegação por setas "acende" a célula certa),
   * mas não aceita digitação: quem trata a tecla é o grid, que decide entre
   * andar para a célula vizinha e começar a editar. Copiar/colar também é do
   * grid — ele opera sobre a seleção, que pode ser bem maior que uma célula.
   */
  somenteLeitura?: boolean
  /**
   * SEM PERMISSÃO DE EDITAR — e a razão de esta prop existir separada de
   * `somenteLeitura` é um travamento real, achado em 20/08/2026.
   *
   * As duas nasceram misturadas: o `<select>` usava `somenteLeitura` no
   * `disabled`, com o comentário "escolher já É a edição" logo ao lado. Mas
   * `somenteLeitura` é `!permitida || !(focada && editando)` — ele carrega
   * PERMISSÃO **e** o estado de foco/edição da grade. Num `<select>`, misturar as
   * duas produz um impasse fechado:
   *
   *   o select está `disabled` porque a célula não está em edição
   *     → e um controle desabilitado NÃO deixa o clique borbulhar
   *       → então o `onMouseDown`/`onDoubleClick` do `<td>` nunca dispara
   *         → a célula nunca entra em edição
   *           → o select nunca habilita.
   *
   * Resultado prático: com o mouse, NENHUMA célula de lista suspensa do cadastro
   * era alcançável — nem para um administrador da holding. Só pelo teclado
   * (clicar numa célula de texto, andar com as setas, Enter), o que ninguém
   * descobre sozinho.
   *
   * Então: `<select>` desabilita por PERMISSÃO (esta prop) e nada mais — que é o
   * que o comentário do controle sempre disse. `somenteLeitura` continua valendo
   * para o campo de TEXTO, onde ele significa "quem trata a tecla é o grid".
   *
   * O padrão é `somenteLeitura` de propósito: quem esquecer de passar a prop
   * cai no comportamento antigo (fecha demais), nunca no aberto.
   */
  bloqueada?: boolean
  /**
   * Coluna cujos valores são números — detectada pelos dados em `AbaGrid`
   * (`ehColunaNumerica`), não declarada no schema. Alinha à direita em mono
   * tabular, que é o que deixa ordem de grandeza comparável na vertical.
   */
  numerica?: boolean
}

const CAMPOS_SO_ETE_NOVA = ['capex_terreno', 'modulos']

/**
 * O VOLUME DA COR BAIXOU (11/08/2026), e o mapa continua de pé.
 *
 * Os quatro fundos por origem — azul Databricks, cinza calculado, âmbar a
 * preencher, branco preenchido — são o mapa visual de "o que falta", e o
 * `DEPARA-REDESIGN-CADASTRO.md` os lista como item a PRESERVAR (§3.2, item 5).
 * Não saíram, e não devem sair.
 *
 * O que estava errado era a INTENSIDADE. Preenchimento chapado em toda célula,
 * numa aba de 22 colunas, satura a tela inteira: quando toda célula tem cor,
 * nenhuma cor chama atenção — e a célula em foco, que é a única que precisa ser
 * inconfundível, competia com 500 retângulos coloridos.
 *
 * Então cada estado ficou com a menor tinta que ainda o comunica:
 *   db    → lavada de azul + texto recuado. O selo DB no cabeçalho já diz de
 *           quem é a coluna; a célula só precisa não parecer editável.
 *   calc  → cinza claro + semibold. O peso faz o trabalho que a borda fazia.
 *   vazio → âmbar translúcido em vez de chapado. É o único estado por CÉLULA
 *           (os outros são por coluna), então é o que mais precisa saltar — e
 *           agora salta, porque é o único com cor forte na tela.
 *   cheio → branco com borda neutra. Era borda turquesa, que marcava o estado
 *           MAIS COMUM da grade: justamente o que não precisa de marca.
 */
const CELULA_BASE = 'rounded-md px-2 py-1 text-sm w-full min-w-0 border transition-colors duration-hover ease-saida'
/** Alinhamento de coluna numérica — ver `AbaCellProps.numerica`. */
const CELULA_NUM = 'text-right font-mono tabular-nums text-[12.5px]'
/**
 * CÓDIGO — `cts_002`, `d1b1_1_1`, `d1s1`. Mono, e alinhado à esquerda.
 *
 * Não é enfeite: código é feito para ser COMPARADO caractere a caractere, e é
 * isso que as pessoas fazem com ele o dia inteiro nesta grade — conferir se a
 * linha é a `d1b1_1_1` ou a `d1b1_1_2`, procurar um id que veio da planilha,
 * colar um da topologia. Em proporcional, `l`/`1`/`I` e `0`/`O` colapsam, e a
 * largura variável impede o olho de usar a POSIÇÃO como pista. Em mono os
 * caracteres se alinham na vertical e a diferença salta.
 *
 * Sem `tabular-nums` de propósito: isto é texto, não número, e o alinhamento
 * continua à esquerda — código não tem ordem de grandeza para comparar.
 */
const CELULA_CODIGO = 'font-mono text-[12.5px] tracking-[-.01em]'

/**
 * A coluna guarda um código?
 *
 * Derivado do NOME, e não declarado no schema, pela mesma razão de
 * `ehColunaNumerica` viver nos dados: as 15 abas são as 15 tabelas do backend
 * com os mesmos nomes de coluna, e ali `_id` é a convenção do modelo inteiro.
 * Declarar coluna por coluna seria uma lista para envelhecer a cada tabela nova.
 *
 * `_name` fica de FORA: nome de componente é texto que se lê, não código que se
 * compara — e em mono ele fica largo e piora a leitura numa grade estreita.
 */
export function ehColunaDeCodigo(col: string): boolean {
  return col.endsWith('_id')
}
/**
 * Célula em modo de LEITURA. Repete `px-2 py-1` e a borda de 1px (transparente)
 * do campo de propósito: com a mesma caixa, o texto não pula de lugar no instante
 * em que a célula entra em edição e o `<input>` toma o lugar dele.
 */
const TEXTO_BASE = 'px-2 py-1 text-sm border border-transparent'

/**
 * TEXTO, E NÃO CAMPO, FORA DA EDIÇÃO (11/08/2026) — a mudança mais profunda da
 * grade, e a que motivou todas as outras.
 *
 * Antes, cada célula era um `<input>`: as editáveis, as travadas do Databricks e
 * as calculadas. Numa aba de 22 colunas e 1.047 linhas isso são ~23 mil inputs
 * no DOM — caro de montar, caro de manter, e visualmente uma parede de
 * retângulos onde nenhum deles significa nada. Um campo de formulário promete
 * "digite aqui"; em célula travada a promessa é falsa.
 *
 * Agora o campo só existe onde ele é verdade: na célula em edição. As outras são
 * um `<span>` com o mesmo alinhamento e o mesmo tamanho, dentro do mesmo `<td>`.
 *
 * O QUE ISSO QUASE QUEBROU, e como ficou resolvido: o teclado e o colar da grade
 * dependem de o evento borbulhar de um elemento FOCADO até o container. Sem
 * input, não havia o que focar. A saída foi dar `tabIndex={-1}` ao `<td>` e
 * ensinar o `focarNoDom` (useSelecaoGrade) a focar a célula quando não há campo
 * dentro dela. É o padrão de grid: a célula é o alvo, o editor é temporário.
 *
 * OS `<select>` FICARAM DE FORA disto de propósito. Neles, escolher já É a
 * edição: não há texto para navegar dentro, e transformá-los em texto obrigaria
 * dois passos (entrar em edição, depois escolher) para o que hoje é um clique.
 * São minoria das colunas, e a seta do controle já os anuncia como diferentes.
 */
function Texto({ valor, placeholder, classe, titulo }: {
  valor: string
  placeholder?: string
  classe: string
  titulo?: string
}) {
  const vazio = valor === ''
  return (
    <span
      title={titulo}
      // `block` + `truncate`: a célula tem largura fixa (`colgroup`), e valor
      // longo tem de cortar com reticências em vez de empurrar a coluna.
      className={`block truncate ${classe} ${vazio ? 'italic text-ink-300' : ''}`}
    >
      {vazio ? placeholder ?? '—' : valor}
    </span>
  )
}

/**
 * O editor: existe só enquanto a célula está em edição.
 *
 * `autoFocus` mais o cursor no fim, e as duas coisas são necessárias. O campo
 * nasce agora, então precisa pedir o foco (o `focarNoDom` só encontra o que já
 * está no DOM). E o cursor tem de ir para o FIM porque a entrada mais comum é
 * "digitar sobre a célula": o grid já gravou o primeiro caractere, e o cursor no
 * início faria o segundo caractere aparecer antes dele — 'as' saía 'sa'.
 */
function CampoEdicao({ valor, placeholder, classe, onChange }: {
  valor: string
  placeholder?: string
  classe: string
  onChange: (v: string) => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  }, [])
  return (
    <input
      ref={ref}
      value={valor}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={classe}
    />
  )
}

export function AbaCell({ abaKey, col, origem, row, cidades, dados, onChange, somenteLeitura = false, bloqueada = somenteLeitura, numerica = false }: AbaCellProps) {
  const v = row[col] ?? ''
  // Numérica vence: uma coluna que termina em `_id` mas guarda número (o ano,
  // por exemplo) já é comparada por grandeza, e o alinhamento à direita é a
  // pista mais forte das duas.
  const num = numerica ? ` ${CELULA_NUM}` : ehColunaDeCodigo(col) ? ` ${CELULA_CODIGO}` : ''

  if (abaKey === 'ete-capex' && CAMPOS_SO_ETE_NOVA.includes(col) && row.nova !== 'Sim') {
    return (
      <Texto
        valor="—"
        titulo="Só se aplica a ETE nova"
        classe={`${TEXTO_BASE}${num} text-center text-ink-300`}
      />
    )
  }

  if (origem === 'calc') {
    return (
      <Texto
        valor={String(computeCalc(col, row, { abaKey, dados }) ?? '')}
        // TRÊS RAZÕES DIFERENTES para uma célula estar travada, e o tooltip
        // precisa dizer qual — quem passa o mouse quer saber por que não pode
        // digitar ali, e "campo calculado" responde só a primeira delas.
        //
        //   unidade de medida → não é conta: é o padrão do componente
        //     (Rede → m, EEE → L/s), fixado com a Aegea.
        //   sistema da CTS → não é conta nem padrão: é lido do destino que a CTS
        //     tem no Fluxo de escoamento (item 21). Sem essa frase, a célula com
        //     '—' parece dado que não carregou, e o caminho para resolvê-la fica
        //     invisível.
        //   o resto → derivadas de verdade, que o motor recalcula.
        titulo={
          col === 'unidade'
            ? 'Unidade de medida padrão do componente — fixa, não se edita'
            : abaKey === 'cts-operacional' && (col === 'sistema_id' || col === 'sistema_name')
              ? 'Derivado do destino desta CTS no Fluxo de escoamento — escolha o destino lá e o sistema aparece aqui'
              : 'Campo calculado — o motor recalcula e ignora o valor gravado'
        }
        classe={`${TEXTO_BASE}${num} rounded-md bg-ink-50 font-semibold text-ink-700`}
      />
    )
  }

  /**
   * Coluna do Databricks é SOMENTE LEITURA no site.
   *
   * Decisão da sessão de 30/07/2026 com a Aegea: esses campos se corrigem na
   * origem, no Databricks, nunca aqui — um valor digitado na tela seria
   * sobrescrito na próxima carga, e nesse intervalo a unidade teria trabalhado
   * sobre um número que o motor não vai ler. Onde o dado ainda não chegou, a
   * célula fica VAZIA de propósito: o vazio é o recado de que falta integração,
   * e mascará-lo com um campo editável é que seria o erro.
   *
   * A exceção é a cidade nas abas cujas linhas a unidade cria (ver
   * `CIDADE_EDITAVEL_EM`) — lá não existe linha no Databricks para herdar.
   */
  const cidadeEditavel = col === 'cidade_id' && CIDADE_EDITAVEL_EM.includes(abaKey)
  if (origem === 'db' && !cidadeEditavel) {
    return (
      <Texto
        valor={v}
        placeholder="—"
        titulo={
          COLUNAS_ESPELHO.has(col)
            ? 'Preenchido junto com o código ao lado — escolha o código e o nome acompanha'
            : v === ''
              ? 'Vem do Databricks e ainda não foi carregado. Preenchimento é na origem, não aqui.'
              : 'Vem do Databricks — para corrigir, altere na origem'
        }
        classe={`${TEXTO_BASE}${num} rounded-md bg-water-50/60 text-ink-500`}
      />
    )
  }

  // Daqui para baixo só sobra o que a unidade preenche: 'calc' e 'db' já
  // retornaram acima, cada um com seu campo travado.
  // Foco em NAVY, e não no turquesa de antes: o turquesa translúcido é a cor da
  // SELEÇÃO (a camada sobre o intervalo de Shift+setas). Com os dois na mesma
  // família era preciso olhar duas vezes para saber qual célula recebe o que for
  // digitado. Agora foco e seleção são cores diferentes de coisas diferentes.
  const cls = `${CELULA_BASE}${num} outline-none ${
    v === '' ? 'border-amber-300/60 bg-amber-400/10' : 'border-ink-200 bg-white'
  } focus:border-water-600 focus:ring-2 focus:ring-water-600/25`

  /**
   * LISTA SUSPENSA DINÂMICA — item 22, e a primeira célula do cadastro cujas
   * opções não são fixas.
   *
   * `SELECTS` é um mapa por coluna, com opções cravadas no código ("Sim"/"Não").
   * Serviu para tudo até aqui porque toda escolha do cadastro era de um conjunto
   * fechado. O destino do Fluxo não é: as opções dependem da LINHA (quem é a
   * origem) e de OUTRAS ABAS (quais sub-bacias, CTS e ETEs existem, e em que
   * sistema). A regra inteira vive em `cadastroFluxo.ts`; aqui é só o desenho.
   *
   * CÓDIGO PRIMEIRO no rótulo ('b004 · Canal do Cunha') — mesma decisão já tomada
   * no select de cidade, e pelo mesmo motivo mecânico: o `<select>` nativo exibe
   * o rótulo INTEIRO da opção escolhida quando fechado, e numa coluna de 84px o
   * nome à frente empurraria o código para fora. O nome fica no rótulo porque é
   * por ele que se escolhe — ninguém reconhece uma sub-bacia por 'b004'.
   *
   * A OPÇÃO VAZIA continua na lista de propósito: é como se apaga um destino
   * escolhido por engano. Sem ela, a única saída seria apagar a linha inteira.
   */
  const opcoes = opcoesDaCelula(dados, abaKey, col, row)
  if (opcoes) {
    return (
      <select
        value={v}
        onChange={(e) => onChange(col, e.target.value)}
        disabled={bloqueada}
        className={`${cls} w-full min-w-0 disabled:cursor-not-allowed disabled:opacity-70`}
      >
        <option value="">—</option>
        {/* O VALOR ATUAL SEMPRE APARECE, mesmo fora da lista — e ele fica fora
            com frequência, não por exceção: a lista de origens exclui tudo que
            já é origem de alguma linha, e isso inclui a própria linha. Sem esta
            opção, as 221 linhas que o cadastro já traz preenchidas mostrariam um
            `<select>` em branco, e quem abrisse a aba concluiria que os dados se
            perderam.

            O outro caso é o destino que deixou de ser válido depois de escolhido
            (a origem mudou de sistema). Aí ele continua visível de propósito, e
            quem diz que está errado é a validação de topologia — esconder o valor
            seria apagar a evidência do problema. */}
        {v !== '' && !opcoes.some(([val]) => val === v) && (
          <option value={v}>{rotuloNo(dados, v)}</option>
        )}
        {opcoes.map(([val, label]) => (
          <option key={val} value={val}>{label}</option>
        ))}
      </select>
    )
  }

  // Os <select> não trocam texto por campo de edição (`Texto` vs. `CampoEdicao`):
  // a lista de opções é curta e fechada, então escolher já É a edição — não há
  // texto para navegar dentro. Mas `somenteLeitura` ainda desabilita o
  // controle: essa prop também carrega PERMISSÃO agora (N7/N8), não só o
  // estado de foco/edição, e sem `disabled` aqui a pessoa sem permissão
  // continuaria escolhendo uma opção que o servidor ia recusar salvar.
  if (SELECTS[col]) {
    return (
      <select
        value={v}
        onChange={(e) => onChange(col, e.target.value)}
        disabled={bloqueada}
        className={`${cls} w-full min-w-0 disabled:cursor-not-allowed disabled:opacity-70`}
      >
        <option value="">—</option>
        {SELECTS[col].map(([val, label]) => (
          <option key={val} value={val}>{label}</option>
        ))}
      </select>
    )
  }

  if (cidadeEditavel) {
    return (
      <select
        value={v}
        onChange={(e) => onChange(col, e.target.value)}
        disabled={bloqueada}
        className={`${cls} w-full min-w-0 disabled:cursor-not-allowed disabled:opacity-70`}
      >
        <option value="">—</option>
        {/* CÓDIGO PRIMEIRO, nome depois — e a ordem é o ponto.
            O <select> nativo não separa o que mostra fechado do que lista
            aberto: fechado ele exibe o rótulo da opção escolhida. Com o nome à
            frente ('BELFORD ROXO · c001'), a coluna "ID Cidade" mostrava
            'BELFORD' truncado e o id sumia — exatamente o que a coluna existe
            para mostrar. Invertido, o código aparece inteiro mesmo cortado.
            O nome continua no rótulo porque é por ele que se escolhe: uma
            lista de c001…c045 seria impossível de usar. E ele não faz falta
            depois de escolhido — a coluna Cidade ao lado se preenche sozinha
            (ver `ABAS_COM_CIDADE` em CadastroContext). */}
        {cidades.map((c) => (
          <option key={c.id} value={c.id}>{c.id} · {c.name}</option>
        ))}
      </select>
    )
  }

  /**
   * O CAMINHO NORMAL da grade: fora de edição isto é texto, não campo.
   *
   * A versão anterior mantinha o `<input>` sempre montado e apenas escondia o
   * cursor, e a razão era mecânica: `readOnly` impede o navegador de disparar
   * `paste`, e era do input focado que o evento subia até o container. Isso
   * deixou de ser necessário — o `<td>` agora é focável (`tabIndex={-1}`) e o
   * `focarNoDom` foca a célula quando não há campo dentro dela, então o colar
   * sobre a seleção continua funcionando sem 23 mil inputs no DOM.
   */
  if (somenteLeitura) {
    return (
      <Texto
        valor={v}
        placeholder={PLACEHOLDER[col]}
        classe={`${TEXTO_BASE}${num} rounded-md ${
          v === '' ? 'border-amber-300/60 bg-amber-400/10' : ''
        }`}
      />
    )
  }

  return (
    <CampoEdicao
      valor={v}
      placeholder={PLACEHOLDER[col] ?? ''}
      onChange={(novo) => onChange(col, novo)}
      classe={`${cls} w-full min-w-0`}
    />
  )
}
