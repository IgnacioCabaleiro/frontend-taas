// Panel de visualización. Todo se calcula en el cliente a partir del estado de la empresa.
import { useState } from 'react'
import type { Incident, Priority, State } from './api'
import { Filters, ProblemId, STATUS, STEPS, StatusBadge, count, isLate, isResponseLate } from './ui'

// Las 00:00 de hace n días. setDate (y no restar 24 h) evita correrse una hora con el cambio de horario.
const midnight = (n: number) => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - n)
  return d
}
const PRIOS: Priority[] = ['alta', 'media', 'baja']
const pct = (a: number, b: number) => (b ? Math.round((100 * a) / b) : null)
const show = (v: number | null, unit = '%') => (v === null ? '—' : `${v}${unit}`)
// SLA medible: incidentes ya resueltos, más los abiertos que ya vencieron.
const judged = (list: Incident[]) => list.filter((i) => i.resolvedAt || isLate(i))
// Primera respuesta medible: la que ya llegó, más la que ya venció sin llegar.
const judgedResponse = (list: Incident[]) => list.filter((i) => i.responseDueAt && (i.firstResponseAt || isResponseLate(i)))
const avgHours = (list: number[]) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : null)
const showHours = (h: number | null) => (h === null ? '—' : `${h.toFixed(1)} h`)
type Kpi = { on: boolean; label: string; dot: string; val: string; foot: string }

export function Dashboard({ state, openProblem }: { state: State; openProblem?: (id: number) => void }) {
  const { sla, problems: withProblems } = state.config.modules
  const [period, setPeriod] = useState<'7' | '14' | '30'>('30')
  const days = Number(period)
  // Desde las 00:00 de hace (n - 1) días: el mismo corte para los contadores del filtro y para los indicadores.
  const start = midnight(days - 1)
  const inc = state.incidents.filter((i) => new Date(i.createdAt) >= start)
  const inLast = (n: number) => {
    if (n === days) return inc.length
    const from = midnight(n - 1)
    return state.incidents.filter((i) => new Date(i.createdAt) >= from).length
  }

  const resolved = inc.filter((i) => i.resolvedAt)
  const measurable = judged(inc)
  const lateCount = measurable.filter(isLate).length
  const mttr = avgHours(resolved.map((i) => (+new Date(i.resolvedAt!) - +new Date(i.createdAt)) / 36e5))
  const responded = inc.filter((i) => i.firstResponseAt)
  const mtfr = avgHours(responded.map((i) => (+new Date(i.firstResponseAt!) - +new Date(i.createdAt)) / 36e5))
  const investigated = inc.filter((i) => i.problemId).length
  const reopened = inc.filter((i) => i.reopenCount > 0).length

  // Hasta ocho indicadores en dos filas: volumen y tiempos. Los de SLA y de causa investigada solo existen
  // si la cuenta tiene esos módulos.
  const rows: Kpi[][] = [
    [
      { on: true, label: 'Incidentes', dot: 'var(--viz-1)', val: String(inc.length), foot: `${inc.length - resolved.length} siguen abiertos` },
      { on: true, label: 'Resueltos', dot: 'var(--status-resuelto-dot)', val: String(resolved.length), foot: `${show(pct(resolved.length, inc.length))} de los del período` },
      { on: true, label: 'Sin asignar', dot: 'var(--prio-alta-dot)', val: String(inc.filter((i) => !i.resolvedAt && !i.assigneeId).length), foot: 'abiertos que nadie tomó' },
      { on: true, label: 'Reabiertos', dot: 'var(--status-conocido-dot)', val: String(reopened), foot: `${show(pct(reopened, inc.length))} de los del período` },
    ],
    [
      { on: sla, label: 'Cumplimiento de SLA', dot: 'var(--status-resuelto-dot)', val: show(pct(measurable.length - lateCount, measurable.length)), foot: `${lateCount} fuera de SLA de resolución` },
      { on: true, label: 'Tiempo medio de primera respuesta', dot: 'var(--brand)', val: showHours(mtfr), foot: `sobre ${count(responded.length, 'respondido')}` },
      { on: true, label: 'Tiempo medio de resolución', dot: 'var(--ink-subtle)', val: showHours(mttr), foot: `sobre ${count(resolved.length, 'resuelto')}` },
      { on: withProblems, label: 'Con causa investigada', dot: 'var(--viz-2)', val: show(pct(investigated, inc.length)), foot: `${inc.length - investigated} sin problema asociado` },
    ],
  ].map((r) => r.filter((k) => k.on))

  // Incidentes por día.
  const perDay = Array.from({ length: days }, (_, d) => {
    const date = midnight(days - 1 - d)
    const from = +date
    const to = +midnight(days - 2 - d)
    return {
      label: `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`,
      n: inc.filter((i) => +new Date(i.createdAt) >= from && +new Date(i.createdAt) < to).length,
    }
  })
  const maxDay = Math.max(1, ...perDay.map((d) => d.n))
  const every = days <= 7 ? 1 : days <= 14 ? 2 : 5

  // Dónde se concentran: por servicio, separando lo que ya tiene un problema asociado.
  const perService = state.config.services
    .map((service) => {
      const list = inc.filter((i) => i.service === service)
      const linked = withProblems ? list.filter((i) => i.problemId).length : list.length
      return { service, linked, unlinked: list.length - linked, total: list.length }
    })
    .filter((r) => r.total)
    .sort((a, b) => b.total - a.total)
  const maxService = Math.max(1, ...perService.map((r) => r.total))

  const perPrio = PRIOS.map((p) => {
    const list = judged(inc.filter((i) => i.priority === p))
    return { p, ok: list.filter((i) => !isLate(i)).length, total: list.length }
  })
  const perPrioResponse = PRIOS.map((p) => {
    const list = judgedResponse(inc.filter((i) => i.priority === p))
    return { p, ok: list.filter((i) => !isResponseLate(i)).length, total: list.length }
  })

  const top = state.problems
    .map((p) => {
      const list = state.incidents.filter((i) => i.problemId === p.id)
      return { p, total: list.length, open: list.filter((i) => !i.resolvedAt).length }
    })
    .sort((a, b) => b.open - a.open || b.total - a.total)
    .slice(0, 5)

  return (
    <>
      <Filters
        value={period}
        onChange={setPeriod}
        options={[
          ['7', 'Últimos 7 días', inLast(7)],
          ['14', '14 días', inLast(14)],
          ['30', '30 días', inLast(30)],
        ]}
      />

      {rows.map((row, r) => (
        <section key={r} className="tx-metrics kpi-row" aria-label={r === 0 ? 'Volumen del período' : 'Tiempos del período'} style={r ? { marginTop: -8 } : undefined}>
          {row.map((m) => (
            <div key={m.label} className="tx-metric tx-glass">
              <div className="lbl">
                <span className="dot" style={{ background: m.dot }} />
                {m.label}
              </div>
              <div className="val">{m.val}</div>
              <div className="foot">{m.foot}</div>
            </div>
          ))}
        </section>
      ))}

      <div className="viz-grid">
        <section className="viz-card tx-solid">
          <div>
            <h2 className="tx-h3">Incidentes por día</h2>
            <p className="tx-caption">Máximo: {count(maxDay, 'incidente')} en un día</p>
          </div>
          <div>
            <div className="viz-cols" role="img" aria-label={`Incidentes creados por día en los últimos ${days} días`}>
              {perDay.map((d) => (
                <div key={d.label} className="viz-col" tabIndex={0} aria-label={`${d.label}: ${count(d.n, 'incidente')}`}>
                  <span className="viz-tip">
                    {d.label} · {count(d.n, 'incidente')}
                  </span>
                  <div className="viz-bar" style={{ height: `${(d.n / maxDay) * 100}%` }} />
                </div>
              ))}
            </div>
            <div className="viz-xrow" aria-hidden="true">
              {perDay.map((d, i) => (
                <span key={d.label}>{(days - 1 - i) % every === 0 ? d.label : ''}</span>
              ))}
            </div>
          </div>
        </section>

        <section className="viz-card tx-solid">
          <div>
            <h2 className="tx-h3">Dónde se concentran</h2>
            <p className="tx-caption">Incidentes por servicio{withProblems && '. Lo naranja todavía no tiene una causa investigada'}.</p>
          </div>
          {perService.length === 0 ? (
            <div className="tx-inline-empty">Sin incidentes en el período.</div>
          ) : (
            <>
              <div className="viz-rows">
                {perService.map((r) => (
                  <div key={r.service} style={{ display: 'contents' }}>
                    <span className="lbl">{r.service}</span>
                    <div className="viz-track">
                      {r.linked > 0 && (
                        <div
                          className="viz-seg"
                          style={{ width: `${(r.linked / maxService) * 100}%`, background: 'var(--viz-1)' }}
                          title={withProblems ? `${r.service}: ${r.linked} con problema asociado` : `${r.service}: ${r.linked}`}
                        />
                      )}
                      {r.unlinked > 0 && (
                        <div
                          className="viz-seg"
                          style={{ width: `${(r.unlinked / maxService) * 100}%`, background: 'var(--viz-2)' }}
                          title={`${r.service}: ${r.unlinked} sin causa investigada`}
                        />
                      )}
                    </div>
                    <span className="val">{r.total}</span>
                  </div>
                ))}
              </div>
              {withProblems && (
                <div className="viz-legend">
                  <span>
                    <i style={{ background: 'var(--viz-1)' }} />
                    Con problema asociado
                  </span>
                  <span>
                    <i style={{ background: 'var(--viz-2)' }} />
                    Sin causa investigada
                  </span>
                </div>
              )}
            </>
          )}
        </section>

        {sla && (
        <section className="viz-card tx-solid">
          <div>
            <h2 className="tx-h3">Cumplimiento de SLA por prioridad</h2>
            <p className="tx-caption">A tiempo sobre lo ya medible: lo que llegó y lo que venció sin llegar.</p>
          </div>
          <SlaRows title="Primera respuesta" rows={perPrioResponse} hours={state.config.responseHours} />
          <SlaRows title="Resolución" rows={perPrio} hours={state.config.slaHours} />
        </section>
        )}

        {withProblems && (
        <section className="viz-card tx-solid">
          <div>
            <h2 className="tx-h3">Problemas por etapa</h2>
            <p className="tx-caption">Todos los problemas de la empresa, sin filtro de período.</p>
          </div>
          <div className="viz-stages">
            {STEPS.map((s) => (
              <div key={s} className="viz-stage">
                <span className={`tx-badge ${STATUS[s].cls}`}>{STATUS[s].label}</span>
                <b>{state.problems.filter((p) => p.status === s).length}</b>
              </div>
            ))}
          </div>
        </section>
        )}
      </div>

      {withProblems && (
      <section>
        <div className="tx-section-head">
          <h2 className="tx-h3">Problemas que más incidentes generan</h2>
        </div>
        {top.length === 0 ? (
          <div className="tx-inline-empty">Todavía no hay problemas registrados. Aparecen cuando se detectan incidentes recurrentes.</div>
        ) : (
          <div className="tx-table-wrap tx-solid">
            <table className="tx-table">
              <thead>
                <tr>
                  <th className="w-id">ID</th>
                  <th>Problema</th>
                  <th>Servicio</th>
                  <th>Estado</th>
                  <th className="num">Incidentes</th>
                </tr>
              </thead>
              <tbody>
                {top.map(({ p, total, open }) => (
                  <tr key={p.id}>
                    <td className="w-id" data-label="ID">
                      <ProblemId id={p.id} go={openProblem} />
                    </td>
                    <td className="t-title">{p.title}</td>
                    <td className="tx-muted" data-label="Servicio">
                      {p.service}
                    </td>
                    <td data-label="Estado">
                      <StatusBadge s={p.status} />
                    </td>
                    <td className="num" data-label="Incidentes">
                      <span className="tx-linked">
                        <b>{total}</b>
                        <span>{open ? count(open, 'abierto') : 'todos resueltos'}</span>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      )}
    </>
  )
}

// Una fila por prioridad: cuántos se cumplieron a tiempo, sobre cuántos ya se pueden medir.
function SlaRows({ title, rows, hours }: { title: string; rows: { p: Priority; ok: number; total: number }[]; hours: Record<Priority, number> }) {
  return (
    <div className="tx-stack" style={{ gap: 8 }}>
      <span className="tx-overline">{title}</span>
      <div className="viz-rows">
        {rows.map((r) => {
          const v = pct(r.ok, r.total)
          return (
            <div key={r.p} style={{ display: 'contents' }}>
              <span className="lbl">
                {r.p[0].toUpperCase() + r.p.slice(1)} · {hours[r.p]} h
              </span>
              <div className="viz-track meter" title={`${title}: ${r.ok} de ${r.total} a tiempo`}>
                {v !== null && v > 0 && <div className="viz-seg" style={{ width: `${v}%`, background: 'var(--viz-1)', borderRadius: 4 }} />}
              </div>
              <span className="val">
                {show(v)} <small>{r.ok}/{r.total}</small>
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
