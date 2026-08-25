interface LogoProps {
  size?: number
  /** Cor sólida (usada no rodapé). Sem valor => usa o gradiente institucional. */
  fill?: string
  showWave?: boolean
}

/** Marca-símbolo Aegea (gota + onda), extraído do protótipo. */
export function Logo({ size = 36, fill, showWave = true }: LogoProps) {
  const gradientId = 'aegea-logo-gradient'
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true">
      {!fill && (
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="rgb(var(--color-logo))" />
            <stop offset="100%" stopColor="rgb(var(--color-primary))" />
          </linearGradient>
        </defs>
      )}
      <path
        d="M20 4 C 20 4, 6 18, 6 26 a14 14 0 0 0 28 0 C 34 18, 20 4, 20 4 Z"
        fill={fill ?? `url(#${gradientId})`}
      />
      {showWave && (
        <path
          d="M14 24 Q 17 22, 20 24 T 26 24"
          stroke="white"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
        />
      )}
    </svg>
  )
}
