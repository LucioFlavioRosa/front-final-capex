import { useMemo, useState } from 'react'
import type { Row } from '../../../data/cadastroUnidade/types'
import { toNum } from '../../../domain/numero'

interface FatorEsgotoPreviewProps {
  rows: Row[]
}

const W = 520
const H = 140
const PAD_L = 40
const PAD_B = 22
const PAD_T = 10
const PAD_R = 10

export function FatorEsgotoPreview({ rows }: FatorEsgotoPreviewProps) {
  const cidades = useMemo(() => {
    const vistos = new Map<string, string>()
    rows.forEach((r) => {
      if (r.cidade_id && !vistos.has(r.cidade_id)) vistos.set(r.cidade_id, r.cidade_name || r.cidade_id)
    })
    return Array.from(vistos.entries())
  }, [rows])

  const [cidadeId, setCidadeId] = useState(cidades[0]?.[0] ?? '')
  const cidadeAtual = cidades.find(([id]) => id === cidadeId) ?? cidades[0]

  const pontos = useMemo(() => {
    return rows
      .filter((r) => r.cidade_id === (cidadeAtual?.[0] ?? ''))
      .map((r) => ({ cobertura: toNum(r.cobertura_pct), paridade: toNum(r.paridade) }))
      .filter((p): p is { cobertura: number; paridade: number } => p.cobertura != null && p.paridade != null)
      .sort((a, b) => a.cobertura - b.cobertura)
  }, [rows, cidadeAtual])

  if (!cidades.length) return null

  if (pontos.length < 1) {
    return (
      <div className="rounded-xl border border-ink-100 bg-ink-50/60 p-4 mb-4 text-sm text-ink-400">
        Preencha ao menos uma faixa para ver a escala de paridade.
      </div>
    )
  }

  const paridadeMin = Math.min(0.7, ...pontos.map((p) => p.paridade))
  const paridadeMax = Math.max(1.0, ...pontos.map((p) => p.paridade))
  const x = (cob: number) => PAD_L + (cob / 100) * (W - PAD_L - PAD_R)
  const y = (par: number) => H - PAD_B - ((par - paridadeMin) / (paridadeMax - paridadeMin || 1)) * (H - PAD_T - PAD_B)

  const stepPath = pontos
    .map((p, i) => {
      const xi = x(p.cobertura)
      const yi = y(p.paridade)
      if (i === 0) return `M${PAD_L},${yi} L${xi},${yi}`
      const yPrev = y(pontos[i - 1].paridade)
      return `L${xi},${yPrev} L${xi},${yi}`
    })
    .join(' ') + ` L${W - PAD_R},${y(pontos[pontos.length - 1].paridade)}`

  return (
    <div className="rounded-xl border border-ink-100 bg-ink-50/60 p-4 mb-4">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <span className="text-xs font-semibold text-ink-600 uppercase tracking-wide">Escala de paridade por cobertura</span>
        {cidades.length > 1 && (
          <select
            value={cidadeAtual?.[0] ?? ''}
            onChange={(e) => setCidadeId(e.target.value)}
            className="text-xs rounded-lg border border-ink-200 bg-white px-2 py-1"
          >
            {cidades.map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}
          </select>
        )}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ maxWidth: W, height: H }}>
        {[0, 25, 50, 75, 100].map((tick) => (
          <text key={tick} x={x(tick)} y={H - 6} fontSize={9} fontFamily="'IBM Plex Mono',monospace" fill="#94a3b8" textAnchor="middle">{tick}%</text>
        ))}
        <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={H - PAD_B} stroke="#e2e8f0" />
        <line x1={PAD_L} y1={H - PAD_B} x2={W - PAD_R} y2={H - PAD_B} stroke="#e2e8f0" />
        <path d={stepPath} fill="none" stroke="rgb(var(--color-primary))" strokeWidth={2} />
        {pontos.map((p) => (
          <g key={p.cobertura}>
            <circle cx={x(p.cobertura)} cy={y(p.paridade)} r={3.5} fill="rgb(var(--color-primary))" />
            <text x={x(p.cobertura)} y={y(p.paridade) - 8} fontSize={9.5} fontFamily="'IBM Plex Mono',monospace" fill="rgb(var(--color-secondary))" textAnchor="middle" fontWeight={700}>
              {p.paridade.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </text>
          </g>
        ))}
      </svg>
      <p className="text-[11px] text-ink-400 mt-1">
        Vale a paridade da maior faixa cuja cobertura ≤ cobertura realizada da cidade no ano.
      </p>
    </div>
  )
}
