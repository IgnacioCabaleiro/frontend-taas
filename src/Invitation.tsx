// Aceptar una invitación: la persona ve a qué cuenta la sumaron y elige su contraseña.
import { useEffect, useState } from 'react'
import { api, session } from './api'
import { FieldError, Logo, fields } from './ui'

export const invitationToken = () => location.hash.match(/^#\/invitacion\/([0-9a-f]+)/)?.[1] ?? ''

export function Invitation({ token }: { token: string }) {
  const [inv, setInv] = useState<{ name: string; email: string; company: string } | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    api.invitation(token).then(setInv, (e: Error) => setError(e.message))
  }, [token])
  // Se recarga sin el link: la sesión nueva reemplaza a la que hubiera abierta en este navegador.
  const enter = () => location.replace(location.pathname)

  return (
    <div className="tx-canvas auth">
      <form
        className="tx-modal tx-glass-strong"
        onSubmit={async (e) => {
          e.preventDefault()
          setBusy(true)
          try {
            const res = await api.acceptInvite(token, fields(e.currentTarget).password)
            session.set(res.token)
            enter()
          } catch (err) {
            setError((err as Error).message)
            setBusy(false)
          }
        }}
      >
        <div>
          <div className="tx-brand auth-brand">
            <Logo size={30} />
            <b>TaaS</b>
          </div>
          <h1 className="tx-h2" style={{ marginTop: 12 }}>
            {inv ? `Hola, ${inv.name.split(' ')[0]}` : 'Invitación'}
          </h1>
          <p className="tx-muted" style={{ fontSize: 13 }}>
            {inv ? `Te sumaron a la ticketera de ${inv.company}. Elegí tu contraseña para entrar con ${inv.email}.` : error ? '' : 'Buscando tu invitación…'}
          </p>
        </div>
        {inv && (
          <div className="tx-field">
            <label className="tx-label" htmlFor="inv-p">
              Contraseña
            </label>
            <input id="inv-p" name="password" type="password" className="tx-input" autoComplete="new-password" minLength={8} aria-describedby="inv-p-h" required />
            <span className="tx-help" id="inv-p-h">
              Al menos 8 caracteres.
            </span>
          </div>
        )}
        {error && <FieldError id="inv-e">{error}</FieldError>}
        {inv ? (
          <button className="tx-btn primary lg" disabled={busy}>
            Entrar
          </button>
        ) : (
          error && (
            <button type="button" className="tx-btn secondary" onClick={enter}>
              Ir al ingreso
            </button>
          )
        )}
      </form>
    </div>
  )
}
