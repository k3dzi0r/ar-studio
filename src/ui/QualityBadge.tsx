import type { QualityReport } from '../core/types'

const LABEL: Record<QualityReport['level'], string> = {
  poor: 'Słaby znacznik',
  fair: 'Przeciętny znacznik',
  good: 'Dobry znacznik',
  excellent: 'Świetny znacznik',
}

export function QualityBadge({ q, detailed }: { q: QualityReport; detailed?: boolean }) {
  return (
    <div className={`quality q-${q.level}`}>
      <div className="quality-head">
        <span className="quality-dot" />
        <strong>{LABEL[q.level]}</strong>
        <span className="quality-score">{q.score}/100</span>
      </div>
      {detailed && (
        <>
          <div className="meter">
            <i style={{ width: `${q.score}%` }} />
          </div>
          <ul className="quality-msgs">
            {q.messages.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
          <p className="muted small">
            Punkty charakterystyczne: {q.featureCount} · pokrycie obrazu: {Math.round(q.coverage * 100)}% ·{' '}
            {q.width}×{q.height}px
          </p>
        </>
      )}
    </div>
  )
}
