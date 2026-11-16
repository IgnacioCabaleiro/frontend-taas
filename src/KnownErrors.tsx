import { useState } from 'react'
import type { Problem, State } from './api'
import { WorkaroundStats } from './Knowledge'
import { A, Filters, Ic, ProblemId, RootCause, Solution, StatusBadge, Workaround, can, count, fmt } from './ui'

const DAY = 864e5

// Un workaround pide revisión si falla seguido o si hace un mes que nadie lo toca.
function needsReview(p: Problem) {
  if (p.status !== 'error_conocido' || !p.workaround) return false
  const uses = p.workaroundUses ?? []
  const failed = uses.filter((u) => u.failed).length
  if (uses.length >= 3 && failed / uses.length > 0.3) return true
  const last = Math.max(+new Date(p.createdAt), ...p.history.map((h) => +new Date(h.at)), ...uses.map((u) => +new Date(u.at)))
  return Date.now() - last > 30 * DAY
}

export function KnownErrors({ state, goProblem, goIncidents }: { state: State; goProblem?: (id: number) => void; goIncidents: () => void }) {
  const { problems, incidents } = state
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<'vigentes' | 'compartidos' | 'revisar' | 'resueltos'>('vigentes')

  // La base de errores conocidos: lo que ya tiene causa raíz o workaround. Lo que se sigue investigando está en Problemas.
  const known = problems.filter((p) => p.status === 'error_conocido' || p.status === 'resuelto')
  const uses = (p: Problem) => (p.workaroundUses ?? []).length
  const lists = {
    vigentes: known.filter((p) => p.status === 'error_conocido').sort((a, b) => uses(b) - uses(a)),
    compartidos: known.filter((p) => p.status === 'error_conocido' && p.workaroundShared),
    revisar: known.filter(needsReview),
    resueltos: known.filter((p) => p.status === 'resuelto'),
  }
  const query = q.trim().toLowerCase()
  const shown = lists[filter].filter((p) => [p.title, p.service, p.rootCause, p.workaround, p.solution].join(' ').toLowerCase().includes(query))

  // Cuánto rinde la base en los últimos 30 días: incidentes resueltos con un workaround y tickets que ni se abrieron.
  const since = Date.now() - 30 * DAY
  const recent = incidents.filter((i) => i.resolvedAt && +new Date(i.resolvedAt) >= since)
  const byWorkaround = recent.filter((i) => i.resolutionCode === 'workaround').length
  const allUses = known.flatMap((p) => p.workaroundUses ?? [])
  const effective = allUses.length ? Math.round((allUses.filter((u) => !u.failed).length * 100) / allUses.length) : null
  const deflected = known.reduce((n, p) => n + (p.deflections ?? 0), 0)

  return (
    <>
      <section className="tx-metrics" aria-label="Rendimiento de la base de errores conocidos">
        <div className="tx-metric tx-glass">
          <div className="lbl">Errores conocidos vigentes</div>
          <div className="val">{lists.vigentes.length}</div>
          <div className="foot">{count(lists.compartidos.length, 'compartido', 'compartidos')} con quienes reportan</div>
        </div>
        <div className="tx-metric tx-glass">
          <div className="lbl">Resueltos con workaround</div>
          <div className="val">{recent.length ? `${Math.round((byWorkaround * 100) / recent.length)}%` : '—'}</div>
          <div className="foot">
            {byWorkaround} de {count(recent.length, 'incidente resuelto', 'incidentes resueltos')} en 30 días
          </div>
        </div>
        <div className="tx-metric tx-glass">
          <div className="lbl">Efectividad de los workarounds</div>
          <div className="val">{effective === null ? '—' : `${effective}%`}</div>
          <div className="foot">usos que no terminaron en reapertura</div>
        </div>
        <div className="tx-metric tx-glass">
          <div className="lbl">Tickets evitados</div>
          <div className="val">{deflected}</div>
          <div className="foot">a quien reportó le alcanzó el workaround</div>
        </div>
      </section>

      <label className="tx-search tx-glass">
        <Ic n="search" size="lg" />
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por síntoma, servicio o causa" aria-label="Buscar en errores conocidos" />
      </label>
      <Filters
        value={filter}
        onChange={setFilter}
        options={[
          ['vigentes', 'Vigentes', lists.vigentes.length],
          ['compartidos', 'Compartidos', lists.compartidos.length],
          ['revisar', 'A revisar', lists.revisar.length],
          ['resueltos', 'Resueltos', lists.resueltos.length],
        ]}
      />

      {shown.length === 0 ? (
        <section className="tx-glass" style={{ borderRadius: 'var(--radius-xl)' }}>
          <div className="tx-empty">
            <div className="tx-empty-ic tx-glass-strong">
              <Ic n="search" size="xl" />
            </div>
            <h2 className="tx-h2">{query ? `Nada para «${q.trim()}»` : 'Nada en este filtro'}</h2>
            <p>Probá con el nombre del servicio o con menos palabras. Si es un síntoma nuevo, registralo: si se repite, aparece como problema.</p>
            <div className="tx-actions">
              <button
                className="tx-btn secondary"
                onClick={() => {
                  setQ('')
                  setFilter('vigentes')
                }}
              >
                Limpiar búsqueda
              </button>
              {can(state, 'crear') && (
                <button className="tx-btn primary" onClick={goIncidents}>
                  <Ic n="plus" />
                  Registrar incidente
                </button>
              )}
            </div>
          </div>
        </section>
      ) : (
        <div className="tx-kb-grid">
          {shown.map((p) => {
            const last = p.history[p.history.length - 1]
            return (
              <article key={p.id} className="tx-kb tx-solid">
                <div className="hd">
                  <div>
                    <div className="ttl">{p.title}</div>
                    <div className="svc">
                      <ProblemId id={p.id} go={goProblem} /> · {p.service}
                    </div>
                  </div>
                  <div className="tx-row" style={{ gap: 6, justifyContent: 'flex-end' }}>
                    {needsReview(p) && <span className="tx-badge conocido">A revisar</span>}
                    {p.workaroundShared && p.status === 'error_conocido' && <span className="tx-badge abierto">Compartido</span>}
                    <StatusBadge s={p.status} />
                  </div>
                </div>
                <RootCause text={p.rootCause} />
                {p.solution ? <Solution text={p.solution} /> : p.workaround && <Workaround text={p.workaround} />}
                {p.status === 'error_conocido' && p.workaround && <WorkaroundStats p={p} />}
                <div className="ft">
                  <span>
                    {count(incidents.filter((i) => i.problemId === p.id).length, 'incidente')} · actualizado {fmt(last.at)}
                  </span>
                  {goProblem && (
                    <A style={{ display: 'inline-flex', gap: 4, alignItems: 'center', fontWeight: 550 }} onClick={() => goProblem(p.id)}>
                      Ver problema
                      <Ic n="chevron" />
                    </A>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      )}
    </>
  )
}
