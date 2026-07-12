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
  app.js                  # App Express (entry serverless para Vercel)
  index.js                # Entry local (app.listen)
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
vercel.json               # Configuración de despliegue serverless
```

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

`vercel.json` apunta a `src/app.js` como función `@vercel/node`. Las variables
de entorno se configuran en el dashboard de Vercel (Settings → Environment
Variables). El archivo `.env` **nunca** se sube al repo.
