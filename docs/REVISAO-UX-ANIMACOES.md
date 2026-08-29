# Revisão de UX e movimento — SES Aegea frontend

Auditoria de 25/08/2026. Base: `ses-frontend/src` inteiro (~16.100 LOC de TSX + `index.css` + `tailwind.config.js`).

---

## 0. A premissa do briefing precisa de um ajuste

O briefing partiu de "a interface está engessada, faltam animações". A leitura do
código mostra outra coisa, e a diferença muda a lista de prioridades:

**O design system de movimento não só existe — ele tem doutrina escrita.** O bloco
`transitionDuration` de `tailwind.config.js` carrega a regra explícita *"quanto mais
vezes por dia a pessoa aciona o controle, menos animação ela suporta"*, e a
justificativa de ter deixado curva elástica de fora de propósito. `hoverOnlyWhenSupported`
está ligado com um comentário de 8 linhas explicando o hover grudado em tela de toque.
Existem esqueletos de carregamento reais (`rodada/components/Estado.tsx`), com o
comentário *"o spinner diz 'espere'; o esqueleto diz 'espere, e o que vem tem esta
forma'"*. O indicador da barra de navegação **já desliza** medindo o item ativo com
`useLayoutEffect` + `ResizeObserver` (`Header.tsx:useIndicador`).

Vários itens do briefing já estão feitos, e alguns dos "faltando" são decisões
deliberadas que **não devem ser revertidas** (§5).

O problema real é outro, e tem três camadas:

| Camada | Diagnóstico |
|---|---|
| **A. Coisas que parecem travadas e não são movimento** | Rodada em execução que nunca atualiza sozinha; scroll perdido ao voltar do drill-down. É aqui que mora a sensação de app morto. |
| **B. Saídas que não existem** | Toast, modal, paleta e dicionário **entram** animados e **somem num quadro**. Metade da animação foi escrita. |
| **C. Doutrina aplicada pela metade** | `duration-press` (60ms) é a regra escrita do projeto para clique — e tem **2 usos** contra **64** de `duration-hover`. O próprio `Button` do kit erra isso. |

Números da varredura:

```
animate-*        → 31 ocorrências, 8 keyframes usadas de 11 declaradas
duration-hover   → 64        (o padrão de fato)
duration-mover   →  3
duration-press   →  2        ← a regra de clique do projeto, quase não usada
duration-entrar  →  0        ← declarada, nunca usada
prefers-reduced-motion → 1 bloco (kill-switch global em `*`)
refetchInterval  →  0
```

---

## 1. Achados, com evidência

### 1.1 · Crítico — rodada em execução não dá sinal de vida

`rodada/api/queries.ts:44` — `useRuns` não define `refetchInterval`, e
`main.tsx` desliga `refetchOnWindowFocus` no default. Depois de
`Simular.tsx:143` (`navegar('/resultados')`), uma rodada em `FILA`/`EXECUTANDO`
fica parada na tabela **para sempre**, até alguém dar F5.

Isso não é falta de animação — é falta de dado. Nenhuma micro-interação
compensa uma tela que não muda quando a coisa que ela mostra mudou. É o achado
de maior impacto de toda a auditoria.

O cache eterno das outras queries está **certo** e é bem justificado (resultado
publicado é imutável, o backend recusa 409). A lista do histórico é a exceção que
o próprio comentário do arquivo já reconhece — só não tirou a consequência.

```ts
// rodada/api/queries.ts
const EM_VOO = new Set(['FILA', 'EXECUTANDO'])

export function useRuns(filtro?: { unidadeId?: string; usuario?: string }) {
  return useQuery({
    queryKey: chaves.runs(filtro),
    queryFn: () => resultados.listar(filtro),
    /**
     * A lista é a única query da rodada que não é imutável — e a única em que
     * o dado muda SEM ação do usuário. Enquanto houver rodada em voo ela se
     * repesca sozinha; quando todas terminam, o intervalo volta a `false` e a
     * tela para de bater no servidor.
     */
    refetchInterval: (q) =>
      q.state.data?.some((r) => EM_VOO.has(r.status)) ? 8000 : false,
  })
}
```

E o `TagStatus` de uma rodada em voo ganha o `sweep` que já existe no config
(o mesmo do `Button sweep`), que é exatamente "isto está acontecendo agora":

```tsx
{EM_VOO.has(status) && (
  <span aria-hidden className="pointer-events-none absolute inset-0
    animate-sweep bg-gradient-to-r from-transparent via-white/50 to-transparent" />
)}
```

### 1.2 · Crítico — o scroll é perdido ao voltar

`components/layout/AppLayout.tsx:12`

```tsx
useEffect(() => {
  window.scrollTo({ top: 0, behavior: 'smooth' })
}, [pathname])
```

Dois problemas empilhados:

1. **Rola ao topo inclusive no *voltar*.** No drill-down de seis níveis
   (`Global → Cidade → Sistema → SubBacia → Elemento`), voltar para a lista
   devolve a pessoa ao topo dela. Quem estava no 40º sistema procura de novo.
2. **`behavior: 'smooth'` na troca de rota briga com a entrada da página.** A
   página nova faz `animate-fade-in` (250ms) enquanto o scroll ainda está
   viajando de 3.000px até 0. São dois movimentos com origens diferentes
   acontecendo em cima um do outro. Somado a `html { scroll-behavior: smooth }`
   em `index.css:33`, é motivo duplicado.

Correção: instantâneo no `PUSH`, restaurado no `POP`, e o `smooth` reservado
para âncora dentro da página (que é o caso para o qual ele foi feito).

```tsx
import { useNavigationType, useLocation } from 'react-router-dom'

const posicoes = new Map<string, number>()

export function AppLayout() {
  const { pathname } = useLocation()
  const tipo = useNavigationType() // 'PUSH' | 'POP' | 'REPLACE'

  useEffect(() => {
    return () => { posicoes.set(pathname, window.scrollY) }
  }, [pathname])

  useLayoutEffect(() => {
    // `instant` e não `smooth`: numa troca de rota a viagem do scroll não
    // informa nada — a página de destino é outra — e ainda corre por cima do
    // fade de entrada dela.
    window.scrollTo({ top: tipo === 'POP' ? (posicoes.get(pathname) ?? 0) : 0, behavior: 'instant' })
  }, [pathname, tipo])
  ...
}
```

### 1.3 · Alto — nada tem saída animada

Quatro componentes entram animados e desaparecem num quadro. É o corte seco mais
visível do app, e o mais barato de resolver.

| Componente | Entrada | Saída | Onde |
|---|---|---|---|
| `Toaster` | `animate-fade-in-up` | **nenhuma** — `setTimeout` remove do array | `ui/Toaster.tsx:34` |
| `Modal` | `animate-scale-in` + `animate-overlay-in` | **nenhuma** — `if (!open) return null` | `ui/Modal.tsx:52` |
| `CommandPalette` | `animate-scale-in` | **nenhuma** — idem | `ui/CommandPalette.tsx:29` |
| `PainelDicionario` | `animate-fade-in` | **nenhuma** — `if (!dict?.chave) return null` | `rodada/components/Dicionario.tsx:156` |
| `Combobox` (menu) | **nenhuma** | nenhuma | `ui/Combobox.tsx:79` |

O `Toaster` é o pior dos cinco porque some **sozinho**, sem clique — o
desaparecimento súbito de algo que ninguém mandou sumir é exatamente o que o
olho registra como falha de renderização.

Padrão único para os quatro, sem dependência nova (`transitionend` + estado de
saída). Só o mais crítico, aplicado ao toast:

```tsx
// ui/Toaster.tsx
interface Toast { id: number; message: string; type: ToastType; saindo?: boolean }

const toast = useCallback((message: string, type: ToastType = 'success') => {
  const id = ++counter
  setToasts((t) => [...t, { id, message, type }])
  // Marca a saída ANTES de remover: o nó fica no DOM durante os 200ms da
  // animação de saída e só então cai. Sem os dois tempos, o toast pisca.
  setTimeout(() => setToasts((t) => t.map((x) => (x.id === id ? { ...x, saindo: true } : x))), 3200)
  setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3400)
}, [])
```

```js
// tailwind.config.js — o par que falta em keyframes/animation
fadeOutDown: { from: { opacity: '1', transform: 'none' },
               to:   { opacity: '0', transform: 'translateY(8px)' } },
scaleOut:    { from: { opacity: '1', transform: 'scale(1)' },
               to:   { opacity: '0', transform: 'scale(.97)' } },
overlayOut:  { from: { opacity: '1' }, to: { opacity: '0' } },
// animation:
'fade-out-down': 'fadeOutDown 200ms cubic-bezier(.32,.72,0,1) both',
'scale-out':     'scaleOut 160ms cubic-bezier(.32,.72,0,1) both',
'overlay-out':   'overlayOut 160ms ease-in both',
```

Saída **sempre mais curta que a entrada** (200 vs 400, 160 vs 200): entrar é
apresentar, sair é liberar o caminho.

### 1.4 · Alto — o toast não é anunciado

`ui/Toaster.tsx:41` — o contêiner de toasts não tem `aria-live`. O projeto usa
`aria-live` corretamente em três outros lugares (`Estado.tsx:29`,
`Dicionario.tsx:159`, `role="alert"` em `DetalhesDaSimulacao.tsx:251`), então é
omissão pontual, não desconhecimento.

Consequência concreta: "Não foi possível mudar a favorita" (`Historico.tsx:262`)
— a única notificação de erro daquela ação — **não chega a quem usa leitor de
tela**. E não há botão de fechar: quem precisa de mais de 3,2 segundos para ler
não tem como segurar, e quem já leu não tem como dispensar.

```tsx
<div
  aria-live="polite"      // 'assertive' seria interrupção; toast não interrompe
  aria-atomic="false"
  className="fixed bottom-6 right-6 z-[60] flex flex-col gap-2"
>
```

### 1.5 · Alto — `prefers-reduced-motion` congela os spinners

`index.css:332`

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

O kill-switch global é a receita padrão e está quase certo — as entradas com
`fill-mode: both` terminam no estado final, então nada some. Mas ele apanha
junto os indicadores **em curso**:

- `animate-spin` em `CadastroWizard.tsx` (Importando…, Gerando…, Salvando…),
  `RevisaoCadastro.tsx`, `Login.tsx`, `RequireAuth.tsx`
- `animate-pulse` do esqueleto em `Estado.tsx:38`

Para quem tem a preferência ligada, o spinner de "Salvando…" fica **parado**.
Um indicador de atividade congelado não é "menos movimento": é a informação
errada — lê-se como aplicação travada. A WCAG pede reduzir movimento
*decorativo*, não apagar o feedback de progresso.

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
  /**
   * A exceção que o kill-switch global não pode apanhar: indicador de
   * ATIVIDADE. Um spinner parado não é "menos movimento", é a informação
   * errada — lê-se como travado. Reduzido, e não removido: gira mais devagar.
   */
  .animate-spin, .animate-pulse, .animate-sweep {
    animation-duration: 1.6s !important;
    animation-iteration-count: infinite !important;
  }
}
```

Falta também o lado JS: não existe `matchMedia('(prefers-reduced-motion)')` em
lugar nenhum. Hoje isso não custa nada (as animações de Recharts estão
desligadas, §5.1), mas passa a custar no minuto em que a primeira animação
controlada por JS entrar. Um `usePrefereMenosMovimento()` de 6 linhas paga
adiantado.

### 1.6 · Médio — o `Button` do kit desobedece à própria doutrina

`ui/Button.tsx:22`

```
transition-all duration-hover ... active:scale-[.98]
```

O config declara `press: 60ms` com a explicação *"o feedback de clique é o mais
rápido de todos — um press lento faz o botão parecer emperrado"*. O botão base
do kit aplica **140ms** ao `active:scale`. É literalmente o botão emperrado que
a doutrina descreve, no componente que a doutrina deveria governar primeiro.
`duration-press` só é usado nos dois botões do `Header.tsx`, que fizeram certo.

Segundo ponto no mesmo lugar: `transition-all` liga a transição para **toda**
propriedade, inclusive as de layout — e o `hover:brightness-90` da variante
primária ainda promove o botão a camada de composição própria. Numa tela de
formulário isso não aparece; na grade do cadastro, com dezenas de botões, é
custo sem contrapartida.

```diff
- 'relative overflow-hidden inline-flex ... transition-all duration-hover ease-saida
-  focus-visible:... active:scale-[.98]'
+ 'relative overflow-hidden inline-flex ...
+  transition-[background-color,border-color,color,box-shadow,transform,filter]
+  duration-hover ease-saida
+  focus-visible:... active:scale-[.98] active:duration-press'
```

### 1.7 · Médio — três indicadores de aba teleportam, e o app já sabe fazer deslizar

`Header.useIndicador` resolve isso com elegância (mede no layout, `ResizeObserver`
para reflow e carga de fonte, comentário explicando por que não é `useEffect`).
A técnica ficou presa no arquivo:

| Onde | Hoje | Arquivo |
|---|---|---|
| `TabBar` (abas do Cadastro) | troca `border-b-2` de cor → o sublinhado **pula** | `ui/TabBar.tsx:37` |
| `SegmentedControl` | troca `bg-white` de botão → a pílula **pula** | `ui/SegmentedControl.tsx:34` |
| `QuadroGrafico` (Gráfico/Tabela) | idem, em ~10 quadros por tela | `rodada/components/QuadroGrafico.tsx:95` |
| `CadastroWizard` (stepper + abas) | idem, duplicando o TabBar à mão | `CadastroWizard.tsx:729,747` |

Extrair `useIndicador` para `components/ui/useIndicador.ts` e consumir nos
quatro. Um hook, quatro chamadas, e a barra de navegação deixa de ser o único
lugar do app onde a aba ativa se move como coisa física.

### 1.8 · Médio — o tooltip da grade pisca

`ui/Tooltip.tsx` — abre no `onMouseEnter`, sem atraso e sem fade; fecha no
`onMouseLeave`, sem atraso.

Na grade do cadastro (22 colunas, tooltip em cabeçalho e célula), atravessar a
tabela com o mouse dispara e mata uma caixa por coluna. É a definição de ruído
visual: o movimento acontece sem que ninguém tenha pedido nada.

Além disso o gatilho é **só ponteiro** — não abre em `focus`. Quem navega a
grade pelo teclado (que é o modo documentado e cuidado do `AbaGrid`) nunca vê a
explicação da coluna.

```tsx
const timer = useRef<number>()

const agendar = () => { timer.current = window.setTimeout(mostrar, 180) }
const cancelar = () => { clearTimeout(timer.current); setIsVisible(false) }

<span
  ref={anchorRef}
  tabIndex={0}                          // alcançável pelo teclado
  onMouseEnter={agendar} onMouseLeave={cancelar}
  onFocus={mostrar} onBlur={cancelar}   // foco abre na hora: já houve intenção
>
```

E `animate-fade-in` na caixa. O atraso de 180ms é o que separa "passei por cima"
de "parei para ler" — é ele que faz o tooltip parar de piscar, mais do que
qualquer transição.

### 1.9 · Médio — o `Combobox` não anuncia estado

`ui/Combobox.tsx:69` — o botão não tem `aria-expanded`, `aria-haspopup` nem
`aria-controls`; a `<ul role="listbox">` não tem `aria-activedescendant`, então
a navegação por setas (que está implementada e funciona) é invisível para leitor
de tela. É o mesmo componente do §1.3 sem animação de abertura — vale corrigir
as duas coisas na mesma passada.

### 1.10 · Baixo — entrada de página duplicada, e uma delas é código morto

`AppLayout.tsx:44` — `<main className="... animate-fade-in">` **sem `key`**. O
`<main>` não desmonta na troca de rota, então essa animação toca uma vez na
carga do app e nunca mais. O efeito de entrada que se vê hoje vem, na verdade,
das oito cópias de `animate-fade-in` espalhadas por cada página
(`Global`, `Cidade`, `Sistema`, `SubBacia`, `Elemento`, `Historico`, `Simular`,
`CadastroWizard`).

Funciona, mas é a mesma decisão escrita em nove lugares — e a nona não faz nada.
Um `key={pathname}` no `<main>` centraliza e apaga as oito.

```tsx
<main id="main-content" key={pathname} tabIndex={-1} className="flex-1 w-full animate-fade-in">
```

### 1.11 · Baixo — nenhum stagger, e os esqueletos merecem um

Os esqueletos de `Estado.tsx` são bons e o comentário deles está certo. O que
falta é o **outro lado da troca**: quando o dado chega, os seis quadros da tela
de rodada pintam todos no mesmo quadro de vídeo. Nada anima a *chegada*.

Três linhas de CSS, sem tocar em componente nenhum:

```css
@layer utilities {
  /**
   * Escada de entrada. Aplicada no CONTÊINER, não no filho: quem escreve a
   * página não precisa saber o índice de cada card.
   * 45ms × 6 = 270ms para a última carta — dentro do teto de `entrar` (280ms),
   * que é a regra do config. Passar disso vira espera.
   */
  .escada > * { animation: fadeIn .25s ease-out both; }
  .escada > *:nth-child(1) { animation-delay: 0ms }
  .escada > *:nth-child(2) { animation-delay: 45ms }
  .escada > *:nth-child(3) { animation-delay: 90ms }
  .escada > *:nth-child(4) { animation-delay: 135ms }
  .escada > *:nth-child(5) { animation-delay: 180ms }
  .escada > *:nth-child(n+6) { animation-delay: 225ms }
}
```

**Onde não usar:** nas linhas do `AbaGrid` e da tabela do `Histórico`. Grade de
trabalho repetitivo é exatamente o caso que a doutrina do config exclui — e uma
escada em 500 linhas é meio segundo de espera por rolagem.

### 1.12 · Baixo — `duration-entrar` (280ms) está declarada e nunca é usada

Zero ocorrências. Os quatro tokens deviam mapear os quatro tempos do sistema; na
prática o app tem dois (`hover` para tudo, `press` em dois botões) e as animações
de entrada usam durações escritas à mão dentro do `animation` do config
(`.25s`, `.4s`, `.2s`, `260ms`). Alinhar `fade-in`/`scale-in`/`pop` aos tokens
fecha o sistema — é uma edição de config, não de componentes.

---

## 2. Prioridade

Ordenado por *quanto muda a percepção por hora gasta*, não por dificuldade.

### Fase 1 — a sensação de "app travado" (≈ 2 dias)

| # | Item | § | Esforço |
|---|---|---|---|
| 1 | `refetchInterval` na lista + `sweep` na rodada em voo | 1.1 | 3h |
| 2 | Scroll: `instant` no push, restaurado no pop | 1.2 | 3h |
| 3 | Saída animada em toast, modal, paleta, dicionário (+ 3 keyframes) | 1.3 | 5h |
| 4 | `aria-live` e botão de fechar no toast | 1.4 | 1h |
| 5 | `prefers-reduced-motion`: preservar indicadores de atividade | 1.5 | 1h |

Estes cinco resolvem tudo que hoje se lê como falha, e nenhum é decorativo.

### Fase 2 — a doutrina aplicada por inteiro (≈ 2 dias)

| # | Item | § | Esforço |
|---|---|---|---|
| 6 | `active:duration-press` + trocar `transition-all` no `Button` | 1.6 | 1h |
| 7 | Extrair `useIndicador` → `TabBar`, `SegmentedControl`, `QuadroGrafico`, `CadastroWizard` | 1.7 | 6h |
| 8 | Tooltip: atraso de 180ms, fade, abrir no foco | 1.8 | 3h |
| 9 | `Combobox`: `scale-in` no menu + ARIA de listbox | 1.9, 1.3 | 3h |

### Fase 3 — acabamento (≈ 1 dia)

| # | Item | § | Esforço |
|---|---|---|---|
| 10 | `key={pathname}` no `<main>` e remover as 8 cópias | 1.10 | 1h |
| 11 | Utilitário `.escada` nas grades de cartas das telas de rodada | 1.11 | 2h |
| 12 | Alinhar as durações do bloco `animation` aos 4 tokens | 1.12 | 1h |
| 13 | Fade na troca Panorama ↔ Detalhe do `SecaoElementos` | — | 1h |

**Total ≈ 5 dias.** Nenhuma dependência nova (§4).

---

## 3. Guia de movimento — o que escrever no design system

O config já traz a doutrina; falta a tabela de decisão que diz **qual token
para qual gesto**. Proposta para colar no `tailwind.config.js`, ao lado do bloco
que já existe:

| Gesto | Token | Curva | Propriedade |
|---|---|---|---|
| Resposta ao clique | `duration-press` (60ms) | `ease-saida` | `transform` só |
| Hover, foco, cor | `duration-hover` (140ms) | `ease-saida` | `background-color`, `border-color`, `color`, `box-shadow` |
| Algo que **muda de lugar** | `duration-mover` (220ms) | `ease-saida` | `transform`, `width` |
| Algo que **entra na tela** | `duration-entrar` (280ms) | `ease-saida` | `opacity` + `transform` |
| Algo que **sai da tela** | 60–70% da entrada | `ease-in` | `opacity` + `transform` |
| Indicador de atividade | contínuo | linear | preservado sob `reduced-motion` |

Três regras que o código já obedece e que valem ficar escritas, porque são as
que se perdem primeiro:

1. **Anime `transform` e `opacity`. Nada mais.** São as duas que o compositor
   resolve sem recalcular layout. `transition-all` é proibido por isso, não por
   estilo.
2. **A saída é mais curta que a entrada.** Entrar é apresentar; sair é liberar
   o caminho, e ninguém quer esperar para ir embora.
3. **Frequência manda.** Controle acionado dezenas de vezes por sessão fica no
   `press`/`hover`. `entrar` é para o que acontece uma vez por tela. A grade do
   cadastro não anima — isso é decisão, não pendência.

---

## 4. Sobre acrescentar biblioteca de animação

**Recomendação: não.** Nem Framer Motion, nem React Spring.

O que falta na Fase 1 inteira é `transitionend`/`setTimeout` para segurar o nó
durante a saída — cerca de 15 linhas, uma vez, num utilitário compartilhado.
Framer Motion (~34 kB gzip) resolveria isso com `AnimatePresence`, mas o custo
não é o peso: é que a partir dele passam a existir duas gramáticas de movimento
no projeto (tokens do Tailwind e `props` de motion), e a doutrina do config
deixa de ser o lugar único onde a decisão mora. Num app cujo maior problema de
movimento é *doutrina aplicada pela metade*, uma segunda gramática piora o
diagnóstico.

Reabrir a discussão se e quando aparecer: gesto de arrastar, transição
compartilhada entre rotas (o elemento que "voa" de uma tela para a outra), ou
física de mola de verdade. Nada disso está no roteiro.

---

## 5. O que NÃO mexer

Decisões deliberadas encontradas no código. Registradas aqui para que uma
próxima passada de "faltam animações" não as desfaça sem saber.

### 5.1 Recharts com `isAnimationActive={false}`

~10 séries em `rodada/components/graficos.tsx`. Combina com a doutrina
(resultado de rodada é lido e relido; a barra crescendo pela quinta vez é
espera, não informação) e evita o flicker de tooltip que a animação do Recharts
introduz durante o crescimento.

O efeito de "a tela está montando" deve vir do §1.11 — a **carta** entra em
escada, o gráfico dentro dela já chega pronto. Custo perto de zero e não toca em
nenhum SVG.

Se um dia se quiser movimento no gráfico, o lugar é **só** o quadro herói do
nível global, **só** na primeira montagem, e passando por
`usePrefereMenosMovimento()` — não com o default do Recharts.

### 5.2 A grade do cadastro sem animação de linha

`AbaGrid` é trabalho repetitivo, com teste de performance dedicado
(`AbaGrid.perf.test.tsx`). Animar entrada de linha ali é exatamente o que a
doutrina do config exclui.

### 5.3 `hoverOnlyWhenSupported`

`tailwind.config.js` — resolve o hover grudado depois do toque em tela sensível,
para os 97 usos de `hover:` de uma vez. Está documentado no próprio config.

### 5.4 Ausência de curva elástica

Deixada de fora de propósito, com a justificativa escrita: *"diverte na primeira
vez e atrasa na centésima"*. O item 3.2 do briefing ("clique com ripple",
"botões com ícones que viram") vai contra isso. Manter fora.

### 5.5 Os esqueletos de `Estado.tsx`

O briefing supunha spinners genéricos. Não é o caso: existem esqueleto, erro com
saída (`aoRecarregar` obrigatório no tipo, de propósito) e estado vazio com
próximo passo, num componente único para as três. É a melhor peça de UX do
projeto — a lacuna está na **chegada** do dado (§1.11), não na espera.
