import { useState } from 'react'
import { api, type ConfigVersion, type State } from './api'
import { Dialog, FieldError, Ic, count, fmt, userName, type Run } from './ui'

// Historial de la configuración: cada cambio guardado es una versión, y se puede volver a cualquiera.
export function Versions({ state, run, dirty, onRestored }: { state: State; run: Run; dirty: boolean; onRestored: (s: State) => void }) {
  const [target, setTarget] = useState<ConfigVersion | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const versions = [...state.configVersions].reverse()

  return (
    <section className="tx-panel tx-solid">
      <div className="tx-panel-head">
        <div>
          <h3 className="tx-h3">Historial de versiones</h3>
          <p className="tx-caption">Cada cambio guardado queda registrado. Si algo salió mal, volvé a una versión anterior: nada se borra.</p>
        </div>
        <span className="tx-chip">{count(versions.length, 'versión', 'versiones')}</span>
      </div>
      <ol className="cfg-versions">
        {versions.map((v, i) => (
          <li key={v.id} className="cfg-version">
            <span className={`cfg-version-n ${i === 0 ? 'current' : ''}`}>v{v.id}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="tx-row" style={{ gap: 8 }}>
                <span className="tx-strong">{fmt(v.at)}</span>
                <span className="tx-caption">{userName(state.users, v.userId, 'Usuario eliminado')}</span>
                {i === 0 && <span className="tx-badge resuelto">Vigente</span>}
                {v.restoredFrom > 0 && <span className="tx-badge abierto">Restaurada de v{v.restoredFrom}</span>}
              </div>
              <ul className="cfg-changes">
                {v.changes.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
            {i > 0 && (
              <button
                type="button"
                className="tx-btn secondary sm"
                disabled={dirty}
                title={dirty ? 'Guardá o descartá tus cambios primero' : undefined}
                onClick={() => {
                  setError('')
                  setTarget(v)
                }}
              >
                <Ic n="retry" />
                Volver a esta versión
              </button>
            )}
          </li>
        ))}
      </ol>
      {dirty && <p className="tx-caption">Guardá o descartá tus cambios para poder volver a una versión anterior.</p>}

      {target && (
        <Dialog
          title={`¿Volver a la versión ${target.id}?`}
          sub={`Es la configuración del ${fmt(target.at)}. Se guarda como versión ${state.configVersions.length + 1}, así podés deshacerlo.`}
          onClose={() => setTarget(null)}
          footer={
            <>
              <button type="button" className="tx-btn ghost" onClick={() => setTarget(null)}>
                Cancelar
              </button>
              <button
                type="button"
                className="tx-btn primary"
                disabled={busy}
                onClick={async () => {
                  setBusy(true)
                  const s = await run(api.restoreVersion(target.id), { onError: setError })
                  setBusy(false)
                  if (s) {
                    onRestored(s)
                    setTarget(null)
                  }
                }}
              >
                <Ic n="retry" />
                Volver a la versión {target.id}
              </button>
            </>
          }
        >
          <div className="tx-cols">
            <div className="tx-block">
              <span className="tx-overline">Servicios</span>
              <p>{target.config.services.join(' · ')}</p>
            </div>
            <div className="tx-block">
              <span className="tx-overline">Estados del ticket</span>
              <p>{target.config.states.join(' → ')}</p>
            </div>
          </div>
          <div className="tx-callout">
            <p className="tx-muted" style={{ fontSize: 13 }}>
              Tus tickets no se tocan, salvo los abiertos que estén en un estado que esa versión no tiene: vuelven al estado inicial y queda registrado en su
              historial. Los SLA nuevos se aplican a los tickets que se creen desde ahora.
            </p>
          </div>
          {error && <FieldError id="ver-e">{error}</FieldError>}
        </Dialog>
      )}
    </section>
  )
}
