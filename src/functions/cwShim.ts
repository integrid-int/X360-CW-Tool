import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';

// ── Mock CW responses ─────────────────────────────────────────────────────────

const MOCK_SYSTEM_INFO = {
  version: 'v2023.1.0.0', isCloud: false,
  serverTimeZone: 'Eastern Standard Time', cloudRegion: 'NA', loginUrl: null
};

const MOCK_MEMBER = {
  id: 1, identifier: 'axcient_api', name: 'Axcient Shim API User',
  defaultEmail: 'api@integrid.com', type: { id: 4, name: 'API' },
  allowAllClientsFlag: true
};

const MOCK_BOARDS = [
  { id: 1, name: 'Service Desk', locationId: 1, businessUnitId: 1, inactive: false }
];

const MOCK_STATUSES = [
  { id: 1, boardId: 1, name: 'New',         sortOrder: 1, closedStatus: false },
  { id: 2, boardId: 1, name: 'In Progress', sortOrder: 2, closedStatus: false },
  { id: 3, boardId: 1, name: 'Resolved',    sortOrder: 5, closedStatus: true  }
];

const MOCK_PRIORITIES = [
  { id: 1, name: 'Priority 1 - Critical', sortOrder: 1 },
  { id: 2, name: 'Priority 2 - High',     sortOrder: 2 },
  { id: 3, name: 'Priority 3 - Medium',   sortOrder: 3 },
  { id: 4, name: 'Priority 4 - Low',      sortOrder: 4 }
];

const MOCK_COMPANIES = [
  { id: 1, identifier: 'INTEGRID', name: 'Integrid LLC',
    status: { id: 1, name: 'Active' }, type: { id: 1, name: 'Managed' } }
];

// ── Logger ────────────────────────────────────────────────────────────────────

function logRequest(req: HttpRequest, context: InvocationContext, body: string): void {
  const entry = {
    timestamp: new Date().toISOString(),
    method:    req.method,
    url:       req.url,
    path:      new URL(req.url).pathname,
    query:     Object.fromEntries(req.query.entries()),
    headers:   Object.fromEntries(req.headers.entries()),
    body:      body || null
  };
  context.log('─── REQUEST ───────────────────────────────────────');
  context.log(`${entry.method} ${entry.path}`);
  if (Object.keys(entry.query).length) context.log('Query:', entry.query);
  if (entry.body) context.log('Body:', entry.body);
  context.log('CW_SHIM_REQUEST', JSON.stringify(entry));
}

// ── Handler ───────────────────────────────────────────────────────────────────

async function cwShim(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const body   = await req.text().catch(() => '');
  logRequest(req, context, body);

  const path   = new URL(req.url).pathname;
  const method = req.method?.toUpperCase() ?? 'GET';
  const h      = { 'Content-Type': 'application/json' };

  if (path.includes('/system/info'))            return { status: 200, headers: h, jsonBody: MOCK_SYSTEM_INFO };
  if (path.includes('/system/members/me'))      return { status: 200, headers: h, jsonBody: MOCK_MEMBER };
  if (path.includes('/service/boards') && !path.match(/\/boards\/\d+/))
                                                return { status: 200, headers: h, jsonBody: MOCK_BOARDS };
  if (path.match(/\/service\/boards\/\d+\/statuses/))
                                                return { status: 200, headers: h, jsonBody: MOCK_STATUSES };
  if (path.includes('/service/priorities'))     return { status: 200, headers: h, jsonBody: MOCK_PRIORITIES };
  if (path.includes('/company/companies') && method === 'GET')
                                                return { status: 200, headers: h, jsonBody: MOCK_COMPANIES };

  if (path.includes('/service/tickets') && method === 'GET')
                                                return { status: 200, headers: h, jsonBody: [] };

  if (path.includes('/service/tickets') && method === 'POST') {
    let parsed: Record<string, unknown> = {};
    try { parsed = JSON.parse(body); } catch {}
    const fakeId = Math.floor(Math.random() * 90000) + 10000;
    context.log(`TICKET_CREATE fake_id=${fakeId}`, JSON.stringify(parsed));
    return {
      status: 201, headers: h,
      jsonBody: { id: fakeId, summary: parsed.summary ?? 'Shim ticket',
                  status: { id: 1, name: 'New' }, board: { id: 1, name: 'Service Desk' },
                  company: { id: 1, identifier: 'INTEGRID', name: 'Integrid LLC' } }
    };
  }

  if (path.match(/\/service\/tickets\/\d+/) && (method === 'PUT' || method === 'PATCH')) {
    const ticketId = path.match(/\/tickets\/(\d+)/)?.[1];
    let parsed: Record<string, unknown> = {};
    try { parsed = JSON.parse(body); } catch {}
    context.log(`TICKET_UPDATE id=${ticketId}`, JSON.stringify(parsed));
    return { status: 200, headers: h, jsonBody: { id: Number(ticketId), ...parsed } };
  }

  if (path.match(/\/service\/tickets\/\d+/) && method === 'GET') {
    const ticketId = path.match(/\/tickets\/(\d+)/)?.[1];
    return { status: 200, headers: h, jsonBody: { id: Number(ticketId), status: { id: 1, name: 'New' } } };
  }

  context.log(`UNHANDLED ${method} ${path}`);
  return { status: 200, headers: h, jsonBody: [] };
}

// ── Register catch-all for all HTTP methods ───────────────────────────────────

for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const) {
  app.http(`cwShim_${method}`, {
    methods:   [method],
    authLevel: 'anonymous',
    route:     '{*path}',
    handler:   cwShim
  });
}
