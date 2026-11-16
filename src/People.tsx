// Personas de la cuenta: se suman por invitación (el titular no inventa contraseñas ajenas) y se les asigna un rol.
import { useState } from 'react'
import { api, type Perm, type State } from './api'
import { Check, Dialog, FieldError, Ic, count, fields, initials, type Run } from './ui'

const PERMS: [Perm, string][] = [
  ['panel', 'Ver el panel'],
  ['crear', 'Crear tickets'],
  ['resolver', 'Resolver tickets'],
  ['problemas', 'Gestionar problemas'],
  ['config', 'Configurar la cuenta'],
]

export const inviteUrl = (token: string) => `${location.origin}${location.pathname}#/invitacion/${token}`

// Invitación pendiente: el link se copia y se le pasa a la persona por donde quieras (no mandamos emails).
export function InviteLink({ token }: { token: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="tx-row invite" style={{ gap: 6 }}>
      <span className="tx-badge abierto">Invitación pendiente</span>
      <button
        type="button"
        className="tx-btn ghost sm"
        onClick={async () => {
          await navigator.clipboard?.writeText(inviteUrl(token))
          setCopied(true)
        }}
      >
        <Ic n={copied ? 'check' : 'copy'} />
        {copied ? 'Link copiado' : 'Copiar link'}
      </button>
    </div>
  )
}

// Usuarios y roles: se guardan al instante, sin pasar por "Guardar configuración".
export function People({ state, run }: { state: State; run: Run }) {
  const { users, roles } = state
  const created = users.length - 1 // sin contar al titular
  const full = created >= state.maxUsers
  const toggle = (roleId: number, perm: Perm, on: boolean) => {
    const r = roles.find((x) => x.id === roleId)!
    run(api.saveRole(r.id, { name: r.name, perms: on ? [...r.perms, perm] : r.perms.filter((p) => p !== perm) }))
  }
  // Borrar pide confirmación y cuenta qué pasa con lo que esa persona o ese rol tenía.
  const [confirm, setConfirm] = useState<{ kind: 'user' | 'role'; id: number } | null>(null)
  const [confirmError, setConfirmError] = useState('')
  const target = confirm?.kind === 'user' ? users.find((u) => u.id === confirm.id) : roles.find((r) => r.id === confirm?.id)
  const assigned = confirm?.kind === 'user' ? state.incidents.filter((i) => i.assigneeId === confirm.id && !i.resolvedAt).length : 0

  return (
    <>
      <section className="tx-panel tx-solid">
        <div className="tx-panel-head">
          <div>
            <h2 className="tx-h3">Usuarios</h2>
            <p className="tx-caption">Tu plan incluye hasta {state.maxUsers} usuarios además del titular. Les mandás un link y cada uno elige su contraseña.</p>
          </div>
          <span className="tx-chip">
            {created} de {state.maxUsers}
          </span>
        </div>
        <div>
          {users.map((u) => (
            <div key={u.id} className="cfg-line cfg-user">
              <span className="tx-avatar">{initials(u.name)}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="tx-strong">
                  {u.name} {u.id === state.ownerId && <span className="tx-caption">· Titular</span>}
                </div>
                <div className="tx-caption">{u.email}</div>
                {u.invite && <InviteLink token={u.invite} />}
              </div>
              <select
                className="tx-input"
                style={{ flex: '0 0 180px' }}
                aria-label={`Rol de ${u.name}`}
                value={u.roleId}
                disabled={u.id === state.ownerId}
                onChange={(e) => run(api.setUserRole(u.id, Number(e.target.value)))}
              >
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="tx-btn ghost icon sm"
                aria-label={`Eliminar a ${u.name}`}
                disabled={u.id === state.ownerId || u.id === state.me}
                onClick={() => {
                  setConfirmError('')
                  setConfirm({ kind: 'user', id: u.id })
                }}
              >
                <Ic n="trash" />
              </button>
            </div>
          ))}
        </div>
        {full ? (
          <div className="tx-inline-empty">Llegaste al límite de {state.maxUsers} usuarios. Eliminá uno para sumar a otra persona.</div>
        ) : (
          <form
            className="cfg-newuser"
            aria-label="Invitar a una persona"
            onSubmit={async (e) => {
              e.preventDefault()
              const form = e.currentTarget
              const f = fields(form)
              if (await run(api.invite({ name: f.name, email: f.email, roleId: Number(f.roleId) }))) form.reset()
            }}
          >
            <input name="name" className="tx-input" placeholder="Nombre y apellido" aria-label="Nombre y apellido" autoComplete="off" required />
            <input name="email" type="email" className="tx-input" placeholder="Email" aria-label="Email" autoComplete="off" required />
            <select name="roleId" className="tx-input" aria-label="Rol" defaultValue={roles.find((r) => !r.locked)?.id}>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
            <button className="tx-btn secondary">
              <Ic n="plus" />
              Invitar
            </button>
          </form>
        )}
      </section>

      <section className="tx-panel tx-solid">
        <div>
          <h2 className="tx-h3">Roles y permisos</h2>
          <p className="tx-caption">Armá los roles que necesites y marcá qué puede ver y hacer cada uno. Después asignalos arriba, en Usuarios.</p>
        </div>
        <div className="tx-table-wrap" style={{ overflowX: 'auto' }}>
          <table className="tx-table">
            <thead>
              <tr>
                <th>Rol</th>
                {PERMS.map(([, label]) => (
                  <th key={label} style={{ textAlign: 'center', whiteSpace: 'normal' }}>
                    {label}
                  </th>
                ))}
                <th />
              </tr>
            </thead>
            <tbody>
              {roles.map((r) => (
                <tr key={r.id}>
                  <td className="t-title">
                    {r.name}
                    <div className="tx-caption">
                      {r.locked ? 'Rol del titular' : count(users.filter((u) => u.roleId === r.id).length, 'usuario')}
                    </div>
                  </td>
                  {PERMS.map(([perm, label]) => (
                    <td key={perm} data-label={label} style={{ textAlign: 'center' }}>
                      <Check
                        checked={r.perms.includes(perm)}
                        disabled={r.locked}
                        onChange={(on) => toggle(r.id, perm, on)}
                        label={`${r.name}: ${label}`}
                        hideLabel
                      />
                    </td>
                  ))}
                  <td style={{ textAlign: 'right' }}>
                    <button
                      type="button"
                      className="tx-btn ghost icon sm"
                      aria-label={`Eliminar el rol ${r.name}`}
                      disabled={r.locked}
                      onClick={() => {
                        setConfirmError('')
                        setConfirm({ kind: 'role', id: r.id })
                      }}
                    >
                      <Ic n="trash" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <form
          className="cfg-line"
          aria-label="Crear rol"
          onSubmit={async (e) => {
            e.preventDefault()
            const form = e.currentTarget
            if (await run(api.saveRole(0, { name: fields(form).name, perms: ['crear'] }))) form.reset()
          }}
        >
          <input name="name" className="tx-input" style={{ maxWidth: 320 }} placeholder="Nombre del rol nuevo. Ej.: Gerencia" aria-label="Nombre del rol nuevo" required />
          <button className="tx-btn secondary">
            <Ic n="plus" />
            Crear rol
          </button>
        </form>
      </section>
      {confirm && target && (
        <Dialog
          title={confirm.kind === 'user' ? `¿Eliminar a ${target.name}?` : `¿Eliminar el rol ${target.name}?`}
          onClose={() => setConfirm(null)}
          footer={
            <>
              <button type="button" className="tx-btn ghost" onClick={() => setConfirm(null)}>
                Cancelar
              </button>
              <button
                type="button"
                className="tx-btn primary"
                onClick={async () => {
                  const s = await run(confirm.kind === 'user' ? api.deleteUser(confirm.id) : api.deleteRole(confirm.id), { onError: setConfirmError })
                  if (s) setConfirm(null)
                }}
              >
                <Ic n="trash" />
                Eliminar
              </button>
            </>
          }
        >
          <p>
            {confirm.kind === 'user'
              ? assigned
                ? `Pierde el acceso en el momento. ${count(assigned, 'incidente abierto queda', 'incidentes abiertos quedan')} sin asignar.`
                : 'Pierde el acceso en el momento. Sus tickets y su historial se conservan.'
              : 'Los permisos de este rol dejan de existir. Si alguien lo tiene asignado, primero cambiale el rol.'}
          </p>
          {confirmError && <FieldError id="confirm-e">{confirmError}</FieldError>}
        </Dialog>
      )}
    </>
  )
}
