// Solicitudes de servicio: pedidos estándar del catálogo (un alta, un acceso, un equipo), aparte de los incidentes.
// Mismo ciclo de vida que un incidente, pero sin servicio afectado, prioridad ni problema: el plazo lo fija el catálogo.
import { useState } from 'react'
import { api, type State } from './api'
import { Dropzone, FileChip, fileProblem } from './Attachments'
import { A, FieldError, Filters, Ic, IncStage, IncidentId, Sla, can, fields, isLate, userName, usersWith, type Run } from './ui'

export function Requests(props: {
  state: State
  run: Run
  open: (id: number) => void
  related: number // solicitud cerrada que continúa la que se va a registrar (0 = ninguna)
  setRelated: (id: number) => void
  goConfig?: () => void
}) {
  const { state, run, open, related, setRelated } = props
  const { requests, config, users } = state
  const { sla } = config.modules
  const catalog = config.requestTypes
  const canCreate = can(state, 'crear')
  const canResolve = can(state, 'resolver')
  // Una solicitud relacionada arranca con el mismo pedido y los campos propios de la cerrada que continúa.
  const [prefill, setPrefill] = useState(() => requests.find((r) => r.id === related))
  const [formKey, setFormKey] = useState(0)
  const [type, setType] = useState(() => (catalog.some((t) => t.name === prefill?.requestType) ? prefill!.requestType : ''))
  const [errs, setErrs] = useState<Record<string, boolean>>({})
  const [files, setFiles] = useState<File[]>([])
  const [fileErrors, setFileErrors] = useState<string[]>([])
  type Filter = 'abiertas' | 'mias' | 'vencidas' | 'resueltas' | 'cerradas' | 'todas'
  const [filter, setFilter] = useState<Filter>('abiertas')
  const [busy, setBusy] = useState(false)
  const chosen = catalog.find((t) => t.name === type)

  const openOnes = requests.filter((r) => !r.resolvedAt)
  const lists = {
    abiertas: openOnes,
    mias: openOnes.filter((r) => r.assigneeId === state.me),
    vencidas: openOnes.filter(isLate),
    resueltas: requests.filter((r) => r.resolvedAt && !r.closedAt),
    cerradas: requests.filter((r) => r.closedAt),
    todas: requests,
  }
  const options = (
    [
      ['abiertas', 'Abiertas', true],
      ['mias', 'Asignadas a mí', canResolve],
      ['vencidas', 'Vencidas', sla],
      ['resueltas', 'Resueltas', true],
      ['cerradas', 'Cerradas', true],
      ['todas', 'Todas', true],
    ] as [Filter, string, boolean][]
  )
    .filter(([, , ok]) => ok)
    .map(([k, label]): [Filter, string, number] => [k, label, lists[k].length])

  return (
    <>
      {canCreate && catalog.length === 0 && (
        <div className="tx-inline-empty">
          Tu cuenta todavía no tiene un catálogo de solicitudes: definí qué se puede pedir y en cuánto se cumple
          {props.goConfig ? (
            <>
              {' '}en <A onClick={props.goConfig}>Configuración</A>.
            </>
          ) : (
            ' (lo arma el titular de la cuenta en Configuración).'
          )}
        </div>
      )}
      {canCreate && catalog.length > 0 && (
        <section className="tx-stack" style={{ gap: 12 }}>
          {related > 0 && (
            <div className="tx-row" style={{ gap: 8 }}>
              <span className="tx-mark">
                Relacionada con #{related}
                <button type="button" className="tx-btn ghost icon sm" aria-label={`Quitar la relación con #${related}`} onClick={() => setRelated(0)}>
                  <Ic n="x" />
                </button>
              </span>
              <span className="tx-caption">Precargamos el pedido y los datos de la solicitud cerrada. Contá qué necesitás ahora.</span>
            </div>
          )}
          <form
            key={formKey}
            className="tx-inline-form tx-glass"
            aria-label="Crear solicitud"
            noValidate
            onSubmit={async (e) => {
              e.preventDefault()
              const { title, description, assigneeId, ...custom } = fields(e.currentTarget)
              const bad: Record<string, boolean> = { type: !chosen }
              for (const f of config.fields) bad[f.key] = f.required && !custom[f.key]?.trim()
              setErrs(bad)
              if (Object.values(bad).some(Boolean)) return
              setBusy(true)
              const ok = await run(
                api.createIncident({
                  kind: 'solicitud',
                  requestType: type,
                  title,
                  description,
                  fields: custom,
                  assigneeId: Number(assigneeId ?? 0),
                  relatedIncidentId: related,
                }),
              )
              setBusy(false)
              if (ok) {
                // La solicitud ya existe: los archivos se suben a continuación. Si alguno falla, igual quedó registrada.
                const id = Math.max(...ok.requests.map((x) => x.id))
                const failed: string[] = []
                for (const f of files) {
                  await run(api.addAttachment(id, f), { onError: (m) => failed.push(`${f.name}: ${m}`) })
                }
                setFiles([])
                setFileErrors(failed.length ? [`La solicitud #${id} se registró, pero no se pudieron adjuntar: `, ...failed] : [])
                setFormKey(formKey + 1)
                setPrefill(undefined)
                setRelated(0)
                setType('')
              }
            }}
          >
            <div className="tx-field">
              <label className="tx-label" htmlFor="rq-t">
                Qué necesitás <span className="req">*</span>
              </label>
              <select
                id="rq-t"
                className="tx-input"
                value={type}
                onChange={(e) => setType(e.target.value)}
                aria-invalid={errs.type || undefined}
                aria-describedby={errs.type ? 'rq-t-e' : undefined}
              >
                <option value="">Elegí del catálogo</option>
                {catalog.map((t) => (
                  <option key={t.name}>{t.name}</option>
                ))}
              </select>
              {errs.type && <FieldError id="rq-t-e">Elegí qué necesitás.</FieldError>}
            </div>

            <div className="tx-field">
              <label className="tx-label" htmlFor="rq-q">
                Resumen <span className="opt">Opcional</span>
              </label>
              <input id="rq-q" name="title" className="tx-input" defaultValue={prefill?.title ?? ''} placeholder="Ej.: Alta para Juana Pérez, de Ventas" autoFocus={!!prefill} />
            </div>

            <div className="tx-field" aria-live="polite">
              <span className="tx-label">Plazo</span>
              <span style={{ minHeight: 38, display: 'flex', alignItems: 'center' }} className="tx-strong">
                {!chosen ? <span className="tx-subtle">—</span> : sla ? `${chosen.hours} h` : 'Sin plazo'}
              </span>
              <span className="tx-help">{sla ? 'Lo fija el catálogo: un pedido estándar tiene un plazo estándar.' : 'Tu cuenta no tiene el módulo de SLA.'}</span>
            </div>

            <button className="tx-btn primary" style={{ height: 38 }} disabled={busy}>
              <Ic n="plus" />
              Pedir
            </button>

            <div className="tx-cols" style={{ gridColumn: '1 / -1' }}>
              {config.fields.map((f) => (
                <div key={f.key} className="tx-field">
                  <label className="tx-label" htmlFor={`rq-f-${f.key}`}>
                    {f.label} {f.required ? <span className="req">*</span> : <span className="opt">Opcional</span>}
                  </label>
                  {f.type === 'select' ? (
                    <select
                      id={`rq-f-${f.key}`}
                      name={f.key}
                      className="tx-input"
                      aria-invalid={errs[f.key] || undefined}
                      aria-describedby={errs[f.key] ? `rq-f-${f.key}-e` : undefined}
                      defaultValue={prefill?.fields[f.key] ?? ''}
                    >
                      <option value="">Elegí una opción</option>
                      {f.options.map((o) => (
                        <option key={o}>{o}</option>
                      ))}
                    </select>
                  ) : (
                    <input
                      id={`rq-f-${f.key}`}
                      name={f.key}
                      type={f.type}
                      className="tx-input"
                      aria-invalid={errs[f.key] || undefined}
                      aria-describedby={errs[f.key] ? `rq-f-${f.key}-e` : undefined}
                      defaultValue={prefill?.fields[f.key] ?? ''}
                    />
                  )}
                  {errs[f.key] && <FieldError id={`rq-f-${f.key}-e`}>Completá este campo.</FieldError>}
                </div>
              ))}
              {canResolve && (
                <div className="tx-field">
                  <label className="tx-label" htmlFor="rq-as">
                    Asignar a
                  </label>
                  <select id="rq-as" name="assigneeId" className="tx-input" defaultValue="0">
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
                <label className="tx-label" htmlFor="rq-d">
                  Detalle <span className="opt">Opcional</span>
                </label>
                <input id="rq-d" name="description" className="tx-input" placeholder="Lo que haga falta para cumplirla: sistema, permisos, fecha en que se necesita" />
              </div>
              <div className="tx-field" style={{ gridColumn: 'span 2' }}>
                <label className="tx-label" htmlFor="rq-att">
                  Adjuntos <span className="opt">Opcional</span>
                </label>
                <div className="att-pick">
                  <Dropzone
                    id="rq-att"
                    describedBy="rq-att-h"
                    onFiles={(picked) => {
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
                  <span className="tx-help" id="rq-att-h">
                    Se suben cuando registrás la solicitud. Por ejemplo, una autorización firmada.
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
        </section>
      )}

      <section>
        <div className="tx-section-head">
          <h2 className="tx-h3">{canResolve ? 'Solicitudes' : 'Mis solicitudes'}</h2>
          <Filters value={filter} onChange={setFilter} options={options} />
        </div>
        {lists[filter].length === 0 ? (
          <div className="tx-inline-empty">No hay solicitudes en este filtro.</div>
        ) : (
          <div className="tx-table-wrap tx-solid">
            <table className="tx-table">
              <thead>
                <tr>
                  <th className="w-id">ID</th>
                  <th>Solicitud</th>
                  {sla && <th>Plazo</th>}
                  <th>Asignada</th>
                  <th style={{ textAlign: 'right' }}>Etapa · estado</th>
                </tr>
              </thead>
              <tbody>
                {[...lists[filter]].reverse().map((r) => (
                  <tr key={r.id}>
                    <td className="w-id" data-label="ID">
                      <IncidentId id={r.id} go={open} what="la solicitud" />
                    </td>
                    <td className="t-title">
                      <A style={{ color: 'inherit' }} onClick={() => open(r.id)}>
                        {r.title}
                      </A>
                      {r.title !== r.requestType && <div className="tx-caption">{r.requestType}</div>}
                    </td>
                    {sla && (
                      <td data-label="Plazo">
                        <Sla i={r} />
                      </td>
                    )}
                    <td className="tx-muted" data-label="Asignada">
                      {userName(users, r.assigneeId, '—')}
                    </td>
                    <td data-label="Estado" style={{ textAlign: 'right' }}>
                      <IncStage i={r} />
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
