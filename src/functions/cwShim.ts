import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';

// ── Mock CW responses ─────────────────────────────────────────────────────────

const MOCK_SYSTEM_INFO = {
  version: 'v2023.1.0.0', isCloud: false,
  serverTimeZone: 'Eastern Standard Time', cloudRegion: 'NA', loginUrl: null
};

const MOCK_COMPANY_INFO_VERSION_NUMBER = 'v4.6.99999';

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

const MOCK_TYPES = [
  { id: 1, name: 'Support', boardId: 1, inactiveFlag: false }
];

const MOCK_SUBTYPES = [
  { id: 1, name: 'Backup', boardId: 1, typeId: 1, inactiveFlag: false }
];

const MOCK_COMPANIES = [
  { id: 1, identifier: 'INTEGRID', name: 'Integrid LLC',
    status: { id: 1, name: 'Active' }, type: { id: 1, name: 'Managed' } }
];

const MOCK_CONTACTS = [
  { id: 1, firstName: 'Axcient', lastName: 'Integration', name: 'Axcient Integration' }
];

const CUSTOMER_COMPANIES = [
  { id: 12, name: 'Integrid LLC', identifier: '12' },
  { id: 15, name: 'Blue Ridge Law', identifier: '15' },
  { id: 16, name: 'Cenergy Plumbing', identifier: '16' },
  { id: 17, name: 'Centric Mechanical', identifier: '17' },
  { id: 20, name: 'Fortuna Enterprises LLC', identifier: '20' },
  { id: 24, name: 'IBEW 342', identifier: '24' },
  { id: 26, name: 'JATC 342', identifier: '26' },
  { id: 27, name: 'Law Office of Ben Morgan', identifier: '27' },
  { id: 29, name: 'McLeod Belting Company, Inc.', identifier: '29' },
  { id: 30, name: 'Moonlight Imaging', identifier: '30' },
  { id: 31, name: 'North State Sales Company', identifier: '31' },
  { id: 32, name: 'NuWray LLC', identifier: '32' },
  { id: 33, name: 'Piedmont Chain', identifier: '33' },
  { id: 34, name: 'Piedmont Precision Cabling LLC', identifier: '34' },
  { id: 35, name: 'Pinnacle Contracting Services', identifier: '35' },
  { id: 36, name: 'RCI Doors', identifier: '36' },
  { id: 37, name: 'Reganess Wealth Management', identifier: '37' },
  { id: 38, name: 'Schwarz Properties', identifier: '38' },
  { id: 39, name: 'Service First Logistics', identifier: '39' },
  { id: 40, name: 'Tabor Espresso', identifier: '40' },
  { id: 41, name: 'Test Corp', identifier: '41' },
  { id: 42, name: 'The Shoe Market', identifier: '42' },
  { id: 43, name: 'Volvo Cars of Winston Salem', identifier: '43' },
  { id: 45, name: 'Wynnefield Properties', identifier: '45' },
  { id: 46, name: 'Black Mountain Music', identifier: '46' },
  { id: 70, name: 'Forum Supply Company', identifier: '70' },
  { id: 71, name: 'Gold Medal Intl', identifier: '71' },
  { id: 72, name: '_TESTING', identifier: '72' },
  { id: 81, name: 'Integrid', identifier: '81' },
  { id: 84, name: 'Sustainable H2O', identifier: '84' },
  { id: 85, name: 'EBCO Aviation', identifier: '85' },
  { id: 89, name: 'Integrid Inventory', identifier: '89' },
  { id: 91, name: "Bobby's Friendly Towing", identifier: '91' },
  { id: 93, name: 'Cecil & Cecil PA', identifier: '93' },
  { id: 94, name: 'Etruscan Imports', identifier: '94' },
  { id: 95, name: 'Furniture Solutions 360', identifier: '95' },
  { id: 96, name: 'Global Renewable Energy Consultants', identifier: '96' },
  { id: 97, name: 'Lewis Logistics', identifier: '97' },
  { id: 98, name: 'Nichols Quality Associates', identifier: '98' },
  { id: 102, name: 'Carolina Electrical Joint Apprenticeship Training', identifier: '102' },
  { id: 103, name: 'RWMG', identifier: '103' },
  { id: 104, name: 'The Law Office Of Ben C Morgan', identifier: '104' }
];

function getAuthIdentifier(req: HttpRequest): string {
  const authHeader = req.headers.get('authorization') ?? '';
  const match = authHeader.match(/^Basic\s+(.+)$/i);
  if (!match) return MOCK_MEMBER.identifier;

  try {
    const decoded = Buffer.from(match[1], 'base64').toString('utf8');
    const username = decoded.split(':', 1)[0]?.trim();
    return username || MOCK_MEMBER.identifier;
  } catch {
    return MOCK_MEMBER.identifier;
  }
}

function parseConditionValue(conditions: string, field: string): string | null {
  const regex = new RegExp(`${field}\\s*=\\s*(?:"([^"]+)"|'([^']+)'|([^,\\)\\s]+))`, 'i');
  const match = conditions.match(regex);
  if (!match) return null;
  return match[1] ?? match[2] ?? match[3] ?? null;
}

function parseConditionNumber(conditions: string, field: string): number | null {
  const value = parseConditionValue(conditions, field);
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getIdentifierFromConditions(req: HttpRequest): string | null {
  const conditions = req.query.get('conditions') ?? '';
  return parseConditionValue(conditions, 'identifier');
}

function getCompanyIdFromConditions(req: HttpRequest): number | null {
  const conditions = req.query.get('conditions') ?? '';
  const idFromId = parseConditionNumber(conditions, 'id');
  if (idFromId !== null) return idFromId;

  const idFromIdentifier = parseConditionNumber(conditions, 'identifier');
  if (idFromIdentifier !== null) return idFromIdentifier;

  const companyName = parseConditionValue(conditions, 'name') ?? parseConditionValue(conditions, 'identifier');
  if (!companyName) return null;
  const found = CUSTOMER_COMPANIES.find((c) => c.name.toLowerCase() === companyName.toLowerCase());
  return found?.id ?? null;
}

function getCompanyIdFromPath(path: string): number | null {
  const match = path.match(/\/company\/companies\/(\d+)$/);
  if (!match?.[1]) return null;
  return Number(match[1]);
}

function createMember(identifier: string) {
  return { ...MOCK_MEMBER, identifier };
}

function createCompany(identifier: string, id = 1) {
  const customer = CUSTOMER_COMPANIES.find((c) => c.id === id);
  if (customer) {
    return { ...MOCK_COMPANIES[0], id: customer.id, identifier: customer.identifier, name: customer.name };
  }
  return { ...MOCK_COMPANIES[0], id, identifier, name: `Customer ${id}` };
}

function getContactIdFromPath(path: string): number | null {
  const match = path.match(/\/company\/contacts\/(\d+)$/);
  if (!match?.[1]) return null;
  return Number(match[1]);
}

function getLoginCompanyIdFromPath(path: string): string | null {
  const match = path.match(/\/login\/companyinfo\/([^/]+)$/i);
  return match?.[1] ?? null;
}
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

export async function cwShim(req: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const body   = await req.text().catch(() => '');
  logRequest(req, context, body);

  const parsedUrl = new URL(req.url);
  const path   = parsedUrl.pathname;
  const method = req.method?.toUpperCase() ?? 'GET';
  const authIdentifier = getAuthIdentifier(req);
  const identifierFromQuery = getIdentifierFromConditions(req);
  const effectiveIdentifier = identifierFromQuery ?? authIdentifier;
  const h      = { 'Content-Type': 'application/json' };

  if (method === 'OPTIONS') return { status: 200, headers: h, jsonBody: {} };
  const loginCompanyId = getLoginCompanyIdFromPath(path);
  if (loginCompanyId && method === 'GET') {
    return {
      status: 200,
      headers: h,
      jsonBody: {
        CompanyName: loginCompanyId,
        Codebase: 'v4_6_release/',
        VersionCode: 'v4.6',
        VersionNumber: MOCK_COMPANY_INFO_VERSION_NUMBER,
        CompanyID: loginCompanyId,
        IsCloud: true,
        SiteUrl: parsedUrl.host
      }
    };
  }

  if (path.includes('/system/info'))            return { status: 200, headers: h, jsonBody: MOCK_SYSTEM_INFO };
  if (path.includes('/system/members/me'))      return { status: 200, headers: h, jsonBody: createMember(authIdentifier) };
  if (path.match(/\/system\/members\/count$/) && method === 'GET')
                                               return { status: 200, headers: h, jsonBody: { count: 1 } };
  if (path.match(/\/system\/members\/\d+$/))    return { status: 200, headers: h, jsonBody: createMember(effectiveIdentifier) };
  if (path.includes('/system/members') && method === 'GET')
                                               return { status: 200, headers: h, jsonBody: [createMember(effectiveIdentifier)] };
  if (path.includes('/service/boards') && !path.match(/\/boards\/\d+/))
                                                return { status: 200, headers: h, jsonBody: MOCK_BOARDS };
  if (path.match(/\/service\/boards\/\d+$/) && method === 'GET')
                                               return { status: 200, headers: h, jsonBody: MOCK_BOARDS[0] };
  if (path.match(/\/service\/boards\/\d+\/statuses/))
                                                return { status: 200, headers: h, jsonBody: MOCK_STATUSES };
  if (path.match(/\/service\/boards\/\d+\/types\/\d+\/subtypes\/count$/) && method === 'GET')
                                               return { status: 200, headers: h, jsonBody: { count: MOCK_SUBTYPES.length } };
  if (path.match(/\/service\/boards\/\d+\/types\/\d+\/subtypes$/) && method === 'GET')
                                               return { status: 200, headers: h, jsonBody: MOCK_SUBTYPES };
  if (path.match(/\/service\/boards\/\d+\/types\/count$/) && method === 'GET')
                                               return { status: 200, headers: h, jsonBody: { count: MOCK_TYPES.length } };
  if (path.match(/\/service\/boards\/\d+\/types$/) && method === 'GET')
                                               return { status: 200, headers: h, jsonBody: MOCK_TYPES };
  if (path.includes('/service/priorities'))     return { status: 200, headers: h, jsonBody: MOCK_PRIORITIES };
  if (path.match(/\/company\/contacts\/count$/) && method === 'GET')
                                               return { status: 200, headers: h, jsonBody: { count: MOCK_CONTACTS.length } };
  if (path.includes('/company/contacts') && method === 'GET') {
    const contactId = getContactIdFromPath(path);
    if (contactId !== null) {
      return { status: 200, headers: h, jsonBody: { ...MOCK_CONTACTS[0], id: contactId } };
    }
    return { status: 200, headers: h, jsonBody: MOCK_CONTACTS };
  }
  if (path.match(/\/company\/companies\/count$/) && method === 'GET')
                                               return { status: 200, headers: h, jsonBody: { count: CUSTOMER_COMPANIES.length } };
  if (path.includes('/company/companies') && method === 'GET') {
    const companyIdFromConditions = getCompanyIdFromConditions(req);
    const companyIdFromPath = getCompanyIdFromPath(path);
    const companyId = companyIdFromPath ?? companyIdFromConditions ?? 1;
    if (companyIdFromPath !== null) {
      return { status: 200, headers: h, jsonBody: createCompany(effectiveIdentifier, companyId) };
    }
    if (companyIdFromConditions === null) {
      return { status: 200, headers: h, jsonBody: CUSTOMER_COMPANIES.map((c) => createCompany(c.identifier, c.id)) };
    }
    return { status: 200, headers: h, jsonBody: [createCompany(effectiveIdentifier, companyId)] };
  }

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

for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const) {
  app.http(`cwShim_${method}`, {
    methods:   [method],
    authLevel: 'anonymous',
    route:     '{*path}',
    handler:   cwShim
  });
}
