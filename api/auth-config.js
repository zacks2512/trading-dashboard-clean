'use strict';

module.exports = function handler(_req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (_req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({error: 'Method not allowed.'});
  }
  const value = process.env.NEON_AUTH_BASE_URL;
  let url;
  try { url = new URL(value); } catch (_) { return res.status(503).json({error: 'Authentication is not configured.'}); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash)
    return res.status(503).json({error: 'Authentication is not configured.'});
  return res.status(200).json({authBaseUrl: url.href.replace(/\/$/, '')});
};
