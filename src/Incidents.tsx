import { useState } from 'react'
import { api, type Priority, type State } from './api'
import { Dropzone, FileChip, fileProblem } from './Attachments'
import { KnownErrorHints, useMatches } from './Knowledge'
import { A, FieldError, Filters, Ic, IncStage, IncidentId, LevelPicker, Prio, ProblemId, priorityFor, Sla, StatusBadge, can, count, fields, isLate, userName, usersWith, type Run } from './ui'

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
  // La prioridad sale de la matriz impacto × urgencia. Si el cerrado que continúa se registró con la prioridad
  // elegida a mano, se precarga como impacto con urgencia media: la matriz da la misma prioridad.
  const [impact, setImpact] = useState<Priority>(prefill?.impact || prefill?.priority || 'media')
  const [urgency, setUrgency] = useState<Priority>(prefill?.urgency || 'media')
  const prio = priorityFor(impact, urgency)
  const [linkIt, setLinkIt] = useState(true)
  const [dismissed, setDismissed] = useState('')
  const [errs, setErrs] = useState<Record<string, boolean>>({})
  // Archivos elegidos para adjuntar al registrar, y los avisos si alguno no se pudo subir.
  const [files, setFiles] = useState<File[]>([])
  const [fileErrors, setFileErrors] = useState<string[]>([])
  type Filter = 'abiertos' | 'mios' | 'vencidos' | 'pausa' | 'sin' | 'resueltos' | 'cerrados' | 'todos'
  const [filter, setFilter] = useState<Filter>('abiertos')
  const [busy, setBusy] = useState(false)
  const [q, setQ] = useState('')
  type Sort = 'urgentes' | 'recientes' | 'antiguos'
  const [sort, setSort] = useState<Sort>('urgentes')
  // Quien atiende vive en la lista: el alta se abre con un botón. Quien solo reporta entra a cargar.
  const [composing, setComposing] = useState(!canResolve || related > 0)

  const active = problems.filter((p) => p.status !== 'resuelto')
  // Si el servicio ya tiene un problema activo, se ofrece su workaround al cargar el incidente.
  const match = active.find((p) => p.service === service)
  // Lo que se va escribiendo (título y detalle) se compara con los errores conocidos: el más parecido gana
  // al aviso por servicio.
  const [draft, setDraft] = useState('')
  const hits = useMatches(draft, service, withProblems && canCreate)
  const [linkTo, setLinkTo] = useState(0)
  const [applyNow, setApplyNow] = useState(false)
  const [deflected, setDeflected] = useState('')
  const notice = canResolve && match && dismissed !== service && hits.length === 0

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

  const PRIO_RANK = { alta: 0, media: 1, baja: 2 }
  const due = (i: (typeof incidents)[number]) => (i.dueAt ? +new Date(i.dueAt) : Infinity)
  const needle = q.trim().toLowerCase().replace(/^#/, '')
  const rows = lists[filter]
    .filter((i) =>
      !needle ? true : [String(i.id), i.title, i.service, i.status, userName(users, i.assigneeId, '')].join(' ').toLowerCase().includes(needle),
    )
    .sort((a, b) => {
      if (sort === 'recientes') return b.id - a.id
      if (sort === 'antiguos') return a.id - b.id
      // Urgentes: vencidos primero, después lo que vence antes y, a igual vencimiento, la mayor prioridad.
      return Number(isLate(b)) - Number(isLate(a)) || due(a) - due(b) || PRIO_RANK[a.priority] - PRIO_RANK[b.priority] || b.id - a.id
    })

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
      {canCreate && !composing && (
        <div className="tx-row">
          <button type="button" className="tx-btn primary" onClick={() => setComposing(true)}>
            <Ic n="plus" />
            Nuevo incidente
          </button>
          {deflected && <span className="tx-caption">A quien reportó le alcanzó el workaround de «{deflected}».</span>}
        </div>
      )}
      {canCreate && composing && (
      <section className="tx-stack" style={{ gap: 12 }}>
        {canResolve && (
          <div className="tx-row" style={{ justifyContent: 'space-between' }}>
            <h2 className="tx-h3">Nuevo incidente</h2>
            <button type="button" className="tx-btn ghost sm" onClick={() => setComposing(false)}>
              Cancelar
            </button>
          </div>
        )}
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
          className="tx-inline-form tx-solid"
          aria-label="Crear incidente"
          noValidate
          onInput={(e) => {
            const f = e.currentTarget.elements
            const v = (n: string) => (f.namedItem(n) as HTMLInputElement | null)?.value ?? ''
            setDraft(`${v('title')} ${v('description')}`)
            setDeflected('')
          }}
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
              impact,
              urgency,
              fields: custom,
              assigneeId: Number(assigneeId ?? 0),
              problemId: linkTo || (notice && linkIt ? match.id : 0),
              relatedIncidentId: related,
            }
            // Mientras se guarda, el botón queda deshabilitado: un doble clic no duplica el ticket.
            setBusy(true)
            const ok = await run(api.createIncident(body))
            setBusy(false)
            if (ok) {
              // El incidente ya existe: los archivos se suben a continuación. Si alguno falla, el incidente igual quedó registrado.
              const id = Math.max(...ok.incidents.map((x) => x.id))
              if (linkTo && applyNow) await run(api.applyWorkaround(id, linkTo))
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
              setImpact('media')
              setUrgency('media')
              setLinkIt(true)
              setDraft('')
              setLinkTo(0)
              setApplyNow(false)
              if (canResolve) setComposing(false)
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

          {/* La prioridad no se elige: se calcula con el impacto y la urgencia de la fila de abajo. */}
          <div className="tx-field" aria-live="polite">
            <span className="tx-label">Prioridad</span>
            <span style={{ minHeight: 38, display: 'flex', alignItems: 'center' }}>
              <Prio p={prio} />
            </span>
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

          <div className="tx-cols" style={{ gridColumn: '1 / -1' }}>
            <LevelPicker kind="impact" value={impact} onChange={setImpact} />
            <LevelPicker kind="urgency" value={urgency} onChange={setUrgency} />
          </div>

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
                <Dropzone
                  id="att"
                  describedBy="att-h"
                  onFiles={(picked) => {
                    // Se suman a los ya elegidos (sin repetir) y los que no se pueden adjuntar se avisan: el resto sigue.
                    const next = [...files]
                    const bad: string[] = []
                    for (const f of picked) {
                      if (next.some((x) => x.name === f.name && x.size === f.size && x.lastModified === f.lastModified)) continue
                      const why = fileProblem(f, next.length)
                      if (why) bad.push(why)
                      else next.push(f)
                    }
                    setFiles(next)
                    setFileErrors(bad)
                  }}
                />
                {files.length > 0 && (
                  <ul className="att-chips" aria-label="Archivos elegidos">
                    {files.map((f, k) => (
                      <FileChip key={`${f.name}-${f.size}-${f.lastModified}`} file={f} onRemove={() => setFiles(files.filter((_, j) => j !== k))} />
                    ))}
                  </ul>
                )}
                <span className="tx-help" id="att-h">
                  Se suben cuando registrás el incidente.
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

        {deflected && (
          <div className="tx-notice tx-glass-strong" role="status">
            <div className="tx-notice-ic">
              <Ic n="check" size="lg" />
            </div>
            <div>
              <span className="tx-strong">Listo, no hizo falta el ticket.</span>
              <p className="tx-muted" style={{ fontSize: 13 }}>
                Le avisamos al equipo que el workaround de «{deflected}» te sirvió. Si vuelve a pasar, registralo y lo seguimos.
              </p>
            </div>
            <button className="tx-btn ghost icon sm" aria-label="Cerrar aviso" onClick={() => setDeflected('')}>
              <Ic n="x" />
            </button>
          </div>
        )}
        <KnownErrorHints
          hits={hits}
          team={canResolve}
          linkTo={linkTo}
          onLink={(id) => {
            setLinkTo(id)
            if (!id) setApplyNow(false)
          }}
          applyNow={applyNow}
          onApplyNow={setApplyNow}
          goProblem={goProblem}
          onDeflected={async (problemId) => {
            const ok = await run(api.deflect(problemId))
            if (ok) {
              setDeflected(hits.find((h) => h.problemId === problemId)?.title ?? '')
              setDraft('')
              setFormKey(formKey + 1)
              setService('')
            }
            return !!ok
          }}
        />
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
        <div className="inc-tools">
          <label className="inc-search">
            <Ic n="search" />
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por #, título, servicio o persona" aria-label="Buscar incidentes" />
          </label>
          <label className="inc-sort">
            <span className="tx-caption">Ordenar</span>
            <select className="tx-input" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Ordenar incidentes">
              <option value="urgentes">Lo más urgente primero</option>
              <option value="recientes">Más recientes</option>
              <option value="antiguos">Más antiguos</option>
            </select>
          </label>
        </div>
        {rows.length === 0 ? (
          <div className="tx-inline-empty">{needle ? `Ningún incidente coincide con «${q.trim()}».` : 'No hay incidentes en este filtro.'}</div>
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
                {rows.map((i) => (
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
