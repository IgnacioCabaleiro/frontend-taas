import { useState } from 'react'
import { api, ATTACHMENT_EXTS, MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS, type Priority, type State } from './api'
import { fileProblem, fileSize } from './Attachments'
import { A, FieldError, Filters, Ic, IncStage, IncidentId, Prio, ProblemId, Sla, StatusBadge, can, count, fields, isLate, userName, usersWith, type Run } from './ui'

const PRIOS: Priority[] = ['alta', 'media', 'baja']

export function Incidents(props: {
  state: State
  run: Run
  goProblem?: (id: number) => void
  open: (id: number) => void
  related: number // incidente cerrado que continúa el que se va a registrar (0 = ninguno)
  setRelated: (id: number) => void
}) {
  const { state, run, goProblem, open, related, setRelated } = props
  const { incidents, problems, config, users } = state
  const { sla, problems: withProblems } = config.modules
  const canCreate = can(state, 'crear')
  const canResolve = can(state, 'resolver')
  const showProblem = withProblems && (canResolve || can(state, 'problemas'))
  // Un incidente relacionado arranca con el servicio, la prioridad y los campos propios del cerrado que continúa.
  const [prefill, setPrefill] = useState(() => incidents.find((i) => i.id === related))
  const [formKey, setFormKey] = useState(0)
  const [service, setService] = useState(prefill?.service ?? '')
  const [prio, setPrio] = useState<Priority>(prefill?.priority ?? 'media')
  const [linkIt, setLinkIt] = useState(true)
  const [dismissed, setDismissed] = useState('')
  const [errs, setErrs] = useState<Record<string, boolean>>({})
  // Archivos elegidos para adjuntar al registrar, y los avisos si alguno no se pudo subir.
  const [files, setFiles] = useState<File[]>([])
  const [fileErrors, setFileErrors] = useState<string[]>([])
  type Filter = 'abiertos' | 'mios' | 'vencidos' | 'pausa' | 'sin' | 'resueltos' | 'cerrados' | 'todos'
  const [filter, setFilter] = useState<Filter>('abiertos')
  const [busy, setBusy] = useState(false)

  const active = problems.filter((p) => p.status !== 'resuelto')
  // Si el servicio ya tiene un problema activo, se ofrece su workaround al cargar el incidente.
  const match = active.find((p) => p.service === service)
  const notice = canResolve && match && dismissed !== service

  // Filtros por etapa ITIL: abierto (sin resolvedAt), resuelto sin cerrar y cerrado.
  const openOnes = incidents.filter((i) => !i.resolvedAt)
  const lists = {
    abiertos: openOnes,
    mios: openOnes.filter((i) => i.assigneeId === state.me),
    vencidos: openOnes.filter(isLate),
    pausa: openOnes.filter((i) => config.pauseStates.includes(i.status)),
    sin: incidents.filter((i) => !i.problemId),
    resueltos: incidents.filter((i) => i.resolvedAt && !i.closedAt),
    cerrados: incidents.filter((i) => i.closedAt),
    todos: incidents,
  }

  // Los filtros dependen de lo que el usuario puede hacer y de cómo trabaja la cuenta.
  const options = (
    [
      ['abiertos', 'Abiertos', true],
      ['mios', 'Asignados a mí', canResolve],
      ['vencidos', 'Vencidos', sla],
      ['pausa', 'En pausa', config.pauseStates.length > 0],
      ['sin', 'Sin problema', withProblems && canResolve],
      ['resueltos', 'Resueltos', true],
      ['cerrados', 'Cerrados', true],
      ['todos', 'Todos', true],
    ] as [Filter, string, boolean][]
  )
    .filter(([, , ok]) => ok)
    .map(([k, label]): [Filter, string, number] => [k, label, lists[k].length])

  return (
    <>
      {canCreate && (
      <section className="tx-stack" style={{ gap: 12 }}>
        {related > 0 && (
          <div className="tx-row" style={{ gap: 8 }}>
            <span className="tx-mark">
              Relacionado con #{related}
              <button type="button" className="tx-btn ghost icon sm" aria-label={`Quitar la relación con #${related}`} onClick={() => setRelated(0)}>
                <Ic n="x" />
              </button>
            </span>
            <span className="tx-caption">Precargamos el servicio, la prioridad y los datos del incidente cerrado. Contá qué está pasando ahora.</span>
          </div>
        )}
        <form
          key={formKey}
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
            const body = {
              title,
              description,
              service,
              priority: prio,
              fields: custom,
              assigneeId: Number(assigneeId ?? 0),
              problemId: notice && linkIt ? match.id : 0,
              relatedIncidentId: related,
            }
            // Mientras se guarda, el botón queda deshabilitado: un doble clic no duplica el ticket.
            setBusy(true)
            const ok = await run(api.createIncident(body))
            setBusy(false)
            if (ok) {
              // El incidente ya existe: los archivos se suben a continuación. Si alguno falla, el incidente igual quedó registrado.
              const id = Math.max(...ok.incidents.map((x) => x.id))
              const failed: string[] = []
              for (const f of files) {
                await run(api.addAttachment(id, f), { onError: (m) => failed.push(`${f.name}: ${m}`) })
              }
              setFiles([])
              setFileErrors(failed.length ? [`El incidente #${id} se registró, pero no se pudieron adjuntar: `, ...failed] : [])
              // El formulario se vuelve a montar vacío: sin la precarga del relacionado.
              setFormKey(formKey + 1)
              setPrefill(undefined)
              setRelated(0)
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
              autoFocus={!!prefill}
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
            {sla && (
              <span className="tx-help">
                SLA: primera respuesta en {config.responseHours[prio]} h, resolución en {config.slaHours[prio]} h
              </span>
            )}
          </div>

          <button className="tx-btn primary" style={{ height: 38 }} disabled={busy}>
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
                  <select
                    id={`f-${f.key}`}
                    name={f.key}
                    className="tx-input"
                    aria-invalid={errs[f.key] || undefined}
                    aria-describedby={errs[f.key] ? `f-${f.key}-e` : undefined}
                    defaultValue={prefill?.fields[f.key] ?? ''}
                  >
                    <option value="">Elegí una opción</option>
                    {f.options.map((o) => (
                      <option key={o}>{o}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    id={`f-${f.key}`}
                    name={f.key}
                    type={f.type}
                    className="tx-input"
                    aria-invalid={errs[f.key] || undefined}
                    aria-describedby={errs[f.key] ? `f-${f.key}-e` : undefined}
                    defaultValue={prefill?.fields[f.key] ?? ''}
                  />
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
                  {usersWith(state, 'resolver').map((u) => (
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
            <div className="tx-field" style={{ gridColumn: 'span 2' }}>
              <label className="tx-label" htmlFor="att">
                Adjuntos <span className="opt">Opcional</span>
              </label>
              <div className="att-pick">
                <input
                  id="att"
                  type="file"
                  multiple
                  className="tx-input"
                  accept={ATTACHMENT_EXTS.join(',')}
                  aria-describedby="att-h"
                  onChange={(e) => {
                    // Si alguno no se puede adjuntar, se avisa cuál y no se elige ninguno: hay que volver a elegir.
                    const picked = Array.from(e.target.files ?? [])
                    const bad: string[] = []
                    const ok: File[] = []
                    for (const f of picked) {
                      const why = fileProblem(f, ok.length)
                      if (why) bad.push(why)
                      else ok.push(f)
                    }
                    if (bad.length) e.target.value = ''
                    setFiles(bad.length ? [] : ok)
                    setFileErrors(bad)
                  }}
                />
                <span className="tx-help" id="att-h">
                  Capturas, logs o PDFs que ayuden a entender el problema. Hasta {MAX_ATTACHMENTS} archivos de {fileSize(MAX_ATTACHMENT_BYTES)}.
                  {files.length > 0 && ` Elegidos: ${files.length}.`}
                </span>
                {fileErrors.length > 0 && (
                  <ul className="att-errors" role="alert">
                    {fileErrors.map((m, k) => (
                      <li key={k}>{m}</li>
                    ))}
                  </ul>
                )}
              </div>
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
                <ProblemId id={match.id} go={goProblem} />
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
                  <th style={{ textAlign: 'right' }}>Etapa · estado</th>
                </tr>
              </thead>
              <tbody>
                {[...lists[filter]].reverse().map((i) => (
                  <tr key={i.id}>
                    <td className="w-id" data-label="ID">
                      <IncidentId id={i.id} go={open} />
                    </td>
                    <td className="t-title">
                      <A style={{ color: 'inherit' }} onClick={() => open(i.id)}>
                        {i.title}
                      </A>
                      {i.reopenCount > 0 && (
                        <span className="tx-reopen" title={`Reabierto ${count(i.reopenCount, 'vez', 'veces')}`}>
                          <Ic n="recur" />
                          {i.reopenCount > 1 ? `Reabierto ×${i.reopenCount}` : 'Reabierto'}
                        </span>
                      )}
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
                          <ProblemId id={i.problemId} go={goProblem} />
                        ) : (
                          <span className="tx-subtle">—</span>
                        )}
                      </td>
                    )}
                    <td data-label="Estado" style={{ textAlign: 'right' }}>
                      <IncStage i={i} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}
