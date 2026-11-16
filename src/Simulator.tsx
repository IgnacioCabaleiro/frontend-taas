// Simulador de SLA: ¿qué hubiera pasado en el período con otros plazos? Recalcula sobre los incidentes reales,
// respetando lo que cada uno estuvo en pausa. Los plazos de cualquier versión anterior de la configuración
// se pueden cargar como punto de partida.
import { useState } from 'react'
import { api, type Priority, type SimResult, type SimStat, type State } from './api'
import { FieldError, Ic, IncidentId, Prio, can, count, type Run } from './ui'

const PRIOS: Priority[] = ['alta', 'media', 'baja']
type Hours = Record<Priority, number>
const copy = (h: Record<string, number>): Hours => ({ alta: h.alta, media: h.media, baja: h.baja })
const ok = (s: SimStat, late: number) => (s.measured ? Math.round(((s.measured - late) * 100) / s.measured) : null)

function Delta({ s }: { s: SimStat }) {
  const real = ok(s, s.late)
  const sim = ok(s, s.simLate)
  if (real === null || sim === null) return <span className="tx-subtle">—</span>
  const d = sim - real
  return (
    <span className="sim-delta">
      <span>{real}%</span>
      <Ic n="chevron" />
      <b>{sim}%</b>
      {d !== 0 && <em className={d > 0 ? 'up' : 'down'}>{d > 0 ? `+${d}` : d}</em>}
    </span>
  )
}

export function SlaSimulator({ state, run, days, goIncident }: { state: State; run: Run; days: number; goIncident?: (id: number) => void }) {
  const [sla, setSla] = useState<Hours>(() => copy(state.config.slaHours))
  const [resp, setResp] = useState<Hours>(() => copy(state.config.responseHours))
  const [result, setResult] = useState<SimResult | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState('')
  const versions = [...state.configVersions].reverse()

  const simulate = async (s = sla, r = resp) => {
    setBusy(true)
    setError('')
    setSaved('')
    try {
      setResult(await api.simulateSla({ days, slaHours: s, responseHours: r }))
    } catch (e) {
      setError((e as Error).message)
    }
    setBusy(false)
  }
  const field = (h: Hours, set: (h: Hours) => void, p: Priority, label: string) => (
    <input
      className="tx-input sim-num"
      type="number"
      min={1}
      value={h[p] || ''}
      aria-label={`${label} de prioridad ${p}, en horas`}
      onChange={(e) => set({ ...h, [p]: Math.max(0, Math.floor(Number(e.target.value)) || 0) })}
    />
  )

  return (
    <section className="tx-panel tx-solid" aria-labelledby="sim-h">
      <div className="tx-panel-head">
        <div>
          <h2 className="tx-h3" id="sim-h">
            Simulador de SLA
          </h2>
          <p className="tx-caption">
            Probá otros plazos sobre los incidentes reales de los últimos {days} días antes de cambiarlos. Lo que estuvo en pausa se sigue descontando.
          </p>
        </div>
        {versions.length > 1 && (
          <select
            className="tx-input"
            style={{ width: 'auto' }}
            aria-label="Cargar los plazos de una versión de la configuración"
            value=""
            onChange={(e) => {
              const v = versions.find((x) => x.id === Number(e.target.value))
              if (!v) return
              const s = copy(v.config.slaHours)
              const r = copy(v.config.responseHours ?? v.config.slaHours)
              setSla(s)
              setResp(r)
              simulate(s, r)
            }}
          >
            <option value="">Plazos de otra versión…</option>
            {versions.map((v) => (
              <option key={v.id} value={v.id}>
                Versión {v.id}
                {v.id === versions[0].id ? ' (vigente)' : ''}
              </option>
            ))}
          </select>
        )}
      </div>

      <div className="sim-grid" role="group" aria-label="Plazos a simular, en horas">
        <span />
        {PRIOS.map((p) => (
          <span key={p}>
            <Prio p={p} />
          </span>
        ))}
        <span className="tx-label">Resolución</span>
        {PRIOS.map((p) => (
          <span key={p}>{field(sla, setSla, p, 'Resolución')}</span>
        ))}
        <span className="tx-label">Primera respuesta</span>
        {PRIOS.map((p) => (
          <span key={p}>{field(resp, setResp, p, 'Primera respuesta')}</span>
        ))}
      </div>
      <div className="tx-actions">
        <button type="button" className="tx-btn primary" disabled={busy} onClick={() => simulate()}>
          <Ic n="play" />
          Simular
        </button>
        <button
          type="button"
          className="tx-btn ghost"
          onClick={() => {
            setSla(copy(state.config.slaHours))
            setResp(copy(state.config.responseHours))
            setResult(null)
          }}
        >
          Volver a los plazos actuales
        </button>
      </div>
      {error && <FieldError id="sim-e">{error}</FieldError>}

      {result && (
        <>
          <table className="tx-table">
            <thead>
              <tr>
                <th>Prioridad</th>
                <th className="num">Resolución en plazo (real → simulado)</th>
                <th className="num">Primera respuesta en plazo</th>
              </tr>
            </thead>
            <tbody>
              {[...result.rows, result.total].map((r) => (
                <tr key={r.priority} className={r.priority === 'total' ? 'sim-total' : ''}>
                  <td className="t-title">{r.priority === 'total' ? 'Total' : <Prio p={r.priority as Priority} />}</td>
                  <td className="num" data-label="Resolución">
                    <Delta s={r.resolution} />
                  </td>
                  <td className="num" data-label="Primera respuesta">
                    <Delta s={r.response} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {result.changes.length === 0 ? (
            <div className="tx-inline-empty">Con estos plazos ningún incidente cambia de lado.</div>
          ) : (
            <div className="tx-stack" style={{ gap: 6 }}>
              <span className="tx-overline">{count(result.changes.length, 'incidente cambia', 'incidentes cambian')} de lado</span>
              {result.changes.slice(0, 8).map((c) => (
                <div key={`${c.id}-${c.kind}`} className="kn-inc">
                  <IncidentId id={c.id} go={goIncident} />
                  <span className="t">{c.title}</span>
                  <span className={`tx-badge ${c.wasLate ? 'resuelto' : 'conocido'}`}>
                    {c.kind === 'resolucion' ? 'Resolución' : 'Respuesta'}: {c.wasLate ? 'entraría en plazo' : 'quedaría fuera'}
                  </span>
                </div>
              ))}
            </div>
          )}
          {can(state, 'config') && (
            <div className="tx-actions">
              <button
                type="button"
                className="tx-btn secondary"
                disabled={busy}
                onClick={async () => {
                  setError('')
                  const s = await run(api.setConfig({ ...state.config, slaHours: sla, responseHours: resp }), { onError: setError })
                  if (s) setSaved(`Guardados como versión ${s.configVersions.length}. Se aplican a los incidentes que se registren desde ahora.`)
                }}
              >
                <Ic n="check" />
                Usar estos plazos
              </button>
              {saved && <span className="tx-caption">{saved}</span>}
            </div>
          )}
        </>
      )}
    </section>
  )
}
