// Tiempo fuera de casa: Open-Meteo (gratis, sin clave). Se consulta cada 15 min y se guarda en memoria.
// La localidad se elige en Ajustes y se guarda en config.json como { weather: { name, lat, lon } }.
const { fetchT } = require('./util');
const config = require('./config');

let cache = { at: 0, data: null, error: null, key: '' };
let loading = false;

function place() { return config.get().weather || {}; }

const DEMO = {
  current: { temp: 13.4, feels: 11.8, humidity: 78, wind: 14, code: 3, isDay: true, rain: 0 },
  days: [
    { day: '', max: 15, min: 9, code: 3, rainProb: 20 },
    { day: '', max: 14, min: 8, code: 61, rainProb: 70 },
    { day: '', max: 17, min: 10, code: 2, rainProb: 10 },
    { day: '', max: 18, min: 11, code: 0, rainProb: 0 }
  ]
};

async function refresh() {
  const p = place();
  if (config.get().demo && p.lat == null) {
    const d = new Date();
    DEMO.days.forEach((x, i) => { const t = new Date(d.getTime() + i * 864e5); x.day = t.toISOString().slice(0, 10); });
    cache = { at: Date.now(), data: DEMO, error: null, key: 'demo' };
    return;
  }
  if (p.lat == null || p.lon == null) return;
  const key = `${p.lat},${p.lon}`;
  if (loading) return;
  loading = true;
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${p.lat}&longitude=${p.lon}` +
      '&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,is_day,precipitation' +
      '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max' +
      '&timezone=Europe%2FMadrid&forecast_days=4';
    const r = await fetchT(url, {}, 8000);
    if (!r.ok) throw new Error('Open-Meteo HTTP ' + r.status);
    const j = await r.json();
    const c = j.current || {}, d = j.daily || {};
    cache = {
      at: Date.now(), error: null, key,
      data: {
        current: {
          temp: c.temperature_2m, feels: c.apparent_temperature, humidity: c.relative_humidity_2m,
          wind: c.wind_speed_10m, code: c.weather_code, isDay: c.is_day === 1, rain: c.precipitation
        },
        days: (d.time || []).map((day, i) => ({
          day, max: d.temperature_2m_max[i], min: d.temperature_2m_min[i],
          code: d.weather_code[i], rainProb: d.precipitation_probability_max ? d.precipitation_probability_max[i] : null
        }))
      }
    };
  } catch (e) { cache.error = e.message; }
  finally { loading = false; }
}

// Devuelve lo que haya en memoria y, si está viejo, pide datos nuevos en segundo plano
function state() {
  const p = place();
  const key = config.get().demo && p.lat == null ? 'demo' : `${p.lat},${p.lon}`;
  if (cache.key !== key || Date.now() - cache.at > 15 * 60e3) refresh();
  const ok = cache.key === key;
  return { configured: p.lat != null || !!config.get().demo, name: p.name || (config.get().demo ? 'Bilbao (demo)' : ''),
    ...(ok ? cache.data : null), at: ok ? cache.at : null, error: cache.error };
}

// Buscar una localidad por nombre (para Ajustes)
async function search(q) {
  q = String(q || '').trim();
  if (q.length < 2) return [];
  const r = await fetchT(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=8&language=es&format=json`, {}, 8000);
  if (!r.ok) throw new Error('Búsqueda HTTP ' + r.status);
  const j = await r.json();
  return (j.results || []).map(x => ({
    name: x.name, lat: x.latitude, lon: x.longitude,
    detail: [x.admin2, x.admin1, x.country].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(', ')
  }));
}

function setPlace(b) {
  if (b.lat == null || b.lon == null) throw new Error('Falta la localidad');
  config.save({ weather: { name: String(b.name || ''), lat: Number(b.lat), lon: Number(b.lon) } });
  cache.at = 0; refresh();
}

function start() { refresh(); setInterval(refresh, 15 * 60e3); }

module.exports = { state, search, setPlace, start };
