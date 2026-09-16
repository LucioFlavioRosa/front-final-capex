/**
 * A projeção do mapa de municípios — em ~60 linhas, sem `d3-geo`.
 *
 * POR QUE NÃO UMA BIBLIOTECA: o recorte é de 19 municípios num quadrado de
 * ~4° × ~2°. Nessa escala, uma equirretangular com correção de latitude é
 * VISUALMENTE indistinguível de uma Mercator — a diferença fica em fração de
 * pixel. `d3-geo` (ou Leaflet, ou MapLibre) resolveria o mesmo problema
 * trazendo junto uma dependência, um servidor de tiles ou uma atribuição, e o
 * app é servido do Azure SWA sem proxy nosso na frente: cada serviço externo
 * novo é mais uma coisa que pode derrubar a tela de resultado.
 *
 * A CORREÇÃO DE LATITUDE é o que separa isto de "plotar lon como x e lat como
 * y". Um grau de longitude vale cos(latitude) graus de longitude em distância
 * real — a ~22° S, 0,927. Sem o fator, o mapa sai 8% esticado na horizontal, o
 * que não parece errado a olho nu e mesmo assim deforma a silhueta pela qual as
 * pessoas reconhecem o litoral fluminense.
 *
 * Se um dia a tela precisar de contexto geográfico de verdade (rios, malha
 * viária, imagem de satélite), aí sim entra um mapa com tiles — e este arquivo
 * sai inteiro. Ele não é um começo de biblioteca de mapas; é o mínimo que o
 * coroplético exige.
 */

export interface Municipio {
  type: 'Feature'
  id: string
  properties: {
    /**
     * O nome EXATO como `otim_cidade.cidade` devolve — a chave do join.
     *
     * `null` nos municípios de CONTEXTO: a malha traz o estado inteiro para o
     * usuário se situar, e os que não são da unidade não têm resultado nenhum.
     * Nulo em vez de string vazia porque a diferença é de existência, não de
     * conteúdo — e `''` casaria por acidente num `Map.get` distraído.
     */
    cidade: string | null
    /** O nome oficial do IBGE, acentuado — é o que a tela mostra. */
    nome: string
    codigo: string
    /** Está no escopo da unidade simulada? Decide todo o tratamento visual. */
    naUnidade: boolean
  }
  geometry:
    | { type: 'Polygon'; coordinates: number[][][] }
    | { type: 'MultiPolygon'; coordinates: number[][][][] }
}

export interface MalhaMunicipal {
  type: 'FeatureCollection'
  features: Municipio[]
}

/** Os anéis de um município, sem o `Polygon` × `MultiPolygon` no meio do caminho. */
function aneis(m: Municipio): number[][][] {
  return m.geometry.type === 'Polygon'
    ? m.geometry.coordinates
    : m.geometry.coordinates.flat()
}

export interface Projecao {
  largura: number
  altura: number
  /** O `d` de um `<path>` com todos os anéis do município. */
  caminho: (m: Municipio) => string
  /** Onde ancorar o rótulo: centroide de área do maior anel. */
  ancora: (m: Municipio) => [number, number]
  /**
   * Os anéis do município já em coordenadas de tela.
   *
   * Existe porque o preenchimento parcial precisa MEDIR a geometria, não só
   * desenhá-la — e medir sobre lon/lat daria área em graus², que não é a área
   * que aparece na tela: a correção de latitude entra no meio. Quem calcula a
   * linha d'água tem de ver o mesmo polígono que o olho vê.
   */
  aneisProjetados: (m: Municipio) => [number, number][][]
  /** A extensão vertical do município na tela — o topo e a base do medidor. */
  extensaoVertical: (m: Municipio) => { topo: number; base: number }
}

/**
 * Ajusta a malha inteira a uma caixa de `largura` × `altura`, preservando a
 * proporção. O `viewBox` do SVG usa estas unidades, então o mapa escala com o
 * container sem recalcular nada.
 */
export function projetar(
  municipios: Municipio[],
  largura = 1000,
  altura = 700,
  margem = 8,
): Projecao {
  let lonMin = Infinity
  let lonMax = -Infinity
  let latMin = Infinity
  let latMax = -Infinity
  for (const m of municipios) {
    for (const anel of aneis(m)) {
      for (const [lon, lat] of anel) {
        if (lon < lonMin) lonMin = lon
        if (lon > lonMax) lonMax = lon
        if (lat < latMin) latMin = lat
        if (lat > latMax) latMax = lat
      }
    }
  }

  const k = Math.cos((((latMin + latMax) / 2) * Math.PI) / 180)
  const largOriginal = (lonMax - lonMin) * k
  const altOriginal = latMax - latMin
  // `min` e não `max`: o mapa cabe INTEIRO na caixa. Com `max`, o município
  // mais ao norte sairia recortado pela borda do SVG.
  const escala = Math.min(
    (largura - 2 * margem) / largOriginal,
    (altura - 2 * margem) / altOriginal,
  )
  const deslocX = (largura - largOriginal * escala) / 2
  const deslocY = (altura - altOriginal * escala) / 2

  const ponto = ([lon, lat]: number[]): [number, number] => [
    deslocX + (lon - lonMin) * k * escala,
    // O y do SVG cresce para BAIXO e a latitude cresce para o NORTE: sem a
    // inversão o mapa sai de cabeça para baixo, e o Rio de Janeiro de ponta-
    // cabeça continua parecendo um mapa plausível para quem não conhece a
    // costa — o tipo de erro que passa em revisão.
    deslocY + (latMax - lat) * escala,
  ]

  const caminho = (m: Municipio) =>
    aneis(m)
      .map((anel) => {
        const [x0, y0] = ponto(anel[0])
        let d = `M${x0.toFixed(1)},${y0.toFixed(1)}`
        for (let i = 1; i < anel.length; i++) {
          const [x, y] = ponto(anel[i])
          d += `L${x.toFixed(1)},${y.toFixed(1)}`
        }
        return `${d}Z`
      })
      .join('')

  const ancora = (m: Municipio): [number, number] => {
    // O MAIOR anel, e não o primeiro: com `MultiPolygon`, a ordem do IBGE não
    // garante que o continente venha antes das ilhas. Ancorar o rótulo do Rio
    // de Janeiro numa laje da Baía de Guanabara é o que acontece sem isto.
    let maior: number[][] = []
    let maiorArea = -1
    for (const anel of aneis(m)) {
      const a = Math.abs(areaAssinada(anel))
      if (a > maiorArea) {
        maiorArea = a
        maior = anel
      }
    }
    const pontos = maior.map(ponto)
    const a2 = areaAssinada(pontos)
    // Polígono degenerado (área ~0) faria o centroide dividir por zero. Cai na
    // média simples dos vértices, que para um anel minúsculo é a mesma coisa.
    if (Math.abs(a2) < 1e-9) {
      const n = pontos.length
      return [
        pontos.reduce((s, p) => s + p[0], 0) / n,
        pontos.reduce((s, p) => s + p[1], 0) / n,
      ]
    }
    let cx = 0
    let cy = 0
    for (let i = 0; i < pontos.length - 1; i++) {
      const [x0, y0] = pontos[i]
      const [x1, y1] = pontos[i + 1]
      const f = x0 * y1 - x1 * y0
      cx += (x0 + x1) * f
      cy += (y0 + y1) * f
    }
    // `6 * a2`, e não `3 * a2`. O centroide é Σ(xᵢ+xᵢ₊₁)·fᵢ ÷ (6A), e `a2` JÁ é
    // A (a `areaAssinada` divide por 2 antes de devolver) — dividir por 3 deixa
    // o resultado com o DOBRO do valor certo. O efeito não é um rótulo
    // ligeiramente torto: as âncoras vão parar fora do `viewBox` e os rótulos
    // desaparecem da tela, o que se lê como "o rótulo não foi implementado".
    return [cx / (6 * a2), cy / (6 * a2)]
  }

  const aneisProjetados = (m: Municipio): [number, number][][] =>
    aneis(m).map((anel) => anel.map(ponto))

  const extensaoVertical = (m: Municipio) => {
    let topo = Infinity
    let base = -Infinity
    for (const anel of aneisProjetados(m)) {
      for (const [, y] of anel) {
        if (y < topo) topo = y
        if (y > base) base = y
      }
    }
    return { topo, base }
  }

  return { largura, altura, caminho, ancora, aneisProjetados, extensaoVertical }
}

/**
 * A LINHA D'ÁGUA: o `y` em que a área ABAIXO da linha é `fracao` do município.
 *
 * A tentação é cortar a `fracao` da ALTURA da caixa do polígono, e ela produz
 * um desenho que afirma um número que o dado não tem: num município largo
 * embaixo e estreito em cima — que é a forma de metade do Rio de Janeiro
 * fluminense — 60% da altura pinta uns 75% da área. Quem lê o mapa lê ÁREA, não
 * altura, porque é a área que o olho compara entre dois polígonos de formas
 * diferentes.
 *
 * O corte certo não tem forma fechada (depende do polígono inteiro), então sai
 * de busca binária sobre a área do polígono recortado pelo semiplano. 22
 * iterações levam o intervalo a menos de um milésimo da altura do município —
 * bem abaixo de um pixel na escala em que o mapa é desenhado.
 *
 * Devolve `base` para fração nula e `topo` para fração cheia: os dois extremos
 * têm resposta exata e não precisam da busca.
 */
export function corteDaFracao(
  aneisProj: [number, number][][],
  fracao: number,
  topo: number,
  base: number,
): number {
  const total = aneisProj.reduce((s, a) => s + Math.abs(areaAssinada(a)), 0)
  if (total <= 0 || fracao <= 0.001) return base
  if (fracao >= 0.999) return topo

  let lo = topo
  let hi = base
  for (let i = 0; i < 22; i++) {
    const meio = (lo + hi) / 2
    let abaixo = 0
    for (const anel of aneisProj) {
      const r = recortarAbaixo(anel, meio)
      if (r.length > 3) abaixo += Math.abs(areaAssinada(r))
    }
    if (abaixo / total > fracao) lo = meio
    else hi = meio
  }
  return (lo + hi) / 2
}

/**
 * Sutherland–Hodgman contra o semiplano `y >= corte` (a parte de BAIXO no SVG,
 * onde o y cresce para o sul).
 *
 * O recorte contra um semiplano é o único caso em que este algoritmo é
 * correto para polígono CÔNCAVO sem tratamento extra — e município é côncavo
 * quase sempre. Contra uma janela retangular ele produziria arestas
 * degeneradas ligando partes separadas; contra um semiplano, não.
 */
function recortarAbaixo(anel: [number, number][], corte: number): [number, number][] {
  const dentro = (p: [number, number]) => p[1] >= corte
  const cruzar = (a: [number, number], b: [number, number]): [number, number] => {
    const t = (corte - a[1]) / (b[1] - a[1])
    return [a[0] + (b[0] - a[0]) * t, corte]
  }
  const saida: [number, number][] = []
  for (let i = 0; i < anel.length - 1; i++) {
    const a = anel[i]
    const b = anel[i + 1]
    if (dentro(a)) {
      saida.push(a)
      if (!dentro(b)) saida.push(cruzar(a, b))
    } else if (dentro(b)) {
      saida.push(cruzar(a, b))
    }
  }
  // Fecha o anel: a `areaAssinada` percorre pares consecutivos e precisa do
  // primeiro ponto repetido no fim para contar a última aresta.
  if (saida.length) saida.push(saida[0])
  return saida
}

/** Fórmula do laço. O SINAL importa só para o centroide; a área usa o módulo. */
function areaAssinada(anel: number[][] | [number, number][]): number {
  let s = 0
  for (let i = 0; i < anel.length - 1; i++) {
    s += anel[i][0] * anel[i + 1][1] - anel[i + 1][0] * anel[i][1]
  }
  return s / 2
}

// ===========================================================================
//  A MALHA SEGUE A RODADA
// ===========================================================================

/**
 * O nome reduzido à régua que os dois lados conseguem cumprir: caixa alta,
 * sem acento, espaços colapsados.
 *
 * O motor devolvia `MAGE`; o banco de hoje devolve `Magé`; o IBGE escreve
 * `Magé`. Comparar cru falha em dois dos três pares. Abreviação
 * (`S.FCO.DO ITABAPOANA`) NÃO se resolve aqui — para ela existe o de-para do
 * gerador, gravado em `properties.cidade`, e `recortarMalha` olha os dois.
 */
export function chaveDoNome(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Deriva `naUnidade` e `cidade` de cada município A PARTIR DAS CIDADES DA
 * RODADA, e não do que o gerador gravou.
 *
 * O arquivo traz o estado inteiro, mas o gerador só marcava a unidade para a
 * qual ele foi rodado (a 56, com os nomes em caixa alta que o motor usava na
 * época). Uma rodada de OUTRA unidade — ou a mesma unidade com o banco já
 * gravando `Magé` em vez de `MAGE` — não casava nada, e o mapa saía vazio com
 * dezenove avisos de "sem contorno". Aqui o município é da unidade quando a
 * rodada tem uma cidade com o nome dele (oficial do IBGE ou a chave antiga do
 * de-para, pela mesma régua de `chaveDoNome`), e `cidade` passa a ser o nome
 * EXATO da rodada — que é a chave que `dados` usa para pintar.
 *
 * Cidade da rodada que não está no estado continua sem contorno, e o mapa
 * continua avisando: é o caso que só o gerador resolve.
 */
export function recortarMalha(malha: MalhaMunicipal, cidades: readonly string[]): MalhaMunicipal {
  const daRodada = new Map(cidades.map((c) => [chaveDoNome(c), c]))
  return {
    ...malha,
    features: malha.features.map((f) => {
      const cidade =
        daRodada.get(chaveDoNome(f.properties.nome)) ??
        (f.properties.cidade ? daRodada.get(chaveDoNome(f.properties.cidade)) : undefined) ??
        null
      return { ...f, properties: { ...f.properties, cidade, naUnidade: cidade !== null } }
    }),
  }
}
