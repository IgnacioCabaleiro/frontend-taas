// ponytail: URL fija, es una demo local. Pasar a variable de entorno al desplegar.
const API = 'http://localhost:8080/api'

export type Status = 'identificado' | 'en_analisis' | 'error_conocido' | 'resuelto'
export type Priority = 'alta' | 'media' | 'baja'
export type Perm = 'panel' | 'crear' | 'resolver' | 'problemas' | 'config'
// Respuestas del onboarding: cómo trabaja el cliente (ver Setup en el backend).
export type Setup = { template: string; industry: string; services: string[]; team: boolean; sla: boolean; problems: boolean; fields: boolean }

export type Field = { key: string; label: string; type: 'text' | 'number' | 'select'; options: string[]; required: boolean }

// Lo que cada cliente configura a su medida.
export type Config = {
  modules: { sla: boolean; problems: boolean }
  services: string[]
  states: string[] // estados del incidente, en orden; el último es el de cierre
  slaHours: Record<Priority, number>
  fields: Field[]
  recurrenceMin: number
  recurrenceDays: number
}

export type Role = { id: number; name: string; perms: Perm[]; locked: boolean }
export type User = { id: number; name: string; email: string; roleId: number }

export type Incident = {
  id: number
  title: string
  description: string
  service: string
  priority: Priority
  status: string // uno de config.states
  fields: Record<string, string>
  createdBy: number
  assigneeId: number // 0 = sin asignar
  problemId: number // 0 = sin problema
  createdAt: string
  dueAt?: string // vencimiento del SLA, si el módulo está activo
  resolvedAt?: string
}

export type Problem = {
  id: number
  title: string
  description: string
  service: string
  status: Status
  ownerId: number
  rootCause: string
  workaround: string
  solution: string
  createdAt: string
  history: { at: string; kind: '' | 'analisis' | 'conocido' | 'resuelto' | 'comentario'; text: string; userId: number }[]
}

// La cuenta del cliente, tal como la ve el usuario logueado (el backend ya recorta según sus permisos).
export type State = {
  id: number
  name: string
  industry: string
  onboarded: boolean
  ownerId: number
  me: number
  maxUsers: number
  config: Config
  roles: Role[]
  users: User[]
  incidents: Incident[]
  problems: Problem[]
  suggestions: { service: string; incidentIds: number[] }[]
}

export type Template = { key: string; industry: string; config: Config }

// La sesión es un token que se guarda en el navegador; si el storage no está disponible, dura lo que la pestaña.
let token = ''
try {
  token = localStorage.getItem('token') ?? ''
} catch {
  // sin storage
}
export const session = {
  active: () => token !== '',
  set(t: string) {
    token = t
    try {
      if (t) localStorage.setItem('token', t)
      else localStorage.removeItem('token')
    } catch {
      // sin storage
    }
  },
}

async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const res = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).catch(() => {
    throw Object.assign(new Error('No pudimos conectar con el servidor.'), { offline: true })
  })
  const data = res.status === 204 ? null : await res.json().catch(() => null)
  if (!res.ok) throw Object.assign(new Error(data?.error ?? res.statusText), res.status === 401 ? { expired: true } : {})
  return data
}

// Toda llamada sobre la cuenta devuelve su estado completo actualizado.
const t = (path: string, body?: unknown, method = 'POST') => request<State>(path, body === undefined && method === 'POST' ? 'GET' : method, body)

export const api = {
  login: (b: { email: string; password: string }) => request<{ token: string }>('/login', 'POST', b),
  signup: (b: { company: string; name: string; email: string; password: string }) => request<{ token: string }>('/signup', 'POST', b),
  logout: () => request<null>('/logout', 'POST', {}),
  templates: () => request<Template[]>('/templates'),

  state: () => t('/state'),
  onboard: (setup: Setup) => t('/onboarding', setup),
  finishOnboarding: () => t('/onboarding/finish', {}),
  setConfig: (c: Config) => t('/config', c, 'PUT'),

  addUser: (u: { name: string; email: string; password: string; roleId: number }) => t('/users', u),
  setUserRole: (id: number, roleId: number) => t(`/users/${id}`, { roleId }, 'PUT'),
  deleteUser: (id: number) => t(`/users/${id}`, undefined, 'DELETE'),
  saveRole: (id: number, r: { name: string; perms: Perm[] }) => (id ? t(`/roles/${id}`, r, 'PUT') : t('/roles', r)),
  deleteRole: (id: number) => t(`/roles/${id}`, undefined, 'DELETE'),

  createIncident: (i: Record<string, unknown>) => t('/incidents', i),
  updateIncident: (id: number, patch: { status?: string; assigneeId?: number; problemId?: number }) => t(`/incidents/${id}`, patch),
  createProblem: (p: Record<string, unknown>) => t('/problems', p),
  advance: (id: number, data: Record<string, string>) => t(`/problems/${id}/advance`, data),
  setOwner: (id: number, ownerId: number) => t(`/problems/${id}/owner`, { ownerId }),
  comment: (id: number, text: string) => t(`/problems/${id}/comments`, { text }),
}
