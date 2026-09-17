# Verya — Run Doc (dev server / preview)

App root: `verya/` (Next.js 15, App Router, Turbopack). Thread workspace root is this folder's parent.

## 1. Reproduce artifacts (fresh checkout)

1. **Node 22 required.** On this machine `nodejs` is missing from the PATH that spawned
   children inherit, so always prepend it: `$env:PATH = 'C:\Program Files\nodejs;' + $env:PATH`
   (PowerShell) or `export PATH="/c/Program Files/nodejs:$PATH"` (Git Bash) before any npm call.
2. **Install dependencies** (already vendored in `verya/node_modules` here; rerun if missing):
   ```bash
   cd verya && npm install
   ```
3. **Environment file** — none exists in the main checkout; the app runs without it and
   shows a graceful "GEMINI_API_KEY is not set" error on AI calls (all other UI/flows work).
   To enable AI: create `verya/.env.local` with `GEMINI_API_KEY=<key>` (never commit it),
   template in `verya/.env.example`.
4. **Data dirs** (`.data/` under `verya/` — sessions, ledger, memory, reputation) are
   created lazily at runtime; nothing to reproduce.

## 2. Run the server (detached, survives the conversation)

Windows quirk: do NOT bind the default port 3000 — it collides with a Hyper-V dynamic
excluded-port reservation on this machine (Next silently falls back to an ephemeral port).
Use an explicit port like 3100:

```powershell
powershell -NoProfile -Command "$env:PATH = 'C:\Program Files\nodejs;' + $env:PATH; (Start-Process -FilePath 'C:\Program Files\nodejs\npm.cmd' -ArgumentList 'run','dev','--','-p','3100' -WorkingDirectory 'C:\Users\Admin\Desktop\PROJECTS\verya\verya' -RedirectStandardOutput 'C:\Users\Admin\Desktop\PROJECTS\verya\.freebuff\preview.log' -RedirectStandardError 'C:\Users\Admin\Desktop\PROJECTS\verya\.freebuff\preview.log.err' -WindowStyle Hidden -PassThru).Id"
```

(stdout and stderr must go to different files; npm.cmd must be the absolute path;
PATH must be fixed first or the spawned `node` lookups fail.)

- URL: http://localhost:3100 (app) · http://localhost:3100/dashboard (dashboard)
- Health check: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3100/` → 200
- Stop: `powershell -NoProfile -Command "Get-Process node | Stop-Process -Force"`
  (kills all node — only safe when nothing else node-based is running)
