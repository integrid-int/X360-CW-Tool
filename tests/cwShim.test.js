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

test('company by id endpoint returns object shape', async () => {
  const { cwShim } = require('../dist/functions/cwShim.js');
  const req = makeRequest('https://example.com/v4_6_release/apis/3.0/company/companies/1');
  const res = await cwShim(req, context);

  assert.equal(res.status, 200);
  assert.ok(!Array.isArray(res.jsonBody));
  assert.equal(res.jsonBody.id, 1);
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
