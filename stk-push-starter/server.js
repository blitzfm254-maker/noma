'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// Load a local .env file without requiring any third-party packages.
function loadEnvFile() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator < 1) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
loadEnvFile();

const PORT = Number(process.env.PORT || 3000);
const MAX_BODY_BYTES = 64 * 1024;
const INDEX_FILE = path.join(__dirname, 'public', 'index.html');

function sendJson(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('Request body is too large.'), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function readJson(req) {
  const raw = await readBody(req);
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    throw Object.assign(new Error('Send a valid JSON request body.'), { statusCode: 400 });
  }
}

function configuredCredentials() {
  const accountId = process.env.STACKHERO_ACCOUNT_ID;
  const secretKey = process.env.STACKHERO_SECRET_KEY;
  if (!accountId || !secretKey || accountId === 'your_account_id' || secretKey === 'your_secret_key') {
    throw Object.assign(new Error('Set STACKHERO_ACCOUNT_ID and STACKHERO_SECRET_KEY in local .env or Vercel Project Settings → Environment Variables, then redeploy.'), { statusCode: 503 });
  }
  return { accountId, secretKey };
}

function requireAppPassword(req, res) {
  const expected = process.env.APP_PASSWORD;
  if (!expected || expected === 'replace_with_a_long_random_password') {
    sendJson(res, 503, { success: false, error: { message: 'Set APP_PASSWORD to a private value before using the payment endpoints.' } });
    return false;
  }
  const supplied = String(req.headers['x-app-password'] || '');
  if (!timingSafeEqualText(expected, supplied)) {
    sendJson(res, 401, { success: false, error: { message: 'Enter the correct app access password.' } });
    return false;
  }
  return true;
}

async function stackHeroPost(endpoint, body) {
  const { accountId, secretKey } = configuredCredentials();
  const response = await fetch(`https://stackhero.co.ke/v1/${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Account-Id': accountId,
      'X-Secret-Key': secretKey
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000)
  });
  let result;
  try {
    result = await response.json();
  } catch {
    result = { success: false, error: { message: 'StackHero returned a non-JSON response.' } };
  }
  return { status: response.status, result };
}

function validateStkPayload(input) {
  const phone = String(input.phone || '').trim();
  const reference = String(input.reference || '').trim();
  const amount = Number(input.amount);
  const description = String(input.description || '').trim();
  const callbackUrl = String(input.callback_url || '').trim();

  if (!/^(?:\+?254|0)(?:7|1)\d{8}$/.test(phone)) {
    throw Object.assign(new Error('Enter a Kenyan mobile number, for example 0712345678 or 254712345678.'), { statusCode: 422 });
  }
  if (!Number.isInteger(amount) || amount < 1 || amount > 250000) {
    throw Object.assign(new Error('Amount must be a whole number from 1 to 250,000 KES.'), { statusCode: 422 });
  }
  if (!reference || reference.length > 100) {
    throw Object.assign(new Error('Reference is required and must be 100 characters or fewer.'), { statusCode: 422 });
  }
  if (description.length > 100) {
    throw Object.assign(new Error('Description must be 100 characters or fewer.'), { statusCode: 422 });
  }
  if (callbackUrl) {
    let parsed;
    try { parsed = new URL(callbackUrl); } catch {
      throw Object.assign(new Error('Callback URL must be a valid HTTPS URL.'), { statusCode: 422 });
    }
    if (parsed.protocol !== 'https:') {
      throw Object.assign(new Error('Callback URL must use HTTPS.'), { statusCode: 422 });
    }
  }

  const payload = { phone, amount, reference };
  if (description) payload.description = description;
  if (callbackUrl) payload.callback_url = callbackUrl;
  return payload;
}

function timingSafeEqualText(a, b) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

async function handleWebhook(req, res) {
  const secret = process.env.STACKHERO_WEBHOOK_SECRET;
  if (!secret) return sendJson(res, 503, { success: false, error: 'Webhook verification is not configured.' });

  const rawBody = await readBody(req);
  const timestamp = String(req.headers['x-stackhero-timestamp'] || '');
  const suppliedSignature = String(req.headers['x-stackhero-signature'] || '');
  const expectedSignature = `sha256=${crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex')}`;
  if (!timestamp || !timingSafeEqualText(expectedSignature, suppliedSignature)) {
    return sendJson(res, 401, { success: false, error: 'Invalid webhook signature.' });
  }

  let event;
  try { event = JSON.parse(rawBody); } catch {
    return sendJson(res, 400, { success: false, error: 'Webhook body must be valid JSON.' });
  }
  // This demo verifies and acknowledges events; it intentionally does not store payment records.
  return sendJson(res, 200, { success: true, received: true, event: event.event || null });
}

const handler = async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    if (req.method === 'GET' && url.pathname === '/') {
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"
      });
      return fs.createReadStream(INDEX_FILE).pipe(res);
    }

    if (req.method === 'POST' && url.pathname === '/api/stkpush') {
      if (!requireAppPassword(req, res)) return;
      const payload = validateStkPayload(await readJson(req));
      const { status, result } = await stackHeroPost('stkpush', payload);
      return sendJson(res, status, result);
    }

    if (req.method === 'POST' && url.pathname === '/api/status') {
      if (!requireAppPassword(req, res)) return;
      const input = await readJson(req);
      const transactionRequestId = String(input.transaction_request_id || '').trim();
      if (!transactionRequestId || transactionRequestId.length > 200) {
        return sendJson(res, 422, { success: false, error: { message: 'Enter a valid transaction request ID.' } });
      }
      const { status, result } = await stackHeroPost('tstatus', { transaction_request_id: transactionRequestId });
      return sendJson(res, status, result);
    }

    if (req.method === 'POST' && (url.pathname === '/webhook' || url.pathname === '/api/webhook')) {
      return await handleWebhook(req, res);
    }

    if (req.method === 'GET' && url.pathname === '/health') {
      return sendJson(res, 200, { ok: true });
    }

    return sendJson(res, 404, { success: false, error: 'Not found.' });
  } catch (error) {
    if (res.headersSent || res.destroyed) return;
    const status = Number(error.statusCode) || 502;
    const message = status === 502 ? 'Could not reach StackHero. Check your connection and try again.' : error.message;
    return sendJson(res, status, { success: false, error: { message } });
  }
};

// Vercel imports this handler; local development starts a regular HTTP server.
if (require.main === module) {
  const server = http.createServer(handler);
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`STK Push demo running at http://localhost:${PORT}`);
  });
}

module.exports = handler;
module.exports.config = { api: { bodyParser: false } };
