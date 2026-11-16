// Impacto de un problema y su revisión post-problema sin culpables.
import { useState } from 'react'
import { api, type Incident, type Problem, type State } from './api'
import { FieldError, Ic, count, fmt, userName, usersWith, type Run } from './ui'

const HOUR = 36e5

// impact resume lo que costó (o está costando) un problema: incidentes, horas de servicio afectado
// (desde que se reportó cada incidente hasta que se resolvió, o hasta ahora) y personas que lo sufrieron.
export function impact(p: Problem, incidents: Incident[]) {
  const linked = incidents.filter((i) => i.problemId === p.id)
  const now = Date.now()
  const hours = linked.reduce((h, i) => h + ((i.resolvedAt ? +new Date(i.resolvedAt) : now) - +new Date(i.createdAt)) / HOUR, 0)
  const people = new Set(linked.map((i) => i.createdBy)).size
  return { incidents: linked.length, open: linked.filter((i) => !i.resolvedAt).length, hours: Math.round(hours), people }
}

const span = (from?: string, to?: string) => {
  if (!from || !to) return '—'
  const h = (+new Date(to) - +new Date(from)) / HOUR
  return h < 48 ? `${Math.round(h)} h` : `${Math.round(h / 24)} días`
}

// ImpactStrip: el costo acumulado, a la vista en el detalle del problema.
export function ImpactStrip({ p, state }: { p: Problem; state: State }) {
  const m = impact(p, state.incidents)
  if (!m.incidents) return null
  return (
    <div className="pb-impact" aria-label="Impacto acumulado">
      <span>
        <b>{m.incidents}</b> {m.incidents === 1 ? 'incidente' : 'incidentes'}
        {m.open > 0 && <em> · {m.open} abiertos</em>}
      </span>
      <span>
        <b>{m.hours} h</b> de servicio afectado
      </span>
      <span>
        <b>{m.people}</b> {m.people === 1 ? 'persona afectada' : 'personas afectadas'}
      </span>
    </div>
  )
}

type Draft = { whatHappened: string; learned: string; actions: { text: string; ownerId: number; due: string; done: boolean }[] }

export function ReviewPanel({ p, state, run }: { p: Problem; state: State; run: Run }) {
  const r = p.review
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Draft>(() => ({
    whatHappened: r?.whatHappened ?? '',
    learned: r?.learned ?? '',
    actions: r?.actions.length ? r.actions : [{ text: '', ownerId: 0, due: '', done: false }],
  }))
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const m = impact(p, state.incidents)
  const at = (kind: string) => p.history.find((h) => h.kind === kind)?.at
  const resolvedAt = at('resuelto')
  const people = usersWith(state, 'resolver', 0).concat(usersWith(state, 'problemas', 0)).filter((u, k, all) => all.findIndex((x) => x.id === u.id) === k)
  const setAction = (k: number, patch: Partial<Draft['actions'][number]>) =>
    setDraft({ ...draft, actions: draft.actions.map((a, j) => (j === k ? { ...a, ...patch } : a)) })

  return (
    <section className="tx-panel tx-solid" aria-labelledby="pir-h">
      <div className="tx-panel-head">
        <div>
          <span className="tx-overline">Sin culpables: buscamos qué falló en el proceso, no quién</span>
          <h2 className="tx-h3" id="pir-h">
            Revisión post-problema
          </h2>
        </div>
        {r && !editing && (
          <button type="button" className="tx-btn ghost sm" onClick={() => setEditing(true)}>
            <Ic n="edit" />
            Editar
          </button>
        )}
      </div>

      <div className="pir-facts">
        <div>
          <span className="tx-caption">Incidentes</span>
          <b>{m.incidents}</b>
        </div>
        <div>
          <span className="tx-caption">Servicio afectado</span>
          <b>{m.hours} h</b>
        </div>
        <div>
          <span className="tx-caption">Personas afectadas</span>
          <b>{m.people}</b>
        </div>
        <div>
          <span className="tx-caption">Hasta la causa raíz</span>
          <b>{span(p.createdAt, at('conocido'))}</b>
        </div>
        <div>
          <span className="tx-caption">Hasta la solución</span>
          <b>{span(p.createdAt, resolvedAt)}</b>
        </div>
        <div>
          <span className="tx-caption">Usos del workaround</span>
          <b>{(p.workaroundUses ?? []).length}</b>
        </div>
      </div>

      {r && !editing ? (
        <>
          <div className="tx-block">
            <span className="tx-overline">Qué pasó</span>
            <p style={{ whiteSpace: 'pre-wrap' }}>{r.whatHappened}</p>
          </div>
          {r.learned && (
            <div className="tx-block">
              <span className="tx-overline">Qué aprendimos</span>
              <p style={{ whiteSpace: 'pre-wrap' }}>{r.learned}</p>
            </div>
          )}
          <div className="tx-block">
            <span className="tx-overline">Acciones para que no se repita</span>
            <ul className="pir-actions">
              {r.actions.map((a, k) => {
                const late = !a.done && a.due && new Date(a.due + 'T23:59') < new Date()
                return (
                  <li key={k} className={a.done ? 'done' : ''}>
                    <label className={`tx-check ${a.done ? 'is-on' : ''}`}>
                      <input type="checkbox" checked={a.done} onChange={(e) => run(api.setActionDone(p.id, k, e.target.checked))} />
                      <span className="box">{a.done && <Ic n="check" />}</span>
                      <span className="pir-text">{a.text}</span>
                    </label>
                    <span className="tx-caption" style={late ? { color: 'var(--danger-fg)' } : undefined}>
                      {userName(state.users, a.ownerId, 'Sin responsable')}
                      {a.due && ` · ${late ? 'venció' : 'para'} el ${a.due.split('-').reverse().slice(0, 2).join('/')}`}
                    </span>
                  </li>
                )
              })}
            </ul>
          </div>
          <span className="tx-caption">
            Escrita por {userName(state.users, r.userId, 'alguien que ya no está')} el {fmt(r.at)}
          </span>
        </>
      ) : !editing ? (
        <div className="tx-inline-empty">
          <span style={{ flex: 1 }}>Todavía no se escribió la revisión. Es el momento de dejar lo aprendido mientras está fresco.</span>
          <button type="button" className="tx-btn primary sm" onClick={() => setEditing(true)}>
            <Ic n="edit" />
            Escribir la revisión
          </button>
        </div>
      ) : (
        <form
          className="tx-stack"
          style={{ gap: 14 }}
          onSubmit={async (e) => {
            e.preventDefault()
            setBusy(true)
            setError('')
            const ok = await run(api.saveReview(p.id, draft), { onError: setError })
            setBusy(false)
            if (ok) setEditing(false)
          }}
        >
          <div className="tx-field">
            <label className="tx-label" htmlFor="pir-what">
              Qué pasó <span className="req">*</span>
            </label>
            <textarea
              id="pir-what"
              className="tx-textarea"
              value={draft.whatHappened}
              onChange={(e) => setDraft({ ...draft, whatHappened: e.target.value })}
              placeholder="La secuencia de hechos, en orden. Sin nombres propios: qué falló en el proceso."
            />
          </div>
          <div className="tx-field">
            <label className="tx-label" htmlFor="pir-learn">
              Qué aprendimos
            </label>
            <textarea
              id="pir-learn"
              className="tx-textarea"
              style={{ minHeight: 72 }}
              value={draft.learned}
              onChange={(e) => setDraft({ ...draft, learned: e.target.value })}
              placeholder="Qué no sabíamos, qué funcionó y qué no."
            />
          </div>
          <div className="tx-field">
            <span className="tx-label">Acciones para que no se repita</span>
            {draft.actions.map((a, k) => (
              <div key={k} className="pir-row">
                <input className="tx-input" value={a.text} onChange={(e) => setAction(k, { text: e.target.value })} placeholder="Qué hay que hacer" aria-label={`Acción ${k + 1}`} />
                <select className="tx-input" value={a.ownerId} onChange={(e) => setAction(k, { ownerId: Number(e.target.value) })} aria-label={`Responsable de la acción ${k + 1}`}>
                  <option value={0}>Sin responsable</option>
                  {people.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
                <input className="tx-input" type="date" value={a.due} onChange={(e) => setAction(k, { due: e.target.value })} aria-label={`Fecha de la acción ${k + 1}`} />
              </div>
            ))}
            <button
              type="button"
              className="tx-btn ghost sm"
              style={{ alignSelf: 'flex-start' }}
              onClick={() => setDraft({ ...draft, actions: [...draft.actions, { text: '', ownerId: 0, due: '', done: false }] })}
            >
              <Ic n="plus" />
              Otra acción
            </button>
          </div>
          {error && <FieldError id="pir-e">{error}</FieldError>}
          <div className="tx-actions">
            <button className="tx-btn primary" disabled={busy}>
              <Ic n="check" />
              Guardar revisión
            </button>
            <button type="button" className="tx-btn ghost" onClick={() => setEditing(false)}>
              Cancelar
            </button>
          </div>
        </form>
      )}
      {r && (
        <span className="tx-caption">
          {count(r.actions.filter((a) => a.done).length, 'acción hecha', 'acciones hechas')} de {r.actions.length}
        </span>
      )}
    </section>
  )
}
