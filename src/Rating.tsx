// Valoración de la atención (CSAT): la deja quien reportó el incidente cuando se resuelve.
import { useState } from 'react'
import { api, type Incident, type State } from './api'
import { FieldError, Ic, can, fmt, type Run } from './ui'

const LABELS = ['', 'Muy mal', 'Mal', 'Regular', 'Bien', 'Excelente']

const Stars = ({ n }: { n: number }) => (
  <span className="rt-stars" aria-label={`${n} de 5`}>
    {[1, 2, 3, 4, 5].map((k) => (
      <i key={k} className={k <= n ? 'on' : ''} />
    ))}
  </span>
)

export function RatingBlock({ i, state, run }: { i: Incident; state: State; run: Run }) {
  const [value, setValue] = useState(0)
  const [comment, setComment] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const mine = i.createdBy === state.me && can(state, 'crear')

  if (i.rating > 0)
    return (
      <div className="tx-callout rt-done">
        <div className="tx-row" style={{ gap: 10 }}>
          <span className="tx-overline">{mine ? 'Tu valoración' : 'Valoración de quien lo reportó'}</span>
          <Stars n={i.rating} />
          <span className="tx-strong">{LABELS[i.rating]}</span>
        </div>
        {i.ratingComment && <p>«{i.ratingComment}»</p>}
        {i.ratedAt && <span className="tx-caption">{fmt(i.ratedAt)}</span>}
      </div>
    )
  if (!mine) return null

  return (
    <form
      className="tx-callout rt-ask"
      onSubmit={async (e) => {
        e.preventDefault()
        if (!value) return setError('Elegí una opción.')
        setBusy(true)
        await run(api.rate(i.id, value, comment), { onError: setError })
        setBusy(false)
      }}
    >
      <span className="tx-strong">¿Cómo te atendimos?</span>
      <div className="rt-options" role="radiogroup" aria-label="Valoración">
        {[1, 2, 3, 4, 5].map((k) => (
          <button key={k} type="button" role="radio" aria-checked={value === k} className={`rt-opt ${value === k ? 'on' : ''}`} onClick={() => setValue(k)}>
            <b>{k}</b>
            <span>{LABELS[k]}</span>
          </button>
        ))}
      </div>
      {value > 0 && (
        <>
          <input
            className="tx-input"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={value >= 4 ? '¿Algo para destacar? (opcional)' : '¿Qué podríamos haber hecho mejor? (opcional)'}
            aria-label="Comentario"
          />
          <button className="tx-btn primary sm" style={{ alignSelf: 'flex-start' }} disabled={busy}>
            <Ic n="check" />
            Enviar
          </button>
        </>
      )}
      {error && <FieldError id="rt-e">{error}</FieldError>}
    </form>
  )
}
