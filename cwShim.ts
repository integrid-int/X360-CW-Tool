import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';

// ─── Mock ConnectWise responses ───────────────────────────────────────────────
// Just enough to pass x360Recover's connection test. Real field shapes from CW v2023.

const MOCK_SYSTEM_INFO = {
  version: 'v2023.1.0.0',
  isCloud: false,
  serverTimeZone: 'Eastern Standard Time',
  cloudRegion: 'NA',
  loginUrl: null,
  codeLevel: '23.1'
};

const MOCK_MEMBER = {
  id: 1,
  identifier: 'axcient_api',
  name: 'Axcient Shim API User',
  defaultEmail: 'api@integrid.com',
  type: { id: 4, name: 'API' },
  systemMember: false,
  allowAllClientsFlag: true
};

// Boards: x360Recover will ask for available boards to let you map one
const MOCK_BOARDS = [
  { id: 1, name: 'Service Desk', locationId: 1, businessUnitId: 1,
    inactive: false, signOffTemplate: { id: 1, name: 'Default' } }
];

// Board statuses — x360Recover maps alert severities to statuses
const MOCK_STATUSES = [
  { id: 1,  boardId: 1, name: 'New',        sortOrder: 1,  displayOnBoard: true,  inactive: false, closedStatus: false },
  { id: 2,  boardId: 1, name: 'In Progress', sortOrder: 2, displayOnBoard: true,  inactive: false, closedStatus: false },
  { id: 3,  boardId: 1, name: 'Resolved',    sortOrder: 5, displayOnBoard: false, inactive: false, closedStatus: true  }
];

// Priorities — x360Recover maps backup alert severity to these
const MOCK_PRIORITIES = [
  { id: 1, name: 'Priority 1 - Critical', color: 'red',    sortOrder: 1 },
  { id: 2, name: 'Priority 2 - High',     color: 'orange', sortOrder: 2 },
  { id: 3, name: 'Priority 3 - Medium',   color: 'yellow', sortOrder: 3 },
  { id: 4, name: 'Priority 4 - Low',      color: 'white',  sortOrder: 4 }
];

// Companies — return a single MSP company so the mapping config step passes
const MOCK_COMPANIES = [
  { id: 1, identifier: 'INTEGRID', name: 'Integrid LLC',
    status: { id: 1, name: 'Active' }, type: { id: 1, name: 'Managed' } }
];

// ─── Request logger ───────────────────────────────────────────────────────────

function logRequest(
  req: HttpRequest,
  context: InvocationContext,
  body: string
): void {
  const entry = {
    timestamp:   new Date().toISOString(),
    method:      req.method,
    url:         req.url,
    path:        new URL(req.url).pathname,
    query:       Object.fromEntries(req.query.entries()),
    headers:     Object.fromEntries(req.headers.entries()),
    body:        body || null
  };

  // Logged to App Insights via context.log — visible in Live Metrics + Log Analytics
  context.log('─── INCOMING REQUEST ───────────────────────────────');
  context.log(`${entry.method} ${entry.path}`);
  if (Object.keys(entry.query).length) context.log('Query:', entry.query);
  context.log('Headers:', entry.headers);
  if (entry.body) context.log('Body:', entry.body);
  context.log('────────────────────────────────────────────────────');

  // Also log as a single structured JSON blob — easier to query in Log Analytics:
  // traces | where message == "CW_SHIM_REQUEST" | project timestamp, customDimensions
  context.log('CW_SHIM_REQUEST', JSON.stringify(entry));
}

// ─── Route handler ────────────────────────────────────────────────────────────

async function cwShim(
  req: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {

  const body = await req.text().catch(() => '');
  logRequest(req, context, body);

  const path    = new URL(req.url).pathname;
  const method  = req.method?.toUpperCase() ?? 'GET';
  const headers = { 'Content-Type': 'application/json' };

  // ── Connection test endpoints ──────────────────────────────────────────────
  // x360Recover will hit these when you click "Test" or "Save" in settings.
  // Return mock data that satisfies the CW SDK version check.

  if (path.includes('/system/info')) {
    return { status: 200, headers, jsonBody: MOCK_SYSTEM_INFO };
  }

  if (path.includes('/system/members/me')) {
    return { status: 200, headers, jsonBody: MOCK_MEMBER };
  }

  // ── Board / status / priority lookups ─────────────────────────────────────
  // x360Recover reads these to populate its PSA mapping dropdowns

  if (path.includes('/service/boards') && !path.match(/\/boards\/\d+/)) {
    return { status: 200, headers, jsonBody: MOCK_BOARDS };
  }

  if (path.match(/\/service\/boards\/\d+\/statuses/)) {
    return { status: 200, headers, jsonBody: MOCK_STATUSES };
  }

  if (path.includes('/service/priorities')) {
    return { status: 200, headers, jsonBody: MOCK_PRIORITIES };
  }

  // ── Company lookups ────────────────────────────────────────────────────────

  if (path.includes('/company/companies') && method === 'GET') {
    return { status: 200, headers, jsonBody: MOCK_COMPANIES };
  }

  // ── Ticket operations ──────────────────────────────────────────────────────
  // These are the calls we care about most — log and return plausible responses

  if (path.includes('/service/tickets') && method === 'GET') {
    // Dedup check: x360Recover queries for existing open tickets before creating.
    // Return empty so it always attempts to create — we log the query conditions.
    return { status: 200, headers, jsonBody: [] };
  }

  if (path.includes('/service/tickets') && method === 'POST') {
    // Ticket create — return a fake ticket ID so x360Recover thinks it succeeded
    let parsedBody: Record<string, unknown> = {};
    try { parsedBody = JSON.parse(body); } catch {}
    const fakeTicketId = Math.floor(Math.random() * 90000) + 10000;
    context.log(`TICKET_CREATE: fake CW ID ${fakeTicketId}`, JSON.stringify(parsedBody));
    return {
      status: 201,
      headers,
      jsonBody: {
        id:      fakeTicketId,
        summary: parsedBody.summary ?? 'Shim ticket',
        status:  { id: 1, name: 'New' },
        board:   { id: 1, name: 'Service Desk' },
        company: { id: 1, identifier: 'INTEGRID', name: 'Integrid LLC' },
        priority: parsedBody.priority ?? { id: 2, name: 'Priority 2 - High' }
      }
    };
  }

  if (path.match(/\/service\/tickets\/\d+/) && (method === 'PUT' || method === 'PATCH')) {
    // Ticket update / close
    const ticketId = path.match(/\/tickets\/(\d+)/)?.[1];
    let parsedBody: Record<string, unknown> = {};
    try { parsedBody = JSON.parse(body); } catch {}
    context.log(`TICKET_UPDATE: CW ID ${ticketId}`, JSON.stringify(parsedBody));
    return {
      status: 200,
      headers,
      jsonBody: { id: Number(ticketId), ...parsedBody }
    };
  }

  if (path.match(/\/service\/tickets\/\d+/) && method === 'GET') {
    const ticketId = path.match(/\/tickets\/(\d+)/)?.[1];
    return {
      status: 200,
      headers,
      jsonBody: { id: Number(ticketId), status: { id: 1, name: 'New' } }
    };
  }

  // ── Catch-all ──────────────────────────────────────────────────────────────
  // Return 200 with empty array for anything not explicitly handled.
  // Prevents x360Recover from bailing on unexpected 404s during setup.
  context.log(`UNHANDLED: ${method} ${path} — returning empty 200`);
  return { status: 200, headers, jsonBody: [] };
}

// ─── Register catch-all routes ────────────────────────────────────────────────
// Azure Functions v4 — register explicit routes for the CW path patterns.
// The wildcard catches everything else.

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;

for (const method of METHODS) {
  app.http(`cwShim_${method}`, {
    methods:   [method],
    authLevel: 'anonymous',
    route:     '{*path}',
    handler:   cwShim
  });
}
