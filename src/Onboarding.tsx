// Onboarding del titular: de "recién contraté" a "ya cargué mi primer ticket".
// No le pedimos que elija módulos: le preguntamos cómo trabaja y armamos la ticketera con eso,
// mostrándole a la derecha cómo va quedando.
import { useEffect, useState, type ReactNode } from 'react'
import { api, type Priority, type Setup, type State, type Template } from './api'
import { FieldError, Ic, Prio, fields, initials, type Run } from './ui'
import { ListEditor } from './Settings'

const PRIOS: Priority[] = ['alta', 'media', 'baja']

type Answers = Record<'team' | 'sla' | 'problems' | 'fields', boolean | null>
type StepKey = 'rubro' | 'servicios' | 'trabajo' | 'equipo' | 'ticket'
const STEP_NAME: Record<StepKey, string> = { rubro: 'Tu empresa', servicios: 'Qué atendés', trabajo: 'Cómo trabajan', equipo: 'Tu equipo', ticket: 'Primer ticket' }

// Cada pregunta enciende o apaga una parte de la ticketera. `then` le cuenta al cliente qué significa su respuesta.
const QUESTIONS: { key: keyof Answers; q: string; no: string; yes: string; then: [string, string] }[] = [
  {
    key: 'team',
    q: '¿Quién atiende los pedidos?',
    no: 'Yo solo',
    yes: 'Somos un equipo',
    then: ['Tickets simples: se abren y se cierran.', 'Cada ticket pasa por etapas y se le asigna a una persona.'],
  },
  {
    key: 'sla',
    q: '¿Tenés plazos que cumplir para resolver?',
    no: 'No, vamos resolviendo',
    yes: 'Sí, según la urgencia',
    then: ['Sin vencimientos: los tickets se ordenan por prioridad.', 'Cada ticket va a tener un vencimiento y te avisamos cuáles están por pasarse.'],
  },
  {
    key: 'problems',
    q: '¿Los mismos inconvenientes vuelven a aparecer?',
    no: 'Casi nunca',
    yes: 'Sí, bastante seguido',
    then: ['Cada ticket se trata por separado.', 'Vamos a detectar los que se repiten para que investigues la causa una sola vez.'],
  },
  {
    key: 'fields',
    q: '¿Necesitás pedir algún dato puntual en cada ticket?',
    no: 'Con una descripción alcanza',
    yes: 'Sí, hay datos que siempre pregunto',
    then: ['El ticket pide solo título, servicio y prioridad.', 'Sumamos campos propios de tu rubro. Después podés cambiarlos.'],
  },
]

export function Onboarding({ state, run, onDone }: { state: State; run: Run; onDone: (createdTicket: boolean) => void }) {
  const [templates, setTemplates] = useState<Template[]>([])
  const [step, setStep] = useState<StepKey>('rubro')
  const [key, setKey] = useState('')
  const [industry, setIndustry] = useState('')
  const [services, setServices] = useState<string[]>([])
  const [ans, setAns] = useState<Answers>({ team: null, sla: null, problems: null, fields: null })
  const [prio, setPrio] = useState<Priority>('media')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    api.templates().then(setTemplates, (e: Error) => setError(e.message))
  }, [])

  const tpl = templates.find((t) => t.key === key)
  const steps: StepKey[] = ans.team === false ? ['rubro', 'servicios', 'trabajo', 'ticket'] : ['rubro', 'servicios', 'trabajo', 'equipo', 'ticket']
  const at = steps.indexOf(step)
  const answered = Object.values(ans).every((v) => v !== null)
  const cleanServices = services.map((s) => s.trim()).filter(Boolean)
  const firstName = state.users[0].name.split(' ')[0]
  const team = state.users.filter((u) => u.id !== state.ownerId)

  const go = (to: StepKey) => {
    setError('')
    setStep(to)
  }
  // Toda llamada del asistente pasa por acá: muestra el error en el paso, no en un banner perdido.
  const call = async (p: Promise<State>) => {
    setBusy(true)
    setError('')
    try {
      const s = await p
      await run(Promise.resolve(s))
      return s
    } catch (e) {
      setError((e as Error).message)
      return null
    } finally {
      setBusy(false)
    }
  }
  const saveSetup = async () => {
    const setup: Setup = { template: key, industry, services: cleanServices, team: !!ans.team, sla: !!ans.sla, problems: !!ans.problems, fields: !!ans.fields }
    if (await call(api.onboard(setup))) go(steps[at + 1])
  }
  const finish = async (createdTicket: boolean) => {
    if (await call(api.finishOnboarding())) onDone(createdTicket)
  }

  const nav = (next: ReactNode) => (
    <div className="onb-nav">
      {at > 0 && (
        <button type="button" className="tx-btn ghost" onClick={() => go(steps[at - 1])}>
          <Ic n="back" />
          Atrás
        </button>
      )}
      <span style={{ flex: 1 }} />
      {next}
    </div>
  )

  return (
    <div className="tx-canvas">
      <main className="onb">
        <header className="onb-head">
          <div className="tx-brand" style={{ padding: 0 }}>
            <b>TaaS</b>
            <span>· {state.name}</span>
          </div>
          <ol className="onb-steps" aria-label="Pasos del alta">
            {steps.map((s, i) => (
              <li key={s} className={i < at ? 'done' : i === at ? 'current' : ''} aria-current={i === at ? 'step' : undefined}>
                <span>{i < at ? <Ic n="check" /> : i + 1}</span>
                {STEP_NAME[s]}
              </li>
            ))}
          </ol>
        </header>

        <div className="onb-layout">
          <section className="tx-panel tx-solid onb-step" aria-live="polite">
            {step === 'rubro' && (
              <>
                <div>
                  <h1 className="tx-h1">Hola, {firstName}. ¿A qué se dedica {state.name}?</h1>
                  <p className="tx-muted">Con esto te proponemos un punto de partida. Todo lo que elijas acá lo podés cambiar después.</p>
                </div>
                <div className="onb-picks two">
                  {templates.map((t) => (
                    <button
                      key={t.key}
                      type="button"
                      className="onb-pick tx-solid"
                      aria-pressed={t.key === key}
                      onClick={() => {
                        setKey(t.key)
                        setServices(t.config.services)
                      }}
                    >
                      <span className="tx-h3">{t.industry}</span>
                      <span className="tx-caption">{t.key === 'otro' ? 'Armamos la ticketera con vos desde cero' : `${t.config.services.slice(0, 3).join(' · ')}…`}</span>
                    </button>
                  ))}
                </div>
                {key === 'otro' && (
                  <div className="tx-field">
                    <label className="tx-label" htmlFor="ob-ind">
                      Contanos tu rubro
                    </label>
                    <input id="ob-ind" className="tx-input" placeholder="Ej.: estudio contable, colegio, inmobiliaria" value={industry} onChange={(e) => setIndustry(e.target.value)} autoFocus />
                  </div>
                )}
                {nav(
                  <button type="button" className="tx-btn primary lg" disabled={!tpl || (key === 'otro' && !industry.trim())} onClick={() => go('servicios')}>
                    Continuar
                  </button>,
                )}
              </>
            )}

            {step === 'servicios' && (
              <>
                <div>
                  <h1 className="tx-h1">¿Sobre qué te van a pedir ayuda?</h1>
                  <p className="tx-muted">
                    Son los servicios que atendés: sistemas, equipos, áreas. Cada ticket se carga sobre uno, y así después vas a ver dónde se concentran los
                    inconvenientes. Te sugerimos estos; cambiá los nombres, sacá o agregá.
                  </p>
                </div>
                <ListEditor items={services} onChange={setServices} label="Servicio" add="Agregar servicio" min={1} />
                {nav(
                  <button type="button" className="tx-btn primary lg" disabled={cleanServices.length === 0} onClick={() => go('trabajo')}>
                    Continuar
                  </button>,
                )}
              </>
            )}

            {step === 'trabajo' && (
              <>
                <div>
                  <h1 className="tx-h1">Contanos cómo trabajan hoy</h1>
                  <p className="tx-muted">Cuatro preguntas. Con tus respuestas activamos solo lo que vas a usar, para que la ticketera no te quede grande ni chica.</p>
                </div>
                {QUESTIONS.map(({ key: k, q, no, yes, then }) => (
                  <fieldset key={k} className="onb-q">
                    <legend className="tx-h3">{q}</legend>
                    <div className="onb-picks two">
                      {[false, true].map((v) => (
                        <button key={String(v)} type="button" className="onb-pick tx-solid" aria-pressed={ans[k] === v} onClick={() => setAns((a) => ({ ...a, [k]: v }))}>
                          <span className="tx-strong">{v ? yes : no}</span>
                        </button>
                      ))}
                    </div>
                    {ans[k] !== null && (
                      <p className="tx-caption onb-then">
                        <Ic n="check" />
                        {then[ans[k] ? 1 : 0]}
                      </p>
                    )}
                  </fieldset>
                ))}
                {error && <FieldError id="ob-e">{error}</FieldError>}
                {nav(
                  <button type="button" className="tx-btn primary lg" disabled={!answered || busy} onClick={saveSetup}>
                    Armar mi ticketera
                  </button>,
                )}
              </>
            )}

            {step === 'equipo' && (
              <>
                <div>
                  <h1 className="tx-h1">Sumá a tu equipo</h1>
                  <p className="tx-muted">
                    Tu plan incluye hasta {state.maxUsers} usuarios además del tuyo. Cada uno entra con su email y la contraseña que le definas acá. Si preferís,
                    hacelo después desde Configuración.
                  </p>
                </div>
                {team.length > 0 && (
                  <div>
                    {team.map((u) => (
                      <div key={u.id} className="cfg-line cfg-user">
                        <span className="tx-avatar">{initials(u.name)}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="tx-strong">{u.name}</div>
                          <div className="tx-caption">
                            {u.email} · {state.roles.find((r) => r.id === u.roleId)?.name}
                          </div>
                        </div>
                        <button type="button" className="tx-btn ghost icon sm" aria-label={`Quitar a ${u.name}`} onClick={() => call(api.deleteUser(u.id))}>
                          <Ic n="trash" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {team.length < state.maxUsers ? (
                  <form
                    className="tx-stack"
                    style={{ gap: 12 }}
                    aria-label="Sumar una persona"
                    onSubmit={async (e) => {
                      e.preventDefault()
                      const form = e.currentTarget
                      const f = fields(form)
                      if (await call(api.addUser({ name: f.name, email: f.email, password: f.password, roleId: Number(f.roleId) }))) form.reset()
                    }}
                  >
                    <div className="tx-cols">
                      <div className="tx-field">
                        <label className="tx-label" htmlFor="ob-un">
                          Nombre y apellido
                        </label>
                        <input id="ob-un" name="name" className="tx-input" autoComplete="off" required />
                      </div>
                      <div className="tx-field">
                        <label className="tx-label" htmlFor="ob-ue">
                          Email
                        </label>
                        <input id="ob-ue" name="email" type="email" className="tx-input" autoComplete="off" required />
                      </div>
                      <div className="tx-field">
                        <label className="tx-label" htmlFor="ob-up">
                          Contraseña inicial
                        </label>
                        <input id="ob-up" name="password" type="password" className="tx-input" autoComplete="new-password" minLength={8} aria-describedby="ob-up-h" required />
                        <span className="tx-help" id="ob-up-h">
                          Al menos 8 caracteres.
                        </span>
                      </div>
                      <div className="tx-field">
                        <label className="tx-label" htmlFor="ob-ur">
                          ¿Qué va a poder hacer?
                        </label>
                        <select id="ob-ur" name="roleId" className="tx-input" defaultValue={2}>
                          <option value={2}>Agente: atiende y resuelve tickets</option>
                          <option value={3}>Solicitante: solo carga tickets</option>
                          <option value={1}>Administrador: además configura</option>
                        </select>
                      </div>
                    </div>
                    <button className="tx-btn secondary" style={{ alignSelf: 'flex-start' }} disabled={busy}>
                      <Ic n="plus" />
                      Sumar al equipo
                    </button>
                  </form>
                ) : (
                  <div className="tx-inline-empty">Ya sumaste a las {state.maxUsers} personas que incluye tu plan.</div>
                )}
                {error && <FieldError id="ob-e">{error}</FieldError>}
                {nav(
                  <button type="button" className="tx-btn primary lg" onClick={() => go('ticket')}>
                    {team.length ? 'Continuar' : 'Lo hago después'}
                  </button>,
                )}
              </>
            )}

            {step === 'ticket' && (
              <form
                className="tx-stack"
                style={{ gap: 18 }}
                noValidate
                onSubmit={async (e) => {
                  e.preventDefault()
                  const { title, service, ...custom } = fields(e.currentTarget)
                  if (!title.trim()) return setError('Contanos qué está pasando, aunque sea en una línea.')
                  if (await call(api.createIncident({ title, service, priority: prio, fields: custom }))) finish(true)
                }}
              >
                <div>
                  <h1 className="tx-h1">Listo. Cargá tu primer ticket</h1>
                  <p className="tx-muted">Este es el formulario que acabás de armar. Probalo con algo real que tengas pendiente: queda guardado y lo vas a ver apenas entres.</p>
                </div>
                <div className="tx-field">
                  <label className="tx-label" htmlFor="ob-t">
                    Qué está pasando <span className="req">*</span>
                  </label>
                  <input id="ob-t" name="title" className="tx-input" placeholder="Describí el inconveniente en una línea" autoFocus />
                </div>
                <div className="tx-cols">
                  <div className="tx-field">
                    <label className="tx-label" htmlFor="ob-s">
                      Servicio afectado
                    </label>
                    <select id="ob-s" name="service" className="tx-input">
                      {state.config.services.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
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
                    {state.config.modules.sla && <span className="tx-help">Vence en {state.config.slaHours[prio]} h</span>}
                  </div>
                  {state.config.fields.map((f) => (
                    <div key={f.key} className="tx-field">
                      <label className="tx-label" htmlFor={`ob-f-${f.key}`}>
                        {f.label} {f.required ? <span className="req">*</span> : <span className="opt">Opcional</span>}
                      </label>
                      {f.type === 'select' ? (
                        <select id={`ob-f-${f.key}`} name={f.key} className="tx-input" defaultValue="">
                          <option value="">Elegí una opción</option>
                          {f.options.map((o) => (
                            <option key={o}>{o}</option>
                          ))}
                        </select>
                      ) : (
                        <input id={`ob-f-${f.key}`} name={f.key} type={f.type} className="tx-input" />
                      )}
                    </div>
                  ))}
                </div>
                {error && <FieldError id="ob-e">{error}</FieldError>}
                {nav(
                  <>
                    <button type="button" className="tx-btn ghost" disabled={busy} onClick={() => finish(false)}>
                      Entrar sin cargar un ticket
                    </button>
                    <button className="tx-btn primary lg" disabled={busy}>
                      <Ic n="check" />
                      Crear ticket y entrar
                    </button>
                  </>,
                )}
              </form>
            )}
          </section>

          <Preview state={state} tpl={tpl} industry={key === 'otro' ? industry : (tpl?.industry ?? '')} services={cleanServices} ans={ans} team={team.map((u) => u.name)} />
        </div>
      </main>
    </div>
  )
}

const Sk = ({ w, h = 12 }: { w: number | string; h?: number }) => <span className="sk" style={{ width: w, height: h }} />

// Vista previa: la ticketera que se va armando con cada respuesta. Lo que todavía no se decidió se ve como skeleton.
function Preview(props: { state: State; tpl?: Template; industry: string; services: string[]; ans: Answers; team: string[] }) {
  const { tpl, ans, services } = props
  const c = tpl?.config
  // Misma regla que el backend (seed.go, template.build).
  const states = c && ans.team !== null ? (ans.team ? c.states : [c.states[0], c.states[c.states.length - 1]]) : null
  const menu = ['Panel', 'Incidentes', ...(ans.problems ? ['Problemas', 'Errores conocidos'] : []), 'Configuración']

  return (
    <aside className="onb-preview tx-glass" aria-label="Vista previa de tu ticketera">
      <div>
        <span className="tx-overline">Así va quedando</span>
        <div className="tx-h3">{props.state.name}</div>
        <div className="tx-caption">{props.industry.trim() || <Sk w={90} />}</div>
      </div>

      <div className="onb-pv-block">
        <span className="tx-overline">Secciones</span>
        <div className="onb-chips">
          {menu.map((m) => (
            <span key={m} className={`tx-chip ${m === 'Problemas' || m === 'Errores conocidos' ? 'onb-new' : ''}`}>
              {m}
            </span>
          ))}
          {ans.problems === null && <Sk w={70} h={24} />}
        </div>
      </div>

      <div className="onb-pv-block">
        <span className="tx-overline">Formulario de ticket</span>
        <div className="onb-form tx-solid">
          <div>
            <div className="tx-caption">Qué está pasando</div>
            <Sk w="100%" h={26} />
          </div>
          <div>
            <div className="tx-caption">Servicio</div>
            <div className="onb-chips">
              {services.length ? (
                <>
                  {services.slice(0, 4).map((s) => (
                    <span key={s} className="tx-chip">
                      {s}
                    </span>
                  ))}
                  {services.length > 4 && <span className="tx-caption">+{services.length - 4}</span>}
                </>
              ) : (
                <Sk w="70%" h={24} />
              )}
            </div>
          </div>
          <div>
            <div className="tx-caption">Prioridad{ans.sla && c && ' y vencimiento'}</div>
            <div className="onb-chips">
              {PRIOS.map((p) => (
                <span key={p} style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                  <Prio p={p} />
                  {ans.sla && c && <span className="tx-caption">{c.slaHours[p]} h</span>}
                </span>
              ))}
            </div>
          </div>
          {ans.fields === null ? (
            <Sk w="55%" />
          ) : (
            ans.fields &&
            c?.fields.map((f) => (
              <div key={f.label} className="onb-new">
                <div className="tx-caption">{f.label}</div>
                <Sk w="100%" h={26} />
              </div>
            ))
          )}
        </div>
      </div>

      <div className="onb-pv-block">
        <span className="tx-overline">Recorrido de un ticket</span>
        <div className="onb-chips">
          {states ? (
            states.map((s, i) => (
              <span key={s} style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                {i > 0 && <Ic n="chevron" />}
                <span className={`tx-badge ${i === states.length - 1 ? 'resuelto' : 'abierto'}`}>{s}</span>
              </span>
            ))
          ) : (
            <>
              <Sk w={70} h={24} />
              <Sk w={70} h={24} />
            </>
          )}
        </div>
      </div>

      {props.team.length > 0 && (
        <div className="onb-pv-block onb-new">
          <span className="tx-overline">Equipo</span>
          <div className="onb-chips">
            {props.team.map((n) => (
              <span key={n} className="tx-avatar" title={n}>
                {initials(n)}
              </span>
            ))}
          </div>
        </div>
      )}
    </aside>
  )
}
