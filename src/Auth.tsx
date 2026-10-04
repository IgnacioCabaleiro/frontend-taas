// Ingreso y alta de cuenta (la contratación).
import { useState } from 'react'
import { api, session } from './api'
import { FieldError, fields } from './ui'

export function Auth({ onEnter }: { onEnter: () => void }) {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  return (
    <div className="tx-canvas auth">
      <form
        className="tx-modal tx-glass-strong"
        onSubmit={async (e) => {
          e.preventDefault()
          const f = fields(e.currentTarget)
          setBusy(true)
          try {
            const res = mode === 'login' ? await api.login({ email: f.email, password: f.password }) : await api.signup(f as Parameters<typeof api.signup>[0])
            session.set(res.token)
            onEnter()
          } catch (err) {
            setError((err as Error).message)
            setBusy(false)
          }
        }}
      >
        <div>
          <div className="tx-brand" style={{ padding: 0 }}>
            <b>TaaS</b>
            <span>· Ticketera configurable</span>
          </div>
          <h1 className="tx-h2" style={{ marginTop: 12 }}>
            {mode === 'login' ? 'Ingresá a tu ticketera' : 'Creá la cuenta de tu empresa'}
          </h1>
          <p className="tx-muted" style={{ fontSize: 13 }}>
            {mode === 'login'
              ? 'Usá el email y la contraseña que te dio el titular de la cuenta.'
              : 'Vas a ser el titular: después configurás la ticketera y sumás hasta 5 usuarios.'}
          </p>
        </div>

        <div className="tx-seg" role="group" aria-label="Ingresar o crear cuenta">
          {(['login', 'signup'] as const).map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={m === mode}
              onClick={() => {
                setMode(m)
                setError('')
              }}
            >
              {m === 'login' ? 'Ingresar' : 'Crear cuenta'}
            </button>
          ))}
        </div>

        {mode === 'signup' && (
          <>
            <div className="tx-field">
              <label className="tx-label" htmlFor="a-c">
                Empresa
              </label>
              <input id="a-c" name="company" className="tx-input" autoComplete="organization" required />
            </div>
            <div className="tx-field">
              <label className="tx-label" htmlFor="a-n">
                Tu nombre
              </label>
              <input id="a-n" name="name" className="tx-input" autoComplete="name" required />
            </div>
          </>
        )}
        <div className="tx-field">
          <label className="tx-label" htmlFor="a-e">
            Email
          </label>
          <input id="a-e" name="email" type="email" className="tx-input" autoComplete="email" required />
        </div>
        <div className="tx-field">
          <label className="tx-label" htmlFor="a-p">
            Contraseña
          </label>
          <input
            id="a-p"
            name="password"
            type="password"
            className="tx-input"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            minLength={mode === 'signup' ? 8 : undefined}
            aria-describedby={mode === 'signup' ? 'a-p-h' : undefined}
            required
          />
          {mode === 'signup' && (
            <span className="tx-help" id="a-p-h">
              Al menos 8 caracteres.
            </span>
          )}
        </div>
        {error && <FieldError id="a-err">{error}</FieldError>}
        <button className="tx-btn primary lg" disabled={busy}>
          {mode === 'login' ? 'Ingresar' : 'Crear cuenta'}
        </button>
      </form>
    </div>
  )
}
