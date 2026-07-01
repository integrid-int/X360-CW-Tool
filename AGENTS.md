# AGENTS.md

## Cursor Cloud specific instructions

### What this is
A single **Azure Functions (Node.js v4 programming model, TypeScript)** app (`cw-shim`)
that impersonates a ConnectWise Manage instance so x360Recover/Axcient can connect.
There is **one** service (the HTTP API) and **no GUI** — verify it with `curl`/HTTP, not a browser.
All endpoints are mock/in-memory; created tickets live in process memory only.

### Tooling already installed in the VM snapshot
- **Azure Functions Core Tools** (`func`) and **Azurite** (storage emulator) are installed
  globally under `~/.npm-global/bin`, which is added to `PATH` via `~/.bashrc`.
  They are **not** in `package.json`, so `npm install` will not (re)install them — they
  persist in the VM snapshot. If `func` or `azurite` is missing, reinstall with
  `npm install -g azure-functions-core-tools@4 azurite`.
- Harmless noise: shell startup prints an `nvm` warning about an `.npmrc` `prefix` setting.
  It is cosmetic (the active node is `/exec-daemon/node`, not nvm) — ignore it.

### Build / lint / test (standard scripts in `package.json`)
- Build: `npm run build` (runs `tsc`, emits to `dist/`).
- Test: `npm test` — but tests `require('../dist/functions/cwShim.js')`, so you **must
  build first**. Use `npm run build && npm test`. There is no separate lint command;
  `tsc` (strict mode) is the type/lint gate.

### Running the app locally
- `npm start` runs `prestart` (build) then `func start`; the host listens on
  **http://localhost:7071** with a catch-all route (`/{*path}`) for every HTTP method.
- **Azurite must be running first** because `local.settings.json` sets
  `AzureWebJobsStorage=UseDevelopmentStorage=true`. Start it (background) with:
  `azurite --silent --location ~/.azurite`.
- Quick smoke check (README verify command):
  `curl http://localhost:7071/v4_6_release/apis/3.0/system/info`
- Core "create" action:
  `curl -X POST http://localhost:7071/v4_6_release/apis/3.0/service/tickets -H 'Content-Type: application/json' -d '{"summary":"hi","company":{"identifier":"15"}}'`
