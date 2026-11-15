// Philips Hue: control local del Bridge (API v1 por HTTP en la red de casa)
const { fetchT } = require('./util');
const config = require('./config');

let demoLights = {
  1: { name: 'Salón techo', state: { on: true, bri: 200, reachable: true } },
  2: { name: 'Salón lámpara', state: { on: false, bri: 120, reachable: true } },
  3: { name: 'Cocina', state: { on: false, bri: 254, reachable: true } },
  4: { name: 'Habitación', state: { on: false, bri: 90, reachable: true } },
  5: { name: 'Habitación niña', state: { on: true, bri: 40, reachable: true } }
};
let demoGroups = {
  1: { name: 'Salón', type: 'Room', lights: ['1', '2'] },
  2: { name: 'Cocina', type: 'Room', lights: ['3'] },
  3: { name: 'Dormitorios', type: 'Room', lights: ['4', '5'] }
};

function base() {
  const { ip, username } = config.get().hue;
  return `http://${ip}/api/${username}`;
}
function configured() { const h = config.get().hue; return config.get().demo || !!(h.ip && h.username); }

async function state() {
  if (!configured()) return { configured: false, lights: [], rooms: [] };
  let lights, groups;
  if (config.get().demo) { lights = demoLights; groups = demoGroups; }
  else {
    const [l, g] = await Promise.all([
      fetchT(base() + '/lights').then(r => r.json()),
      fetchT(base() + '/groups').then(r => r.json())
    ]);
    if (Array.isArray(l) && l[0] && l[0].error) throw new Error('Hue: ' + l[0].error.description);
    lights = l; groups = g;
  }
  const L = Object.entries(lights).map(([id, x]) => ({
    id, name: x.name, on: !!x.state.on, bri: x.state.bri ?? null, reachable: x.state.reachable !== false
  }));
  const rooms = Object.entries(groups).filter(([, g]) => g.type === 'Room' || g.type === 'Zone').map(([id, g]) => ({
    id, name: g.name, lights: g.lights,
    on: g.lights.some(i => lights[i] && lights[i].state.on)
  }));
  return { configured: true, lights: L, rooms };
}

async function setLight(id, body) {
  const b = {};
  if (body.on !== undefined) b.on = !!body.on;
  if (body.bri !== undefined) { b.bri = Math.max(1, Math.min(254, Number(body.bri))); b.on = true; }
  if (config.get().demo) { Object.assign(demoLights[id].state, b); return; }
  await fetchT(`${base()}/lights/${id}/state`, { method: 'PUT', body: JSON.stringify(b) });
}
async function setRoom(id, body) {
  const b = {};
  if (body.on !== undefined) b.on = !!body.on;
  if (body.bri !== undefined) { b.bri = Number(body.bri); b.on = true; }
  if (config.get().demo) { for (const l of demoGroups[id].lights) Object.assign(demoLights[l].state, b); return; }
  await fetchT(`${base()}/groups/${id}/action`, { method: 'PUT', body: JSON.stringify(b) });
}

// Busca el Bridge en la red (servicio oficial de Philips)
async function discover() {
  const r = await fetchT('https://discovery.meethue.com/', {}, 6000);
  return (await r.json()).map(x => x.internalipaddress);
}

// Emparejar: hay que pulsar el botón del Bridge antes (30 s de margen)
async function pair(ip) {
  const r = await fetchT(`http://${ip}/api`, {
    method: 'POST', body: JSON.stringify({ devicetype: 'centro_domotico#casa' })
  });
  const j = await r.json();
  if (j[0] && j[0].success) {
    config.save({ hue: { ip, username: j[0].success.username } });
    return { ok: true };
  }
  const err = j[0] && j[0].error;
  if (err && err.type === 101) return { ok: false, error: 'Pulsa el botón redondo del Bridge y vuelve a intentarlo en menos de 30 s.' };
  return { ok: false, error: err ? err.description : 'Respuesta inesperada del Bridge' };
}

module.exports = { state, setLight, setRoom, discover, pair, configured };
