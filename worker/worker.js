// ═══════════════════════════════════════════════════════════
//  MYTE — Time & Expense Log — Cloudflare Worker Backend
//  KV keys:
//    user:{email}              → { passwordHash, salt, userId, name, createdAt }
//    token:{token}             → { userId, email, name, expires }
//    login-attempts:{email}    → { count, lockedUntil }
//    data:{userId}:entries     → JSON array of entries
//    data:{userId}:config      → JSON config object
//    data:{userId}:receipts    → JSON receipts object
// ═══════════════════════════════════════════════════════════

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const MAPS_BASE = 'https://maps.googleapis.com/maps/api';
const LOGIN_MAX_ATTEMPTS = 10;
const LOGIN_LOCK_MS      = 15 * 60 * 1000; // 15 minutes

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

function uid() { return randomHex(8); }

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
  return session; // { userId, email, name }
}

// ── ROUTER ──────────────────────────────────────────────────
export default {
  async fetch(request, env) {
    const url    = new URL(request.url);
    const path   = url.pathname;
    const method = request.method;

    if (method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    // ── PUBLIC ROUTES ──
    if (path === '/api/login'  && method === 'POST') return handleLogin(request, env);
    if (path === '/api/health' && method === 'GET')  return json({ ok: true });

    // ── ADMIN ROUTES ──
    if (path === '/api/admin/create-user' && method === 'POST') return handleCreateUser(request, env);

    // ── AUTHENTICATED ROUTES ──
    const session = await authenticate(request, env);
    if (!session) return err('Unauthorised — please log in', 401);

    if (path === '/api/logout' && method === 'POST') return handleLogout(request, env, session);
    if (path === '/api/me'     && method === 'GET')  return handleMe(session);

    // Data endpoints
    if (path === '/api/data/entries') {
      if (method === 'GET') return handleGetData(env, session, 'entries', '[]');
      if (method === 'PUT') return handlePutData(request, env, session, 'entries');
    }
    if (path === '/api/data/config') {
      if (method === 'GET') return handleGetData(env, session, 'config', '{}');
      if (method === 'PUT') return handlePutData(request, env, session, 'config');
    }
    if (path === '/api/data/receipts') {
      if (method === 'GET') return handleGetData(env, session, 'receipts', '{}');
      if (method === 'PUT') return handlePutData(request, env, session, 'receipts');
    }

    // Maps proxy endpoints (auth required, key never leaves Worker)
    if (path === '/api/maps/places'       && method === 'POST') return handleMapsPlaces(request, env);
    if (path === '/api/maps/place-details'&& method === 'POST') return handleMapsPlaceDetails(request, env);
    if (path === '/api/maps/distance'     && method === 'POST') return handleMapsDistance(request, env);

    return err('Not found', 404);
  }
};

// ── HANDLERS ────────────────────────────────────────────────

async function handleLogin(request, env) {
  let body;
  try { body = await request.json(); } catch { return err('Invalid JSON'); }

  const { email, password } = body;
  if (!email || !password) return err('Invalid email or password', 401);

  const emailKey    = email.toLowerCase();
  const attemptsKey = `login-attempts:${emailKey}`;

  // Check rate limit
  const attemptsRaw = await env.MYTE_DATA.get(attemptsKey);
  if (attemptsRaw) {
    const attempts = JSON.parse(attemptsRaw);
    if (attempts.lockedUntil && Date.now() < attempts.lockedUntil) {
      return err('Invalid email or password', 401); // consistent message
    }
  }

  const raw = await env.MYTE_DATA.get(`user:${emailKey}`);

  // Always hash (even for unknown email) to prevent timing attacks
  const dummySalt = 'deadbeef00000000deadbeef00000000';
  const user      = raw ? JSON.parse(raw) : { salt: dummySalt, passwordHash: '' };
  const hash      = await hashPassword(password, user.salt);

  if (!raw || hash !== user.passwordHash) {
    // Increment failed attempts
    const prev    = attemptsRaw ? JSON.parse(attemptsRaw) : { count: 0 };
    const count   = (prev.count || 0) + 1;
    const locked  = count >= LOGIN_MAX_ATTEMPTS ? Date.now() + LOGIN_LOCK_MS : null;
    await env.MYTE_DATA.put(attemptsKey, JSON.stringify({ count, lockedUntil: locked }),
      { expirationTtl: 24 * 3600 }); // auto-expire record after 24h
    return err('Invalid email or password', 401);
  }

  // Success — clear rate limit, issue token
  await env.MYTE_DATA.delete(attemptsKey);
  const token   = randomHex(32);
  const session = { userId: user.userId, email: user.email, name: user.name, expires: Date.now() + 90 * 86400000 };
  await env.MYTE_DATA.put(`token:${token}`, JSON.stringify(session), { expirationTtl: 90 * 86400 });

  return json({ token, userId: user.userId, email: user.email, name: user.name });
}

async function handleLogout(request, env, session) {
  const auth  = request.headers.get('Authorization') || '';
  const token = auth.replace('Bearer ', '').trim();
  await env.MYTE_DATA.delete(`token:${token}`);
  return json({ ok: true });
}

function handleMe(session) {
  return json({ userId: session.userId, email: session.email, name: session.name });
}

async function handleCreateUser(request, env) {
  const secret = request.headers.get('X-Admin-Secret') || '';
  if (!env.ADMIN_SECRET || secret !== env.ADMIN_SECRET) return err('Forbidden', 403);

  let body;
  try { body = await request.json(); } catch { return err('Invalid JSON'); }

  const { email, password, name } = body;
  if (!email || !password) return err('Email and password required');

  const existing = await env.MYTE_DATA.get(`user:${email.toLowerCase()}`);
  if (existing) return err('User already exists');

  const salt         = randomHex(16);
  const passwordHash = await hashPassword(password, salt);
  const userId       = uid();

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
  try { JSON.parse(body); } catch { return err('Invalid JSON body'); }
  await env.MYTE_DATA.put(`data:${session.userId}:${key}`, body);
  return json({ ok: true });
}

// ── MAPS PROXY HANDLERS ──────────────────────────────────────

async function handleMapsPlaces(request, env) {
  if (!env.GOOGLE_MAPS_KEY) return err('Maps not configured', 503);
  let body;
  try { body = await request.json(); } catch { return err('Invalid JSON'); }
  const { query } = body;
  if (!query) return err('query required');

  const params = new URLSearchParams({
    input: query,
    key: env.GOOGLE_MAPS_KEY,
    components: 'country:nz',
    language: 'en',
  });
  const res  = await fetch(`${MAPS_BASE}/place/autocomplete/json?${params}`);
  const data = await res.json();

  if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
    return err(`Maps error: ${data.status}`, 502);
  }

  const predictions = (data.predictions || []).map(p => ({
    place_id:             p.place_id,
    description:          p.description,
    structured_formatting: {
      main_text:      p.structured_formatting?.main_text      || p.description,
      secondary_text: p.structured_formatting?.secondary_text || '',
    },
  }));
  return json({ predictions });
}

async function handleMapsPlaceDetails(request, env) {
  if (!env.GOOGLE_MAPS_KEY) return err('Maps not configured', 503);
  let body;
  try { body = await request.json(); } catch { return err('Invalid JSON'); }
  const { placeId } = body;
  if (!placeId) return err('placeId required');

  const params = new URLSearchParams({
    place_id: placeId,
    fields:   'formatted_address,address_components',
    key:      env.GOOGLE_MAPS_KEY,
    language: 'en',
  });
  const res  = await fetch(`${MAPS_BASE}/place/details/json?${params}`);
  const data = await res.json();

  if (data.status !== 'OK') return err(`Maps error: ${data.status}`, 502);
  return json({
    formatted_address:  data.result?.formatted_address  || '',
    address_components: data.result?.address_components || [],
  });
}

async function handleMapsDistance(request, env) {
  if (!env.GOOGLE_MAPS_KEY) return err('Maps not configured', 503);
  let body;
  try { body = await request.json(); } catch { return err('Invalid JSON'); }
  const { origins, destinations } = body;
  if (!origins?.length || !destinations?.length) return err('origins and destinations required');

  const params = new URLSearchParams({
    origins:      origins.join('|'),
    destinations: destinations.join('|'),
    mode:         'driving',
    units:        'metric',
    key:          env.GOOGLE_MAPS_KEY,
  });
  const res  = await fetch(`${MAPS_BASE}/distancematrix/json?${params}`);
  const data = await res.json();

  if (data.status !== 'OK') return err(`Maps error: ${data.status}`, 502);
  return json(data);
}
