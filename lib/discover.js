// Búsqueda de enchufes Shelly (Gen2/Gen3/Gen4) en la red de casa.
// Recorre las direcciones de la red local (x.x.x.1–254) preguntando a /shelly.
const os = require('os');
const { fetchT } = require('./util');

function subnets() {
  const out = new Set();
  for (const list of Object.values(os.networkInterfaces())) {
    for (const n of list || []) {
      if (n.family !== 'IPv4' || n.internal) continue;
      if (/^169\.254\./.test(n.address)) continue;           // sin red real
      out.add(n.address.split('.').slice(0, 3).join('.'));   // se asume /24 (lo normal en casa)
    }
  }
  return [...out];
}

async function probe(ip) {
  try {
    const r = await fetchT(`http://${ip}/shelly`, {}, 1500);
    if (!r.ok) return null;
    const j = await r.json();
    if (!j.id || !j.gen || j.gen < 2) return null;            // solo Gen2 o posteriores
    let power = null, on = null, type = 'switch';
    try {
      const s = await (await fetchT(`http://${ip}/rpc/Switch.GetStatus?id=0`, {}, 1500)).json();
      if (s && s.apower !== undefined) { power = s.apower; on = !!s.output; }
      else throw 0;
    } catch {
      try {
        const s = await (await fetchT(`http://${ip}/rpc/PM1.GetStatus?id=0`, {}, 1500)).json();
        if (s && s.apower !== undefined) { power = s.apower; type = 'pm'; }
      } catch { }
    }
    return { ip, deviceId: j.id, model: j.app || j.model || 'Shelly', name: j.name || null, auth: !!j.auth_en, type, power, on };
  } catch { return null; }
}

async function scan() {
  const ips = [];
  for (const net of subnets()) for (let i = 1; i < 255; i++) ips.push(`${net}.${i}`);
  const found = [];
  let idx = 0;
  const worker = async () => { while (idx < ips.length) { const r = await probe(ips[idx++]); if (r) found.push(r); } };
  await Promise.all(Array.from({ length: 48 }, worker));
  return found.sort((a, b) => a.deviceId.localeCompare(b.deviceId));
}

async function find(deviceId) {
  return (await scan()).find(d => d.deviceId === deviceId) || null;
}

module.exports = { scan, find, subnets };
