// Utilidades comunes: hora de Madrid, ficheros JSON, fetch con timeout
const fs = require('fs');
const path = require('path');

const TZ = 'Europe/Madrid';
const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const fmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short'
});

// Partes de fecha en hora peninsular española
function madrid(date = new Date()) {
  const p = {};
  for (const { type, value } of fmt.formatToParts(date)) p[type] = value;
  return {
    y: p.year, m: p.month, d: p.day, h: Number(p.hour), min: Number(p.minute),
    dow: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday),
    day: `${p.year}-${p.month}-${p.day}`,
    hourKey: `${p.year}-${p.month}-${p.day}T${p.hour}`
  };
}

function addDays(dayStr, n) {
  const d = new Date(dayStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function readJSON(name, fallback) {
  try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, name), 'utf8')); }
  catch { return fallback; }
}
function writeJSON(name, obj) {
  const f = path.join(DATA_DIR, name);
  fs.writeFileSync(f + '.tmp', JSON.stringify(obj, null, 1));
  fs.renameSync(f + '.tmp', f);
}

async function fetchT(url, opts = {}, ms = 5000) {
  return fetch(url, { ...opts, signal: AbortSignal.timeout(ms) });
}

module.exports = { TZ, madrid, addDays, readJSON, writeJSON, fetchT, DATA_DIR };
