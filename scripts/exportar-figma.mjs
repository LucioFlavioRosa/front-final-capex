/**
 * Exporta as telas do frontend para arquivos .html importáveis no Figma pelo
 * plugin html.to.design (aba "File").
 *
 * Por que um .html "achatado" e não um .mhtml: o app é uma SPA (React + Vite),
 * então um HTML cru do repositório não renderiza nada — e o .mhtml, embora
 * capture o DOM já renderizado, guarda o CSS como uma parte MIME separada
 * (`cid:css-…@mhtml.blink`) que o html.to.design NÃO resolve: o import chega
 * sem estilo nenhum (testado, era exatamente isso). Já um .html com tudo
 * embutido não depende de nada externo nem de JS.
 *
 * O que o script faz por tela:
 *   1. renderiza a página de verdade no Chromium (o React roda aqui);
 *   2. junta o CSS de todas as folhas de estilo num único <style>
 *      (inclusive o do Google Fonts, que é cross-origin);
 *   3. troca fontes e imagens por data-URI — nada de rede na hora do import;
 *   4. remove <script> e <link>, e neutraliza as animações de entrada;
 *   5. salva o outerHTML resultante.
 *
 * Também captura estados que não têm URL própria (wizard, revisão do cadastro),
 * que de outra forma só seriam alcançados clicando à mão.
 *
 * Uso (dentro de ses-frontend/):
 *   node scripts/exportar-figma.mjs                  # sobe o dev server sozinho
 *   node scripts/exportar-figma.mjs --url http://localhost:5173
 *   node scripts/exportar-figma.mjs --largura 1728   # outro viewport
 *   node scripts/exportar-figma.mjs --so login,home
 *
 * Saída: ses-frontend/export-figma/*.html (+ .png de referência).
 */

import { spawn } from 'node:child_process'
import { mkdir, writeFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SAIDA = path.join(RAIZ, 'export-figma')

// ---------------------------------------------------------------- argumentos

function arg(nome, padrao) {
  const i = process.argv.indexOf(`--${nome}`)
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : padrao
}

const BASE = arg('url', 'http://localhost:5173').replace(/\/$/, '')
const PORTA_LOGIN = Number(arg('porta-login', '5174'))
const LARGURA = Number(arg('largura', '1440'))
const ALTURA = Number(arg('altura', '960'))
const FILTRO = arg('so', '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

// ------------------------------------------------------------------- telas
/**
 * `prepara` leva a tela até o estado desejado; `espera` é a marca de que a
 * captura é da tela CERTA. O `espera` não é decoração: sem ele o /login foi
 * exportado como se fosse a Home (ver `semSessao` abaixo) e nada acusou o erro.
 *
 * Estados do cadastro são sequenciais, então cada um refaz o caminho desde o
 * início — mais lento, mas cada arquivo fica independente dos outros.
 */
const TELAS = [
  {
    nome: 'login',
    rota: '/login',
    // VITE_SKIP_AUTH=true (.env.local) faz o status nascer 'authenticated', e o
    // Login.tsx redireciona para '/' nesse caso. Esta tela só existe sem sessão.
    semSessao: true,
    espera: (page) => page.getByRole('button', { name: /Entrar com conta Microsoft/ }).waitFor(),
  },
  {
    nome: 'home',
    rota: '/',
    espera: (page) => page.getByText('Status do cadastro').waitFor(),
  },
  {
    nome: 'cadastro-1-selecao',
    rota: '/cadastro',
    espera: (page) => page.getByRole('button', { name: 'Iniciar preenchimento' }).waitFor(),
  },
  {
    nome: 'cadastro-2-wizard',
    rota: '/cadastro',
    prepara: async (page) => {
      await page.getByRole('button', { name: 'Iniciar preenchimento' }).click()
    },
    espera: (page) => page.getByRole('tablist').first().waitFor(),
  },
  {
    nome: 'cadastro-3-revisao',
    rota: '/cadastro',
    prepara: async (page) => {
      await page.getByRole('button', { name: 'Iniciar preenchimento' }).click()
      await page.getByRole('button', { name: 'Revisão antes de rodar' }).click()
    },
    espera: (page) => page.getByText('Completude geral').waitFor(),
  },
  {
    nome: 'cadastro-4-sucesso',
    rota: '/cadastro',
    prepara: async (page) => {
      await page.getByRole('button', { name: 'Iniciar preenchimento' }).click()
      await page.getByRole('button', { name: 'Revisão antes de rodar' }).click()
      const salvar = page.getByRole('button', { name: /Salvar e ir para a simulação/ })
      // Fica desabilitado enquanto houver campo pendente — nesse caso não há
      // tela de sucesso para capturar, e pular é melhor que travar o script.
      if (await salvar.isDisabled()) throw new Error('botão "Salvar" desabilitado (campos pendentes)')
      await salvar.click()
    },
    espera: (page) => page.getByText('Dados da unidade salvos').waitFor(),
  },
]

// ------------------------------------------------------------------ helpers

async function servidorNoAr(url) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(1500) })
    return r.ok
  } catch {
    return false
  }
}

const VITE_BIN = path.join(RAIZ, 'node_modules', 'vite', 'bin', 'vite.js')

/** Sobe um dev server e devolve como derrubá-lo. */
async function subirServidor(url, argsVite = [], envExtra = {}) {
  // Chama o binário do vite direto, sem `npm run` nem shell: com shell no meio,
  // o kill() no fim mata o wrapper e deixa o vite órfão ocupando a porta.
  const filho = spawn(process.execPath, [VITE_BIN, ...argsVite], {
    cwd: RAIZ,
    stdio: 'ignore',
    // BROWSER=none impede o vite (server.open: true) de abrir uma aba a cada run.
    env: { ...process.env, BROWSER: 'none', ...envExtra },
  })
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 500))
    if (await servidorNoAr(url)) return () => filho.kill()
  }
  filho.kill()
  throw new Error(`dev server não respondeu em ${url} após 30s`)
}

/** O dev server do app normal — reaproveita um já no ar, se houver. */
async function garantirServidor() {
  if (await servidorNoAr(BASE)) {
    console.log(`• dev server já no ar em ${BASE}`)
    return () => {}
  }
  console.log(`• subindo o dev server (${BASE})…`)
  const parar = await subirServidor(BASE)
  console.log('• dev server pronto')
  return parar
}

/**
 * Servidor à parte, na porta 5174, com VITE_SKIP_AUTH desligado — é a única
 * forma de ver a tela de login: a flag é inlinada pelo Vite em tempo de
 * transformação, então não dá para desligá-la em runtime no servidor do app.
 * Sobe sob demanda: se a tela de login não estiver no lote, nem é iniciado.
 */
let loginCache = null
async function garantirServidorSemSessao() {
  if (loginCache) return loginCache
  const url = `http://localhost:${PORTA_LOGIN}`
  console.log(`• subindo dev server sem sessão (${url}, VITE_SKIP_AUTH=false)…`)
  const parar = await subirServidor(
    url,
    ['--port', String(PORTA_LOGIN), '--strictPort'],
    { VITE_SKIP_AUTH: 'false' },
  )
  console.log('• dev server sem sessão pronto')
  loginCache = { url, parar }
  return loginCache
}

/**
 * Rola a página até o fim e volta ao topo: força o que só monta ao entrar em
 * tela (gráficos do recharts, animações `animate-fade-in`) a existir no DOM
 * antes do snapshot.
 */
async function assentarPagina(page) {
  await page.evaluate(async () => {
    const passo = window.innerHeight * 0.8
    for (let y = 0; y < document.body.scrollHeight; y += passo) {
      window.scrollTo(0, y)
      await new Promise((r) => setTimeout(r, 120))
    }
    window.scrollTo(0, 0)
  })
  await page.waitForTimeout(600)
}

/**
 * Achata a página num HTML único e autossuficiente. Roda no contexto da página
 * (por isso é uma função grande e sem imports): precisa de `document.styleSheets`
 * e do `fetch` com a mesma origem/UA do navegador — o CSS do Google Fonts só
 * devolve woff2 para UA moderno, e fonts.gstatic.com libera CORS.
 *
 * Devolve { html, avisos } — `avisos` lista o que não deu para embutir, para o
 * script reportar em vez de gerar um arquivo silenciosamente incompleto.
 */
async function achatar(page) {
  return page.evaluate(async () => {
    const avisos = []

    const paraDataUri = async (url) => {
      const resp = await fetch(url)
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const blob = await resp.blob()
      return new Promise((res, rej) => {
        const fr = new FileReader()
        fr.onload = () => res(fr.result)
        fr.onerror = () => rej(new Error('FileReader'))
        fr.readAsDataURL(blob)
      })
    }

    // 1. CSS de todas as folhas. As de outra origem (Google Fonts) estouram
    //    SecurityError ao ler cssRules, então busca-se o href por fetch.
    const partes = []
    for (const sheet of Array.from(document.styleSheets)) {
      try {
        partes.push(Array.from(sheet.cssRules).map((r) => r.cssText).join('\n'))
      } catch {
        if (!sheet.href) continue
        try {
          partes.push(await (await fetch(sheet.href)).text())
        } catch (e) {
          avisos.push(`css externo ${sheet.href}: ${e.message}`)
        }
      }
    }
    let css = partes.join('\n')

    // 2. url(...) do CSS → data-URI (fontes .woff2 do gstatic, máscara do logo).
    const urls = [...new Set(
      Array.from(css.matchAll(/url\((['"]?)([^'")]+)\1\)/g))
        .map((m) => m[2])
        .filter((u) => !u.startsWith('data:')),
    )]
    for (const u of urls) {
      try {
        const abs = new URL(u, location.href).href
        const dataUri = await paraDataUri(abs)
        css = css.split(u).join(dataUri)
      } catch (e) {
        avisos.push(`recurso css ${u}: ${e.message}`)
      }
    }

    // 3. <img> → data-URI (o logo em public/assets).
    for (const img of Array.from(document.images)) {
      if (!img.src || img.src.startsWith('data:')) continue
      try {
        img.src = await paraDataUri(img.src)
        img.removeAttribute('srcset')
      } catch (e) {
        avisos.push(`imagem ${img.src}: ${e.message}`)
      }
    }

    // 4. Fora tudo que aponta para a rede ou depende de JS. O DOM já está
    //    renderizado; script aqui só quebraria o render do plugin.
    document
      .querySelectorAll('script, link[rel="stylesheet"], link[rel="preconnect"], link[rel="modulepreload"]')
      .forEach((el) => el.remove())

    // 5. CSS embutido + animações neutralizadas. Duração 1ms com o fill-mode
    //    original preservado: quem tem `both`/`forwards` (fade-in-up, scale-in,
    //    a curva `draw` do KPI) para no estado FINAL em vez de ficar invisível.
    const style = document.createElement('style')
    style.textContent =
      css +
      '\n/* exportar-figma: animações instantâneas para o plugin capturar o estado final */\n' +
      '*,*::before,*::after{animation-duration:1ms!important;animation-delay:0s!important;transition-duration:1ms!important;}\n'
    document.head.appendChild(style)

    return { html: '<!DOCTYPE html>\n' + document.documentElement.outerHTML, avisos }
  })
}

// --------------------------------------------------------------------- main

const pararServidor = await garantirServidor()
// Limpa só na exportação completa: com --so, apagar tudo destruiria as telas
// exportadas antes para regerar uma única.
if (!FILTRO.length) await rm(SAIDA, { recursive: true, force: true })
await mkdir(SAIDA, { recursive: true })

const navegador = await chromium.launch()
const contexto = await navegador.newContext({
  viewport: { width: LARGURA, height: ALTURA },
  deviceScaleFactor: 2,
  locale: 'pt-BR',
  // Sem isso as animações de entrada podem ser capturadas no meio.
  reducedMotion: 'reduce',
})

const ok = []
const falhou = []

for (const tela of TELAS) {
  if (FILTRO.length && !FILTRO.includes(tela.nome)) continue
  const page = await contexto.newPage()
  try {
    let base = BASE
    if (tela.semSessao) {
      base = (await garantirServidorSemSessao()).url
      // 401 fixo no perfil: se o backend estiver de pé, ele autenticaria de
      // verdade e a tela de login redirecionaria para a Home de novo.
      await page.route('**/api/users/profile', (rota) =>
        rota.fulfill({ status: 401, contentType: 'application/json', body: '{"detail":"sem sessão"}' }),
      )
    }

    await page.goto(`${base}${tela.rota}`, { waitUntil: 'networkidle' })
    if (tela.prepara) await tela.prepara(page)
    if (tela.espera) await tela.espera(page)
    await assentarPagina(page)

    // PNG antes de achatar: o .png é a referência do que o Figma DEVERIA mostrar.
    await page.screenshot({ path: path.join(SAIDA, `${tela.nome}.png`), fullPage: true })

    const { html, avisos } = await achatar(page)
    const arquivo = path.join(SAIDA, `${tela.nome}.html`)
    await writeFile(arquivo, html, 'utf8')

    ok.push(tela.nome)
    const mb = (Buffer.byteLength(html) / 1024 / 1024).toFixed(1)
    console.log(`✓ ${tela.nome}.html (${mb} MB)`)
    for (const a of avisos) console.log(`    ! ${a}`)
  } catch (err) {
    falhou.push(`${tela.nome}: ${err.message.split('\n')[0]}`)
    console.log(`✗ ${tela.nome} — ${err.message.split('\n')[0]}`)
  } finally {
    await page.close()
  }
}

await navegador.close()
pararServidor()
loginCache?.parar()

console.log(`\n${ok.length} tela(s) em ${SAIDA} (viewport ${LARGURA}px)`)
if (falhou.length) console.log(`${falhou.length} falha(s):\n  - ${falhou.join('\n  - ')}`)
console.log(
  '\nNo Figma: html.to.design → engrenagem → viewport ' +
    `${LARGURA}px → aba "File" → solte os .html (um por vez).`,
)
