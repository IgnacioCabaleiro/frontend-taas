// Métricas de SLA: cumplimiento de la primera respuesta y de la resolución, su desglose, la tendencia y lo que
// está por vencer. Las calcula el backend (GET /metrics/sla) sobre los incidentes creados en el período.
import { useEffect, useState } from 'react'
import { api, SLA_PERIODS, type SlaGroup, type SlaMetrics as Metrics, type SlaStat, type State } from './api'
import { Ic, IncidentId, Prio, author, count, fmt, type Run } from './ui'

const pct = (v: number | null) => (v === null ? '—' : `${v}%`)
const hours = (h: number | null) => (h === null ? '—' : `${h.toFixed(1)} h`)
const cap = (s: string) => s[0].toUpperCase() + s.slice(1)
const dm = (iso: string) => {
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
}
// "vence en 3 h" / "venció hace 2 h", con la hora exacta en el título.
function when(iso: string, late: boolean, now: number) {
  const h = Math.max(1, Math.round(Math.abs(+new Date(iso) - now) / 36e5))
  const span = h < 48 ? `${h} h` : `${Math.round(h / 24)} días`
  return late ? `venció hace ${span}` : `vence en ${span}`
}

export function SlaMetrics({ state, run, goIncident }: { state: State; run: Run; goIncident?: (id: number) => void }) {
  const [days, setDays] = useState<number>(30)
  const [data, setData] = useState<Metrics | null>(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0) // sube al reintentar para volver a pedir las métricas

  useEffect(() => {
    let live = true // si cambia el período mientras carga, se ignora la respuesta vieja
    setError('')
    api
      .slaMetrics(days)
      .then((m) => live && setData(m))
      .catch((e) => {
        if (!live) return
        if ('expired' in e) run(Promise.reject(e)) // la sesión venció: App la cierra
        else setError(e.message)
      })
    return () => {
      live = false
    }
  }, [days, attempt])

  const shown = data && data.days === days ? data : null

  return (
    <>
      <div className="tx-filters">
        {SLA_PERIODS.map((d) => (
          <button key={d} className="tx-filter" aria-pressed={d === days} onClick={() => setDays(d)}>
            Últimos {d} días
          </button>
        ))}
      </div>

      {error && (
        <div className="tx-banner" role="alert">
          <Ic n="warn" />
          <span className="grow">{error}</span>
          <button className="tx-btn ghost sm" onClick={() => setAttempt((n) => n + 1)}>
            <Ic n="retry" />
            Reintentar
          </button>
        </div>
      )}
      {!shown && !error && <div className="tx-inline-empty">Calculando métricas…</div>}
      {shown && <Content m={shown} state={state} goIncident={goIncident} />}
    </>
  )
}

function Content({ m, state, goIncident }: { m: Metrics; state: State; goIncident?: (id: number) => void }) {
  const { users } = state
  const t = m.total
  const now = +new Date(m.generatedAt)
  const kpis = [
    { label: 'Cumplimiento de resolución', dot: 'var(--status-resuelto-dot)', val: pct(t.resolution.compliance), foot: footOf(t.resolution, 'resolución') },
    { label: 'Cumplimiento de primera respuesta', dot: 'var(--brand)', val: pct(t.response.compliance), foot: footOf(t.response, 'respuesta') },
    { label: 'Tiempo medio de resolución', dot: 'var(--ink-subtle)', val: hours(t.avgResolutionHours), foot: 'de creación a resolución' },
    { label: 'Tiempo medio de primera respuesta', dot: 'var(--viz-2)', val: hours(t.avgResponseHours), foot: 'de creación a la primera respuesta' },
  ]

  return (
    <>
      <section className="tx-metrics kpi-row" aria-label="Indicadores de SLA del período">
        {kpis.map((k) => (
          <div key={k.label} className="tx-metric tx-glass">
            <div className="lbl">
              <span className="dot" style={{ background: k.dot }} />
              {k.label}
            </div>
            <div className="val">{k.val}</div>
            <div className="foot">{k.foot}</div>
          </div>
        ))}
      </section>

      <section>
        <div className="tx-section-head">
          <h2 className="tx-h3">Por vencer o vencidos</h2>
        </div>
        {m.atRisk.length === 0 ? (
          <div className="tx-inline-empty">Ningún incidente abierto venció ni vence en las próximas 4 horas.</div>
        ) : (
          <div className="tx-table-wrap tx-solid sla-wide">
            <table className="tx-table sla-table">
              <thead>
                <tr>
                  <th className="w-id">ID</th>
                  <th>Incidente</th>
                  <th>Prioridad</th>
                  <th>Plazo</th>
                  <th>Estado del plazo</th>
                  <th>Asignado a</th>
                </tr>
              </thead>
              <tbody>
                {m.atRisk.map((r) => (
                  <tr key={`${r.id}-${r.kind}`}>
                    <td className="w-id" data-label="ID">
                      <IncidentId id={r.id} go={goIncident} />
                    </td>
                    <td className="t-title">
                      {r.title}
                      <small>{r.service}</small>
                    </td>
                    <td data-label="Prioridad">
                      <Prio p={r.priority} />
                    </td>
                    <td data-label="Plazo">{r.kind === 'respuesta' ? 'Primera respuesta' : 'Resolución'}</td>
                    <td data-label="Estado del plazo" className={r.late ? 'sla-risk' : undefined} title={fmt(r.dueAt)}>
                      {when(r.dueAt, r.late, now)}
                    </td>
                    <td data-label="Asignado a">{r.assigneeId ? author(users, r.assigneeId) : 'Sin asignar'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {t.incidents === 0 ? (
        <div className="tx-inline-empty">No se registraron incidentes en los últimos {m.days} días.</div>
      ) : (
        <>
          <section className="viz-card tx-solid">
            <div>
              <h2 className="tx-h3">Tendencia del cumplimiento</h2>
              <p className="tx-caption">Por cuándo se creó cada incidente. Cada tramo mide a tiempo sobre lo ya medible.</p>
            </div>
            <div>
              <div className="viz-cols" role="img" aria-label={`Cumplimiento de SLA en los últimos ${m.days} días, por tramos`}>
                {m.trend.map((p) => (
                  <div
                    key={p.from}
                    className="viz-col"
                    tabIndex={0}
                    aria-label={`${dm(p.from)} al ${dm(new Date(+new Date(p.to) - 1).toISOString())}: resolución ${pct(p.resolution.compliance)}, primera respuesta ${pct(p.response.compliance)}, ${count(p.incidents, 'incidente')}`}
                  >
                    <span className="viz-tip">
                      {dm(p.from)} · resolución {pct(p.resolution.compliance)} · respuesta {pct(p.response.compliance)} · {count(p.incidents, 'incidente')}
                    </span>
                    <div className="sla-pairs">
                      <div className="viz-bar" style={{ height: `${p.resolution.compliance ?? 0}%` }} />
                      <div className="viz-bar b" style={{ height: `${p.response.compliance ?? 0}%` }} />
                    </div>
                  </div>
                ))}
              </div>
              <div className="viz-xrow" aria-hidden="true">
                {m.trend.map((p) => (
                  <span key={p.from}>{dm(p.from)}</span>
                ))}
              </div>
            </div>
            <div className="viz-legend">
              <span>
                <i style={{ background: 'var(--viz-1)' }} />
                Resolución
              </span>
              <span>
                <i style={{ background: 'var(--viz-2)' }} />
                Primera respuesta
              </span>
            </div>
          </section>

          <GroupTable title="Por prioridad" first="Prioridad" rows={m.byPriority.map((g) => ({ ...g, name: cap(g.name), hours: state.config.slaHours[g.name as 'alta'] }))} />
          <GroupTable title="Por servicio" first="Servicio" rows={m.byService} />
          <GroupTable title="Por responsable" first="Asignado a" rows={m.byAssignee} />
        </>
      )}
    </>
  )
}

const footOf = (s: SlaStat, what: string) =>
  s.measured === 0 ? `todavía no hay ${what} medible` : `${count(s.late, 'fuera de plazo', 'fuera de plazo')} de ${count(s.measured, 'medido')}`

function Stat({ s }: { s: SlaStat }) {
  return (
    <>
      <span>{pct(s.compliance)}</span>
      <small>{s.measured ? `${s.measured - s.late}/${s.measured} a tiempo` : 'sin medir'}</small>
    </>
  )
}

function GroupTable({ title, first, rows }: { title: string; first: string; rows: (SlaGroup & { hours?: number })[] }) {
  if (rows.length === 0) return null
  return (
    <section>
      <div className="tx-section-head">
        <h2 className="tx-h3">{title}</h2>
      </div>
      <div className="tx-table-wrap tx-solid sla-wide">
        <table className="tx-table sla-table">
          <thead>
            <tr>
              <th>{first}</th>
              <th className="num">Incidentes</th>
              <th className="num">Resolución</th>
              <th className="num">Primera respuesta</th>
              <th className="num">T. medio de resolución</th>
              <th className="num">T. medio de respuesta</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((g) => (
              <tr key={`${g.id}-${g.name}`}>
                <td className="name" data-label={first}>
                  {g.name}
                  {g.hours !== undefined && <small>{g.hours} h para resolver</small>}
                </td>
                <td className="num" data-label="Incidentes">
                  {g.incidents}
                </td>
                <td className="num" data-label="Resolución">
                  <Stat s={g.resolution} />
                </td>
                <td className="num" data-label="Primera respuesta">
                  <Stat s={g.response} />
                </td>
                <td className="num" data-label="T. medio de resolución">
                  {hours(g.avgResolutionHours)}
                </td>
                <td className="num" data-label="T. medio de respuesta">
                  {hours(g.avgResponseHours)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
