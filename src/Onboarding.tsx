// Onboarding del titular: de "recién contraté" a "ya cargué mi primer ticket".
// No le pedimos que elija módulos: le preguntamos cómo trabaja y armamos la ticketera con eso,
// mostrándole a la derecha cómo va quedando.
import { useEffect, useState, type ReactNode } from 'react'
import { api, type Priority, type Setup, type State, type Template } from './api'
import { FieldError, Ic, Prio, count, fields, hoursToDraft, hoursToSent, initials, num, type Run } from './ui'
import { ListEditor } from './Settings'

const PRIOS: Priority[] = ['alta', 'media', 'baja']

type Answers = Record<'team' | 'sla' | 'problems' | 'fields', boolean | null>
type StepKey = 'rubro' | 'servicios' | 'trabajo' | 'plazos' | 'equipo' | 'ticket'
const STEP_NAME: Record<StepKey, string> = {
  rubro: 'Tu empresa',
  servicios: 'Qué atendés',
  trabajo: 'Cómo trabajan',
  plazos: 'Plazos',
  equipo: 'Tu equipo',
  ticket: 'Primer ticket',
}
// Las horas y los días guardan el texto del input, como en Configuración: se ve exactamente lo escrito (también vacío).
type Hours = Record<Priority, string>

// El estado que el backend suma al flujo si hay que esperar a quien reportó (WaitingRequester): pausa el SLA de resolución.
const WAITING = 'Esperando al solicitante'

// Cada pregunta enciende o apaga una parte de la ticketera. `then` le cuenta al cliente qué significa su respuesta.
type Question = { q: string; no: string; yes: string; then: [string, string] }
const QUESTIONS: (Question & { key: keyof Answers })[] = [
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
// Del paso "Plazos", solo si tiene plazos que cumplir.
const WAITS_QUESTION: Question = {
  q: '¿A veces tenés que esperar datos o una confirmación de quien reportó?',
  no: 'Casi nunca',
  yes: 'Sí, a veces',
  then: ['Los tickets avanzan sin esperas: el plazo corre siempre.', "Sumamos el estado 'Esperando al solicitante': mientras está ahí, el plazo de resolución se detiene."],
}

function YesNo({ q, no, yes, then, value, onChange }: Question & { value: boolean | null; onChange: (v: boolean) => void }) {
  return (
    <fieldset className="onb-q">
      <legend className="tx-h3">{q}</legend>
      <div className="onb-picks two">
        {[false, true].map((v) => (
          <button key={String(v)} type="button" className="onb-pick tx-solid" aria-pressed={value === v} onClick={() => onChange(v)}>
            <span className="tx-strong">{v ? yes : no}</span>
          </button>
        ))}
      </div>
      {value !== null && (
        <p className="tx-caption onb-then">
          <Ic n="check" />
          {then[value ? 1 : 0]}
        </p>
      )}
    </fieldset>
  )
}

const STEPS_TEAM: StepKey[] = ['rubro', 'servicios', 'trabajo', 'plazos', 'equipo', 'ticket']
// Sin equipo no hay paso "Tu equipo".
const stepsFor = (ans: Answers) => STEPS_TEAM.filter((s) => s !== 'equipo' || ans.team !== false)

// Borrador del onboarding en el navegador, por cuenta: si recarga en el medio, retoma donde estaba. No guarda nada de
// "Tu equipo" (las personas ya quedan en el backend) ni del formulario de "Primer ticket": de esos pasos, solo el paso.
// Sin storage (por ejemplo, en modo privado), el onboarding funciona igual, sin borrador.
type Draft = {
  step: StepKey
  key: string
  industry: string
  services: string[]
  ans: Answers
  waits: boolean | null
  responseHours: Hours
  autoCloseDays: string
}
// Por cuenta y usuario: dos administradores de la misma cuenta en el mismo navegador no comparten borrador.
const draftKey = (accountId: number, userId: number) => `onboarding:${accountId}:${userId}`
function readDraft(accountId: number, userId: number): unknown {
  try {
    return JSON.parse(localStorage.getItem(draftKey(accountId, userId)) ?? 'null')
  } catch {
    return null
  }
}
function writeDraft(accountId: number, userId: number, d: Draft) {
  try {
    localStorage.setItem(draftKey(accountId, userId), JSON.stringify(d))
  } catch {
    // sin storage: no hay borrador
  }
}
// Al terminar el onboarding, al salir y cuando llega el estado de una cuenta ya configurada (por ejemplo, si el
// onboarding se terminó en otro dispositivo o pestaña).
export function clearOnboardingDraft(accountId: number, userId: number) {
  try {
    localStorage.removeItem(draftKey(accountId, userId))
  } catch {
    // sin storage: no hay borrador
  }
}
const isBool = (v: unknown) => v === null || typeof v === 'boolean'
const isStr = (v: unknown): v is string => typeof v === 'string'
// El borrador se recupera solo si cierra: la forma es la esperada, el rubro existe y al paso guardado se puede llegar
// con esas respuestas (las mismas condiciones que piden los botones de "Continuar"). Después de "Plazos" la cuenta ya
// tiene que estar configurada en el backend. Si algo no cierra, el onboarding arranca de cero, en el primer paso.
function restorable(d: unknown, templates: Template[], state: State): d is Draft {
  if (!d || typeof d !== 'object') return false
  const x = d as Partial<Record<keyof Draft, unknown>>
  const ans = x.ans as Partial<Answers> | undefined
  const hours = x.responseHours as Partial<Hours> | undefined
  const shapeOk =
    isStr(x.step) &&
    isStr(x.key) &&
    isStr(x.industry) &&
    Array.isArray(x.services) &&
    x.services.every(isStr) &&
    !!ans &&
    typeof ans === 'object' &&
    (['team', 'sla', 'problems', 'fields'] as const).every((k) => k in ans && isBool(ans[k])) &&
    isBool(x.waits) &&
    !!hours &&
    typeof hours === 'object' &&
    PRIOS.every((p) => isStr(hours[p])) &&
    isStr(x.autoCloseDays)
  if (!shapeOk) return false
  const v = d as Draft
  if (!templates.some((t) => t.key === v.key)) return false
  const steps = stepsFor(v.ans)
  const at = steps.indexOf(v.step)
  if (at < 0) return false
  const past = (s: StepKey) => at > steps.indexOf(s)
  if (past('rubro') && v.key === 'otro' && !v.industry.trim()) return false
  if (past('servicios') && !v.services.some((s) => s.trim())) return false
  if (past('trabajo') && Object.values(v.ans).some((a) => a === null)) return false
  if (past('plazos') && ((v.ans.sla && v.waits === null) || !state.industry)) return false
  return true
}

export function Onboarding(props: { state: State; run: Run; onDone: (createdTicket: boolean) => void; onLogout: () => void }) {
  const { state, run, onDone } = props
  const [templates, setTemplates] = useState<Template[]>([])
  const [step, setStep] = useState<StepKey>('rubro')
  const [key, setKey] = useState('')
  const [industry, setIndustry] = useState('')
  const [services, setServices] = useState<string[]>([])
  const [ans, setAns] = useState<Answers>({ team: null, sla: null, problems: null, fields: null })
  // Paso "Plazos": se precarga con la plantilla del rubro elegido.
  const [waits, setWaits] = useState<boolean | null>(null)
  const [responseHours, setResponseHours] = useState<Hours>({ alta: '', media: '', baja: '' })
  const [autoCloseDays, setAutoCloseDays] = useState('')
  const [prio, setPrio] = useState<Priority>('media')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  // El borrador se lee una vez, al entrar, y se empieza a guardar recién después de intentar recuperarlo
  // (hace falta la lista de plantillas para validarlo): así no se pisa antes de tiempo.
  const [saved] = useState(() => readDraft(state.id, state.me))
  const [restored, setRestored] = useState(false)

  useEffect(() => {
    api.templates().then(
      (ts) => {
        setTemplates(ts)
        if (restorable(saved, ts, state)) {
          setKey(saved.key)
          setIndustry(saved.industry)
          setServices(saved.services)
          setAns(saved.ans)
          setWaits(saved.waits)
          setResponseHours(saved.responseHours)
          setAutoCloseDays(saved.autoCloseDays)
          setStep(saved.step)
        }
        setRestored(true)
      },
      (e: Error) => setError(e.message),
    )
  }, [])

  useEffect(() => {
    if (restored) writeDraft(state.id, state.me, { step, key, industry, services, ans, waits, responseHours, autoCloseDays })
  }, [restored, state.id, state.me, step, key, industry, services, ans, waits, responseHours, autoCloseDays])

  const tpl = templates.find((t) => t.key === key)
  const steps = stepsFor(ans)
  const at = steps.indexOf(step)
  const answered = Object.values(ans).every((v) => v !== null)
  const cleanServices = services.map((s) => s.trim()).filter(Boolean)
  const firstName = state.users[0].name.split(' ')[0]
  const team = state.users.filter((u) => u.id !== state.ownerId)

  const go = (to: StepKey) => {
    setError('')
    setStep(to)
  }
  // El error del paso se va apenas se cambia un campo o una respuesta (los inputs lo hacen con onInput, en la sección).
  const edited = () => setError('')
  // Toda llamada del asistente pasa por acá: muestra el error en el paso, no en un banner perdido.
  const call = async (p: Promise<State>) => {
    setBusy(true)
    setError('')
    try {
      const s = await p
      await run(Promise.resolve(s))
      return s
    } catch (e) {
      // Sesión vencida: como en el resto de la app (run sale al ingreso y borra el borrador). Lo demás, en el paso.
      if ('expired' in (e as object)) await run(Promise.reject(e))
      else setError((e as Error).message)
      return null
    } finally {
      setBusy(false)
    }
  }
  const saveSetup = async () => {
    const setup: Setup = {
      template: key,
      industry,
      services: cleanServices,
      team: !!ans.team,
      sla: !!ans.sla,
      problems: !!ans.problems,
      fields: !!ans.fields,
      // Las horas de primera respuesta y la espera solo cuentan con plazos; el cierre automático, siempre.
      ...(ans.sla && { responseHours: hoursToSent(responseHours), waitsRequester: !!waits }),
      autoCloseDays: num(autoCloseDays),
    }
    if (await call(api.onboard(setup))) go(steps[at + 1])
  }
  const finish = async (createdTicket: boolean) => {
    if (await call(api.finishOnboarding())) {
      clearOnboardingDraft(state.id, state.me)
      onDone(createdTicket)
    }
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
          <button type="button" className="tx-btn ghost icon sm onb-out" aria-label="Cerrar sesión" onClick={props.onLogout}>
            <Ic n="logout" />
          </button>
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
          <section className="tx-panel tx-solid onb-step" aria-live="polite" onInput={edited}>
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
                        // Cambiar de rubro recarga desde su plantilla los servicios y los plazos; volver a elegir el mismo no
                        // pisa lo que se editó (por ejemplo, lo recuperado de un borrador).
                        if (t.key !== key) {
                          setServices(t.config.services)
                          setResponseHours(hoursToDraft(t.config.responseHours))
                          setAutoCloseDays(String(t.config.autoCloseDays))
                        }
                        setKey(t.key)
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
                {QUESTIONS.map(({ key: k, ...question }) => (
                  <YesNo key={k} {...question} value={ans[k]} onChange={(v) => setAns((a) => ({ ...a, [k]: v }))} />
                ))}
                {nav(
                  <button type="button" className="tx-btn primary lg" disabled={!answered} onClick={() => go('plazos')}>
                    Continuar
                  </button>,
                )}
              </>
            )}

            {step === 'plazos' && tpl && (
              <>
                <div>
                  <h1 className="tx-h1">Plazos de atención</h1>
                  <p className="tx-muted">
                    {ans.sla
                      ? 'Te proponemos los plazos habituales de tu rubro. Ajustalos a lo que hoy le prometés a quien reporta; después los podés cambiar desde Configuración.'
                      : 'Falta un detalle: qué pasa con los tickets que ya resolviste. Después lo podés cambiar desde Configuración.'}
                  </p>
                </div>
                {ans.sla && (
                  <div className="tx-stack" style={{ gap: 12 }}>
                    <div>
                      <h2 className="tx-h3">Horas de primera respuesta</h2>
                      <p className="tx-caption">
                        Cuánto puede esperar quien reportó hasta recibir la primera respuesta, según la prioridad. Al lado, como referencia, las horas para resolver.
                      </p>
                    </div>
                    <div className="cfg-sla">
                      <span />
                      <span className="tx-caption" aria-hidden="true">
                        Primera respuesta
                      </span>
                      <span className="tx-caption" aria-hidden="true">
                        Resolución
                      </span>
                      {PRIOS.map((p) => (
                        <div key={p} style={{ display: 'contents' }}>
                          <span className="cfg-prio">
                            <Prio p={p} />
                          </span>
                          <span className="cfg-hours">
                            <input
                              className="tx-input cfg-num"
                              type="number"
                              min={1}
                              aria-label={`Horas de primera respuesta para prioridad ${p}`}
                              value={responseHours[p]}
                              onChange={(e) => setResponseHours((h) => ({ ...h, [p]: e.target.value }))}
                            />
                            <span className="tx-muted">horas</span>
                          </span>
                          {/* Los encabezados están ocultos para lectores de pantalla (como en Configuración): el texto se lee completo. */}
                          <span className="cfg-hours tx-muted">
                            <span>
                              <span className="sr-only">{`Resolución de prioridad ${p}: `}</span>
                              {count(tpl.config.slaHours[p], 'hora')}
                            </span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {ans.sla && (
                  <YesNo
                    {...WAITS_QUESTION}
                    value={waits}
                    onChange={(v) => {
                      setWaits(v)
                      edited()
                    }}
                  />
                )}
                <div className="tx-stack" style={{ gap: 12 }}>
                  <div>
                    <h2 className="tx-h3">Cierre automático</h2>
                    <p className="tx-caption">
                      Un incidente resuelto espera la confirmación de que el servicio quedó restablecido. Si nadie lo cierra ni lo reabre, se cierra solo.
                    </p>
                  </div>
                  <div className="cfg-line" style={{ flexWrap: 'wrap' }}>
                    Los incidentes resueltos se cierran solos tras
                    <input
                      className="tx-input cfg-num"
                      type="number"
                      min={1}
                      aria-label="Días sin actividad para el cierre automático"
                      value={autoCloseDays}
                      onChange={(e) => setAutoCloseDays(e.target.value)}
                    />
                    días sin actividad.
                  </div>
                </div>
                {error && <FieldError id="ob-e">{error}</FieldError>}
                {nav(
                  <button type="button" className="tx-btn primary lg" disabled={busy || (!!ans.sla && waits === null)} onClick={saveSetup}>
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
                        <button
                          key={p}
                          type="button"
                          aria-pressed={p === prio}
                          onClick={() => {
                            setPrio(p)
                            edited()
                          }}
                        >
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

          <Preview
            state={state}
            tpl={tpl}
            industry={key === 'otro' ? industry : (tpl?.industry ?? '')}
            services={cleanServices}
            ans={ans}
            waits={waits}
            responseHours={responseHours}
            autoCloseDays={autoCloseDays}
            team={team.map((u) => u.name)}
          />
        </div>
      </main>
    </div>
  )
}

const Sk = ({ w, h = 12 }: { w: number | string; h?: number }) => <span className="sk" style={{ width: w, height: h }} />

// Vista previa: la ticketera que se va armando con cada respuesta. Lo que todavía no se decidió se ve como skeleton.
function Preview(props: {
  state: State
  tpl?: Template
  industry: string
  services: string[]
  ans: Answers
  waits: boolean | null
  responseHours: Hours
  autoCloseDays: string
  team: string[]
}) {
  const { tpl, ans, services } = props
  const c = tpl?.config
  // Misma regla que el backend (setup.go, Template.build): sin equipo quedan el primero y el último; si hay plazos y se
  // espera a quien reportó, "Esperando al solicitante" va justo antes del último (si el flujo ya lo trae, queda donde está).
  let states = c && ans.team !== null ? (ans.team ? c.states : [c.states[0], c.states[c.states.length - 1]]) : null
  const waiting = !!(ans.sla && props.waits)
  if (states && waiting && !states.includes(WAITING)) states = [...states.slice(0, -1), WAITING, states[states.length - 1]]
  // Las horas se muestran como se van a guardar; vacías, con una raya.
  const hours = (v: string) => {
    const n = num(v)
    return n === null ? '—' : `${n} h`
  }
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
            {ans.sla && c ? (
              <div className="onb-sla">
                <span />
                <span className="tx-caption">Primera respuesta</span>
                <span className="tx-caption">Resolución</span>
                {PRIOS.map((p) => (
                  <div key={p} style={{ display: 'contents' }}>
                    <Prio p={p} />
                    <span className="tx-caption">{hours(props.responseHours[p])}</span>
                    <span className="tx-caption">{c.slaHours[p]} h</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="onb-chips">
                {PRIOS.map((p) => (
                  <Prio key={p} p={p} />
                ))}
              </div>
            )}
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
            states.map((s, i, all) => (
              <span key={s} style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                {i > 0 && <Ic n="chevron" />}
                <span className={`tx-badge ${i === all.length - 1 ? 'resuelto' : 'abierto'} ${waiting && s === WAITING ? 'onb-new' : ''}`}>
                  {s}
                  {waiting && s === WAITING && <Ic n="pause" />}
                </span>
              </span>
            ))
          ) : (
            <>
              <Sk w={70} h={24} />
              <Sk w={70} h={24} />
            </>
          )}
        </div>
        {waiting && (
          <span className="tx-caption onb-then onb-new">
            <Ic n="pause" />
            Detiene el plazo de resolución
          </span>
        )}
      </div>

      <div className="onb-pv-block">
        <span className="tx-overline">Cierre automático</span>
        {c ? <span className="tx-caption">{autoCloseText(props.autoCloseDays)}</span> : <Sk w={140} />}
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

// "2 días sin actividad"; vacío, con una raya (el backend lo va a rechazar al guardar).
function autoCloseText(days: string) {
  const n = num(days)
  return n === null ? '— días sin actividad' : `${count(n, 'día')} sin actividad`
}
