// Panel de visualización. Todo se calcula en el cliente a partir del estado de la empresa.
// El cumplimiento de SLA vive en su propia pestaña (lo calcula el backend, con pausas y versiones): acá no se repite.
import { useState } from 'react'
import type { Incident, State } from './api'
import { Filters, ProblemId, STATUS, STEPS, StatusBadge, count, isLate } from './ui'

// Las 00:00 de hace n días. setDate (y no restar 24 h) evita correrse una hora con el cambio de horario.
const midnight = (n: number) => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() - n)
  return d
}
const pct = (a: number, b: number) => (b ? Math.round((100 * a) / b) : null)
const show = (v: number | null, unit = '%') => (v === null ? '—' : `${v}${unit}`)
// SLA medible: incidentes ya resueltos, más los abiertos que ya vencieron.
const judged = (list: Incident[]) => list.filter((i) => i.resolvedAt || isLate(i))
const avgHours = (list: number[]) => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : null)
const showHours = (h: number | null) => (h === null ? '—' : `${h.toFixed(1)} h`)
type Kpi = { on: boolean; label: string; dot: string; val: string; foot: string }

export function Dashboard({ state, openProblem }: { state: State; openProblem?: (id: number) => void }) {
  const { sla, problems: withProblems } = state.config.modules
  const [period, setPeriod] = useState<'7' | '30' | '90'>('30')
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
  const mttr = avgHours(resolved.map((i) => (+new Date(i.resolvedAt!) - +new Date(i.createdAt)) / 36e5))
  const responded = inc.filter((i) => i.firstResponseAt)
  const mtfr = avgHours(responded.map((i) => (+new Date(i.firstResponseAt!) - +new Date(i.createdAt)) / 36e5))
  const investigated = inc.filter((i) => i.problemId).length
  const reopened = inc.filter((i) => i.reopenCount > 0).length
  // Satisfacción (CSAT): qué parte de las valoraciones son 4 o 5.
  const rated = inc.filter((i) => i.rating > 0)
  const happy = rated.filter((i) => i.rating >= 4).length
  const avgRating = rated.length ? (rated.reduce((n, i) => n + i.rating, 0) / rated.length).toFixed(1) : null

  // Hasta siete indicadores en dos filas: volumen y tiempos. El de causa investigada solo existe con gestión de problemas.
  const rows: Kpi[][] = [
    [
      { on: true, label: 'Incidentes', dot: 'var(--viz-1)', val: String(inc.length), foot: `${inc.length - resolved.length} siguen abiertos` },
      { on: true, label: 'Resueltos', dot: 'var(--status-resuelto-dot)', val: String(resolved.length), foot: `${show(pct(resolved.length, inc.length))} de los del período` },
      { on: true, label: 'Satisfacción', dot: 'var(--status-resuelto-dot)', val: show(pct(happy, rated.length)), foot: avgRating ? `${avgRating} de 5 · ${count(rated.length, 'valoración', 'valoraciones')}` : 'sin valoraciones todavía' },
      { on: true, label: 'Reabiertos', dot: 'var(--status-conocido-dot)', val: String(reopened), foot: `${show(pct(reopened, inc.length))} de los del período` },
    ],
    [
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
  const every = days <= 7 ? 1 : days <= 30 ? 5 : 15

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

  // El efecto sandía: servicios que cumplen el SLA (verde por fuera) con la gente disconforme (rojo por dentro).
  const melon = state.config.services
    .map((service) => {
      const list = inc.filter((i) => i.service === service)
      const m = judged(list)
      const r = list.filter((i) => i.rating > 0)
      const slaPct = pct(m.filter((i) => !isLate(i)).length, m.length)
      const csat = pct(r.filter((i) => i.rating >= 4).length, r.length)
      return { service, slaPct, csat, ratings: r.length, watermelon: sla && slaPct !== null && csat !== null && slaPct >= 80 && csat < 60 && r.length >= 3 }
    })
    .filter((x) => x.ratings > 0)
    .sort((a, b) => Number(b.watermelon) - Number(a.watermelon) || (a.csat ?? 100) - (b.csat ?? 100))

  // Mapa de calor: incidentes por servicio y por día en las últimas dos semanas (o en el período, si es más corto).
  const heatDays = Math.min(days, 14)
  const heatCols = Array.from({ length: heatDays }, (_, d) => midnight(heatDays - 1 - d))
  const heat = state.config.services
    .map((service) => ({
      service,
      cells: heatCols.map((from, d) => {
        const to = d + 1 < heatCols.length ? +heatCols[d + 1] : Infinity
        return state.incidents.filter((i) => i.service === service && +new Date(i.createdAt) >= +from && +new Date(i.createdAt) < to).length
      }),
    }))
    .filter((r) => r.cells.some(Boolean))
  const heatMax = Math.max(1, ...heat.flatMap((r) => r.cells))

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
          ['30', '30 días', inLast(30)],
          ['90', '90 días', inLast(90)],
        ]}
      />

      {rows.map((row, r) => (
        <section key={r} className="tx-metrics kpi-row" aria-label={r === 0 ? 'Volumen del período' : 'Tiempos del período'} style={r ? { marginTop: -8 } : undefined}>
          {row.map((m) => (
            <div key={m.label} className="tx-metric tx-solid">
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

      {melon.length > 0 && (
        <section className="tx-panel tx-solid" aria-labelledby="melon-h">
          <div className="tx-panel-head">
            <div>
              <h2 className="tx-h3" id="melon-h">
                SLA y satisfacción por servicio
              </h2>
              <p className="tx-caption">
                Un servicio puede cumplir los plazos y aun así dejar a la gente disconforme: verde por fuera, rojo por dentro.
              </p>
            </div>
            {melon.some((m) => m.watermelon) && <span className="tx-badge conocido">{count(melon.filter((m) => m.watermelon).length, 'servicio a mirar', 'servicios a mirar')}</span>}
          </div>
          <table className="tx-table">
            <thead>
              <tr>
                <th>Servicio</th>
                {sla && <th className="num">SLA cumplido</th>}
                <th className="num">Conformes</th>
                <th className="num">Valoraciones</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {melon.map((m) => (
                <tr key={m.service}>
                  <td className="t-title">{m.service}</td>
                  {sla && (
                    <td className="num" data-label="SLA cumplido">
                      {show(m.slaPct)}
                    </td>
                  )}
                  <td className="num" data-label="Conformes" style={m.csat !== null && m.csat < 60 ? { color: 'var(--danger-fg)', fontWeight: 600 } : undefined}>
                    {show(m.csat)}
                  </td>
                  <td className="num" data-label="Valoraciones">
                    {m.ratings}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {m.watermelon && (
                      <span className="tx-badge conocido" title="Cumple el SLA pero la mayoría no quedó conforme">
                        Cumple, pero no conforma
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {heat.length > 0 && (
        <section className="tx-panel tx-solid" aria-labelledby="heat-h">
          <div>
            <h2 className="tx-h3" id="heat-h">
              Dónde y cuándo se rompe
            </h2>
            <p className="tx-caption">Incidentes por servicio y por día. Las rachas de un mismo servicio suelen ser un problema esperando a que alguien lo abra.</p>
          </div>
          <div className="heat" style={{ gridTemplateColumns: `minmax(120px, max-content) repeat(${heatDays}, minmax(0, 1fr))` }} role="table">
            <span />
            {heatCols.map((d) => (
              <span key={+d} className="heat-day" aria-hidden="true">
                {d.getDate()}
              </span>
            ))}
            {heat.map((r) => (
              <div key={r.service} style={{ display: 'contents' }} role="row">
                <span className="heat-svc" role="rowheader">
                  {r.service}
                </span>
                {r.cells.map((n, d) => (
                  <span
                    key={d}
                    role="cell"
                    className="heat-cell"
                    title={`${r.service} · ${heatCols[d].toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })}: ${count(n, 'incidente')}`}
                    style={{ opacity: n ? 0.25 + (0.75 * n) / heatMax : 1, background: n ? 'var(--brand)' : 'var(--surface-sunken)' }}
                  >
                    {n || ''}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </section>
      )}

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
