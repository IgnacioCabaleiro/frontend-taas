// Panel de visualización. Todo se calcula en el cliente a partir del estado de la empresa.
import { useState } from 'react'
import type { Incident, Priority, State } from './api'
import { A, Filters, STATUS, STEPS, StatusBadge, can, count, isLate } from './ui'

const DAY = 864e5
const PRIOS: Priority[] = ['alta', 'media', 'baja']
const pct = (a: number, b: number) => (b ? Math.round((100 * a) / b) : null)
const show = (v: number | null, unit = '%') => (v === null ? '—' : `${v}${unit}`)
// SLA medible: incidentes ya resueltos, más los abiertos que ya vencieron.
const judged = (list: Incident[]) => list.filter((i) => i.resolvedAt || isLate(i))

export function Dashboard({ state, openProblem }: { state: State; openProblem: (id: number) => void }) {
  const { sla, problems: withProblems } = state.config.modules
  const seeProblems = withProblems && can(state, 'problemas')
  const [period, setPeriod] = useState<'7' | '14' | '30'>('30')
  const days = Number(period)
  // Desde las 00:00 de hace (n - 1) días: el mismo corte para los contadores del filtro y para los indicadores.
  const since = (n: number) => new Date(new Date().setHours(0, 0, 0, 0) - (n - 1) * DAY)
  const inPeriod = (n: number) => state.incidents.filter((i) => new Date(i.createdAt) >= since(n))
  const start = since(days)
  const inc = inPeriod(days)

  const resolved = inc.filter((i) => i.resolvedAt)
  const measurable = judged(inc)
  const lateCount = measurable.filter(isLate).length
  const hours = resolved.map((i) => (+new Date(i.resolvedAt!) - +new Date(i.createdAt)) / 36e5)
  const mttr = hours.length ? hours.reduce((a, b) => a + b, 0) / hours.length : null
  const investigated = inc.filter((i) => i.problemId).length

  // Cuatro indicadores: los de SLA y de causa investigada solo existen si la cuenta tiene esos módulos.
  const kpis = [
    { on: true, label: 'Incidentes', dot: 'var(--viz-1)', val: String(inc.length), foot: `${inc.length - resolved.length} siguen abiertos` },
    { on: sla, label: 'Cumplimiento de SLA', dot: 'var(--status-resuelto-dot)', val: show(pct(measurable.length - lateCount, measurable.length)), foot: `${lateCount} fuera de SLA` },
    { on: true, label: 'Tiempo medio de resolución', dot: 'var(--ink-subtle)', val: mttr === null ? '—' : `${mttr.toFixed(1)} h`, foot: `sobre ${count(resolved.length, 'resuelto')}` },
    { on: withProblems, label: 'Con causa investigada', dot: 'var(--viz-2)', val: show(pct(investigated, inc.length)), foot: `${inc.length - investigated} sin problema asociado` },
    { on: true, label: 'Resueltos', dot: 'var(--status-resuelto-dot)', val: String(resolved.length), foot: `${show(pct(resolved.length, inc.length))} de los del período` },
    { on: true, label: 'Sin asignar', dot: 'var(--prio-alta-dot)', val: String(inc.filter((i) => !i.resolvedAt && !i.assigneeId).length), foot: 'abiertos que nadie tomó' },
  ]
    .filter((k) => k.on)
    .slice(0, 4)

  // Incidentes por día.
  const perDay = Array.from({ length: days }, (_, d) => {
    const from = +start + d * DAY
    const date = new Date(from)
    return {
      label: `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`,
      n: inc.filter((i) => +new Date(i.createdAt) >= from && +new Date(i.createdAt) < from + DAY).length,
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
          ['7', 'Últimos 7 días', inPeriod(7).length],
          ['14', '14 días', inPeriod(14).length],
          ['30', '30 días', inPeriod(30).length],
        ]}
      />

      <section className="tx-metrics" aria-label="Indicadores del período">
        {kpis.map((m) => (
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
            <p className="tx-caption">Resueltos a tiempo sobre los resueltos y los abiertos ya vencidos.</p>
          </div>
          <div className="viz-rows">
            {perPrio.map((r) => {
              const v = pct(r.ok, r.total)
              return (
                <div key={r.p} style={{ display: 'contents' }}>
                  <span className="lbl">
                    {r.p[0].toUpperCase() + r.p.slice(1)} · {state.config.slaHours[r.p]} h
                  </span>
                  <div className="viz-track meter" title={`${r.ok} de ${r.total} dentro del SLA`}>
                    {v !== null && v > 0 && <div className="viz-seg" style={{ width: `${v}%`, background: 'var(--viz-1)', borderRadius: 4 }} />}
                  </div>
                  <span className="val">
                    {show(v)} <small>{r.ok}/{r.total}</small>
                  </span>
                </div>
              )
            })}
          </div>
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
                      {seeProblems ? (
                        <A className="tx-id" onClick={() => openProblem(p.id)}>
                          P-{p.id}
                        </A>
                      ) : (
                        <span className="tx-strong">P-{p.id}</span>
                      )}
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
