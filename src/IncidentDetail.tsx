// Detalle de un incidente: su ciclo de vida ITIL (registro, diagnóstico, resolución, cierre), la actividad
// con el solicitante y las notas de trabajo, y los dos SLA.
import { useState } from 'react'
import { api, type Incident, type ResolutionCode, type State } from './api'
import {
  A,
  CLOSING_CODES,
  Dialog,
  FieldError,
  FirstResponse,
  Ic,
  IncBadge,
  IncidentId,
  PauseBadge,
  Prio,
  ProblemId,
  RESOLUTION,
  Sla,
  StageBadge,
  StatusBadge,
  Workaround,
  author,
  autoCloseAt,
  can,
  count,
  fields,
  fmt,
  isPaused,
  resolutionLabel,
  stage,
  userName,
  usersWith,
  type Run,
} from './ui'

const STEP_NAME = ['Registro', 'Diagnóstico', 'Resolución', 'Cierre']
const STEP_CLS = ['s-identificado', 's-analisis', 's-resuelto', 's-resuelto']

// El último evento de ciertos tipos (el historial está en orden cronológico).
const lastOf = (i: Incident, kinds: Incident['history'][number]['kind'][]) => {
  for (let k = i.history.length - 1; k >= 0; k--) if (kinds.includes(i.history[k].kind)) return { at: k, e: i.history[k] }
  return undefined
}

// En qué paso del ciclo está el incidente y la fecha de cada paso.
// Diagnóstico: el primer cambio de estado posterior al último registro o reapertura.
function lifecycle(i: Incident, initial: string) {
  const anchor = lastOf(i, ['creado', 'reabierto'])?.at ?? -1
  const diag = i.history.slice(anchor + 1).find((h) => h.kind === 'estado')
  const closing = lastOf(i, ['cerrado'])?.e
  const auto = !!closing && closing.userId === 0
  // 4 = todos los pasos hechos (cerrado).
  const step = i.closedAt ? 4 : i.resolvedAt ? 2 : diag || i.status !== initial ? 1 : 0
  const dates = [i.createdAt, diag?.at, i.resolvedAt, i.closedAt]
  const when = (k: number) => {
    const at = dates[k]
    if (!at) return k <= step ? '—' : 'Pendiente' // hecho sin fecha: se resolvió sin pasar por el diagnóstico
    if (k === step) return `Desde ${fmt(at)}`
    return k === 3 && auto ? `${fmt(at)} · automático` : fmt(at)
  }
  return { step, when, auto, closing }
}

export function IncidentDetail(props: {
  i: Incident
  state: State
  run: Run
  error?: string
  back: () => void
  goProblem?: (id: number) => void
  goIncident: (id: number) => void
  onRelated: (id: number) => void
}) {
  const { i, state, run } = props
  const { config, users, problems } = state
  const canResolve = can(state, 'resolver')
  const st = stage(i)
  const initial = config.states[0]
  const resolvedState = config.states[config.states.length - 1]
  const p = problems.find((x) => x.id === i.problemId)
  const mine = i.createdBy === state.me
  const paused = isPaused(i)
  const { step, when, auto, closing } = lifecycle(i, initial)
  const resolution = lastOf(i, ['resuelto'])?.e
  const closesAt = autoCloseAt(i, config)
  const [dialog, setDialog] = useState<'' | 'resolver' | 'reabrir'>('')
  const [busy, setBusy] = useState(false)
  const patch = (b: Parameters<typeof api.updateIncident>[1]) => run(api.updateIncident(i.id, b))
  // Registrar uno relacionado: quien resuelve, o el solicitante con uno suyo; siempre que su rol pueda registrar.
  const canRelate = st === 'cerrado' && can(state, 'crear') && (canResolve || mine)
  const showProblem = config.modules.problems && (canResolve || can(state, 'problemas'))
  const editable = canResolve && st !== 'cerrado'
  const related = state.incidents.some((x) => x.id === i.relatedIncidentId) ? props.goIncident : undefined

  const head = (
    <div className="tx-panel-head">
      <div>
        <span className="tx-overline">
          {step < 4 ? `Etapa ${step + 1} de 4` : 'Etapa 4 de 4 · Solo lectura'}
          {i.reopenCount > 0 && ` · ${i.reopenCount === 1 ? 'Reabierto una vez' : `Reabierto ${i.reopenCount} veces`}`}
        </span>
        <h2 className="tx-h3">{STEP_NAME[Math.min(step, 3)]}</h2>
      </div>
      <StageBadge i={i} />
    </div>
  )

  const resolutionBlock = i.resolvedAt && (
    <div className="tx-callout sol">
      <div className="hd">
        <span className="tx-overline" style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          <Ic n="check" />
          Resolución · {resolutionLabel(i.resolutionCode)}
        </span>
      </div>
      {i.resolutionNote && <p style={{ whiteSpace: 'pre-wrap' }}>{i.resolutionNote}</p>}
      <div className="tx-caption" style={{ marginTop: 6 }}>
        Resuelto el {fmt(i.resolvedAt)}
        {resolution && ` por ${author(users, resolution.userId)}`}
      </div>
    </div>
  )

  return (
    <>
      <A className="tx-back" style={{ alignSelf: 'flex-start' }} onClick={props.back}>
        <Ic n="back" />
        Volver a incidentes
      </A>
      <header className="tx-detail-head tx-glass" style={{ marginTop: -12 }}>
        <div className="meta">
          <span className="tx-id" style={{ fontSize: 14 }}>
            #{i.id}
          </span>
          <span className="tx-subtle">·</span>
          <span className="tx-muted" style={{ fontSize: 13, fontWeight: 550 }}>
            {i.service}
          </span>
          <Prio p={i.priority} />
          <StageBadge i={i} />
          {!i.resolvedAt && <IncBadge i={i} />}
          {paused && <PauseBadge />}
        </div>
        <h1 className="tx-h1">{i.title}</h1>
      </header>

      <ol className="tx-stepper tx-glass" aria-label="Etapas del incidente">
        {STEP_NAME.map((nm, k) => {
          const done = k < step
          return (
            <li key={nm} className={`tx-step ${k === step ? 'current' : done ? 'done' : 'pending'} ${STEP_CLS[k]}`} aria-current={k === step ? 'step' : undefined}>
              <span className="tx-step-dot">{done ? <Ic n="check" /> : k + 1}</span>
              <span className="nm">{nm}</span>
              <span className="when">{when(k)}</span>
            </li>
          )
        })}
      </ol>

      <div className="tx-detail-grid">
        <div className="tx-stack" style={{ gap: 20, minWidth: 0 }}>
          <section className="tx-panel tx-solid">
            {head}
            {i.description ? <p style={{ whiteSpace: 'pre-wrap' }}>{i.description}</p> : <p className="tx-subtle">Sin detalle.</p>}
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

            {st === 'abierto' && (
              <>
                {p?.workaround && p.status !== 'resuelto' && <Workaround text={p.workaround} />}
                {paused && (
                  <div className="tx-callout">
                    <div className="tx-row" style={{ gap: 10 }}>
                      <Ic n="pause" />
                      <span style={{ fontSize: 13 }}>
                        El reloj del SLA de resolución está detenido desde el {fmt(i.pausedAt!)}, mientras el incidente siga en «{i.status}».
                      </span>
                    </div>
                  </div>
                )}
                {canResolve && (
                  <div className="tx-actions">
                    <button type="button" className="tx-btn primary lg" onClick={() => setDialog('resolver')}>
                      <Ic n="check" />
                      Resolver
                    </button>
                  </div>
                )}
              </>
            )}

            {st === 'resuelto' && (
              <>
                {resolutionBlock}
                <div className="tx-callout">
                  <div className="tx-row" style={{ gap: 10 }}>
                    <Ic n="clock" />
                    <span style={{ fontSize: 13 }}>
                      {/* La fecha solo la ve quien resuelve: el solicitante no ve las notas, que también son actividad. */}
                      {closesAt
                        ? canResolve
                          ? `Se cierra automáticamente el ${fmt(closesAt.toISOString())} si no hay actividad.`
                          : 'Se cierra automáticamente si no hay actividad.'
                        : 'El cierre automático está frenado: el solicitante respondió después de la resolución. Quien gestiona el incidente decide si lo cierra o lo reabre.'}
                    </span>
                  </div>
                </div>
                {canResolve && (
                  <div className="tx-actions">
                    <button type="button" className="tx-btn secondary lg" onClick={() => setDialog('reabrir')}>
                      <Ic n="retry" />
                      Reabrir
                    </button>
                    <button
                      type="button"
                      className="tx-btn primary lg"
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true)
                        await run(api.close(i.id))
                        setBusy(false)
                      }}
                    >
                      <Ic n="flag" />
                      Cerrar
                    </button>
                  </div>
                )}
              </>
            )}

            {st === 'cerrado' && (
              <>
                {resolutionBlock}
                <div className="tx-callout">
                  <div className="tx-row" style={{ gap: 10 }}>
                    <Ic n="lock" />
                    <span style={{ fontSize: 13 }}>
                      {auto
                        ? `Cerrado automáticamente el ${fmt(i.closedAt!)}.`
                        : `Cerrado el ${fmt(i.closedAt!)}${closing ? ` por ${author(users, closing.userId)}` : ''}.`}{' '}
                      Un incidente cerrado es de solo lectura: si vuelve a pasar, se registra un incidente relacionado.
                    </span>
                  </div>
                </div>
                {canRelate && (
                  <div className="tx-actions">
                    <button type="button" className="tx-btn primary lg" onClick={() => props.onRelated(i.id)}>
                      <Ic n="plus" />
                      Registrar incidente relacionado
                    </button>
                  </div>
                )}
              </>
            )}
          </section>

          <section className="tx-panel tx-solid" aria-labelledby="inc-act">
            <h2 className="tx-h3" id="inc-act">
              Actividad
            </h2>
            <Composer i={i} state={state} run={run} />
            {i.history.length === 0 ? (
              <div className="tx-inline-empty">Este incidente no tiene actividad registrada.</div>
            ) : (
              <ol className="tx-timeline">
                {[...i.history].reverse().map((h, k) => (
                  <li key={k} className={`tx-tl c-${h.kind}`}>
                    {h.kind === 'respuesta' || h.kind === 'nota' ? (
                      <div className="msg">
                        <span className="tx-overline">
                          <Ic n={h.kind === 'nota' ? 'lock' : 'reply'} />
                          {h.kind === 'nota' ? 'Nota de trabajo interna' : h.userId === i.createdBy ? 'Respuesta del solicitante' : 'Respuesta al solicitante'}
                        </span>
                        {h.text}
                      </div>
                    ) : (
                      <div className="w">{h.text}</div>
                    )}
                    <div className="m">
                      {fmt(h.at)} · {author(users, h.userId)}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>

        <div className="tx-side-panel">
          <section className="tx-side-card tx-glass">
            <h3 className="tx-h3">Gestión</h3>
            <dl className="inc-facts">
              <dt>
                <label htmlFor="inc-st">Estado</label>
              </dt>
              <dd>
                {canResolve && st === 'abierto' ? (
                  <select
                    id="inc-st"
                    className="tx-input"
                    value={i.status}
                    onChange={(e) => (e.target.value === resolvedState ? setDialog('resolver') : patch({ status: e.target.value }))}
                  >
                    {config.states.map((s) => (
                      <option key={s} value={s}>
                        {s === resolvedState ? `${s} (resolver…)` : s}
                      </option>
                    ))}
                  </select>
                ) : (
                  <>
                    <IncBadge i={i} />
                    {canResolve && st === 'resuelto' && <span className="tx-caption">Reabrilo para cambiar el estado.</span>}
                  </>
                )}
              </dd>
              <dt>
                <label htmlFor="inc-as">Asignado a</label>
              </dt>
              <dd>
                {editable ? (
                  <select id="inc-as" className="tx-input" value={i.assigneeId} onChange={(e) => patch({ assigneeId: Number(e.target.value) })}>
                    <option value={0}>Sin asignar</option>
                    {usersWith(state, 'resolver', i.assigneeId).map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  userName(users, i.assigneeId, 'Nadie todavía')
                )}
              </dd>
              {showProblem && (
                <>
                  <dt>
                    <label htmlFor="inc-pr">Problema</label>
                  </dt>
                  <dd>
                    {p ? (
                      <>
                        <ProblemId id={p.id} go={props.goProblem} />
                        <span className="tx-strong">{p.title}</span>
                        <StatusBadge s={p.status} />
                        {editable && p.status !== 'resuelto' && (
                          <button type="button" className="tx-btn ghost sm" onClick={() => patch({ problemId: 0 })}>
                            Desvincular
                          </button>
                        )}
                      </>
                    ) : editable ? (
                      <select id="inc-pr" className="tx-input" value="" onChange={(e) => patch({ problemId: Number(e.target.value) })}>
                        <option value="">Sin problema: vincular a…</option>
                        {problems
                          .filter((x) => x.status !== 'resuelto')
                          .map((x) => (
                            <option key={x.id} value={x.id}>
                              P-{x.id} {x.title}
                            </option>
                          ))}
                      </select>
                    ) : (
                      <span className="tx-subtle">—</span>
                    )}
                  </dd>
                </>
              )}
            </dl>
          </section>

          {config.modules.sla && (
            <section className="tx-side-card tx-glass">
              <h3 className="tx-h3">SLA</h3>
              <dl className="inc-facts">
                <dt>Primera respuesta</dt>
                <dd>
                  <FirstResponse i={i} />
                </dd>
                <dt>Resolución</dt>
                <dd>
                  <Sla i={i} />
                  {paused && <PauseBadge />}
                </dd>
              </dl>
              {!i.dueAt && <span className="tx-caption">Se registró sin el módulo de SLA: no tiene vencimientos.</span>}
            </section>
          )}

          <section className="tx-side-card tx-glass">
            <h3 className="tx-h3">Registro</h3>
            <dl className="inc-facts">
              <dt>Registrado por</dt>
              <dd>
                {userName(users, i.createdBy, 'Usuario eliminado')} · {fmt(i.createdAt)}
              </dd>
              <dt>Reaperturas</dt>
              <dd>{i.reopenCount ? count(i.reopenCount, 'vez', 'veces') : 'Ninguna'}</dd>
              {i.relatedIncidentId > 0 && (
                <>
                  <dt>Relacionado con</dt>
                  <dd>
                    <IncidentId id={i.relatedIncidentId} go={related} />
                  </dd>
                </>
              )}
            </dl>
          </section>
        </div>
      </div>

      {dialog === 'resolver' && <ResolveDialog i={i} state={state} run={run} error={props.error} onClose={() => setDialog('')} />}
      {dialog === 'reabrir' && <ReopenDialog i={i} state={state} run={run} error={props.error} onClose={() => setDialog('')} />}
    </>
  )
}

// Compositor de la actividad. Quien resuelve responde al solicitante o deja una nota de trabajo interna;
// el solicitante solo responde, en los suyos. En un cerrado no se escribe nada.
function Composer({ i, state, run }: { i: Incident; state: State; run: Run }) {
  const canResolve = can(state, 'resolver')
  const [isPublic, setPublic] = useState(true)
  // Un borrador por modo: cambiar de modo no pierde lo escrito en el otro.
  const [drafts, setDrafts] = useState({ reply: '', note: '' })
  const [invalid, setInvalid] = useState(false)
  const [busy, setBusy] = useState(false)
  const st = stage(i)
  if (st === 'cerrado') return null
  if (!canResolve && !(can(state, 'crear') && i.createdBy === state.me)) return null
  const note = canResolve && !isPublic
  const label = !canResolve ? 'Responder' : note ? 'Nota de trabajo interna' : 'Respuesta al solicitante'
  const mode = note ? 'note' : 'reply'

  return (
    <form
      className={`inc-composer ${note ? 'is-note' : ''}`}
      noValidate
      aria-label={label}
      onSubmit={async (e) => {
        e.preventDefault()
        const form = e.currentTarget
        const text = drafts[mode]
        if (!text.trim()) {
          setInvalid(true)
          ;(form.elements.namedItem('text') as HTMLElement).focus()
          return
        }
        setInvalid(false)
        setBusy(true)
        const ok = await run(api.comment(i.id, text, !note))
        setBusy(false)
        // Solo se vacía el borrador del modo que se envió.
        if (ok) setDrafts((d) => ({ ...d, [mode]: '' }))
      }}
    >
      {canResolve && (
        <div className="tx-seg" role="group" aria-label="Tipo de mensaje">
          <button
            type="button"
            aria-pressed={isPublic}
            onClick={() => {
              setPublic(true)
              setInvalid(false)
            }}
          >
            <Ic n="reply" />
            Responder al solicitante
          </button>
          <button
            type="button"
            aria-pressed={!isPublic}
            onClick={() => {
              setPublic(false)
              setInvalid(false)
            }}
          >
            <Ic n="lock" />
            Nota de trabajo interna
          </button>
        </div>
      )}
      <div className="tx-field">
        <label className="tx-label" htmlFor="inc-msg">
          {label}
        </label>
        <textarea
          id="inc-msg"
          name="text"
          value={drafts[mode]}
          onChange={(e) => setDrafts({ ...drafts, [mode]: e.target.value })}
          className="tx-textarea"
          style={{ minHeight: 76 }}
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? 'inc-msg-e' : 'inc-msg-h'}
          placeholder={note ? 'Lo que encontraste, lo que probaste, lo que falta.' : 'Escribí tu mensaje.'}
        />
        {invalid ? (
          <FieldError id="inc-msg-e">Escribí el mensaje antes de enviarlo.</FieldError>
        ) : (
          <span className="tx-help" id="inc-msg-h">
            {note ? 'Solo la ve el equipo que atiende el incidente: el solicitante nunca la ve.' : canResolve ? 'La ve el solicitante.' : 'La ve el equipo que atiende tu incidente.'}
          </span>
        )}
      </div>
      {!canResolve && st === 'resuelto' && (
        <div className="tx-callout wa" role="note">
          <div className="tx-row" style={{ gap: 10, flexWrap: 'nowrap' }}>
            <Ic n="warn" />
            <span style={{ fontSize: 13 }}>
              Este incidente ya está resuelto. Si respondés, ya no se va a cerrar solo: quien lo gestiona lee tu respuesta y decide si lo reabre.
            </span>
          </div>
        </div>
      )}
      <div className="tx-actions" style={{ paddingTop: 0 }}>
        <button className="tx-btn secondary" disabled={busy}>
          <Ic n={note ? 'lock' : 'reply'} />
          {note ? 'Guardar nota' : 'Enviar respuesta'}
        </button>
      </div>
    </form>
  )
}

// El error de la API queda tapado por el modal: se muestra adentro, solo si falló el envío de este diálogo.
const DialogError = ({ show, error }: { show: boolean; error?: string }) =>
  show && error ? (
    <div className="tx-banner" role="alert">
      <Ic n="warn" />
      <span className="grow">{error}</span>
    </div>
  ) : null

// Resolver: pasar al último estado del flujo con código y nota de resolución.
function ResolveDialog({ i, state, run, error, onClose }: { i: Incident; state: State; run: Run; error?: string; onClose: () => void }) {
  const resolvedState = state.config.states[state.config.states.length - 1]
  // Si el problema vinculado tiene workaround, se propone resolver con él.
  const wa = state.problems.find((x) => x.id === i.problemId)?.workaround ?? ''
  const [code, setCode] = useState<ResolutionCode | ''>(wa ? 'workaround' : '')
  const [errs, setErrs] = useState({ code: false, note: false })
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const closes = code !== '' && CLOSING_CODES.includes(code)

  return (
    <Dialog
      title={`Resolver #${i.id}`}
      sub={`Pasa de «${i.status}» a «${resolvedState}». Contá cómo terminó: el solicitante lo ve en la actividad.`}
      onClose={onClose}
      onSubmit={async (form) => {
        const note = fields(form).note
        const bad = { code: !code, note: !note.trim() }
        setErrs(bad)
        if (bad.code || bad.note || !code) return
        setBusy(true)
        const s = await run(api.updateIncident(i.id, { status: resolvedState, resolutionCode: code, resolutionNote: note }))
        setBusy(false)
        if (s) onClose()
        else setFailed(true)
      }}
      footer={
        <>
          <button type="button" className="tx-btn ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="tx-btn primary" disabled={busy}>
            <Ic n="check" />
            {closes ? 'Resolver y cerrar' : 'Resolver'}
          </button>
        </>
      }
    >
      <div className="tx-field">
        <label className="tx-label" htmlFor="rs-c">
          Código de resolución <span className="req">*</span>
        </label>
        <select
          id="rs-c"
          className="tx-input"
          value={code}
          onChange={(e) => setCode(e.target.value as ResolutionCode | '')}
          aria-invalid={errs.code || undefined}
          aria-describedby={errs.code ? 'rs-c-e' : undefined}
        >
          <option value="">Elegí cómo terminó</option>
          {(Object.keys(RESOLUTION) as ResolutionCode[]).map((c) => (
            <option key={c} value={c}>
              {RESOLUTION[c]}
            </option>
          ))}
        </select>
        {errs.code && <FieldError id="rs-c-e">Elegí un código de resolución.</FieldError>}
      </div>
      {closes && (
        <div className="tx-callout wa" role="status">
          <div className="tx-row" style={{ gap: 10, flexWrap: 'nowrap' }}>
            <Ic n="warn" />
            <span style={{ fontSize: 13 }}>
              Con «{RESOLUTION[code as ResolutionCode]}» el incidente se resuelve y se cierra en el mismo momento: queda de solo lectura y ya no se puede reabrir.
            </span>
          </div>
        </div>
      )}
      <div className="tx-field">
        <label className="tx-label" htmlFor="rs-n">
          Nota de resolución <span className="req">*</span>
        </label>
        <textarea
          id="rs-n"
          name="note"
          className="tx-textarea"
          defaultValue={wa}
          aria-invalid={errs.note || undefined}
          aria-describedby={errs.note ? 'rs-n-e' : 'rs-n-h'}
          placeholder="Qué se hizo para restablecer el servicio."
        />
        {errs.note ? (
          <FieldError id="rs-n-e">Contá cómo se resolvió el incidente.</FieldError>
        ) : (
          <span className="tx-help" id="rs-n-h">
            {wa ? 'Precargamos el workaround del problema vinculado: ajustalo si hiciste algo distinto.' : 'Describí la resolución, no el síntoma.'}
          </span>
        )}
      </div>
      <DialogError show={failed} error={error} />
    </Dialog>
  )
}

// Reabrir: el servicio no quedó restablecido. Vuelve al estado inicial y el vencimiento del SLA no cambia.
function ReopenDialog({ i, state, run, error, onClose }: { i: Incident; state: State; run: Run; error?: string; onClose: () => void }) {
  const [invalid, setInvalid] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  return (
    <Dialog
      title={`Reabrir #${i.id}`}
      sub={`Vuelve a «${state.config.states[0]}» y se borra la resolución. El vencimiento del SLA no cambia: la reapertura cuenta contra el SLA.`}
      onClose={onClose}
      onSubmit={async (form) => {
        const reason = fields(form).reason
        if (!reason.trim()) return setInvalid(true)
        setInvalid(false)
        setBusy(true)
        const s = await run(api.reopen(i.id, reason))
        setBusy(false)
        if (s) onClose()
        else setFailed(true)
      }}
      footer={
        <>
          <button type="button" className="tx-btn ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="tx-btn primary" disabled={busy}>
            <Ic n="retry" />
            Reabrir
          </button>
        </>
      }
    >
      <div className="tx-field">
        <label className="tx-label" htmlFor="ro-r">
          Motivo de la reapertura <span className="req">*</span>
        </label>
        <textarea
          id="ro-r"
          name="reason"
          className="tx-textarea"
          autoFocus
          aria-invalid={invalid || undefined}
          aria-describedby={invalid ? 'ro-r-e' : undefined}
          placeholder="Por qué el servicio no quedó restablecido. Ej.: el solicitante avisó que vuelve a pasar."
        />
        {invalid && <FieldError id="ro-r-e">Contá por qué se reabre el incidente.</FieldError>}
      </div>
      <DialogError show={failed} error={error} />
    </Dialog>
  )
}
