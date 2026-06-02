# endorsekit web

SvelteKit gear app for the Aviation Cortex platform. Served at
`aviationcortex.com/endorsekit/*` via Cloudflared path routing.

## Development

```sh
cp .env.example .env
# fill in GOTRUE_JWT_SECRET + database password from iac-tickerbeats/infra/.env
pnpm install
pnpm dev    # serves on http://localhost:3014
```

## Platform integration

This scaffold implements [implementation_plan.md §10.1 (Frontend)](https://github.com/Ruscigno/aviation-cortex/blob/main/docs/implementation_plan.md#101-frontend):

- `src/app.html` loads `/assets/theme.css`, `/assets/shell-skeleton.css`,
  and `/assets/shell.js` from the Cortex hub. Wraps content in
  `<aviation-cortex-shell active-product="endorsekit">`.
- `src/hooks.server.ts` resolves locale (URL → cookie → Accept-Language)
  and extracts the GoTrue session cookie.
- `src/routes/+layout.server.ts` calls `requireActiveAccess()` — every
  request is gated on `cortex.users.access_until`.
- `src/routes/+layout.svelte` seeds the locale store + `setContext`s it +
  binds to `cortex:locale-changed`.
- SvelteKit `paths.base = '/endorsekit'` so SvelteKit's link generation
  matches the Cloudflared prefix.

## Backend (§10.2)

The gear backend should:
1. Verify the GoTrue HS256 JWT against `GOTRUE_JWT_SECRET`.
2. Connect to the shared Postgres with `search_path=endorsekit,cortex`.
3. Read access state from `cortex.users.access_until` (read-only grant).

Reference implementation: [`tail-number-radar/backend/internal/auth/auth.go`](https://github.com/Ruscigno/tail-number-radar/blob/main/backend/internal/auth/auth.go) — `newHS256Verifier`.
