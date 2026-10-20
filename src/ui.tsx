// Piezas chicas compartidas: envuelven las clases tx-* del design system.
import { useEffect, useRef, type ComponentProps, type ReactNode } from 'react'
import type { Config, Incident, Perm, Priority, ResolutionCode, State, Status, User } from './api'

// onError: la pantalla muestra el error en su propio lugar (por ejemplo, junto al botón que lo provocó)
// en vez del aviso general de arriba.
export type Run = (p: Promise<State>, opts?: { onError?: (message: string) => void }) => Promise<State | null>

// Íconos del sistema (grilla 24, trazo 1.75), tal como vienen en los previews.
const ICONS = {
  target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.5"/><path d="M12 3.5v3M12 17.5v3M3.5 12h3M17.5 12h3"/>',
  alert: '<path d="M12 3.8 2.8 19.6h18.4z"/><path d="M12 10v4"/><path d="M12 17h.01"/>',
  book: '<path d="M5 4.5h9.5a3 3 0 0 1 3 3V20H8a3 3 0 0 1-3-3z"/><path d="M5 17a3 3 0 0 1 3-3h9.5"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
  recur: '<path d="M4 12a8 8 0 0 1 13.7-5.6L20 8.5"/><path d="M20 4v4.5h-4.5"/><path d="M20 12a8 8 0 0 1-13.7 5.6L4 15.5"/><path d="M4 20v-4.5h4.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  back: '<path d="M19 12H5"/><path d="m11 18-6-6 6-6"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  bulb: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
  wrench: '<path d="M15 4a5 5 0 0 0-4.6 6.9L4 17.3V20h2.7l6.4-6.4A5 5 0 0 0 20 9l-3 1-2-2 1-3z"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
  offline: '<path d="M3 3l18 18"/><path d="M8.5 16.5a5 5 0 0 1 7 0"/><path d="M5 12.5a10 10 0 0 1 4.2-2.4"/><path d="M19 12.5a10 10 0 0 0-3.1-2"/><path d="M2 8.8a15 15 0 0 1 4.3-2.6"/><path d="M22 8.8A15 15 0 0 0 11 5"/><path d="M12 20h.01"/>',
  retry: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 5v6h-6"/>',
  play: '<path d="M7 5v14l11-7z"/>',
  flag: '<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  warn: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5"/><path d="M12 16h.01"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M21 20H3"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.2 2.2M16.2 16.2l2.2 2.2M5.6 18.4l2.2-2.2M16.2 7.8l2.2-2.2"/>',
  trash: '<path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13"/>',
  pause: '<circle cx="12" cy="12" r="9"/><path d="M10 9v6M14 9v6"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  reply: '<path d="M10 8 5 12l5 4"/><path d="M5 12h9a5 5 0 0 1 5 5v1"/>',
  logout: '<path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4"/><path d="M15 8l4 4-4 4"/><path d="M19 12H9"/>',
} as const

export const Ic = ({ n, size = '' }: { n: keyof typeof ICONS; size?: '' | 'lg' | 'xl' }) => (
  <svg className={`tx-ic ${size}`} viewBox="0 0 24 24" aria-hidden="true" dangerouslySetInnerHTML={{ __html: ICONS[n] }} />
)

// Link de navegación interna (el sistema estiliza <a>; no hay router).
export const A = ({ onClick, ...rest }: Omit<ComponentProps<'a'>, 'onClick' | 'href'> & { onClick: () => void }) => (
  <a
    href="#"
    onClick={(e) => {
      e.preventDefault()
      onClick()
    }}
    {...rest}
  />
)

export const STEPS: Status[] = ['identificado', 'en_analisis', 'error_conocido', 'resuelto']
export const STATUS: Record<Status, { label: string; cls: string }> = {
  identificado: { label: 'Identificado', cls: 'identificado' },
  en_analisis: { label: 'En análisis', cls: 'analisis' },
  error_conocido: { label: 'Error conocido', cls: 'conocido' },
  resuelto: { label: 'Resuelto', cls: 'resuelto' },
}

export const StatusBadge = ({ s }: { s: Status }) => <span className={`tx-badge ${STATUS[s].cls}`}>{STATUS[s].label}</span>
export const Prio = ({ p }: { p: Priority }) => <span className={`tx-prio ${p}`}>{p[0].toUpperCase() + p.slice(1)}</span>

export const ProblemId = ({ id, go }: { id: number; go?: (id: number) => void }) =>
  go ? (
    <A className="tx-id" onClick={() => go(id)}>
      P-{id}
    </A>
  ) : (
    <span className="tx-strong">P-{id}</span>
  )

export function Filters<T extends string>(props: { value: T; onChange: (v: T) => void; options: [T, string, number][] }) {
  return (
    <div className="tx-filters">
      {props.options.map(([v, label, count]) => (
        <button key={v} className="tx-filter" aria-pressed={v === props.value} onClick={() => props.onChange(v)}>
          {label} · {count}
        </button>
      ))}
    </div>
  )
}

const overline = { display: 'inline-flex', gap: 6, alignItems: 'center' }

export const Workaround = ({ text }: { text: string }) => (
  <div className="tx-callout wa">
    <div className="hd">
      <span className="tx-overline" style={overline}>
        <Ic n="bulb" />
        Workaround
      </span>
      <button type="button" className="tx-btn ghost sm" onClick={() => navigator.clipboard?.writeText(text)}>
        <Ic n="copy" />
        Copiar
      </button>
    </div>
    <p>{text}</p>
  </div>
)

export const Solution = ({ text }: { text: string }) => (
  <div className="tx-callout sol">
    <div className="hd">
      <span className="tx-overline" style={overline}>
        <Ic n="wrench" />
        Solución definitiva
      </span>
    </div>
    <p>{text}</p>
  </div>
)

export const RootCause = ({ text }: { text: string }) => (
  <div className="tx-block">
    <span className="tx-overline">Causa raíz</span>
    <p>{text}</p>
  </div>
)

export const FieldError = ({ id, children }: { id: string; children: string }) => (
  <span className="tx-err" id={id}>
    <Ic n="warn" />
    {children}
  </span>
)

export const fields = (form: HTMLFormElement) => Object.fromEntries(new FormData(form)) as Record<string, string>

const p2 = (n: number) => String(n).padStart(2, '0')
// "04/10 18:03", como en el diseño.
export function fmt(s: string) {
  const d = new Date(s)
  return `${p2(d.getDate())}/${p2(d.getMonth() + 1)} ${p2(d.getHours())}:${p2(d.getMinutes())}`
}

export function ago(s: string) {
  const m = Math.round((Date.now() - +new Date(s)) / 60000)
  return m < 1 ? 'recién' : m < 60 ? `hace ${m} min` : m < 1440 ? `hace ${Math.round(m / 60)} h` : `hace ${Math.round(m / 1440)} d`
}

export const count = (k: number, one: string, many = one + 's') => `${k} ${k === 1 ? one : many}`

// --- Incidentes: etapa ITIL, estado configurable, SLA, personas ---

// Etapas del ciclo de vida (ITIL 4). No son estados del flujo configurable: salen de resolvedAt y closedAt.
export type Stage = 'abierto' | 'resuelto' | 'cerrado'
export const stage = (i: Incident): Stage => (i.closedAt ? 'cerrado' : i.resolvedAt ? 'resuelto' : 'abierto')
export const STAGE: Record<Stage, { label: string; cls: string }> = {
  abierto: { label: 'Abierto', cls: 'stage-abierto' },
  resuelto: { label: 'Resuelto', cls: 'resuelto' },
  cerrado: { label: 'Cerrado', cls: 'stage-cerrado' },
}
export const StageBadge = ({ i }: { i: Incident }) => <span className={`tx-badge ${STAGE[stage(i)].cls}`}>{STAGE[stage(i)].label}</span>

// Estado del flujo configurable de la cuenta (por ejemplo "En curso"): se ve distinto de la etapa.
export const IncBadge = ({ i }: { i: Incident }) => (
  <span className="tx-state" title="Estado del flujo">
    {i.status}
  </span>
)

// Etapa y, mientras está abierto, el estado del flujo en el que se está diagnosticando.
export const IncStage = ({ i }: { i: Incident }) => (
  <span className="tx-row" style={{ gap: 6, display: 'inline-flex', flexWrap: 'nowrap' }}>
    <StageBadge i={i} />
    {!i.resolvedAt && <IncBadge i={i} />}
  </span>
)

export const RESOLUTION: Record<ResolutionCode, string> = {
  solucionado: 'Solucionado',
  workaround: 'Con workaround',
  duplicado: 'Duplicado',
  sin_reproducir: 'No se pudo reproducir',
  cancelado: 'Cancelado',
}
// Con estos códigos resolver también cierra, en el mismo momento.
export const CLOSING_CODES: ResolutionCode[] = ['duplicado', 'cancelado']
// Los incidentes resueltos antes de que existieran los códigos tienen código vacío.
export const resolutionLabel = (code: ResolutionCode | '') => (code ? RESOLUTION[code] : '—')

// Cuándo se cierra solo un incidente resuelto: autoCloseDays días después de su última actividad, que es el último
// evento del historial y como mínimo la resolución (cada evento nuevo reinicia la cuenta). undefined si no
// corresponde: no está resuelto o el solicitante respondió y quedó frenado.
export function autoCloseAt(i: Incident, c: Config): Date | undefined {
  if (stage(i) !== 'resuelto' || i.autoCloseHold) return undefined
  const last = Math.max(+new Date(i.resolvedAt!), ...i.history.map((h) => +new Date(h.at)))
  return new Date(last + c.autoCloseDays * 864e5)
}

export const userName = (users: User[], id: number, none = 'Sin asignar') => users.find((u) => u.id === id)?.name ?? none
// Autor de un evento del historial: userId 0 es el sistema (por ejemplo, el cierre automático).
export const author = (users: User[], id: number) => (id === 0 ? 'Sistema' : userName(users, id, 'Usuario eliminado'))

export const dur = (ms: number) => {
  const m = Math.abs(ms) / 60000
  return m < 60 ? `${Math.max(1, Math.round(m))} min` : m < 2880 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} d`
}

// ¿El rol de este usuario tiene este permiso?
export const userCan = (s: State, id: number, perm: Perm) => !!s.roles.find((r) => r.id === s.users.find((u) => u.id === id)?.roleId)?.perms.includes(perm)
// ¿El rol del usuario logueado tiene este permiso?
export const can = (s: State, perm: Perm) => userCan(s, s.me, perm)
// Para los selects de personas: los usuarios cuyo rol tiene el permiso (por ejemplo, a quién se le puede asignar un
// incidente). El valor actual sigue en la lista aunque no lo tenga, para que el select lo muestre.
export const usersWith = (s: State, perm: Perm, current = 0) => s.users.filter((u) => u.id === current || userCan(s, u.id, perm))

export const initials = (name: string) =>
  name
    .split(' ')
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

// SLA de resolución: fuera de plazo si se resolvió (o sigue abierto) después del vencimiento. Mientras está en pausa,
// el reloj quedó detenido en pausedAt. dueAt ya descuenta las pausas anteriores. Sin vencimiento nunca está fuera.
export const isLate = (i: Incident) => !!i.dueAt && +new Date(i.resolvedAt ?? i.pausedAt ?? Date.now()) > +new Date(i.dueAt)
// El reloj de resolución está detenido (estado de pausa, todavía sin resolver).
export const isPaused = (i: Incident) => !!i.pausedAt && !i.resolvedAt
// SLA de primera respuesta: la pausa no lo afecta.
export const isResponseLate = (i: Incident) => !!i.responseDueAt && +new Date(i.firstResponseAt ?? Date.now()) > +new Date(i.responseDueAt)

const slaStyle = (late: boolean) =>
  ({ display: 'inline-flex', gap: 4, alignItems: 'center', whiteSpace: 'nowrap', color: late ? 'var(--danger-fg)' : undefined }) as const

export function Sla({ i }: { i: Incident }) {
  if (!i.dueAt) return <span className="tx-subtle">—</span>
  const late = isLate(i)
  const paused = isPaused(i)
  // En pausa, lo que queda (o lo que se pasó) se mide en el momento en que se detuvo el reloj.
  const left = +new Date(i.dueAt) - +new Date(paused ? i.pausedAt! : Date.now())
  const text = i.resolvedAt
    ? late
      ? 'Fuera de SLA'
      : 'En SLA'
    : paused
      ? late
        ? 'Vencido · en pausa'
        : `En pausa · quedan ${dur(left)}`
      : late
        ? `Vencido hace ${dur(left)}`
        : `Vence en ${dur(left)}`
  return (
    <span className="tx-caption" style={slaStyle(late)}>
      {late ? <Ic n="warn" /> : paused && <Ic n="pause" />}
      {text}
    </span>
  )
}

// Estado de la primera respuesta: en curso, vencida, cumplida o, si se resolvió sin responder, no cumplida.
export function FirstResponse({ i }: { i: Incident }) {
  if (!i.responseDueAt) return <span className="tx-subtle">—</span>
  const late = isResponseLate(i)
  const due = +new Date(i.responseDueAt)
  const text = i.firstResponseAt
    ? `${late ? 'Vencida · respondida' : 'Cumplida'} en ${dur(+new Date(i.firstResponseAt) - +new Date(i.createdAt))}`
    : i.resolvedAt
      ? 'No cumplida' // resuelto o cerrado sin respuesta: el texto queda fijo (no sigue contando "hace X")
      : late
        ? `Vencida hace ${dur(Date.now() - due)}`
        : `En curso · vence en ${dur(due - Date.now())}`
  return (
    <span className="tx-caption" style={slaStyle(late)}>
      {late && <Ic n="warn" />}
      {text}
    </span>
  )
}

export const PauseBadge = () => (
  <span className="tx-badge conocido">
    SLA en pausa
  </span>
)

// Link al detalle de un incidente (sin acceso a la sección, el número queda como texto).
export const IncidentId = ({ id, go }: { id: number; go?: (id: number) => void }) =>
  go ? (
    <A className="tx-id" aria-label={`Abrir el incidente ${id}`} onClick={() => go(id)}>
      #{id}
    </A>
  ) : (
    <span className="tx-strong">#{id}</span>
  )

// Modal sobre <dialog> nativo (foco atrapado y Esc incluidos). El contenido va dentro de un form.
export function Dialog(props: {
  title: string
  sub?: string
  onClose: () => void
  onSubmit?: (form: HTMLFormElement) => void
  footer?: ReactNode
  children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    if (!ref.current?.open) ref.current?.showModal()
  }, [])
  return (
    <dialog ref={ref} className="tx-dialog" aria-labelledby="dlg-t" onClose={props.onClose}>
      <form
        className="tx-modal tx-glass-strong"
        style={{ width: '100%' }}
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          props.onSubmit?.(e.currentTarget)
        }}
      >
        <div className="hd">
          <div>
            <h2 className="tx-h2" id="dlg-t">
              {props.title}
            </h2>
            {props.sub && (
              <p className="tx-muted" style={{ fontSize: 13 }}>
                {props.sub}
              </p>
            )}
          </div>
          <button type="button" className="tx-btn ghost icon sm" aria-label="Cerrar" onClick={props.onClose}>
            <Ic n="x" />
          </button>
        </div>
        {props.children}
        {props.footer && <div className="ft">{props.footer}</div>}
      </form>
    </dialog>
  )
}
