import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Estado } from '@/rodada/components/Estado'
import { useCidadesCompletas } from '@/rodada/api/queries'
import { MapaCidades } from '@/rodada/mapa/MapaCidades'
import type { AncoraNoMapa, DadoDaCidade } from '@/rodada/mapa/MapaCidades'
import { CartaoDaCidade, CartaoFlutuante } from '@/rodada/mapa/CartaoDaCidade'
import { useEstadoDaBancada } from '@/rodada/mapa/estadoNaUrl'
import { CAMADAS, CAMADA_POR_CHAVE } from '@/rodada/mapa/camadas'
import type { Camada, Contexto } from '@/rodada/mapa/camadas'
import {
  COR_REPOUSO,
  COR_ZERO,
  NEGATIVO,
  RAMPA,
  degrau,
  elevacao,
  normalizar,
} from '@/rodada/mapa/escala'
import { Legenda } from '@/rodada/mapa/Legenda'
import { useTemaResultados } from '@/rodada/mapa/temaResultados'
import type { TemaResultados } from '@/rodada/mapa/temaResultados'
import type { CidadeLinha } from '@/rodada/domain/resultado'

/**
 * MAPEAMENTO POR CIDADE — a aba que compara as cidades da rodada entre si.
 *
 * ## A REGRA QUE DECIDE O QUE VEM PARA CÁ
 *
 * **Dado de cidade mora aqui; dado da rodada mora em "Obras no plano".** É a
 * mesma regra que a bancada de `/resultados_refactor` já seguia (§7.1 do
 * `RELATORIO-DADOS-POR-CIDADE-MAPA.md`), agora aplicada de verdade: enquanto
 * esta tela era uma rota própria, ela precisava repetir o painel da rodada
 * inteiro — cronograma, fluxo de escoamento, desembolso, EBITDA, elementos —
 * só para não ser uma tela pela metade. Como ABA, ela não precisa: aquele
 * painel está a um clique de distância, na aba ao lado, e duplicá-lo aqui
 * seria pedir para as duas divergirem.
 *
 * O que sobra é o que só existe por cidade: o mapa, o ranking e o cartão.
 *
 * ## O MAPA É A PORTA DE ENTRADA QUE FALTAVA
 *
 * A `Global.tsx` tinha uma seção "Cidades" (cobertura × meta por cidade e os
 * cartões para descer de nível) e ela saiu, com a justificativa de que descer
 * para uma cidade era papel da árvore de escopo, à esquerda. Só que a árvore
 * saiu junto, e o nível 1 ficou sem NENHUM caminho para o nível 2. Esta aba é
 * esse caminho: clicar num polígono abre o cartão da cidade, e o cartão tem o
 * botão que leva à tela dela.
 *
 * ## O ESTADO MORA NA URL
 *
 * Camada, ano, cidade do cartão e cidade comparada vivem em
 * `?camada=…&ano=…&cidade=…&vs=…` (ver `estadoNaUrl.ts`), ao lado do `?aba=mapa`
 * que trouxe a pessoa até aqui — os dois convivem porque `estadoNaUrl` escreve
 * pela forma de função do `setSearchParams`, que preserva o que não é dele.
 * Esta é uma tela de print: o uso real é achar uma leitura e mandá-la para
 * alguém, e o link tem de abrir onde a frase aponta.
 */
export function PainelMapeamento({ runId }: { runId: string }) {
  // Completadas pelo detalhe de cada uma: é de lá que vêm a curva de cobertura,
  // as metas e o CAPEX por ano neste backend (ver `completarCidades.ts`).
  const cidades = useCidadesCompletas(runId)
  const navegar = useNavigate()

  const {
    chave,
    ano,
    cidade,
    versus,
    escolherCamada,
    escolherAno,
    abrirCidade,
    fecharCartao,
    compararCom,
  } = useEstadoDaBancada()

  /**
   * O realce é UM SÓ para o mapa e o ranking, e mora aqui em cima dos dois.
   *
   * É o que faz as duas metades serem a mesma leitura: passar o mouse num
   * polígono acende a linha correspondente, e vice-versa. Com estado local em
   * cada componente elas viram painéis que por acaso mostram o mesmo dado — e
   * achar "Duas Barras" no mapa passa a ser um exercício de geografia
   * fluminense.
   *
   * NÃO vai para a URL, ao contrário dos quatro acima: ele muda dezenas de
   * vezes por segundo, e ali seria um `replaceState` por pixel de mouse.
   */
  const [ativa, setAtiva] = useState<string | null>(null)
  /**
   * ONDE O CARTÃO SE ANCORA — pixels, não identidade.
   *
   * Fica de fora da URL de propósito: é uma medida da caixa do mapa NESTA
   * janela, e um link que a carregasse posicionaria o cartão pelo tamanho da
   * tela de quem o mandou. `null` (o caso de um link colado, do ranking ou do
   * teclado) é um estado legítimo — o cartão assenta no canto.
   */
  const [ancora, setAncora] = useState<AncoraNoMapa | null>(null)

  const camada = CAMADA_POR_CHAVE.get(chave) ?? CAMADAS[0]
  const lista = useMemo(() => cidades.data ?? [], [cidades.data])
  const ctx: Contexto = useMemo(() => ({ ano }), [ano])
  const pintura = usePintura(lista, camada, ctx)
  const tema = useTemaResultados()

  /**
   * OS ANOS QUE DÃO PARA RECORTAR saem das próprias cidades.
   *
   * A união de `capexPorAno` de todas elas, e não uma consulta nova: são
   * exatamente os anos em que existe CAPEX de cidade para pintar, que é o que
   * o recorte faz. Servidor antigo não manda o campo — a lista sai vazia e o
   * seletor não aparece, em vez de oferecer anos que não pintam nada.
   */
  const anosComCapex = useMemo(() => {
    const vistos = new Set<number>()
    for (const c of lista) for (const a of c.capexPorAno ?? []) vistos.add(a.ano)
    return [...vistos].sort((a, b) => a - b)
  }, [lista])

  const selecionada = useMemo(() => lista.find((c) => c.id === cidade) ?? null, [lista, cidade])
  const comparada = useMemo(() => lista.find((c) => c.id === versus) ?? null, [lista, versus])

  /**
   * Clicar de novo na cidade que já está aberta FECHA o cartão.
   *
   * É a saída que não depende de mirar num alvo pequeno (o X) nem de saber
   * que Esc funciona: o mesmo gesto que abriu, desfaz. Fica no lugar de um
   * "clique fora" via listener no documento — aquele conflita com o clique num
   * SEGUNDO polígono, que precisa fechar e abrir na mesma interação e acabaria
   * disputando a ordem entre `mousedown` e `click`.
   */
  const abrirComAncora = useCallback(
    (id: string, onde: AncoraNoMapa | null) => {
      if (id === cidade) {
        fecharCartao()
        return
      }
      setAncora(onde)
      abrirCidade(id)
    },
    [abrirCidade, fecharCartao, cidade],
  )

  /**
   * Embrulhado, e não uma arrow no JSX: `CartaoDaCidade` é `memo`, e uma
   * função nova a cada render anularia a memoização — que é justamente o que
   * impede os gráficos dele de reconciliar a cada movimento do mouse sobre o
   * mapa. Ver o comentário do `memo` em `CartaoDaCidade.tsx`.
   */
  const abrirDetalhes = useCallback(() => {
    if (!cidade) return
    navegar(`/resultados/${runId}/cidades/${encodeURIComponent(cidade)}`)
  }, [navegar, runId, cidade])

  /**
   * O TECLADO FOLHEIA O RANKING — e é o que transforma comparar dezenove
   * cidades em dezenove teclas, em vez de dezenove caçadas ao polígono certo.
   *
   * A ordem percorrida é a do RANKING (`pintura.ordenadas`), não a
   * alfabética nem a da malha: com o cartão aberto na 3ª colocada, "seta para
   * baixo" tem de levar à 4ª. É o gesto de descer a lista.
   *
   * O `<select>` do cartão usa as setas para o que elas fazem num `<select>`,
   * então qualquer tecla vinda de um controle de formulário é devolvida ao
   * controle. Sem isto, escolher a camada pelo teclado trocaria a cidade.
   */
  useEffect(() => {
    if (!selecionada) return
    const aoTeclar = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement | null
      if (alvo && /^(INPUT|SELECT|TEXTAREA)$/.test(alvo.tagName)) return
      if (e.key === 'Escape') {
        fecharCartao()
        return
      }
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
      const ordem = pintura.ordenadas
      const i = ordem.findIndex((c) => c.id === selecionada.id)
      if (i < 0) return
      const proximo = ordem[i + (e.key === 'ArrowDown' ? 1 : -1)]
      if (!proximo) return
      e.preventDefault()
      // A âncora morre na troca por teclado: a nova cidade está noutro ponto do
      // mapa, e manter a posição antiga faria o cartão apontar para o município
      // errado. `null` o manda para o canto, que é honesto.
      setAncora(null)
      setAtiva(proximo.id)
      abrirCidade(proximo.id)
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [selecionada, pintura.ordenadas, abrirCidade, fecharCartao])

  /**
   * `rr-tela` + `rr-claro`/`rr-noturno` NÃO SÃO POSTAS AQUI — desde
   * 09/09/2026 quem veste essas classes é `AppLayout`, no `<html>`
   * (`useTemaResultadosNoDocumento`), porque o pedido passou a ser a TELA
   * INTEIRA, Header e Footer inclusive, e não só esta subárvore. As classes
   * continuam existindo e resolvendo exatamente as mesmas regras — inclusive
   * `.rr-ilha-mapa` e as variáveis `--mapa-*` que este painel usa — só que
   * herdadas de um ancestral mais alto em vez de declaradas aqui.
   */
  return (
    <div className="relative w-full">
      <Estado
        consulta={cidades}
        rotulo="Carregando as cidades da rodada…"
        tituloErro="Não foi possível carregar as cidades."
        vazio={{
          checar: (d) => d.length === 0,
          titulo: 'Esta rodada não tem cidades.',
          texto: 'O resultado foi publicado sem nenhuma cidade — não há o que mapear.',
        }}
      >
        {() => (
          <PainelDoMapa
            camada={camada}
            ano={ano}
            anosComCapex={anosComCapex}
            pintura={pintura}
            ctx={ctx}
            ativa={ativa}
            selecionada={selecionada?.id ?? null}
            comparada={comparada?.id ?? null}
            aoPairar={setAtiva}
            aoEscolherCamada={escolherCamada}
            aoEscolherAno={escolherAno}
            aoAbrirCidade={abrirComAncora}
            cidades={lista}
            tema={tema}
            cartao={
              selecionada && (
                <CartaoFlutuante ancora={ancora}>
                  <CartaoDaCidade
                    /* A CHAVE É A CIDADE, e isso é o que zera o estado
                       interno do cartão ao folhear com as setas: sem
                       ela, o React reusaria a instância e a barra de
                       rolagem ficaria onde estava na cidade anterior. */
                    key={selecionada.id}
                    runId={runId}
                    cidade={selecionada}
                    comparada={comparada}
                    todas={lista}
                    camada={camada}
                    ctx={ctx}
                    faixa={pintura.faixa}
                    aoEscolherCamada={escolherCamada}
                    aoCompararCom={compararCom}
                    aoFechar={fecharCartao}
                    aoAbrirDetalhes={abrirDetalhes}
                  />
                </CartaoFlutuante>
              )
            }
          />
        )}
      </Estado>
    </div>
  )
}

type Pintura = ReturnType<typeof usePintura>

/**
 * O MAPA — escuro nos dois temas da rota, ranking à parte.
 *
 * Até 29/08/2026 mapa e ranking dividiam uma peça só (`rounded-2xl
 * shadow-band`, chão `--mapa-chao`). No tema ESCURO da rota ela sumiu de
 * verdade: o SVG assenta direto no fundo da página, que já é a mesma cor —
 * ver `.rr-ilha-mapa` no `index.css`. No tema CLARO, a mesma classe volta a
 * aparecer como uma ilha, porque as rampas de cor do mapa não têm versão
 * legível sobre branco (validado pela skill `dataviz` — a ponta clara de
 * qualquer rampa Aegea reprova o piso de contraste contra o branco). É
 * physical constraint, não regressão do "solto": no escuro a ilha é
 * invisível por coincidência de cor, não porque deixou de existir.
 *
 * O RANKING sai da ilha — não precisa dela, porque não desenha rampa
 * nenhuma. Vira uma `.carta` comum, clara ou escura conforme o tema, como
 * qualquer outro cartão da página. O vínculo entre os dois continua sendo só
 * o realce recíproco (`ativa`): o halo turquesa no polígono e o fundo tingido
 * na linha do ranking, a mesma cor nos dois — é esse realce, e não uma caixa
 * compartilhada, que faz as duas metades lerem como uma coisa só.
 */
function PainelDoMapa({
  camada,
  ano,
  anosComCapex,
  pintura,
  ctx,
  ativa,
  selecionada,
  comparada,
  aoPairar,
  aoEscolherCamada,
  aoEscolherAno,
  aoAbrirCidade,
  cidades,
  tema,
  cartao,
}: {
  camada: Camada
  ano: number | null
  /** Os anos que têm CAPEX de cidade — a lista que o `SeletorDeAno` oferece. */
  anosComCapex: number[]
  pintura: Pintura
  ctx: Contexto
  ativa: string | null
  selecionada: string | null
  comparada: string | null
  aoPairar: (cidade: string | null) => void
  aoEscolherCamada: (chave: string) => void
  aoEscolherAno: (ano: number | null) => void
  /** A âncora é `null` quando o gesto foi na LISTA — lá não há polígono. */
  aoAbrirCidade: (cidade: string, ancora: AncoraNoMapa | null) => void
  cidades: CidadeLinha[]
  tema: TemaResultados
  /**
   * O cartão vem PRONTO de fora, e não montado aqui.
   *
   * Ele depende de `runId`, do navegador e dos quatro setters da URL — nada
   * disso é assunto do painel do mapa, que sabe desenhar polígono e ranking.
   * Recebê-lo como nó deixa este componente com a única responsabilidade que
   * ele de fato tem sobre o cartão: dizer sobre QUAL superfície ele flutua.
   */
  cartao?: ReactNode
}) {
  /**
   * ESTÁVEL, e por isso a MESMA referência para as dezenove linhas.
   *
   * Antes desta função, `aoAbrir` nascia inline dentro do `.map()` de
   * `<LinhaDoRanking>` (`(id) => aoAbrirCidade(id, null)`) — uma closure
   * NOVA a cada render de `PainelDoMapa`. Mesmo que `LinhaDoRanking` virasse
   * `memo`, receber uma prop de função com identidade diferente a cada hover
   * derrota a memoização sozinho (é o mesmo aviso que `CartaoDaCidade.tsx`
   * já registra sobre si). `useCallback` aqui garante que a prop só muda de
   * referência quando `aoAbrirCidade` muda de verdade — no clique que abre
   * ou fecha o cartão, não a cada `mouseenter`.
   */
  const aoAbrirSemAncora = useCallback((id: string) => aoAbrirCidade(id, null), [aoAbrirCidade])

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_316px]">
        {/* A ILHA: o mapa fica escuro no tema escuro, mas ganha um chão
            branco no claro — ver o comentário de `.rr-ilha-mapa` no
            `index.css`. O seletor mora aqui dentro, e não solto acima da
            grade: as pílulas precisam do MESMO chão do mapa que comandam,
            seja ele qual for. */}
        <div className="rr-ilha-mapa relative min-w-0 p-4 md:p-[18px]">
          <SeletorDeCamada chave={camada.chave} aoEscolher={aoEscolherCamada} tema={tema} />
          {/* O RECORTE POR ANO, logo abaixo da camada que ele recorta.
              Aparece só quando a camada corrente responde ao ano
              (`camada.porAno`) — ver o comentário de `SeletorDeAno`. */}
          <SeletorDeAno
            anos={anosComCapex}
            ano={ano}
            visivel={!!camada.porAno}
            aoEscolher={aoEscolherAno}
            tema={tema}
          />
          <MapaCidades
            dados={pintura.dados}
            cidadesDaRodada={pintura.cidadesDaRodada}
            cidadeAtiva={ativa}
            cidadeSelecionada={selecionada}
            cidadeComparada={comparada}
            aoPairar={aoPairar}
            aoClicar={aoAbrirCidade}
            tema={tema}
          />
          <Legenda camada={camada} faixa={pintura.faixa} semValor={pintura.semValor} tema={tema} />
          {cartao}
        </div>

        {/* O RANKING NÃO é parte da ilha: é uma `.carta` comum, clara ou
            escura conforme o tema, como qualquer outro cartão da tela. */}
        <div className="carta min-w-0 p-4">
          <div className="flex items-baseline justify-between px-1 pb-2.5">
            <strong className="text-[13.5px] font-bold text-ink-800">{camada.rotulo}</strong>
            <span className="font-mono text-[10.5px] text-ink-400">
              {camada.forma === 'repouso'
                ? 'escolha um dado'
                : pintura.semValor
                  ? 'sem dado nesta rodada'
                  : ano == null
                    ? `${pintura.ordenadas.length} cidades`
                    : `recorte de ${ano}`}
            </span>
          </div>
          <ol className="max-h-[560px] overflow-y-auto" onMouseLeave={() => aoPairar(null)}>
            {pintura.ordenadas.map((c, i) => (
              <LinhaDoRanking
                key={c.id}
                posicao={camada.forma === 'repouso' ? null : i + 1}
                cidade={c}
                texto={camada.texto(c, ctx)}
                cor={pintura.corPorCidade.get(c.id)}
                largura={pintura.larguraPorCidade.get(c.id) ?? 0}
                ativa={ativa === c.id}
                selecionada={selecionada === c.id}
                comparada={comparada === c.id}
                aoPairar={aoPairar}
                /* Sem âncora: a lista não tem polígono, e inventar uma
                   posição no mapa a partir de uma linha faria o cartão
                   apontar para um lugar que o gesto não tocou.

                   ESTÁVEL, de propósito — ver o comentário de
                   `aoAbrirSemAncora`, acima: é o que faz `memo` em
                   `LinhaDoRanking` valer a pena. */
                aoAbrir={aoAbrirSemAncora}
              />
            ))}
          </ol>
        </div>
      </div>

      <p className="text-[11px] leading-relaxed text-ink-500">
        O polígono é o MUNICÍPIO inteiro; a unidade atende apenas parte de alguns deles — com
        destaque para o Rio de Janeiro. A área pintada superestima a área de concessão, e o
        preenchimento parcial é uma fração, não um lugar: ele não diz até onde a rede chegou.
      </p>
      <AvisoDeUnidade cidades={cidades} />
    </div>
  )
}

/**
 * TUDO QUE O MAPA E O RANKING PRECISAM, NUMA PASSADA SÓ.
 *
 * Ordenação, faixa da escala, cor, elevação e rótulo saem do mesmo laço porque
 * dependem uns dos outros: a faixa depende dos valores, a cor depende da faixa,
 * a elevação depende da ordem. Calculados em `useMemo` separados, eles se
 * recalculariam em ordens diferentes e o ranking poderia pintar com a faixa do
 * quadro anterior — o tipo de defeito que não trava e não aparece em print.
 */
function usePintura(lista: CidadeLinha[], camada: Camada, ctx: Contexto) {
  return useMemo(() => {
    const comValor = lista
      .map((cidade) => ({ cidade, valor: camada.valor(cidade, ctx) }))
      .filter((x): x is { cidade: CidadeLinha; valor: number } => x.valor != null)

    /**
     * A FAIXA É A DA RODADA, não uma faixa fixa.
     *
     * Uma escala chapada esconderia que quinze das dezenove cidades estão
     * amontoadas numa faixa estreita: o mapa sairia de uma cor só.
     */
    const vs = comValor.map((x) => x.valor)
    const cru = vs.length ? { min: Math.min(...vs), max: Math.max(...vs) } : { min: 0, max: 0 }
    // Na divergente o zero tem de ficar no MEIO, ou a fronteira entre "se paga"
    // e "não se paga" cai num ponto arbitrário da rampa.
    const extremo = Math.max(Math.abs(cru.min), Math.abs(cru.max))
    const faixa = camada.divergente ? { min: -extremo, max: extremo } : cru

    /**
     * A ORDEM DO RANKING SEGUE A CAMADA, e o `inverter` participa: no ano de
     * entrada "primeiro" é o menor número, e um ranking decrescente colocaria a
     * última cidade a ser atendida no topo da lista.
     */
    const ordem = [...comValor].sort((a, b) =>
      camada.forma === 'repouso'
        ? a.cidade.nome.localeCompare(b.cidade.nome)
        : camada.inverter
          ? a.valor - b.valor
          : b.valor - a.valor,
    )

    /** A fração que a barra do ranking e o preenchimento do mapa usam. */
    const fracaoDe = (valor: number) =>
      camada.forma === 'percentual'
        ? Math.max(0, Math.min(1, valor))
        : camada.divergente
          ? Math.abs(valor) / (extremo || 1)
          : normalizar(valor, faixa)

    const dados: DadoDaCidade[] = ordem.map(({ cidade, valor }, i) => {
      const texto = camada.texto(cidade, ctx)

      // Repouso: uma cor só, sem altura, sem número. O mapa afirma pertencimento
      // e mais nada — qualquer gradiente aqui seria uma leitura inventada.
      //
      // `texto: ''`, e não `cidade.nome`: o nome bonito já aparece no rótulo
      // GRANDE dentro do SVG (`m.properties.nome`, o da malha do IBGE). Usar
      // `cidade.nome` aqui repetiria o nome na dica flutuante — só que com o
      // valor CRU que a API devolve (`S.FCO.DO ITABAPOANA`, sem acento e em
      // caixa alta), que é a chave de junção e não um texto para o usuário
      // ler duas vezes ao lado do nome certo.
      if (camada.forma === 'repouso') {
        return { cidade: cidade.id, texto: '', cor: COR_REPOUSO }
      }

      if (camada.forma === 'percentual') {
        /**
         * PERCENTUAL NÃO NORMALIZA PELA FAIXA DA RODADA.
         *
         * A fração É o valor: "60% de cobertura" tem de preencher 60% do
         * município, e não "a posição de 60% entre a menor e a maior cobertura
         * das dezenove" — que é outra afirmação, e a que faria a cidade menos
         * pior da rodada aparecer cheia.
         */
        const fracao = Math.max(0, Math.min(1, valor))
        return { cidade: cidade.id, texto, cor: degrau(fracao, RAMPA), fracao, rotulo: texto }
      }

      const negativo = !!camada.divergente && valor < 0
      const f = fracaoDe(valor)
      const cor = camada.divergente
        ? Math.abs(valor) < extremo * 0.02
          ? COR_ZERO
          : degrau(f, negativo ? NEGATIVO : RAMPA)
        : degrau(camada.inverter ? 1 - f : f, RAMPA)
      return {
        cidade: cidade.id,
        texto,
        cor,
        elevacao: elevacao(i, negativo),
        // A COLOCAÇÃO DENTRO DO MUNICÍPIO. A elevação diz "esta é maior que
        // aquela", mas não diz a quantas posições de distância — o número
        // resolve isso sem tirar os olhos do território.
        rotulo: String(i + 1),
        destacada: i === 0,
      }
    })

    const corPorCidade = new Map(dados.map((d) => [d.cidade, d.cor]))
    // Nunca abaixo de 2%: barra de largura zero some, e a linha parece quebrada
    // em vez de parecer "quase nada".
    const larguraPorCidade = new Map(
      ordem.map(({ cidade, valor }) => [
        cidade.id,
        camada.forma === 'repouso' ? 0 : Math.max(2, 100 * fracaoDe(valor)),
      ]),
    )

    return {
      dados,
      corPorCidade,
      larguraPorCidade,
      ordenadas: ordem.map((x) => x.cidade),
      faixa,
      // TODAS, e não só `comValor`: é o que o mapa usa para decidir quem é da
      // unidade — uma cidade sem valor nesta camada continua sendo da rodada.
      cidadesDaRodada: lista.map((c) => c.id),
      /**
       * NENHUMA CIDADE TEM VALOR NESTA CAMADA — o servidor não mandou o campo.
       * `faixa` vira `{0, 0}` nesse caso, e uma legenda "0 … 0" com "0
       * cidades" seria uma régua falsa: a tela afirmaria uma medida onde não
       * há medida nenhuma. É estado, e a legenda o diz com todas as letras.
       */
      semValor: camada.forma !== 'repouso' && comValor.length === 0,
    }
  }, [lista, camada, ctx])
}

/**
 * O SELETOR — uma fileira só, com TODAS as camadas.
 *
 * É a fileira "mostrar" do protótipo aprovado: repouso, as camadas que também
 * aparecem como KPI lá em cima (VPL, CAPEX, cobertura, metas, obras) e as que
 * só existem por cidade (ganho de cobertura, ligações novas, CAPEX por
 * ligação, retorno por real, ano de entrada) — todas no mesmo lugar, na ordem
 * do catálogo. Nenhuma pertence "mais" ao painel do que outra. Comanda o mapa
 * E o ranking, mas mora DENTRO da ilha escura do mapa — as pílulas são texto
 * claro sobre chão escuro, e no tema claro da rota só a ilha tem esse chão.
 */
function SeletorDeCamada({
  chave,
  aoEscolher,
  tema,
}: {
  chave: string
  aoEscolher: (chave: string) => void
  tema: TemaResultados
}) {
  const claro = tema === 'claro'
  return (
    <div className="mb-3 flex flex-wrap items-center gap-1.5">
      <span
        className={`mr-1 font-mono text-[10px] uppercase tracking-[.12em] ${claro ? 'text-ink-400' : 'text-white/40'}`}
      >
        mostrar
      </span>
      {CAMADAS.map((c) => (
        <button
          key={c.chave}
          type="button"
          onClick={() => aoEscolher(c.chave)}
          aria-pressed={chave === c.chave}
          title={c.nota}
          className={
            'rounded-full border px-3 py-1 text-[11.5px] font-semibold transition-colors duration-hover ease-saida ' +
            (chave === c.chave
              ? `border-[var(--mapa-brilho)] bg-[var(--mapa-brilho)] ${claro ? 'text-white' : 'text-[#04263a]'}`
              : claro
                ? 'border-ink-200 bg-ink-50 text-ink-600 hover:border-ink-300 hover:text-ink-800'
                : 'border-white/20 bg-white/5 text-white/75 hover:border-white/45 hover:text-white')
          }
          style={
            chave === c.chave
              ? { boxShadow: claro ? '0 0 16px rgba(0,113,109,.28)' : '0 0 16px rgba(23,227,203,.28)' }
              : undefined
          }
        >
          {c.rotulo}
        </button>
      ))}
    </div>
  )
}

/**
 * O RECORTE POR ANO — a linha do tempo do mapa.
 *
 * ## POR QUE ELE EXISTE COMO CONTROLE PRÓPRIO
 *
 * Até 04/09/2026 quem recortava o ano era o CRONOGRAMA DE OBRAS: a bancada
 * mostrava o gráfico inteiro e clicar numa barra pintava o CAPEX daquele ano
 * nos polígonos. Funcionava, mas amarrava duas coisas de naturezas
 * diferentes — o cronograma é um quadro da RODADA (e por isso mora em "Obras
 * no plano"), e o recorte é um controle DO MAPA. Trazer o gráfico para esta
 * aba só para ter o controle significaria o mesmo quadro em duas abas, com o
 * risco garantido de as duas divergirem.
 *
 * Então o controle veio, e o gráfico ficou onde é dele. É uma fileira de
 * pílulas ao lado do seletor de camada — o mesmo lugar, o mesmo chão escuro,
 * a mesma forma —, porque as duas respondem à mesma pergunta em sequência:
 * "mostrar o quê" e "de quando".
 *
 * ## `visivel`, E NÃO UM `return null` NO PAI
 *
 * Só a camada de CAPEX responde ao ano (`camada.porAno`). Nas outras cinco o
 * seletor não teria efeito, e um controle que não faz nada é pior que a
 * ausência dele: quem clica e não vê mudança conclui que a tela travou.
 *
 * Mas ele não pode simplesmente DESAPARECER: a fileira ocupa altura, e o mapa
 * subir/descer 34 px ao trocar de camada faz o polígono sob o cursor mudar de
 * lugar no meio da leitura. Então o espaço fica reservado (`invisible`), o
 * conteúdo é que sai — e como `invisible` não tira do fluxo de foco,
 * `aria-hidden` + `tabIndex={-1}` completam o serviço para teclado e leitor
 * de tela.
 *
 * ## ANO QUE SAI DA CAMADA ERRADA NÃO FICA PENDURADO
 *
 * O `ano` mora na URL e sobrevive à troca de camada — o que é o certo (voltar
 * para CAPEX devolve o recorte que a pessoa tinha). O que ele não pode é
 * seguir valendo em silêncio: o ranking já escreve "recorte de 2032" no topo,
 * e é ele que denuncia o estado quando o seletor está escondido.
 */
function SeletorDeAno({
  anos,
  ano,
  visivel,
  aoEscolher,
  tema,
}: {
  anos: number[]
  ano: number | null
  visivel: boolean
  aoEscolher: (ano: number | null) => void
  tema: TemaResultados
}) {
  // Servidor sem `capexPorAno` — nada a oferecer, e aí a fileira não reserva
  // espaço nenhum: não é um controle escondido, é um controle que não existe.
  if (anos.length === 0) return null

  const claro = tema === 'claro'
  const pilula = (ativa: boolean) =>
    'rounded-full border px-2.5 py-1 font-mono text-[11px] tabular-nums transition-colors duration-hover ease-saida ' +
    (ativa
      ? `border-[var(--mapa-brilho)] bg-[var(--mapa-brilho)] ${claro ? 'text-white' : 'text-[#04263a]'}`
      : claro
        ? 'border-ink-200 bg-ink-50 text-ink-600 hover:border-ink-300 hover:text-ink-800'
        : 'border-white/20 bg-white/5 text-white/75 hover:border-white/45 hover:text-white')

  return (
    <div
      className={`mb-3 flex flex-wrap items-center gap-1.5 ${visivel ? '' : 'invisible'}`}
      aria-hidden={!visivel}
    >
      <span
        className={`mr-1 font-mono text-[10px] uppercase tracking-[.12em] ${claro ? 'text-ink-400' : 'text-white/40'}`}
      >
        de quando
      </span>
      <button
        type="button"
        onClick={() => aoEscolher(null)}
        aria-pressed={ano == null}
        tabIndex={visivel ? undefined : -1}
        title="O CAPEX somado de todos os anos do plano"
        className={pilula(ano == null)}
      >
        plano inteiro
      </button>
      {anos.map((a) => (
        <button
          key={a}
          type="button"
          onClick={() => aoEscolher(a)}
          aria-pressed={ano === a}
          tabIndex={visivel ? undefined : -1}
          title={`Só o CAPEX desembolsado em ${a}`}
          className={pilula(ano === a)}
        >
          {a}
        </button>
      ))}
    </div>
  )
}

/**
 * A RESSALVA QUE O MAPA TEM DE MOSTRAR (§2.3 #18 do relatório).
 *
 * `unidadeCobertura` não é resultado, é regra de leitura: uma cidade medida em
 * economias e outra em ligações não são comparáveis no mesmo preenchimento de
 * cobertura. Quando a rodada é uniforme — o caso normal — o aviso não aparece,
 * porque não há o que ressalvar.
 */
function AvisoDeUnidade({ cidades }: { cidades: CidadeLinha[] }) {
  const unidades = [...new Set(cidades.map((c) => c.unidadeCobertura).filter(Boolean))]
  if (unidades.length < 2) return null
  return (
    <p className="flex items-start gap-2 rounded-r-[10px] border-l-2 border-warning bg-warning/10 px-3.5 py-3 text-[13px] leading-relaxed text-warning">
      <span aria-hidden>⚠</span>
      <span>
        Esta rodada mede cobertura em unidades diferentes ({unidades.join(', ')}). As cidades não
        são diretamente comparáveis nas camadas de cobertura e de metas.
      </span>
    </p>
  )
}

/**
 * A linha do ranking — e ela carrega a MESMA fração que o mapa desenha.
 *
 * A barra existe porque o degrau discreto perde resolução de propósito: cinco
 * classes bastam para o mapa e não bastam para separar a terceira da quarta
 * colocada. A barra devolve essa precisão onde ela cabe, que é numa lista
 * ordenada.
 */
/**
 * `memo`, e a razão é a mesma de `CidadeUnidade` em `MapaCidades.tsx`.
 *
 * `ativa` mora em `Bancada`, muda a cada `mouseenter` (no mapa OU no
 * ranking), e sem `memo` cada troca reconciliava as dezenove linhas — mesmo
 * as dezessete cujo `ativa`/`selecionada`/`comparada` não mudou. Só funciona
 * porque `aoAbrir`/`aoPairar`, as duas props de função, são estáveis entre
 * um hover e outro (ver `aoAbrirSemAncora`, no ponto de uso): uma closure
 * nova a cada render do pai anularia isto em silêncio, sem erro nenhum — só
 * a lista voltando a engasgar.
 */
const LinhaDoRanking = memo(function LinhaDoRanking({
  posicao,
  cidade,
  texto,
  cor,
  largura,
  ativa,
  selecionada,
  comparada,
  aoPairar,
  aoAbrir,
}: {
  /** `null` em repouso: ainda não há ordem, porque ainda não há número. */
  posicao: number | null
  cidade: CidadeLinha
  texto: string
  cor: string | undefined
  largura: number
  ativa: boolean
  /**
   * A cidade do CARTÃO — persistente, ao contrário de `ativa`.
   *
   * O mesmo problema que o anel no polígono resolve: com o cartão aberto, o
   * hover continua correndo pela lista, e sem uma marca própria some da tela
   * qual das dezenove está sendo lida. `selecionada` ganha o filete cheio;
   * `ativa` continua sendo o fundo tingido.
   */
  selecionada: boolean
  comparada: boolean
  aoPairar: (cidade: string | null) => void
  aoAbrir: (cidade: string) => void
}) {
  const realce = selecionada
    ? { background: 'rgba(23,227,203,.14)', boxShadow: 'inset 3px 0 0 #17E3CB' }
    : comparada
      ? { background: 'rgba(46,78,201,.10)', boxShadow: 'inset 3px 0 0 #2E4EC9' }
      : ativa
        ? { background: 'rgba(23,227,203,.10)', boxShadow: 'inset 2px 0 0 #17E3CB' }
        : undefined
  return (
    <li>
      <button
        type="button"
        aria-current={selecionada ? 'true' : undefined}
        onClick={() => aoAbrir(cidade.id)}
        onMouseEnter={() => aoPairar(cidade.id)}
        onFocus={() => aoPairar(cidade.id)}
        className={
          'grid w-full grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-2.5 rounded-lg px-1 py-1.5 text-left transition-colors duration-press ease-saida ' +
          (realce ? '' : 'hover:bg-ink-50')
        }
        style={realce}
      >
        <span className="text-right font-mono text-[10.5px] tabular-nums text-ink-400">
          {posicao ?? '·'}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[12.5px] text-ink-800">{cidade.nome}</span>
          {largura > 0 && (
            <span
              className="mt-1 block h-[3px] rounded-full transition-[width] duration-entrar ease-saida"
              style={{ width: `${largura}%`, background: cor }}
              aria-hidden
            />
          )}
        </span>
        <span className="shrink-0 font-mono text-[11.5px] tabular-nums text-ink-800">{texto}</span>
      </button>
    </li>
  )
})
