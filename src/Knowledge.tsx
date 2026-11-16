// Errores conocidos y workarounds en el día a día: sugerencias mientras se escribe un ticket,
// incidentes parecidos, aplicar un workaround y medir si funciona.
import { useEffect, useState } from 'react'
import { api, type IncidentHit, type Problem, type ProblemHit, type State } from './api'
import { FieldError, Ic, IncidentId, ProblemId, StatusBadge, Workaround, ago, can, count, type Run } from './ui'

// useMatches busca errores conocidos parecidos a un texto, esperando a que se deje de escribir.
export function useMatches(text: string, service: string, enabled: boolean) {
  const [hits, setHits] = useState<ProblemHit[]>([])
  useEffect(() => {
    if (!enabled || text.trim().length < 4) {
      setHits([])
      return
    }
    let stale = false
    const timer = setTimeout(() => {
      api.matchKnowledge(text, service).then((h) => !stale && setHits(h), () => !stale && setHits([]))
    }, 300)
    return () => {
      stale = true
      clearTimeout(timer)
    }
  }, [text, service, enabled])
  return hits
}

const Match = ({ score, shared }: { score: number; shared: string[] }) => (
  <span className="kn-match" title={`Coincide en: ${shared.join(', ')}`}>
    <span className="kn-bar" aria-hidden="true">
      <i style={{ width: `${Math.round(score * 100)}%` }} />
    </span>
    {Math.round(score * 100)}% parecido
  </span>
)

// Mientras se carga un incidente: quien atiende puede vincularlo (y resolverlo con el workaround al registrarlo);
// quien reporta ve el workaround compartido y, si le alcanza, no abre el ticket.
export function KnownErrorHints(props: {
  hits: ProblemHit[]
  team: boolean
  linkTo: number
  onLink: (problemId: number) => void
  applyNow: boolean
  onApplyNow: (v: boolean) => void
  onDeflected: (problemId: number) => Promise<boolean>
  goProblem?: (id: number) => void
}) {
  const { hits, team } = props
  const [busy, setBusy] = useState(0)
  if (hits.length === 0) return null
  return (
    <div className="tx-notice tx-glass-strong kn-hints" role="status">
      <div className="tx-notice-ic">
        <Ic n="bulb" size="lg" />
      </div>
      <div className="tx-stack" style={{ gap: 12, minWidth: 0 }}>
        <span className="tx-strong">
          {team ? 'Esto se parece a un problema que ya conocemos' : 'Antes de abrir el ticket, probá esto'}
        </span>
        {hits.map((h) => (
          <div key={h.problemId} className="kn-hit">
            <div className="tx-row" style={{ gap: 8 }}>
              {team && <ProblemId id={h.problemId} go={props.goProblem} />}
              <span className="tx-strong">{h.title}</span>
              {team && <StatusBadge s={h.status} />}
              <Match score={h.score} shared={h.shared} />
            </div>
            {h.workaround && <Workaround text={h.workaround} />}
            {team ? (
              <div className="tx-row" style={{ gap: 12 }}>
                <label className={`tx-check ${props.linkTo === h.problemId ? 'is-on' : ''}`}>
                  <input type="checkbox" checked={props.linkTo === h.problemId} onChange={(e) => props.onLink(e.target.checked ? h.problemId : 0)} />
                  <span className="box">{props.linkTo === h.problemId && <Ic n="check" />}</span>
                  Vincular al registrar
                </label>
                {h.workaround && props.linkTo === h.problemId && (
                  <label className={`tx-check ${props.applyNow ? 'is-on' : ''}`}>
                    <input type="checkbox" checked={props.applyNow} onChange={(e) => props.onApplyNow(e.target.checked)} />
                    <span className="box">{props.applyNow && <Ic n="check" />}</span>
                    Resolverlo con el workaround
                  </label>
                )}
              </div>
            ) : (
              <div className="tx-row" style={{ gap: 8 }}>
                <button
                  type="button"
                  className="tx-btn secondary sm"
                  disabled={busy > 0}
                  onClick={async () => {
                    setBusy(h.problemId)
                    await props.onDeflected(h.problemId)
                    setBusy(0)
                  }}
                >
                  <Ic n="check" />
                  Me sirvió, no hace falta el ticket
                </button>
                <span className="tx-caption">Si no funciona, seguí y registralo igual.</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// Panel del detalle de un incidente: errores conocidos e incidentes parecidos, para quien lo atiende.
export function RelatedPanel(props: { incidentId: number; refresh: string; open: boolean; state: State; run: Run; goProblem?: (id: number) => void; goIncident: (id: number) => void }) {
  const { incidentId, state, run } = props
  const [data, setData] = useState<{ problems: ProblemHit[]; incidents: IncidentHit[] } | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(0)
  const canResolve = can(state, 'resolver')

  useEffect(() => {
    let stale = false
    api.related(incidentId).then(
      (d) => !stale && setData(d),
      () => !stale && setData({ problems: [], incidents: [] }),
    )
    return () => {
      stale = true
    }
  }, [incidentId, props.refresh])

  if (!data || (data.problems.length === 0 && data.incidents.length === 0)) return null
  return (
    <section className="tx-side-card tx-glass" aria-labelledby="kn-rel">
      <h3 className="tx-h3" id="kn-rel">
        Se parece a
      </h3>
      {data.problems.map((h) => (
        <div key={h.problemId} className="kn-hit">
          <div className="tx-row" style={{ gap: 8 }}>
            <ProblemId id={h.problemId} go={props.goProblem} />
            <span className="t">{h.title}</span>
          </div>
          <div className="tx-row" style={{ gap: 8 }}>
            <StatusBadge s={h.status} />
            <Match score={h.score} shared={h.shared} />
          </div>
          {h.workaround && props.open && canResolve && (
            <button
              type="button"
              className="tx-btn secondary sm"
              style={{ alignSelf: 'flex-start' }}
              disabled={busy > 0}
              title={h.workaround}
              onClick={async () => {
                setBusy(h.problemId)
                setError('')
                await run(api.applyWorkaround(incidentId, h.problemId), { onError: setError })
                setBusy(0)
              }}
            >
              <Ic n="bulb" />
              Aplicar workaround
            </button>
          )}
        </div>
      ))}
      {error && <FieldError id="kn-rel-e">{error}</FieldError>}
      {data.incidents.length > 0 && (
        <>
          <span className="tx-overline">Incidentes parecidos</span>
          {data.incidents.map((h) => (
            <div key={h.incidentId} className="kn-inc">
              <IncidentId id={h.incidentId} go={props.goIncident} />
              <span className="t">{h.title}</span>
              <Match score={h.score} shared={h.shared} />
            </div>
          ))}
        </>
      )}
    </section>
  )
}

// Cuánto se usó un workaround y si funcionó: los usos que terminaron en reapertura no cuentan como efectivos.
export function WorkaroundStats({ p }: { p: Problem }) {
  const uses = p.workaroundUses ?? []
  if (uses.length === 0 && !p.deflections) return <span className="tx-caption">Todavía no se usó.</span>
  const failed = uses.filter((u) => u.failed).length
  const pct = uses.length ? Math.round(((uses.length - failed) * 100) / uses.length) : null
  const last = uses.length ? uses[uses.length - 1].at : ''
  return (
    <div className="kn-stats">
      <span>
        <b>{uses.length}</b> {uses.length === 1 ? 'uso' : 'usos'}
      </span>
      {pct !== null && (
        <span className={pct < 70 ? 'kn-low' : ''}>
          <b>{pct}%</b> efectivo
        </span>
      )}
      {p.deflections > 0 && (
        <span>
          <b>{p.deflections}</b> {p.deflections === 1 ? 'ticket evitado' : 'tickets evitados'}
        </span>
      )}
      {last && <span className="tx-caption">último {ago(last)}</span>}
    </div>
  )
}

// Workaround de un error conocido: se edita mientras se busca la solución definitiva y se decide si lo ven
// quienes reportan. También se puede aplicar de una vez a los incidentes abiertos del problema.
export function WorkaroundPanel({ p, state, run, openIds }: { p: Problem; state: State; run: Run; openIds: number[] }) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(p.workaround)
  const [shared, setShared] = useState(p.workaroundShared)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const canResolve = can(state, 'resolver')

  const save = async (nextText: string, nextShared: boolean) => {
    setBusy(true)
    setError('')
    const s = await run(api.updateWorkaround(p.id, nextText, nextShared), { onError: setError })
    setBusy(false)
    if (s) setEditing(false)
  }
  const applyAll = async () => {
    setBusy(true)
    setError('')
    for (const id of openIds) {
      if (!(await run(api.applyWorkaround(id, p.id), { onError: setError }))) break
    }
    setBusy(false)
  }

  return (
    <div className="tx-stack" style={{ gap: 10 }}>
      {editing ? (
        <div className="tx-field">
          <label className="tx-label" htmlFor="wa-edit">
            Workaround
          </label>
          <textarea id="wa-edit" className="tx-textarea" value={text} onChange={(e) => setText(e.target.value)} style={{ minHeight: 76 }} />
          <div className="tx-actions">
            <button type="button" className="tx-btn primary sm" disabled={busy} onClick={() => save(text, shared && text.trim() !== '')}>
              Guardar
            </button>
            <button
              type="button"
              className="tx-btn ghost sm"
              onClick={() => {
                setText(p.workaround)
                setEditing(false)
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : p.workaround ? (
        <Workaround text={p.workaround} />
      ) : (
        <div className="tx-inline-empty">Todavía no hay un workaround: mientras tanto, cada incidente se resuelve por separado.</div>
      )}
      <WorkaroundStats p={p} />
      <div className="tx-row" style={{ gap: 12 }}>
        {!editing && (
          <button type="button" className="tx-btn ghost sm" onClick={() => setEditing(true)}>
            <Ic n="edit" />
            {p.workaround ? 'Editar' : 'Escribir workaround'}
          </button>
        )}
        {p.workaround && (
          <label className={`tx-check ${shared ? 'is-on' : ''}`} title="Quienes reportan lo ven mientras escriben un incidente parecido">
            <input
              type="checkbox"
              checked={shared}
              disabled={busy}
              onChange={(e) => {
                setShared(e.target.checked)
                save(p.workaround, e.target.checked)
              }}
            />
            <span className="box">{shared && <Ic n="check" />}</span>
            Mostrárselo a quienes reportan
          </label>
        )}
        {p.workaround && canResolve && openIds.length > 0 && (
          <button type="button" className="tx-btn secondary sm" disabled={busy} onClick={applyAll}>
            <Ic n="bulb" />
            Aplicar a {count(openIds.length, 'incidente abierto', 'incidentes abiertos')}
          </button>
        )}
      </div>
      {error && <FieldError id="wa-e">{error}</FieldError>}
    </div>
  )
}
