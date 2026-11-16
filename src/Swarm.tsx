// Swarming: en lugar de escalar el problema de nivel en nivel, lo investiga todo el equipo a la vez.
// Cada uno suma lo que sabe: una pista para seguir, algo que ya se descartó o un hallazgo.
import { useState } from 'react'
import { api, type Problem, type State, type SwarmKind } from './api'
import { FieldError, Ic, ago, can, count, initials, userName, type Run } from './ui'

const KINDS: [SwarmKind, string][] = [
  ['pista', 'Pista'],
  ['descartado', 'Descartado'],
  ['hallazgo', 'Hallazgo'],
]

export function SwarmPanel({ p, state, run }: { p: Problem; state: State; run: Run }) {
  const s = p.swarm
  const [kind, setKind] = useState<SwarmKind>('pista')
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const allowed = can(state, 'problemas') || can(state, 'resolver')
  const active = !!s && !s.closedAt
  const act = async (call: Promise<State>) => {
    setBusy(true)
    setError('')
    const ok = await run(call, { onError: setError })
    setBusy(false)
    return ok
  }

  if (!s && (p.status === 'resuelto' || !allowed)) return null
  return (
    <section className={`tx-side-card tx-solid swarm ${active ? 'on' : ''}`} aria-labelledby="sw-h">
      <div className="tx-section-head" style={{ margin: 0 }}>
        <h3 className="tx-h3" id="sw-h">
          Swarming
        </h3>
        {active && <span className="tx-badge analisis">En curso</span>}
      </div>

      {!s ? (
        <>
          <p className="tx-muted" style={{ fontSize: 13 }}>
            En lugar de pasarlo de mano en mano, invitá a todo el equipo a investigarlo ahora: cada uno suma lo que sabe.
          </p>
          <button type="button" className="tx-btn primary sm" style={{ alignSelf: 'flex-start' }} disabled={busy} onClick={() => act(api.startSwarm(p.id))}>
            <Ic n="target" />
            Abrir swarming
          </button>
        </>
      ) : (
        <>
          <div className="swarm-who">
            {s.members.map((id) => (
              <span key={id} className="tx-avatar" title={userName(state.users, id, 'Usuario eliminado')}>
                {initials(userName(state.users, id, '?'))}
              </span>
            ))}
            <span className="tx-caption">
              {count(s.members.length, 'persona', 'personas')} · {active ? `desde ${ago(s.startedAt)}` : 'cerrado'}
            </span>
          </div>
          {s.notes.length === 0 ? (
            <div className="tx-inline-empty">Todavía no hay aportes.</div>
          ) : (
            <ol className="swarm-notes">
              {[...s.notes].reverse().map((n, k) => (
                <li key={k} className={`swarm-note k-${n.kind}`}>
                  <span className="tx-overline">{KINDS.find(([v]) => v === n.kind)?.[1]}</span>
                  <p>{n.text}</p>
                  <span className="tx-caption">
                    {userName(state.users, n.userId, 'Usuario eliminado')} · {ago(n.at)}
                  </span>
                </li>
              ))}
            </ol>
          )}
          {active && allowed && (
            <form
              className="tx-stack"
              style={{ gap: 8 }}
              onSubmit={async (e) => {
                e.preventDefault()
                if (await act(api.swarmNote(p.id, kind, text))) setText('')
              }}
            >
              <div className="tx-seg" role="group" aria-label="Tipo de aporte">
                {KINDS.map(([v, label]) => (
                  <button key={v} type="button" aria-pressed={kind === v} onClick={() => setKind(v)}>
                    {label}
                  </button>
                ))}
              </div>
              <input className="tx-input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Qué viste, probaste o descartaste" aria-label="Aporte" />
              <div className="tx-row" style={{ gap: 8 }}>
                <button className="tx-btn secondary sm" disabled={busy || !text.trim()}>
                  Aportar
                </button>
                {!s.members.includes(state.me) && (
                  <button type="button" className="tx-btn ghost sm" disabled={busy} onClick={() => act(api.joinSwarm(p.id))}>
                    Sumarme
                  </button>
                )}
                <button type="button" className="tx-btn ghost sm" disabled={busy} onClick={() => act(api.closeSwarm(p.id))}>
                  Cerrar swarming
                </button>
              </div>
            </form>
          )}
          {!active && allowed && p.status !== 'resuelto' && (
            <button type="button" className="tx-btn ghost sm" style={{ alignSelf: 'flex-start' }} disabled={busy} onClick={() => act(api.startSwarm(p.id))}>
              Volver a abrirlo
            </button>
          )}
        </>
      )}
      {error && <FieldError id="sw-e">{error}</FieldError>}
    </section>
  )
}
