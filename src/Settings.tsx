// Configuración de la cuenta: la ticketera a medida de la empresa, y quién puede hacer qué.
import { useState } from 'react'
import { api, type Config, type Field, type Perm, type Priority, type State } from './api'
import { Ic, Prio, fields, initials, type Run } from './ui'

const PRIOS: Priority[] = ['alta', 'media', 'baja']
const PERMS: [Perm, string][] = [
  ['panel', 'Ver el panel'],
  ['crear', 'Crear tickets'],
  ['resolver', 'Resolver tickets'],
  ['problemas', 'Gestionar problemas'],
  ['config', 'Configurar la cuenta'],
]
const clone = (c: Config): Config => JSON.parse(JSON.stringify(c))
const int = (s: string) => Math.max(0, Math.floor(Number(s)) || 0)

function Check(props: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string; hideLabel?: boolean }) {
  return (
    <label className={`tx-check ${props.checked ? 'is-on' : ''}`} style={props.disabled ? { opacity: 0.6, cursor: 'not-allowed' } : undefined}>
      <input
        type="checkbox"
        checked={props.checked}
        disabled={props.disabled}
        aria-label={props.hideLabel ? props.label : undefined}
        onChange={(e) => props.onChange(e.target.checked)}
      />
      <span className="box">{props.checked && <Ic n="check" />}</span>
      {!props.hideLabel && props.label}
    </label>
  )
}

// Lista editable de textos (servicios, estados).
export function ListEditor(props: { items: string[]; onChange: (v: string[]) => void; label: string; add: string; min: number }) {
  const { items, onChange } = props
  return (
    <div className="tx-stack" style={{ gap: 8 }}>
      {items.map((s, i) => (
        <div key={i} className="cfg-line">
          <span className="tx-count">{i + 1}</span>
          <input
            className="tx-input"
            aria-label={`${props.label} ${i + 1}`}
            value={s}
            onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))}
          />
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
  const [c, setC] = useState(() => clone(state.config))
  const dirty = JSON.stringify(c) !== JSON.stringify(state.config)
  const set = (patch: Partial<Config>) => setC({ ...c, ...patch })
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
            <p className="tx-caption">El flujo de tu equipo, en orden. El primero es el inicial y el último, el de cierre.</p>
          </div>
          <ListEditor items={c.states} onChange={(states) => set({ states })} label="Estado" add="Agregar estado" min={2} />
        </section>
      </div>

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
              <input
                className="tx-input"
                aria-label="Opciones, separadas por coma"
                placeholder="Opciones separadas por coma"
                value={f.options.join(', ')}
                onChange={(e) => setField(i, { options: e.target.value.split(',').map((o) => o.trimStart()) })}
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
                <p className="tx-caption">Horas para resolver un ticket según su prioridad. Se aplica a los tickets nuevos.</p>
              </div>
              {PRIOS.map((p) => (
                <label key={p} className="cfg-line">
                  <span style={{ width: 90 }}>
                    <Prio p={p} />
                  </span>
                  <input
                    className="tx-input cfg-num"
                    type="number"
                    min={1}
                    aria-label={`Horas de SLA para prioridad ${p}`}
                    value={c.slaHours[p] || ''}
                    onChange={(e) => set({ slaHours: { ...c.slaHours, [p]: int(e.target.value) } })}
                  />
                  <span className="tx-muted">horas</span>
                </label>
              ))}
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
                  value={c.recurrenceMin || ''}
                  onChange={(e) => set({ recurrenceMin: int(e.target.value) })}
                />
                incidentes del mismo servicio en
                <input
                  className="tx-input cfg-num"
                  type="number"
                  min={1}
                  aria-label="Ventana en días"
                  value={c.recurrenceDays || ''}
                  onChange={(e) => set({ recurrenceDays: int(e.target.value) })}
                />
                días.
              </div>
            </section>
          )}
        </div>
      )}

      {dirty && (
        <div className="cfg-save tx-glass-strong" role="status">
          <span className="tx-strong" style={{ flex: 1 }}>
            Tenés cambios sin guardar en tu ticketera
          </span>
          <button type="button" className="tx-btn ghost" onClick={() => setC(clone(state.config))}>
            Descartar
          </button>
          <button
            type="button"
            className="tx-btn primary"
            onClick={async () => {
              const s = await run(api.setConfig(c))
              if (s) setC(clone(s.config))
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

// Usuarios y roles: se guardan al instante, sin pasar por "Guardar configuración".
function People({ state, run }: { state: State; run: Run }) {
  const { users, roles } = state
  const created = users.length - 1 // sin contar al titular
  const full = created >= state.maxUsers
  const toggle = (roleId: number, perm: Perm, on: boolean) => {
    const r = roles.find((x) => x.id === roleId)!
    run(api.saveRole(r.id, { name: r.name, perms: on ? [...r.perms, perm] : r.perms.filter((p) => p !== perm) }))
  }

  return (
    <>
      <section className="tx-panel tx-solid">
        <div className="tx-panel-head">
          <div>
            <h2 className="tx-h3">Usuarios</h2>
            <p className="tx-caption">Tu plan incluye hasta {state.maxUsers} usuarios además del titular. Cada uno entra con su email y contraseña.</p>
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
                onClick={() => run(api.deleteUser(u.id))}
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
            aria-label="Crear usuario"
            onSubmit={async (e) => {
              e.preventDefault()
              const form = e.currentTarget
              const f = fields(form)
              if (await run(api.addUser({ name: f.name, email: f.email, password: f.password, roleId: Number(f.roleId) }))) form.reset()
            }}
          >
            <input name="name" className="tx-input" placeholder="Nombre y apellido" aria-label="Nombre y apellido" autoComplete="off" required />
            <input name="email" type="email" className="tx-input" placeholder="Email" aria-label="Email" autoComplete="off" required />
            <input
              name="password"
              type="password"
              className="tx-input"
              placeholder="Contraseña inicial (8 o más)"
              aria-label="Contraseña inicial, de 8 caracteres o más"
              autoComplete="new-password"
              minLength={8}
              required
            />
            <select name="roleId" className="tx-input" aria-label="Rol" defaultValue={roles.find((r) => !r.locked)?.id}>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
            <button className="tx-btn secondary">
              <Ic n="plus" />
              Crear usuario
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
                      {r.locked ? 'Rol del titular' : `${users.filter((u) => u.roleId === r.id).length} usuarios`}
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
                      onClick={() => run(api.deleteRole(r.id))}
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
    </>
  )
}
