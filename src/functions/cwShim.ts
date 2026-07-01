import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { createHaloClientFromEnv } from '../lib/haloClient';

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
  { id: 1, name: 'Integrid LLC', identifier: '1' },
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
const CREATED_TICKETS = new Map<number, Record<string, unknown>>();
const haloClosedStatusRaw = process.env.HaloClosedStatusId;
const HALO_CLOSED_STATUS_ID = Number(
  typeof haloClosedStatusRaw === 'string' && haloClosedStatusRaw.trim().length > 0
    ? haloClosedStatusRaw
    : '9'
) || 9;
const haloClient = createHaloClientFromEnv();

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function getValueString(record: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (trimmed.length > 0) return trimmed;
  }
  return null;
}

function getValueNumber(record: Record<string, unknown>, ...keys: string[]): number | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim().length > 0) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}

function getValueBoolean(record: Record<string, unknown>, ...keys: string[]): boolean | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      if (value.toLowerCase() === 'true') return true;
      if (value.toLowerCase() === 'false') return false;
    }
  }
  return null;
}

function mapHaloClientToCompany(client: Record<string, unknown>): Record<string, unknown> {
  const id = getValueNumber(client, 'id', 'client_id') ?? 1;
  const name = getValueString(client, 'name', 'client_name') ?? `Client ${id}`;
  return {
    ...MOCK_COMPANIES[0],
    id,
    identifier: String(id),
    name
  };
}

function mapHaloUserToContact(user: Record<string, unknown>): Record<string, unknown> {
  const id = getValueNumber(user, 'id', 'user_id') ?? 1;
  const firstName = getValueString(user, 'firstname', 'first_name') ?? '';
  const lastName = getValueString(user, 'surname', 'last_name') ?? '';
  const explicitName = getValueString(user, 'name', 'displayname');
  const fallbackName = `${firstName} ${lastName}`.trim();
  const fullName = explicitName !== null ? explicitName : (fallbackName || `Contact ${id}`);
  return {
    id,
    firstName,
    lastName,
    name: fullName
  };
}

function mapHaloTeamToBoard(team: Record<string, unknown>): Record<string, unknown> {
  const id = getValueNumber(team, 'id', 'team_id') ?? 1;
  const name = getValueString(team, 'name', 'team') ?? `Board ${id}`;
  return {
    id,
    name,
    locationId: 1,
    businessUnitId: 1,
    inactive: getValueBoolean(team, 'inactive', 'isdisabled') ?? false
  };
}

function mapHaloTypeToType(ticketType: Record<string, unknown>): Record<string, unknown> {
  const id = getValueNumber(ticketType, 'id', 'tickettype_id') ?? 1;
  const teamId = getValueNumber(ticketType, 'team_id', 'board_id') ?? 1;
  const name = getValueString(ticketType, 'name', 'tickettypename') ?? `Type ${id}`;
  return {
    id,
    name,
    boardId: teamId,
    inactiveFlag: getValueBoolean(ticketType, 'inactive', 'inactiveflag') ?? false
  };
}

function mapHaloStatusToStatus(status: Record<string, unknown>): Record<string, unknown> {
  const id = getValueNumber(status, 'id', 'status_id') ?? 1;
  const name = getValueString(status, 'name', 'status_name') ?? `Status ${id}`;
  const statusType = (getValueString(status, 'status_type', 'type') ?? '').toLowerCase();
  const inferredClosed = statusType.includes('closed') || name.toLowerCase().includes('closed') || name.toLowerCase().includes('resolved');
  return {
    id,
    boardId: 1,
    name,
    sortOrder: getValueNumber(status, 'sortorder', 'order') ?? id,
    closedStatus: id === HALO_CLOSED_STATUS_ID || inferredClosed
  };
}

function mapHaloPriorityToPriority(priority: Record<string, unknown>): Record<string, unknown> {
  const id = getValueNumber(priority, 'id', 'priority_id') ?? 1;
  const name = getValueString(priority, 'name', 'priority_name') ?? `Priority ${id}`;
  return {
    id,
    name,
    sortOrder: getValueNumber(priority, 'sortorder', 'order') ?? id
  };
}

function mapHaloTicketToConnectWise(ticket: Record<string, unknown>, fallbackIdentifier: string): Record<string, unknown> {
  const id = getValueNumber(ticket, 'id', 'ticket_id') ?? Math.floor(Math.random() * 90000) + 10000;
  const companyId = getValueNumber(ticket, 'client_id') ?? 1;
  const companyName = getValueString(ticket, 'client_name') ?? `Client ${companyId}`;
  const company = resolveCompanyFromIdentifier(String(companyId), fallbackIdentifier);
  if (typeof company.name === 'string' && company.name.startsWith('Customer')) {
    company.name = companyName;
    company.identifier = String(companyId);
    company.id = companyId;
  }

  return {
    id,
    summary: getValueString(ticket, 'summary', 'title') ?? 'Shim ticket',
    initialDescription: getValueString(ticket, 'details', 'description') ?? '',
    status: {
      id: getValueNumber(ticket, 'status_id') ?? 1,
      name: getValueString(ticket, 'status_name', 'status') ?? 'New'
    },
    board: {
      id: getValueNumber(ticket, 'team_id', 'board_id') ?? 1,
      name: getValueString(ticket, 'team', 'board_name') ?? 'Service Desk'
    },
    company,
    contact: {
      id: getValueNumber(ticket, 'user_id', 'contact_id') ?? 1,
      name: getValueString(ticket, 'user_name', 'contact_name') ?? MOCK_CONTACTS[0].name
    },
    type: {
      id: getValueNumber(ticket, 'tickettype_id', 'type_id') ?? 1,
      name: getValueString(ticket, 'tickettype_name', 'type_name') ?? 'General'
    },
    requiredDate: getValueString(ticket, 'dateoccurred', 'required_date') ?? new Date().toISOString(),
    _info: {
      lastUpdated: getValueString(ticket, 'lastactiondate', 'dateupdated') ?? new Date().toISOString()
    }
  };
}

function extractTicketId(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function getTicketIdFromPayload(payload: Record<string, unknown>): number | null {
  const direct = extractTicketId(payload.ticketid ?? payload.ticketId ?? payload.id);
  if (direct !== null) return direct;

  const ticket = asRecord(payload.ticket);
  if (ticket) {
    const nested = extractTicketId(ticket.id ?? ticket.ticketid ?? ticket.ticketId);
    if (nested !== null) return nested;
  }
  return null;
}

function payloadLooksResolved(payload: Record<string, unknown>): boolean {
  const boolChecks = [payload.resolved, payload.isResolved, payload.closed, payload.isClosed];
  for (const value of boolChecks) {
    if (value === true) return true;
  }
  const statusCandidate = typeof payload.status === 'string'
    ? payload.status
    : getValueString(asRecord(payload.status) ?? {}, 'name', 'status');
  if (!statusCandidate) return false;
  const lower = statusCandidate.toLowerCase();
  return lower.includes('resolve') || lower.includes('closed');
}

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

function parseConditionBoolean(conditions: string, field: string): boolean | null {
  const value = parseConditionValue(conditions, field);
  if (!value) return null;
  if (value.toLowerCase() === 'true') return true;
  if (value.toLowerCase() === 'false') return false;
  return null;
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

function getNestedString(record: Record<string, unknown>, parentKey: string, key: string): string | null {
  const parent = record[parentKey];
  if (!parent || typeof parent !== 'object') return null;
  const value = (parent as Record<string, unknown>)[key];
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function getNestedNumber(record: Record<string, unknown>, parentKey: string, key: string): number | null {
  const parent = record[parentKey];
  if (!parent || typeof parent !== 'object') return null;
  const value = (parent as Record<string, unknown>)[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function resolveCompanyFromIdentifier(identifier: string | null, fallbackIdentifier: string): Record<string, unknown> {
  if (!identifier) return createCompany(fallbackIdentifier, 1);

  const customerByIdentifier = CUSTOMER_COMPANIES.find((c) => c.identifier.toLowerCase() === identifier.toLowerCase());
  if (customerByIdentifier) return createCompany(customerByIdentifier.identifier, customerByIdentifier.id);

  const customerByName = CUSTOMER_COMPANIES.find((c) => c.name.toLowerCase() === identifier.toLowerCase());
  if (customerByName) return createCompany(customerByName.identifier, customerByName.id);

  const asId = Number(identifier);
  if (Number.isFinite(asId)) return createCompany(identifier, asId);

  return createCompany(identifier, 1);
}

function applyPatchOperations(base: Record<string, unknown>, operations: unknown[]): Record<string, unknown> {
  const output = { ...base };
  for (const operation of operations) {
    if (!operation || typeof operation !== 'object') continue;
    const opRecord = operation as Record<string, unknown>;
    if (opRecord.op !== 'replace' && opRecord.op !== 'add') continue;
    if (typeof opRecord.path !== 'string') continue;
    const path = opRecord.path.split('/').filter(Boolean);
    if (path.length === 0) continue;

    if (path.length === 1) {
      output[path[0]] = opRecord.value;
      continue;
    }

    const [head, tail] = path;
    const parent = output[head];
    if (!parent || typeof parent !== 'object') continue;
    (parent as Record<string, unknown>)[tail] = opRecord.value;
  }
  return output;
}

function filterStatuses(conditions: string, sourceStatuses: Record<string, unknown>[] = MOCK_STATUSES) {
  let statuses = [...sourceStatuses];
  const id = parseConditionNumber(conditions, 'id');
  if (id !== null) statuses = statuses.filter((status) => status.id === id);
  const name = parseConditionValue(conditions, 'name');
  if (name) statuses = statuses.filter((status) => typeof status.name === 'string' && status.name.toLowerCase() === name.toLowerCase());
  const closedStatus = parseConditionBoolean(conditions, 'closedStatus');
  if (closedStatus !== null) statuses = statuses.filter((status) => status.closedStatus === closedStatus);
  return statuses;
}

function filterPriorities(conditions: string, sourcePriorities: Record<string, unknown>[] = MOCK_PRIORITIES) {
  let priorities = [...sourcePriorities];
  const id = parseConditionNumber(conditions, 'id');
  if (id !== null) priorities = priorities.filter((priority) => priority.id === id);
  const name = parseConditionValue(conditions, 'name');
  if (name) priorities = priorities.filter((priority) => typeof priority.name === 'string' && priority.name.toLowerCase() === name.toLowerCase());
  return priorities;
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

function getTypeIdFromSubtypePath(path: string): number | null {
  const match = path.match(/\/service\/boards\/\d+\/types\/(\d+)\/subtypes/);
  if (!match?.[1]) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

function getBoardIdFromPath(path: string): number | null {
  const match = path.match(/\/service\/boards\/(\d+)/);
  if (!match?.[1]) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

async function getHaloCompanies(context: InvocationContext): Promise<Record<string, unknown>[]> {
  if (!haloClient) return CUSTOMER_COMPANIES.map((c) => createCompany(c.identifier, c.id));
  const clients = await haloClient.listClients();
  const mapped = clients.map(mapHaloClientToCompany);
  context.log(`HALO_COMPANIES count=${mapped.length}`);
  return mapped;
}

async function getHaloContacts(context: InvocationContext, clientId?: number): Promise<Record<string, unknown>[]> {
  if (!haloClient) return [...MOCK_CONTACTS];
  const users = await haloClient.listUsers(clientId);
  const mapped = users.map(mapHaloUserToContact);
  context.log(`HALO_CONTACTS count=${mapped.length}`);
  return mapped;
}

async function getHaloBoards(context: InvocationContext): Promise<Record<string, unknown>[]> {
  if (!haloClient) return [...MOCK_BOARDS];
  const teams = await haloClient.listTeams();
  const mapped = teams.map(mapHaloTeamToBoard);
  context.log(`HALO_BOARDS count=${mapped.length}`);
  return mapped;
}

async function getHaloTypes(context: InvocationContext): Promise<Record<string, unknown>[]> {
  if (!haloClient) return [...MOCK_TYPES];
  const types = await haloClient.listTicketTypes();
  const mapped = types.map(mapHaloTypeToType);
  context.log(`HALO_TYPES count=${mapped.length}`);
  return mapped;
}

async function getHaloStatuses(context: InvocationContext): Promise<Record<string, unknown>[]> {
  if (!haloClient) return [...MOCK_STATUSES];
  const statuses = await haloClient.listStatuses();
  const mapped = statuses.map(mapHaloStatusToStatus);
  context.log(`HALO_STATUSES count=${mapped.length}`);
  return mapped;
}

async function getHaloPriorities(context: InvocationContext): Promise<Record<string, unknown>[]> {
  if (!haloClient) return [...MOCK_PRIORITIES];
  const priorities = await haloClient.listPriorities();
  const mapped = priorities.map(mapHaloPriorityToPriority);
  context.log(`HALO_PRIORITIES count=${mapped.length}`);
  return mapped;
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

  try {
    if (path.includes('/system/info'))            return { status: 200, headers: h, jsonBody: MOCK_SYSTEM_INFO };
    if (path.includes('/system/members/me'))      return { status: 200, headers: h, jsonBody: createMember(authIdentifier) };
    if (path.match(/\/system\/members\/count$/) && method === 'GET')
                                                 return { status: 200, headers: h, jsonBody: { count: 1 } };
    if (path.match(/\/system\/members\/\d+$/))    return { status: 200, headers: h, jsonBody: createMember(effectiveIdentifier) };
    if (path.includes('/system/members') && method === 'GET')
                                                 return { status: 200, headers: h, jsonBody: [createMember(effectiveIdentifier)] };
    if (path.includes('/service/boards') && !path.match(/\/boards\/\d+/)) {
      const boards = await getHaloBoards(context);
      return { status: 200, headers: h, jsonBody: boards };
    }
    if (path.match(/\/service\/boards\/\d+$/) && method === 'GET') {
      const boardId = getBoardIdFromPath(path) ?? 1;
      const boards = await getHaloBoards(context);
      const board = boards.find((candidate) => candidate.id === boardId) ?? boards[0] ?? MOCK_BOARDS[0];
      return { status: 200, headers: h, jsonBody: board };
    }
    if (path.match(/\/service\/boards\/\d+\/statuses/)) {
      const conditions = req.query.get('conditions') ?? '';
      const statuses = await getHaloStatuses(context);
      return { status: 200, headers: h, jsonBody: filterStatuses(conditions, statuses) };
    }
    if (path.match(/\/service\/boards\/\d+\/types\/\d+\/subtypes\/count$/) && method === 'GET') {
      const typeId = getTypeIdFromSubtypePath(path);
      if (typeId === null) return { status: 200, headers: h, jsonBody: { count: 0 } };
      const subtypes = [{ id: typeId, name: 'Default', boardId: 1, typeId, inactiveFlag: false }];
      return { status: 200, headers: h, jsonBody: { count: subtypes.length } };
    }
    if (path.match(/\/service\/boards\/\d+\/types\/\d+\/subtypes$/) && method === 'GET') {
      const typeId = getTypeIdFromSubtypePath(path);
      if (typeId === null) return { status: 200, headers: h, jsonBody: [] };
      return {
        status: 200,
        headers: h,
        jsonBody: [{ id: typeId, name: 'Default', boardId: 1, typeId, inactiveFlag: false }]
      };
    }
    if (path.match(/\/service\/boards\/\d+\/types\/count$/) && method === 'GET') {
      const types = await getHaloTypes(context);
      return { status: 200, headers: h, jsonBody: { count: types.length } };
    }
    if (path.match(/\/service\/boards\/\d+\/types$/) && method === 'GET') {
      const types = await getHaloTypes(context);
      return { status: 200, headers: h, jsonBody: types };
    }
    if (path.includes('/service/priorities')) {
      const conditions = req.query.get('conditions') ?? '';
      const priorities = await getHaloPriorities(context);
      return { status: 200, headers: h, jsonBody: filterPriorities(conditions, priorities) };
    }
    if (path.match(/\/company\/contacts\/count$/) && method === 'GET') {
      const contacts = await getHaloContacts(context);
      return { status: 200, headers: h, jsonBody: { count: contacts.length } };
    }
    if (path.includes('/company/contacts') && method === 'GET') {
      const conditions = req.query.get('conditions') ?? '';
      const requestedCompanyId = parseConditionNumber(conditions, 'company/id') ?? parseConditionNumber(conditions, 'company.id');
      let contacts = await getHaloContacts(context, requestedCompanyId ?? undefined);
      const contactIdFromConditions = parseConditionNumber(conditions, 'id');
      const contactNameFromConditions = parseConditionValue(conditions, 'name');
      if (contactIdFromConditions !== null) contacts = contacts.filter((contact) => contact.id === contactIdFromConditions);
      if (contactNameFromConditions) {
        contacts = contacts.filter((contact) => typeof contact.name === 'string' && contact.name.toLowerCase() === contactNameFromConditions.toLowerCase());
      }

      const contactId = getContactIdFromPath(path);
      if (contactId !== null) {
        const contact = contacts.find((candidate) => candidate.id === contactId) ?? contacts[0] ?? { ...MOCK_CONTACTS[0], id: contactId };
        return { status: 200, headers: h, jsonBody: contact };
      }
      return { status: 200, headers: h, jsonBody: contacts };
    }
    if (path.match(/\/company\/companies\/count$/) && method === 'GET') {
      const companies = await getHaloCompanies(context);
      return { status: 200, headers: h, jsonBody: { count: companies.length } };
    }
    if (path.includes('/company/companies') && method === 'GET') {
      const companies = await getHaloCompanies(context);
      const conditions = req.query.get('conditions') ?? '';
      const companyIdFromPath = getCompanyIdFromPath(path);
      if (companyIdFromPath !== null) {
        const company = companies.find((candidate) => candidate.id === companyIdFromPath)
          ?? createCompany(effectiveIdentifier, companyIdFromPath);
        return { status: 200, headers: h, jsonBody: company };
      }

      const companyIdFromConditions = getCompanyIdFromConditions(req);
      const companyNameFromConditions = parseConditionValue(conditions, 'name');
      if (companyIdFromConditions === null && !companyNameFromConditions) {
        return { status: 200, headers: h, jsonBody: companies };
      }

      const filtered = companies.filter((company) => {
        if (companyIdFromConditions !== null) return company.id === companyIdFromConditions;
        if (!companyNameFromConditions) return true;
        return typeof company.name === 'string' && company.name.toLowerCase() === companyNameFromConditions.toLowerCase();
      });
      if (filtered.length === 0 && companyIdFromConditions !== null) {
        return { status: 200, headers: h, jsonBody: [createCompany(effectiveIdentifier, companyIdFromConditions)] };
      }
      return { status: 200, headers: h, jsonBody: filtered };
    }

    if (path.includes('/service/tickets') && method === 'POST') {
      let parsedUnknown: unknown = {};
      try { parsedUnknown = JSON.parse(body); } catch {}
      const parsed = asRecord(parsedUnknown) ?? {};

      if (haloClient) {
        const ticketIdFromPayload = getTicketIdFromPayload(parsed);
        if (ticketIdFromPayload !== null && payloadLooksResolved(parsed)) {
          const closedTicket = await haloClient.closeTicket(ticketIdFromPayload, 'Closed from Axcient resolved alert.');
          const closedResponse = mapHaloTicketToConnectWise(closedTicket, effectiveIdentifier);
          CREATED_TICKETS.set(ticketIdFromPayload, closedResponse);
          return { status: 200, headers: h, jsonBody: closedResponse };
        }

        const [companies, boards, types, priorities] = await Promise.all([
          getHaloCompanies(context),
          getHaloBoards(context),
          getHaloTypes(context),
          getHaloPriorities(context)
        ]);

        const companyIdentifier = getNestedString(parsed, 'company', 'identifier')
          ?? getNestedString(parsed, 'company', 'id')
          ?? getNestedString(parsed, 'company', 'name');
        const boardName = getNestedString(parsed, 'board', 'name') ?? 'Service Desk';
        const typeName = getNestedString(parsed, 'type', 'name') ?? 'General';
        const priorityName = getNestedString(parsed, 'priority', 'name');
        const contactId = getNestedNumber(parsed, 'contact', 'id');
        const summary = typeof parsed.summary === 'string' && parsed.summary.trim().length > 0
          ? parsed.summary
          : 'Shim ticket';
        const initialDescription = typeof parsed.initialDescription === 'string' ? parsed.initialDescription : '';

        const companyFromName = companies.find((company) => {
          if (!companyIdentifier) return false;
          const normalized = companyIdentifier.toLowerCase();
          return String(company.identifier ?? '').toLowerCase() === normalized
            || String(company.name ?? '').toLowerCase() === normalized
            || String(company.id ?? '') === companyIdentifier;
        });
        const resolvedCompanyId = companyFromName ? Number(companyFromName.id) : Number(companyIdentifier);
        const resolvedBoard = boards.find((board) => String(board.name).toLowerCase() === boardName.toLowerCase());
        const resolvedType = types.find((type) => String(type.name).toLowerCase() === typeName.toLowerCase());
        const resolvedPriority = priorities.find((priority) => {
          if (!priorityName) return false;
          return String(priority.name).toLowerCase() === priorityName.toLowerCase();
        });

        const haloCreatePayload: Record<string, unknown> = {
          summary,
          details: initialDescription
        };
        if (Number.isFinite(resolvedCompanyId)) haloCreatePayload.client_id = resolvedCompanyId;
        if (resolvedBoard?.id) haloCreatePayload.team_id = resolvedBoard.id;
        if (resolvedType?.id) haloCreatePayload.tickettype_id = resolvedType.id;
        if (resolvedPriority?.id) haloCreatePayload.priority_id = resolvedPriority.id;
        if (contactId !== null) haloCreatePayload.user_id = contactId;

        const createdTicket = await haloClient.createTicket(haloCreatePayload);
        const mappedTicket = mapHaloTicketToConnectWise(createdTicket, effectiveIdentifier);
        const mappedTicketId = extractTicketId(mappedTicket.id) ?? Math.floor(Math.random() * 90000) + 10000;
        CREATED_TICKETS.set(mappedTicketId, mappedTicket);
        context.log(`TICKET_CREATE halo_id=${mappedTicketId}`, JSON.stringify(haloCreatePayload));
        return {
          status: 201,
          headers: h,
          jsonBody: mappedTicket
        };
      }

      const fakeId = Math.floor(Math.random() * 90000) + 10000;
      const companyIdentifier = getNestedString(parsed, 'company', 'identifier')
        ?? getNestedString(parsed, 'company', 'id');
      const company = resolveCompanyFromIdentifier(companyIdentifier, effectiveIdentifier);
      const boardName = getNestedString(parsed, 'board', 'name') ?? 'Service Desk';
      const typeName = getNestedString(parsed, 'type', 'name') ?? 'General';
      const contactId = getNestedNumber(parsed, 'contact', 'id') ?? 1;
      const summary = typeof parsed.summary === 'string' && parsed.summary.trim().length > 0
        ? parsed.summary
        : 'Shim ticket';
      const requiredDate = typeof parsed.requiredDate === 'string' ? parsed.requiredDate : new Date().toISOString();

      const ticket = {
        id: fakeId,
        summary,
        initialDescription: typeof parsed.initialDescription === 'string' ? parsed.initialDescription : '',
        status: { id: 1, name: 'New' },
        board: { id: 1, name: boardName },
        company,
        contact: { id: contactId, name: MOCK_CONTACTS[0].name },
        type: { id: 1, name: typeName },
        requiredDate,
        _info: { lastUpdated: new Date().toISOString() }
      };
      CREATED_TICKETS.set(fakeId, ticket);
      context.log(`TICKET_CREATE fake_id=${fakeId}`, JSON.stringify(parsed));
      return {
        status: 201, headers: h,
        jsonBody: ticket
      };
    }

    if (path.match(/\/service\/tickets\/\d+/) && (method === 'PUT' || method === 'PATCH')) {
      const ticketId = path.match(/\/tickets\/(\d+)/)?.[1];
      let parsed: Record<string, unknown> | unknown[] = {};
      try { parsed = JSON.parse(body); } catch {}
      const numericTicketId = Number(ticketId);

      if (haloClient) {
        const closeNote = 'Closed from Axcient resolved alert.';
        const closedTicket = await haloClient.closeTicket(numericTicketId, closeNote);
        const mappedTicket = mapHaloTicketToConnectWise(closedTicket, effectiveIdentifier);
        CREATED_TICKETS.set(numericTicketId, mappedTicket);
        context.log(`TICKET_CLOSE halo_id=${ticketId}`, JSON.stringify(parsed));
        return { status: 200, headers: h, jsonBody: mappedTicket };
      }

      const base = CREATED_TICKETS.get(numericTicketId) ?? { id: numericTicketId, status: { id: 1, name: 'New' } };
      const updated = Array.isArray(parsed)
        ? applyPatchOperations(base, parsed)
        : { ...base, ...parsed };
      CREATED_TICKETS.set(numericTicketId, updated);
      context.log(`TICKET_UPDATE id=${ticketId}`, JSON.stringify(parsed));
      return { status: 200, headers: h, jsonBody: updated };
    }

    if (path.match(/\/service\/tickets\/\d+/) && method === 'GET') {
      const ticketId = Number(path.match(/\/tickets\/(\d+)/)?.[1]);
      if (haloClient) {
        const ticket = await haloClient.getTicket(ticketId);
        const mappedTicket = mapHaloTicketToConnectWise(ticket, effectiveIdentifier);
        CREATED_TICKETS.set(ticketId, mappedTicket);
        return { status: 200, headers: h, jsonBody: mappedTicket };
      }
      const ticket = CREATED_TICKETS.get(ticketId);
      if (ticket) return { status: 200, headers: h, jsonBody: ticket };
      return { status: 200, headers: h, jsonBody: { id: ticketId, status: { id: 1, name: 'New' } } };
    }

    if (path.includes('/service/tickets') && method === 'GET') {
      if (!haloClient) return { status: 200, headers: h, jsonBody: Array.from(CREATED_TICKETS.values()) };

      const cachedIds = Array.from(CREATED_TICKETS.keys());
      if (cachedIds.length === 0) return { status: 200, headers: h, jsonBody: [] };
      const haloTickets = await haloClient.listTickets(cachedIds);
      const mapped = haloTickets.map((ticket) => mapHaloTicketToConnectWise(ticket, effectiveIdentifier));
      return { status: 200, headers: h, jsonBody: mapped };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    context.error(`HALO_UPSTREAM_ERROR ${errorMessage}`);
    return {
      status: 502,
      headers: h,
      jsonBody: {
        error: 'Halo upstream request failed.',
        detail: errorMessage
      }
    };
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
