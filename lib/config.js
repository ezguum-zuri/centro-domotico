// Configuración en config.json (junto a server.js)
const fs = require('fs');
const path = require('path');
const FILE = path.join(__dirname, '..', 'config.json');

const DEFAULTS = {
  port: 8080,
  demo: false,
  hue: { ip: '', username: '' },
  tado: { enabled: true, pollMinutes: 60 },
  // mode: "pvpc" (tarifa regulada, precio por horas de REE)
  //       "2.0td" (mercado libre con 3 periodos punta/llano/valle)
  //       "fija"  (mismo precio todo el día)
  tariff: {
    mode: 'pvpc',
    fixedPrice: 0.15,
    periods: { punta: 0.24, llano: 0.16, valle: 0.10 }
  },
  plugs: [],
  // Consumo de toda la casa (archivo de la distribuidora) y ofertas a comparar
  house: { kw: 4.6, pvpcPower: { p1: 0.0738, p2: 0.0019 } },
  offers: [
    { name: 'Mi tarifa (edítala)', type: 'fija', price: 0.15, p1: 0.08, p2: 0.08 }
  ]
};

let cfg;
function load() {
  let user = {};
  try { user = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch { }
  cfg = {
    ...DEFAULTS, ...user,
    hue: { ...DEFAULTS.hue, ...(user.hue || {}) },
    tado: { ...DEFAULTS.tado, ...(user.tado || {}) },
    tariff: { ...DEFAULTS.tariff, ...(user.tariff || {}), periods: { ...DEFAULTS.tariff.periods, ...((user.tariff || {}).periods || {}) } },
    plugs: user.plugs || [],
    house: { ...DEFAULTS.house, ...(user.house || {}) },
    offers: user.offers || DEFAULTS.offers
  };
  if (process.env.DEMO === '1') cfg.demo = true;
  if (process.env.PORT) cfg.port = Number(process.env.PORT);
  return cfg;
}
function get() { return cfg || load(); }
function save(patch) {
  const c = get();
  Object.assign(c, patch);
  if (process.env.DEMO === '1') return c; // en modo demo no se toca config.json
  fs.writeFileSync(FILE, JSON.stringify(c, null, 2));
  return c;
}
module.exports = { load, get, save };
