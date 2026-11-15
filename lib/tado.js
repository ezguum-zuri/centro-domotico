// tado° X: login por "device code" y API en la nube (hops.tado.com)
// OJO: sin suscripción Auto-Assist tado limita a ~100 llamadas/día (se reinicia a las 12:00 UTC).
// Por eso se consulta cada 60 min por defecto y se cachea todo.
const { fetchT, readJSON, writeJSON } = require('./util');
const config = require('./config');

const CLIENT_ID = '1bb50063-6b0c-4d11-bd99-387f4a91cc46';
const AUTH = 'https://login.tado.com/oauth2';
const API = 'https://my.tado.com/api/v2';
const HOPS = 'https://hops.tado.com';

let tok = readJSON('tado-token.json', null); // { refresh_token, access_token, expires_at, homeId }
let pending = null;   // login en curso
let cache = { rooms: [], at: null, error: null };
let quota = { remaining: null, resetIn: null, calls: 0, day: null };

let demoRooms = [
  { id: 1, name: 'Salón', inside: 20.4, humidity: 52, target: 21, power: 'ON', manual: false, heating: 35 },
  { id: 2, name: 'Dormitorios', inside: 19.1, humidity: 55, target: 19, power: 'ON', manual: false, heating: 0 }
];

function countCall(res) {
  const d = new Date().toISOString().slice(0, 10);
  if (quota.day !== d) { quota.day = d; quota.calls = 0; }
  quota.calls++;
  const h = res && res.headers.get('ratelimit'); // ej: "perday";r=87;t=3600
  if (h) {
    const r = /r=(\d+)/.exec(h), t = /t=(\d+)/.exec(h);
    if (r) quota.remaining = Number(r[1]);
    if (t) quota.resetIn = Number(t[1]);
  }
}

async function tokenRequest(params) {
  const r = await fetchT(AUTH + '/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, ...params })
  }, 8000);
  countCall(r);
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, j };
}

function storeToken(j) {
  tok = { ...(tok || {}), access_token: j.access_token, refresh_token: j.refresh_token, expires_at: Date.now() + (j.expires_in - 30) * 1000 };
  writeJSON('tado-token.json', tok);
}

async function accessToken() {
  if (!tok || !tok.refresh_token) throw new Error('tado no vinculado');
  if (tok.access_token && Date.now() < tok.expires_at) return tok.access_token;
  const { ok, j } = await tokenRequest({ grant_type: 'refresh_token', refresh_token: tok.refresh_token });
  if (!ok) { if (j.error === 'invalid_grant') { tok = null; writeJSON('tado-token.json', null); } throw new Error('tado: ' + (j.error || 'error de token')); }
  storeToken(j); // el refresh_token cambia en cada uso: hay que guardarlo
  return tok.access_token;
}

async function call(url, opts = {}) {
  const at = await accessToken();
  const r = await fetchT(url, { ...opts, headers: { Authorization: 'Bearer ' + at, 'Content-Type': 'application/json', ...(opts.headers || {}) } }, 8000);
  countCall(r);
  if (r.status === 429) throw new Error('tado: límite diario de llamadas agotado');
  if (!r.ok) throw new Error('tado HTTP ' + r.status);
  const txt = await r.text();
  return txt ? JSON.parse(txt) : null;
}

// ---------- Login ----------
async function startLogin() {
  if (config.get().demo) return { url: 'https://login.tado.com (demo)', code: 'DEMO-1234' };
  const r = await fetchT(AUTH + '/device_authorize', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, scope: 'offline_access' })
  }, 8000);
  countCall(r);
  const j = await r.json();
  if (!j.device_code) throw new Error('tado no devolvió código');
  pending = { device_code: j.device_code, url: j.verification_uri_complete, code: j.user_code, until: Date.now() + j.expires_in * 1000 };
  pollLogin(Math.max(5, j.interval || 5));
  return { url: pending.url, code: pending.code };
}

function pollLogin(interval) {
  const t = setInterval(async () => {
    if (!pending || Date.now() > pending.until) { clearInterval(t); pending = null; return; }
    const { ok, j } = await tokenRequest({ device_code: pending.device_code, grant_type: 'urn:ietf:params:oauth:grant-type:device_code' }).catch(() => ({}));
    if (ok && j && j.access_token) {
      clearInterval(t); pending = null; storeToken(j);
      try {
        const me = await call(API + '/me');
        tok.homeId = me.homes[0].id; writeJSON('tado-token.json', tok);
        await refresh();
      } catch (e) { cache.error = e.message; }
    }
  }, interval * 1000);
}

// ---------- Datos ----------
async function refresh() {
  if (config.get().demo) {
    for (const r of demoRooms) { r.inside += (r.target - r.inside) * 0.05 + (Math.random() - .5) * .1; r.heating = r.power === 'ON' && r.inside < r.target - 0.2 ? 40 : 0; }
    cache = { rooms: demoRooms.map(r => ({ ...r, inside: Math.round(r.inside * 10) / 10 })), at: Date.now(), error: null };
    return;
  }
  try {
    if (!tok || !tok.homeId) throw new Error('tado no vinculado');
    const rooms = await call(`${HOPS}/homes/${tok.homeId}/rooms`);
    cache = {
      rooms: rooms.map(r => ({
        id: r.id, name: r.name,
        inside: r.sensorDataPoints?.insideTemperature?.value ?? null,
        humidity: r.sensorDataPoints?.humidity?.percentage ?? null,
        target: r.setting?.temperature?.value ?? null,
        power: r.setting?.power ?? 'OFF',
        manual: !!r.manualControlTermination,
        heating: r.heatingPower?.percentage ?? null
      })), at: Date.now(), error: null
    };
  } catch (e) { cache.error = e.message; }
}

async function setRoom(roomId, body) {
  if (config.get().demo) {
    const r = demoRooms.find(x => x.id == roomId);
    if (body.resume) { r.manual = false; r.target = 21; r.power = 'ON'; }
    else if (body.off) { r.manual = true; r.power = 'OFF'; }
    else { r.manual = true; r.power = 'ON'; r.target = Number(body.temp); }
    return refresh();
  }
  const base = `${HOPS}/homes/${tok.homeId}/rooms/${roomId}`;
  if (body.resume) {
    await call(base + '/resumeSchedule', { method: 'POST', body: '{}' })
      .catch(() => call(base + '/manualControl', { method: 'DELETE' }));
  } else {
    const setting = body.off ? { power: 'OFF' } : { power: 'ON', isBoost: false, temperature: { value: Number(body.temp) } };
    await call(base + '/manualControl', { method: 'POST', body: JSON.stringify({ setting, termination: { type: 'NEXT_TIME_BLOCK' } }) });
  }
  // Actualizamos la caché localmente para no gastar otra llamada
  const r = cache.rooms.find(x => x.id == roomId);
  if (r) {
    if (body.resume) r.manual = false;
    else { r.manual = true; r.power = body.off ? 'OFF' : 'ON'; if (!body.off) r.target = Number(body.temp); }
  }
}

function state() {
  const linked = config.get().demo || !!(tok && tok.refresh_token);
  return { enabled: config.get().tado.enabled, linked, pending: pending ? { url: pending.url, code: pending.code } : null, ...cache, quota };
}

function start() {
  if (!config.get().tado.enabled) return;
  if (config.get().demo || (tok && tok.homeId)) refresh();
  const every = config.get().demo ? 60e3 : Math.max(20, config.get().tado.pollMinutes) * 60e3;
  setInterval(() => { if (config.get().demo || (tok && tok.homeId)) refresh(); }, every);
}

function logout() { tok = null; writeJSON('tado-token.json', null); cache = { rooms: [], at: null, error: null }; }

module.exports = { start, state, refresh, setRoom, startLogin, logout };
