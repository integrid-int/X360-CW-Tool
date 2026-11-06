export type HaloCategoryRef = {
  id: string;
  name: string;
  parentId: string | null;
  level?: number;
  ticketTypeId?: number;
};

export type HaloTicketBuildInput = {
  summary: string;
  details: string;
  companyIdentifier: string | null;
  companies: Array<Record<string, unknown>>;
  customerCompanies: Array<{ id: number; name: string; identifier: string }>;
  companyMap: Record<string, number>;
  boards: Array<Record<string, unknown>>;
  boardId: number | null;
  boardName: string | null;
  types: Array<Record<string, unknown>>;
  typeId: number | null;
  typeName: string | null;
  priorities: Array<Record<string, unknown>>;
  priorityName: string | null;
  contacts: Array<Record<string, unknown>>;
  contactId: number | null;
  siteId?: number | null;
  categories: HaloCategoryRef[];
  categoryLevel1: string;
  categoryLevel2: string;
  category1IdOverride?: string | null;
  category2IdOverride?: string | null;
};

export type HaloTicketBuildResult =
  | { ok: true; payload: Record<string, unknown> }
  | { ok: false; error: string };

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function readNumber(record: Record<string, unknown>, ...keys: string[]): number | null {
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

function readString(record: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (trimmed.length > 0) return trimmed;
  }
  return null;
}

function findById(items: Array<Record<string, unknown>>, id: number | null): Record<string, unknown> | null {
  if (id === null) return null;
  return items.find((item) => readNumber(item, 'id') === id) ?? null;
}

function findByName(items: Array<Record<string, unknown>>, name: string | null): Record<string, unknown> | null {
  if (!name) return null;
  const wanted = name.toLowerCase();
  return items.find((item) => (readString(item, 'name') ?? '').toLowerCase() === wanted) ?? null;
}

export function resolveHaloClientId(input: Pick<HaloTicketBuildInput, 'companyIdentifier' | 'companies' | 'customerCompanies' | 'companyMap'>): number | null {
  const raw = input.companyIdentifier?.trim() ?? '';
  if (raw.length === 0) return null;
  const lower = raw.toLowerCase();

  const direct = input.companies.find((company) => {
    return String(company.identifier ?? '').toLowerCase() === lower
      || String(company.name ?? '').toLowerCase() === lower
      || String(company.id ?? '') === raw;
  });
  if (direct) return readNumber(direct, 'id');

  const customer = input.customerCompanies.find((item) => {
    return item.identifier.toLowerCase() === lower
      || String(item.id) === raw
      || item.name.toLowerCase() === lower;
  });
  if (customer) {
    const wanted = normalizeName(customer.name);
    const byName = input.companies.find((company) => normalizeName(readString(company, 'name') ?? '') === wanted);
    if (byName) return readNumber(byName, 'id');
  }

  const mapKeys = [raw, lower, customer?.identifier ?? '', customer?.name ?? '']
    .filter((key) => key.length > 0);
  const wanted = new Set(mapKeys.flatMap((key) => [key.toLowerCase(), normalizeName(key)]));
  for (const [key, mapped] of Object.entries(input.companyMap)) {
    if (!Number.isFinite(mapped)) continue;
    if (wanted.has(key.toLowerCase()) || wanted.has(normalizeName(key))) return mapped;
  }
  return null;
}

export function categoriesFromTicketType(ticketType: Record<string, unknown>): HaloCategoryRef[] {
  const nested = ticketType.tickettype ?? ticketType.ticketType;
  const source = nested && typeof nested === 'object' && !Array.isArray(nested)
    ? nested as Record<string, unknown>
    : ticketType;
  const ticketTypeId = readNumber(source, 'id', 'tickettype_id') ?? readNumber(ticketType, 'id', 'tickettype_id');
  const categories: HaloCategoryRef[] = [];
  for (const level of [1, 2, 3, 4]) {
    const rows = source[`allowed_category${level}`] ?? source[`allowed_category_${level}`];
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      if (!row || typeof row !== 'object') continue;
      const record = row as Record<string, unknown>;
      const id = readString(record, 'category_id', 'id', 'value');
      const name = readString(record, 'category_value', 'name', 'value_name', 'category');
      if (!id || !name || id === name) continue;
      categories.push({
        id,
        name,
        parentId: null,
        level,
        ticketTypeId: ticketTypeId ?? undefined
      });
    }
  }
  return categories;
}

export function categoriesFromCatalog(rows: Array<Record<string, unknown>>): HaloCategoryRef[] {
  const categories: HaloCategoryRef[] = [];
  for (const row of rows) {
    const id = readString(row, 'id', 'category_id', 'ticketcategory_id');
    const name = readString(row, 'category_name', 'name', 'category', 'label', 'text', 'value_name');
    if (!id || !name || id === name) continue;
    const parentId = readString(row, 'parent_id', 'parentid', 'parentcategory_id', 'parentcategoryid');
    const parent = parentId && parentId !== '0' ? parentId : null;
    categories.push({
      id,
      name,
      parentId: parent,
      level: parent ? 2 : 1
    });
  }
  return categories;
}

function resolveCategoryIds(input: HaloTicketBuildInput): { category1: string; category2: string; ticketTypeId: number | null } | null {
  const override1 = input.category1IdOverride?.trim() ?? '';
  const override2 = input.category2IdOverride?.trim() ?? '';
  if (override1 && override2) return { category1: override1, category2: override2, ticketTypeId: null };

  const wantedLevel1 = normalizeName(input.categoryLevel1);
  const wantedLevel2 = normalizeName(input.categoryLevel2);
  const level1 = input.categories.find((category) => {
    if (normalizeName(category.name) !== wantedLevel1) return false;
    return category.level === 1 || category.parentId === null || category.parentId === '' || category.parentId === '0';
  }) ?? input.categories.find((category) => normalizeName(category.name) === wantedLevel1);

  const sameType = (category: HaloCategoryRef) => {
    if (!level1 || level1.ticketTypeId === undefined || category.ticketTypeId === undefined) return true;
    return category.ticketTypeId === level1.ticketTypeId;
  };
  const namedChildren = input.categories.filter((category) => normalizeName(category.name) === wantedLevel2 && sameType(category));
  const level2 = namedChildren.find((category) => level1 && category.parentId === level1.id)
    ?? namedChildren.find((category) => category.level === 2)
    ?? namedChildren[0];
  if (level1 && level2) {
    return {
      category1: level1.id,
      category2: level2.id,
      ticketTypeId: level1.ticketTypeId ?? null
    };
  }

  // This Halo tenant stores the full path as the category value, for example "Incident>Backup".
  const wantedPath = normalizeName(`${input.categoryLevel1}>${input.categoryLevel2}`);
  const pathMatch = input.categories.find((category) => normalizeName(category.name) === wantedPath);
  if (!pathMatch) return null;
  return {
    category1: level1?.name ?? input.categoryLevel1,
    category2: pathMatch.name,
    ticketTypeId: level1?.ticketTypeId ?? pathMatch.ticketTypeId ?? null
  };
}

function resolveContactId(input: HaloTicketBuildInput): number | null {
  if (input.contactId !== null) {
    const exact = input.contacts.find((contact) => readNumber(contact, 'id') === input.contactId);
    if (exact) return input.contactId;
  }
  const general = input.contacts.find((contact) => {
    const name = (readString(contact, 'name') ?? '').toLowerCase();
    const firstName = (readString(contact, 'firstName', 'firstname') ?? '').toLowerCase();
    const lastName = (readString(contact, 'lastName', 'surname') ?? '').toLowerCase();
    return name.includes('general') || firstName.includes('general') || lastName.includes('general');
  });
  if (general) return readNumber(general, 'id');
  const first = input.contacts[0];
  return first ? readNumber(first, 'id') : null;
}

export function buildHaloTicketCreateRequest(input: HaloTicketBuildInput): HaloTicketBuildResult {
  const categories = resolveCategoryIds(input);
  if (!categories) {
    return {
      ok: false,
      error: `Halo ticket category ids were not found for ${input.categoryLevel1} > ${input.categoryLevel2}.`
    };
  }

  const payload: Record<string, unknown> = {
    summary: input.summary,
    details: input.details,
    category_1: categories.category1,
    category_2: categories.category2,
    impact: 1,
    urgency: 1
  };

  const companyId = resolveHaloClientId(input);
  if (companyId !== null) payload.client_id = companyId;
  if (input.siteId !== null && input.siteId !== undefined) payload.site_id = input.siteId;

  const board = findById(input.boards, input.boardId) ?? findByName(input.boards, input.boardName);
  const boardId = board ? readNumber(board, 'id') : null;
  if (boardId !== null) payload.team_id = boardId;

  if (categories.ticketTypeId !== null) {
    payload.tickettype_id = categories.ticketTypeId;
  } else {
    const ticketType = findById(input.types, input.typeId) ?? findByName(input.types, input.typeName);
    const ticketTypeId = ticketType ? readNumber(ticketType, 'id') : null;
    if (ticketTypeId !== null) payload.tickettype_id = ticketTypeId;
  }

  const priority = findByName(input.priorities, input.priorityName);
  const priorityId = priority ? readNumber(priority, 'id') : null;
  if (priorityId !== null) payload.priority_id = priorityId;

  const contactId = resolveContactId(input);
  if (contactId !== null) payload.user_id = contactId;

  return { ok: true, payload };
}
