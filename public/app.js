// Panel del centro de control
// Si el navegador tiene guardada la página antigua (caché), se descarga la nueva y se recarga
if ((!document.getElementById('quickDevices') || !document.getElementById('weatherCard') || !document.getElementById('hDays') || !document.getElementById('phoneCard')) && !sessionStorage.getItem('recargado4')) {
  sessionStorage.setItem('recargado4', '1');
  fetch('/', { cache: 'reload' }).catch(() => {}).finally(() => location.replace('/?v=' + Date.now()));
  throw new Error('Página antigua en caché: recargando');
}
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const eur = (v, d = 2) => v == null ? '—' : v.toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d }) + ' €';
const kwh = v => v == null ? '—' : (v < 1 ? (v * 1000).toFixed(0) + ' Wh' : v.toLocaleString('es-ES', { maximumFractionDigits: 2 }) + ' kWh');
const watts = v => v == null ? '—' : v >= 1000 ? (v / 1000).toLocaleString('es-ES', { maximumFractionDigits: 2 }) + ' kW' : Math.round(v) + ' W';
const cent = v => v == null ? '—' : (v * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 }) + ' c€/kWh';
const hh = h => String(h).padStart(2, '0') + ':00';
const num = (v, d = 1) => v == null ? '—' : Number(v).toLocaleString('es-ES', { maximumFractionDigits: d });
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const ICON_BULB = '<svg viewBox="0 0 24 24"><path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.7.6 1.1 1.3 1.1 2.2h5c0-.9.4-1.6 1.1-2.2A6 6 0 0 0 12 3z"/></svg>';
const ICON_CHEV = '<svg viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg>';
const dm = d => d.slice(8) + '/' + d.slice(5, 7);

// Icono automático según el nombre (el mismo criterio que el servidor)
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
const normTxt = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
function autoIcon(name) { const n = normTxt(name); const m = AUTO_ICONS.find(([re]) => re.test(n)); return m ? m[1] : '🔌'; }

let S = null, tab = 'inicio', busy = false, climaSel = 0;

async function api(path, data) {
  const r = await fetch('/api/' + path, data !== undefined ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) } : {});
  const j = await r.json();
  if (!r.ok) throw new Error(j.error || 'Error');
  return j;
}
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2600); }
async function act(path, data, msg) {
  try { await api(path, data); if (msg) toast(msg); await load(); }
  catch (e) { toast('⚠️ ' + e.message); }
}

// ---------------- Pestañas ----------------
document.querySelectorAll('.tabs button').forEach(b => b.onclick = () => {
  tab = b.dataset.tab;
  document.querySelectorAll('.tabs button').forEach(x => x.classList.toggle('active', x === b));
  document.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x.id === 'tab-' + tab));
  if (tab === 'ajustes') { $('#scanRes').innerHTML = ''; $('#wRes').innerHTML = ''; loadConfig(); } // la búsqueda de enchufes se limpia al volver
  if (tab === 'energia') { loadHistory(); if (openPlug) loadPlugDays(true); }
  if (tab === 'consumo') loadHouse();
  render();
  scrollTo(0, 0);
});

// ---------------- Carga ----------------
async function load() {
  try { S = await api('state'); render(); }
  catch (e) { $('#quickClima').innerHTML = `<div class="warn">No se puede conectar con el servidor de casa (${esc(e.message)}).</div>`; }
}
setInterval(() => { if (!busy && !document.hidden) load(); }, 5000);
function tick() { $('#clock').textContent = new Date().toLocaleString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }); }
setInterval(tick, 1000); tick();

function render() {
  if (!S) return;
  $('#demoBadge').classList.toggle('hidden', !S.demo);
  renderInicio(); renderLuces(); renderClima(); renderEnergia();
}

// ---------------- Dial de temperatura ----------------
// Anillo de 270°: 5 °C a la izquierda abajo, 25 °C a la derecha abajo
function dial(r, pre) {
  const off = r.power === 'OFF';
  const C = 2 * Math.PI * 84, arc = C * 0.75;
  const frac = t => Math.max(0, Math.min(1, ((t ?? 5) - 5) / 20));
  const v = off ? 0 : frac(r.target);
  const gid = `g-${pre}-${r.id}`;
  let mark = '';
  if (r.inside != null) {
    const a = (135 + 270 * frac(r.inside)) * Math.PI / 180;
    mark = `<circle cx="${100 + 84 * Math.cos(a)}" cy="${100 + 84 * Math.sin(a)}" r="6" fill="${css('--bg')}" stroke="#fff" stroke-width="2.5"/>`;
  }
  // Marcas cada grado
  let ticks = '';
  for (let t = 5; t <= 25; t++) {
    const a = (135 + 270 * (t - 5) / 20) * Math.PI / 180, r1 = t % 5 ? 70 : 66, r2 = 74;
    ticks += `<line x1="${100 + r1 * Math.cos(a)}" y1="${100 + r1 * Math.sin(a)}" x2="${100 + r2 * Math.cos(a)}" y2="${100 + r2 * Math.sin(a)}" stroke="${css('--line')}" stroke-width="${t % 5 ? 1 : 2}"/>`;
  }
  return `
  <div class="dial-wrap">
    <button class="round" data-t="${r.id}" data-d="-0.5" aria-label="Bajar">−</button>
    <div class="dial">
      <svg viewBox="0 0 200 200">
        <defs><linearGradient id="${gid}" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#3b82f6"/><stop offset="1" stop-color="${r.heating ? '#f59e0b' : '#38bdf8'}"/></linearGradient></defs>
        ${ticks}
        <circle cx="100" cy="100" r="84" fill="none" stroke="rgba(255,255,255,.07)" stroke-width="12" stroke-linecap="round" stroke-dasharray="${arc} ${C}" transform="rotate(135 100 100)"/>
        ${v > 0 ? `<circle cx="100" cy="100" r="84" fill="none" stroke="url(#${gid})" stroke-width="12" stroke-linecap="round" stroke-dasharray="${arc * v} ${C}" transform="rotate(135 100 100)" style="filter:drop-shadow(0 0 6px rgba(56,189,248,.45))"/>` : ''}
        ${mark}
      </svg>
      <div class="c">
        <div class="t">${num(r.inside)}<sup>°C</sup></div>
        <div class="s">${off ? 'Apagado' : 'Objetivo <b style="color:var(--text)">' + num(r.target) + '°</b>'}</div>
        ${r.heating ? `<div class="heat">● Calentando ${r.heating}%</div>` : ''}
      </div>
    </div>
    <button class="round" data-t="${r.id}" data-d="0.5" aria-label="Subir">+</button>
  </div>
  <div class="meta">${r.humidity != null ? `<span>Humedad <b>${r.humidity}%</b></span>` : ''}<span>${r.manual ? '<span class="pill run">Manual</span>' : '<span class="pill">Programa</span>'}</span></div>
  <div class="actions">
    <button class="ghost small" data-resume="${r.id}">Volver al programa</button>
    <button class="ghost small" data-off="${r.id}">Apagar</button>
  </div>`;
}
function bindDial(root) {
  const t = S.tado;
  root.querySelectorAll('[data-t]').forEach(b => b.onclick = () => {
    const r = t.rooms.find(x => x.id == b.dataset.t);
    const temp = Math.min(25, Math.max(5, (r.power === 'OFF' ? 18 : r.target || 20) + Number(b.dataset.d)));
    act('tado/room', { id: r.id, temp }, `${r.name}: ${temp} °C`);
  });
  root.querySelectorAll('[data-resume]').forEach(b => b.onclick = () => act('tado/room', { id: b.dataset.resume, resume: true }, 'Vuelve al programa'));
  root.querySelectorAll('[data-off]').forEach(b => b.onclick = () => act('tado/room', { id: b.dataset.off, off: true }, 'Calefacción apagada'));
}

// Medidor semicircular de potencia
function gauge(w) {
  const max = Math.max(3500, Math.ceil((w || 0) * 1.15 / 500) * 500);
  const C = Math.PI * 80, v = Math.min(1, (w || 0) / max);
  const col = v < .35 ? css('--good') : v < .7 ? css('--mid') : css('--bad');
  return `<svg viewBox="0 0 200 126" style="width:100%;max-width:260px;margin:0 auto">
    <path d="M20 100 A80 80 0 0 1 180 100" fill="none" stroke="rgba(255,255,255,.07)" stroke-width="14" stroke-linecap="round"/>
    <path d="M20 100 A80 80 0 0 1 180 100" fill="none" stroke="${col}" stroke-width="14" stroke-linecap="round" stroke-dasharray="${C * v} ${C}" style="filter:drop-shadow(0 0 6px ${col}66)"/>
    <text x="100" y="84" text-anchor="middle" font-size="30" font-weight="700" fill="${css('--text')}">${watts(w)}</text>
    <text x="20" y="122" text-anchor="middle" font-size="9" fill="${css('--muted')}">0</text>
    <text x="180" y="122" text-anchor="middle" font-size="9" fill="${css('--muted')}">${(max / 1000).toLocaleString('es-ES')} kW</text>
  </svg>`;
}

// ---------------- Tiempo fuera de casa ----------------
// Códigos WMO de Open-Meteo -> icono y texto
function wx(code, day = true) {
  const c = Number(code);
  if (c === 0) return [day ? '☀️' : '🌙', 'Despejado'];
  if (c === 1) return [day ? '🌤️' : '🌙', 'Casi despejado'];
  if (c === 2) return ['⛅', 'Intervalos nubosos'];
  if (c === 3) return ['☁️', 'Nublado'];
  if (c === 45 || c === 48) return ['🌫️', 'Niebla'];
  if (c >= 51 && c <= 57) return ['🌦️', 'Llovizna'];
  if (c >= 61 && c <= 67) return ['🌧️', c >= 65 ? 'Lluvia fuerte' : 'Lluvia'];
  if (c >= 71 && c <= 77) return ['🌨️', 'Nieve'];
  if (c >= 80 && c <= 82) return ['🌦️', 'Chubascos'];
  if (c === 85 || c === 86) return ['🌨️', 'Chubascos de nieve'];
  if (c >= 95) return ['⛈️', 'Tormenta'];
  return ['🌡️', ''];
}
function renderWeather() {
  const w = S.weather || {};
  const el = $('#weatherCard');
  if (!w.configured) { el.innerHTML = `<div class="ph">Tiempo fuera</div><div class="muted small">Elige tu pueblo o ciudad en Ajustes para ver el tiempo.</div>`; return; }
  if (!w.current) { el.innerHTML = `<div class="ph">Tiempo fuera · ${esc(w.name)}</div><div class="muted small">${w.error ? '⚠️ ' + esc(w.error) : 'Cargando…'}</div>`; return; }
  const c = w.current, [ico, txt] = wx(c.code, c.isDay);
  const dn = d => { const t = new Date(d + 'T12:00:00'); const today = new Date().toDateString() === t.toDateString(); return today ? 'Hoy' : t.toLocaleDateString('es-ES', { weekday: 'short' }).replace('.', ''); };
  el.innerHTML = `<div class="ph">Tiempo fuera · ${esc(w.name)}</div>
    <div class="wx-wrap"><div>
      <div class="wx-now"><div class="wx-ico">${ico}</div><div><div class="big">${num(c.temp)}<small>°C</small></div><div class="wx-desc">${txt}</div></div></div>
      <div class="wx-meta"><span>Sensación <b>${num(c.feels)}°</b></span><span>Humedad <b>${num(c.humidity, 0)}%</b></span><span>Viento <b>${num(c.wind, 0)} km/h</b></span></div>
    </div>
    <div class="wx-days">${(w.days || []).slice(0, 4).map(d => `<div>${dn(d.day)}<div class="i">${wx(d.code)[0]}</div><b>${num(d.max, 0)}°</b> / ${num(d.min, 0)}°${d.rainProb ? `<div class="r">💧 ${d.rainProb}%</div>` : ''}</div>`).join('')}</div></div>`;
}

// ---------------- Inicio ----------------
function priceNowObj() { return S.prices.hours?.find(h => h.now); }
function renderInicio() {
  const s = S.summary;
  renderWeather();
  const fixed = S.prices.mode === 'fija';

  // Clima (un dial, con selector de estancia)
  const t = S.tado, rooms = t.rooms || [];
  if (!t.linked) $('#quickClima').innerHTML = `<div class="ph">Clima</div><div class="muted small">tado sin vincular (Ajustes).</div>`;
  else if (!rooms.length) $('#quickClima').innerHTML = `<div class="ph">Clima</div><div class="muted small">${esc(t.error || 'Cargando…')}</div>`;
  else {
    if (climaSel >= rooms.length) climaSel = 0;
    const r = rooms[climaSel];
    $('#quickClima').innerHTML = `<div class="ph"><span>Clima · ${esc(r.name)}</span>
      ${rooms.length > 1 ? `<div class="seg">${rooms.map((x, i) => `<button data-sel="${i}" class="${i === climaSel ? 'on' : ''}">${esc(x.name)}</button>`).join('')}</div>` : ''}</div>${dial(r, 'home')}`;
    $('#quickClima').querySelectorAll('[data-sel]').forEach(b => b.onclick = () => { climaSel = +b.dataset.sel; renderInicio(); });
    bindDial($('#quickClima'));
  }

  // Dispositivos: estancias Hue + enchufes
  const tiles = [];
  if (S.hue.configured) for (const r of S.hue.rooms || [])
    tiles.push(`<button class="dev ${r.on ? 'on' : ''}" data-room="${r.id}" data-on="${r.on}"><span class="led"></span>
      <div class="di">${ICON_BULB}</div><div><div class="dn">${esc(r.name)}</div><div class="ds">${r.on ? 'Encendida' : 'Apagada'}</div></div></button>`);
  for (const p of S.plugs) {
    const cls = !p.online ? 'off' : p.type === 'pm' ? 'meter' + (p.power > 3 ? ' on' : '') : p.on ? 'on' : '';
    const sub = !p.online ? 'Sin conexión' : p.running ? 'En marcha · ' + watts(p.power) : p.type === 'pm' || p.on ? watts(p.power) : 'Apagado';
    tiles.push(`<button class="dev ${cls}" ${p.type !== 'pm' && p.online ? `data-plugt="${p.id}"` : ''}><span class="led"></span>
      <div class="di">${esc(p.icon)}</div><div><div class="dn">${esc(p.name)}</div><div class="ds">${sub}</div></div></button>`);
  }
  $('#quickDevices').innerHTML = tiles.join('') || `<div class="muted small">Vincula Hue o añade enchufes en Ajustes.</div>`;
  $('#quickDevices').querySelectorAll('[data-room]').forEach(b => b.onclick = () => act('hue/room', { id: b.dataset.room, on: b.dataset.on !== 'true' }));
  $('#quickDevices').querySelectorAll('[data-plugt]').forEach(b => b.onclick = () => {
    const p = S.plugs.find(x => x.id === b.dataset.plugt);
    if (p.on && p.protect && !confirm(`¿Seguro que quieres cortar la corriente de "${p.name}"?${p.running ? '\nAhora mismo está funcionando.' : ''}`)) return;
    act('plug', { id: p.id, on: !p.on }, `${p.name}: ${p.on ? 'apagado' : 'encendido'}`);
  });

  // Precio de la luz
  const p = priceNowObj();
  const fut = (S.prices.hours || []).filter(h => !h.past);
  const cheapest = fut.reduce((a, b) => (!a || b.price < a.price) ? b : a, null);
  if (!p) $('#priceNow').innerHTML = `<div class="ph">Precio de la luz</div><div class="muted">Sin precios todavía${S.prices.error ? ': ' + esc(S.prices.error) : ''}</div>`;
  else if (fixed) $('#priceNow').innerHTML = `<div class="ph">Precio de la luz <span class="pill">Tarifa fija</span></div>
    <div class="big">${num(p.price * 100)}<small>c€/kWh</small></div>
    <div class="muted small" style="margin-top:6px">Mismo precio todas las horas: pon los aparatos cuando te venga bien.</div>`;
  else {
    const next = fut.slice(0, 24), mx = Math.max(...next.map(h => h.price)), bw = 200 / next.length;
    const col = { barata: css('--good'), media: css('--mid'), cara: css('--bad') };
    $('#priceNow').innerHTML = `<div class="ph">Precio ahora · ${hh(p.h)} <span class="lvl ${p.level}">${p.level.toUpperCase()}</span></div>
      <div class="big">${num(p.price * 100)}<small>c€/kWh</small></div>
      ${cheapest ? `<div class="muted small" style="margin-top:6px">Más barata: <b style="color:var(--text)">${cheapest.day !== p.day ? 'mañana ' : ''}${hh(cheapest.h)}</b> · ${cent(cheapest.price)}</div>` : ''}
      <svg class="spark" viewBox="0 0 200 40" preserveAspectRatio="none" style="width:100%;height:40px">${next.map((h, i) =>
        `<rect x="${i * bw + .8}" y="${40 - h.price / mx * 38}" width="${bw - 1.6}" height="${h.price / mx * 38}" rx="1.5" fill="${col[h.level]}" opacity="${h.now ? 1 : .55}"/>`).join('')}</svg>
      <div class="muted small">Próximas 24 h</div>`;
  }

  // Consumo
  $('#powerCard').innerHTML = `<div class="ph">Consumo de los enchufes</div>${gauge(s.powerNow)}
    <div class="stats stats4"><div><b>${kwh(s.kWhToday)}</b><span>Hoy</span></div><div><b>${eur(s.costToday)}</b><span>Coste hoy</span></div><div><b>${eur(s.costWeek)}</b><span>Esta semana</span></div><div><b>${eur(s.costMonth)}</b><span>Este mes</span></div></div>`;

  // Recomendaciones / ranking
  if (fixed) {
    $('#recsTitle').textContent = 'Lo que más gasta este mes';
    const list = S.plugs.filter(p => p.month).slice().sort((a, b) => b.month.kWh - a.month.kWh);
    const max = Math.max(0.001, ...list.map(p => p.month.kWh));
    $('#recs').innerHTML = list.length ? list.map((p, i) => `<div class="item"><div class="ico">${esc(p.icon)}</div><div class="main">
      <div class="row between"><span class="title">${i + 1}. ${esc(p.name)}</span><b>${eur(p.month.cost)}</b></div>
      <div style="height:6px;border-radius:4px;background:rgba(255,255,255,.06);margin:6px 0"><div style="height:6px;border-radius:4px;width:${p.month.kWh / max * 100}%;background:linear-gradient(90deg,var(--accent2),var(--accent))"></div></div>
      <div class="sub">${kwh(p.month.kWh)} este mes · hoy ${kwh(p.today.kWh)}${p.online && p.power != null ? ' · ahora ' + watts(p.power) : ''}</div>${useLine(p) ? `<div class="sub">${useLine(p)}</div>` : ''}</div></div>`).join('')
      : `<div class="muted small">Añade enchufes en Ajustes para ver qué gasta más.</div>`;
  } else {
    $('#recsTitle').textContent = 'Cuándo usar cada aparato';
    $('#recs').innerHTML = S.recs.length ? S.recs.map(r => {
      const now = r.hoursAhead === 0;
      const when = now ? '<b>Ahora mismo</b> es buen momento' : `Mejor a las <b>${hh(r.startH)}</b>${r.startDay !== priceNowObj()?.day ? ' (mañana)' : ''}`;
      const sav = r.saving != null && r.saving > 0.005 ? ` · ahorras ~${eur(r.saving)}` : (!now ? ` · ${Math.round((1 - r.bestAvg / r.nowAvg) * 100)}% más barato que ahora` : '');
      return `<div class="item"><div class="ico">${esc(r.icon)}</div><div class="main"><div class="title">${esc(r.name)}</div>
        <div class="sub">${when}${sav}</div><div class="sub">Media ${cent(r.bestAvg)} durante ${r.hours} h${r.kWh != null ? ' · ciclo típico ' + kwh(r.kWh) : ''}</div></div></div>`;
    }).join('') : `<div class="muted small">Añade enchufes en Ajustes para ver recomendaciones.</div>`;
  }
}

// ---------------- Luces ----------------
function renderLuces() {
  if (document.activeElement?.type === 'range') return; // no repintar mientras se arrastra
  const h = S.hue;
  $('#hueMsg').innerHTML = !h.configured ? `<div class="warn">Vincula el Bridge de Philips Hue en Ajustes.</div>` : h.error ? `<div class="warn">${esc(h.error)}</div>` : '';
  $('#rooms').innerHTML = (h.rooms || []).map(r => `
    <div class="item"><div class="ico">${r.on ? '💡' : '⚫'}</div><div class="main"><div class="title">${esc(r.name)}</div>
      <input type="range" min="1" max="254" value="${avgBri(r)}" data-roombri="${r.id}"></div>
      <label class="switch"><input type="checkbox" ${r.on ? 'checked' : ''} data-roomsw="${r.id}"><span></span></label></div>`).join('');
  $('#lights').innerHTML = (h.lights || []).map(l => `
    <div class="item"><div class="ico">${!l.reachable ? '🚫' : l.on ? '💡' : '⚫'}</div><div class="main"><div class="title">${esc(l.name)}</div>
      ${l.reachable ? `<input type="range" min="1" max="254" value="${l.bri ?? 254}" data-bri="${l.id}">` : '<div class="sub">No responde (¿apagada del interruptor?)</div>'}</div>
      <label class="switch"><input type="checkbox" ${l.on ? 'checked' : ''} data-sw="${l.id}"><span></span></label></div>`).join('');
  bind('[data-roomsw]', 'change', e => act('hue/room', { id: e.target.dataset.roomsw, on: e.target.checked }));
  bind('[data-roombri]', 'change', e => act('hue/room', { id: e.target.dataset.roombri, bri: +e.target.value }));
  bind('[data-sw]', 'change', e => act('hue/light', { id: e.target.dataset.sw, on: e.target.checked }));
  bind('[data-bri]', 'change', e => act('hue/light', { id: e.target.dataset.bri, bri: +e.target.value }));
}
function avgBri(r) {
  const ls = (S.hue.lights || []).filter(l => r.lights.includes(l.id) && l.on);
  return ls.length ? Math.round(ls.reduce((a, b) => a + (b.bri || 254), 0) / ls.length) : 127;
}
function bind(sel, ev, fn) { document.querySelectorAll(sel).forEach(el => el.addEventListener(ev, fn)); }

// ---------------- Clima ----------------
function renderClima() {
  const t = S.tado;
  $('#tadoMsg').innerHTML = !t.enabled ? '<div class="warn">tado desactivado en config.json.</div>' :
    !t.linked ? '<div class="warn">Vincula tu cuenta tado en Ajustes.</div>' : t.error ? `<div class="warn">${esc(t.error)}</div>` : '';
  $('#tadoRooms').innerHTML = (t.rooms || []).map(r => `<div class="card"><div class="ph">${esc(r.name)}</div>${dial(r, 'clima')}</div>`).join('');
  bindDial($('#tadoRooms'));
  const q = t.quota || {};
  $('#tadoInfo').innerHTML = t.linked ? `Actualizado: ${t.at ? new Date(t.at).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '—'} ·
    Llamadas a tado hoy: ${q.calls ?? 0}${q.remaining != null ? ' · quedan ' + q.remaining : ''}
    <button class="ghost small" id="tadoRefresh">Actualizar ahora</button><br>Sin suscripción, tado permite unas 100 llamadas al día; por eso se actualiza cada hora.` : '';
  $('#tadoRefresh') && ($('#tadoRefresh').onclick = () => act('tado/refresh', {}, 'Actualizado'));
}

// ---------------- Energía ----------------
// Coste por uso: media por ciclo (lavadora…) o coste de una hora de uso (aire, proyector…)
function useLine(p) {
  const out = [];
  if (p.detectCycles && p.avgCycleCost != null && p.cycleCount) {
    out.push(`Cada uso te cuesta <b>~${eur(p.avgCycleCost)}</b> de media (${kwh(p.avgCycleKWh)}, ${p.cycleCount >= 10 ? 'últimos 10 usos' : p.cycleCount + (p.cycleCount === 1 ? ' uso' : ' usos')})`);
  } else if (p.perHour && p.perHour.alwaysOn) {
    out.push(`Funciona todo el día: te cuesta <b>~${eur(p.perHour.perDay)}</b> al día`);
  } else if (p.perHour) {
    out.push(`Una hora de uso te cuesta <b>~${eur(p.perHour.cost)}</b> (${kwh(p.perHour.kWh)}/h de media)`);
  }
  if (p.costNowPerHour != null && (!p.detectCycles || p.running)) out.push(`ahora mismo ${eur(p.costNowPerHour)}/h`);
  return out.join(' · ');
}

function renderEnergia() {
  if (openPlug) loadPlugDays(false);
  $('#priceSrc').textContent = S.prices.source ? 'Fuente: ' + S.prices.source : '';
  priceChart();
  // Se guarda el desplazamiento de la tabla de días para no perderlo al repintar cada 5 s
  const keep = $('#plugs .days-wrap')?.scrollTop || 0;
  $('#plugs').innerHTML = S.plugs.length ? S.plugs.map(p => {
    const st = !p.online ? '<span class="pill off">Sin conexión</span>' : p.running ? '<span class="pill run">En marcha</span>' : '';
    const last = p.lastCycle ? `Último uso: ${new Date(p.lastCycle.start).toLocaleString('es-ES', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}, ${Math.round((p.lastCycle.end - p.lastCycle.start) / 60000)} min, ${kwh(p.lastCycle.kWh)}, ${eur(p.lastCycle.cost)}` : '';
    const open = openPlug === p.id;
    return `<div class="plug${open ? ' open' : ''}"><div class="item clickable"><div class="ico">${esc(p.icon)}</div><div class="main" data-open="${p.id}">
      <div class="row" style="gap:6px"><span class="title">${esc(p.name)}</span>${st}</div>
      <div class="sub">${p.online ? '<b>' + watts(p.power) + '</b> · ' : ''}Hoy ${kwh(p.today.kWh)} (${eur(p.today.cost)}) · Semana ${kwh(p.week.kWh)} (${eur(p.week.cost)}) · Mes ${kwh(p.month.kWh)} (${eur(p.month.cost)})</div>
      ${useLine(p) ? `<div class="sub">${useLine(p)}</div>` : ''}${last ? `<div class="sub">${last}</div>` : ''}${p.error ? `<div class="sub">${esc(p.error)}</div>` : ''}</div>
      <button class="chev" data-open="${p.id}" aria-label="${open ? 'Ocultar' : 'Ver'} consumo por días" title="${open ? 'Ocultar' : 'Ver'} consumo por días">${ICON_CHEV}</button>
      ${p.type !== 'pm' && p.online ? `<label class="switch"><input type="checkbox" ${p.on ? 'checked' : ''} data-plug="${p.id}" data-protect="${p.protect}"><span></span></label>` : ''}</div>
      ${open ? `<div class="plugdetail">${plugDaysHTML(p)}</div>` : ''}</div>`;
  }).join('') : '<div class="muted small">Aún no hay enchufes. Añádelos en Ajustes.</div>';
  const dw = $('#plugs .days-wrap'); if (dw) dw.scrollTop = keep;
  bind('#plugs [data-open]', 'click', e => {
    const id = e.currentTarget.dataset.open;
    openPlug = openPlug === id ? null : id;
    if (openPlug) loadPlugDays(true);
    renderEnergia();
  });
  bind('[data-plug]', 'change', e => {
    const el = e.target;
    if (!el.checked && el.dataset.protect === 'true') {
      const p = S.plugs.find(x => x.id === el.dataset.plug);
      if (!confirm(`¿Seguro que quieres cortar la corriente de "${p.name}"?${p.running ? '\nAhora mismo está funcionando.' : ''}`)) { el.checked = true; return; }
    }
    act('plug', { id: el.dataset.plug, on: el.checked });
  });
}

// ---------- Consumo por días de cada enchufe (últimos 30 días) ----------
let openPlug = null, H30 = null, H30at = 0, H30busy = false, H30err = null;
async function loadPlugDays(force) {
  if (H30busy || (!force && Date.now() - H30at < 60e3)) return;
  H30busy = true;
  try { H30 = await api('history?days=30'); H30err = null; }
  catch (e) { H30err = e.message; }
  H30at = Date.now(); H30busy = false;
  if (S) renderEnergia();
}

// Gráfico de barras por días con línea de media. items: [{label, value, title, dim}]
function barsSVG(items, opts = {}) {
  // Se dibuja al ancho real del recuadro para que no se agrande en pantallas grandes
  const n = items.length, W = Math.max(280, Math.round(opts.w || n * 18)), H = 170, top = 16, bot = 22, ch = H - top - bot;
  const every = opts.every || Math.max(1, Math.ceil(n / Math.max(4, Math.floor(W / 62))));
  const max = Math.max(0.0001, ...items.map(i => i.value)) * 1.12, bw = W / n;
  const vals = items.filter(i => !i.dim).map(i => i.value);
  const avg = opts.avg != null ? opts.avg : vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  const gid = opts.id || 'gBars';
  let g = `<defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${css('--accent')}"/><stop offset="1" stop-color="${css('--accent2')}"/></linearGradient></defs>`;
  for (const f of [0.25, 0.5, 0.75, 1]) g += `<line x1="0" x2="${W}" y1="${top + ch - f / 1.12 * ch}" y2="${top + ch - f / 1.12 * ch}" stroke="rgba(255,255,255,.05)"/>`;
  g += items.map((it, i) => {
    const bh = Math.max(it.value > 0 ? 1.5 : 0, it.value / max * ch), x = i * bw;
    return `<rect x="${x + 2}" y="${top + ch - bh}" width="${bw - 4}" height="${bh}" rx="3" fill="url(#${gid})" opacity="${it.dim ? .35 : 1}"><title>${esc(it.title)}</title></rect>` +
      ((i % every === 0 && (n - 1 - i >= Math.max(2, every / 2) || i === n - 1)) || i === n - 1
        ? `<text x="${i === 0 ? x + 2 : i === n - 1 ? x + bw - 2 : x + bw / 2}" y="${H - 6}" font-size="10" text-anchor="${i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}" fill="${css('--muted')}">${esc(it.label)}</text>` : '');
  }).join('');
  if (avg != null) {
    const y = top + ch - avg / max * ch;
    g += `<line x1="0" x2="${W}" y1="${y}" y2="${y}" stroke="${css('--on')}" stroke-width="1.5" stroke-dasharray="5 4"/>
      <text x="${W - 4}" y="${y - 5}" font-size="10.5" font-weight="600" text-anchor="end" fill="${css('--on')}" paint-order="stroke" stroke="${css('--card')}" stroke-width="3">media ${opts.fmt ? opts.fmt(avg) : avg.toFixed(2)}</text>`;
  }
  return `<svg width="100%" viewBox="0 0 ${W} ${H}">${g}</svg>`;
}
const stats4 = list => `<div class="stats stats4">${list.map(([v, l]) => `<div><b>${v}</b><span>${l}</span></div>`).join('')}</div>`;
const dayName = d => new Date(d + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });

// Casillas de coste por uso (debajo de las de consumo por días)
function useTiles(p) {
  const t = [];
  if (p.detectCycles && p.avgCycleCost != null && p.cycleCount) t.push([eur(p.avgCycleCost), `Cada uso, de media (${p.cycleCount >= 10 ? 'últimos 10' : p.cycleCount + (p.cycleCount === 1 ? ' uso' : ' usos')})`]);
  else if (p.perHour && !p.perHour.alwaysOn) t.push([eur(p.perHour.cost), `Una hora de uso, de media (${kwh(p.perHour.kWh)}/h)`]);
  if (p.costNowPerHour != null && (!p.detectCycles || p.running)) t.push([eur(p.costNowPerHour), `Por hora, al ritmo de ahora (${watts(p.power)})`]);
  if (!t.length) return '';
  return `<div class="stats stats4" style="margin-top:8px;grid-template-columns:repeat(${t.length},1fr)">${t.map(([v, l]) => `<div><b>${v}</b><span>${l}</span></div>`).join('')}</div>`;
}

function plugDaysHTML(p) {
  if (!H30) return `<div class="muted small">${H30err ? '⚠️ ' + esc(H30err) : 'Cargando…'}</div>`;
  const today = H30[H30.length - 1].day;
  const rows = H30.map(r => ({ day: r.day, ...(r.plugs[p.id] || { kWh: 0, cost: 0 }) }));
  const first = rows.findIndex(r => r.kWh > 0);
  const used = first < 0 ? [] : rows.slice(first);
  if (!used.length) return '<div class="muted small">Todavía no hay consumo guardado de este enchufe.</div>';
  const full = used.filter(r => r.day !== today && r !== used[0]);   // días completos (sin el primero ni hoy)
  const ref = full.length ? full : used;
  const avgK = ref.reduce((a, b) => a + b.kWh, 0) / ref.length, avgC = ref.reduce((a, b) => a + b.cost, 0) / ref.length;
  const tot = used.reduce((a, b) => ({ k: a.k + b.kWh, c: a.c + b.cost }), { k: 0, c: 0 });
  const items = used.map(r => ({ label: dm(r.day), value: r.kWh, dim: r.day === today || r === used[0], title: `${dm(r.day)}: ${kwh(r.kWh)} · ${eur(r.cost)}` }));
  return `<div class="ph">Consumo por días · últimos 30 días</div>
    ${stats4([
      [kwh(avgK), 'Media al día' + (full.length ? '' : ' (aprox.)')],
      [eur(avgC), 'Coste medio al día'],
      [eur(avgC * 365, 0), 'Estimado al año'],
      [kwh(tot.k), `Total ${used.length} días · ${eur(tot.c)}`]
    ])}
    ${useTiles(p)}
    <div class="chart" style="margin-top:12px">${barsSVG(items, { fmt: v => kwh(v), avg: avgK, id: 'gPlug', w: ($('#plugs')?.clientWidth || 360) - 38 })}</div>
    <p class="muted small">Las barras más apagadas son días incompletos (hoy y el primer día medido), que no cuentan para la media.</p>
    <div class="days-wrap"><table class="days"><thead><tr><th>Día</th><th>Consumo</th><th>Coste</th></tr></thead><tbody>
    ${used.slice().reverse().map(r => `<tr class="${r.day === today ? 'today' : ''}"><td>${dayName(r.day)}${r.day === today ? ' <span class="pill run">hoy</span>' : ''}</td><td>${kwh(r.kWh)}</td><td>${eur(r.cost)}</td></tr>`).join('')}
    </tbody></table></div>`;
}

function priceChart() {
  const hours = S.prices.hours || [];
  if (!hours.length) { $('#priceChart').innerHTML = '<div class="muted small">Sin datos de precio.</div>'; return; }
  const W = Math.max(hours.length * 14, 320), H = 190, top = 14, bottom = 22, ch = H - top - bottom;
  const max = Math.max(...hours.map(h => h.price)) * 1.08;
  const col = { barata: css('--good'), media: css('--mid'), cara: css('--bad') };
  const bw = W / hours.length;
  let g = '';
  hours.forEach((h, i) => {
    const bh = (h.price / max) * ch, x = i * bw, y = top + ch - bh;
    g += `<rect x="${x + 2}" y="${y}" width="${bw - 4}" height="${bh}" rx="3" fill="${col[h.level]}" opacity="${h.past ? .3 : 1}"><title>${h.day} ${hh(h.h)} · ${cent(h.price)}</title></rect>`;
    if (h.h % 3 === 0) g += `<text x="${x + bw / 2}" y="${H - 6}" font-size="10" text-anchor="middle" fill="${css('--muted')}">${h.h}</text>`;
    if (h.h === 0 && i > 0) g += `<line x1="${x}" x2="${x}" y1="${top}" y2="${top + ch}" stroke="${css('--line')}" stroke-dasharray="3 3"/><text x="${x + 4}" y="${top + 2}" font-size="10" fill="${css('--muted')}">mañana</text>`;
    if (h.now) g += `<line x1="${x + bw / 2}" x2="${x + bw / 2}" y1="${top - 6}" y2="${top + ch}" stroke="${css('--text')}" stroke-width="2"/>`;
  });
  $('#priceChart').innerHTML = `<svg width="100%" viewBox="0 0 ${W} ${H}">${g}</svg>`;
}

async function loadHistory() {
  try {
    const rows = await api('history?days=14');
    const W = 14 * 34, H = 150, top = 16, bottom = 22, ch = H - top - bottom;
    const max = Math.max(0.01, ...rows.map(r => r.total.kWh)) * 1.1;
    let g = '';
    rows.forEach((r, i) => {
      const x = i * 34, bh = (r.total.kWh / max) * ch;
      g += `<rect x="${x + 5}" y="${top + ch - bh}" width="24" height="${bh}" rx="4" fill="${css('--accent')}"><title>${r.day}: ${kwh(r.total.kWh)} · ${eur(r.total.cost)}</title></rect>`;
      g += `<text x="${x + 17}" y="${H - 6}" font-size="10" text-anchor="middle" fill="${css('--muted')}">${r.day.slice(8)}</text>`;
      if (r.total.kWh > 0) g += `<text x="${x + 17}" y="${top + ch - bh - 4}" font-size="9" text-anchor="middle" fill="${css('--muted')}">${r.total.kWh.toFixed(1)}</text>`;
    });
    $('#histChart').innerHTML = `<svg width="100%" viewBox="0 0 ${W} ${H}">${g}</svg>`;
    const tot = rows.reduce((a, r) => ({ k: a.k + r.total.kWh, c: a.c + r.total.cost }), { k: 0, c: 0 });
    $('#histTotal').textContent = `${kwh(tot.k)} · ${eur(tot.c)}`;
  } catch (e) { $('#histChart').textContent = e.message; }
}

// ---------------- Ajustes ----------------
async function loadConfig() {
  loadNet();
  const c = await api('config');
  $('#tMode').value = c.tariff.mode; $('#tFixed').value = c.tariff.fixedPrice;
  $('#tPunta').value = c.tariff.periods.punta; $('#tLlano').value = c.tariff.periods.llano; $('#tValle').value = c.tariff.periods.valle;
  tModeUI();
  $('#cfgPlugs').innerHTML = c.plugs.map(p => `<div class="item"><div class="ico">${esc(p.icon || '🔌')}</div><div class="main"><div class="title">${esc(p.name)}</div>
    <div class="sub">${esc(p.ip || '—')} · ${p.type === 'pm' ? 'solo medidor' : 'con interruptor'} · uso típico ${p.cycleHours} h</div></div>
    <button class="ghost small" data-edit="${p.id}">Editar</button><button class="ghost small" data-del="${p.id}">✕</button></div>`).join('') || '<div class="muted small">Ninguno todavía.</div>';
  bind('[data-del]', 'click', e => { if (confirm('¿Quitar este enchufe?')) act('config/plug', { remove: e.target.dataset.del }).then(loadConfig); });
  bind('[data-edit]', 'click', e => {
    const p = c.plugs.find(x => x.id === e.target.dataset.edit);
    $('#pId').value = p.id; $('#pDev').value = p.deviceId || ''; $('#pName').value = p.name; $('#pIp').value = p.ip || ''; $('#pIcon').value = p.icon || '';
    $('#pHours').value = p.cycleHours; $('#pType').value = p.type; $('#pProtect').checked = !!p.protect;
    $('#pCycles').checked = p.detectCycles != null ? !!p.detectCycles : /lav|seca|friega/i.test(p.name + ' ' + p.id); $('#plugForm').open = true;
  });
  $('#wCfg').textContent = c.weather?.name ? `Localidad: ${c.weather.name}` : 'Sin elegir';
  $('#hueCfg').textContent = c.hue.paired ? `Vinculado (${c.hue.ip})` : 'Sin vincular';
  if (c.hue.ip) $('#hueIp').value = c.hue.ip;
  const t = S?.tado;
  $('#tadoCfg').textContent = t?.linked ? 'Cuenta vinculada' : 'Sin vincular';
  $('#tadoLoginBox').innerHTML = t?.pending ? tadoBox(t.pending) : '';
}
// Código QR y dirección para abrir el panel en el iPhone
async function loadNet() {
  let n = null;
  try { n = await api('net'); } catch { }
  const local = /^(localhost|127\.|\[?::1)/.test(location.hostname);
  // Si ya se está viendo desde otro aparato, esa dirección funciona seguro
  const url = !local ? location.origin : (n && (n.local || n.ips[0])) || null;
  $('#phoneOk').classList.toggle('hidden', !(navigator.standalone || matchMedia('(display-mode: standalone)').matches));
  $('#netLocal').textContent = url || 'no disponible';
  const others = n ? [n.local, ...n.ips].filter(u => u && u !== url) : [];
  $('#netIps').textContent = others.length ? 'Si no abre, prueba con: ' + others.join(' · ') : '';
  if (!url || typeof qrcode !== 'function') { $('#qrBox').innerHTML = ''; return; }
  const qr = qrcode(0, 'M'); qr.addData(url); qr.make();
  $('#qrBox').innerHTML = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
}
function tModeUI() {
  const m = $('#tMode').value;
  $('#tFija').classList.toggle('hidden', m !== 'fija'); $('#tPeriods').classList.toggle('hidden', m !== '2.0td');
}
$('#tMode').onchange = tModeUI;
$('#tSave').onclick = () => act('config/tariff', {
  mode: $('#tMode').value, fixedPrice: +$('#tFixed').value,
  periods: { punta: +$('#tPunta').value, llano: +$('#tLlano').value, valle: +$('#tValle').value }
}, 'Tarifa guardada');
// Mientras se escribe el nombre, el hueco del icono enseña el que se pondrá solo
$('#pName').oninput = () => { $('#pIcon').placeholder = autoIcon($('#pName').value); };
$('#pSave').onclick = async () => {
  await act('config/plug', {
    id: $('#pId').value || undefined, name: $('#pName').value, ip: $('#pIp').value, icon: $('#pIcon').value.trim() || autoIcon($('#pName').value),
    cycleHours: $('#pHours').value, type: $('#pType').value, protect: $('#pProtect').checked, detectCycles: $('#pCycles').checked,
    deviceId: $('#pDev').value || undefined
  }, 'Enchufe guardado');
  ['#pId', '#pDev', '#pName', '#pIp', '#pIcon'].forEach(s => $(s).value = ''); $('#scanRes').innerHTML = ''; $('#pProtect').checked = $('#pCycles').checked = false; $('#pIcon').placeholder = '🧺'; loadConfig();
};
// Buscar enchufes Shelly en la red
let cfgCache = null;
$('#scanBtn').onclick = async () => {
  const btn = $('#scanBtn'); btn.disabled = true; btn.textContent = '🔍 Buscando… (unos 10 segundos)';
  $('#scanRes').innerHTML = '';
  try {
    const [found, c] = await Promise.all([api('shelly/scan', {}), api('config')]);
    cfgCache = c;
    const known = new Map(c.plugs.map(p => [p.deviceId || p.ip, p]));
    $('#scanRes').innerHTML = found.length ? found.map((d, i) => {
      const k = known.get(d.deviceId) || c.plugs.find(p => p.ip === d.ip || p.ip.startsWith(d.deviceId));
      return `<div class="item"><div class="ico">🔌</div><div class="main"><div class="title">${esc(d.deviceId)}</div>
        <div class="sub">${esc(d.model)} · ${esc(d.ip)}${d.power != null ? ' · ahora ' + watts(d.power) : ''}${d.on === false ? ' · apagado' : ''}${d.auth ? ' · ⚠️ con contraseña' : ''}</div></div>
        ${k ? `<span class="pill">Ya añadido: ${esc(k.name)}</span>` : `<button class="small" data-add="${i}">Añadir</button>`}</div>`;
    }).join('') : '<div class="muted small">No se ha encontrado ningún enchufe Shelly. Comprueba que están conectados a la misma Wi-Fi.</div>';
    document.querySelectorAll('[data-add]').forEach(b => b.onclick = () => {
      const d = found[+b.dataset.add];
      $('#pId').value = ''; $('#pDev').value = d.deviceId; $('#pIp').value = d.ip; $('#pName').value = '';
      $('#pType').value = d.type; $('#plugForm').open = true; $('#pName').focus();
      toast('Ponle un nombre y pulsa «Guardar enchufe»');
    });
  } catch (e) { toast(/JSON|Unexpected/.test(e.message) ? '⚠️ Tu servidor aún no tiene la búsqueda de enchufes (actualiza server.js y lib/)' : '⚠️ ' + e.message); }
  btn.disabled = false; btn.textContent = '🔍 Buscar enchufes en la red';
};

// Elegir localidad para el tiempo
async function wSearch() {
  const q = $('#wQuery').value.trim(); if (q.length < 2) return toast('Escribe al menos 2 letras');
  $('#wRes').innerHTML = '<div class="muted small">Buscando…</div>';
  try {
    const list = await api('weather/search', { q });
    $('#wRes').innerHTML = list.length ? list.map((x, i) => `<div class="item"><div class="ico">📍</div><div class="main"><div class="title">${esc(x.name)}</div><div class="sub">${esc(x.detail)}</div></div>
      <button class="small" data-wsel="${i}">Elegir</button></div>`).join('') : '<div class="muted small">No he encontrado ese sitio.</div>';
    document.querySelectorAll('[data-wsel]').forEach(b => b.onclick = async () => {
      const x = list[+b.dataset.wsel];
      await act('config/weather', { name: x.name, lat: x.lat, lon: x.lon }, `Tiempo de ${x.name}`);
      $('#wRes').innerHTML = ''; $('#wQuery').value = ''; loadConfig();
      setTimeout(load, 2500);
    });
  } catch (e) { $('#wRes').innerHTML = ''; toast('⚠️ ' + e.message); }
}
$('#wSearch').onclick = wSearch;
$('#wQuery').onkeydown = e => { if (e.key === 'Enter') wSearch(); };

$('#hueFind').onclick = async () => {
  try { const ips = await api('hue/discover', {}); if (ips.length) { $('#hueIp').value = ips[0]; toast('Bridge encontrado: ' + ips[0]); } else toast('No se ha encontrado ningún Bridge'); }
  catch (e) { toast('⚠️ ' + e.message); }
};
$('#huePair').onclick = async () => {
  try { const r = await api('hue/pair', { ip: $('#hueIp').value.trim() }); toast(r.ok ? '✅ Bridge vinculado' : r.error); loadConfig(); load(); }
  catch (e) { toast('⚠️ ' + e.message); }
};
function tadoBox(p) {
  return `<div class="warn">Abre este enlace, inicia sesión en tado y confirma el código:<br>
    <a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.url)}</a><div class="code">${esc(p.code)}</div>
    Esta pantalla se actualizará sola cuando lo confirmes.</div>`;
}
$('#tadoLogin').onclick = async () => {
  try { const p = await api('tado/login', {}); $('#tadoLoginBox').innerHTML = tadoBox(p); window.open(p.url, '_blank'); }
  catch (e) { toast('⚠️ ' + e.message); }
};
$('#tadoLogout').onclick = () => { if (confirm('¿Desvincular tado?')) act('tado/logout', {}, 'tado desvinculado').then(loadConfig); };
// ---------------- Consumo de toda la casa ----------------
let H = null, offers = [], houseTimer = null;
async function loadHouse() {
  try {
    H = await api('house');
    renderHouse();
    clearTimeout(houseTimer);
    if (H.status?.loading) houseTimer = setTimeout(loadHouse, 4000);
  } catch (e) { $('#hStatus').textContent = '⚠️ ' + e.message; }
}
const fmtDate = d => new Date(d + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });

function renderHouse() {
  $('#hStatus').textContent = H.status?.msg || '';
  $('#hBody').classList.toggle('hidden', !H.hasData);
  if (!H.hasData) return;
  $('#hRange').textContent = `Datos del ${fmtDate(H.from)} al ${fmtDate(H.to)} (${H.days} días).`;
  const best = H.compare.rows.find(r => !r.unavailable);
  $('#hTiles').innerHTML = [
    ['Consumo total', Math.round(H.totalKWh).toLocaleString('es-ES') + ' kWh'], ['Media al día', kwh(H.perDay)],
    ['Estimado al año', Math.round(H.perYear).toLocaleString('es-ES') + ' kWh'],
    ['Consumo de base', H.baseW != null ? Math.round(H.baseW) + ' W' : '—']
  ].map(([l, v]) => `<div class="tile"><div class="l">${l}</div><div class="v">${v}</div></div>`).join('') +
    (H.baseW != null && best ? `<div class="tile" style="grid-column:1/-1"><div class="l">Tu casa gasta ${Math.round(H.baseW)} W sin parar (nevera, router, aparatos en espera…)</div>
      <div class="v" style="font-size:18px">≈ ${Math.round(H.baseYearKWh)} kWh/año · ${eur(H.baseYearKWh * (best.energy / H.totalKWh), 0)} al año con "${esc(best.name)}"</div></div>` : '');

  // Comparación
  const rows = H.compare.rows;
  const cheapest = rows.find(r => !r.unavailable);
  $('#hCmpInfo').textContent = `${H.compare.kw} kW · ${H.compare.days} días`;
  $('#hCompare').innerHTML = `<table class="cmp">
    <tr><th>Tarifa</th><th>Periodo</th><th>Al año<br>con imp.</th></tr>
    ${rows.map(r => r.unavailable ? `<tr><td>${esc(r.name)}<div class="muted small">${esc(r.note)}</div></td><td colspan="2" class="muted">Descargando precios…</td></tr>` : `
      <tr class="${r === cheapest ? 'best' : ''}"><td>${esc(r.name)}<div class="muted small">${esc(r.note)}${r.missing ? ` · ${r.missing} h sin precio` : ''}</div>
        <div class="muted small">Energía ${eur(r.energy, 0)} · Potencia ${eur(r.power, 0)}</div></td>
      <td>${eur(r.total, 0)}<div class="muted small">sin imp.</div></td>
      <td>${eur(r.perYearTax, 0)}${r !== cheapest ? `<div class="muted small">+${eur(r.perYearTax - cheapest.perYearTax, 0)}</div>` : '<div class="muted small">la mejor</div>'}</td></tr>`).join('')}
  </table>`;

  // Consumo por días (último mes), con el coste a la tarifa actual
  renderHouseDays();

  // Meses
  const ms = H.months, W = Math.max(ms.length * 46, 320), Hh = 170, top = 18, bot = 22, ch = Hh - top - bot;
  const mx = Math.max(...ms.map(m => m.kWh)) * 1.12;
  const mn = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  $('#hMonths').innerHTML = `<svg width="100%" viewBox="0 0 ${W} ${Hh}">${ms.map((m, i) => {
    const bw = W / ms.length, bh = m.kWh / mx * ch, x = i * bw;
    return `<rect x="${x + 6}" y="${top + ch - bh}" width="${bw - 12}" height="${bh}" rx="4" fill="${css('--accent')}"><title>${m.m}: ${kwh(m.kWh)}</title></rect>
      <text x="${x + bw / 2}" y="${top + ch - bh - 4}" font-size="10" text-anchor="middle" fill="${css('--muted')}">${Math.round(m.kWh)}</text>
      <text x="${x + bw / 2}" y="${Hh - 6}" font-size="11" text-anchor="middle" fill="${css('--muted')}">${mn[+m.m.slice(5) - 1]}</text>`;
  }).join('')}</svg>`;

  // Perfil horario
  const pf = H.profileW, PW = 24 * 22, PH = 170, pmax = Math.max(...pf) * 1.15;
  const bw = PW / 24;
  let g = pf.map((w, h) => {
    const bh = w / pmax * ch, x = h * bw;
    return `<rect x="${x + 2}" y="${top + ch - bh}" width="${bw - 4}" height="${bh}" rx="3" fill="${css('--on')}"><title>${hh(h)}: ${Math.round(w)} W</title></rect>` +
      (h % 3 === 0 ? `<text x="${x + bw / 2}" y="${PH - 6}" font-size="10" text-anchor="middle" fill="${css('--muted')}">${h}h</text>` : '');
  }).join('');
  if (H.baseW != null) { const y = top + ch - H.baseW / pmax * ch; g += `<line x1="0" x2="${PW}" y1="${y}" y2="${y}" stroke="${css('--bad')}" stroke-dasharray="4 4"/><text x="${PW - 4}" y="${y - 4}" font-size="10" text-anchor="end" fill="${css('--bad')}">base ${Math.round(H.baseW)} W</text>`; }
  $('#hProfile').innerHTML = `<svg width="100%" viewBox="0 0 ${PW} ${PH}">${g}</svg>`;

  // Tramos
  const bp = H.byPeriod, tot = bp.P1 + bp.P2 + bp.P3;
  const seg = (v, c, l) => `<div style="width:${v / tot * 100}%;background:${c}">${Math.round(v / tot * 100)}%</div>`;
  $('#hPeriods').innerHTML = `<div class="bar">${seg(bp.P1, css('--bad'), 'Punta')}${seg(bp.P2, css('--mid'), 'Llano')}${seg(bp.P3, css('--good'), 'Valle')}</div>
    <div class="legend"><span class="dot cara"></span>Punta ${kwh(bp.P1)} <span class="dot media"></span>Llano ${kwh(bp.P2)} <span class="dot barata"></span>Valle ${kwh(bp.P3)}</div>`;
}

function renderHouseDays() {
  const box = $('#hDays'); if (!box) return;
  const dd = H.daily || [];
  if (!dd.length) { box.innerHTML = '<div class="muted small">Sin datos por días.</div>'; $('#hDaysStats').innerHTML = ''; $('#hDaysInfo').textContent = ''; return; }
  // El primer y el último día del archivo pueden estar a medias: no cuentan para la media
  const partial = i => dd.length > 2 && (i === 0 || i === dd.length - 1);
  const ref = dd.filter((r, i) => !partial(i));
  const priced = arr => arr.every(r => r.cost != null);
  const avgK = ref.reduce((a, b) => a + b.kWh, 0) / ref.length;
  const avgC = priced(ref) ? ref.reduce((a, b) => a + b.cost, 0) / ref.length : null;
  const tk = dd.reduce((a, b) => a + b.kWh, 0), tc = priced(dd) ? dd.reduce((a, b) => a + b.cost, 0) : null;
  const items = dd.map((r, i) => ({ label: dm(r.d), value: r.kWh, dim: partial(i), title: `${dayName(r.d)}: ${kwh(r.kWh)}${r.cost != null ? ' · ' + eur(r.cost) : ''}` }));
  box.innerHTML = barsSVG(items, { fmt: v => kwh(v), avg: avgK, id: 'gHouse', w: box.clientWidth || 560 });
  $('#hDaysStats').innerHTML = stats4([
    [kwh(avgK), 'Media al día'],
    [eur(avgC), 'Coste medio al día'],
    [eur(avgC != null ? avgC * 365 : null, 0), 'Estimado al año'],
    [kwh(tk), `Total ${dd.length} días${tc != null ? ' · ' + eur(tc) : ''}`]
  ]);
  const modo = { fija: 'precio único', '2.0td': 'punta/llano/valle', pvpc: 'PVPC real de cada hora' }[H.tariffMode] || 'tu tarifa';
  $('#hDaysInfo').textContent = tc != null ? `Coste con tu tarifa actual (${modo}), solo energía, sin potencia ni impuestos · hasta ${fmtDate(dd[dd.length - 1].d)}`
    : `Hasta ${fmtDate(dd[dd.length - 1].d)}${H.status?.loading ? ' · calculando costes…' : ''}`;
}

$('#hFile').onchange = async e => {
  const f = e.target.files[0]; if (!f) return;
  $('#hStatus').textContent = 'Importando…';
  try {
    const text = await f.text();
    const r = await fetch('/api/house/import', { method: 'POST', headers: { 'Content-Type': 'text/plain; charset=utf-8' }, body: text });
    const j = await r.json(); if (!r.ok) throw new Error(j.error);
    toast(`✅ ${j.hours} horas importadas (${fmtDate(j.from)} – ${fmtDate(j.to)})`);
    await loadHouse();
  } catch (err) { $('#hStatus').textContent = '⚠️ ' + err.message; }
  e.target.value = '';
};
$('#hClear').onclick = () => { if (confirm('¿Borrar todos los datos de consumo importados?')) act('house/clear', {}, 'Datos borrados').then(loadHouse); };

// Ofertas
async function loadOffers() {
  const c = await api('config');
  offers = c.offers || []; $('#hKw').value = c.house?.kw ?? 4.6; renderOffers();
}
function renderOffers() {
  $('#hOffers').innerHTML = offers.map((o, i) => `<div class="offer" data-i="${i}">
    <div class="row between"><input data-f="name" value="${esc(o.name)}" style="font-weight:600"><button class="ghost small" data-del="${i}">✕</button></div>
    ${o.type === '3p' ? `<div class="grid3"><label>Punta €/kWh<input data-f="punta" type="number" step="0.000001" value="${o.punta}"></label>
      <label>Llano €/kWh<input data-f="llano" type="number" step="0.000001" value="${o.llano}"></label>
      <label>Valle €/kWh<input data-f="valle" type="number" step="0.000001" value="${o.valle}"></label></div>`
      : `<label>Precio €/kWh<input data-f="price" type="number" step="0.000001" value="${o.price}"></label>`}
    <div class="grid2"><label>Potencia P1 €/kW día<input data-f="p1" type="number" step="0.000001" value="${o.p1}"></label>
      <label>Potencia P2 €/kW día<input data-f="p2" type="number" step="0.000001" value="${o.p2}"></label></div></div>`).join('');
  document.querySelectorAll('#hOffers input').forEach(inp => inp.oninput = () => {
    const o = offers[inp.closest('.offer').dataset.i]; const f = inp.dataset.f;
    o[f] = f === 'name' ? inp.value : Number(inp.value);
  });
  document.querySelectorAll('#hOffers [data-del]').forEach(b => b.onclick = () => { offers.splice(+b.dataset.del, 1); renderOffers(); });
}
$('#hOffersBox').addEventListener('toggle', e => { if (e.target.open) loadOffers(); });
$('#hAddFija').onclick = () => { offers.push({ name: 'Nueva oferta', type: 'fija', price: 0.12, p1: 0.08, p2: 0.08 }); renderOffers(); };
$('#hAdd3p').onclick = () => { offers.push({ name: 'Nueva oferta 3 tramos', type: '3p', punta: 0.18, llano: 0.11, valle: 0.08, p1: 0.08, p2: 0.08 }); renderOffers(); };
$('#hSaveOffers').onclick = async () => {
  try { await api('config/house', { kw: +$('#hKw').value, offers }); toast('Ofertas guardadas'); loadHouse(); }
  catch (e) { toast('⚠️ ' + e.message); }
};

load();
