// La URL de la API se fija al compilar (VITE_API_URL); sin definir, apunta al backend local.
const API: string = import.meta.env.VITE_API_URL ?? 'http://localhost:8080/api'

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
  states: string[] // estados del incidente, en orden; el último es el de resolución (el cierre es una etapa aparte)
  slaHours: Record<Priority, number> // horas para resolver
  responseHours: Record<Priority, number> // horas para la primera respuesta
  pauseStates: string[] // estados que detienen el reloj de resolución (nunca el primero ni el último)
  autoCloseDays: number // días sin actividad tras los que un incidente resuelto se cierra solo
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
  dueAt?: string // vencimiento de la resolución, si el módulo SLA está activo (ya descuenta las pausas)
  resolvedAt?: string
  history: IncidentEvent[]
  responseDueAt?: string // vencimiento de la primera respuesta: se fija al registrar y nunca se mueve
  firstResponseAt?: string
  pausedAt?: string // si está, el reloj de resolución está detenido desde ese momento
  resolutionCode: ResolutionCode | '' // '' si no está resuelto (o es un resuelto anterior a los códigos)
  resolutionNote: string
  reopenCount: number
  closedAt?: string
  autoCloseHold: boolean // el solicitante respondió estando resuelto: ya no se cierra solo
  relatedIncidentId: number // 0 = ninguno; si no, el incidente cerrado que este continúa
  attachments: Attachment[]
}

// Archivo adjunto de un incidente. Lo ve cualquiera que vea el incidente, también quien lo reportó.
export type Attachment = { id: string; name: string; size: number; contentType: string; uploadedBy: number; uploadedAt: string }
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024
export const MAX_ATTACHMENTS = 10
export const ATTACHMENT_EXTS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.pdf', '.txt', '.log', '.csv', '.zip']

export type ResolutionCode = 'solucionado' | 'workaround' | 'duplicado' | 'sin_reproducir' | 'cancelado'
// Historial del incidente (userId 0 = Sistema). Quien solo reporta no recibe las notas.
export type IncidentEvent = {
  at: string
  kind: 'creado' | 'estado' | 'asignado' | 'problema' | 'respuesta' | 'nota' | 'resuelto' | 'reabierto' | 'cerrado' | 'relacionado' | 'adjunto'
  text: string
  userId: number
}
export type IncidentPatch = { status?: string; assigneeId?: number; problemId?: number; resolutionCode?: ResolutionCode; resolutionNote?: string }
export type NewIncident = {
  title: string
  description?: string
  service: string
  priority: Priority
  fields: Record<string, string>
  assigneeId?: number
  problemId?: number
  relatedIncidentId?: number
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

// Métricas de SLA (GET /metrics/sla): sobre los incidentes creados en el período. Un porcentaje null = todavía no hay nada que medir.
export type SlaStat = { measured: number; late: number; compliance: number | null }
export type SlaGroup = {
  id: number // en el desglose por responsable, el usuario (0 = sin asignar)
  name: string
  incidents: number
  resolution: SlaStat
  response: SlaStat
  avgResolutionHours: number | null
  avgResponseHours: number | null
}
export type SlaRisk = { id: number; title: string; service: string; priority: Priority; assigneeId: number; kind: 'resolucion' | 'respuesta'; dueAt: string; late: boolean }
export type SlaMetrics = {
  days: number
  generatedAt: string
  total: SlaGroup
  byPriority: SlaGroup[]
  byService: SlaGroup[]
  byAssignee: SlaGroup[]
  trend: { from: string; to: string; incidents: number; resolution: SlaStat; response: SlaStat }[]
  atRisk: SlaRisk[]
}
export const SLA_PERIODS = [7, 30, 90] as const

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
    // Con FormData el navegador pone el Content-Type (con el boundary del multipart).
    headers: { ...(!(body instanceof FormData) && { 'Content-Type': 'application/json' }), ...(token && { Authorization: `Bearer ${token}` }) },
    body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
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
  slaMetrics: (days: number) => request<SlaMetrics>(`/metrics/sla?days=${days}`),
  onboard: (setup: Setup) => t('/onboarding', setup),
  finishOnboarding: () => t('/onboarding/finish', {}),
  setConfig: (c: Config) => t('/config', c, 'PUT'),

  addUser: (u: { name: string; email: string; password: string; roleId: number }) => t('/users', u),
  setUserRole: (id: number, roleId: number) => t(`/users/${id}`, { roleId }, 'PUT'),
  deleteUser: (id: number) => t(`/users/${id}`, undefined, 'DELETE'),
  saveRole: (id: number, r: { name: string; perms: Perm[] }) => (id ? t(`/roles/${id}`, r, 'PUT') : t('/roles', r)),
  deleteRole: (id: number) => t(`/roles/${id}`, undefined, 'DELETE'),

  createIncident: (i: NewIncident) => t('/incidents', i),
  updateIncident: (id: number, patch: IncidentPatch) => t(`/incidents/${id}`, patch),
  comment: (id: number, text: string, isPublic: boolean) => t(`/incidents/${id}/comments`, { text, public: isPublic }),
  reopen: (id: number, reason: string) => t(`/incidents/${id}/reopen`, { reason }),
  close: (id: number) => t(`/incidents/${id}/close`, {}),
  addAttachment: (id: number, file: File) => {
    const form = new FormData()
    form.append('file', file)
    return request<State>(`/incidents/${id}/attachments`, 'POST', form)
  },
  removeAttachment: (id: number, attachmentId: string) => t(`/incidents/${id}/attachments/${attachmentId}`, undefined, 'DELETE'),
  // La descarga pide el token en un header: no sirve un <a href>, así que se baja el archivo y se entrega como blob.
  async attachmentBlob(id: number, attachmentId: string): Promise<Blob> {
    const res = await fetch(`${API}/incidents/${id}/attachments/${attachmentId}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} }).catch(() => {
      throw Object.assign(new Error('No pudimos conectar con el servidor.'), { offline: true })
    })
    if (!res.ok) {
      const data = await res.json().catch(() => null)
      throw Object.assign(new Error(data?.error ?? res.statusText), res.status === 401 ? { expired: true } : {})
    }
    return res.blob()
  },
  createProblem: (p: Record<string, unknown>) => t('/problems', p),
  advance: (id: number, data: Record<string, string>) => t(`/problems/${id}/advance`, data),
  setOwner: (id: number, ownerId: number) => t(`/problems/${id}/owner`, { ownerId }),
  commentProblem: (id: number, text: string) => t(`/problems/${id}/comments`, { text }),
}
