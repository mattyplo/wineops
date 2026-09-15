# Backend

The backend is a TypeScript Fastify service. `src/app.ts` wires CORS, health/API routes, and route prefixes; `src/routes/` owns HTTP behavior; `src/services/` owns use-case logic; `src/repositories/` owns Supabase queries; and `src/types/` defines experiment data shapes.

Keep Supabase access behind services or repositories rather than adding it to routes. Existing experiment routes validate UUIDs before the service and map unknown experiments to a `404` response; unexpected errors are allowed to reach Fastify's normal error handling.

Configuration is loaded from environment variables in `src/config.ts`. `SUPABASE_URL` and `SUPABASE_KEY` are required; use `.env.example` as the local configuration template.

Tests use Node's built-in test runner and Fastify injection/repository fixtures, so they do not need a real Supabase instance. From `backend/`, run:

```bash
npm test
npm run typecheck
npm run build
```

Use `npm run dev` for local development. The root README lists the current public endpoints.
