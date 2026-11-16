// Vista previa del onboarding: la ticketera como va quedando con cada respuesta.
import type { State, Template } from './api'
import { Ic, Prio, count, initials, num } from './ui'
import { PRIOS, WAITING, type Answers, type Hours } from './Onboarding'

const Sk = ({ w, h = 12 }: { w: number | string; h?: number }) => <span className="sk" style={{ width: w, height: h }} />

// Vista previa: la ticketera que se va armando con cada respuesta. Lo que todavía no se decidió se ve como skeleton.
export function Preview(props: {
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
    <aside className="onb-preview tx-solid" aria-label="Vista previa de tu ticketera">
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
