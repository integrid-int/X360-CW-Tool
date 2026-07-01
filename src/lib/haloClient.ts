type HaloRecord = Record<string, unknown>;

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

  async closeTicket(ticketId: number, note: string): Promise<HaloRecord> {
    try {
      const payload = await this.request('/Tickets', {
        method: 'POST',
        body: JSON.stringify([{ id: ticketId, status_id: this.closedStatusId }])
      });
      const list = extractListPayload(payload, ['tickets', 'ticket', 'results']);
      if (list.length > 0) return list[0];
    } catch {
      // Fallback action-based close for tenants configured this way.
      await this.request('/Actions', {
        method: 'POST',
        body: JSON.stringify([{
          ticket_id: ticketId,
          outcome_id: this.closedStatusId,
          note,
          private_note: true,
          sendemail: false
        }])
      });
    }
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
