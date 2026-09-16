/**
 * Gera a malha municipal de uma unidade a partir da malha do IBGE.
 *
 * POR QUE ESTE SCRIPT EXISTE, E POR QUE ELE NÃO RODA NO BUILD
 * -----------------------------------------------------------
 * O mapa da tela de resultados precisa do POLÍGONO de cada município, e não há
 * geometria nenhuma no produto: nem `input.*`, nem `otim_*` guardam coordenada
 * (`otim_subbacia` tem as colunas `latitude`/`longitude` e o motor grava `None`
 * nas duas). A geometria é dado cartográfico externo.
 *
 * Ela é buscada UMA VEZ, aqui, e o resultado é VERSIONADO no repo. Buscar da
 * API do IBGE em tempo de execução seria trocar uma tela de resultado que
 * sempre funciona por uma que depende de um serviço público estar no ar —
 * e o app é servido do Azure SWA, sem proxy nosso na frente.
 *
 *     node scripts/gerar-malha-unidade.mjs
 *
 * SAÍDA: `src/rodada/refactor/mapa/municipios-56.geo.json`
 *
 * O QUE ELE FAZ
 *   1. baixa a malha municipal do estado (92 municípios do RJ);
 *   2. baixa o registro de municípios (nome oficial + código), para NÃO
 *      depender de código digitado à mão — o de-para abaixo é por NOME OFICIAL,
 *      que é conferível de olho; o código de 7 dígitos vem do IBGE;
 *   3. marca quais municípios são da unidade (`naUnidade`) — os outros ficam
 *      como CONTEXTO, para o mapa mostrar o estado inteiro e o usuário se
 *      situar (ver o laço em `main`);
 *   4. SIMPLIFICA os vértices, mais forte no contexto (ver `simplificar`);
 *   5. grava um FeatureCollection com `id` (código IBGE), `nome` (oficial),
 *      `naUnidade` e `cidade` — este último só nos da unidade, e é o nome EXATO
 *      como o motor devolve: a chave do join no front.
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const AQUI = dirname(fileURLToPath(import.meta.url))
const SAIDA = resolve(AQUI, '../src/rodada/mapa/municipios-56.geo.json')

const UF = 33 // Rio de Janeiro

/**
 * O DE-PARA. Chave = o nome como ele sai de `otim_cidade.cidade`; valor = o
 * nome oficial do IBGE.
 *
 * Ele é escrito à mão e não tem como não ser. O motor devolve o nome em caixa
 * alta, sem acento e com abreviação de ponto — `S.FCO.DO ITABAPOANA`,
 * `S.SEBASTIAO DO ALTO`, `MAGE`. Nenhuma normalização automática (maiúscula,
 * remoção de acento, distância de edição) leva o primeiro a "São Francisco de
 * Itabapoana" sem também produzir casamentos errados: o RJ tem SEIS municípios
 * começando com "São S…".
 *
 * São 19 linhas para a unidade 56. Outra unidade = outro bloco, e o script
 * ganha um parâmetro. Enquanto houver uma só, o parâmetro seria cerimônia.
 */
const DE_PARA = {
  'APERIBE': 'Aperibé',
  'CACHOEIRAS DE MACACU': 'Cachoeiras de Macacu',
  'CAMBUCI': 'Cambuci',
  'CANTAGALO': 'Cantagalo',
  'CASIMIRO DE ABREU': 'Casimiro de Abreu',
  'CORDEIRO': 'Cordeiro',
  'DUAS BARRAS': 'Duas Barras',
  'ITABORAI': 'Itaboraí',
  'ITAOCARA': 'Itaocara',
  'MAGE': 'Magé',
  'MARICA': 'Maricá',
  'MIRACEMA': 'Miracema',
  'RIO BONITO': 'Rio Bonito',
  'RIO DE JANEIRO': 'Rio de Janeiro',
  'S.FCO.DO ITABAPOANA': 'São Francisco de Itabapoana',
  'S.SEBASTIAO DO ALTO': 'São Sebastião do Alto',
  'SAO GONCALO': 'São Gonçalo',
  'SAQUAREMA': 'Saquarema',
  'TANGUA': 'Tanguá',
}

/**
 * Ramer–Douglas–Peucker.
 *
 * A malha é baixada em qualidade MAXIMA e simplificada aqui, e não baixada já
 * grosseira: a "intermediaria" do IBGE entrega os 19 municípios com 1.290
 * vértices — silhueta pobre justamente onde ela importa (a baía de Guanabara
 * separa Rio, Niterói e São Gonçalo, e é por ela que se reconhece o recorte).
 * A máxima traz 7.269, com detalhe de litoral que a tela nunca mostra: dois
 * vértices a 30 m um do outro caem no mesmo pixel. Simplificar nós é o que dá
 * a silhueta certa no tamanho certo — a decisão fica aqui, versionada, em vez
 * de na escolha de um parâmetro de URL.
 *
 * TOLERÂNCIA EM GRAUS, e é isso que decide o número: 0,0015° ≈ 165 m na
 * latitude do Rio. Num mapa de ~800 px cobrindo ~4° de longitude, 1 px vale
 * ~0,005° — ou seja, a tolerância está ABAIXO de um terço de pixel, e a
 * simplificação é literalmente invisível na tela. Aumentar isso começa a comer
 * baías e restingas, que é justamente a silhueta pela qual as pessoas
 * reconhecem o município.
 */
const TOLERANCIA = 0.0015

/** Municípios de CONTEXTO — ver o laço em `main`. ~660 m, cerca de 1 px. */
const TOLERANCIA_CONTEXTO = 0.006

function simplificar(pontos, tol) {
  if (pontos.length < 3) return pontos
  const [ini] = pontos
  const fim = pontos[pontos.length - 1]
  let maior = 0
  let indice = 0
  for (let i = 1; i < pontos.length - 1; i++) {
    const d = distanciaPerpendicular(pontos[i], ini, fim)
    if (d > maior) {
      maior = d
      indice = i
    }
  }
  if (maior <= tol) return [ini, fim]
  return [
    ...simplificar(pontos.slice(0, indice + 1), tol).slice(0, -1),
    ...simplificar(pontos.slice(indice), tol),
  ]
}

function distanciaPerpendicular([x, y], [x1, y1], [x2, y2]) {
  const dx = x2 - x1
  const dy = y2 - y1
  if (dx === 0 && dy === 0) return Math.hypot(x - x1, y - y1)
  const t = ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)
  const tc = Math.max(0, Math.min(1, t))
  return Math.hypot(x - (x1 + tc * dx), y - (y1 + tc * dy))
}

/** Arredonda para 4 casas (~11 m). Corta o arquivo pela metade sem efeito visual. */
const arredondar = (p) => [Math.round(p[0] * 1e4) / 1e4, Math.round(p[1] * 1e4) / 1e4]

/**
 * Simplifica um anel e DESISTE se ele degenerar.
 *
 * Um anel precisa de 4 posições (a última repete a primeira) para ser um
 * polígono válido. Ilhas pequenas — e o RJ tem muitas — podem cair abaixo disso
 * na simplificação. Devolver o anel degenerado produziria um `<path>` que alguns
 * renderizadores desenham como risco atravessando o mapa; devolver `null`
 * DESCARTA a ilha, que é a perda certa.
 */
function anelSimplificado(anel, tol) {
  const s = simplificar(anel.map(arredondar), tol)
  if (s.length < 4) return null
  const [px, py] = s[0]
  const [ux, uy] = s[s.length - 1]
  if (px !== ux || py !== uy) s.push([px, py])
  return s.length >= 4 ? s : null
}

function simplificarGeometria(geo, tol) {
  if (geo.type === 'Polygon') {
    const aneis = geo.coordinates.map((a) => anelSimplificado(a, tol)).filter(Boolean)
    return aneis.length ? { type: 'Polygon', coordinates: aneis } : null
  }
  if (geo.type === 'MultiPolygon') {
    const poligonos = geo.coordinates
      .map((p) => p.map((a) => anelSimplificado(a, tol)).filter(Boolean))
      .filter((p) => p.length)
    return poligonos.length ? { type: 'MultiPolygon', coordinates: poligonos } : null
  }
  throw new Error(`geometria inesperada: ${geo.type}`)
}

async function baixar(url, oque) {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`falha ao baixar ${oque}: HTTP ${r.status}`)
  return r.json()
}

const contarPontos = (geo) =>
  (geo.type === 'Polygon' ? [geo.coordinates] : geo.coordinates)
    .flat(2)
    .length

async function main() {
  console.log('Baixando o registro de municípios do IBGE…')
  const registro = await baixar(
    `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${UF}/municipios`,
    'o registro de municípios',
  )
  const codigoPorNome = new Map(registro.map((m) => [m.nome, String(m.id)]))

  // Falha ANTES de baixar a malha (que é o download pesado): um nome errado no
  // de-para é erro de digitação, e descobri-lo depois de 150 kB é desperdício.
  const cidadePorCodigo = new Map()
  for (const [cidade, oficial] of Object.entries(DE_PARA)) {
    const codigo = codigoPorNome.get(oficial)
    if (!codigo) {
      throw new Error(
        `"${oficial}" não existe no registro do IBGE da UF ${UF} ` +
          `(de-para de "${cidade}"). Confira a grafia oficial, com acento.`,
      )
    }
    cidadePorCodigo.set(codigo, { cidade, nome: oficial })
  }

  console.log('Baixando a malha municipal…')
  const malha = await baixar(
    `https://servicodados.ibge.gov.br/api/v3/malhas/estados/${UF}` +
      '?formato=application/vnd.geo+json&qualidade=maxima&intrarregiao=municipio',
    'a malha municipal',
  )

  // O ESTADO INTEIRO, e não só os 19 da unidade.
  //
  // As cidades da 56 não são contíguas: um bloco na Região Metropolitana e na
  // Região dos Lagos, outro no Noroeste Fluminense, e São Francisco de
  // Itabapoana isolado no extremo nordeste. Desenhados sozinhos, eles flutuam
  // em fundo branco sem referência nenhuma — quem não conhece a divisão
  // municipal do Rio não tem como situar Duas Barras. Os outros 73 municípios
  // entram como CONTEXTO, apagados: dão o contorno do estado e os vizinhos.
  //
  // `naUnidade` é o que a tela usa para decidir o tratamento, e `cidade` (a
  // chave de join com `otim_cidade.cidade`) só existe nos 19 — um município de
  // contexto não tem resultado, e dar-lhe uma chave convidaria a procurar um.
  const nomePorCodigo = new Map(registro.map((m) => [String(m.id), m.nome]))
  let antes = 0
  let depois = 0
  const features = []
  for (const f of malha.features) {
    const codigo = String(f.properties?.codarea ?? '')
    const alvo = cidadePorCodigo.get(codigo)
    const nome = alvo?.nome ?? nomePorCodigo.get(codigo)
    if (!nome) throw new Error(`código ${codigo} da malha não existe no registro do IBGE`)
    antes += contarPontos(f.geometry)
    // Contexto é simplificado MAIS FORTE (0,006° ≈ 660 m, ~1 px na tela): ele
    // existe para dar silhueta de estado e vizinhança, não para ser lido de
    // perto. Sem isso os 73 municípios de fundo pesariam mais que os 19 que
    // importam — e o arquivo é baixado por quem abre a tela.
    const geometry = simplificarGeometria(f.geometry, alvo ? TOLERANCIA : TOLERANCIA_CONTEXTO)
    if (!geometry) throw new Error(`${nome} ficou sem geometria após simplificar`)
    depois += contarPontos(geometry)
    features.push({
      type: 'Feature',
      id: codigo,
      properties: { codigo, nome, naUnidade: !!alvo, cidade: alvo ? alvo.cidade : null },
      geometry,
    })
  }

  const faltando = [...cidadePorCodigo.values()]
    .filter((a) => !features.some((f) => f.properties.cidade === a.cidade))
    .map((a) => a.nome)
  if (faltando.length) {
    throw new Error(`sem geometria na malha do IBGE: ${faltando.join(', ')}`)
  }

  mkdirSync(dirname(SAIDA), { recursive: true })
  writeFileSync(SAIDA, JSON.stringify({ type: 'FeatureCollection', features }))

  const kb = (s) => `${(Buffer.byteLength(s) / 1024).toFixed(0)} kB`
  console.log(
    `\n${features.length} municípios · ${antes} → ${depois} vértices ` +
      `(${(100 - (depois / antes) * 100).toFixed(0)}% a menos)\n` +
      `${SAIDA}  ${kb(JSON.stringify({ type: 'FeatureCollection', features }))}`,
  )
}

main().catch((e) => {
  console.error(`\n${e.message}\n`)
  process.exit(1)
})
