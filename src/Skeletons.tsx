// Skeletons de cada pantalla: misma forma que el contenido final (ver design/components/*Cargando).
import type { CSSProperties } from 'react'
import { Ic } from './ui'

const Sk = ({ c = '', w, h, style }: { c?: string; w?: number | string; h?: number; style?: CSSProperties }) => (
  <span className={`sk ${c}`} style={{ width: w, height: h, ...style }} />
)
const col = (gap: number): CSSProperties => ({ display: 'flex', flexDirection: 'column', gap })
const pills = (widths: number[]) => (
  <div className="tx-filters">
    {widths.map((w, i) => (
      <Sk key={i} c="pill" w={w} h={30} />
    ))}
  </div>
)

function BoardSkeleton() {
  return (
    <>
      <section className="tx-metrics" aria-hidden="true">
        {['62%', '58%', '82%', '66%'].map((w) => (
          <div key={w} className="tx-metric tx-glass">
            <Sk c="t-sm" w={w} style={{ margin: '4px 0 6px' }} />
            <Sk c="t-metric" style={{ marginTop: 'auto' }} />
            <Sk c="t-xs" w="55%" style={{ marginTop: 6 }} />
          </div>
        ))}
      </section>
      <section className="tx-reco tx-glass" aria-hidden="true">
        <div className="tx-reco-head">
          <Sk c="box" w={40} h={40} />
          <div style={{ flex: 1, paddingTop: 4, ...col(8) }}>
            <Sk c="t-md" w={260} />
            <Sk c="t-sm" w="58%" />
          </div>
        </div>
        <div className="tx-reco-list">
          <div className="tx-reco-row">
            <div style={col(6)}>
              <Sk c="t-md" w={110} />
              <Sk c="t-xs" w={90} />
            </div>
            <Sk c="t-sm" w={84} />
            <div className="ids">
              <Sk c="chip" />
              <Sk c="chip" />
              <Sk c="chip" w={40} />
            </div>
            <Sk c="btn" w={150} />
          </div>
        </div>
      </section>
      <section>
        <div className="tx-section-head">
          <h2 className="tx-h3">Problemas</h2>
          {pills([78, 84, 96])}
        </div>
        <div className="tx-table-wrap tx-solid" aria-hidden="true">
          <table className="tx-table">
            <thead>
              <tr>
                {[18, 40, 50, 40, 120].map((w, i) => (
                  <th key={i} style={{ width: [72, '38%', undefined, undefined, 170][i] }}>
                    <Sk c="t-xs" w={w} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ['72%', 40, 118],
                  ['60%', 110, 100],
                  ['54%', 70, 86],
                ] as const
              ).map(([title, svc, badge]) => (
                <tr key={title}>
                  <td>
                    <Sk c="t-md" w={30} />
                  </td>
                  <td>
                    <Sk c="t-md" w={title} />
                  </td>
                  <td>
                    <Sk c="t-sm" w={svc} />
                  </td>
                  <td>
                    <Sk c="pill" w={badge} />
                  </td>
                  <td>
                    <Sk c="t-sm" w={96} style={{ marginLeft: 'auto' }} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}

function IncidentsSkeleton() {
  return (
    <>
      <div className="tx-inline-form tx-glass" aria-hidden="true">
        {[120, 110, 70].map((w) => (
          <div key={w} className="tx-field">
            <Sk c="t-sm" w={w} style={{ margin: '3px 0' }} />
            <Sk c="input" />
          </div>
        ))}
        <Sk c="btn" w={92} h={38} />
      </div>
      <section>
        <div className="tx-section-head">
          <h2 className="tx-h3">Todos los incidentes</h2>
          {pills([96, 110, 100])}
        </div>
        <div className="tx-table-wrap tx-solid" aria-hidden="true">
          <table className="tx-table">
            <thead>
              <tr>
                {[18, 40, 50, 50, 54, 40].map((w, i) => (
                  <th key={i} style={{ width: [72, '36%', undefined, undefined, undefined, 110][i] }}>
                    <Sk c="t-xs" w={w} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ['78%', 40],
                  ['64%', 100],
                  ['70%', 60],
                  ['52%', 80],
                  ['60%', 40],
                  ['74%', 100],
                ] as const
              ).map(([title, svc], i) => (
                <tr key={i}>
                  <td>
                    <Sk c="t-md" w={26} />
                  </td>
                  <td>
                    <Sk c="t-md" w={title} />
                  </td>
                  <td>
                    <Sk c="t-sm" w={svc} />
                  </td>
                  <td>
                    <Sk w={58} h={22} />
                  </td>
                  <td>{i % 2 ? <Sk c="btn-sm" w={104} /> : <Sk c="t-md" w={30} />}</td>
                  <td>
                    <Sk c="btn-sm" w={76} style={{ marginLeft: 'auto' }} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}

function KnownErrorsSkeleton() {
  return (
    <>
      {/* El buscador se pinta desde el primer frame; se habilita cuando llegan los datos. */}
      <label className="tx-search tx-glass">
        <Ic n="search" size="lg" />
        <input type="search" disabled placeholder="Buscar por síntoma, servicio o causa…" aria-label="Buscar en errores conocidos" />
      </label>
      {pills([78, 130, 100])}
      <div className="tx-kb-grid">
        {[0, 1, 2, 3].map((i) => (
          <article key={i} className="tx-kb tx-solid" aria-hidden="true">
            <div className="hd">
              <div style={{ flex: 1, ...col(8) }}>
                <Sk c="t-lg" w="70%" />
                <Sk c="t-xs" w={90} />
              </div>
              <Sk c="pill" w={110} />
            </div>
            <div style={col(8)}>
              <Sk c="t-xs" w={70} />
              <Sk c="t-md" w="96%" />
              <Sk c="t-md" w="64%" />
            </div>
            <Sk c="box" h={70} />
            <div className="ft">
              <Sk c="t-xs" w={150} />
              <Sk c="t-xs" w={80} />
            </div>
          </article>
        ))}
      </div>
    </>
  )
}

function PanelSkeleton() {
  return (
    <>
      {pills([130, 84, 84])}
      <section className="tx-metrics" aria-hidden="true">
        {['62%', '70%', '82%', '66%'].map((w) => (
          <div key={w} className="tx-metric tx-glass">
            <Sk c="t-sm" w={w} style={{ margin: '4px 0 6px' }} />
            <Sk c="t-metric" style={{ marginTop: 'auto' }} />
            <Sk c="t-xs" w="55%" style={{ marginTop: 6 }} />
          </div>
        ))}
      </section>
      <div className="viz-grid" aria-hidden="true">
        {[190, 190, 110, 110].map((h, i) => (
          <section key={i} className="viz-card tx-solid">
            <Sk c="t-lg" w="45%" />
            <Sk c="t-xs" w="70%" />
            <Sk c="box" h={h} />
          </section>
        ))}
      </div>
    </>
  )
}

function SettingsSkeleton() {
  return (
    <div className="cfg-grid" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <section key={i} className="tx-panel tx-solid">
          <Sk c="t-lg" w="40%" />
          <Sk c="t-xs" w="75%" />
          {[0, 1, 2].map((j) => (
            <Sk key={j} c="input" />
          ))}
        </section>
      ))}
    </div>
  )
}

export const SKELETON = {
  panel: PanelSkeleton,
  problemas: BoardSkeleton,
  incidentes: IncidentsSkeleton,
  kedb: KnownErrorsSkeleton,
  config: SettingsSkeleton,
}
