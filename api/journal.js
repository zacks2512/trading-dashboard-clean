'use strict';

// Vercel Node Function. Database credentials stay on the server.
const {Pool, neonConfig} = require('@neondatabase/serverless');
neonConfig.webSocketConstructor = require('ws');

const TYPES = new Set(['accounts', 'trades', 'legs', 'actions', 'quotes', 'lists', 'settings']);
const ID = /^[A-Za-z0-9_:.\-]{1,255}$/;
const MAX_BODY = 1024 * 1024;

function fail(status, message) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

function requiredConfig() {
  const {DATABASE_URL, NEON_AUTH_BASE_URL, JOURNAL_OWNER_ID} = process.env;
  if (![DATABASE_URL, NEON_AUTH_BASE_URL, JOURNAL_OWNER_ID].every(Boolean))
    fail(503, 'Journal server is not configured.');
  let authBase;
  try { authBase = new URL(NEON_AUTH_BASE_URL); } catch (_) { fail(503, 'Journal server is not configured.'); }
  if (authBase.protocol !== 'https:') fail(503, 'Journal server is not configured.');
  const jwks = new URL(authBase.href.replace(/\/$/, '') + '/.well-known/jwks.json');
  return {DATABASE_URL, jwks, issuer: authBase.origin, JOURNAL_OWNER_ID};
}

async function ownerFromRequest(req, config) {
  const match = /^Bearer ([A-Za-z0-9_.-]+)$/.exec(req.headers.authorization || '');
  if (!match) fail(401, 'Sign in to access the journal.');
  try {
    const {createRemoteJWKSet, jwtVerify} = await import('jose');
    const jwks = createRemoteJWKSet(config.jwks);
    const {payload} = await jwtVerify(match[1], jwks, {issuer: config.issuer});
    if (!payload.sub || payload.sub !== config.JOURNAL_OWNER_ID) fail(403, 'Journal access denied.');
    return payload.sub;
  } catch (error) {
    if (error.status === 403) throw error;
    fail(401, 'Invalid or expired sign-in.');
  }
}

function parseBody(req) {
  const length = Number(req.headers['content-length'] || 0);
  if (length > MAX_BODY) fail(413, 'Save is too large.');
  let body = req.body;
  if (typeof body === 'string') {
    if (Buffer.byteLength(body) > MAX_BODY) fail(413, 'Save is too large.');
    try { body = JSON.parse(body); } catch (_) { fail(400, 'Invalid JSON.'); }
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail(400, 'Invalid save.');
  return body;
}

function validateSave(body) {
  const {transactionId, mutations, note = 'Saved from dashboard'} = body;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(transactionId || '')) fail(400, 'Invalid transaction ID.');
  if (!Array.isArray(mutations) || !mutations.length || mutations.length > 100) fail(400, 'Invalid changes.');
  if (typeof note !== 'string' || note.length > 500) fail(400, 'Invalid save note.');
  const seen = new Set();
  for (const m of mutations) {
    if (!m || !TYPES.has(m.table) || typeof m.id !== 'string' || !ID.test(m.id)) fail(400, 'Invalid record.');
    if (typeof m.expected !== 'string' || m.expected.length > 100) fail(400, 'Invalid record version.');
    if (m.deleted !== undefined && typeof m.deleted !== 'boolean') fail(400, 'Invalid deletion flag.');
    if (!m.data || typeof m.data !== 'object' || Array.isArray(m.data) || m.data.id !== m.id || JSON.stringify(m.data).length > 40000) fail(400, 'Invalid record data.');
    const key = m.table + ':' + m.id;
    if (seen.has(key)) fail(400, 'Duplicate record in save.');
    seen.add(key);
  }
  return {transactionId, mutations, note};
}

async function snapshot(client, owner) {
  const revisions = await client.query(`SELECT DISTINCT ON (entity_type, record_id)
      entity_type, record_id, revision, transaction_id, updated_at, deleted, data
      FROM journal_revisions WHERE owner_id = $1
      ORDER BY entity_type, record_id, revision DESC`, [owner]);
  const history = await client.query(`SELECT id, transaction_id, entity_type, record_id, before_data,
      after_data, before_deleted, after_deleted, created_at
      FROM journal_history WHERE owner_id = $1 ORDER BY created_at, id`, [owner]);
  return {records: revisions.rows, history: history.rows};
}

async function save(client, owner, input) {
  const {transactionId, mutations, note} = validateSave(input);
  await client.query('BEGIN');
  try {
    const inserted = await client.query(`INSERT INTO journal_transactions (id, owner_id, note)
      VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING RETURNING id`, [transactionId, owner, note]);
    if (!inserted.rowCount) {
      const prior = await client.query('SELECT owner_id FROM journal_transactions WHERE id = $1', [transactionId]);
      if (prior.rows[0]?.owner_id !== owner) fail(409, 'Transaction ID is already in use.');
      await client.query('COMMIT');
      return {transactionId, recovered: true};
    }
    for (const m of mutations) {
      const current = await client.query(`SELECT revision, transaction_id, deleted, data
        FROM journal_revisions WHERE owner_id = $1 AND entity_type = $2 AND record_id = $3
        ORDER BY revision DESC LIMIT 1`, [owner, m.table, m.id]);
      const previous = current.rows[0];
      const version = previous ? previous.revision + ':' + previous.transaction_id : '';
      if (version !== m.expected) fail(409, 'This record changed elsewhere. Reload and try again.');
      await client.query(`INSERT INTO journal_revisions
        (owner_id, entity_type, record_id, revision, transaction_id, deleted, data)
        VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [owner, m.table, m.id, (previous?.revision || 0) + 1, transactionId, Boolean(m.deleted), m.data]);
      await client.query(`INSERT INTO journal_history
        (id, owner_id, transaction_id, entity_type, record_id, before_data,
         after_data, before_deleted, after_deleted)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [crypto.randomUUID(), owner, transactionId, m.table, m.id, previous?.data || null,
          m.data, previous?.deleted || false, Boolean(m.deleted)]);
    }
    await client.query('COMMIT');
    return {transactionId};
  } catch (error) {
    await client.query('ROLLBACK');
    if (error.code === '23505') fail(409, 'This record changed elsewhere. Reload and try again.');
    throw error;
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({error: 'Method not allowed.'});
  }
  let pool;
  try {
    const config = requiredConfig();
    const owner = await ownerFromRequest(req, config);
    const body = req.method === 'POST' ? parseBody(req) : null;
    pool = new Pool({connectionString: config.DATABASE_URL, max: 1});
    const client = await pool.connect();
    try {
      const result = req.method === 'GET' ? await snapshot(client, owner) : await save(client, owner, body);
      return res.status(200).json(result);
    } finally { client.release(); }
  } catch (error) {
    if (!error.status) console.error('Journal API error:', error);
    return res.status(error.status || 500).json({error: error.status ? error.message : 'Journal server error.'});
  } finally {
    if (pool) await pool.end();
  }
};
