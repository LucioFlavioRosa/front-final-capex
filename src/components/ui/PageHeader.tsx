import { Fragment, type ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { CaretRight, type Icon } from '@phosphor-icons/react'

export interface Crumb {
  label: string
  to?: string
}

interface PageHeaderProps {
  title: string
  subtitle?: string
  icon?: Icon
  eyebrow?: string
  breadcrumbs?: Crumb[]
  actions?: ReactNode
  className?: string
}

/** Cabeçalho padrão das telas internas: eyebrow/breadcrumb + título + ações. */
export function PageHeader({
  title,
  subtitle,
  icon: IconCmp,
  eyebrow,
  breadcrumbs,
  actions,
  className = '',
}: PageHeaderProps) {
  return (
    <div className={`mb-[22px] flex flex-wrap items-end justify-between gap-5 ${className}`}>
      <div>
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav className="mb-1 flex items-center gap-1.5 text-xs text-water-600/60" aria-label="Trilha de navegação">
            {breadcrumbs.map((crumb, i) => (
              <Fragment key={i}>
                {i > 0 && <CaretRight className="text-[9px]" />}
                {crumb.to ? (
                  <NavLink to={crumb.to} className="font-semibold text-water-600/60 hover:text-water-600">
                    {crumb.label}
                  </NavLink>
                ) : (
                  <span className="font-mono text-water-600/80">{crumb.label}</span>
                )}
              </Fragment>
            ))}
          </nav>
        )}
        {eyebrow && (
          <div className="text-[11px] font-semibold uppercase tracking-[.1em] text-water-600/60">{eyebrow}</div>
        )}
        <h1 className="mt-2 flex items-center gap-2 text-[28px] font-extrabold leading-tight tracking-tight text-water-600">
          {IconCmp && <IconCmp weight="fill" className="text-water-600" />}
          {title}
        </h1>
        {subtitle && <p className="mt-2 max-w-xl text-water-600/80">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}
