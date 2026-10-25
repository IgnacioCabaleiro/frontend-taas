// Adjuntos de un incidente (capturas, logs, PDFs): lista, subida, descarga y baja.
// El archivo se baja con el token y se entrega como blob: un <a href> directo no puede mandar el header.
import { useState } from 'react'
import { api, ATTACHMENT_EXTS, MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS, type Attachment, type Incident, type State } from './api'
import { Ic, author, can, fmt, stage, type Run } from './ui'

export const fileSize = (n: number) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`)

// Devuelve por qué no se puede adjuntar el archivo, o '' si está bien. El servidor valida de nuevo.
export function fileProblem(f: File, already: number): string {
  const ext = f.name.slice(f.name.lastIndexOf('.')).toLowerCase()
  if (!ATTACHMENT_EXTS.includes(ext)) return `${f.name}: no se aceptan archivos «${ext === f.name ? 'sin extensión' : ext}». Usá ${ATTACHMENT_EXTS.join(' ')}.`
  if (f.size === 0) return `${f.name}: está vacío.`
  if (f.size > MAX_ATTACHMENT_BYTES) return `${f.name}: pesa ${fileSize(f.size)} y el máximo es ${fileSize(MAX_ATTACHMENT_BYTES)}.`
  if (already >= MAX_ATTACHMENTS) return `${f.name}: ya hay ${MAX_ATTACHMENTS} adjuntos, el máximo.`
  return ''
}

// Quién puede adjuntar: quien atiende el incidente, o quien lo reportó en los suyos; nunca en un cerrado.
export const canAttach = (i: Incident, state: State) =>
  stage(i) !== 'cerrado' && (can(state, 'resolver') || (can(state, 'crear') && i.createdBy === state.me))

const isImage = (a: Attachment) => a.contentType.startsWith('image/')

export function AttachmentsPanel({ i, state, run }: { i: Incident; state: State; run: Run }) {
  const [errors, setErrors] = useState<string[]>([])
  const [busy, setBusy] = useState('')
  const editable = canAttach(i, state)
  const canResolve = can(state, 'resolver')
  const list = i.attachments ?? []
  if (!editable && list.length === 0) return null

  const save = (blob: Blob, name: string) => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  }
  // Un error del archivo no tapa los demás: se juntan y se muestran debajo.
  const guard = async (key: string, job: () => Promise<unknown>) => {
    setBusy(key)
    try {
      await job()
    } catch (e) {
      if ('expired' in (e as object)) await run(Promise.reject(e))
      else setErrors((x) => [...x, (e as Error).message])
    }
    setBusy('')
  }

  return (
    <section className="tx-panel tx-solid" aria-labelledby="inc-att">
      <h2 className="tx-h3" id="inc-att">
        Adjuntos {list.length > 0 && <span className="tx-caption">({list.length})</span>}
      </h2>
      {list.length === 0 ? (
        <div className="tx-inline-empty">Todavía no hay archivos adjuntos.</div>
      ) : (
        <ul className="att-list">
          {list.map((a) => (
            <li key={a.id} className="att-item">
              <Ic n="clip" />
              <div className="nm">
                <b>{a.name}</b>
                <span>
                  {fileSize(a.size)} · {fmt(a.uploadedAt)} · {author(state.users, a.uploadedBy)}
                </span>
              </div>
              <div className="acts">
                {isImage(a) && (
                  <button
                    type="button"
                    className="tx-btn ghost sm"
                    disabled={busy !== ''}
                    onClick={() =>
                      guard(a.id, async () => {
                        const url = URL.createObjectURL(await api.attachmentBlob(i.id, a.id))
                        window.open(url, '_blank', 'noopener')
                        setTimeout(() => URL.revokeObjectURL(url), 60_000)
                      })
                    }
                  >
                    Ver
                  </button>
                )}
                <button
                  type="button"
                  className="tx-btn secondary sm"
                  disabled={busy !== ''}
                  aria-label={`Descargar ${a.name}`}
                  onClick={() => guard(a.id, async () => save(await api.attachmentBlob(i.id, a.id), a.name))}
                >
                  <Ic n="download" />
                  Descargar
                </button>
                {editable && (canResolve || a.uploadedBy === state.me) && (
                  <button
                    type="button"
                    className="tx-btn ghost sm"
                    disabled={busy !== ''}
                    aria-label={`Quitar ${a.name}`}
                    onClick={() => guard(a.id, async () => void (await run(api.removeAttachment(i.id, a.id), { onError: (m) => setErrors((x) => [...x, m]) })))}
                  >
                    <Ic n="trash" />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {editable && (
        <div className="att-pick">
          <label className="tx-btn secondary" style={{ alignSelf: 'flex-start', cursor: 'pointer' }}>
            <Ic n="plus" />
            {busy === 'upload' ? 'Subiendo…' : 'Adjuntar archivos'}
            <input
              type="file"
              multiple
              hidden
              disabled={busy !== ''}
              accept={ATTACHMENT_EXTS.join(',')}
              onChange={(e) => {
                const files = Array.from(e.target.files ?? [])
                e.target.value = '' // permite volver a elegir el mismo archivo
                setErrors([])
                guard('upload', async () => {
                  let count = list.length
                  for (const f of files) {
                    const why = fileProblem(f, count)
                    if (why) {
                      setErrors((x) => [...x, why])
                      continue
                    }
                    const s = await run(api.addAttachment(i.id, f), { onError: (m) => setErrors((x) => [...x, `${f.name}: ${m}`]) })
                    if (s) count++
                  }
                })
              }}
            />
          </label>
          <span className="tx-help">
            Hasta {MAX_ATTACHMENTS} archivos de {fileSize(MAX_ATTACHMENT_BYTES)}: imágenes, PDF, texto, logs, CSV o ZIP. {!canResolve && 'Los ve el equipo que atiende tu incidente.'}
            {canResolve && 'Los ve también el solicitante: para algo interno usá una nota.'}
          </span>
          {errors.length > 0 && (
            <ul className="att-errors" role="alert">
              {errors.map((m, k) => (
                <li key={k}>{m}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}
