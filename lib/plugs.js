// Enchufes Shelly (Gen2/Gen3/Gen4, API RPC local) + registro de consumo y detección de ciclos
const { fetchT, madrid, readJSON, writeJSON } = require('./util');
const config = require('./config');
const prices = require('./prices');

const POLL_MS = 15000;
const live = {};                          // id -> último estado leído
let energy = readJSON('energy.json', {}); // id -> { "YYYY-MM-DDTHH": { kWh, cost } }
let cycles = readJSON('cycles.json', {}); // id -> [ { start, end, kWh, cost } ]
const lastTotal = {};                     // id -> último contador Wh
const cycleState = {};                    // id -> { running, start, startWh, lowSince }

// ---------- Simulación (modo demo) ----------
const demo = { t0: Date.now(), totals: {}, relay: { lavadora: true, aire: false, robot: true } };
function demoPower(p) {
  const min = ((Date.now() - demo.t0) / 60000) % 20; // un "ciclo" cada 20 min para ver el detector
  if (!demo.relay[p.id] && p.type !== 'pm') return 0;
  if (/lav/i.test(p.id)) return min < 2 ? 2050 + Math.random() * 80 : min < 6 ? 180 + Math.random() * 60 : min < 7 ? 480 : 1.2;
  if (/aire|ac/i.test(p.id)) return 850 + Math.random() * 120;
  if (/robot/i.test(p.id)) return min > 12 && min < 16 ? 28 : 2.5;
  return 40;
}

// ---------- Lectura de un Shelly ----------
async function read(p) {
  if (config.get().demo) {
    const w = demoPower(p);
    demo.totals[p.id] = (demo.totals[p.id] || 1000) + w * POLL_MS / 3600e3;
    return { online: true, on: p.type === 'pm' ? null : !!demo.relay[p.id], power: w, voltage: 230 + Math.random() * 3, current: w / 230, totalWh: demo.totals[p.id] };
  }
  const method = p.type === 'pm' ? 'PM1.GetStatus' : 'Switch.GetStatus';
  const r = await fetchT(`http://${p.ip}/rpc/${method}?id=0`, {}, 3000);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const j = await r.json();
  return {
    online: true, on: p.type === 'pm' ? null : !!j.output,
    power: j.apower ?? 0, voltage: j.voltage ?? null, current: j.current ?? null,
    totalWh: j.aenergy ? j.aenergy.total : null
  };
}

async function setOn(id, on) {
  const p = config.get().plugs.find(x => x.id === id);
  if (!p) throw new Error('Enchufe no encontrado');
  if (p.type === 'pm') throw new Error('Este modelo solo mide, no puede encender/apagar');
  if (config.get().demo) { demo.relay[id] = !!on; return; }
  const r = await fetchT(`http://${p.ip}/rpc/Switch.Set?id=0&on=${on ? 'true' : 'false'}`, {}, 3000);
  if (!r.ok) throw new Error('Shelly HTTP ' + r.status);
}

// ---------- Registro ----------
function addEnergy(id, wh) {
  if (!(wh > 0)) return;
  const now = madrid();
  const kWh = wh / 1000;
  const price = prices.priceAt(now.day, now.h);
  const e = (energy[id] = energy[id] || {});
  const b = (e[now.hourKey] = e[now.hourKey] || { kWh: 0, cost: 0 });
  b.kWh += kWh;
  if (price != null) b.cost += kWh * price;
}

// Solo se detectan ciclos (inicio/fin de uso) en aparatos tipo lavadora, salvo que se configure otra cosa
function cyclesOn(p) { return p.detectCycles != null ? !!p.detectCycles : /lav|seca|friega/i.test(p.name + ' ' + p.id); }

function detectCycle(p, s) {
  const start = p.startW ?? 15, stop = p.stopW ?? 4, stopMin = p.stopMinutes ?? 5;
  const c = (cycleState[p.id] = cycleState[p.id] || { running: false });
  const now = Date.now();
  if (!c.running && s.power > start) {
    Object.assign(c, { running: true, start: now, startWh: s.totalWh, startCost: costSum(p.id), lowSince: null });
  } else if (c.running) {
    if (s.power < stop) {
      c.lowSince = c.lowSince || now;
      if (now - c.lowSince > stopMin * 60e3) {
        const kWh = s.totalWh != null && c.startWh != null ? (s.totalWh - c.startWh) / 1000 : null;
        const list = (cycles[p.id] = cycles[p.id] || []);
        list.unshift({ start: c.start, end: c.lowSince, kWh, cost: costSum(p.id) - c.startCost });
        cycles[p.id] = list.slice(0, 50);
        writeJSON('cycles.json', cycles);
        c.running = false;
      }
    } else c.lowSince = null;
  }
}
function costSum(id) { return Object.values(energy[id] || {}).reduce((a, b) => a + b.cost, 0); }

// Si un enchufe deja de responder (p. ej. el router le cambió la IP), se busca de nuevo por su identificador
const fails = {}; let lastHeal = 0;
async function heal(p) {
  if (!p.deviceId || Date.now() - lastHeal < 10 * 60e3) return;
  lastHeal = Date.now();
  try {
    const d = await require('./discover').find(p.deviceId);
    if (d && d.ip !== p.ip) {
      const list = config.get().plugs.map(x => x.id === p.id ? { ...x, ip: d.ip } : x);
      config.save({ plugs: list });
      console.log(`Enchufe ${p.name}: nueva IP ${d.ip}`);
    }
  } catch { }
}

async function pollAll() {
  for (const p of config.get().plugs) {
    try {
      const s = await read(p);
      if (s.totalWh != null) {
        const prev = lastTotal[p.id];
        if (prev != null) addEnergy(p.id, s.totalWh >= prev ? s.totalWh - prev : s.totalWh); // si se reinicia el contador
        lastTotal[p.id] = s.totalWh;
      }
      if (cyclesOn(p)) detectCycle(p, s);
      live[p.id] = { ...s, at: Date.now() };
      fails[p.id] = 0;
    } catch (e) {
      live[p.id] = { online: false, error: e.message, at: Date.now() };
      if ((fails[p.id] = (fails[p.id] || 0) + 1) >= 4 && !config.get().demo) heal(p);
    }
  }
}

function prune() {
  const limit = madrid(new Date(Date.now() - 400 * 864e5)).hourKey;
  for (const id in energy) for (const k in energy[id]) if (k < limit) delete energy[id][k];
}

function start() {
  pollAll();
  setInterval(pollAll, POLL_MS);
  setInterval(() => { prune(); writeJSON('energy.json', energy); }, 5 * 60e3);
  process.on('SIGINT', () => { writeJSON('energy.json', energy); process.exit(0); });
  process.on('SIGTERM', () => { writeJSON('energy.json', energy); process.exit(0); });
}

// ---------- Consultas ----------
function sumRange(id, fromKey, toKey) {
  let kWh = 0, cost = 0;
  for (const [k, v] of Object.entries(energy[id] || {})) if (k >= fromKey && k < toKey) { kWh += v.kWh; cost += v.cost; }
  return { kWh, cost };
}

function summary() {
  const now = madrid();
  const today = now.day + 'T00', month = now.day.slice(0, 8) + '01T00';
  return config.get().plugs.map(p => {
    const cyc = cyclesOn(p);
    const list = cyc ? (cycles[p.id] || []) : [];
    const done = list.filter(c => c.kWh != null);
    return {
      id: p.id, name: p.name, type: p.type || 'switch', icon: p.icon || '🔌',
      protect: !!p.protect, cycleHours: p.cycleHours || 1,
      ...(live[p.id] || { online: false }),
      today: sumRange(p.id, today, 'Z'), month: sumRange(p.id, month, 'Z'),
      detectCycles: cyc,
      running: cyc && !!(cycleState[p.id] && cycleState[p.id].running),
      runningSince: cyc && cycleState[p.id] && cycleState[p.id].running ? cycleState[p.id].start : null,
      lastCycle: list[0] || null,
      avgCycleKWh: done.length ? done.slice(0, 10).reduce((a, b) => a + b.kWh, 0) / Math.min(done.length, 10) : null
    };
  });
}

// Consumo por día de los últimos n días
function history(days = 14) {
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = madrid(new Date(Date.now() - i * 864e5)).day;
    const row = { day: d, total: { kWh: 0, cost: 0 }, plugs: {} };
    for (const p of config.get().plugs) {
      const s = sumRange(p.id, d + 'T00', d + 'T99');
      row.plugs[p.id] = s; row.total.kWh += s.kWh; row.total.cost += s.cost;
    }
    out.push(row);
  }
  return out;
}

function cyclesOf(id) { return cycles[id] || []; }

module.exports = { start, summary, history, setOn, cyclesOf };
