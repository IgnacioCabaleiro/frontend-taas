// Configuración de la cuenta: la ticketera a medida de la empresa, y quién puede hacer qué.
import { useEffect, useLayoutEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react'
import { api, type Config, type Field, type Priority, type State } from './api'
import { Check, FieldError, Ic, Prio, hoursToDraft, hoursToSent, num, type Run } from './ui'
import { People } from './People'
import { Versions } from './Versions'

const PRIOS: Priority[] = ['alta', 'media', 'baja']
const clone = (c: Config): Config => JSON.parse(JSON.stringify(c))

// Borrador de la configuración: los números guardan el texto del input, para mostrar exactamente lo que se escribe (también vacío).
type NumKeys = 'slaHours' | 'responseHours' | 'recurrenceMin' | 'recurrenceDays' | 'autoCloseDays'
type Draft = Omit<Config, NumKeys> & {
  slaHours: Record<Priority, string>
  responseHours: Record<Priority, string>
  recurrenceMin: string
  recurrenceDays: string
  autoCloseDays: string
}
// Lo que se envía (los ayudantes de números están en ui.tsx, compartidos con el onboarding). Un número vacío viaja como null: el backend lo rechaza con su mensaje (sin validación nueva en el front).
type Sent = Omit<Config, NumKeys> & {
  slaHours: Record<Priority, number | null>
  responseHours: Record<Priority, number | null>
  recurrenceMin: number | null
  recurrenceDays: number | null
  autoCloseDays: number | null
}
const toDraft = (c: Config): Draft => {
  const d = clone(c)
  return {
    ...d,
    slaHours: hoursToDraft(d.slaHours),
    responseHours: hoursToDraft(d.responseHours),
    recurrenceMin: String(d.recurrenceMin),
    recurrenceDays: String(d.recurrenceDays),
    autoCloseDays: String(d.autoCloseDays),
  }
}
const toSent = (d: Draft): Sent => ({
  ...d,
  slaHours: hoursToSent(d.slaHours),
  responseHours: hoursToSent(d.responseHours),
  recurrenceMin: num(d.recurrenceMin),
  recurrenceDays: num(d.recurrenceDays),
  autoCloseDays: num(d.autoCloseDays),
})
// Opciones de un campo Lista: la coma y el salto de línea (Enter) las separan; se muestran unidas por ", ".
// No quedan opciones vacías (por ejemplo, por un Enter junto a una coma), salvo la última, que es la nueva que se está
// escribiendo al final, y, con `hole`, la del cursor, para escribir en su lugar. Al salir de la caja se quitan todas.
// Devuelve también dónde queda el cursor en el texto unido: en el mismo lugar de su opción o, si su opción vacía se
// quitó, al principio de la siguiente.
function parseOptions(text: string, at: number, hole = false) {
  const split = (s: string) => s.split(/\r?\n|,/).map((o) => o.trimStart())
  const all = split(text)
  const head = split(text.slice(0, at))
  const k = head.length - 1 // la opción en la que está el cursor
  const kept = (j: number) => all[j] !== '' || j === all.length - 1 || (hole && j === k)
  const caret = all.slice(0, k).reduce((n, o, j) => (kept(j) ? n + o.length + 2 : n), kept(k) ? head[k].length : 0)
  return { options: all.filter((_, j) => kept(j)), caret }
}
// Backspace justo después de un separador (", ") o Supr justo antes lo borran entero y unen las dos opciones, con el
// cursor entre las dos, como en un texto común. En un hueco vacío del medio, Backspace lo quita y deja el cursor al
// final de la opción anterior. undefined si el cursor no está junto a un separador.
function joinOptions(text: string, at: number, back: boolean) {
  const sep = back ? at - 2 : at
  if (sep < 0 || text.slice(sep, sep + 2) !== ', ') return undefined
  return parseOptions(text.slice(0, sep) + text.slice(sep + 2), sep)
}

// Mantiene los estados de pausa al editar la lista de estados en el borrador: un estado renombrado sigue en pausa
// con su nombre nuevo, uno quitado deja de estarlo, y ni el primero ni el último pueden pausar.
// La lista solo cambia de a un ítem: se edita uno, se quita uno o se agrega uno al final.
function syncPause(old: string[], next: string[], pause: string[]) {
  const paused = old.map((s) => pause.includes(s))
  if (next.length < old.length) {
    let gone = next.findIndex((s, i) => s !== old[i])
    if (gone < 0) gone = next.length
    paused.splice(gone, 1)
  }
  return next.filter((_, i) => paused[i] && i > 0 && i < next.length - 1)
}

// Caja de texto que crece con su contenido (y se reacomoda si cambia su ancho), para que se lea completa.
function AutoGrow(props: ComponentProps<'textarea'>) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const fit = () => {
      el.style.height = 'auto'
      el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [props.value])
  return <textarea ref={ref} rows={1} {...props} />
}

// Lista editable de textos (servicios, estados).
export function ListEditor(props: {
  items: string[]
  onChange: (v: string[]) => void
  label: string
  add: string
  min: number
  extra?: (i: number) => ReactNode // algo más por ítem, entre el texto y el botón de quitar
}) {
  const { items, onChange } = props
  return (
    <div className="tx-stack" style={{ gap: 8 }}>
      {items.map((s, i) => (
        <div key={i} className={`cfg-line ${props.extra ? 'cfg-extra' : ''}`}>
          <span className="tx-count">{i + 1}</span>
          <input
            className="tx-input"
            aria-label={`${props.label} ${i + 1}`}
            value={s}
            onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))}
          />
          {props.extra && <span className="cfg-extra-item">{props.extra(i)}</span>}
          <button
            type="button"
            className="tx-btn ghost icon sm"
            aria-label={`Quitar ${s || props.label}`}
            disabled={items.length <= props.min}
            onClick={() => onChange(items.filter((_, j) => j !== i))}
          >
            <Ic n="trash" />
          </button>
        </div>
      ))}
      <button type="button" className="tx-btn ghost sm" style={{ alignSelf: 'flex-start' }} onClick={() => onChange([...items, ''])}>
        <Ic n="plus" />
        {props.add}
      </button>
    </div>
  )
}

export function Settings({ state, run }: { state: State; run: Run }) {
  const [c, setC] = useState(() => toDraft(state.config))
  const dirty = JSON.stringify(toSent(c)) !== JSON.stringify(state.config)
  // El error al guardar se muestra en la barra de guardar, junto al botón.
  const [saveError, setSaveError] = useState('')
  // Si el borrador vuelve a quedar igual a lo guardado, la barra se va y su error con ella.
  useEffect(() => {
    if (!dirty) setSaveError('')
  }, [dirty])
  const set = (patch: Partial<Draft>) => setC({ ...c, ...patch })
  const setField = (i: number, patch: Partial<Field>) => set({ fields: c.fields.map((f, j) => (j === i ? { ...f, ...patch } : f)) })

  return (
    <>
      <People state={state} run={run} />

      <h2 className="tx-h2" style={{ marginTop: 8 }}>
        Tu ticketera
      </h2>
      <section className="tx-panel tx-solid">
        <div>
          <h3 className="tx-h3">Complejidad</h3>
          <p className="tx-caption">Lo que elegiste en el alta. Podés sumar o quitar módulos cuando cambie la forma de trabajar de tu equipo.</p>
        </div>
        <Check checked={c.modules.sla} onChange={(sla) => set({ modules: { ...c.modules, sla } })} label="SLA: cada ticket tiene un vencimiento según su prioridad" />
        <Check
          checked={c.modules.problems}
          onChange={(problems) => set({ modules: { ...c.modules, problems } })}
          label="Gestión de problemas: detectar incidentes recurrentes, investigar la causa y publicar errores conocidos"
        />
      </section>

      <div className="cfg-grid">
        <section className="tx-panel tx-solid">
          <div>
            <h3 className="tx-h3">Servicios</h3>
            <p className="tx-caption">El catálogo sobre el que se reportan incidentes y se agrupan los problemas.</p>
          </div>
          <ListEditor items={c.services} onChange={(services) => set({ services })} label="Servicio" add="Agregar servicio" min={1} />
        </section>

        <section className="tx-panel tx-solid">
          <div>
            <h3 className="tx-h3">Estados del ticket</h3>
            <p className="tx-caption">
              El flujo de tu equipo, en orden. El primero es el del registro y el último, el de resolución: el cierre viene después, aparte del flujo.
            </p>
            <p className="tx-caption" style={{ marginTop: 4 }}>
              Según ITIL, el reloj del SLA se detiene solo mientras se espera al solicitante.
            </p>
          </div>
          <ListEditor
            items={c.states}
            onChange={(states) => set({ states, pauseStates: syncPause(c.states, states, c.pauseStates) })}
            label="Estado"
            add="Agregar estado"
            min={2}
            extra={(i) => {
              const s = c.states[i]
              const edge = i === 0 || i === c.states.length - 1
              return (
                <Check
                  checked={!edge && c.pauseStates.includes(s)}
                  disabled={edge || !s.trim()}
                  onChange={(on) => set({ pauseStates: on ? [...c.pauseStates, s] : c.pauseStates.filter((x) => x !== s) })}
                  label="Detiene el SLA de resolución"
                />
              )
            }}
          />
        </section>
      </div>

      <section className="tx-panel tx-solid">
        <div>
          <h3 className="tx-h3">Cierre de incidentes</h3>
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
            value={c.autoCloseDays}
            onChange={(e) => set({ autoCloseDays: e.target.value })}
          />
          días sin actividad.
        </div>
      </section>

      <section className="tx-panel tx-solid">
        <div>
          <h3 className="tx-h3">Campos del ticket</h3>
          <p className="tx-caption">Datos propios de tu rubro que se piden al registrar un incidente, además de título, servicio y prioridad.</p>
        </div>
        {c.fields.length === 0 && <div className="tx-inline-empty">Sin campos propios: el ticket se registra solo con los datos básicos.</div>}
        {c.fields.map((f, i) => (
          <div key={i} className="cfg-field">
            <input className="tx-input" aria-label="Nombre del campo" placeholder="Nombre del campo" value={f.label} onChange={(e) => setField(i, { label: e.target.value })} />
            <select className="tx-input" aria-label="Tipo de campo" value={f.type} onChange={(e) => setField(i, { type: e.target.value as Field['type'] })}>
              <option value="text">Texto</option>
              <option value="number">Número</option>
              <option value="select">Lista</option>
            </select>
            {f.type === 'select' ? (
              <AutoGrow
                className="tx-textarea cfg-options"
                aria-label="Opciones, separadas por coma"
                placeholder="Opciones separadas por coma"
                value={f.options.join(', ')}
                onChange={(e) => {
                  // Si Enter se convierte en ", ", el cursor queda donde estaba y no salta al final.
                  const el = e.target
                  // Al borrar todo el texto de una opción queda su hueco, para escribir ahí. Si la opción ya estaba
                  // vacía (el borrado no cambiaría nada), el hueco se va.
                  const deleting = (e.nativeEvent as InputEvent).inputType?.startsWith('delete')
                  let { options, caret } = parseOptions(el.value, el.selectionStart, deleting)
                  if (deleting && JSON.stringify(options) === JSON.stringify(f.options)) ({ options, caret } = parseOptions(el.value, el.selectionStart))
                  setField(i, { options })
                  requestAnimationFrame(() => el.setSelectionRange(caret, caret))
                }}
                onKeyDown={(e) => {
                  const el = e.currentTarget
                  const at = el.selectionStart
                  const back = e.key === 'Backspace'
                  if ((!back && e.key !== 'Delete') || e.ctrlKey || e.altKey || e.metaKey || at !== el.selectionEnd) return
                  const joined = joinOptions(el.value, at, back)
                  if (!joined) return
                  e.preventDefault()
                  setField(i, { options: joined.options })
                  requestAnimationFrame(() => el.setSelectionRange(joined.caret, joined.caret))
                }}
                onBlur={() => f.options.includes('') && setField(i, { options: f.options.filter((o) => o !== '') })}
              />
            ) : (
              <span className="tx-caption">{f.type === 'number' ? 'Solo acepta números' : 'Texto libre'}</span>
            )}
            <Check checked={f.required} onChange={(required) => setField(i, { required })} label="Obligatorio" />
            <button type="button" className="tx-btn ghost icon sm" aria-label={`Quitar el campo ${f.label}`} onClick={() => set({ fields: c.fields.filter((_, j) => j !== i) })}>
              <Ic n="trash" />
            </button>
          </div>
        ))}
        <button
          type="button"
          className="tx-btn ghost sm"
          style={{ alignSelf: 'flex-start' }}
          onClick={() => set({ fields: [...c.fields, { key: '', label: '', type: 'text', options: [], required: false }] })}
        >
          <Ic n="plus" />
          Agregar campo
        </button>
      </section>

      {(c.modules.sla || c.modules.problems) && (
        <div className="cfg-grid">
          {c.modules.sla && (
            <section className="tx-panel tx-solid">
              <div>
                <h3 className="tx-h3">Prioridades y SLA</h3>
                <p className="tx-caption">
                  Horas para la primera respuesta al solicitante y para resolver, según la prioridad. Se aplica a los tickets nuevos.
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
                        value={c.responseHours[p] ?? ''}
                        onChange={(e) => set({ responseHours: { ...c.responseHours, [p]: e.target.value } })}
                      />
                      <span className="tx-muted">horas</span>
                    </span>
                    <span className="cfg-hours">
                      <input
                        className="tx-input cfg-num"
                        type="number"
                        min={1}
                        aria-label={`Horas de resolución para prioridad ${p}`}
                        value={c.slaHours[p] ?? ''}
                        onChange={(e) => set({ slaHours: { ...c.slaHours, [p]: e.target.value } })}
                      />
                      <span className="tx-muted">horas</span>
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
          {c.modules.problems && (
            <section className="tx-panel tx-solid">
              <div>
                <h3 className="tx-h3">Detección de incidentes recurrentes</h3>
                <p className="tx-caption">Cuándo la ticketera te sugiere abrir un problema para investigar la causa.</p>
              </div>
              <div className="cfg-line" style={{ flexWrap: 'wrap' }}>
                Sugerir un problema con
                <input
                  className="tx-input cfg-num"
                  type="number"
                  min={2}
                  aria-label="Cantidad mínima de incidentes"
                  value={c.recurrenceMin}
                  onChange={(e) => set({ recurrenceMin: e.target.value })}
                />
                incidentes del mismo servicio en
                <input
                  className="tx-input cfg-num"
                  type="number"
                  min={1}
                  aria-label="Ventana en días"
                  value={c.recurrenceDays}
                  onChange={(e) => set({ recurrenceDays: e.target.value })}
                />
                días.
              </div>
            </section>
          )}
        </div>
      )}

      <Versions state={state} run={run} dirty={dirty} onRestored={(s) => setC(toDraft(s.config))} />

      {dirty && (
        <div className="cfg-save tx-glass-strong">
          <div className="grow" role="status">
            <span className="tx-strong">Tenés cambios sin guardar en tu ticketera</span>
            {saveError && <FieldError id="cfg-save-e">{saveError}</FieldError>}
          </div>
          <button
            type="button"
            className="tx-btn ghost"
            onClick={() => {
              setSaveError('')
              setC(toDraft(state.config))
            }}
          >
            Descartar
          </button>
          <button
            type="button"
            className="tx-btn primary"
            aria-describedby={saveError ? 'cfg-save-e' : undefined}
            onClick={async () => {
              setSaveError('')
              // Sent admite null donde Config pide número: ver el comentario de Sent.
              const s = await run(api.setConfig(toSent(c) as Config), { onError: setSaveError })
              if (s) setC(toDraft(s.config))
            }}
          >
            <Ic n="check" />
            Guardar configuración
          </button>
        </div>
      )}
    </>
  )
}
