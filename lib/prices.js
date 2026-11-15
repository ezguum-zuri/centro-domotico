// Precios de la luz por hora (€/kWh) y recomendación de la mejor franja
const { madrid, addDays, fetchT } = require('./util');
const config = require('./config');

const cache = {}; // day -> { hours: {0..23: price}, source, fetchedAt }

// Periodos 2.0TD (península). Fines de semana todo valle. No contempla festivos nacionales.
function period20td(dow, h) {
  if (dow === 0 || dow === 6 || h < 8) return 'valle';
  if ((h >= 10 && h < 14) || (h >= 18 && h < 22)) return 'punta';
  return 'llano';
}

function dowOf(day) { return new Date(day + 'T12:00:00Z').getUTCDay(); }

async function fetchPVPC(day) {
  const url = `https://apidatos.ree.es/es/datos/mercados/precios-mercados-tiempo-real?start_date=${day}T00:00&end_date=${day}T23:59&time_trunc=hour`;
  const r = await fetchT(url, { headers: { Accept: 'application/json' } }, 8000);
  if (!r.ok) throw new Error('REE HTTP ' + r.status);
  const j = await r.json();
  const serie = (j.included || []).find(s =>
    /pvpc/i.test(s.type || '') || /pvpc/i.test((s.attributes || {}).title || '') || s.id === '1001');
  if (!serie) throw new Error('REE sin serie PVPC');
  // Si llegan cuartos de hora, se promedian por hora
  const acc = {};
  for (const v of serie.attributes.values) {
    const p = madrid(new Date(v.datetime));
    if (p.day !== day) continue;
    (acc[p.h] = acc[p.h] || []).push(v.value / 1000);
  }
  const hours = {};
  for (const h in acc) hours[h] = acc[h].reduce((a, b) => a + b, 0) / acc[h].length;
  if (Object.keys(hours).length < 20) throw new Error('REE datos incompletos');
  return hours;
}

// Curva sintética (solo para modo demo o si REE no responde)
function synthetic(day) {
  const hours = {};
  const shape = [.15, .14, .13, .12, .12, .13, .16, .20, .21, .17, .12, .09, .07, .07, .08, .10, .14, .20, .26, .29, .30, .27, .21, .17];
  for (let h = 0; h < 24; h++) hours[h] = shape[h];
  return hours;
}

async function getDay(day) {
  const t = config.get().tariff;
  if (t.mode === 'fija') {
    const hours = {}; for (let h = 0; h < 24; h++) hours[h] = t.fixedPrice;
    return { hours, source: 'tarifa fija' };
  }
  if (t.mode === '2.0td') {
    const hours = {}; const dow = dowOf(day);
    for (let h = 0; h < 24; h++) hours[h] = t.periods[period20td(dow, h)];
    return { hours, source: 'periodos 2.0TD' };
  }
  // PVPC
  const c = cache[day];
  const fresh = c && (c.source === 'REE' || Date.now() - c.fetchedAt < 15 * 60e3);
  if (fresh) return c;
  const today = madrid().day;
  if (day > today) {
    // Mañana: REE lo publica sobre las 20:15
    if (madrid().h < 20 && !config.get().demo) return null;
  }
  try {
    if (config.get().demo) throw new Error('demo');
    cache[day] = { hours: await fetchPVPC(day), source: 'REE', fetchedAt: Date.now() };
  } catch (e) {
    if (day > today && !config.get().demo) { cache[day] = undefined; return null; }
    cache[day] = { hours: synthetic(day), source: 'estimado (' + e.message + ')', fetchedAt: Date.now() };
  }
  return cache[day];
}

// Precio de una hora concreta (para calcular el coste de lo consumido)
function priceAt(day, h) {
  const t = config.get().tariff;
  if (t.mode === 'fija') return t.fixedPrice;
  if (t.mode === '2.0td') return t.periods[period20td(dowOf(day), h)];
  const c = cache[day];
  return c ? c.hours[h] : null;
}

// Lista de horas desde 00:00 de hoy hasta donde haya precios (hoy + mañana si existe)
async function timeline() {
  const now = madrid();
  const days = [now.day, addDays(now.day, 1)];
  const out = []; const sources = [];
  for (const day of days) {
    const d = await getDay(day);
    if (!d) continue;
    sources.push(d.source);
    for (let h = 0; h < 24; h++) {
      out.push({
        day, h, key: `${day}T${String(h).padStart(2, '0')}`,
        price: d.hours[h], period: period20td(dowOf(day), h),
        past: day === now.day && h < now.h, now: day === now.day && h === now.h
      });
    }
  }
  const futures = out.filter(x => !x.past).map(x => x.price);
  const min = Math.min(...futures), max = Math.max(...futures);
  for (const x of out) {
    const r = max > min ? (x.price - min) / (max - min) : 0;
    x.level = r < 0.33 ? 'barata' : r < 0.66 ? 'media' : 'cara';
  }
  return { hours: out, source: [...new Set(sources)].join(' + '), mode: config.get().tariff.mode };
}

// Mejor hora de inicio para un uso de n horas, desde ahora
function bestWindow(hours, n) {
  n = Math.max(1, Math.round(n || 1));
  const fut = hours.filter(x => !x.past);
  if (fut.length < n) return null;
  const avg = i => fut.slice(i, i + n).reduce((a, b) => a + b.price, 0) / n;
  let best = 0, bestAvg = avg(0);
  for (let i = 1; i + n <= fut.length; i++) { const a = avg(i); if (a < bestAvg - 1e-9) { best = i; bestAvg = a; } }
  return { start: fut[best], startNowAvg: avg(0), bestAvg, hoursAhead: best, n };
}

module.exports = { timeline, bestWindow, priceAt, getDay, period20td };
