# Agent Handoff: Halo PSA Integration — Complete Status

This document is for a **new Cursor agent** picking up this thread.
It supersedes all earlier handoff documents.

---

## 1) What This Repo Is

`cw-shim` — an Azure Functions (Node.js v4, TypeScript) app that
impersonates a ConnectWise Manage API so x360Recover/Axcient can connect.
All lookups and ticket operations are proxied live to a HaloPSA instance.
There is **no GUI**; validate with `curl`/HTTP only.

---

## 2) Current Branch / PR

| Item | Value |
|------|-------|
| Branch | `cursor/fix-azure-startup-a5c2` |
| PR | https://github.com/integrid-int/X360-CW-Tool/pull/6 |
| Last commit | `a08dc98` — "Fix Halo API mapping bugs found during live testing" |

---

## 3) Environment Variables

| Variable | Required | Status | Notes |
|----------|----------|--------|-------|
| `HaloClientID` | yes | **present** in this tenant | OAuth client ID |
| `HaloSecret` | yes | **present** | OAuth client secret |
| `HaloUrl` | yes | **present** | Base URL; code appends `/api` if missing |
| `HaloTenant` | no | not set | Only needed for multi-tenant Halo; omit for single-tenant |
| `HaloClosedStatusId` | no | not set | Defaults to `9`; see status section below |

Check with:
```bash
node -e "
const keys = ['HaloClientID','HaloSecret','HaloUrl','HaloTenant','HaloClosedStatusId'];
const out = Object.fromEntries(keys.map(k => [k, Boolean(process.env[k]?.trim())]));
console.log(JSON.stringify(out, null, 2));
"
```

---

## 4) HaloPSA API — Confirmed Shapes for This Tenant

All shapes were verified with live GET probes against the real Halo instance.

### Auth
- **Token URL**: `{HaloUrl}/auth/token` (no `/api` prefix)
- **Grant type**: `client_credentials`, scope `all`
- Token response: `{ access_token, expires_in, token_type }`

### `/api/Client`
- Query: `?showall=true&includeactive=true&count=2000&pageinate=false`
- Response envelope: `{ record_count, clients: [...] }`
- Item fields: `id` (int), `name` (string), `inactive` (bool)
- **This tenant has 42 clients**

### `/api/Users`
- Query: `?includeactive=true&count=2000&pageinate=false`
- Response envelope: `{ record_count, users: [...] }`
- Item fields: `id` (int), `name`, `firstname`, `surname`, `site_id`, `client_name`
- **This tenant has 603 users. No user with `id=1` exists** (lowest seen: 61)

### `/api/Team`
- Query: `?showall=true`
- Response: **array directly** (no envelope)
- Item fields: `id` (int), `name`, `inactive` (bool), `forrequests` (bool)
- **8 teams** in this tenant:

| id | name | forrequests |
|----|------|-------------|
| 1 | Service Desk | true |
| 2 | Sales | false |
| 7 | Project Managers | true |
| 9 | Project Engineers | false |
| 12 | Leads | false |
| 14 | Dave Team | true |
| 15 | Ryan Team | true |
| 16 | Dispatch | true |

### `/api/TicketType`
- Query: `?showall=true&domain=reqs`
- Response: **array directly**
- Item fields: `id` (int), `name`
- **31 types** — key ones:

| id | name |
|----|------|
| 1 | Incident |
| 2 | Change Request |
| 3 | Service Request |
| 21 | Alert |
| 34 | Triage (**this is the default when no type is matched**) |

### `/api/Status`
- Query: `?showall=true&split_closed=true`
- Response: **array directly**
- Item fields: `id` (int), `name`, `type` (int — NOT a string; 0=open-ish, 1=closed order, 2=item type), `sequence` (int — use this for sort order, not `sortorder`)
- **50 statuses total** — closed/resolved ones:

| id | name | closedStatus |
|----|------|-------------|
| -9 | Closed (with user update) | true |
| 8 | Resolved | true |
| 9 | Closed (without user update) | true (default `HaloClosedStatusId`) |
| 13 | Closed Order | true |
| 15 | Closed Item | true |

> **Important**: `status.type` is a number, not a string. The original code tried
> `statusType.includes('closed')` on a number — that never matched. Fixed to use
> name-based inference only.

### `/api/Priority`
- Query: `?includedistinct=true`
- Response: **array directly**
- Item fields: `id` (**GUID string** — do NOT use for integer comparisons!), `priorityid` (**integer** — use this), `name`
- **4 priorities**:

| priorityid | name |
|------------|------|
| 1 | Urgent |
| 2 | High |
| 3 | Medium |
| 4 | Low |

> **Critical bug was here**: The old code used `id` (GUID) as the integer priority ID.
> `Number("c183eb27-...")` is NaN, so every priority got `id=1`. All four appeared
> identical. Fixed to use `priorityid` first.

### `/api/Tickets` (list)
- Response envelope: `{ record_count, tickets: [...] }`
- Item fields (ticket shape used in `mapHaloTicketToConnectWise`):

| Halo field | type | Maps to CW field |
|------------|------|-----------------|
| `id` | int | `id` |
| `summary` | string | `summary` |
| `details` | string | `initialDescription` |
| `status_id` | int | `status.id` |
| `status_name` | **absent** | `status.name` (inferred) |
| `team_id` | int | `board.id` |
| `team` | string | `board.name` |
| `client_id` | int | `company.id` |
| `client_name` | string | `company.name` |
| `tickettype_id` | int | `type.id` |
| `tickettype_name` | **absent** | `type.name` (always "General") |
| `priority_id` | int | (not mapped back) |
| `user_id` | int | `contact.id` |
| `user_name` | string | `contact.name` |
| `impact` | int | not exposed in CW shape |
| `urgency` | int | not exposed in CW shape |
| `dateoccurred` | string | `requiredDate` |

> **Note**: `status_name` and `tickettype_name` are **never present** in ticket
> responses. `status.name` is inferred from `status_id` (shows "Closed" when
> `status_id === closedStatusId`, else "New"). `type.name` always shows "General".

---

## 5) Ticket Create — Required Fields

When creating a Halo ticket via `POST /api/Tickets`, these fields must be included:

```json
{
  "summary": "...",
  "details": "...",
  "impact": 1,
  "urgency": 1
}
```

> **`impact: 0` and `urgency: 0` are treated as "unset"** and Halo rejects the
> request with `"Impact is mandatory\nUrgency is mandatory\n"` when no
> `tickettype_id` is provided. The minimum accepted integer is `1`.
>
> When `tickettype_id` is set (e.g., Alert=21), Halo allows impact/urgency to
> remain at 0 (the type config derives them). The shim always sends `1` as a safe
> universal default.

Optional fields that improve the ticket:
- `client_id` (int) — matched from incoming `company.identifier`
- `team_id` (int) — matched from incoming `board.name`
- `tickettype_id` (int) — matched from incoming `type.name`
- `priority_id` (int) — use `priorityid` integer, matched from incoming `priority.name`
- `user_id` (int) — from incoming `contact.id`

---

## 6) Ticket Close — Status Cascade

Different Halo ticket types accept different closed status IDs:

| Ticket type | Valid close status |
|-------------|-------------------|
| Alert (id=21) | `9` works |
| Triage (id=34, default) | `9` **rejected** ("Invalid Status"); use `8` |

The `closeTicket` method in `haloClient.ts` now cascades:
1. Try `closedStatusId` (default 9)
2. Try `8` (Resolved) if 9 failed
3. Try `9` if 8 failed (and 9 wasn't the first attempt)
4. If all fail, return current ticket state from `GET /Tickets/{id}`

> **Note**: `POST /api/Actions` for closing requires elevated OAuth permissions
> that this client credential does not have. The Actions fallback was removed.

---

## 7) Known Data Facts for This Tenant

- Tickets currently sequenced in the **380s** (next created will be ~385+)
- Test tickets created during agent sessions: `#2`, `#3`, `#4`, `#5`, `#384` (all in `_TESTING` company or "Blue Ridge Law")
- Designated test company: **`_TESTING`** (client `id=72`)
- `company.identifier="72"` in shim POST → Halo `client_id=72`
- No Halo client with `id=1` — the shim falls back to `createCompany(identifier, 1)` for CW compatibility

---

## 8) Bugs Fixed in This Session (commit `a08dc98`)

| # | Location | Bug | Fix |
|---|----------|-----|-----|
| 1 | `cwShim.ts` `mapHaloPriorityToPriority` | Used GUID `id` → all priorities got `id=1` | Use `priorityid` (integer) first |
| 2 | `cwShim.ts` `mapHaloStatusToStatus` | `statusType.includes('closed')` on a number never matched | Removed; use name-based inference only |
| 3 | `cwShim.ts` `mapHaloStatusToStatus` | `sortOrder` used non-existent `sortorder` field | Use `sequence` first |
| 4 | `cwShim.ts` `mapHaloTicketToConnectWise` | `status.name` always "New" even after close | Infer "Closed" when `status_id === closedStatusId` |
| 5 | `cwShim.ts` boards endpoint | Returned all boards ignoring `?conditions=` | Added `filterBoards()` function |
| 6 | `cwShim.ts` ticket create | Missing `impact`/`urgency` caused 400 without a ticket type | Always send `impact: 1, urgency: 1` |
| 7 | `haloClient.ts` `closeTicket` | Status 9 invalid for Triage tickets; Actions fallback lacked permission | Cascade: try 9, then 8, then return current state |

---

## 9) Known Remaining Issues

1. **`type.name` always "General"** — Halo ticket responses do not include `tickettype_name`.
   The shim maps `tickettype_id` correctly on create but the CW response always shows `type.name="General"`.
   To fix: after creating/fetching a ticket, look up the type name from the in-memory types list by id.

2. **Ticket close POST returns 201 but `status_id` unchanged** — When closing a Triage
   ticket via `POST /Tickets [{ id, status_id: 8 }]`, Halo returns HTTP 201 but
   the follow-up GET still shows `status_id=1`. Root cause unknown — may be a
   Halo workflow rule that prevents status transitions for new tickets, or status 8
   requires additional fields. Needs further investigation with the Halo administrator.

3. **Unit tests are mock-only** — Tests in `tests/cwShim.test.js` use mock data
   (they must be run with Halo vars unset: `HaloClientID= HaloSecret= HaloUrl= npm test`).
   Running with live Halo vars will fail several tests because: user `id=1` doesn't
   exist, the ticket create test hits real Halo, and the contact filter test expects
   exactly 1 result for `id=1`. Consider adding a test mode that stubs `haloClient`.

---

## 10) How to Run

### Start (requires Azurite first)
```bash
# Terminal 1 — storage emulator
azurite --silent --location ~/.azurite

# Terminal 2 — function app (auto-builds)
npm start
# Listens on http://localhost:7071
```

### Build only
```bash
npm run build   # tsc → dist/
```

### Tests (mock mode — always run this way)
```bash
HaloClientID= HaloSecret= HaloUrl= npm run build && npm test
```

### Smoke checks
```bash
# Info endpoint
curl http://localhost:7071/v4_6_release/apis/3.0/system/info

# Live Halo companies
curl http://localhost:7071/v4_6_release/apis/3.0/company/companies

# Live Halo priorities (verify ids are 1-4, not GUIDs)
curl http://localhost:7071/v4_6_release/apis/3.0/service/priorities

# Create a ticket (use _TESTING company id=72)
curl -X POST http://localhost:7071/v4_6_release/apis/3.0/service/tickets \
  -H 'Content-Type: application/json' \
  -d '{"summary":"hi","company":{"identifier":"72"}}'

# Resolve a ticket (replace 384 with actual id)
curl -X POST http://localhost:7071/v4_6_release/apis/3.0/service/tickets \
  -H 'Content-Type: application/json' \
  -d '{"ticketid": 384, "resolved": true}'
```

---

## 11) Quick Halo API Probe Script (read-only)

```bash
node <<'EOF'
const clientId = process.env.HaloClientID.trim();
const clientSecret = process.env.HaloSecret.trim();
const haloUrl = process.env.HaloUrl.trim().replace(/\/+$/, '');
const apiBase = haloUrl.toLowerCase().endsWith('/api') ? haloUrl : `${haloUrl}/api`;
const authBase = apiBase.replace(/\/api$/i, '/auth');

async function req(url, opts = {}) {
  const r = await fetch(url, opts);
  const t = await r.text();
  let j; try { j = t ? JSON.parse(t) : null; } catch { j = { raw: t.slice(0,200) }; }
  return { status: r.status, ok: r.ok, j };
}

(async () => {
  const form = new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret, scope: 'all' });
  const tr = await req(`${authBase}/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form });
  if (!tr.ok) { console.error('Auth failed', tr.status); process.exit(1); }
  const token = tr.j.access_token;
  const h = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  for (const ep of [
    '/Client?showall=true&count=5&pageinate=false',
    '/Team?showall=true',
    '/Status?showall=true&split_closed=true',
    '/Priority?includedistinct=true',
    '/Tickets?count=3&pageinate=false'
  ]) {
    const { status, j } = await req(`${apiBase}${ep}`, { method: 'GET', headers: h });
    const items = Array.isArray(j) ? j : (j?.clients || j?.users || j?.tickets || j?.teams || j);
    const count = Array.isArray(items) ? items.length : '?';
    const sample = Array.isArray(items) && items[0] ? Object.keys(items[0]).slice(0,8) : [];
    console.log(`${ep.split('?')[0]}: HTTP ${status} count=${count} keys=${sample}`);
  }
})();
EOF
```

---

## 12) Constraints

- Preserve mock fallback when Halo vars are absent.
- Never leak secrets in logs or committed files.
- Use `_TESTING` company (`identifier="72"`) for any test ticket creation.
- Default closed status is `9`; the cascade handles types that reject it.
- `POST /api/Actions` is not available to this OAuth client — do not use it.
