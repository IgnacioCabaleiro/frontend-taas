import { useState } from 'react'
import { api, type Priority, type State } from './api'
import { A, Dialog, FieldError, Filters, Ic, IncBadge, Prio, Sla, StatusBadge, Workaround, can, fields, fmt, isLate, userName, type Run } from './ui'

const PRIOS: Priority[] = ['alta', 'media', 'baja']

export function Incidents({ state, run, goProblem }: { state: State; run: Run; goProblem: (id: number) => void }) {
  const { incidents, problems, config, users } = state
  const { sla, problems: withProblems } = config.modules
  const canCreate = can(state, 'crear')
  const canResolve = can(state, 'resolver')
  const showProblem = withProblems && (canResolve || can(state, 'problemas'))
  const [service, setService] = useState('')
  const [prio, setPrio] = useState<Priority>('media')
  const [linkIt, setLinkIt] = useState(true)
  const [dismissed, setDismissed] = useState('')
  const [errs, setErrs] = useState<Record<string, boolean>>({})
  type Filter = 'abiertos' | 'mios' | 'sin' | 'vencidos' | 'todos'
  const [filter, setFilter] = useState<Filter>('abiertos')
  const [detail, setDetail] = useState(0)

  const active = problems.filter((p) => p.status !== 'resuelto')
  // Si el servicio ya tiene un problema activo, se ofrece su workaround al cargar el incidente.
  const match = active.find((p) => p.service === service)
  const notice = canResolve && match && dismissed !== service

  const openOnes = incidents.filter((i) => !i.resolvedAt)
  const lists = {
    abiertos: openOnes,
    mios: openOnes.filter((i) => i.assigneeId === state.me),
    sin: incidents.filter((i) => !i.problemId),
    vencidos: openOnes.filter(isLate),
    todos: incidents,
  }

  // Los filtros dependen de lo que el usuario puede hacer y de los módulos de la cuenta.
  const options = (
    [
      ['abiertos', 'Abiertos', true],
      ['mios', 'Asignados a mí', canResolve],
      ['vencidos', 'Vencidos', sla],
      ['sin', 'Sin problema', withProblems && canResolve],
      ['todos', 'Todos', true],
    ] as [Filter, string, boolean][]
  )
    .filter(([, , ok]) => ok)
    .map(([k, label]): [Filter, string, number] => [k, label, lists[k].length])

  return (
    <>
      {canCreate && (
      <section className="tx-stack" style={{ gap: 12 }}>
        <form
          className="tx-inline-form tx-glass"
          aria-label="Crear incidente"
          noValidate
          onSubmit={async (e) => {
            e.preventDefault()
            const form = e.currentTarget
            const { title, description, assigneeId, ...custom } = fields(form)
            // Se valida al enviar: título, servicio y los campos que la empresa marcó como obligatorios.
            const bad: Record<string, boolean> = { title: !title.trim(), service: !service }
            for (const f of config.fields) bad[f.key] = f.required && !custom[f.key]?.trim()
            setErrs(bad)
            if (Object.values(bad).some(Boolean)) return
            const body = { title, description, service, priority: prio, fields: custom, assigneeId: Number(assigneeId ?? 0), problemId: notice && linkIt ? match.id : 0 }
            if (await run(api.createIncident(body))) {
              form.reset()
              setService('')
              setPrio('media')
              setLinkIt(true)
            }
          }}
        >
          <div className="tx-field">
            <label className="tx-label" htmlFor="q">
              Qué está pasando <span className="req">*</span>
            </label>
            <input
              id="q"
              name="title"
              className="tx-input"
              placeholder="Describí el síntoma en una línea"
              aria-invalid={errs.title || undefined}
              aria-describedby={errs.title ? 'q-e' : undefined}
            />
            {errs.title && <FieldError id="q-e">Contanos qué está pasando.</FieldError>}
          </div>

          <div className="tx-field">
            <label className="tx-label" htmlFor="s">
              Servicio afectado <span className="req">*</span>
            </label>
            <select
              id="s"
              className="tx-input"
              value={service}
              onChange={(e) => setService(e.target.value)}
              aria-invalid={errs.service || undefined}
              aria-describedby={errs.service ? 's-e' : undefined}
            >
              <option value="">Elegí un servicio</option>
              {config.services.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            {errs.service && <FieldError id="s-e">Elegí el servicio afectado.</FieldError>}
          </div>

          <div className="tx-field">
            <span className="tx-label">Prioridad</span>
            <div className="tx-seg" role="group" aria-label="Prioridad">
              {PRIOS.map((p) => (
                <button key={p} type="button" aria-pressed={p === prio} onClick={() => setPrio(p)}>
                  <span className={`tx-prio ${p}`} style={{ padding: 0, background: 'none', height: 'auto' }} />
                  {p[0].toUpperCase() + p.slice(1)}
                </button>
              ))}
            </div>
            {sla && <span className="tx-help">SLA: {config.slaHours[prio]} h para resolver</span>}
          </div>

          <button className="tx-btn primary" style={{ height: 38 }}>
            <Ic n="plus" />
            Crear
          </button>

          {/* Campos propios de la empresa (Configuración → Campos del incidente) */}
          <div className="tx-cols" style={{ gridColumn: '1 / -1' }}>
            {config.fields.map((f) => (
              <div key={f.key} className="tx-field">
                <label className="tx-label" htmlFor={`f-${f.key}`}>
                  {f.label} {f.required ? <span className="req">*</span> : <span className="opt">Opcional</span>}
                </label>
                {f.type === 'select' ? (
                  <select id={`f-${f.key}`} name={f.key} className="tx-input" aria-invalid={errs[f.key] || undefined} defaultValue="">
                    <option value="">Elegí una opción</option>
                    {f.options.map((o) => (
                      <option key={o}>{o}</option>
                    ))}
                  </select>
                ) : (
                  <input id={`f-${f.key}`} name={f.key} type={f.type} className="tx-input" aria-invalid={errs[f.key] || undefined} />
                )}
                {errs[f.key] && <FieldError id={`f-${f.key}-e`}>Completá este campo.</FieldError>}
              </div>
            ))}
            {canResolve && (
              <div className="tx-field">
                <label className="tx-label" htmlFor="as">
                  Asignar a
                </label>
                <select id="as" name="assigneeId" className="tx-input" defaultValue="0">
                  <option value="0">Sin asignar</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="tx-field" style={{ gridColumn: 'span 2' }}>
              <label className="tx-label" htmlFor="d">
                Detalle <span className="opt">Opcional</span>
              </label>
              <input id="d" name="description" className="tx-input" placeholder="Qué intentó la persona, desde cuándo pasa, a quiénes afecta" />
            </div>
          </div>
        </form>

        {notice && (
          <div className="tx-notice tx-glass-strong" role="status">
            <div className="tx-notice-ic">
              <Ic n="bulb" size="lg" />
            </div>
            <div>
              <div className="tx-row" style={{ gap: 8 }}>
                <span className="tx-strong">{match.service} ya tiene un problema activo:</span>
                <A className="tx-id" onClick={() => goProblem(match.id)}>
                  P-{match.id}
                </A>
                <span className="tx-strong">{match.title}</span>
                <StatusBadge s={match.status} />
              </div>
              {match.workaround && (
                <div className="tx-notice-wa">
                  <span className="tx-overline" style={{ color: 'var(--status-conocido-fg)' }}>
                    Workaround
                  </span>
                  <div>{match.workaround}</div>
                </div>
              )}
              <label className={`tx-check ${linkIt ? 'is-on' : ''}`} style={{ marginTop: 12 }}>
                <input type="checkbox" checked={linkIt} onChange={(e) => setLinkIt(e.target.checked)} />
                <span className="box">{linkIt && <Ic n="check" />}</span>
                Vincular este incidente al problema
              </label>
            </div>
            <button className="tx-btn ghost icon sm" aria-label="Cerrar aviso" onClick={() => setDismissed(service)}>
              <Ic n="x" />
            </button>
          </div>
        )}
      </section>
      )}

      <section>
        <div className="tx-section-head">
          <h2 className="tx-h3">{canResolve ? 'Incidentes' : 'Mis incidentes'}</h2>
          <Filters value={filter} onChange={setFilter} options={options} />
        </div>
        {lists[filter].length === 0 ? (
          <div className="tx-inline-empty">No hay incidentes en este filtro.</div>
        ) : (
          <div className="tx-table-wrap tx-solid">
            <table className="tx-table">
              <thead>
                <tr>
                  <th className="w-id">ID</th>
                  <th>Incidente</th>
                  <th>Prioridad</th>
                  {sla && <th>SLA</th>}
                  <th>Asignado</th>
                  {showProblem && <th>Problema</th>}
                  <th style={{ textAlign: 'right' }}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {[...lists[filter]].reverse().map((i) => (
                  <tr key={i.id}>
                    <td className="w-id" data-label="ID">
                      <A className="tx-id" aria-label={`Abrir el incidente ${i.id}`} onClick={() => setDetail(i.id)}>
                        #{i.id}
                      </A>
                    </td>
                    <td className="t-title">
                      <A style={{ color: 'inherit' }} onClick={() => setDetail(i.id)}>
                        {i.title}
                      </A>
                      <div className="tx-caption">{i.service}</div>
                    </td>
                    <td data-label="Prioridad">
                      <Prio p={i.priority} />
                    </td>
                    {sla && (
                      <td data-label="SLA">
                        <Sla i={i} />
                      </td>
                    )}
                    <td className="tx-muted" data-label="Asignado">
                      {userName(users, i.assigneeId, '—')}
                    </td>
                    {showProblem && (
                      <td data-label="Problema">
                        {i.problemId ? (
                          can(state, 'problemas') ? (
                            <A className="tx-id" onClick={() => goProblem(i.problemId)}>
                              P-{i.problemId}
                            </A>
                          ) : (
                            <span className="tx-strong">P-{i.problemId}</span>
                          )
                        ) : (
                          <span className="tx-subtle">—</span>
                        )}
                      </td>
                    )}
                    <td data-label="Estado" style={{ textAlign: 'right' }}>
                      <IncBadge i={i} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {detail > 0 && <IncidentDialog id={detail} state={state} run={run} goProblem={goProblem} onClose={() => setDetail(0)} />}
    </>
  )
}

// Detalle de un incidente: datos propios de la empresa, SLA y las tres decisiones (estado, persona, problema).
function IncidentDialog({ id, state, run, goProblem, onClose }: { id: number; state: State; run: Run; goProblem: (id: number) => void; onClose: () => void }) {
  const { config, users, problems } = state
  const canResolve = can(state, 'resolver')
  const i = state.incidents.find((x) => x.id === id)!
  const p = problems.find((x) => x.id === i.problemId)
  const closed = config.states[config.states.length - 1]
  const patch = (b: Parameters<typeof api.updateIncident>[1]) => run(api.updateIncident(i.id, b))

  return (
    <Dialog
      title={`#${i.id} ${i.title}`}
      sub={`${i.service} · creado el ${fmt(i.createdAt)}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="tx-btn ghost" onClick={onClose}>
            Cerrar
          </button>
          {canResolve && !i.resolvedAt && (
            <button type="button" className="tx-btn primary" onClick={() => patch({ status: closed })}>
              <Ic n="check" />
              {p?.workaround ? 'Resolver con workaround' : `Pasar a ${closed}`}
            </button>
          )}
        </>
      }
    >
      <div className="tx-row">
        <Prio p={i.priority} />
        <IncBadge i={i} />
        {i.dueAt && <Sla i={i} />}
        {!canResolve && <span className="tx-caption">Asignado a: {userName(users, i.assigneeId, 'nadie todavía')}</span>}
      </div>
      {i.description && <p>{i.description}</p>}
      {config.fields.some((f) => i.fields[f.key]) && (
        <div className="tx-callout">
          <div className="tx-cols">
            {config.fields
              .filter((f) => i.fields[f.key])
              .map((f) => (
                <div key={f.key} className="tx-block">
                  <span className="tx-overline">{f.label}</span>
                  <p>{i.fields[f.key]}</p>
                </div>
              ))}
          </div>
        </div>
      )}
      {p?.workaround && p.status !== 'resuelto' && <Workaround text={p.workaround} />}

      {canResolve && (
      <>
      <div className="tx-cols">
        <div className="tx-field">
          <label className="tx-label" htmlFor="id-st">
            Estado
          </label>
          <select id="id-st" className="tx-input" value={i.status} onChange={(e) => patch({ status: e.target.value })}>
            {config.states.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
        <div className="tx-field">
          <label className="tx-label" htmlFor="id-as">
            Asignado a
          </label>
          <select id="id-as" className="tx-input" value={i.assigneeId} onChange={(e) => patch({ assigneeId: Number(e.target.value) })}>
            <option value={0}>Sin asignar</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      {config.modules.problems && (
      <div className="tx-field">
        <label className="tx-label" htmlFor="id-pr">
          Problema asociado
        </label>
        {p ? (
          <div className="tx-row" style={{ gap: 8 }}>
            <A
              className="tx-id"
              onClick={() => {
                onClose()
                if (can(state, 'problemas')) goProblem(p.id)
              }}
            >
              P-{p.id}
            </A>
            <span className="tx-strong">{p.title}</span>
            <StatusBadge s={p.status} />
          </div>
        ) : (
          <select id="id-pr" className="tx-input" value="" onChange={(e) => patch({ problemId: Number(e.target.value) })}>
            <option value="">Sin problema: vincular a…</option>
            {problems
              .filter((x) => x.status !== 'resuelto')
              .map((x) => (
                <option key={x.id} value={x.id}>
                  P-{x.id} {x.title}
                </option>
              ))}
          </select>
        )}
      </div>
      )}
      </>
      )}
    </Dialog>
  )
}
