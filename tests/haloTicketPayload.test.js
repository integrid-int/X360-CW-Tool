const test = require('node:test');
const assert = require('node:assert/strict');

test('halo ticket payload uses catalog category ids and mapped company, type, and board', () => {
  const { buildHaloTicketCreateRequest } = require('../dist/lib/haloTicketPayload.js');
  const result = buildHaloTicketCreateRequest({
    summary: 'Axcient test',
    details: 'created from test',
    companyIdentifier: '1',
    companies: [{ id: 19, name: 'Integrid LLC', identifier: '19' }],
    customerCompanies: [{ id: 1, name: 'Integrid LLC', identifier: '1' }],
    companyMap: {},
    boards: [{ id: 1, name: 'Service Desk' }],
    boardId: 1,
    boardName: null,
    types: [{ id: 1, name: 'Incident' }, { id: 34, name: 'Triage' }],
    typeId: 34,
    typeName: null,
    priorities: [],
    priorityName: null,
    contacts: [{ id: 55, name: 'General User', firstName: 'General', lastName: 'User' }],
    contactId: null,
    categories: [
      { id: '10', name: 'Incident', parentId: null, level: 1, ticketTypeId: 1 },
      { id: '11', name: 'Backup', parentId: null, level: 2, ticketTypeId: 1 },
      { id: '12', name: 'Backup', parentId: '99', level: 2, ticketTypeId: 34 }
    ],
    categoryLevel1: 'Incident',
    categoryLevel2: 'Backup'
  });

  assert.equal(result.ok, true);
  assert.equal(result.payload.client_id, 19);
  assert.equal(result.payload.team_id, 1);
  assert.equal(result.payload.tickettype_id, 1);
  assert.equal(result.payload.user_id, 55);
  assert.equal(result.payload.category_1, '10');
  assert.equal(result.payload.category_2, '11');
  assert.equal(result.payload.category1, undefined);
  assert.equal(result.payload.category2, undefined);
  assert.equal(JSON.stringify(result.payload).includes('Incident'), false);
  assert.equal(JSON.stringify(result.payload).includes('Backup'), false);
});

test('halo ticket payload does not invent a company id or category when catalogs miss', () => {
  const { buildHaloTicketCreateRequest } = require('../dist/lib/haloTicketPayload.js');
  const result = buildHaloTicketCreateRequest({
    summary: 'Axcient test',
    details: 'created from test',
    companyIdentifier: '1',
    companies: [{ id: 19, name: 'Other Co', identifier: '19' }],
    customerCompanies: [{ id: 1, name: 'Integrid LLC', identifier: '1' }],
    companyMap: {},
    boards: [{ id: 7, name: 'Service Desk' }],
    boardId: 99,
    boardName: null,
    types: [{ id: 2, name: 'Request' }],
    typeId: 34,
    typeName: null,
    priorities: [],
    priorityName: null,
    contacts: [],
    contactId: null,
    categories: [],
    categoryLevel1: 'Incident',
    categoryLevel2: 'Backup'
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /category/i);
  assert.equal(result.payload, undefined);
});

test('axcient client ids map onto halo clients and unmatched ids are omitted', () => {
  const { buildHaloTicketCreateRequest } = require('../dist/lib/haloTicketPayload.js');
  const { AXCIENT_HALO_COMPANY_MAP } = require('../dist/lib/axcientCompanyMap.js');
  const companies = [
    { id: 12, name: 'Integrid LLC' },
    { id: 30, name: 'Moonlight Imaging' },
    { id: 35, name: 'Pinnacle Contracting Services' },
    { id: 70, name: 'Forum Supply Company' }
  ];
  const categories = [
    { id: '10', name: 'Incident', parentId: null, level: 1, ticketTypeId: 1 },
    { id: '11', name: 'Backup', parentId: null, level: 2, ticketTypeId: 1 }
  ];
  const mapped = buildHaloTicketCreateRequest({
    summary: 'mapped',
    details: '',
    companyIdentifier: '53760',
    companies,
    customerCompanies: [],
    companyMap: AXCIENT_HALO_COMPANY_MAP,
    boards: [],
    boardId: null,
    boardName: null,
    types: [],
    typeId: 34,
    typeName: null,
    priorities: [],
    priorityName: null,
    contacts: [],
    contactId: null,
    categories,
    categoryLevel1: 'Incident',
    categoryLevel2: 'Backup'
  });
  assert.equal(mapped.ok, true);
  assert.equal(mapped.payload.client_id, 30);
  assert.equal(mapped.payload.tickettype_id, 1);
  assert.equal(mapped.payload.category_1, '10');
  assert.equal(mapped.payload.category_2, '11');

  const centric = buildHaloTicketCreateRequest({
    summary: 'centric site of forum',
    details: '',
    companyIdentifier: '96094',
    companies,
    customerCompanies: [{ id: 17, name: 'Centric Mechanical', identifier: '17' }],
    companyMap: AXCIENT_HALO_COMPANY_MAP,
    boards: [],
    boardId: null,
    boardName: null,
    types: [],
    typeId: null,
    typeName: null,
    priorities: [],
    priorityName: null,
    contacts: [],
    contactId: null,
    categories,
    categoryLevel1: 'Incident',
    categoryLevel2: 'Backup'
  });
  assert.equal(centric.ok, true);
  assert.equal(centric.payload.client_id, 70);

  const unmatched = buildHaloTicketCreateRequest({
    summary: 'unmatched',
    details: '',
    companyIdentifier: '104493',
    companies,
    customerCompanies: [],
    companyMap: AXCIENT_HALO_COMPANY_MAP,
    boards: [],
    boardId: null,
    boardName: null,
    types: [],
    typeId: null,
    typeName: null,
    priorities: [],
    priorityName: null,
    contacts: [],
    contactId: null,
    categories,
    categoryLevel1: 'Incident',
    categoryLevel2: 'Backup'
  });
  assert.equal(unmatched.ok, true);
  assert.equal(unmatched.payload.client_id, undefined);
});

test('catalog category_name rows resolve incident parent and backup child', () => {
  const { buildHaloTicketCreateRequest, categoriesFromCatalog } = require('../dist/lib/haloTicketPayload.js');
  const categories = categoriesFromCatalog([
    { id: 5, category_name: 'Incident', parent_id: 0 },
    { id: 9, category_name: 'Backup', parent_id: 5 },
    { id: 8, category_name: 'Backup', parent_id: 3 }
  ]);
  const result = buildHaloTicketCreateRequest({
    summary: 'catalog',
    details: '',
    companyIdentifier: null,
    companies: [],
    customerCompanies: [],
    companyMap: {},
    boards: [],
    boardId: null,
    boardName: null,
    types: [],
    typeId: null,
    typeName: null,
    priorities: [],
    priorityName: null,
    contacts: [],
    contactId: null,
    categories,
    categoryLevel1: 'Incident',
    categoryLevel2: 'Backup'
  });
  assert.equal(result.ok, true);
  assert.equal(result.payload.category_1, '5');
  assert.equal(result.payload.category_2, '9');
  assert.equal(result.payload.tickettype_id, undefined);
});

test('incident ticket type supplies incident and backup category ids', () => {
  const { categoriesFromTicketType } = require('../dist/lib/haloTicketPayload.js');
  const categories = categoriesFromTicketType({
    id: 1,
    name: 'Incident',
    allowed_category1: [
      { category_id: 10, category_value: 'Incident' },
      { category_id: 8, category_value: 'Request' }
    ],
    allowed_category2: [
      { category_id: 11, category_value: 'Backup' },
      { category_id: 12, category_value: 'Email' }
    ]
  });
  assert.deepEqual(categories.map((category) => [category.level, category.id, category.name, category.ticketTypeId]), [
    [1, '10', 'Incident', 1],
    [1, '8', 'Request', 1],
    [2, '11', 'Backup', 1],
    [2, '12', 'Email', 1]
  ]);
});
