# TaaS frontend

Interfaz web de TaaS, la ticketera configurable como servicio. React + TypeScript (Vite), con CSS propio sobre el design system del proyecto (`src/design/`).

Necesita el backend ([backend-taas](https://github.com/IgnacioCabaleiro/backend-taas)) corriendo. Las cuentas de demo están en su README.

## Correr

```bash
npm install
npm run dev      # http://localhost:5173
npm run build
```

La URL de la API se fija al compilar con `VITE_API_URL`; sin definir, usa `http://localhost:8080/api`.

Con Docker (sirve el build con nginx):

```bash
docker build -t taas-frontend --build-arg VITE_API_URL=http://localhost:8080/api .
docker run -p 5173:80 taas-frontend
```

## Qué hay en `src/`

| Archivo | Pantalla |
|---|---|
| `Auth.tsx` | ingreso y alta de cuenta |
| `Onboarding.tsx` · `OnboardingPreview.tsx` | asistente del titular: rubro, servicios, cómo trabaja (con errores conocidos precargados del rubro), equipo y primer ticket · la vista previa que se arma al costado |
| `Invitation.tsx` | aceptar una invitación (`#/invitacion/<token>`) y elegir la contraseña |
| `Dashboard.tsx` | panel de visualización |
| `Incidents.tsx` | alta y lista de incidentes, con filtros por etapa |
| `IncidentDetail.tsx` | detalle de un incidente: ciclo de vida ITIL, actividad, SLA, resolución, reapertura y cierre |
| `Problems.tsx` | tablero y detalle de problemas, con recurrencias por servicio y el mismo síntoma en servicios distintos |
| `Swarm.tsx` | swarming: el equipo investiga un problema a la vez (pistas, descartes y hallazgos) |
| `SlaMetrics.tsx` · `Simulator.tsx` | métricas de SLA · simulador de plazos sobre los incidentes reales |
| `KnownErrors.tsx` | base de errores conocidos, con su rendimiento |
| `Knowledge.tsx` | sugerencias de errores conocidos al escribir, incidentes parecidos y panel del workaround |
| `Review.tsx` | impacto acumulado de un problema y su revisión post-problema |
| `Rating.tsx` | valoración de la atención por quien reportó |
| `Settings.tsx` · `People.tsx` · `Versions.tsx` | configuración de la ticketera · personas (por invitación) y roles · historial de versiones |
| `App.tsx` · `api.ts` · `ui.tsx` | shell y navegación · cliente de la API · piezas compartidas |
