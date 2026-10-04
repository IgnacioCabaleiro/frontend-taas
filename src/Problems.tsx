import { useEffect, useState, type FormEvent } from 'react'
import { api, type Problem, type State } from './api'
import { A, Dialog, FieldError, Filters, Ic, IncBadge, Prio, RootCause, STATUS, STEPS, Solution, StatusBadge, Workaround, ago, count, fields, fmt, userName, type Run } from './ui'

export function Board({ state, run, open }: { state: State; run: Run; open: (id: number) => void }) {
  const { incidents, problems, suggestions } = state
  const [filter, setFilter] = useState<'todos' | 'activos' | 'resueltos'>('todos')

  const active = problems.filter((p) => p.status !== 'resuelto')
  const solved = problems.filter((p) => p.status === 'resuelto')
  const known = problems.filter((p) => p.status === 'error_conocido')
  const openInc = incidents.filter((i) => !i.resolvedAt)
  const linked = (p: Problem) => incidents.filter((i) => i.problemId === p.id)
  const shown = { todos: problems, activos: active, resueltos: solved }[filter]

  const metrics = [
    { label: 'Problemas activos', dot: 'var(--status-analisis-dot)', val: active.length, foot: active.length ? `${active.map((p) => `P-${p.id}`).join(', ')} en curso` : 'Ninguno en curso' },
    { label: 'Errores conocidos', dot: 'var(--status-conocido-dot)', val: known.length, foot: `${known.filter((p) => p.workaround).length} con workaround publicado` },
    { label: 'Incidentes sin causa investigada', dot: 'var(--prio-alta-dot)', val: incidents.filter((i) => !i.problemId).length, foot: suggestions[0] ? `${suggestions[0].incidentIds.length} son de ${suggestions[0].service}` : 'Sin recurrencias detectadas' },
    { label: 'Incidentes abiertos', dot: 'var(--ink-subtle)', val: openInc.length, foot: `${openInc.filter((i) => i.priority === 'alta').length} de prioridad alta` },
  ]

  return (
    <>
      <section className="tx-metrics" aria-label="Métricas">
        {metrics.map((m) => (
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

      {suggestions.length > 0 && (
        <section className="tx-reco tx-glass" aria-labelledby="reco">
          <div className="tx-reco-head">
            <div className="tx-reco-ic">
              <Ic n="recur" size="lg" />
            </div>
            <div style={{ flex: 1 }}>
              <h2 className="tx-h3" id="reco">
                Incidentes recurrentes detectados
              </h2>
              <p className="tx-muted" style={{ fontSize: 13 }}>
                Servicios con {state.config.recurrenceMin} o más incidentes sin un problema asociado en los últimos {state.config.recurrenceDays} días. Abrí un problema para investigar la causa una sola vez.
              </p>
            </div>
          </div>
          <div className="tx-reco-list">
            {suggestions.map((sg) => (
              <div key={sg.service} className="tx-reco-row">
                <div>
                  <div className="svc">{sg.service}</div>
                  <div className="tx-caption">Último {ago(incidents[Math.max(...sg.incidentIds) - 1].createdAt)}</div>
                </div>
                <div className="n">{count(sg.incidentIds.length, 'incidente')}</div>
                <div className="ids">
                  {sg.incidentIds.map((id) => (
                    <span key={id} className="tx-chip">
                      #{id}
                    </span>
                  ))}
                </div>
                <button
                  className="tx-btn primary"
                  onClick={async () => {
                    const s = await run(
                      api.createProblem({ title: `Incidentes recurrentes en ${sg.service}`, service: sg.service, incidentIds: sg.incidentIds }),
                    )
                    if (s) open(s.problems[s.problems.length - 1].id)
                  }}
                >
                  <Ic n="plus" />
                  Abrir problema
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="tx-section-head">
          <h2 className="tx-h3">Problemas</h2>
          <Filters
            value={filter}
            onChange={setFilter}
            options={[
              ['todos', 'Todos', problems.length],
              ['activos', 'Activos', active.length],
              ['resueltos', 'Resueltos', solved.length],
            ]}
          />
        </div>
        {shown.length === 0 ? (
          <div className="tx-inline-empty">No hay problemas en este filtro.</div>
        ) : (
          <div className="tx-table-wrap tx-solid">
            <table className="tx-table">
              <thead>
                <tr>
                  <th className="w-id">ID</th>
                  <th>Título</th>
                  <th>Servicio</th>
                  <th>Estado</th>
                  <th>Responsable</th>
                  <th className="num">Incidentes vinculados</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((p) => {
                  const inc = linked(p)
                  const abiertos = inc.filter((i) => !i.resolvedAt).length
                  return (
                    <tr key={p.id}>
                      <td className="w-id" data-label="ID">
                        <A className="tx-id" onClick={() => open(p.id)}>
                          P-{p.id}
                        </A>
                      </td>
                      <td className="t-title">
                        <A style={{ color: 'inherit' }} onClick={() => open(p.id)}>
                          {p.title}
                        </A>
                      </td>
                      <td className="tx-muted" data-label="Servicio">
                        {p.service}
                      </td>
                      <td data-label="Estado">
                        <StatusBadge s={p.status} />
                      </td>
                      <td className="tx-muted" data-label="Responsable">
                        {userName(state.users, p.ownerId, '—')}
                      </td>
                      <td className="num" data-label="Incidentes">
                        <span className="tx-linked">
                          <b>{inc.length}</b>
                          <span>{!inc.length ? 'sin incidentes' : abiertos ? count(abiertos, 'abierto') : 'todos resueltos'}</span>
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}

const PANEL_TITLE = ['Problema identificado', 'Análisis de causa raíz', 'Error conocido', 'Problema resuelto']

export function ProblemDetail({ p, state, run, back }: { p: Problem; state: State; run: Run; back: () => void }) {
  const { users, config } = state
  const incidents = state.incidents.filter((i) => i.problemId === p.id)
  const closed = config.states[config.states.length - 1]
  const step = STEPS.indexOf(p.status)
  const abiertos = incidents.filter((i) => !i.resolvedAt).length
  const [invalid, setInvalid] = useState(false)
  useEffect(() => setInvalid(false), [p.id, p.status])

  // Se valida al enviar: `required` es el campo que la etapa exige.
  const advance = (required?: 'rootCause' | 'solution') => (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const f = fields(e.currentTarget)
    if (required && !f[required].trim()) {
      setInvalid(true)
      ;(e.currentTarget.elements.namedItem(required) as HTMLElement).focus()
      return
    }
    run(api.advance(p.id, f))
  }
  // Fecha en que el problema llegó a cada etapa.
  const when = (i: number) => {
    const at = i === 0 ? p.createdAt : p.history.find((h) => h.kind === STATUS[STEPS[i]].cls)?.at
    return !at ? 'Pendiente' : i === step && i < 3 ? `Desde ${fmt(at)}` : fmt(at)
  }
  const head = (
    <div className="tx-panel-head">
      <div>
        <span className="tx-overline">
          Etapa {step + 1} de 4{step === 3 && ' · Solo lectura'}
        </span>
        <h2 className="tx-h3">{PANEL_TITLE[step]}</h2>
      </div>
      <StatusBadge s={p.status} />
    </div>
  )

  return (
    <>
      <A className="tx-back" style={{ alignSelf: 'flex-start' }} onClick={back}>
        <Ic n="back" />
        Volver a problemas
      </A>
      <header className="tx-detail-head tx-glass" style={{ marginTop: -12 }}>
        <div className="meta">
          <span className="tx-id" style={{ fontSize: 14 }}>
            P-{p.id}
          </span>
          <span className="tx-subtle">·</span>
          <span className="tx-muted" style={{ fontSize: 13, fontWeight: 550 }}>
            {p.service}
          </span>
          <StatusBadge s={p.status} />
          <select
            className="tx-select-inline"
            style={{ marginLeft: 'auto' }}
            aria-label="Responsable del problema"
            value={p.ownerId}
            onChange={(e) => run(api.setOwner(p.id, Number(e.target.value)))}
          >
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                Responsable: {u.name}
              </option>
            ))}
          </select>
        </div>
        <h1 className="tx-h1">{p.title}</h1>
        {p.description && <p className="desc">{p.description}</p>}
      </header>

      <ol className="tx-stepper tx-glass" aria-label="Etapas del problema">
        {STEPS.map((s, i) => {
          const done = i < step || step === 3
          return (
            <li
              key={s}
              className={`tx-step ${i === step ? 'current' : done ? 'done' : 'pending'} s-${STATUS[s].cls}`}
              aria-current={i === step ? 'step' : undefined}
            >
              <span className="tx-step-dot">{done ? <Ic n="check" /> : i + 1}</span>
              <span className="nm">{STATUS[s].label}</span>
              <span className="when">{when(i)}</span>
            </li>
          )
        })}
      </ol>

      <div className="tx-detail-grid">
        {p.status === 'identificado' && (
          <form className="tx-panel tx-solid" onSubmit={advance()}>
            {head}
            <p className="tx-muted">
              {incidents.length > 0
                ? `Este problema agrupa ${count(incidents.length, 'incidente')} del mismo servicio. `
                : 'Este problema todavía no tiene incidentes vinculados. '}
              El próximo paso es investigar la causa raíz: qué está provocando los incidentes, no cómo se manifiestan. Mientras dure el
              análisis, los incidentes nuevos de {p.service} se te van a sugerir para vincular.
            </p>
            <div className="tx-callout">
              <div className="tx-row" style={{ gap: 10 }}>
                <Ic n="clock" />
                <span style={{ fontSize: 13 }}>Abierto {ago(p.createdAt)}</span>
              </div>
            </div>
            <div className="tx-actions">
              <button className="tx-btn primary lg">
                <Ic n="play" />
                Iniciar análisis de causa raíz
              </button>
            </div>
          </form>
        )}

        {p.status === 'en_analisis' && (
          <form className="tx-panel tx-solid" noValidate onSubmit={advance('rootCause')}>
            {head}
            <div className="tx-field">
              <label className="tx-label" htmlFor="rc">
                Causa raíz <span className="req">*</span>
              </label>
              <textarea
                id="rc"
                name="rootCause"
                className="tx-textarea"
                aria-invalid={invalid || undefined}
                aria-describedby={invalid ? 'rc-e' : 'rc-h'}
                placeholder="¿Qué provoca los incidentes? Ej.: el servidor de base de datos se queda sin memoria al cierre de mes."
              />
              {invalid ? (
                <FieldError id="rc-e">Contá la causa raíz para registrar el error conocido.</FieldError>
              ) : (
                <span className="tx-help" id="rc-h">
                  Describí la causa, no el síntoma. Esto se publica en Errores conocidos.
                </span>
              )}
            </div>
            <div className="tx-field">
              <label className="tx-label" htmlFor="wa">
                Workaround <span className="opt">Opcional</span>
              </label>
              <textarea
                id="wa"
                name="workaround"
                className="tx-textarea"
                style={{ minHeight: 76 }}
                placeholder="Una solución temporal que los agentes puedan aplicar ya. Ej.: facturar en lotes fuera del horario pico."
              />
            </div>
            <div className="tx-actions">
              <button className="tx-btn primary lg">
                <Ic n="flag" />
                Registrar como error conocido
              </button>
            </div>
          </form>
        )}

        {p.status === 'error_conocido' && (
          <form className="tx-panel tx-solid" noValidate onSubmit={advance('solution')}>
            {head}
            <RootCause text={p.rootCause} />
            {p.workaround && <Workaround text={p.workaround} />}
            <div className="tx-field">
              <label className="tx-label" htmlFor="sol">
                Solución definitiva <span className="req">*</span>
              </label>
              <textarea
                id="sol"
                name="solution"
                className="tx-textarea"
                aria-invalid={invalid || undefined}
                aria-describedby={invalid ? 'sol-e' : 'sol-h'}
                placeholder="Qué se cambió para que no vuelva a pasar."
              />
              {invalid ? (
                <FieldError id="sol-e">Contá qué se cambió para resolver el problema.</FieldError>
              ) : (
                <span className="tx-help" id="sol-h">
                  {abiertos > 0
                    ? `Al resolver, ${abiertos === 1 ? 'se cierra el incidente abierto vinculado' : `se cierran los ${abiertos} incidentes abiertos vinculados`}.`
                    : 'No quedan incidentes abiertos vinculados.'}
                </span>
              )}
            </div>
            <div className="tx-actions">
              <button className="tx-btn primary lg">
                <Ic n="check" />
                Resolver problema{abiertos > 0 && ` y cerrar ${count(abiertos, 'incidente')}`}
              </button>
            </div>
          </form>
        )}

        {p.status === 'resuelto' && (
          <section className="tx-panel tx-solid">
            {head}
            <RootCause text={p.rootCause} />
            {p.workaround && <Workaround text={p.workaround} />}
            <Solution text={p.solution} />
            <div className="tx-caption">
              Resuelto el {when(3)} · {count(incidents.length, 'incidente')} {incidents.length === 1 ? 'cerrado' : 'cerrados'}
            </div>
          </section>
        )}

        <div className="tx-side-panel">
          <section className="tx-side-card tx-glass">
            <div className="tx-section-head" style={{ margin: 0 }}>
              <h3 className="tx-h3">Incidentes vinculados</h3>
              <span className="tx-count">{incidents.length}</span>
            </div>
            {incidents.length === 0 ? (
              <div className="tx-inline-empty">Ninguno todavía: es un problema registrado de forma proactiva.</div>
            ) : (
              <div className="tx-inc-list">
                {incidents.map((i) => (
                  <div key={i.id} className="tx-inc">
                    <div className="top">
                      <span className="tx-id">#{i.id}</span>
                      <span className="t">{i.title}</span>
                    </div>
                    <div className="bot">
                      <Prio p={i.priority} />
                      {i.resolvedAt ? (
                        <IncBadge i={i} />
                      ) : p.workaround ? (
                        <button className="tx-btn secondary sm" onClick={() => run(api.updateIncident(i.id, { status: closed }))}>
                          <Ic n="bulb" />
                          Resolver con workaround
                        </button>
                      ) : (
                        <IncBadge i={i} />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="tx-side-card tx-glass">
            <h3 className="tx-h3">Historial</h3>
            <form
              className="cfg-line"
              onSubmit={async (e) => {
                e.preventDefault()
                const form = e.currentTarget
                if (await run(api.comment(p.id, fields(form).text))) form.reset()
              }}
            >
              <input name="text" className="tx-input" placeholder="Sumá un comentario o un hallazgo" aria-label="Comentario" required />
              <button className="tx-btn secondary">Comentar</button>
            </form>
            <ol className="tx-timeline">
              {[...p.history].reverse().map((h, i) => (
                <li key={i} className={`tx-tl ${h.kind && h.kind !== 'comentario' ? `c-${h.kind}` : ''}`}>
                  <div className="w" style={h.kind === 'comentario' ? { fontWeight: 400 } : undefined}>
                    {h.text}
                  </div>
                  <div className="m">
                    {fmt(h.at)} · {userName(users, h.userId, 'Sistema')}
                    {h.kind === 'comentario' && ' comentó'}
                  </div>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </>
  )
}

export function NewProblemModal(props: { services: string[]; run: Run; onClose: () => void; onCreated: (id: number) => void }) {
  const [errs, setErrs] = useState({ title: false, service: false })
  return (
    <Dialog
      title="Registrar un problema"
      sub="Usalo cuando conocés la causa sospechada antes de que se repitan incidentes."
      onClose={props.onClose}
      onSubmit={async (form) => {
        const f = fields(form)
        const bad = { title: !f.title.trim(), service: !f.service }
        setErrs(bad)
        if (bad.title || bad.service) return
        const s = await props.run(api.createProblem(f))
        props.onClose()
        if (s) props.onCreated(s.problems[s.problems.length - 1].id)
      }}
      footer={
        <>
          <button type="button" className="tx-btn ghost" onClick={props.onClose}>
            Cancelar
          </button>
          <button className="tx-btn primary">Registrar problema</button>
        </>
      }
    >
      <div className="tx-field">
        <label className="tx-label" htmlFor="np-t">
          Título <span className="req">*</span>
        </label>
        <input id="np-t" name="title" className="tx-input" aria-invalid={errs.title || undefined} aria-describedby={errs.title ? 'np-t-e' : undefined} autoFocus />
        {errs.title && <FieldError id="np-t-e">Ponele un título al problema.</FieldError>}
      </div>
      <div className="tx-field">
        <label className="tx-label" htmlFor="np-s">
          Servicio <span className="req">*</span>
        </label>
        <select id="np-s" name="service" className="tx-input" defaultValue="" aria-invalid={errs.service || undefined} aria-describedby={errs.service ? 'np-s-e' : undefined}>
          <option value="">Elegí un servicio</option>
          {props.services.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        {errs.service && <FieldError id="np-s-e">Indicá el servicio afectado.</FieldError>}
      </div>
      <div className="tx-field">
        <label className="tx-label" htmlFor="np-d">
          Descripción
        </label>
        <textarea id="np-d" name="description" className="tx-textarea" style={{ minHeight: 72 }} />
      </div>
    </Dialog>
  )
}
