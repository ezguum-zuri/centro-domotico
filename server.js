// Centro de control doméstico — servidor local
// Arranque:  node server.js        (o DEMO=1 node server.js para probar sin aparatos)
const http = require('http');
const fs = require('fs');
const path = require('path');
const config = require('./lib/config');
config.load();
const hue = require('./lib/hue');
const plugs = require('./lib/plugs');
const tado = require('./lib/tado');
const prices = require('./lib/prices');
const house = require('./lib/house');
const weather = require('./lib/weather');

const PUB = path.join(__dirname, 'public');

// Direcciones para abrir el panel desde el móvil. El nombre ".local" no cambia aunque el router cambie la IP.
function netInfo() {
  const port = config.get().port;
  let host = '';
  if (process.platform === 'darwin') {
    try { host = require('child_process').execSync('scutil --get LocalHostName', { timeout: 2000 }).toString().trim(); } catch { }
  }
  if (!host) host = require('os').hostname().replace(/\.local$/i, '');
  const ips = Object.values(require('os').networkInterfaces()).flat()
    .filter(n => n && n.family === 'IPv4' && !n.internal && !/^169\.254\./.test(n.address)).map(n => n.address);
  return { port, local: /^[a-z0-9-]+$/i.test(host) ? `http://${host}.local:${port}` : null, ips: ips.map(ip => `http://${ip}:${port}`) };
}
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };

function send(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}
function rawBody(req, max = 20e6) {
  return new Promise((ok, ko) => { let d = ''; req.setEncoding('utf8'); req.on('data', c => { d += c; if (d.length > max) { ko(new Error('Archivo demasiado grande')); req.destroy(); } }); req.on('end', () => ok(d)); });
}
function body(req) {
  return new Promise(ok => { let d = ''; req.on('data', c => d += c); req.on('end', () => { try { ok(JSON.parse(d || '{}')); } catch { ok({}); } }); });
}
// Icono automático según el nombre del aparato (si no se elige uno)
const AUTO_ICONS = [
  [/lavavajillas|friegaplatos|lavaplatos/, '🍽️'],
  [/lavadora/, '🧺'],
  [/secadora/, '🌀'],
  [/nevera|frigo|congelador/, '🧊'],
  [/cafe/, '☕'],
  [/microondas|horno|vitro|freidora|robot de cocina|thermomix/, '🍲'],
  [/hervidor|tetera/, '🫖'],
  [/proyector/, '📽️'],
  [/tele|tv\b|television/, '📺'],
  [/consola|playstation|xbox|nintendo|switch/, '🎮'],
  [/ordenador|portatil|pc\b|mac\b|imac|monitor|pantalla/, '💻'],
  [/impresora/, '🖨️'],
  [/router|wifi|fibra/, '📶'],
  [/altavoz|musica|equipo|sonos|homepod/, '🔊'],
  [/aire|acondicionado|split|ventilador/, '❄️'],
  [/calefactor|radiador|estufa|calefaccion|brasero/, '🔥'],
  [/deshumidificador|humidificador/, '💧'],
  [/termo|calentador|caldera/, '🚿'],
  [/robot|aspirador/, '🤖'],
  [/lampara|luz|flexo|luces/, '💡'],
  [/arbol|navidad|belen/, '🎄'],
  [/cargador|coche|patinete|bici/, '🔋'],
  [/plancha/, '👕'],
  [/acuario|pecera/, '🐠'],
  [/cinta|bicicleta estatica|gimnasio/, '🏃'],
  [/secador|pelo/, '💇']
];
const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
function autoIcon(name) { const n = norm(name); const m = AUTO_ICONS.find(([re]) => re.test(n)); return m ? m[1] : '🔌'; }

const slug = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function fullState() {
  const [h, t] = await Promise.all([
    hue.state().catch(e => ({ configured: true, error: e.message, lights: [], rooms: [] })),
    prices.timeline().catch(e => ({ hours: [], error: e.message }))
  ]);
  const p = plugs.summary();
  const recs = p.filter(x => x.type !== 'pm' || x.cycleHours).map(x => {
    const w = prices.bestWindow(t.hours, x.cycleHours);
    if (!w) return null;
    const kWh = x.avgCycleKWh;
    return {
      id: x.id, name: x.name, icon: x.icon, hours: w.n,
      startKey: w.start.key, startH: w.start.h, startDay: w.start.day, hoursAhead: w.hoursAhead,
      bestAvg: w.bestAvg, nowAvg: w.startNowAvg,
      kWh, saving: kWh != null ? (w.startNowAvg - w.bestAvg) * kWh : null
    };
  }).filter(Boolean);
  return {
    demo: !!config.get().demo,
    now: Date.now(),
    hue: h, plugs: p, tado: tado.state(), prices: t, recs, weather: weather.state(),
    summary: {
      powerNow: p.reduce((a, b) => a + (b.power || 0), 0),
      kWhToday: p.reduce((a, b) => a + b.today.kWh, 0),
      costToday: p.reduce((a, b) => a + b.today.cost, 0),
      costMonth: p.reduce((a, b) => a + b.month.cost, 0)
    }
  };
}

const routes = {
  'GET /api/state': async () => fullState(),
  'GET /api/net': async () => netInfo(),
  'GET /api/history': async (q) => plugs.history(Number(q.get('days')) || 14),
  'GET /api/cycles': async (q) => plugs.cyclesOf(q.get('id')),
  'GET /api/config': async () => { const c = config.get(); return { tariff: c.tariff, plugs: c.plugs, tado: c.tado, hue: { ip: c.hue.ip, paired: !!c.hue.username }, house: c.house, offers: c.offers, weather: c.weather || {} }; },

  'POST /api/weather/search': async (q, b) => weather.search(b.q),
  'POST /api/config/weather': async (q, b) => { weather.setPlace(b); return { ok: true }; },

  'GET /api/house': async () => house.summary(),
  'POST /api/house/clear': async () => house.clear(),
  'POST /api/house/reload-prices': async () => { house.loadPVPC(); },
  'POST /api/config/house': async (q, b) => {
    const c = config.get();
    const offers = Array.isArray(b.offers) ? b.offers.filter(o => o && o.name).map(o => ({
      name: String(o.name), type: o.type === '3p' ? '3p' : 'fija',
      price: Number(o.price) || 0, punta: Number(o.punta) || 0, llano: Number(o.llano) || 0, valle: Number(o.valle) || 0,
      p1: Number(o.p1) || 0, p2: Number(o.p2) || 0
    })) : c.offers;
    config.save({ house: { ...c.house, kw: Number(b.kw) || c.house.kw }, offers });
    return { ok: true };
  },

  'POST /api/hue/light': async (q, b) => hue.setLight(b.id, b),
  'POST /api/hue/room': async (q, b) => hue.setRoom(b.id, b),
  'POST /api/hue/discover': async () => hue.discover(),
  'POST /api/hue/pair': async (q, b) => hue.pair(b.ip),

  'POST /api/plug': async (q, b) => plugs.setOn(b.id, b.on),
  'POST /api/shelly/scan': async () => {
    if (config.get().demo) return [
      { ip: '192.168.1.41', deviceId: 'shellyplugmg3-demo000001', model: 'PlugMG3', type: 'switch', power: 0, on: true },
      { ip: '192.168.1.42', deviceId: 'shellyplugmg3-demo000002', model: 'PlugMG3', type: 'switch', power: 85.2, on: true }];
    return require('./lib/discover').scan();
  },

  'POST /api/tado/login': async () => tado.startLogin(),
  'POST /api/tado/logout': async () => tado.logout(),
  'POST /api/tado/refresh': async () => tado.refresh(),
  'POST /api/tado/room': async (q, b) => tado.setRoom(b.id, b),

  'POST /api/config/tariff': async (q, b) => {
    const t = config.get().tariff;
    config.save({ tariff: { ...t, ...b, periods: { ...t.periods, ...(b.periods || {}) } } });
    return { ok: true };
  },
  'POST /api/config/plug': async (q, b) => {
    const list = config.get().plugs.slice();
    if (b.remove) { config.save({ plugs: list.filter(p => p.id !== b.remove) }); return { ok: true }; }
    if (!b.name || !b.ip) throw new Error('Falta nombre o IP');
    const id = b.id || slug(b.name);
    const p = {
      id, name: b.name, ip: b.ip.trim(), type: b.type === 'pm' ? 'pm' : 'switch', icon: (b.icon && b.icon.trim()) || autoIcon(b.name),
      cycleHours: Number(b.cycleHours) || 1, protect: !!b.protect,
      startW: Number(b.startW) || 15, stopW: Number(b.stopW) || 4, stopMinutes: Number(b.stopMinutes) || 5,
      detectCycles: !!b.detectCycles,
      deviceId: b.deviceId || (list.find(x => x.id === id) || {}).deviceId || undefined
    };
    const i = list.findIndex(x => x.id === id);
    if (i >= 0) list[i] = p; else list.push(p);
    config.save({ plugs: list });
    return { ok: true, id };
  }
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const key = `${req.method} ${url.pathname}`;
  if (key === 'POST /api/house/import') {
    try { send(res, 200, house.importText(await rawBody(req))); }
    catch (e) { send(res, 400, { error: e.message }); }
    return;
  }
  if (routes[key]) {
    try {
      const b = req.method === 'POST' ? await body(req) : {};
      const out = await routes[key](url.searchParams, b);
      send(res, 200, out === undefined ? { ok: true } : out);
    } catch (e) { send(res, 500, { error: e.message }); }
    return;
  }
  // Ficheros estáticos
  let f = path.normalize(path.join(PUB, url.pathname === '/' ? 'index.html' : url.pathname));
  if (!f.startsWith(PUB) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(PUB, 'index.html');
  res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  fs.createReadStream(f).pipe(res);
});

// Modo demo: si no hay enchufes, crea tres de ejemplo
if (config.get().demo && !config.get().plugs.length) {
  config.get().plugs = [
    { id: 'lavadora', name: 'Lavadora', type: 'switch', icon: '🧺', cycleHours: 2, protect: true },
    { id: 'aire', name: 'Aire acondicionado', type: 'switch', icon: '❄️', cycleHours: 3, detectCycles: false },
    { id: 'robot', name: 'Robot aspirador', type: 'switch', icon: '🤖', cycleHours: 1, protect: true }
  ];
}

plugs.start();
tado.start();
house.start();
weather.start();
server.listen(config.get().port, '0.0.0.0', () => {
  const nets = require('os').networkInterfaces();
  const ips = Object.values(nets).flat().filter(n => n && n.family === 'IPv4' && !n.internal).map(n => n.address);
  console.log(`\n🏠 Centro de control en marcha${config.get().demo ? ' (MODO DEMO)' : ''}`);
  console.log(`   En este equipo:  http://localhost:${config.get().port}`);
  for (const ip of ips) console.log(`   Desde el móvil:  http://${ip}:${config.get().port}`);
  const n = netInfo(); if (n.local) console.log(`   Nombre fijo:     ${n.local}`);
  console.log('');
});
