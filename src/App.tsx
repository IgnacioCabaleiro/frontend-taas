import { useEffect, useState } from 'react'
import { api, session, type Perm, type State } from './api'
import { A, Ic, can, initials, type Run } from './ui'
import { Auth } from './Auth'
import { Onboarding } from './Onboarding'
import { Dashboard } from './Dashboard'
import { Board, NewProblemModal, ProblemDetail } from './Problems'
import { Incidents } from './Incidents'
import { KnownErrors } from './KnownErrors'
import { Settings } from './Settings'
import { SKELETON } from './Skeletons'

const TABS = {
  panel: { nav: 'Panel', icon: 'chart', title: 'Panel', sub: 'Qué está pasando: volumen, tiempos y dónde se concentran los incidentes.' },
  problemas: { nav: 'Problemas', icon: 'target', title: 'Problemas', sub: 'Detectá incidentes recurrentes, investigá la causa y cerrá todo junto.' },
  incidentes: { nav: 'Incidentes', icon: 'alert', title: 'Incidentes', sub: 'Registrá lo que está pasando y seguí cada ticket hasta que se resuelve.' },
  kedb: { nav: 'Errores conocidos', icon: 'book', title: 'Errores conocidos', sub: 'La base de conocimiento del equipo: causas raíz, workarounds y soluciones.' },
  config: { nav: 'Configuración', icon: 'gear', title: 'Configuración', sub: 'Adaptá la ticketera a tu empresa y decidí qué puede hacer cada persona.' },
} as const
export type Tab = keyof typeof TABS

// Qué secciones ve cada usuario: según los permisos de su rol y los módulos activos de la cuenta.
function allowedTabs(s: State): Tab[] {
  const p = (perm: Perm) => can(s, perm)
  const problems = s.config.modules.problems
  const tabs: [Tab, boolean][] = [
    ['panel', p('panel')],
    ['problemas', problems && p('problemas')],
    ['incidentes', p('crear') || p('resolver')],
    ['kedb', problems && (p('resolver') || p('problemas'))],
    ['config', p('config')],
  ]
  return tabs.filter(([, ok]) => ok).map(([t]) => t)
}

const storedTheme = () => {
  try {
    return localStorage.getItem('theme')
  } catch {
    return null
  }
}

export default function App() {
  const [logged, setLogged] = useState(session.active())
  const [state, setState] = useState<State | null>(null)
  const [tab, setTab] = useState<Tab>('panel')
  const [openId, setOpenId] = useState(0)
  const [modal, setModal] = useState(false)
  const [error, setError] = useState<{ message: string; offline: boolean } | null>(null)
  const [theme, setTheme] = useState(() => storedTheme() ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'))

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try {
      localStorage.setItem('theme', theme)
    } catch {
      // sin storage: el tema dura lo que dure la pestaña
    }
  }, [theme])

  const leave = () => {
    session.set('')
    setLogged(false)
    setState(null)
    setError(null)
    setOpenId(0)
  }
  const run: Run = async (p) => {
    try {
      const s = await p
      setState(s)
      setError(null)
      return s
    } catch (e) {
      if ('expired' in (e as object)) leave() // la sesión venció o el servidor se reinició
      else setError({ message: (e as Error).message, offline: 'offline' in (e as object) })
      return null
    }
  }
  // ponytail: demora mínima solo para que el skeleton se vea en la demo (el backend local responde en ms). Borrar con backend real.
  const load = () => run(Promise.all([api.state(), new Promise((r) => setTimeout(r, 600))]).then(([s]) => s))
  useEffect(() => {
    if (logged) load()
  }, [logged])

  if (!logged) return <Auth onEnter={() => setLogged(true)} />
  if (state && !state.onboarded && can(state, 'config'))
    return <Onboarding state={state} run={run} onDone={(createdTicket) => setTab(createdTicket ? 'incidentes' : 'panel')} />

  const tabs = state ? allowedTabs(state) : []
  const current = !state || tabs.includes(tab) ? tab : (tabs[0] ?? 'incidentes')
  const go = (t: Tab, problemId = 0) => {
    setTab(t)
    setOpenId(problemId)
  }
  const me = state?.users.find((u) => u.id === state.me)
  const open = current === 'problemas' ? state?.problems.find((p) => p.id === openId) : undefined
  const counts: Partial<Record<Tab, number>> = state
    ? {
        problemas: state.problems.filter((p) => p.status !== 'resuelto').length,
        incidentes: state.incidents.filter((i) => !i.resolvedAt).length,
        kedb: state.problems.length,
      }
    : {}
  const T = TABS[current]
  const Skeleton = SKELETON[current]

  return (
    <div className="tx-canvas">
      <div className="tx-app">
        <aside className="tx-side tx-glass" aria-label="Navegación principal">
          <div className="tx-brand" style={{ paddingBottom: 6 }}>
            <b>TaaS</b>
            <span>· Ticketera configurable</span>
          </div>
          <div style={{ padding: '0 10px 16px' }}>
            <div className="tx-strong">{state?.name ?? ' '}</div>
            <div className="tx-caption">{state?.industry || ' '}</div>
          </div>
          <nav className="tx-nav">
            {tabs.map((t) => (
              <A key={t} className="tx-nav-item" aria-current={t === current ? 'page' : undefined} aria-label={TABS[t].nav} onClick={() => go(t)}>
                <Ic n={TABS[t].icon} />
                <span className="lbl">{TABS[t].nav}</span>
                {counts[t] !== undefined && <span className="tx-count">{counts[t]}</span>}
              </A>
            ))}
          </nav>
          <div className="tx-side-foot">
            <span className="tx-avatar">{me ? initials(me.name) : ''}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="tx-strong" style={{ fontSize: 13, lineHeight: '18px' }}>
                {me?.name}
              </div>
              <div className="tx-caption">{state?.roles.find((r) => r.id === me?.roleId)?.name}</div>
            </div>
            <button
              className="tx-btn ghost icon sm"
              aria-label={`Cambiar a modo ${theme === 'dark' ? 'claro' : 'oscuro'}`}
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            >
              <Ic n={theme === 'dark' ? 'sun' : 'moon'} />
            </button>
            <button
              className="tx-btn ghost icon sm"
              aria-label="Cerrar sesión"
              onClick={() => {
                api.logout().catch(() => {})
                leave()
              }}
            >
              <Ic n="logout" />
            </button>
          </div>
        </aside>

        <main className="tx-main" aria-busy={!state && !error}>
          {!open && (
            <header className="tx-top">
              <div>
                <h1 className="tx-h1">{T.title}</h1>
                <p>{T.sub}</p>
              </div>
              <div className="tx-row">
                {current === 'problemas' && (
                  <button className="tx-btn ghost" disabled={!state} onClick={() => setModal(true)}>
                    <Ic n="edit" />
                    Registrar un problema manualmente
                  </button>
                )}
              </div>
            </header>
          )}

          {error && state && (
            <div className="tx-banner" role="status">
              <Ic n={error.offline ? 'offline' : 'warn'} />
              <span className="grow">{error.message}</span>
              {error.offline ? (
                <button className="tx-btn ghost sm" onClick={() => run(api.state())}>
                  <Ic n="retry" />
                  Reintentar
                </button>
              ) : (
                <button className="tx-btn ghost icon sm" aria-label="Cerrar aviso" onClick={() => setError(null)}>
                  <Ic n="x" />
                </button>
              )}
            </div>
          )}

          {!state && error && (
            <section className="tx-glass" style={{ borderRadius: 'var(--radius-xl)' }}>
              <div className="tx-empty error" role="alert">
                <div className="tx-empty-ic tx-glass-strong">
                  <Ic n="offline" size="xl" />
                </div>
                <h2 className="tx-h2">No pudimos conectar con el servidor</h2>
                <p>Revisá que el backend esté corriendo en localhost:8080 y volvé a intentar.</p>
                <div className="tx-actions">
                  <button className="tx-btn primary" onClick={load}>
                    <Ic n="retry" />
                    Reintentar ahora
                  </button>
                </div>
              </div>
            </section>
          )}

          {!state && !error && <Skeleton />}

          {state && !state.onboarded && (
            <div className="tx-inline-empty">El titular de la cuenta todavía está configurando la ticketera. Volvé a entrar en un rato.</div>
          )}
          {state && tabs.length === 0 && state.onboarded && (
            <div className="tx-inline-empty">Tu rol no tiene secciones habilitadas. Pedile acceso al titular de la cuenta.</div>
          )}
          {state && state.onboarded && tabs.includes(current) && (
            <>
              {current === 'panel' && <Dashboard state={state} openProblem={(id) => go('problemas', id)} />}
              {current === 'problemas' && open && <ProblemDetail p={open} state={state} run={run} back={() => setOpenId(0)} />}
              {current === 'problemas' && !open && <Board state={state} run={run} open={setOpenId} />}
              {current === 'incidentes' && <Incidents state={state} run={run} goProblem={(id) => go('problemas', id)} />}
              {current === 'kedb' && <KnownErrors state={state} goProblem={(id) => go('problemas', id)} goIncidents={() => go('incidentes')} />}
              {current === 'config' && <Settings key={state.id} state={state} run={run} />}
            </>
          )}
        </main>
      </div>

      {modal && state && (
        <NewProblemModal services={state.config.services} run={run} onClose={() => setModal(false)} onCreated={(id) => go('problemas', id)} />
      )}
    </div>
  )
}
