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
| `Onboarding.tsx` | asistente del titular: rubro, servicios, cómo trabaja, equipo y primer ticket |
| `Dashboard.tsx` | panel de visualización |
| `Incidents.tsx` | alta, lista y detalle de incidentes |
| `Problems.tsx` | tablero y detalle de problemas |
| `KnownErrors.tsx` | base de errores conocidos |
| `Settings.tsx` | usuarios, roles y configuración de la ticketera |
| `App.tsx` · `api.ts` · `ui.tsx` | shell y navegación · cliente de la API · piezas compartidas |
