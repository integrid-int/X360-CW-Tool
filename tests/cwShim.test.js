const test = require('node:test');
const assert = require('node:assert/strict');

function makeRequest(url, method = 'GET', body = '', headers = {}) {
  const urlObj = new URL(url);
  return {
    url,
    method,
    query: urlObj.searchParams,
    headers: new Headers(headers),
    text: async () => body,
  };
}

const context = {
  log: () => {},
};

test('system members endpoint returns at least one member', async () => {
  const { cwShim } = require('../dist/functions/cwShim.js');
  const req = makeRequest('https://example.com/v4_6_release/apis/3.0/system/members');
  const res = await cwShim(req, context);

  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.jsonBody));
  assert.ok(res.jsonBody.length > 0);
});

test('company by id endpoint returns mapped customer data', async () => {
  const { cwShim } = require('../dist/functions/cwShim.js');
  const req = makeRequest('https://example.com/v4_6_release/apis/3.0/company/companies/15');
  const res = await cwShim(req, context);

  assert.equal(res.status, 200);
  assert.ok(!Array.isArray(res.jsonBody));
  assert.equal(res.jsonBody.id, 15);
  assert.equal(res.jsonBody.name, 'Blue Ridge Law');
});

test('system members count endpoint returns count object', async () => {
  const { cwShim } = require('../dist/functions/cwShim.js');
  const req = makeRequest('https://example.com/v4_6_release/apis/3.0/system/members/count');
  const res = await cwShim(req, context);

  assert.equal(res.status, 200);
  assert.deepEqual(res.jsonBody, { count: 1 });
});

test('company list respects id from conditions', async () => {
  const { cwShim } = require('../dist/functions/cwShim.js');
  const req = makeRequest('https://example.com/v4_6_release/apis/3.0/company/companies?conditions=id=321');
  const res = await cwShim(req, context);

  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.jsonBody));
  assert.equal(res.jsonBody[0].id, 321);
});

test('company list returns uploaded customers when no conditions are provided', async () => {
  const { cwShim } = require('../dist/functions/cwShim.js');
  const req = makeRequest('https://example.com/v4_6_release/apis/3.0/company/companies');
  const res = await cwShim(req, context);

  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.jsonBody));
  assert.ok(res.jsonBody.length > 20);
  assert.ok(res.jsonBody.some((c) => c.id === 12 && c.name === 'Integrid LLC'));
  assert.ok(res.jsonBody.some((c) => c.id === 15 && c.name === 'Blue Ridge Law'));
});

test('company conditions support exact quoted name matching', async () => {
  const { cwShim } = require('../dist/functions/cwShim.js');
  const req = makeRequest("https://example.com/v4_6_release/apis/3.0/company/companies?conditions=name='Blue Ridge Law'");
  const res = await cwShim(req, context);

  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.jsonBody));
  assert.equal(res.jsonBody[0].id, 15);
  assert.equal(res.jsonBody[0].name, 'Blue Ridge Law');
});

test('company id 1 maps to Integrid LLC for Axcient compatibility', async () => {
  const { cwShim } = require('../dist/functions/cwShim.js');
  const req = makeRequest('https://example.com/v4_6_release/apis/3.0/company/companies/1');
  const res = await cwShim(req, context);

  assert.equal(res.status, 200);
  assert.equal(res.jsonBody.id, 1);
  assert.equal(res.jsonBody.identifier, '1');
  assert.equal(res.jsonBody.name, 'Integrid LLC');
});

test('service board types endpoint returns non-empty list', async () => {
  const { cwShim } = require('../dist/functions/cwShim.js');
  const req = makeRequest('https://example.com/v4_6_release/apis/3.0/service/boards/1/types');
  const res = await cwShim(req, context);

  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.jsonBody));
  assert.ok(res.jsonBody.length > 0);
});

test('service board subtypes endpoint returns non-empty list', async () => {
  const { cwShim } = require('../dist/functions/cwShim.js');
  const req = makeRequest('https://example.com/v4_6_release/apis/3.0/service/boards/1/types/1/subtypes');
  const res = await cwShim(req, context);

  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.jsonBody));
  assert.ok(res.jsonBody.length > 0);
});

test('closed status dropdown query returns only closed statuses', async () => {
  const { cwShim } = require('../dist/functions/cwShim.js');
  const req = makeRequest('https://example.com/v4_6_release/apis/3.0/service/boards/1/statuses?conditions=closedStatus=true');
  const res = await cwShim(req, context);

  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.jsonBody));
  assert.ok(res.jsonBody.length > 0);
  assert.ok(res.jsonBody.every((s) => s.closedStatus === true));
});

test('company contacts endpoint returns non-empty list', async () => {
  const { cwShim } = require('../dist/functions/cwShim.js');
  const req = makeRequest('https://example.com/v4_6_release/apis/3.0/company/contacts');
  const res = await cwShim(req, context);

  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.jsonBody));
  assert.ok(res.jsonBody.length > 0);
});

test('contact dropdown query supports id filter conditions', async () => {
  const { cwShim } = require('../dist/functions/cwShim.js');
  const req = makeRequest('https://example.com/v4_6_release/apis/3.0/company/contacts?conditions=id=1');
  const res = await cwShim(req, context);

  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.jsonBody));
  assert.equal(res.jsonBody.length, 1);
  assert.equal(res.jsonBody[0].id, 1);
});

test('service board dropdown query supports name filter conditions', async () => {
  const { cwShim } = require('../dist/functions/cwShim.js');
  const req = makeRequest("https://example.com/v4_6_release/apis/3.0/service/boards?conditions=name='Service Desk'");
  const res = await cwShim(req, context);

  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.jsonBody));
  assert.equal(res.jsonBody.length, 1);
  assert.equal(res.jsonBody[0].name, 'Service Desk');
});

test('ticket priority dropdown query supports id filter conditions', async () => {
  const { cwShim } = require('../dist/functions/cwShim.js');
  const req = makeRequest('https://example.com/v4_6_release/apis/3.0/service/priorities?conditions=id=1');
  const res = await cwShim(req, context);

  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.jsonBody));
  assert.equal(res.jsonBody.length, 1);
  assert.equal(res.jsonBody[0].id, 1);
});

test('login companyinfo endpoint returns connectwise discovery payload', async () => {
  const { cwShim } = require('../dist/functions/cwShim.js');
  const req = makeRequest('https://example.com/login/companyinfo/INTEGRID');
  const res = await cwShim(req, context);

  assert.equal(res.status, 200);
  assert.equal(res.jsonBody.CompanyID, 'INTEGRID');
  assert.equal(res.jsonBody.Codebase, 'v4_6_release/');
  assert.equal(res.jsonBody.SiteUrl, 'example.com');
  assert.equal(typeof res.jsonBody.IsCloud, 'boolean');
});

test('ticket create normalizes blank nested fields and stores ticket', async () => {
  const { cwShim } = require('../dist/functions/cwShim.js');
  const createReq = makeRequest(
    'https://example.com/v4_6_release/apis/3.0/service/tickets',
    'POST',
    JSON.stringify({
      summary: 'Axcient test ticket',
      board: { name: '' },
      company: { identifier: '1' },
      contact: { id: '' },
      type: { name: '' },
      initialDescription: 'created from test'
    })
  );

  const createRes = await cwShim(createReq, context);
  assert.equal(createRes.status, 201);
  assert.equal(createRes.jsonBody.board.name, 'Service Desk');
  assert.equal(createRes.jsonBody.company.id, 1);
  assert.equal(createRes.jsonBody.company.identifier, '1');
  assert.equal(createRes.jsonBody.company.name, 'Integrid LLC');
  assert.equal(createRes.jsonBody.type.name, 'General');
  assert.equal(createRes.jsonBody.contact.id, 1);

  const id = createRes.jsonBody.id;
  const getReq = makeRequest(`https://example.com/v4_6_release/apis/3.0/service/tickets/${id}`);
  const getRes = await cwShim(getReq, context);
  assert.equal(getRes.status, 200);
  assert.equal(getRes.jsonBody.id, id);
  assert.equal(getRes.jsonBody.summary, 'Axcient test ticket');

  const listReq = makeRequest('https://example.com/v4_6_release/apis/3.0/service/tickets');
  const listRes = await cwShim(listReq, context);
  assert.equal(listRes.status, 200);
  assert.ok(Array.isArray(listRes.jsonBody));
  assert.ok(listRes.jsonBody.some((t) => t.id === id));
});
