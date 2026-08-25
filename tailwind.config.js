/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  /**
   * `hover:` só vale onde existe ponteiro de verdade.
   *
   * Sem isto, o Tailwind gera `.hover\:bg-x:hover`, e em tela de toque o
   * navegador mantém o estado de hover DEPOIS do toque: a linha da grade em que
   * você tocou fica destacada até tocar em outro lugar, e parece seleção. São 97
   * usos de `hover:` no projeto — esta linha embrulha todos em
   * `@media (hover: hover)` de uma vez, em vez de 97 correções manuais.
   *
   * É `future` porque no Tailwind 3.x ainda é opt-in; na v4 virou o padrão.
   */
  future: {
    hoverOnlyWhenSupported: true,
  },
  theme: {
    extend: {
      colors: {
        // Turquesa de acento Aegea — paleta oficial de referencias/PROPOSTA-REDESIGN.html (seção 02).
        aegea: {
          50: '#F1FDFC', 100: '#DFFBF8', 200: '#B5F6EE', 300: '#66EDDD', 400: '#17E3CB',
          500: '#14BCAD', 600: '#10908C', 700: '#0D6B6F', 800: '#0A4A56', 900: '#082F42',
        },
        // Azul primário Aegea — paleta oficial de referencias/PROPOSTA-REDESIGN.html (seção 02).
        // 600 (primária) e 950 (secundária) lêem das variáveis CSS em :root (index.css) —
        // trocar a marca inteira é editar essas 2 linhas, ou usar a aba Designer em dev.
        water: {
          50: '#F2F4FC', 100: '#E0E5F7', 200: '#B8C3ED', 300: '#8A9CE1', 400: '#5C75D5',
          500: '#2E4EC9', 600: 'rgb(var(--color-primary) / <alpha-value>)', 700: '#01209B', 800: '#021A7D', 900: '#03145E',
          950: 'rgb(var(--color-secondary) / <alpha-value>)',
        },
        // Cabeçalho — independente de `water`, para permitir um header com tom próprio
        // (ver Designer). Lê --color-header-bg / --color-header-text em :root (index.css).
        header: {
          DEFAULT: 'rgb(var(--color-header-bg) / <alpha-value>)',
          text: 'rgb(var(--color-header-text) / <alpha-value>)',
        },
        // Texto base do corpo (lê --color-body-text). Só o elemento <body> usa isso por
        // padrão — componentes com classe própria (text-ink-500 etc.) continuam fixos.
        body: {
          text: 'rgb(var(--color-body-text) / <alpha-value>)',
        },
        // Marca-símbolo æ (rodapé) e stop do gradiente do logo (lê --color-logo).
        logo: 'rgb(var(--color-logo) / <alpha-value>)',
        // Destaque do card de Cadastro na Home (lê --color-mod-cadastro). Otimização e
        // Histórico ficam fixos — fora do escopo do Designer.
        mod: {
          cadastro: 'rgb(var(--color-mod-cadastro) / <alpha-value>)',
        },
        // Neutros (tinta / slate)
        ink: {
          50: '#f8fafc', 100: '#f1f5f9', 200: '#e2e8f0', 300: '#cbd5e1', 400: '#94a3b8',
          500: '#64748b', 600: '#475569', 700: '#334155', 800: '#1e293b', 900: '#0f172a',
          // Texto secundário com tom de marca sobre fundo CLARO (6.7:1 no branco).
          // Use no lugar de `text-water-600/60` — opacidade sobre a primária só funciona
          // dentro de .band-surface / .data-surface, onde o fundo é escuro.
          water: '#4C5A8A',
        },
        success: '#16a34a',
        warning: '#d97706',
        danger: '#dc2626',
      },
      fontFamily: {
        sans: ['Manrope', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        soft: '0 4px 24px -8px rgba(15,23,42,.08)',
        /**
         * Sombra dupla das cartas das telas de rodada (design de 19/08).
         *
         * São duas de propósito: a de 1px assenta a borda no fundo off-white
         * (sem ela a carta branca "flutua" sem apoio), e a de 32px dá a
         * elevação. Uma sombra só não faz as duas coisas — com o raio grande
         * a borda some, com o raio curto a carta não sobe.
         */
        carta: '0 1px 2px rgba(13,18,123,.06), 0 12px 32px rgba(13,18,123,.05)',
        elev: '0 8px 32px -8px rgba(15,23,42,.12)',
        band: '0 20px 48px -16px rgba(0,16,63,.35)',
        // Sombra da coluna congelada da grade — só aparece quando há rolagem
        // lateral, para a coluna fixa não parecer colada por cima do vazio.
        congelada: '6px 0 8px -6px rgba(15,23,42,.16)',
      },
      /**
       * MOVIMENTO — uma curva e quatro durações, para a aplicação inteira.
       *
       * A regra que as define: quanto mais vezes por dia a pessoa aciona o
       * controle, menos animação ela suporta. O cadastro é trabalho repetitivo,
       * então nada aqui passa de 280ms, e o feedback de clique é o mais rápido
       * de todos — um press lento faz o botão parecer emperrado.
       *
       * `ease-saida` é a única curva de entrada/resposta. Curva elástica
       * (overshoot) foi deliberadamente deixada de fora: diverte na primeira vez
       * e atrasa na centésima. Se um dia fizer falta, é para o que acontece uma
       * vez por sessão — toast de sucesso, entrada de modal — nunca para a grade.
       */
      transitionTimingFunction: {
        saida: 'cubic-bezier(.32,.72,0,1)',
      },
      transitionDuration: {
        press: '60ms',
        hover: '140ms',
        mover: '220ms',
        entrar: '280ms',
      },
      maxWidth: {
        content: '1400px',
      },
      keyframes: {
        fadeIn: {
          from: { opacity: '0', transform: 'translateY(6px)' },
          to: { opacity: '1', transform: 'none' },
        },
        fadeInUp: {
          from: { opacity: '0', transform: 'translateY(14px)' },
          to: { opacity: '1', transform: 'none' },
        },
        scaleIn: {
          from: { opacity: '0', transform: 'scale(.96)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        overlayIn: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        pulseKpi: {
          '0%': { backgroundColor: 'rgba(34,197,94,.12)' },
          '100%': { backgroundColor: 'transparent' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        draw: {
          to: { strokeDashoffset: '0' },
        },
        pop: {
          from: { opacity: '0', transform: 'scale(.3)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
        halo: {
          '0%': { transform: 'scale(.6)', opacity: '.6' },
          '70%': { transform: 'scale(2.1)', opacity: '0' },
          '100%': { transform: 'scale(2.1)', opacity: '0' },
        },
        sweep: {
          '0%': { transform: 'translateX(-101%)' },
          '100%': { transform: 'translateX(101%)' },
        },
        grow: {
          from: { transform: 'scaleX(0)' },
          to: { transform: 'scaleX(1)' },
        },
      },
      animation: {
        'fade-in': 'fadeIn .25s ease-out',
        'fade-in-up': 'fadeInUp .4s cubic-bezier(.16,1,.3,1) both',
        'scale-in': 'scaleIn .2s cubic-bezier(.16,1,.3,1) both',
        'overlay-in': 'overlayIn .2s ease-out both',
        'pulse-kpi': 'pulseKpi .7s ease-out',
        draw: 'draw 1800ms cubic-bezier(.2,.7,.3,1) forwards',
        pop: 'pop 260ms both',
        halo: 'halo 2400ms ease-out infinite',
        sweep: 'sweep 2800ms ease-in-out infinite',
        grow: 'grow 800ms cubic-bezier(.2,.7,.3,1) both',
      },
    },
  },
  plugins: [],
}
