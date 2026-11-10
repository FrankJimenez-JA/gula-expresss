const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json({ limit: '200kb' }));
app.use(express.static(path.join(__dirname, 'public')));

const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data.json');
const TZ = 'America/La_Paz';

/* ---------- Seguridad: hash con sal (RNF-11) ---------- */
function hash(pw, salt = crypto.randomBytes(16).toString('hex')) {
  return salt + ':' + crypto.scryptSync(pw, salt, 32).toString('hex');
}
function verify(pw, stored) {
  const [salt, h] = stored.split(':');
  const c = crypto.scryptSync(pw, salt, 32).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(h), Buffer.from(c));
}

/* ---------- Datos iniciales ---------- */
const COCCION = { name: 'Término de cocción', type: 'single', required: true,
  items: [{ name: 'Jugosa', price: 0 }, { name: 'Media', price: 0 }, { name: 'Bien cocida', price: 0 }] };
const EXTRAS = { name: 'Extras', type: 'multi', required: false,
  items: [{ name: 'Extra tocino', price: 6 }, { name: 'Extra queso', price: 4 }, { name: 'Huevo', price: 3 }] };
const QUITAR = { name: 'Quitar ingredientes', type: 'multi', required: false,
  items: [{ name: 'Sin cebolla', price: 0 }, { name: 'Sin tomate', price: 0 }, { name: 'Sin queso', price: 0 }, { name: 'Sin salsa', price: 0 }] };
const ACOMP = { name: 'Acompañamiento', type: 'single', required: true,
  items: [{ name: 'Papas fritas', price: 0 }, { name: 'Aros de cebolla', price: 3 }] };
const BEBIDA = { name: 'Bebida', type: 'single', required: true,
  items: [{ name: 'Coca-Cola 500ml', price: 0 }, { name: 'Fanta 500ml', price: 0 }, { name: 'Sprite 500ml', price: 0 }, { name: 'Agua', price: 0 }] };
const INCOMP = [['Extra queso', 'Sin queso']];
const clone = o => JSON.parse(JSON.stringify(o));

function seed() {
  let id = 0;
  const P = (category, emoji, name, desc, price, groups = [], incompatible = []) =>
    ({ id: ++id, category, emoji, name, desc, price, available: true, groups: clone(groups), incompatible });
  const burger = [COCCION, EXTRAS, QUITAR];
  return {
    seq: 0,
    products: [
      P('Hamburguesas', '🍔', 'Gula Clásica', 'Carne de res 150g, lechuga, tomate, cebolla y salsa Gula.', 28, burger, INCOMP),
      P('Hamburguesas', '🍔', 'Doble Gula', 'Doble carne 300g, doble queso cheddar y salsa Gula.', 38, burger, INCOMP),
      P('Hamburguesas', '🧀', 'Cheeseburger', 'Carne 150g, queso cheddar derretido, pepinillos y mostaza.', 32, burger, INCOMP),
      P('Hamburguesas', '🥓', 'BBQ Bacon', 'Carne 150g, tocino crocante, aros de cebolla y salsa BBQ.', 36, burger, INCOMP),
      P('Hamburguesas', '🍗', 'Pollo Crispy', 'Pechuga de pollo apanada, lechuga y mayonesa de ajo.', 30, [EXTRAS, QUITAR], INCOMP),
      P('Combos', '🍟', 'Combo Clásico', 'Gula Clásica + acompañamiento + bebida.', 42, [COCCION, ACOMP, BEBIDA, EXTRAS, QUITAR], INCOMP),
      P('Combos', '🍟', 'Combo Doble', 'Doble Gula + acompañamiento + bebida.', 54, [COCCION, ACOMP, BEBIDA, EXTRAS, QUITAR], INCOMP),
      P('Combos', '🍗', 'Combo Crispy', 'Pollo Crispy + acompañamiento + bebida.', 44, [ACOMP, BEBIDA, QUITAR]),
      P('Acompañamientos', '🍟', 'Papas fritas', 'Porción grande de papas fritas crocantes.', 12),
      P('Acompañamientos', '🧅', 'Aros de cebolla', 'Aros apanados con salsa ranch.', 15),
      P('Bebidas', '🥤', 'Coca-Cola 500ml', 'Bien fría.', 8),
      P('Bebidas', '🥤', 'Fanta 500ml', 'Bien fría.', 8),
      P('Bebidas', '💧', 'Agua', 'Sin gas, 500ml.', 6),
      P('Postres', '🍦', 'Helado Gula', 'Helado de vainilla con salsa de chocolate.', 14)
    ],
    zones: [
      { id: 1, name: 'Centro', fee: 8, minutes: 25, active: true },
      { id: 2, name: 'Recoleta / Parque Bolívar', fee: 10, minutes: 30, active: true },
      { id: 3, name: 'Zona Sur', fee: 12, minutes: 40, active: true }
    ],
    promos: [{ id: 1, name: 'Pedidos desde Bs 80: 10% de descuento', minTotal: 80, percent: 10, active: true }],
    settings: { open: '00:00', close: '23:59', enforce: false, kitchenAlertMin: 10 },
    users: [
      { id: 1, username: 'admin', name: 'Administrador', role: 'admin', pass: hash('admin123'), active: true },
      { id: 2, username: 'vendedor', name: 'Vendedor Mostrador', role: 'vendedor', pass: hash('vendedor123'), active: true },
      { id: 3, username: 'cocinero', name: 'Cocinero', role: 'cocinero', pass: hash('cocinero123'), active: true },
      { id: 4, username: 'repartidor', name: 'Repartidor 1', role: 'repartidor', pass: hash('repartidor123'), active: true }
    ],
    customers: [],
    orders: [],
    nextId: { product: id, zone: 3, promo: 1, user: 4, customer: 0, order: 0 }
  };
}

function load() { try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch { return seed(); } }
let db = load();
let saveT;
function save() {
  clearTimeout(saveT);
  saveT = setTimeout(() => { try { fs.writeFileSync(DATA_FILE, JSON.stringify(db)); } catch (e) { /* disco efímero */ } }, 300);
}

/* ---------- Tiempo real (SSE) ---------- */
const clients = new Set();
app.get('/api/events', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.write('retry: 3000\n\n');
  clients.add(res);
  req.on('close', () => clients.delete(res));
});
function broadcast(kind) { for (const c of clients) c.write(`data: ${kind}\n\n`); }
setInterval(() => { for (const c of clients) c.write(': ping\n\n'); }, 25000);

/* ---------- Sesiones ---------- */
const sessions = new Map();
function getAuth(req) {
  const h = req.headers.authorization || '';
  return h.startsWith('Bearer ') ? sessions.get(h.slice(7)) || null : null;
}
function need(...roles) {
  return (req, res, next) => {
    const a = getAuth(req);
    if (!a) return res.status(401).json({ error: 'Sesión requerida' });
    if (roles.length && !roles.includes(a.role)) return res.status(403).json({ error: 'Sin permiso para esta acción' });
    req.auth = a; next();
  };
}
const wrap = fn => (req, res) => { try { fn(req, res); } catch (e) { res.status(400).json({ error: e.message }); } };
const round2 = n => Math.round(n * 100) / 100;

/* ---------- Menú público ---------- */
app.get('/api/menu', (req, res) => {
  const categories = [...new Set(db.products.map(p => p.category))];
  res.json({
    categories, products: db.products,
    zones: db.zones.filter(z => z.active),
    promos: db.promos.filter(p => p.active),
    settings: { open: db.settings.open, close: db.settings.close, enforce: db.settings.enforce, isOpen: isOpenNow() }
  });
});

function nowMinutes() {
  const [h, m] = new Date().toLocaleTimeString('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).split(':').map(Number);
  return h * 60 + m;
}
const toMin = s => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
function isOpenNow() {
  if (!db.settings.enforce) return true;
  const t = nowMinutes(), o = toMin(db.settings.open), c = toMin(db.settings.close);
  return o <= c ? t >= o && t <= c : t >= o || t <= c;
}

/* ---------- Cálculo de pedido ---------- */
function priceItems(items) {
  if (!Array.isArray(items) || !items.length) throw new Error('El carrito está vacío');
  let subtotal = 0; const out = [];
  for (const it of items) {
    const p = db.products.find(x => x.id === it.productId);
    if (!p) throw new Error('Producto inexistente');
    if (!p.available) throw new Error(`"${p.name}" no está disponible`);
    const qty = Math.max(1, Math.min(20, parseInt(it.qty) || 1));
    let unit = p.price; const sel = {};
    for (const g of p.groups) {
      const chosen = (it.selections?.[g.name] || []).filter(n => typeof n === 'string');
      if (g.required && !chosen.length) throw new Error(`Elige "${g.name}" en ${p.name}`);
      if (g.type === 'single' && chosen.length > 1) throw new Error(`Solo una opción en "${g.name}"`);
      for (const n of chosen) {
        const opt = g.items.find(i => i.name === n);
        if (!opt) throw new Error('Opción inválida');
        unit += opt.price;
      }
      if (chosen.length) sel[g.name] = chosen;
    }
    const all = Object.values(sel).flat();
    for (const [a, b] of p.incompatible || [])
      if (all.includes(a) && all.includes(b)) throw new Error(`"${a}" y "${b}" no se pueden combinar`);
    out.push({ productId: p.id, name: p.name, qty, unit, selections: sel, total: unit * qty });
    subtotal += unit * qty;
  }
  return { items: out, subtotal };
}

function bestPromo(subtotal) {
  let best = null, disc = 0;
  for (const p of db.promos) {
    if (!p.active || subtotal < p.minTotal) continue;
    const d = round2(subtotal * p.percent / 100);
    if (d > disc) { disc = d; best = p; }
  }
  return { promo: best, discount: disc };
}

const MODES = ['delivery', 'recojo', 'mesa'];
const PAYMENTS = ['efectivo', 'qr', 'transferencia'];
const ACTIVE = ['Confirmado', 'En preparación'];

function publicOrder(o) {
  return {
    code: o.code, status: o.status, mode: o.mode, channel: o.channel, items: o.items,
    subtotal: o.subtotal, discount: o.discount, promoName: o.promoName, deliveryFee: o.deliveryFee, total: o.total,
    etaMin: o.etaMin, promisedAt: o.promisedAt, payment: o.payment, createdAt: o.createdAt,
    history: o.history.map(h => ({ status: h.status, at: h.at })),
    canCancel: ['Recibido', 'Confirmado'].includes(o.status)
  };
}

app.post('/api/orders', wrap((req, res) => {
  const b = req.body || {};
  const auth = getAuth(req);
  if (b.clientKey) {
    const dup = db.orders.find(o => o.clientKey === b.clientKey);
    if (dup) return res.json(publicOrder(dup)); // RNF-01: sin duplicados
  }
  const counter = b.channel === 'mostrador';
  if (counter && !(auth && ['vendedor', 'admin'].includes(auth.role))) return res.status(403).json({ error: 'Solo el personal puede registrar en mostrador' });
  if (!counter && !isOpenNow()) throw new Error(`El local está cerrado. Horario: ${db.settings.open} a ${db.settings.close}`);
  if (!MODES.includes(b.mode)) throw new Error('Elige una modalidad de entrega');
  if (!PAYMENTS.includes(b.payment)) throw new Error('Elige un medio de pago');
  const name = String(b.customer?.name || '').trim().slice(0, 80);
  const phone = String(b.customer?.phone || '').trim().slice(0, 20);
  if (!name) throw new Error('Ingresa el nombre del cliente');
  if (!counter && !/^[0-9+ -]{7,20}$/.test(phone)) throw new Error('Ingresa un teléfono de contacto válido');

  const { items, subtotal } = priceItems(b.items);
  let zone = null, address = null, table = null;
  if (b.mode === 'delivery') {
    zone = db.zones.find(z => z.id === parseInt(b.address?.zoneId) && z.active);
    if (!zone) throw new Error('Tu dirección está fuera de nuestras zonas de cobertura'); // RF-10
    const street = String(b.address?.street || '').trim().slice(0, 160);
    if (!street) throw new Error('Ingresa la dirección de entrega');
    address = { street, ref: String(b.address?.ref || '').slice(0, 160), zone: zone.name };
  }
  if (b.mode === 'mesa') table = String(b.table || '').slice(0, 10) || null;
  const { promo, discount } = bestPromo(subtotal);
  const deliveryFee = zone ? zone.fee : 0;
  const total = round2(subtotal - discount + deliveryFee);

  const queue = db.orders.filter(o => ACTIVE.includes(o.status)).length;
  const etaMin = 10 + queue * 3 + (zone ? zone.minutes : 0);
  const now = Date.now();
  const seq = ++db.seq;
  const code = 'G' + String(seq).padStart(3, '0') + '-' + crypto.randomBytes(2).toString('hex').toUpperCase();
  const by = auth ? auth.name : 'Cliente';
  const order = {
    id: seq, code, clientKey: b.clientKey || null, channel: counter ? 'mostrador' : 'online',
    mode: b.mode, items, subtotal, discount, promoName: promo ? promo.name : null, deliveryFee, total,
    customer: { name, phone }, customerId: auth && auth.role === 'cliente' ? auth.id : null,
    address, zoneId: zone ? zone.id : null, table, payment: b.payment,
    paymentRef: String(b.paymentRef || '').slice(0, 80), notes: String(b.notes || '').slice(0, 300),
    status: 'Confirmado', etaMin, promisedAt: now + etaMin * 60000, createdAt: now,
    driverId: null, driverName: null,
    history: [{ status: 'Recibido', at: now, by }, { status: 'Confirmado', at: now, by: 'Sistema' }]
  };
  db.orders.push(order); save(); broadcast('orders');
  res.json(publicOrder(order));
}));

/* ---------- Seguimiento público (RF-16, RF-17) ---------- */
app.get('/api/orders/track/:code', wrap((req, res) => {
  const o = db.orders.find(x => x.code === String(req.params.code).toUpperCase().trim());
  if (!o) return res.status(404).json({ error: 'No encontramos un pedido con ese código' });
  res.json(publicOrder(o));
}));
app.post('/api/orders/track/:code/cancel', wrap((req, res) => {
  const o = db.orders.find(x => x.code === String(req.params.code).toUpperCase().trim());
  if (!o) return res.status(404).json({ error: 'Pedido no encontrado' });
  if (!['Recibido', 'Confirmado'].includes(o.status)) throw new Error('El pedido ya está en preparación y no puede cancelarse');
  o.status = 'Cancelado'; o.history.push({ status: 'Cancelado', at: Date.now(), by: 'Cliente' });
  save(); broadcast('orders'); res.json(publicOrder(o));
}));

/* ---------- Cuenta de cliente (RF-18..21) ---------- */
app.post('/api/customer/register', wrap((req, res) => {
  const { name, email, phone, password } = req.body || {};
  if (!name || !email || !password) throw new Error('Completa nombre, correo y contraseña');
  if (String(password).length < 6) throw new Error('La contraseña debe tener al menos 6 caracteres');
  const em = String(email).toLowerCase().trim();
  if (db.customers.find(c => c.email === em)) throw new Error('Ese correo ya está registrado');
  const c = { id: ++db.nextId.customer, name: String(name).slice(0, 80), email: em, phone: String(phone || '').slice(0, 20), pass: hash(password), addresses: [] };
  db.customers.push(c); save();
  const t = crypto.randomBytes(24).toString('hex'); sessions.set(t, { role: 'cliente', id: c.id, name: c.name });
  res.json({ token: t, name: c.name, phone: c.phone, email: c.email, addresses: c.addresses });
}));
app.post('/api/customer/login', wrap((req, res) => {
  const em = String(req.body?.email || '').toLowerCase().trim();
  const c = db.customers.find(x => x.email === em);
  if (!c || !verify(String(req.body?.password || ''), c.pass)) throw new Error('Correo o contraseña incorrectos');
  const t = crypto.randomBytes(24).toString('hex'); sessions.set(t, { role: 'cliente', id: c.id, name: c.name });
  res.json({ token: t, name: c.name, phone: c.phone, email: c.email, addresses: c.addresses });
}));
app.get('/api/customer/orders', need('cliente'), (req, res) => {
  res.json(db.orders.filter(o => o.customerId === req.auth.id).sort((a, b) => b.createdAt - a.createdAt).map(o => ({ ...publicOrder(o) })));
});
app.post('/api/customer/addresses', need('cliente'), wrap((req, res) => {
  const c = db.customers.find(x => x.id === req.auth.id);
  const a = { street: String(req.body?.street || '').slice(0, 160), ref: String(req.body?.ref || '').slice(0, 160), zoneId: parseInt(req.body?.zoneId) };
  if (!a.street || !a.zoneId) throw new Error('Dirección incompleta');
  if (!c.addresses.find(x => x.street === a.street)) c.addresses.push(a);
  save(); res.json({ addresses: c.addresses });
}));

/* ---------- Personal: login ---------- */
app.post('/api/staff/login', wrap((req, res) => {
  const u = db.users.find(x => x.username === String(req.body?.username || '').toLowerCase().trim() && x.active);
  if (!u || !verify(String(req.body?.password || ''), u.pass)) throw new Error('Usuario o contraseña incorrectos');
  const t = crypto.randomBytes(24).toString('hex');
  sessions.set(t, { role: u.role, id: u.id, name: u.name });
  res.json({ token: t, role: u.role, name: u.name, id: u.id });
}));

/* ---------- Personal: pedidos ---------- */
const STAFF = ['admin', 'vendedor', 'cocinero', 'repartidor'];
app.get('/api/staff/orders', need(...STAFF), (req, res) => {
  const since = Date.now() - 12 * 3600e3;
  let list = db.orders.filter(o => !['Entregado', 'Cancelado', 'Rechazado'].includes(o.status) || o.createdAt > since)
    .sort((a, b) => a.createdAt - b.createdAt);
  if (req.auth.role === 'repartidor') list = list.filter(o => o.driverId === req.auth.id);
  if (req.auth.role === 'cocinero') list = list.map(o => ({ ...o, customer: { name: o.customer.name }, address: null, paymentRef: '' }));
  res.json({ orders: list, settings: db.settings });
});
app.get('/api/staff/drivers', need('admin', 'vendedor'), (req, res) =>
  res.json(db.users.filter(u => u.role === 'repartidor' && u.active).map(u => ({ id: u.id, name: u.name }))));

function transition(auth, o, to) {
  const from = o.status, r = auth.role, admin = r === 'admin';
  const fail = m => { throw new Error(m); };
  if (to === 'En preparación') { if (!(r === 'cocinero' || admin) || from !== 'Confirmado') fail('Transición no permitida'); }
  else if (to === 'Listo') { if (!(r === 'cocinero' || admin) || from !== 'En preparación') fail('Transición no permitida'); }
  else if (to === 'En camino') {
    if (o.mode !== 'delivery' || from !== 'Listo') fail('Transición no permitida');
    if (!o.driverId) fail('Primero asigna un repartidor');
    if (!(admin || (r === 'repartidor' && o.driverId === auth.id))) fail('Este pedido no está asignado a ti');
  } else if (to === 'Entregado') {
    if (o.mode === 'delivery') {
      if (from !== 'En camino' || !(admin || (r === 'repartidor' && o.driverId === auth.id))) fail('Transición no permitida');
    } else if (from !== 'Listo' || !(admin || r === 'vendedor')) fail('Transición no permitida');
  } else if (to === 'Rechazado' || to === 'Cancelado') {
    if (!(admin || r === 'vendedor') || !['Recibido', 'Confirmado'].includes(from)) fail('Solo se puede antes de la preparación');
  } else fail('Estado desconocido');
}
app.post('/api/staff/orders/:id/status', need(...STAFF), wrap((req, res) => {
  const o = db.orders.find(x => x.id === parseInt(req.params.id));
  if (!o) return res.status(404).json({ error: 'Pedido no encontrado' });
  const to = req.body?.status;
  transition(req.auth, o, to);
  o.status = to; o.history.push({ status: to, at: Date.now(), by: req.auth.name });
  save(); broadcast('orders'); res.json({ ok: true, status: to });
}));
app.post('/api/staff/orders/:id/assign', need('admin', 'vendedor'), wrap((req, res) => {
  const o = db.orders.find(x => x.id === parseInt(req.params.id));
  const d = db.users.find(u => u.id === parseInt(req.body?.driverId) && u.role === 'repartidor' && u.active);
  if (!o || o.mode !== 'delivery') throw new Error('Pedido inválido para reparto');
  if (!d) throw new Error('Repartidor inválido');
  if (['En camino', 'Entregado', 'Cancelado', 'Rechazado'].includes(o.status)) throw new Error('El pedido ya no admite asignación');
  o.driverId = d.id; o.driverName = d.name;
  o.history.push({ status: 'Asignado a ' + d.name, at: Date.now(), by: req.auth.name });
  save(); broadcast('orders'); res.json({ ok: true });
}));

/* ---------- Administración ---------- */
const ADM = need('admin');
app.patch('/api/admin/products/:id', ADM, wrap((req, res) => {
  const p = db.products.find(x => x.id === parseInt(req.params.id));
  if (!p) return res.status(404).json({ error: 'No existe' });
  if (typeof req.body.available === 'boolean') p.available = req.body.available;
  if (req.body.price !== undefined) { const v = Number(req.body.price); if (!(v >= 0)) throw new Error('Precio inválido'); p.price = v; }
  if (req.body.name) p.name = String(req.body.name).slice(0, 60);
  save(); broadcast('menu'); res.json(p);
}));
app.post('/api/admin/products', ADM, wrap((req, res) => {
  const { name, desc, price, category, preset } = req.body || {};
  if (!name || !category || !(Number(price) >= 0)) throw new Error('Completa nombre, categoría y precio');
  const groups = preset === 'hamburguesa' ? [COCCION, EXTRAS, QUITAR] : preset === 'combo' ? [COCCION, ACOMP, BEBIDA, EXTRAS, QUITAR] : [];
  const p = { id: ++db.nextId.product, category: String(category).slice(0, 40), emoji: '🍽️', name: String(name).slice(0, 60), desc: String(desc || '').slice(0, 200), price: Number(price), available: true, groups: clone(groups), incompatible: groups.length ? INCOMP : [] };
  db.products.push(p); save(); broadcast('menu'); res.json(p);
}));
app.put('/api/admin/settings', ADM, wrap((req, res) => {
  const b = req.body || {};
  if (!/^\d\d:\d\d$/.test(b.open) || !/^\d\d:\d\d$/.test(b.close)) throw new Error('Horario inválido');
  db.settings = { open: b.open, close: b.close, enforce: !!b.enforce, kitchenAlertMin: Math.max(1, parseInt(b.kitchenAlertMin) || 10) };
  save(); broadcast('menu'); res.json(db.settings);
}));
app.get('/api/admin/zones', ADM, (req, res) => res.json(db.zones));
app.post('/api/admin/zones', ADM, wrap((req, res) => {
  const { name, fee, minutes } = req.body || {};
  if (!name || !(Number(fee) >= 0) || !(Number(minutes) > 0)) throw new Error('Datos de zona inválidos');
  const z = { id: ++db.nextId.zone, name: String(name).slice(0, 60), fee: Number(fee), minutes: Number(minutes), active: true };
  db.zones.push(z); save(); res.json(z);
}));
app.patch('/api/admin/zones/:id', ADM, wrap((req, res) => {
  const z = db.zones.find(x => x.id === parseInt(req.params.id)); if (!z) throw new Error('No existe');
  if (typeof req.body.active === 'boolean') z.active = req.body.active;
  save(); res.json(z);
}));
app.get('/api/admin/promos', ADM, (req, res) => res.json(db.promos));
app.post('/api/admin/promos', ADM, wrap((req, res) => {
  const { name, minTotal, percent } = req.body || {};
  if (!name || !(Number(minTotal) >= 0) || !(Number(percent) > 0 && Number(percent) <= 100)) throw new Error('Datos de promoción inválidos');
  const p = { id: ++db.nextId.promo, name: String(name).slice(0, 80), minTotal: Number(minTotal), percent: Number(percent), active: true };
  db.promos.push(p); save(); broadcast('menu'); res.json(p);
}));
app.patch('/api/admin/promos/:id', ADM, wrap((req, res) => {
  const p = db.promos.find(x => x.id === parseInt(req.params.id)); if (!p) throw new Error('No existe');
  if (typeof req.body.active === 'boolean') p.active = req.body.active;
  save(); broadcast('menu'); res.json(p);
}));
app.get('/api/admin/users', ADM, (req, res) => res.json(db.users.map(({ pass, ...u }) => u)));
app.post('/api/admin/users', ADM, wrap((req, res) => {
  const { username, name, role, password } = req.body || {};
  if (!username || !name || !password || !['admin', 'vendedor', 'cocinero', 'repartidor'].includes(role)) throw new Error('Datos de usuario inválidos');
  if (String(password).length < 6) throw new Error('La contraseña debe tener al menos 6 caracteres');
  const un = String(username).toLowerCase().trim();
  if (db.users.find(u => u.username === un)) throw new Error('Ese usuario ya existe');
  const u = { id: ++db.nextId.user, username: un, name: String(name).slice(0, 60), role, pass: hash(password), active: true };
  db.users.push(u); save(); res.json({ id: u.id });
}));
app.patch('/api/admin/users/:id', ADM, wrap((req, res) => {
  const u = db.users.find(x => x.id === parseInt(req.params.id)); if (!u) throw new Error('No existe');
  if (u.id === req.auth.id) throw new Error('No puedes desactivarte a ti mismo');
  if (typeof req.body.active === 'boolean') u.active = req.body.active;
  save(); res.json({ ok: true });
}));

/* ---------- Reportes (RF-39..42) ---------- */
function report(days) {
  const since = Date.now() - days * 864e5;
  const os = db.orders.filter(o => o.createdAt >= since && !['Cancelado', 'Rechazado'].includes(o.status));
  const group = key => { const m = {}; os.forEach(o => { const k = o[key]; m[k] = m[k] || { count: 0, total: 0 }; m[k].count++; m[k].total = round2(m[k].total + o.total); }); return m; };
  const prod = {}; os.forEach(o => o.items.forEach(i => { prod[i.name] = (prod[i.name] || 0) + i.qty; }));
  const top = Object.entries(prod).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, qty]) => ({ name, qty }));
  const at = (o, s) => o.history.find(h => h.status === s)?.at;
  const avg = (from, to) => {
    const d = os.map(o => { const a = at(o, from), b = at(o, to); return a && b ? (b - a) / 60000 : null; }).filter(x => x !== null);
    return d.length ? Math.round(d.reduce((s, x) => s + x, 0) / d.length * 10) / 10 : null;
  };
  return {
    days, orders: os.length, total: round2(os.reduce((s, o) => s + o.total, 0)),
    byChannel: group('channel'), byMode: group('mode'), top,
    avgPrepMin: avg('En preparación', 'Listo'), avgDeliveryMin: avg('Listo', 'Entregado')
  };
}
app.get('/api/admin/reports', ADM, (req, res) => res.json(report(parseInt(req.query.days) || 30)));
app.get('/api/admin/reports.csv', ADM, (req, res) => {
  const rows = [['codigo', 'fecha', 'canal', 'modalidad', 'estado', 'pago', 'total']];
  db.orders.forEach(o => rows.push([o.code, new Date(o.createdAt).toISOString(), o.channel, o.mode, o.status, o.payment, o.total]));
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="ventas-gula.csv"' });
  res.send('\ufeff' + rows.map(r => r.join(',')).join('\n'));
});

app.get('/healthz', (req, res) => res.send('ok'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Gula Express escuchando en puerto ' + PORT));
