/* Gula Express - panel interno (cocina, mostrador, despacho, reparto, administración) */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const Bs = n => 'Bs ' + Number(n).toFixed(2).replace(/\.00$/, '');
let T = localStorage.getItem('staffToken'), ME = JSON.parse(localStorage.getItem('staffMe') || 'null');
let tab = null, ORDERS = [], SETTINGS = {}, DRIVERS = [], MENU = null;

const TABS = {
  admin: [['cocina', '👨‍🍳 Cocina'], ['pedidos', '📋 Pedidos'], ['despacho', '🛵 Despacho'], ['carta', '🍔 Carta'], ['config', '⚙️ Configuración'], ['reportes', '📊 Reportes']],
  vendedor: [['mostrador', '🧾 Mostrador'], ['pedidos', '📋 Pedidos'], ['despacho', '🛵 Despacho']],
  cocinero: [['cocina', '👨‍🍳 Cocina']],
  repartidor: [['reparto', '🛵 Mis entregas']]
};

async function api(url, opts = {}) {
  const h = { 'Content-Type': 'application/json' };
  if (T) h.Authorization = 'Bearer ' + T;
  const r = await fetch(url, { method: opts.method || 'GET', headers: h, body: opts.body ? JSON.stringify(opts.body) : undefined });
  if (r.status === 401) { logout(); throw new Error('Sesión vencida, ingresa de nuevo'); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Error');
  return j;
}
function toast(msg) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 2800); }
function logout() { T = null; ME = null; localStorage.removeItem('staffToken'); localStorage.removeItem('staffMe'); showLogin(); }

/* ---------- Login ---------- */
function showLogin(err) {
  $('#who').innerHTML = '';
  $('#root').innerHTML = `<form class="login" onsubmit="return doLogin(event)">
  <h2 style="margin-top:0">Ingreso del personal</h2>
  <label class="f">Usuario<input id="u" autocomplete="username" required></label>
  <label class="f">Contraseña<input id="p" type="password" autocomplete="current-password" required></label>
  ${err ? `<p class="notice bad">${esc(err)}</p>` : ''}
  <button class="btn big">Entrar</button>
  <p class="mut" style="text-align:center;margin-top:14px"><a href="/" style="color:var(--acc2)">← Ir a la tienda</a></p></form>`;
}
async function doLogin(e) {
  e.preventDefault();
  try {
    const r = await fetch('/api/staff/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: $('#u').value, password: $('#p').value }) });
    const j = await r.json(); if (!r.ok) throw new Error(j.error);
    T = j.token; ME = { role: j.role, name: j.name, id: j.id };
    localStorage.setItem('staffToken', T); localStorage.setItem('staffMe', JSON.stringify(ME));
    start();
  } catch (ex) { showLogin(ex.message); }
  return false;
}

/* ---------- Estructura ---------- */
async function start() {
  if (!T || !ME) return showLogin();
  tab = TABS[ME.role][0][0];
  $('#who').innerHTML = `<span class="badge" style="align-self:center">${esc(ME.name)} · ${esc(ME.role)}</span><button onclick="logout()">Salir</button>`;
  MENU = await fetch('/api/menu').then(r => r.json());
  await refresh();
  new EventSource('/api/events').onmessage = ev => { if (ev.data === 'orders') refresh(); };
  setInterval(tick, 20000);
}
async function refresh() {
  try {
    const d = await api('/api/staff/orders'); ORDERS = d.orders; SETTINGS = d.settings;
    if (['admin', 'vendedor'].includes(ME.role)) DRIVERS = await api('/api/staff/drivers');
    draw();
  } catch (e) { toast(e.message); }
}
function tick() { if (['cocina', 'reparto'].includes(tab)) draw(); }
function setTab(t) { tab = t; draw(); }
function draw() {
  const bar = `<div class="stabs">${TABS[ME.role].map(([k, l]) => `<button class="tab ${k === tab ? 'on' : ''}" onclick="setTab('${k}')">${l}</button>`).join('')}</div>`;
  $('#root').innerHTML = bar + '<div id="view"></div>';
  ({ cocina: vCocina, pedidos: vPedidos, despacho: vDespacho, reparto: vReparto, mostrador: vMostrador, carta: vCarta, config: vConfig, reportes: vReportes })[tab]();
}

/* ---------- Tarjetas de pedido ---------- */
const mins = t => Math.floor((Date.now() - t) / 60000);
function items(o) {
  return `<ul>${o.items.map(i => `<li><b>${i.qty}× ${esc(i.name)}</b>${Object.keys(i.selections).length ? `<small>${Object.values(i.selections).map(v => esc(v.join(', '))).join(' · ')}</small>` : ''}</li>`).join('')}</ul>${o.notes ? `<div class="note">📝 ${esc(o.notes)}</div>` : ''}`;
}
function btns(o) {
  const r = ME.role, a = r === 'admin', b = [];
  if ((r === 'cocinero' || a) && o.status === 'Confirmado') b.push(['▶ Empezar preparación', 'En preparación', 'btn']);
  if ((r === 'cocinero' || a) && o.status === 'En preparación') b.push(['✔ Listo', 'Listo', 'btn ok']);
  if (o.mode === 'delivery') {
    if (o.status === 'Listo' && (a || (r === 'repartidor' && o.driverId === ME.id))) b.push(['🛵 Salir a entregar', 'En camino', 'btn']);
    if (o.status === 'En camino' && (a || (r === 'repartidor' && o.driverId === ME.id))) b.push(['✔ Entregado', 'Entregado', 'btn ok']);
  } else if (o.status === 'Listo' && (a || r === 'vendedor')) b.push(['✔ Entregado al cliente', 'Entregado', 'btn ok']);
  if ((a || r === 'vendedor') && ['Recibido', 'Confirmado'].includes(o.status)) {
    b.push(['Cancelar', 'Cancelado', 'btn ghost']); b.push(['Rechazar', 'Rechazado', 'btn bad']);
  }
  return b.map(([l, s, c]) => `<button class="${c}" onclick="setStatus(${o.id},'${s}')">${l}</button>`).join('');
}
async function setStatus(id, status) {
  if (['Cancelado', 'Rechazado'].includes(status) && !confirm(`¿Marcar el pedido como ${status}?`)) return;
  try { await api(`/api/staff/orders/${id}/status`, { method: 'POST', body: { status } }); await refresh(); } catch (e) { toast(e.message); }
}
function ocard(o, opts = {}) {
  const late = ['Confirmado', 'En preparación'].includes(o.status) && mins(o.createdAt) >= SETTINGS.kitchenAlertMin;
  const modeTxt = { delivery: '🛵 Delivery', recojo: '🏪 Recojo', mesa: '🍽️ Mesa' + (o.table ? ' ' + esc(o.table) : '') }[o.mode];
  return `<div class="ocard ${late ? 'late' : ''}">
  <div class="row"><h3>${esc(o.code)}</h3>${['Confirmado', 'En preparación'].includes(o.status) ? `<span class="timer ${late ? 'late' : ''}">⏱ ${mins(o.createdAt)} min</span>` : `<span class="badge st">${esc(o.status)}</span>`}</div>
  <div class="row" style="justify-content:flex-start"><span class="badge">${modeTxt}</span><span class="badge">${o.channel === 'mostrador' ? '🧾 Mostrador' : '🌐 En línea'}</span>${o.status !== 'Confirmado' && ['Confirmado', 'En preparación'].includes(o.status) ? '' : ''}</div>
  ${items(o)}
  ${opts.contact && o.customer.phone ? `<div>👤 ${esc(o.customer.name)} · <a href="tel:${esc(o.customer.phone)}" style="color:var(--acc2)">${esc(o.customer.phone)}</a></div>` : ''}
  ${opts.addr && o.address ? `<div>📍 ${esc(o.address.street)}${o.address.ref ? ' (' + esc(o.address.ref) + ')' : ''} · ${esc(o.address.zone)}</div>` : ''}
  ${opts.money ? `<div class="mut">${esc(o.payment)} · <b>${Bs(o.total)}</b>${o.driverName ? ' · 🛵 ' + esc(o.driverName) : ''}</div>` : ''}
  ${opts.extra || ''}
  <div class="acts">${btns(o)}</div></div>`;
}

/* ---------- Vistas ---------- */
function vCocina() {
  const l = ORDERS.filter(o => ['Confirmado', 'En preparación'].includes(o.status));
  $('#view').innerHTML = `<div class="kitchen"><p class="mut">${l.length} pedido(s) en cola · ordenados por hora de recepción · alerta a los ${SETTINGS.kitchenAlertMin} min</p>
  <div class="kgrid">${l.map(o => ocard(o)).join('') || '<p class="mut">Sin pedidos pendientes 🎉</p>'}</div></div>`;
}
function vPedidos() {
  const l = ORDERS.slice().reverse();
  $('#view').innerHTML = `<div class="kgrid">${l.map(o => ocard(o, { contact: true, addr: true, money: true })).join('') || '<p class="mut">Aún no hay pedidos.</p>'}</div>`;
}
function vDespacho() {
  const l = ORDERS.filter(o => o.mode === 'delivery' && ['Confirmado', 'En preparación', 'Listo', 'En camino'].includes(o.status));
  const zones = {}; l.forEach(o => { const z = (o.address && o.address.zone) || 'Sin zona'; (zones[z] = zones[z] || []).push(o); });
  $('#view').innerHTML = Object.keys(zones).length ? Object.entries(zones).map(([z, os]) => `<h3>📍 ${esc(z)}</h3><div class="kgrid">${os.map(o => ocard(o, {
    contact: true, addr: true, money: true,
    extra: o.status !== 'En camino' ? `<div class="inline"><select id="drv${o.id}"><option value="">— Repartidor —</option>${DRIVERS.map(d => `<option value="${d.id}" ${d.id === o.driverId ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select><button class="btn sm" onclick="assign(${o.id})">Asignar</button></div>` : ''
  })).join('')}</div>`).join('') : '<p class="mut">No hay pedidos de delivery pendientes.</p>';
}
async function assign(id) {
  const v = $('#drv' + id).value; if (!v) return toast('Elige un repartidor');
  try { await api(`/api/staff/orders/${id}/assign`, { method: 'POST', body: { driverId: +v } }); toast('Asignado ✔'); refresh(); } catch (e) { toast(e.message); }
}
function vReparto() {
  const l = ORDERS.filter(o => ['Confirmado', 'En preparación', 'Listo', 'En camino'].includes(o.status));
  $('#view').innerHTML = `<div class="kgrid">${l.map(o => ocard(o, { contact: true, addr: true, money: true })).join('') || '<p class="mut">No tienes entregas asignadas.</p>'}</div>`;
}
function vMostrador() {
  const l = ORDERS.filter(o => ['Confirmado', 'En preparación', 'Listo'].includes(o.status) && o.mode !== 'delivery');
  $('#view').innerHTML = `<div class="panel"><h3>Registrar pedido presencial</h3><p class="mut">Usa la misma carta y personalización que el cliente. El pedido entra a la misma cola de cocina.</p><a class="btn big" style="display:block;text-align:center;text-decoration:none" href="/?canal=mostrador">➕ Nuevo pedido en mostrador</a></div>
  <h3>Pedidos para entregar en local</h3><div class="kgrid">${l.map(o => ocard(o, { money: true })).join('') || '<p class="mut">Sin pedidos pendientes.</p>'}</div>`;
}
async function vCarta() {
  MENU = await fetch('/api/menu').then(r => r.json());
  $('#view').innerHTML = `<div class="panel"><h3>Carta</h3><table><tr><th>Producto</th><th>Categoría</th><th>Precio (Bs)</th><th>Disponible</th></tr>
  ${MENU.products.map(p => `<tr><td>${p.emoji} ${esc(p.name)}</td><td>${esc(p.category)}</td>
  <td><input style="width:90px;margin:0" type="number" step="0.5" min="0" value="${p.price}" onchange="patchProd(${p.id},{price:this.value})"></td>
  <td><button class="btn sm ${p.available ? 'ok' : 'bad'}" onclick="patchProd(${p.id},{available:${!p.available}})">${p.available ? 'Habilitado' : 'Deshabilitado'}</button></td></tr>`).join('')}</table></div>
  <div class="panel"><h3>Nuevo producto</h3><div class="inline"><input id="np_n" placeholder="Nombre"><input id="np_c" placeholder="Categoría" list="cats"><input id="np_p" type="number" min="0" step="0.5" placeholder="Precio"></div>
  <datalist id="cats">${MENU.categories.map(c => `<option>${esc(c)}</option>`).join('')}</datalist>
  <input id="np_d" placeholder="Descripción"><select id="np_t"><option value="">Sin personalización</option><option value="hamburguesa">Hamburguesa (cocción, extras, quitar)</option><option value="combo">Combo (acompañamiento, bebida)</option></select>
  <button class="btn" onclick="newProd()">Crear producto</button></div>`;
}
async function patchProd(id, body) { try { await api('/api/admin/products/' + id, { method: 'PATCH', body }); toast('Guardado ✔'); vCarta(); } catch (e) { toast(e.message); } }
async function newProd() {
  try { await api('/api/admin/products', { method: 'POST', body: { name: $('#np_n').value, category: $('#np_c').value, price: $('#np_p').value, desc: $('#np_d').value, preset: $('#np_t').value } }); toast('Producto creado ✔'); vCarta(); } catch (e) { toast(e.message); }
}
async function vConfig() {
  const [zones, promos, users] = await Promise.all([api('/api/admin/zones'), api('/api/admin/promos'), api('/api/admin/users')]);
  const s = SETTINGS;
  $('#view').innerHTML = `<div class="panel"><h3>Horario de atención</h3><div class="inline"><label class="f">Apertura<input id="s_o" type="time" value="${s.open}"></label><label class="f">Cierre<input id="s_c" type="time" value="${s.close}"></label><label class="f">Alerta cocina (min)<input id="s_a" type="number" min="1" value="${s.kitchenAlertMin}"></label></div>
  <label class="opt"><input type="checkbox" id="s_e" ${s.enforce ? 'checked' : ''}> <span>Impedir pedidos fuera de horario</span></label><button class="btn" onclick="saveSettings()">Guardar</button></div>
  <div class="panel"><h3>Zonas de cobertura</h3><table><tr><th>Zona</th><th>Envío</th><th>Tiempo</th><th></th></tr>${zones.map(z => `<tr><td>${esc(z.name)}</td><td>${Bs(z.fee)}</td><td>${z.minutes} min</td><td><button class="btn sm ghost" onclick="api('/api/admin/zones/${z.id}',{method:'PATCH',body:{active:${!z.active}}}).then(vConfig)">${z.active ? 'Desactivar' : 'Activar'}</button></td></tr>`).join('')}</table>
  <div class="inline" style="margin-top:10px"><input id="z_n" placeholder="Nombre"><input id="z_f" type="number" placeholder="Envío Bs"><input id="z_m" type="number" placeholder="Minutos"><button class="btn sm" onclick="addZone()">Agregar</button></div></div>
  <div class="panel"><h3>Promociones</h3><table>${promos.map(p => `<tr><td>${esc(p.name)}</td><td>${p.percent}% desde ${Bs(p.minTotal)}</td><td><button class="btn sm ghost" onclick="api('/api/admin/promos/${p.id}',{method:'PATCH',body:{active:${!p.active}}}).then(vConfig)">${p.active ? 'Desactivar' : 'Activar'}</button></td></tr>`).join('')}</table>
  <div class="inline" style="margin-top:10px"><input id="p_n" placeholder="Nombre de la promoción"><input id="p_m" type="number" placeholder="Monto mínimo"><input id="p_p" type="number" placeholder="% desc."><button class="btn sm" onclick="addPromo()">Agregar</button></div></div>
  <div class="panel"><h3>Usuarios del personal</h3><table>${users.map(u => `<tr><td>${esc(u.name)}</td><td>${esc(u.username)}</td><td><span class="badge">${u.role}</span></td><td>${u.id === ME.id ? '' : `<button class="btn sm ghost" onclick="api('/api/admin/users/${u.id}',{method:'PATCH',body:{active:${!u.active}}}).then(vConfig)">${u.active ? 'Desactivar' : 'Activar'}</button>`}</td></tr>`).join('')}</table>
  <div class="inline" style="margin-top:10px"><input id="u_n" placeholder="Nombre"><input id="u_u" placeholder="Usuario"><input id="u_p" type="password" placeholder="Contraseña (mín. 6)"><select id="u_r"><option>vendedor</option><option>cocinero</option><option>repartidor</option><option>admin</option></select><button class="btn sm" onclick="addUser()">Crear</button></div></div>`;
}
const doit = async fn => { try { await fn(); toast('Guardado ✔'); vConfig(); } catch (e) { toast(e.message); } };
function saveSettings() { doit(async () => { SETTINGS = await api('/api/admin/settings', { method: 'PUT', body: { open: $('#s_o').value, close: $('#s_c').value, enforce: $('#s_e').checked, kitchenAlertMin: $('#s_a').value } }); }); }
function addZone() { doit(() => api('/api/admin/zones', { method: 'POST', body: { name: $('#z_n').value, fee: $('#z_f').value, minutes: $('#z_m').value } })); }
function addPromo() { doit(() => api('/api/admin/promos', { method: 'POST', body: { name: $('#p_n').value, minTotal: $('#p_m').value, percent: $('#p_p').value } })); }
function addUser() { doit(() => api('/api/admin/users', { method: 'POST', body: { name: $('#u_n').value, username: $('#u_u').value, password: $('#u_p').value, role: $('#u_r').value } })); }

async function vReportes(days = 30) {
  const r = await api('/api/admin/reports?days=' + days);
  const rows = o => Object.entries(o).map(([k, v]) => `<tr><td>${esc(k)}</td><td>${v.count}</td><td>${Bs(v.total)}</td></tr>`).join('') || '<tr><td colspan=3 class="mut">Sin datos</td></tr>';
  $('#view').innerHTML = `<div class="panel"><div class="row"><h3 style="margin:0">Resumen</h3><select style="width:auto;margin:0" onchange="vReportes(+this.value)">${[1, 7, 30, 90].map(d => `<option value="${d}" ${d === days ? 'selected' : ''}>Últimos ${d} día(s)</option>`).join('')}</select></div>
  <div class="stat" style="margin-top:12px"><div>Ventas<b>${Bs(r.total)}</b></div><div>Pedidos<b>${r.orders}</b></div><div>Prom. preparación<b>${r.avgPrepMin ?? '—'}${r.avgPrepMin != null ? ' min' : ''}</b></div><div>Prom. entrega<b>${r.avgDeliveryMin ?? '—'}${r.avgDeliveryMin != null ? ' min' : ''}</b></div></div></div>
  <div class="panel"><h3>Ventas por canal</h3><table><tr><th>Canal</th><th>Pedidos</th><th>Total</th></tr>${rows(r.byChannel)}</table></div>
  <div class="panel"><h3>Ventas por modalidad</h3><table><tr><th>Modalidad</th><th>Pedidos</th><th>Total</th></tr>${rows(r.byMode)}</table></div>
  <div class="panel"><h3>Productos más vendidos</h3><table><tr><th>Producto</th><th>Unidades</th></tr>${r.top.map(t => `<tr><td>${esc(t.name)}</td><td>${t.qty}</td></tr>`).join('') || '<tr><td colspan=2 class="mut">Sin datos</td></tr>'}</table></div>
  <button class="btn" onclick="csv()">⬇ Exportar CSV</button>`;
}
async function csv() {
  const r = await fetch('/api/admin/reports.csv', { headers: { Authorization: 'Bearer ' + T } });
  const a = document.createElement('a'); a.href = URL.createObjectURL(await r.blob()); a.download = 'ventas-gula.csv'; a.click();
}

start();
