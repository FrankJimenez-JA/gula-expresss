/* Gula Express - interfaz del cliente y modo mostrador */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const Bs = n => 'Bs ' + Number(n).toFixed(2).replace(/\.00$/, '');
const params = new URLSearchParams(location.search);
const MOSTRADOR = params.get('canal') === 'mostrador';
const staffTok = localStorage.getItem('staffToken');
let MENU = null, cat = null, trackingCode = null, checkoutKey = null;
let cart = JSON.parse(localStorage.getItem('cart') || '[]');
let customer = JSON.parse(localStorage.getItem('cust') || 'null');
let cur = null; // producto abierto en el modal

async function api(url, opts = {}) {
  const h = { 'Content-Type': 'application/json' };
  const t = MOSTRADOR ? staffTok : customer && customer.token;
  if (t) h.Authorization = 'Bearer ' + t;
  const r = await fetch(url, { method: opts.method || 'GET', headers: h, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'Error de conexión');
  return j;
}
function toast(msg) {
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
  document.body.appendChild(t); setTimeout(() => t.remove(), 2800);
}
function saveCart() {
  localStorage.setItem('cart', JSON.stringify(cart));
  $('#cartCount').textContent = cart.reduce((s, i) => s + i.qty, 0);
}
function openModal(html) { const m = $('#modal'); m.innerHTML = '<div class="sheet"><button class="x" onclick="closeModal()">✕</button>' + html + '</div>'; m.classList.remove('hidden'); }
function closeModal() { $('#modal').classList.add('hidden'); $('#modal').innerHTML = ''; trackingCode = null; }

/* ---------- Inicio ---------- */
async function init() {
  if (MOSTRADOR && !staffTok) { location.href = '/staff.html'; return; }
  try { MENU = await api('/api/menu'); } catch (e) { $('#app').innerHTML = '<p class="notice bad">No se pudo cargar la carta. Reintenta en unos segundos.</p>'; return; }
  cat = MENU.categories[0];
  banner(); render(); saveCart(); updateAccountBtn();
  const es = new EventSource('/api/events');
  es.onmessage = async ev => {
    if (ev.data === 'orders' && trackingCode) refreshTrack();
    if (ev.data === 'menu' && $('#modal').classList.contains('hidden')) { MENU = await api('/api/menu'); banner(); render(); }
  };
  if (params.get('codigo')) openTrack(params.get('codigo'));
}
function banner() {
  let h = '';
  if (MOSTRADOR) h += '<div class="notice">🧾 <b>Modo mostrador</b> — registrando pedido presencial. <a href="/staff.html" style="color:inherit">Volver al panel</a></div>';
  if (!MENU.settings.isOpen) h += `<div class="notice bad">El local está cerrado. Horario de atención: ${esc(MENU.settings.open)} a ${esc(MENU.settings.close)}.</div>`;
  $('#banner').innerHTML = h;
}
function render() {
  $('#app').innerHTML = `
  <div class="hero"><h1>Pide sin esperar 🍔</h1><p>Arma tu pedido a tu gusto, sigue su estado en tiempo real y recíbelo en casa, en el local o en tu mesa.</p></div>
  <div class="tabs">${MENU.categories.map(c => `<button class="tab ${c === cat ? 'on' : ''}" onclick="setCat(this.dataset.c)" data-c="${esc(c)}">${esc(c)}</button>`).join('')}</div>
  <div class="grid">${MENU.products.filter(p => p.category === cat).map(p => `
    <article class="prod ${p.available ? '' : 'off'}" onclick="openProduct(${p.id})">
      <div class="emoji">${p.emoji}</div>
      <div style="flex:1"><h3>${esc(p.name)}</h3><p>${esc(p.desc)}</p>
      <div class="row"><b>${Bs(p.price)}</b>${p.available ? '<button class="btn sm">Agregar</button>' : '<span class="tag">No disponible</span>'}</div></div>
    </article>`).join('')}</div>`;
}
function setCat(c) { cat = c; render(); }

/* ---------- Personalización de producto ---------- */
function openProduct(id) {
  const p = MENU.products.find(x => x.id === id);
  if (!p || !p.available) return;
  cur = { p, qty: 1 };
  let h = `<h2>${p.emoji} ${esc(p.name)}</h2><p class="mut">${esc(p.desc)}</p><form id="pf" onsubmit="return addToCart(event)">`;
  p.groups.forEach((g, gi) => {
    h += `<fieldset><legend>${esc(g.name)} <i>${g.required ? '(obligatorio)' : '(opcional)'}</i></legend>` +
      g.items.map((it, ii) => `<label class="opt"><input type="${g.type === 'single' ? 'radio' : 'checkbox'}" name="g${gi}" value="${ii}" ${g.type === 'single' && g.required && ii === 0 ? 'checked' : ''} onchange="onOpt(this)"><span>${esc(it.name)}</span><em>${it.price ? '+' + Bs(it.price) : ''}</em></label>`).join('') + '</fieldset>';
  });
  h += `<div class="qty"><button type="button" onclick="chQty(-1)">−</button><b id="qv">1</b><button type="button" onclick="chQty(1)">+</button></div>
  <button class="btn big">Agregar al pedido · <span id="pp"></span></button></form>`;
  openModal(h); calc();
}
function selections() {
  const sel = {};
  cur.p.groups.forEach((g, gi) => {
    const names = [...document.querySelectorAll(`input[name=g${gi}]:checked`)].map(i => g.items[+i.value].name);
    if (names.length) sel[g.name] = names;
  });
  return sel;
}
function unitPrice(p, sel) {
  let u = p.price;
  p.groups.forEach(g => (sel[g.name] || []).forEach(n => { u += g.items.find(i => i.name === n).price; }));
  return u;
}
function onOpt(el) {
  const sel = selections(), all = Object.values(sel).flat();
  for (const [a, b] of cur.p.incompatible || []) {
    if (all.includes(a) && all.includes(b)) {
      el.checked = false; toast(`"${a}" y "${b}" no se pueden combinar`); break;
    }
  }
  calc();
}
function chQty(d) { cur.qty = Math.max(1, Math.min(20, cur.qty + d)); calc(); }
function calc() { $('#qv').textContent = cur.qty; $('#pp').textContent = Bs(unitPrice(cur.p, selections()) * cur.qty); }
function addToCart(e) {
  e.preventDefault();
  const sel = selections();
  cart.push({ productId: cur.p.id, name: cur.p.name, emoji: cur.p.emoji, qty: cur.qty, selections: sel, unit: unitPrice(cur.p, sel) });
  saveCart(); closeModal(); toast('Agregado al pedido ✔');
  return false;
}

/* ---------- Carrito ---------- */
const totals = () => {
  const subtotal = cart.reduce((s, i) => s + i.unit * i.qty, 0);
  let discount = 0, promo = null;
  (MENU.promos || []).forEach(p => { const d = subtotal * p.percent / 100; if (subtotal >= p.minTotal && d > discount) { discount = d; promo = p; } });
  return { subtotal, discount: Math.round(discount * 100) / 100, promo };
};
function openCart() {
  if (!cart.length) return openModal('<h2>Tu pedido</h2><p class="mut">Aún no agregaste productos.</p>');
  const t = totals();
  openModal(`<h2>Tu pedido</h2>${cart.map((i, idx) => `
    <div class="cartrow"><div><b>${i.qty}× ${esc(i.name)}</b><small>${Object.entries(i.selections).map(([g, v]) => esc(v.join(', '))).join(' · ')}</small>
    <div class="qty" style="justify-content:flex-start;margin:6px 0 0"><button onclick="cartQty(${idx},-1)">−</button><button onclick="cartQty(${idx},1)">+</button><button onclick="cartDel(${idx})" style="width:auto;border-radius:10px;padding:0 10px;font-size:.85rem">Quitar</button></div></div>
    <b>${Bs(i.unit * i.qty)}</b></div>`).join('')}
    <div class="sum"><span>Subtotal</span><span>${Bs(t.subtotal)}</span></div>
    ${t.promo ? `<div class="sum" style="color:var(--ok)"><span>🎉 ${esc(t.promo.name)}</span><span>−${Bs(t.discount)}</span></div>` : ''}
    <button class="btn big" onclick="openCheckout()">Continuar</button>`);
}
function cartQty(i, d) { cart[i].qty = Math.max(1, Math.min(20, cart[i].qty + d)); saveCart(); openCart(); }
function cartDel(i) { cart.splice(i, 1); saveCart(); openCart(); }

/* ---------- Checkout ---------- */
function openCheckout() {
  if (!MENU.settings.isOpen && !MOSTRADOR) return toast('El local está cerrado en este momento');
  checkoutKey = checkoutKey || (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random());
  const addrs = (customer && customer.addresses) || [];
  openModal(`<h2>Finalizar pedido</h2><form id="cf" onsubmit="return submitOrder(event)">
  <div class="seg" id="modeSeg">
    <label class="on"><input type="radio" name="mode" value="delivery" checked onchange="modeChange()">🛵 Delivery</label>
    <label><input type="radio" name="mode" value="recojo" onchange="modeChange()">🏪 Recojo</label>
    <label><input type="radio" name="mode" value="mesa" onchange="modeChange()">🍽️ En mesa</label>
  </div>
  <div id="deliv">
    ${addrs.length ? `<label class="f">Direcciones guardadas<select onchange="fillAddr(this.value)"><option value="">— Elegir —</option>${addrs.map((a, i) => `<option value="${i}">${esc(a.street)}</option>`).join('')}</select></label>` : ''}
    <label class="f">Dirección<input id="street" placeholder="Calle, número, barrio"></label>
    <label class="f">Referencia<input id="ref" placeholder="Ej: portón verde, frente a la farmacia"></label>
    <label class="f">Zona de cobertura<select id="zone" onchange="sumUpdate()">${MENU.zones.map(z => `<option value="${z.id}">${esc(z.name)} — envío ${Bs(z.fee)} (~${z.minutes} min)</option>`).join('')}</select></label>
  </div>
  <div id="mesaBox" style="display:none"><label class="f">N.º de mesa<input id="table" placeholder="Ej: 4"></label></div>
  <label class="f">Nombre<input id="cname" required value="${esc(customer ? customer.name : '')}"></label>
  <label class="f">Teléfono${MOSTRADOR ? ' (opcional)' : ''}<input id="cphone" type="tel" ${MOSTRADOR ? '' : 'required'} value="${esc(customer ? customer.phone || '' : '')}" placeholder="7xxxxxxx"></label>
  <label class="f">Medio de pago<select id="pay" onchange="payChange()"><option value="efectivo">Efectivo</option><option value="qr">QR</option><option value="transferencia">Transferencia</option></select></label>
  <div id="payRef" style="display:none"><label class="f">N.º de comprobante / referencia<input id="pref" placeholder="Ej: 00123456"></label></div>
  <label class="f">Notas para la cocina<textarea id="notes" rows="2" placeholder="Ej: sin picante, bien caliente"></textarea></label>
  ${customer && !MOSTRADOR ? '<label class="opt"><input type="checkbox" id="saveAddr"> <span>Guardar esta dirección</span></label>' : ''}
  <div id="sumBox"></div>
  <p id="err" class="notice bad" style="display:none"></p>
  <button class="btn big" id="sendBtn">Confirmar pedido</button></form>`);
  sumUpdate();
}
function modeChange() {
  const m = document.querySelector('input[name=mode]:checked').value;
  document.querySelectorAll('#modeSeg label').forEach(l => l.classList.toggle('on', l.querySelector('input').checked));
  $('#deliv').style.display = m === 'delivery' ? '' : 'none';
  $('#mesaBox').style.display = m === 'mesa' ? '' : 'none';
  sumUpdate();
}
function payChange() { $('#payRef').style.display = $('#pay').value === 'efectivo' ? 'none' : ''; }
function fillAddr(i) { if (i === '') return; const a = customer.addresses[+i]; $('#street').value = a.street; $('#ref').value = a.ref || ''; $('#zone').value = a.zoneId; sumUpdate(); }
function sumUpdate() {
  const t = totals(), mode = document.querySelector('input[name=mode]:checked').value;
  const z = MENU.zones.find(z => z.id === +($('#zone') || {}).value);
  const fee = mode === 'delivery' && z ? z.fee : 0;
  const total = t.subtotal - t.discount + fee;
  const eta = mode === 'delivery' && z ? z.minutes + 15 : 15;
  $('#sumBox').innerHTML = `<div class="sum"><span>Subtotal</span><span>${Bs(t.subtotal)}</span></div>
  ${t.promo ? `<div class="sum" style="color:var(--ok)"><span>🎉 ${esc(t.promo.name)}</span><span>−${Bs(t.discount)}</span></div>` : ''}
  ${fee ? `<div class="sum"><span>Envío</span><span>${Bs(fee)}</span></div>` : ''}
  <div class="sum t"><span>Total</span><span>${Bs(total)}</span></div>
  <p class="mut" style="font-size:.85rem">Tiempo estimado aprox. ${eta}+ min (se confirma al enviar).</p>`;
}
async function submitOrder(e) {
  e.preventDefault();
  const btn = $('#sendBtn'), err = $('#err'); btn.disabled = true; err.style.display = 'none';
  const mode = document.querySelector('input[name=mode]:checked').value;
  const body = {
    items: cart.map(i => ({ productId: i.productId, qty: i.qty, selections: i.selections })),
    mode, address: mode === 'delivery' ? { street: $('#street').value, ref: $('#ref').value, zoneId: $('#zone').value } : null,
    table: mode === 'mesa' ? $('#table').value : null,
    customer: { name: $('#cname').value, phone: $('#cphone').value },
    payment: $('#pay').value, paymentRef: $('#pref').value, notes: $('#notes').value,
    clientKey: checkoutKey, channel: MOSTRADOR ? 'mostrador' : 'online'
  };
  try {
    const o = await api('/api/orders', { method: 'POST', body });
    if (customer && !MOSTRADOR && mode === 'delivery' && $('#saveAddr') && $('#saveAddr').checked) {
      api('/api/customer/addresses', { method: 'POST', body: { street: body.address.street, ref: body.address.ref, zoneId: body.address.zoneId } })
        .then(r => { customer.addresses = r.addresses; localStorage.setItem('cust', JSON.stringify(customer)); }).catch(() => {});
    }
    cart = []; saveCart(); checkoutKey = null;
    localStorage.setItem('lastCode', o.code);
    openTrack(o.code, true);
  } catch (ex) { err.textContent = ex.message; err.style.display = 'block'; btn.disabled = false; }
  return false;
}

/* ---------- Seguimiento ---------- */
async function openTrack(code, fresh) {
  code = code || localStorage.getItem('lastCode') || '';
  if (!code) {
    return openModal(`<h2>Seguir mi pedido</h2><label class="f">Código de pedido<input id="tcode" placeholder="Ej: G001-AB12"></label><button class="btn big" onclick="openTrack($('#tcode').value)">Buscar</button>`);
  }
  try {
    const o = await api('/api/orders/track/' + encodeURIComponent(code));
    trackingCode = o.code; localStorage.setItem('lastCode', o.code);
    showTrack(o, fresh);
  } catch (ex) {
    openModal(`<h2>Seguir mi pedido</h2><p class="notice bad">${esc(ex.message)}</p><label class="f">Código de pedido<input id="tcode" placeholder="Ej: G001-AB12"></label><button class="btn big" onclick="openTrack($('#tcode').value)">Buscar</button>`);
  }
}
async function refreshTrack() {
  try { const o = await api('/api/orders/track/' + encodeURIComponent(trackingCode)); showTrack(o); } catch (e) { /* ignorar */ }
}
function showTrack(o, fresh) {
  const flow = o.mode === 'delivery' ? ['Recibido', 'Confirmado', 'En preparación', 'Listo', 'En camino', 'Entregado'] : ['Recibido', 'Confirmado', 'En preparación', 'Listo', 'Entregado'];
  const reached = o.history.map(h => h.status);
  const dead = ['Cancelado', 'Rechazado'].includes(o.status);
  const remaining = Math.max(0, Math.round((o.promisedAt - Date.now()) / 60000));
  const html = `${fresh ? '<p class="notice" style="background:#12301f;border-color:#1f6b45;color:#a8f0cd">✅ ¡Pedido recibido! Guarda tu código para seguirlo.</p>' : ''}
  <h2>Pedido ${esc(o.code)}</h2>
  ${dead ? `<p class="notice bad">Estado: <b>${esc(o.status)}</b></p>` : `<p><span class="badge st">${esc(o.status)}</span> ${o.status !== 'Entregado' ? `· llega en ~${remaining} min (prometido: ${o.etaMin} min)` : ''}</p>
  <ul class="timeline">${flow.map(s => `<li class="${reached.includes(s) ? (s === o.status ? 'now' : 'done') : ''}">${s}</li>`).join('')}</ul>`}
  <div>${o.items.map(i => `<div class="cartrow"><div><b>${i.qty}× ${esc(i.name)}</b><small>${Object.values(i.selections).map(v => esc(v.join(', '))).join(' · ')}</small></div><span>${Bs(i.total)}</span></div>`).join('')}</div>
  ${o.discount ? `<div class="sum" style="color:var(--ok)"><span>Descuento</span><span>−${Bs(o.discount)}</span></div>` : ''}
  ${o.deliveryFee ? `<div class="sum"><span>Envío</span><span>${Bs(o.deliveryFee)}</span></div>` : ''}
  <div class="sum t"><span>Total (${esc(o.payment)})</span><span>${Bs(o.total)}</span></div>
  ${o.canCancel ? `<button class="btn big bad" onclick="cancelOrder('${esc(o.code)}')">Cancelar pedido</button>` : ''}`;
  const sheet = document.querySelector('#modal .sheet');
  if (sheet && !$('#modal').classList.contains('hidden') && trackingCode === o.code) sheet.innerHTML = '<button class="x" onclick="closeModal()">✕</button>' + html;
  else { openModal(html); trackingCode = o.code; }
}
async function cancelOrder(code) {
  if (!confirm('¿Seguro que quieres cancelar tu pedido?')) return;
  try { await api('/api/orders/track/' + code + '/cancel', { method: 'POST' }); refreshTrack(); } catch (e) { toast(e.message); }
}

/* ---------- Cuenta de cliente ---------- */
function updateAccountBtn() { $('#btnAccount').textContent = customer ? '👤 ' + customer.name.split(' ')[0] : 'Cuenta'; if (MOSTRADOR) $('#btnAccount').style.display = 'none'; }
async function openAccount(tab) {
  if (!customer) {
    const reg = tab === 'reg';
    return openModal(`<h2>${reg ? 'Crear cuenta' : 'Iniciar sesión'}</h2><form onsubmit="return doAuth(event,${reg})">
    ${reg ? '<label class="f">Nombre<input id="an" required></label><label class="f">Teléfono<input id="ap" type="tel"></label>' : ''}
    <label class="f">Correo<input id="ae" type="email" required></label>
    <label class="f">Contraseña${reg ? ' (mín. 6)' : ''}<input id="aw" type="password" required minlength="6"></label>
    <p id="err" class="notice bad" style="display:none"></p>
    <button class="btn big">${reg ? 'Registrarme' : 'Entrar'}</button></form>
    <p class="mut" style="text-align:center">${reg ? '¿Ya tienes cuenta? <a href="#" onclick="openAccount();return false" style="color:var(--acc2)">Inicia sesión</a>' : '¿Nuevo? <a href="#" onclick="openAccount(\'reg\');return false" style="color:var(--acc2)">Crea tu cuenta</a>'}<br>También puedes pedir sin cuenta.</p>`);
  }
  let orders = [];
  try { orders = await api('/api/customer/orders'); } catch (e) { /* sesión vencida */ if (/Sesión/.test(e.message)) { logout(); return openAccount(); } }
  openModal(`<h2>Hola, ${esc(customer.name)}</h2><p class="mut">${esc(customer.email)}</p>
  <h3>Mis pedidos</h3>${orders.length ? orders.map(o => `<div class="cartrow"><div><b>${esc(o.code)}</b> <span class="badge">${esc(o.status)}</span><small>${new Date(o.createdAt).toLocaleString('es-BO')} · ${Bs(o.total)}</small></div>
    <div><button class="btn sm ghost" onclick="openTrack('${esc(o.code)}')">Ver</button> <button class="btn sm" onclick='repeatOrder(${JSON.stringify(o.code)})'>Repetir</button></div></div>`).join('') : '<p class="mut">Aún no tienes pedidos.</p>'}
  ${(customer.addresses || []).length ? '<h3>Direcciones guardadas</h3>' + customer.addresses.map(a => `<p>📍 ${esc(a.street)}</p>`).join('') : ''}
  <button class="btn big ghost" onclick="logout();closeModal()">Cerrar sesión</button>`);
  window._orders = orders;
}
async function doAuth(e, reg) {
  e.preventDefault();
  try {
    const body = { email: $('#ae').value, password: $('#aw').value };
    if (reg) { body.name = $('#an').value; body.phone = $('#ap').value; }
    customer = await api('/api/customer/' + (reg ? 'register' : 'login'), { method: 'POST', body });
    localStorage.setItem('cust', JSON.stringify(customer)); updateAccountBtn(); closeModal(); toast('Sesión iniciada ✔');
  } catch (ex) { const er = $('#err'); er.textContent = ex.message; er.style.display = 'block'; }
  return false;
}
function logout() { customer = null; localStorage.removeItem('cust'); updateAccountBtn(); }
function repeatOrder(code) {
  const o = (window._orders || []).find(x => x.code === code); if (!o) return;
  let skipped = 0;
  o.items.forEach(i => {
    const p = MENU.products.find(x => x.id === i.productId);
    if (!p || !p.available) { skipped++; return; }
    cart.push({ productId: i.productId, name: i.name, emoji: p.emoji, qty: i.qty, selections: i.selections, unit: i.unit });
  });
  saveCart(); closeModal(); toast(skipped ? 'Agregado (algunos productos ya no están disponibles)' : 'Pedido agregado al carrito'); openCart();
}

init();
