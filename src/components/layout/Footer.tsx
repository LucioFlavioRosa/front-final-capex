import { NavLink } from 'react-router-dom'
import { navItemsVisiveis } from '../../config/navigation'
import { useAuth } from '../../auth/AuthContext'

/**
 * Rodapé institucional — mesma formatação do rodapé do site da Aegea: azul chapado
 * da marca, marca-símbolo æ em turquesa à esquerda e colunas de links espaçadas,
 * com rótulo em caixa-alta e itens em peso normal.
 */

export function Footer() {
  const { user } = useAuth()
  // N4: os mesmos módulos do cabeçalho — um link no rodapé para uma tela que
  // o papel não acessa seria pior que não ter link nenhum.
  const itensVisiveis = navItemsVisiveis(user?.papeis ?? [])

  /** Colunas do rodapé. `to` presente => vira link de rota; sem `to` => texto informativo. */
  const colunas: { titulo: string; itens: { texto: string; to?: string }[] }[] = [
    {
      titulo: 'Plataforma',
      itens: itensVisiveis.map((item) => ({ texto: item.label, to: item.path })),
    },
    {
      titulo: 'Unidade',
      itens: [{ texto: 'Águas do Rio' }, { texto: 'Bloco 2' }],
    },
    {
      titulo: 'Ciclo',
      itens: [{ texto: 'Ciclo 2 · 2026' }, { texto: 'Rolling forecast' }],
    },
    {
      titulo: 'Entrega',
      itens: [{ texto: 'Peers Consulting & Technology' }, { texto: 'Aegea Saneamento' }],
    },
  ]

  return (
    <footer className="footer-surface mt-auto">
      <div className="max-w-content mx-auto flex flex-wrap items-start gap-x-16 gap-y-12 px-4 py-20 md:px-6">
        <div
          aria-label="aegea"
          role="img"
          className="footer-mark h-14 w-[104px] flex-none md:mr-8"
        />

        {colunas.map((coluna) => (
          <div key={coluna.titulo} className="flex flex-col gap-6">
            <h2 className="text-[13.5px] font-extrabold uppercase tracking-[.02em] text-white">
              {coluna.titulo}
            </h2>
            {coluna.itens.map((item) =>
              item.to ? (
                <NavLink
                  key={item.texto}
                  to={item.to}
                  className="w-fit text-[15px] text-white/90 transition-colors duration-hover ease-saida hover:text-aegea-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-aegea-400"
                >
                  {item.texto}
                </NavLink>
              ) : (
                <span key={item.texto} className="text-[15px] text-white/90">
                  {item.texto}
                </span>
              ),
            )}
          </div>
        ))}
      </div>

      <div className="footer-line border-t">
        <div className="max-w-content mx-auto flex flex-wrap items-center justify-between gap-2 px-4 py-5 md:px-6">
          <span className="inline-flex items-center gap-2 text-[12.5px] text-white/75">
            <span className="h-1.5 w-1.5 flex-none rounded-full bg-aegea-400" />
            Protótipo — não é ambiente de produção.
          </span>
          <span className="text-[12.5px] text-white/75">© 2026 Aegea Saneamento</span>
        </div>
      </div>
    </footer>
  )
}
