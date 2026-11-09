const assert = require('node:assert/strict');
const {test} = require('node:test');
const handler = require('../api/journal.js');

function response() {
  return {
    statusCode: 200,
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

test('journal API allows only reads and saves', async () => {
  const res = response();
  await handler({method: 'DELETE', headers: {}}, res);
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.Allow, 'GET, POST');
  assert.equal(res.headers['Cache-Control'], 'private, no-store');
});

test('journal API fails closed without server configuration', async () => {
  const previous = process.env.JOURNAL_OWNER_ID;
  delete process.env.JOURNAL_OWNER_ID;
  try {
    const res = response();
    await handler({method: 'GET', headers: {}}, res);
    assert.equal(res.statusCode, 503);
    assert.equal(res.body.error, 'Journal server is not configured.');
  } finally {
    if (previous === undefined) delete process.env.JOURNAL_OWNER_ID;
    else process.env.JOURNAL_OWNER_ID = previous;
  }
});

test('journal API rejects unauthenticated requests before database access', async () => {
  const keys = ['DATABASE_URL', 'NEON_AUTH_BASE_URL', 'JOURNAL_OWNER_ID'];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  try {
    process.env.DATABASE_URL = 'placeholder';
    process.env.NEON_AUTH_BASE_URL = 'https://example.neon.tech/neondb/auth';
    process.env.JOURNAL_OWNER_ID = 'owner';
    const res = response();
    await handler({method: 'GET', headers: {}}, res);
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.error, 'Sign in to access the journal.');
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});
