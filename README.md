# backend-supabase

API backend en **Express 5 + Supabase**, desplegable a **Vercel** como función serverless.

## Stack

- Node.js >= 20 (ESM, `type: "module"`)
- Express 5
- Supabase JS v2 (`@supabase/supabase-js`)
- CORS configurable por CSV de orígenes

## Estructura

```
src/
  server.js               # Único entry point: app Express + listen (Vercel + local)
  config/
    env.js                # Carga y validación de variables de entorno
    supabase.js           # Clientes supabase (anon + service-role)
  lib/
    crudRouter.js         # Helper para routers CRUD
    supabase.js
  middleware/
    errorHandler.js
    notFound.js
  routes/
    categoriasUsuario.routes.js
    columnasTablero.routes.js
    debug.routes.js
    gestores.routes.js
    index.js
    tablero.routes.js
    ticketHistorial.routes.js
    tickets.routes.js
    usuarios.routes.js
vercel.json               # Solo región; el resto lo infiere Vercel del server.js
```

> **Importante:** `src/server.js` es el **único** entry point. Vercel lo
> auto-detecta por nombre (`server.js` en la raíz de `src/`) y captura el
> HTTP server creado durante el module load (`app.listen()`). No hace
> falta declarar `builds` / `routes` en `vercel.json` para esto.

## Variables de entorno

Copia `.env.example` a `.env` para desarrollo local. **Nunca** commitees `.env`.

| Variable | Requerida | Descripción |
|---|---|---|
| `PORT` | No (3000) | Puerto local |
| `NODE_ENV` | No (`development`) | Entorno |
| `API_PREFIX` | No (`/api`) | Prefijo de rutas |
| `SUPABASE_URL` | **Sí** | URL del proyecto Supabase |
| `SUPABASE_ANON_KEY` | **Sí** | Anon / publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | No | Service role (server-side only) |
| `CORS_ORIGINS` | No | CSV de orígenes permitidos (acepta también `CORS_ORIGIN` singular por compat) |

## Desarrollo local

```bash
pnpm install
pnpm dev
```

## Despliegue en Vercel

`vercel.json` solo declara la región (`iad1`). Vercel auto-detecta
`src/server.js`, lo construye con `@vercel/node` y captura el server HTTP
creado al hacer `app.listen()`. Las variables de entorno se configuran en
el dashboard de Vercel (Settings → Environment Variables). El archivo
`.env` **nunca** se sube al repo.

> **Caveat operacional:** cada `git push` crea un deploy nuevo, pero **no
> se promociona automáticamente** al alias de producción
> (`backend-tickets.vercel.app`). Después de cada push hay que promover
> manualmente:
>
> ```bash
> vercel promote <deployment-alias>
> # p.ej. vercel promote backend-tickets-9cjz4jii9-...vercel.app
> ```
>
> O configurar Git Integration para que el push a `main` sea el trigger
> de promoción (Vercel Project → Settings → Git). Si el navegador sigue
> viendo errores CORS después de un push, este es el primer lugar a
> chequear.
