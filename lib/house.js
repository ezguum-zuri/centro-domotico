// Consumo de toda la casa: importación de ficheros de la distribuidora (i-DE y similares),
// precios PVPC históricos de REE y comparación de tarifas con el consumo real.
const { readJSON, writeJSON, madrid, fetchT } = require('./util');
const config = require('./config');
const { period20td } = require('./prices');

let house = readJSON('house.json', {});              // "YYYY-MM-DDTHH" (hora de inicio) -> Wh
let pvpc = readJSON('pvpc-history.json', {});        // "YYYY-MM-DDTHH" -> €/kWh
let monthsOk = readJSON('pvpc-months.json', {});     // "YYYY-MM" -> true si el mes ya está completo
let status = { loading: false, msg: '' };

// Festivos nacionales (cuentan como valle en 2.0TD)
const FEST = new Set(['01-01', '01-06', '05-01', '08-15', '10-12', '11-01', '12-06', '12-08', '12-25']);
const EASTER_FRIDAY = { 2025: '04-18', 2026: '04-03', 2027: '03-26', 2028: '04-14' };
function periodOf(key) {
  const day = key.slice(0, 10), h = Number(key.slice(11, 13));
  const md = day.slice(5);
  if (FEST.has(md) || EASTER_FRIDAY[day.slice(0, 4)] === md) return 'valle';
  const dow = new Date(day + 'T12:00:00Z').getUTCDay();
  return period20td(dow, h);
}
const P = { punta: 'P1', llano: 'P2', valle: 'P3' };

// ---------- Importación ----------
function keyFromUTCms(ms) { return new Date(ms).toISOString().slice(0, 13); }

function parse(text) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) throw new Error('El archivo está vacío');
  const sep = lines[0].includes(';') ? ';' : ',';
  const head = lines[0].split(sep).map(s => s.trim().toUpperCase());
  const iFH = head.findIndex(h => h === 'FECHA-HORA');
  const iFecha = head.findIndex(h => h === 'FECHA');
  const iHora = head.findIndex(h => h === 'HORA');
  const iWh = head.findIndex(h => h.startsWith('CONSUMO') && h.includes('WH') && !h.includes('KWH'));
  const iKWh = head.findIndex(h => (h.startsWith('CONSUMO') || h.startsWith('AE')) && h.includes('KWH'));
  if (iWh < 0 && iKWh < 0) throw new Error('No encuentro la columna de consumo en el archivo');
  const out = {};
  for (const line of lines.slice(1)) {
    const c = line.split(sep).map(s => s.trim());
    let ms; // fin de la hora, como si fuera UTC (hora local "naive")
    if (iFH >= 0) {                      // i-DE: "2026/01/01 01:00" = hora que termina a la 01:00
      const m = /(\d{4})[\/-](\d{2})[\/-](\d{2})\s+(\d{1,2}):(\d{2})/.exec(c[iFH] || '');
      if (!m) continue;
      ms = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4]);
    } else if (iFecha >= 0 && iHora >= 0) { // formato habitual: "01/01/2026;1;0,081"
      const m = /(\d{2})\/(\d{2})\/(\d{4})/.exec(c[iFecha] || '');
      if (!m) continue;
      ms = Date.UTC(+m[3], +m[2] - 1, +m[1], Number(c[iHora]));
    } else continue;
    const key = keyFromUTCms(ms - 3600e3);  // hora de inicio
    const wh = iWh >= 0 ? Number((c[iWh] || '').replace(',', '.')) : Number((c[iKWh] || '').replace(',', '.')) * 1000;
    if (!isFinite(wh)) continue;
    out[key] = (out[key] || 0) + wh;       // cambio de hora de octubre: se suman las dos
  }
  const n = Object.keys(out).length;
  if (!n) throw new Error('No he podido leer ninguna hora del archivo');
  return out;
}

function importText(text) {
  const data = parse(text);
  Object.assign(house, data);
  writeJSON('house.json', house);
  loadPVPC(); // en segundo plano
  const keys = Object.keys(data).sort();
  return { hours: keys.length, from: keys[0].slice(0, 10), to: keys[keys.length - 1].slice(0, 10) };
}

function clear() { house = {}; writeJSON('house.json', house); }

// ---------- Precios PVPC históricos (REE) ----------
function lastDay(ym) { const [y, m] = ym.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); }

async function fetchMonth(ym) {
  const url = `https://apidatos.ree.es/es/datos/mercados/precios-mercados-tiempo-real?start_date=${ym}-01T00:00&end_date=${ym}-${lastDay(ym)}T23:59&time_trunc=hour`;
  const r = await fetchT(url, { headers: { Accept: 'application/json' } }, 20000);
  if (!r.ok) throw new Error('REE HTTP ' + r.status);
  const j = await r.json();
  const serie = (j.included || []).find(s => /pvpc/i.test(s.type || '') || /pvpc/i.test((s.attributes || {}).title || '') || s.id === '1001');
  if (!serie) throw new Error('REE sin serie PVPC');
  const acc = {};
  for (const v of serie.attributes.values) {
    const k = madrid(new Date(v.datetime)).hourKey;
    (acc[k] = acc[k] || []).push(v.value / 1000);
  }
  for (const k in acc) pvpc[k] = acc[k].reduce((a, b) => a + b, 0) / acc[k].length;
}

async function loadPVPC() {
  if (status.loading) return;
  const months = [...new Set(Object.keys(house).map(k => k.slice(0, 7)))].sort();
  const thisMonth = madrid().day.slice(0, 7);
  const todo = months.filter(m => !monthsOk[m]);
  if (!todo.length) return;
  status = { loading: true, msg: `Descargando precios PVPC de Red Eléctrica (0/${todo.length} meses)…` };
  let i = 0, errors = 0;
  for (const m of todo) {
    try {
      await fetchMonth(m);
      if (m < thisMonth) monthsOk[m] = true;
    } catch (e) { errors++; }
    status.msg = `Descargando precios PVPC de Red Eléctrica (${++i}/${todo.length} meses)…`;
    await new Promise(r => setTimeout(r, 400));
  }
  writeJSON('pvpc-history.json', pvpc);
  writeJSON('pvpc-months.json', monthsOk);
  status = { loading: false, msg: errors ? `No se pudieron descargar ${errors} meses de precios PVPC. Se reintentará más tarde.` : '' };
}

// ---------- Análisis ----------
function summary() {
  const keys = Object.keys(house).sort();
  if (!keys.length) return { hasData: false, status };
  const days = new Set(keys.map(k => k.slice(0, 10))).size;
  const total = keys.reduce((a, k) => a + house[k], 0) / 1000;

  const months = {}, byHour = Array(24).fill(0), byPeriod = { P1: 0, P2: 0, P3: 0 };
  const nights = [];
  for (const k of keys) {
    const kwh = house[k] / 1000, h = Number(k.slice(11, 13));
    const m = k.slice(0, 7);
    months[m] = (months[m] || 0) + kwh;
    byHour[h] += kwh;
    byPeriod[P[periodOf(k)]] += kwh;
    if (h >= 2 && h < 5) nights.push(house[k]);
  }
  nights.sort((a, b) => a - b);
  const baseW = nights.length ? nights[Math.floor(nights.length / 2)] : null;

  // Últimos 30 días (por día)
  const daily = {};
  for (const k of keys.slice(-24 * 30)) { const d = k.slice(0, 10); daily[d] = (daily[d] || 0) + house[k] / 1000; }

  return {
    hasData: true, status,
    from: keys[0].slice(0, 10), to: keys[keys.length - 1].slice(0, 10), days,
    totalKWh: total, perDay: total / days, perYear: total / days * 365,
    baseW, baseYearKWh: baseW != null ? baseW * 8.76 : null,
    byPeriod,
    months: Object.entries(months).map(([m, v]) => ({ m, kWh: v })),
    profileW: byHour.map(v => v / days * 1000),
    daily: Object.entries(daily).map(([d, v]) => ({ d, kWh: v })),
    compare: compare(keys, days)
  };
}

// Precio de una hora según la oferta
function compare(keys, days) {
  const c = config.get();
  const kw = Number(c.house?.kw) || 4.6;
  const offers = c.offers || [];
  const IEE = 0.0511269632, IVA = 0.21;
  const res = [];

  // Media mensual del PVPC disponible (para huecos)
  const monthAvg = {};
  for (const [k, v] of Object.entries(pvpc)) { const m = k.slice(0, 7); (monthAvg[m] = monthAvg[m] || []).push(v); }
  for (const m in monthAvg) monthAvg[m] = monthAvg[m].reduce((a, b) => a + b, 0) / monthAvg[m].length;

  const calc = (name, priceFn, p1, p2, note) => {
    let energy = 0, missing = 0;
    for (const k of keys) {
      const p = priceFn(k);
      if (p == null) { missing++; continue; }
      energy += house[k] / 1000 * p;
    }
    const power = (Number(p1) + Number(p2)) * kw * days;
    const total = energy + power;
    const withTax = total * (1 + IEE) * (1 + IVA);
    res.push({ name, energy, power, total, perYear: total / days * 365, perYearTax: withTax / days * 365, missing, note });
  };

  for (const o of offers) {
    if (o.type === '3p') {
      calc(o.name, k => ({ punta: o.punta, llano: o.llano, valle: o.valle }[periodOf(k)]), o.p1, o.p2, 'Punta/llano/valle');
    } else {
      calc(o.name, () => Number(o.price), o.p1, o.p2, 'Precio único');
    }
  }
  // PVPC con precios reales hora a hora
  const PV = c.house?.pvpcPower || { p1: 0.0738, p2: 0.0019 };
  const covered = keys.filter(k => pvpc[k] != null).length;
  calc('PVPC (regulada)', k => pvpc[k] ?? monthAvg[k.slice(0, 7)] ?? null, PV.p1, PV.p2,
    covered === keys.length ? 'Precio real hora a hora (REE)' :
      covered ? `Precio real en ${Math.round(covered / keys.length * 100)} % de las horas` : 'Sin precios todavía');
  const pv = res[res.length - 1];
  if (!covered && !Object.keys(monthAvg).length) pv.unavailable = true;

  res.sort((a, b) => (a.unavailable ? 1 : 0) - (b.unavailable ? 1 : 0) || a.total - b.total);
  return { kw, days, rows: res };
}

function start() { if (Object.keys(house).length) setTimeout(loadPVPC, 5000); setInterval(loadPVPC, 6 * 3600e3); }

module.exports = { importText, summary, clear, start, loadPVPC };
