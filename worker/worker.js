// ═══════════════════════════════════════════════════════════
//  TIME & EXPENSE LOG — Cloudflare Worker Backend
//  KV keys:
//    user:{email}          → { passwordHash, userId, name, createdAt }
//    token:{token}         → { userId, email, expires }
//    data:{userId}:entries → JSON array of entries
//    data:{userId}:config  → JSON config object
//    data:{userId}:receipts→ JSON receipts object
// ═══════════════════════════════════════════════════════════

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// ── CRYPTO HELPERS ──────────────────────────────────────────
async function hashPassword(password, salt) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: enc.encode(salt), iterations: 100000, hash: 'SHA-256' },
    key, 256
  );
  return btoa(String.fromCharCode(...new Uint8Array(bits)));
}

function randomHex(bytes = 32) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

function uid() {
  return randomHex(8);
}

// ── RESPONSE HELPERS ────────────────────────────────────────
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function err(msg, status = 400) {
  return json({ error: msg }, status);
}

// ── AUTH MIDDLEWARE ──────────────────────────────────────────
async function authenticate(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.replace('Bearer ', '').trim();
  if (!token) return null;

  const raw = await env.MYTE_DATA.get(`token:${token}`);
  if (!raw) return null;

  const session = JSON.parse(raw);
  if (Date.now() > session.expires) {
    await env.MYTE_DATA.delete(`token:${token}`);
    return null;
  }
  return session; // { userId, email }
}

// ── ROUTER ──────────────────────────────────────────────────
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // CORS preflight
    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    // ── PUBLIC ROUTES ──
    if (path === '/api/login' && method === 'POST') return handleLogin(request, env);
    if (path === '/api/health' && method === 'GET') return json({ ok: true });

    // ── ADMIN ROUTES (protected by ADMIN_SECRET env var) ──
    if (path === '/api/admin/create-user' && method === 'POST') return handleCreateUser(request, env);

    // ── AUTHENTICATED ROUTES ──
    const session = await authenticate(request, env);
    if (!session) return err('Unauthorised — please log in', 401);

    if (path === '/api/logout'  && method === 'POST') return handleLogout(request, env, session);
    if (path === '/api/me'      && method === 'GET')  return handleMe(session);

    // Data endpoints
    if (path === '/api/data/entries') {
      if (method === 'GET')  return handleGetData(env, session, 'entries', '[]');
      if (method === 'PUT')  return handlePutData(request, env, session, 'entries');
    }
    if (path === '/api/data/config') {
      if (method === 'GET')  return handleGetData(env, session, 'config', '{}');
      if (method === 'PUT')  return handlePutData(request, env, session, 'config');
    }
    if (path === '/api/data/receipts') {
      if (method === 'GET')  return handleGetData(env, session, 'receipts', '{}');
      if (method === 'PUT')  return handlePutData(request, env, session, 'receipts');
    }

    return err('Not found', 404);
  }
};

// ── HANDLERS ────────────────────────────────────────────────
async function handleLogin(request, env) {
  let body;
  try { body = await request.json(); } catch { return err('Invalid JSON'); }

  const { email, password } = body;
  if (!email || !password) return err('Email and password required');

  const raw = await env.MYTE_DATA.get(`user:${email.toLowerCase()}`);
  if (!raw) return err('Invalid email or password', 401);

  const user = JSON.parse(raw);
  const hash = await hashPassword(password, user.salt);
  if (hash !== user.passwordHash) return err('Invalid email or password', 401);

  // Issue token — expires in 90 days
  const token = randomHex(32);
  const session = { userId: user.userId, email: user.email, name: user.name, expires: Date.now() + 90 * 86400000 };
  await env.MYTE_DATA.put(`token:${token}`, JSON.stringify(session), { expirationTtl: 90 * 86400 });

  return json({ token, userId: user.userId, email: user.email, name: user.name });
}

async function handleLogout(request, env, session) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.replace('Bearer ', '').trim();
  await env.MYTE_DATA.delete(`token:${token}`);
  return json({ ok: true });
}

function handleMe(session) {
  return json({ userId: session.userId, email: session.email, name: session.name });
}

async function handleCreateUser(request, env) {
  // Verify admin secret
  const secret = request.headers.get('X-Admin-Secret') || '';
  if (!env.ADMIN_SECRET || secret !== env.ADMIN_SECRET) return err('Forbidden', 403);

  let body;
  try { body = await request.json(); } catch { return err('Invalid JSON'); }

  const { email, password, name } = body;
  if (!email || !password) return err('Email and password required');

  const existing = await env.MYTE_DATA.get(`user:${email.toLowerCase()}`);
  if (existing) return err('User already exists');

  const salt = randomHex(16);
  const passwordHash = await hashPassword(password, salt);
  const userId = uid();

  await env.MYTE_DATA.put(`user:${email.toLowerCase()}`, JSON.stringify({
    userId, email: email.toLowerCase(), name: name || email,
    passwordHash, salt, createdAt: Date.now()
  }));

  return json({ ok: true, userId, email: email.toLowerCase() });
}

async function handleGetData(env, session, key, defaultVal) {
  const raw = await env.MYTE_DATA.get(`data:${session.userId}:${key}`);
  return json(JSON.parse(raw || defaultVal));
}

async function handlePutData(request, env, session, key) {
  let body;
  try { body = await request.text(); } catch { return err('Invalid body'); }
  // Validate it's parseable JSON before storing
  try { JSON.parse(body); } catch { return err('Invalid JSON body'); }
  await env.MYTE_DATA.put(`data:${session.userId}:${key}`, body);
  return json({ ok: true });
}
