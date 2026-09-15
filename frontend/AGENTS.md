# Frontend

This is a React 19 + TypeScript + Vite application. Source code is in `src/`: API clients are in `src/api/`, API shapes in `src/types/`, reusable UI in `src/components/`, and the experiment screen in `src/pages/`.

Use `VITE_API_URL` (see `.env.example`) as the backend base URL. Keep HTTP requests in the existing API modules rather than having components access Supabase.

Temperature values remain `temperature_c` in API data; presentation helpers in `src/utils/format.ts` convert or format them for the UI. The experiment page distinguishes loading, not-found, and other request failures.

From `frontend/`, verify relevant changes with:

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

`frontend/README.md` is still the Vite starter documentation; use the root README for WineOps context.
