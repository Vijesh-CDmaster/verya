# Verya — Run Doc (dev servers / preview)

App root: `verya/` (Next.js 15 App Router + Turbopack, Tailwind 4, Clerk).
API root: `verya/backend/` (Fastify 5 + TypeScript, `tsx` runtime in dev).

The frontend proxies `/api/*` and `/health` to the backend (`next.config.ts`,
`BACKEND_ORIGIN`), so **the API half of the app only works while the backend runs**.

## 1. Reproduce the artifacts (fresh checkout)

1. **Node 22 required.** Node lives at `C:\Program Files\nodejs`. In Git Bash prepend it
   before any `npm` call (`export PATH="/c/Program Files/nodejs:$PATH"`); the PowerShell
   recipe below already does the equivalent by invoking `node.exe` directly, which avoids
   the npm-shim quirk where a spawned `node` lookup fails with `'"node"' is not recognized`.
2. **Install dependencies** — already vendored, rerun only if missing:
   ```bash
   cd verya && npm install
   cd verya/backend && npm install
   ```
3. **Environment file** — `verya/.env.local` **exists in the main checkout** and must be
   COPIED (never symlinked) into a fresh worktree. It holds the provider keys
   (Gemini/Groq/Mistral/OpenRouter), the Clerk publishable + secret keys, `BACKEND_ORIGIN`,
   `VERYA_APPROVED_MODELS`, and the database URL under the **lowercase key `neon_db`**
   (the pool accepts `DATABASE_URL || neon_db`). Never record its values here and never
   commit it.
4. **Data backend selection** — the pool uses Neon whenever *either* `DATABASE_URL` or
   `neon_db` is set; with both unset it falls back to the file-backed dev store
   (`verya/backend/.devstore/{sessions,ledger,memory,reputation,leads}.json`, created
   lazily, nothing to reproduce). `.next/` build cache is lazy too. Check the first
   backend log line to see which one is live — a `DATABASE_URL`-only grep of `.env.local`
   returns nothing and is misleading. **When Neon is configured, run migrations once**
   before starting the backend: `cd verya/backend && node node_modules/tsx/dist/cli.mjs src/db/migrate.ts`.
5. **Postgres transport** — `src/db/pool.ts` talks to Neon through
   `@neondatabase/serverless` (WebSocket to port **443**), because this machine
   intermittently blocks outbound TCP **5432** (plain `pg` connections then hang and every
   DB-backed route times out while `/health` still answers — diagnose with
   `node -e "require('net').connect(5432,'<neon-host>').on('error',console.log)"`).
   Requires `@neondatabase/serverless` in `verya/backend/package.json` (install with deps).
   Set `VERYA_PG_FORCE_TCP=1` to force the classic raw-TCP `pg` transport on networks
   with direct 5432 egress. If DB routes hang with the Neon driver too, Neon itself may
   be down/suspended — check the Neon console.

## 2. Run the servers (detached, they must outlive the conversation)

Use `node.exe` directly with the tool's own CLI entry point — no npm shim, no shell
resolution issues. stdout and stderr must go to DIFFERENT files.

### 2a. Backend (Fastify) — port 4000

Caveat for `npm run dev`: its `predev` hook runs `npm run migrate`, which throws
`DbNotConfigured` (exit 1) whenever *both* `DATABASE_URL` and `neon_db` are unset — the
chain then never starts, which is easy to misread as a broken script. With a database
configured `npm run dev` (and `npm run worker`) are fine and migrate first; running the
entry point directly always works and skips the npm shim entirely:

```powershell
powershell -NoProfile -Command "(Start-Process -FilePath 'C:\Program Files\nodejs\node.exe' -ArgumentList 'node_modules/tsx/dist/cli.mjs','src/server.ts' -WorkingDirectory 'C:\Users\Admin\Desktop\verya\verya\backend' -RedirectStandardOutput 'C:\Users\Admin\Desktop\verya\.freebuff\backend-preview.log' -RedirectStandardError 'C:\Users\Admin\Desktop\verya\.freebuff\backend-preview.log.err' -WindowStyle Hidden -PassThru).Id"
```

- `npm run typecheck` in `backend/` fails under the npm shim even with node on PATH
  (`'"node"' is not recognized`); use
  `node ./node_modules/typescript/bin/tsc -p tsconfig.json --noEmit` instead.
- `npm test` in `backend/` runs the offline regression suite (node's runner + `tsx`).

- Health: `curl -s http://localhost:4000/health` → `{"ok":true,...}`
- First log line shows the real posture: dev-store vs Neon, and `auth: clerk` vs dev mode.

### 2b. Frontend (Next.js) — port 3100

**Do not bind 3000**: a Hyper-V dynamic port-exclusion reservation on this machine claims
it and Next silently falls back to an ephemeral port. 3100 is used and free.

```powershell
powershell -NoProfile -Command "(Start-Process -FilePath 'C:\Program Files\nodejs\node.exe' -ArgumentList 'node_modules/next/dist/bin/next','dev','-p','3100' -WorkingDirectory 'C:\Users\Admin\Desktop\verya\verya' -RedirectStandardOutput 'C:\Users\Admin\Desktop\verya\.freebuff\preview.log' -RedirectStandardError 'C:\Users\Admin\Desktop\verya\.freebuff\preview.log.err' -WindowStyle Hidden -PassThru).Id"
```

- URL: <http://localhost:3100> · dashboard: <http://localhost:3100/dashboard>
- Health: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3100/` → 200
  (the first request compiles the route and can take ~15s; later requests are fast)
- `NEXT_PUBLIC_APP_URL` still says `http://localhost:3000`; that only affects generated
  links, not the server binding.
- The API requires a Clerk session (`CLERK_SECRET_KEY` is set), so `/api/*` answers 401
  for anonymous callers — sign in through the UI, or expect `<SignIn>` on `/dashboard`.

### 2c. Pids and stopping

`Start-Process` returns the pid, but its stdout can be swallowed; recover the live pids
from the listening sockets instead:

```bash
netstat -ano | grep LISTENING | grep -E ":3100|:4000"     # last column is the pid
powershell -NoProfile -Command "Get-Process -Id <pid>"
powershell -NoProfile -Command "Stop-Process -Id <pid> -Force"
```

Stop only the pids you started — `Get-Process node | Stop-Process -Force` kills unrelated
node processes (other worktrees, the desktop app's own helpers).
