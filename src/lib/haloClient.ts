import { categoriesFromCatalog, HaloCategoryRef } from './haloTicketPayload';

type HaloRecord = Record<string, unknown>;
type HaloCategoryProbe = {
  endpoint: string;
  result: string;
  count: number;
};

export type HaloConfig = {
  clientId: string;
  clientSecret: string;
  apiUrl: string;
  closedStatusId: number;
  tenant?: string;
};

type HaloToken = {
  accessToken: string;
  expiresAtMs: number;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeApiUrl(apiUrl: string): { apiBaseUrl: string; authBaseUrl: string } {
  const trimmed = apiUrl.trim().replace(/\/+$/, '');
  const apiBaseUrl = trimmed.toLowerCase().endsWith('/api') ? trimmed : `${trimmed}/api`;
  const authBaseUrl = apiBaseUrl.replace(/\/api$/i, '/auth');
  return { apiBaseUrl, authBaseUrl };
}

function asObject(value: unknown): HaloRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as HaloRecord;
}

function extractListPayload(payload: unknown, candidateKeys: string[]): HaloRecord[] {
  if (Array.isArray(payload)) return payload.filter((item): item is HaloRecord => Boolean(asObject(item)));
  const objectPayload = asObject(payload);
  if (!objectPayload) return [];

  for (const key of candidateKeys) {
    const value = objectPayload[key];
    if (Array.isArray(value)) return value.filter((item): item is HaloRecord => Boolean(asObject(item)));
  }
  return [];
}

function readRecordString(record: HaloRecord, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim().length > 0) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return null;
}

export class HaloClient {
  private readonly apiBaseUrl: string;
  private readonly authBaseUrl: string;
  private readonly closedStatusId: number;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly tenant?: string;
  private token: HaloToken | null = null;

  constructor(config: HaloConfig) {
    const { apiBaseUrl, authBaseUrl } = normalizeApiUrl(config.apiUrl);
    this.apiBaseUrl = apiBaseUrl;
    this.authBaseUrl = authBaseUrl;
    this.clientId = config.clientId;
    this.clientSecret = config.clientSecret;
    this.closedStatusId = config.closedStatusId;
    this.tenant = config.tenant?.trim() || undefined;
  }

  private buildAuthTokenUrl(): string {
    if (!this.tenant) return `${this.authBaseUrl}/token`;
    return `${this.authBaseUrl}/token?tenant=${encodeURIComponent(this.tenant)}`;
  }

  private async getAccessToken(): Promise<string> {
    if (this.token && Date.now() < this.token.expiresAtMs - 60_000) {
      return this.token.accessToken;
    }

    const body = new URLSearchParams();
    body.set('grant_type', 'client_credentials');
    body.set('client_id', this.clientId);
    body.set('client_secret', this.clientSecret);
    body.set('scope', 'all');

    const response = await fetch(this.buildAuthTokenUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body
    });

    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(`Halo auth failed (${response.status}): ${JSON.stringify(json)}`);
    }

    const accessToken = typeof json.access_token === 'string' ? json.access_token : '';
    if (!accessToken) {
      throw new Error('Halo auth succeeded but access_token is missing.');
    }

    const expiresIn = typeof json.expires_in === 'number' ? json.expires_in : 3600;
    this.token = {
      accessToken,
      expiresAtMs: Date.now() + expiresIn * 1000
    };
    return accessToken;
  }

  private async request(path: string, init?: RequestInit, attempt = 1): Promise<unknown> {
    const token = await this.getAccessToken();
    const url = `${this.apiBaseUrl}${path}`;
    const response = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        ...(init?.headers ?? {})
      }
    });

    if ((response.status === 429 || response.status >= 500) && attempt < 4) {
      const retryAfter = Number(response.headers.get('retry-after') ?? '0');
      const delayMs = retryAfter > 0 ? retryAfter * 1000 : 500 * 2 ** (attempt - 1);
      await sleep(delayMs);
      return this.request(path, init, attempt + 1);
    }

    const responseText = await response.text();
    let maybeJson: unknown = null;
    if (responseText) {
      try {
        maybeJson = JSON.parse(responseText);
      } catch {
        maybeJson = responseText;
      }
    }
    if (!response.ok) {
      throw new Error(`Halo request failed ${response.status} ${response.statusText} for ${path}: ${responseText.slice(0, 600)}`);
    }
    return maybeJson;
  }

  async listClients(): Promise<HaloRecord[]> {
    const payload = await this.request('/Client?showall=true&includeactive=true&count=2000&pageinate=false', { method: 'GET' });
    return extractListPayload(payload, ['clients', 'client', 'areas']);
  }

  async listUsers(clientId?: number): Promise<HaloRecord[]> {
    const query = new URLSearchParams({
      includeactive: 'true',
      count: '2000',
      pageinate: 'false'
    });
    if (Number.isFinite(clientId)) query.set('client_id', String(clientId));
    const payload = await this.request(`/Users?${query.toString()}`, { method: 'GET' });
    return extractListPayload(payload, ['users', 'user']);
  }

  async listTeams(): Promise<HaloRecord[]> {
    const payload = await this.request('/Team?showall=true', { method: 'GET' });
    return extractListPayload(payload, ['teams', 'team']);
  }

  async getTicketType(ticketTypeId: number): Promise<HaloRecord> {
    const payload = await this.request(`/TicketType/${ticketTypeId}?includedetails=true`, { method: 'GET' });
    return asObject(payload) ?? {};
  }

  async getIncidentTicketType(): Promise<HaloRecord | null> {
    const types = await this.listTicketTypes();
    const incident = types.find((ticketType) => {
      const name = readRecordString(ticketType, ['name', 'tickettypename']);
      return name?.toLowerCase() === 'incident';
    });
    if (!incident) return null;
    const id = Number(readRecordString(incident, ['id', 'tickettype_id']));
    if (!Number.isFinite(id)) return null;
    const hasCategories = (Array.isArray(incident.allowed_category1) && incident.allowed_category1.length > 0)
      || (Array.isArray(incident.allowed_category2) && incident.allowed_category2.length > 0);
    if (hasCategories) return incident;
    const detail = await this.getTicketType(id);
    return { ...incident, ...detail };
  }

  async listSites(clientId: number): Promise<HaloRecord[]> {
    const payload = await this.request(`/Site?client_id=${clientId}&count=500&pageinate=false`, { method: 'GET' });
    return extractListPayload(payload, ['sites', 'site', 'results']);
  }

  async listTicketTypes(clientId?: number): Promise<HaloRecord[]> {
    const query = new URLSearchParams({
      showall: 'true',
      domain: 'reqs'
    });
    if (Number.isFinite(clientId)) query.set('client_id', String(clientId));
    const payload = await this.request(`/TicketType?${query.toString()}`, { method: 'GET' });
    return extractListPayload(payload, ['tickettypes', 'tickettype', 'requesttypes']);
  }

  async listStatuses(ticketTypeId?: number): Promise<HaloRecord[]> {
    const query = new URLSearchParams({
      showall: 'true',
      split_closed: 'true'
    });
    if (Number.isFinite(ticketTypeId)) query.set('tickettype_id', String(ticketTypeId));
    const payload = await this.request(`/Status?${query.toString()}`, { method: 'GET' });
    return extractListPayload(payload, ['statuses', 'status']);
  }

  async listPriorities(): Promise<HaloRecord[]> {
    const payload = await this.request('/Priority?includedistinct=true', { method: 'GET' });
    return extractListPayload(payload, ['priorities', 'priority', 'policies']);
  }

  async listTicketCategories(): Promise<{ categories: HaloCategoryRef[]; attempts: HaloCategoryProbe[] }> {
    const endpoints = [
      '/Category?showall=true&count=1000&pageinate=false',
      '/Category?showall=true',
      '/Categories?showall=true',
      '/TicketCategory?showall=true',
      '/TicketCategories?showall=true'
    ];
    const attempts: HaloCategoryProbe[] = [];
    for (const endpoint of endpoints) {
      try {
        const payload = await this.request(endpoint, { method: 'GET' });
        const rows = extractListPayload(payload, ['categories', 'category', 'ticketcategories', 'ticketcategory', 'results', 'items', 'records']);
        const categories = categoriesFromCatalog(rows);
        const topKeys = Array.isArray(payload)
          ? `array:${payload.length}`
          : payload && typeof payload === 'object'
            ? Object.keys(payload).slice(0, 12).join(',')
            : typeof payload;
        attempts.push({
          endpoint,
          result: categories.length > 0 ? 'ok' : `empty keys=${topKeys}`,
          count: categories.length
        });
        if (categories.length > 0) return { categories, attempts };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        attempts.push({ endpoint, result: message.slice(0, 180), count: 0 });
      }
    }
    return { categories: [], attempts };
  }

  async listTickets(ticketIds?: number[]): Promise<HaloRecord[]> {
    const query = new URLSearchParams({
      count: '200',
      pageinate: 'false'
    });
    if (ticketIds && ticketIds.length > 0) {
      query.set('ticketids', ticketIds.join(','));
    }
    const payload = await this.request(`/Tickets?${query.toString()}`, { method: 'GET' });
    return extractListPayload(payload, ['tickets', 'ticket', 'results']);
  }

  async createTicket(ticket: HaloRecord): Promise<HaloRecord> {
    const payload = await this.request('/Tickets', {
      method: 'POST',
      body: JSON.stringify([ticket])
    });
    const list = extractListPayload(payload, ['tickets', 'ticket', 'results']);
    if (list.length > 0) return list[0];
    return asObject(payload) ?? {};
  }

  async getTicket(ticketId: number): Promise<HaloRecord> {
    const payload = await this.request(`/Tickets/${ticketId}?includedetails=true`, { method: 'GET' });
    return asObject(payload) ?? {};
  }

  async describeAssignment(ticketId: number): Promise<Record<string, unknown>> {
    const ticket = await this.getTicket(ticketId);
    const typeId = Number(readRecordString(ticket, ['tickettype_id', 'tickettype']));
    const teamId = Number(readRecordString(ticket, ['team_id']));
    let ticketType: HaloRecord = {};
    let team: HaloRecord = {};
    if (Number.isFinite(typeId)) {
      try { ticketType = await this.getTicketType(typeId); } catch { ticketType = {}; }
    }
    if (Number.isFinite(teamId)) {
      try {
        team = asObject(await this.request(`/Team/${teamId}?includedetails=true&includeagents=true`, { method: 'GET' })) ?? {};
      } catch { team = {}; }
    }

    const assignmentFields = (record: HaloRecord) => {
      const picked: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(record)) {
        if (!/agent|assign|owner|who|taken|team|tickettype|workflow|user_id|user_name|site_id|site_name|client_id|client_name|category_1|account|manager|sla|priority|round|automatic/i.test(key)) continue;
        if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
          picked[key] = value;
        }
      }
      return picked;
    };

    const agentId = Number(readRecordString(ticket, ['agent_id']));
    let agent: HaloRecord = {};
    if (Number.isFinite(agentId) && agentId > 1) {
      try {
        agent = asObject(await this.request(`/Agent/${agentId}`, { method: 'GET' })) ?? {};
      } catch { agent = {}; }
    }
    const clientId = Number(readRecordString(ticket, ['client_id']));
    const siteId = Number(readRecordString(ticket, ['site_id']));
    let client: HaloRecord = {};
    let site: HaloRecord = {};
    if (Number.isFinite(clientId)) {
      try { client = asObject(await this.request(`/Client/${clientId}`, { method: 'GET' })) ?? {}; } catch { client = {}; }
    }
    if (Number.isFinite(siteId)) {
      try { site = asObject(await this.request(`/Site/${siteId}`, { method: 'GET' })) ?? {}; } catch { site = {}; }
    }
    const identity = (record: HaloRecord) => ({
      id: readRecordString(record, ['id', 'agent_id']),
      name: readRecordString(record, ['name', 'agent_name', 'displayname']),
      firstName: readRecordString(record, ['firstname', 'first_name']),
      lastName: readRecordString(record, ['surname', 'lastname', 'last_name'])
    });
    const workflowId = Number(readRecordString(ticket, ['workflow_id']));
    let workflowSteps: Array<Record<string, unknown>> = [];
    let actions: Array<Record<string, unknown>> = [];
    try {
      const actionPayload = await this.request(`/Actions?ticket_id=${ticketId}&count=20&includehtml=false`, { method: 'GET' });
      const rows = extractListPayload(actionPayload, ['actions', 'action', 'results']);
      actions = rows.slice(0, 10).map((row) => {
        const summary: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(row)) {
          if (!/who|agent|outcome|note|actiondate|datetime|status|assign|hidden|description/i.test(key)) continue;
          if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null) {
            summary[key] = typeof value === 'string' ? value.slice(0, 2000) : value;
          }
        }
        return summary;
      });
    } catch (error) {
      actions = [{ error: error instanceof Error ? error.message.slice(0, 180) : 'action lookup failed' }];
    }
    if (Number.isFinite(workflowId)) {
      try {
        const workflow = asObject(await this.request(`/Workflow/${workflowId}?includedetails=true`, { method: 'GET' })) ?? {};
        const steps = workflow.steps ?? workflow.workflowsteps ?? workflow.actions;
        if (Array.isArray(steps)) {
          workflowSteps = steps.slice(0, 12).map((step) => {
            if (!step || typeof step !== 'object') return {};
            const record = step as HaloRecord;
            const picked: Record<string, unknown> = {};
            for (const [key, value] of Object.entries(record)) {
              if (!/name|seq|step|agent|assign|team|action|type|outcome/i.test(key)) continue;
              if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') picked[key] = value;
            }
            const outcomes = record.outcomes ?? record.actions ?? record.flowactions;
            if (Array.isArray(outcomes)) {
              picked.outcomes = outcomes.slice(0, 8).map((outcome) => {
                if (!outcome || typeof outcome !== 'object') return {};
                const row = outcome as HaloRecord;
                const summary: Record<string, unknown> = {};
                for (const [key, value] of Object.entries(row)) {
                  if (!/name|agent|assign|team|status|outcome|default/i.test(key)) continue;
                  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') summary[key] = value;
                }
                return summary;
              });
            }
            return picked;
          });
        }
      } catch { workflowSteps = []; }
    }

    const teamAgents = Array.isArray(team.agents) ? team.agents.slice(0, 30).map((row) => {
      if (!row || typeof row !== 'object') return {};
      const record = row as HaloRecord;
      return {
        ...identity(record),
        default: record.default ?? record.isdefault ?? record.is_default ?? null,
        automatic: record.exclude_from_automatic_assigning ?? record.automatic ?? null
      };
    }) : [];

    return {
      ticket: assignmentFields(ticket),
      ticketType: assignmentFields(ticketType),
      team: assignmentFields(team),
      teamAgents,
      agent: { ...identity(agent), ...assignmentFields(agent) },
      client: { name: readRecordString(client, ['name']), ...assignmentFields(client) },
      site: { name: readRecordString(site, ['name']), ...assignmentFields(site) },
      workflowSteps,
      actions,
      teamFieldCount: Object.keys(team).length,
      teamScalars: Object.entries(team)
        .filter(([, value]) => typeof value === 'number' || typeof value === 'boolean' || (typeof value === 'string' && value.length > 0 && value.length < 80 && !value.startsWith('/')))
        .map(([key, value]) => [key, value])
    };
  }

  async closeTicket(ticketId: number, _note: string): Promise<HaloRecord> {
    // Different Halo ticket types accept different closed status IDs.
    // Try the configured default first, then common fallbacks (8=Resolved, 9=Closed).
    const candidateIds = [
      this.closedStatusId,
      ...([8, 9].filter((id) => id !== this.closedStatusId))
    ];

    for (const statusId of candidateIds) {
      try {
        const payload = await this.request('/Tickets', {
          method: 'POST',
          body: JSON.stringify([{ id: ticketId, status_id: statusId }])
        });
        const list = extractListPayload(payload, ['tickets', 'ticket', 'results']);
        if (list.length > 0) return list[0];
        // POST succeeded but returned an empty body; fetch current ticket state.
        return this.getTicket(ticketId);
      } catch {
        // Status ID not valid for this ticket type — try next candidate.
      }
    }

    // All direct status updates failed; return current ticket state unchanged.
    return this.getTicket(ticketId);
  }
}

export function createHaloClientFromEnv(): HaloClient | null {
  const clientId = process.env.HaloClientID?.trim();
  const clientSecret = process.env.HaloSecret?.trim();
  const apiUrl = process.env.HaloUrl?.trim();
  if (!clientId || !clientSecret || !apiUrl) return null;

  const closedStatusIdRaw = process.env.HaloClosedStatusId?.trim() ?? '9';
  const closedStatusId = Number(closedStatusIdRaw);

  return new HaloClient({
    clientId,
    clientSecret,
    apiUrl,
    closedStatusId: Number.isFinite(closedStatusId) ? closedStatusId : 9,
    tenant: process.env.HaloTenant?.trim()
  });
}
