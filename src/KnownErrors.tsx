import { useState } from 'react'
import type { State } from './api'
import { A, Filters, Ic, RootCause, Solution, StatusBadge, Workaround, can, count, fmt } from './ui'

export function KnownErrors({ state, goProblem, goIncidents }: { state: State; goProblem: (id: number) => void; goIncidents: () => void }) {
  const { problems, incidents } = state
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<'todos' | 'wa' | 'resueltos' | 'analisis'>('todos')
  // Quien solo resuelve tickets ve esta sección pero no la de Problemas: sin link al detalle.
  const canOpen = can(state, 'problemas')

  const lists = {
    todos: problems,
    wa: problems.filter((p) => p.status === 'error_conocido' && p.workaround),
    resueltos: problems.filter((p) => p.status === 'resuelto'),
    analisis: problems.filter((p) => p.status === 'en_analisis'),
  }
  const query = q.trim().toLowerCase()
  const shown = lists[filter].filter((p) =>
    [p.title, p.service, p.rootCause, p.workaround, p.solution].join(' ').toLowerCase().includes(query),
  )

  return (
    <>
      <label className="tx-search tx-glass">
        <Ic n="search" size="lg" />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por síntoma, servicio o causa…"
          aria-label="Buscar en errores conocidos"
        />
      </label>
      <Filters
        value={filter}
        onChange={setFilter}
        options={[
          ['todos', 'Todos', lists.todos.length],
          ['wa', 'Con workaround', lists.wa.length],
          ['resueltos', 'Resueltos', lists.resueltos.length],
          ['analisis', 'En análisis', lists.analisis.length],
        ]}
      />

      {shown.length === 0 ? (
        <section className="tx-glass" style={{ borderRadius: 'var(--radius-xl)' }}>
          <div className="tx-empty">
            <div className="tx-empty-ic tx-glass-strong">
              <Ic n="search" size="xl" />
            </div>
            <h2 className="tx-h2">
              {query ? `No encontramos errores conocidos para “${q.trim()}”` : 'No hay errores conocidos en este filtro'}
            </h2>
            <p>
              Probá con el nombre del servicio o con menos palabras. Si es un síntoma nuevo, registralo como incidente y lo vamos a
              agrupar si se repite.
            </p>
            <div className="tx-actions">
              <button
                className="tx-btn secondary"
                onClick={() => {
                  setQ('')
                  setFilter('todos')
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
                      {canOpen ? (
                        <A className="tx-id" onClick={() => goProblem(p.id)}>
                          P-{p.id}
                        </A>
                      ) : (
                        <span className="tx-id">P-{p.id}</span>
                      )}{' '}
                      · {p.service}
                    </div>
                  </div>
                  <StatusBadge s={p.status} />
                </div>
                {p.rootCause ? (
                  <>
                    <RootCause text={p.rootCause} />
                    {p.solution ? <Solution text={p.solution} /> : p.workaround && <Workaround text={p.workaround} />}
                  </>
                ) : (
                  <div className="tx-callout">
                    <p className="tx-muted" style={{ fontSize: 13 }}>
                      La causa raíz todavía se está investigando. Seguí el avance desde el detalle del problema.
                    </p>
                  </div>
                )}
                <div className="ft">
                  <span>
                    {count(incidents.filter((i) => i.problemId === p.id).length, 'incidente')}
                    {last && ` · actualizado ${fmt(last.at)}`}
                  </span>
                  {canOpen && (
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
