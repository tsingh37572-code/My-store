// Simple e-commerce server: Node.js 22.5+ only. No npm install needed.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const db = new DatabaseSync(path.join(DATA_DIR, 'store.db'));
db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS categories(id INTEGER PRIMARY KEY, name TEXT NOT NULL, slug TEXT UNIQUE, image TEXT DEFAULT '', sort INTEGER DEFAULT 0, active INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS products(id INTEGER PRIMARY KEY, name TEXT NOT NULL, description TEXT DEFAULT '', category_id INTEGER, price REAL NOT NULL, mrp REAL DEFAULT 0, images TEXT DEFAULT '[]', sizes TEXT DEFAULT '[]', stock INTEGER DEFAULT 100, is_combo INTEGER DEFAULT 0, badge TEXT DEFAULT '', featured INTEGER DEFAULT 0, active INTEGER DEFAULT 1, created INTEGER);
CREATE TABLE IF NOT EXISTS coupons(id INTEGER PRIMARY KEY, code TEXT UNIQUE NOT NULL, type TEXT NOT NULL, value REAL NOT NULL, min_order REAL DEFAULT 0, max_discount REAL DEFAULT 0, expires TEXT DEFAULT '', usage_limit INTEGER DEFAULT 0, used INTEGER DEFAULT 0, active INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS banners(id INTEGER PRIMARY KEY, image TEXT, title TEXT DEFAULT '', subtitle TEXT DEFAULT '', link TEXT DEFAULT '', sort INTEGER DEFAULT 0, active INTEGER DEFAULT 1);
CREATE TABLE IF NOT EXISTS orders(id INTEGER PRIMARY KEY, order_no TEXT UNIQUE, name TEXT, phone TEXT, email TEXT, address TEXT, city TEXT, state TEXT, pincode TEXT, items TEXT, subtotal REAL, discount REAL, shipping REAL, total REAL, coupon TEXT DEFAULT '', method TEXT, pay_status TEXT DEFAULT 'pending', rzp_order_id TEXT DEFAULT '', rzp_payment_id TEXT DEFAULT '', status TEXT DEFAULT 'new', note TEXT DEFAULT '', created INTEGER);
CREATE TABLE IF NOT EXISTS returns(id INTEGER PRIMARY KEY, order_no TEXT, phone TEXT, reason TEXT, status TEXT DEFAULT 'requested', created INTEGER);
`);

const DEFAULTS = {
  store_name: 'URBAN THREADS', tagline: 'Everyday style, honest prices',
  announcement: 'UP TO 40% OFF ON ALL PRODUCTS', accent: '#111111',
  contact_email: '', contact_phone: '', address: '',
  shipping_fee: '79', free_shipping_above: '999', return_days: '7',
  cod_enabled: '1', cod_fee: '0',
  razorpay_enabled: '0', razorpay_key_id: '', razorpay_key_secret: '',
  footer_text: 'Made with care in India.',
  hero_cta: 'SHOP NOW',
};
const getSetting = k => { const r = db.prepare('SELECT value FROM settings WHERE key=?').get(k); return r ? r.value : (DEFAULTS[k] ?? ''); };
const setSetting = (k, v) => db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(k, String(v));
const allSettings = () => { const o = { ...DEFAULTS }; for (const r of db.prepare('SELECT * FROM settings').all()) o[r.key] = r.value; return o; };

// ---------- auth ----------
if (!getSetting('token_secret')) setSetting('token_secret', crypto.randomBytes(32).toString('hex'));
const SECRET = getSetting('token_secret');
const hashPw = (pw, salt = crypto.randomBytes(16).toString('hex')) => salt + ':' + crypto.scryptSync(pw, salt, 32).toString('hex');
const checkPw = (pw, stored) => { const [salt, h] = stored.split(':'); const x = crypto.scryptSync(pw, salt, 32).toString('hex'); return crypto.timingSafeEqual(Buffer.from(x), Buffer.from(h)); };
if (!db.prepare("SELECT 1 FROM settings WHERE key='admin_hash'").get()) {
  setSetting('admin_hash', hashPw(process.env.ADMIN_PASSWORD || 'admin123'));
  setSetting('default_pw', process.env.ADMIN_PASSWORD ? '0' : '1');
}
const sign = p => { const b = Buffer.from(JSON.stringify(p)).toString('base64url'); return b + '.' + crypto.createHmac('sha256', SECRET).update(b).digest('base64url'); };
const verify = t => { try { const [b, s] = (t || '').split('.'); const e = crypto.createHmac('sha256', SECRET).update(b).digest('base64url'); if (s.length !== e.length || !crypto.timingSafeEqual(Buffer.from(s), Buffer.from(e))) return null; const p = JSON.parse(Buffer.from(b, 'base64url').toString()); return p.exp > Date.now() ? p : null; } catch { return null; } };
const fails = new Map();

// ---------- helpers ----------
const slugify = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'item';
const pj = (s, d) => { try { return JSON.parse(s); } catch { return d; } };
const prod = r => r && ({ ...r, images: pj(r.images, []), sizes: pj(r.sizes, []) });
const num = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
class HttpError extends Error { constructor(c, m) { super(m); this.code = c; } }
const bad = (m, c = 400) => { throw new HttpError(c, m); };
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };

function validateCoupon(code, subtotal) {
  if (!code) return { discount: 0 };
  const c = db.prepare('SELECT * FROM coupons WHERE code=? COLLATE NOCASE').get(code.trim());
  if (!c || !c.active) bad('Invalid coupon code');
  if (c.expires && new Date(c.expires + 'T23:59:59') < new Date()) bad('Coupon expired');
  if (c.usage_limit && c.used >= c.usage_limit) bad('Coupon usage limit reached');
  if (subtotal < c.min_order) bad(`Minimum order Rs. ${c.min_order} required for this coupon`);
  let d = c.type === 'percent' ? subtotal * c.value / 100 : c.value;
  if (c.type === 'percent' && c.max_discount) d = Math.min(d, c.max_discount);
  d = Math.min(Math.round(d), subtotal);
  return { discount: d, coupon: c };
}
function priceCart(items, couponCode) {
  if (!Array.isArray(items) || !items.length) bad('Cart is empty');
  let subtotal = 0; const lines = [];
  for (const it of items) {
    const p = db.prepare('SELECT * FROM products WHERE id=? AND active=1').get(num(it.id));
    if (!p) bad('A product in your cart is no longer available');
    const qty = Math.max(1, Math.min(20, Math.floor(num(it.qty, 1))));
    if (p.stock < qty) bad(`${p.name}: only ${p.stock} left in stock`);
    const sizes = pj(p.sizes, []);
    const size = sizes.length ? String(it.size || '') : '';
    if (sizes.length && !sizes.includes(size)) bad(`Please select a size for ${p.name}`);
    const img = pj(p.images, [])[0] || '';
    lines.push({ id: p.id, name: p.name, price: p.price, qty, size, image: img });
    subtotal += p.price * qty;
  }
  const { discount, coupon } = validateCoupon(couponCode, subtotal);
  const free = num(getSetting('free_shipping_above'));
  const shipping = (free && subtotal - discount >= free) ? 0 : num(getSetting('shipping_fee'));
  return { lines, subtotal, discount, shipping, coupon };
}

async function rzpCreateOrder(amountPaise, receipt) {
  const id = getSetting('razorpay_key_id'), sec = getSetting('razorpay_key_secret');
  const r = await fetch('https://api.razorpay.com/v1/orders', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Basic ' + Buffer.from(id + ':' + sec).toString('base64') }, body: JSON.stringify({ amount: amountPaise, currency: 'INR', receipt }) });
  const j = await r.json(); if (!r.ok) throw new HttpError(502, 'Payment gateway error: ' + (j.error?.description || r.status));
  return j;
}

// ---------- routes ----------
const routes = [];
const route = (method, pattern, fn, admin = false) => routes.push({ method, re: new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), fn, admin });

// Public
route('GET', '/api/config', () => {
  const s = allSettings();
  const pub = {}; for (const k of ['store_name', 'tagline', 'announcement', 'accent', 'contact_email', 'contact_phone', 'address', 'shipping_fee', 'free_shipping_above', 'return_days', 'footer_text', 'hero_cta']) pub[k] = s[k];
  pub.cod_enabled = s.cod_enabled === '1'; pub.cod_fee = num(s.cod_fee);
  pub.online_enabled = s.razorpay_enabled === '1' && !!s.razorpay_key_id && !!s.razorpay_key_secret;
  return pub;
});
route('GET', '/api/home', () => ({
  banners: db.prepare('SELECT * FROM banners WHERE active=1 ORDER BY sort,id').all(),
  categories: db.prepare('SELECT * FROM categories WHERE active=1 ORDER BY sort,id').all(),
  featured: db.prepare('SELECT * FROM products WHERE active=1 AND featured=1 ORDER BY id DESC LIMIT 12').all().map(prod),
  combos: db.prepare('SELECT * FROM products WHERE active=1 AND is_combo=1 ORDER BY id DESC LIMIT 12').all().map(prod),
}));
route('GET', '/api/products', ({ query }) => {
  let sql = 'SELECT p.* FROM products p LEFT JOIN categories c ON c.id=p.category_id WHERE p.active=1'; const a = [];
  if (query.category) { sql += ' AND c.slug=?'; a.push(query.category); }
  if (query.q) { sql += ' AND (p.name LIKE ? OR p.description LIKE ?)'; a.push('%' + query.q + '%', '%' + query.q + '%'); }
  if (query.combo) sql += ' AND p.is_combo=1';
  const sort = { low: 'p.price ASC', high: 'p.price DESC' }[query.sort] || 'p.id DESC';
  return db.prepare(sql + ' ORDER BY ' + sort + ' LIMIT 200').all(...a).map(prod);
});
route('GET', '/api/products/:id', ({ params }) => { const p = db.prepare('SELECT * FROM products WHERE id=? AND active=1').get(num(params.id)); if (!p) bad('Not found', 404); return prod(p); });
route('POST', '/api/coupon/check', ({ body }) => {
  const sub = (body.items ? priceCart(body.items, '') : { subtotal: 0 }).subtotal;
  const { discount, coupon } = validateCoupon(body.code, sub); return { discount, code: coupon?.code };
});
route('POST', '/api/orders', async ({ body }) => {
  const c = body.customer || {};
  for (const k of ['name', 'phone', 'address', 'city', 'state', 'pincode']) if (!String(c[k] || '').trim()) bad('Please fill ' + k);
  if (!/^[6-9]\d{9}$/.test(String(c.phone).trim())) bad('Enter a valid 10-digit mobile number');
  if (!/^\d{6}$/.test(String(c.pincode).trim())) bad('Enter a valid 6-digit pincode');
  const method = body.method === 'online' ? 'online' : 'cod';
  const s = allSettings();
  if (method === 'cod' && s.cod_enabled !== '1') bad('Cash on delivery is not available');
  if (method === 'online' && !(s.razorpay_enabled === '1' && s.razorpay_key_id && s.razorpay_key_secret)) bad('Online payment is not available');
  const cart = priceCart(body.items, body.coupon);
  const codFee = method === 'cod' ? num(s.cod_fee) : 0;
  const total = cart.subtotal - cart.discount + cart.shipping + codFee;
  const orderNo = 'ORD' + Date.now().toString(36).toUpperCase() + crypto.randomBytes(2).toString('hex').toUpperCase();
  let rzp = null;
  if (method === 'online') rzp = await rzpCreateOrder(Math.round(total * 100), orderNo);
  db.exec('BEGIN');
  try {
    db.prepare(`INSERT INTO orders(order_no,name,phone,email,address,city,state,pincode,items,subtotal,discount,shipping,total,coupon,method,pay_status,rzp_order_id,created) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(orderNo, c.name.trim(), c.phone.trim(), String(c.email || '').trim(), c.address.trim(), c.city.trim(), c.state.trim(), c.pincode.trim(), JSON.stringify(cart.lines), cart.subtotal, cart.discount, cart.shipping + codFee, total, cart.coupon?.code || '', method, 'pending', rzp?.id || '', Date.now());
    for (const l of cart.lines) db.prepare('UPDATE products SET stock=stock-? WHERE id=?').run(l.qty, l.id);
    if (cart.coupon) db.prepare('UPDATE coupons SET used=used+1 WHERE id=?').run(cart.coupon.id);
    db.exec('COMMIT');
  } catch (e) { db.exec('ROLLBACK'); throw e; }
  return { order_no: orderNo, total, razorpay: rzp ? { key: s.razorpay_key_id, order_id: rzp.id, amount: rzp.amount } : null };
});
route('POST', '/api/orders/verify', ({ body }) => {
  const o = db.prepare('SELECT * FROM orders WHERE order_no=?').get(String(body.order_no || ''));
  if (!o || o.method !== 'online' || o.rzp_order_id !== body.razorpay_order_id) bad('Invalid order');
  const exp = crypto.createHmac('sha256', getSetting('razorpay_key_secret')).update(o.rzp_order_id + '|' + body.razorpay_payment_id).digest('hex');
  const got = String(body.razorpay_signature || '');
  if (got.length !== exp.length || !crypto.timingSafeEqual(Buffer.from(got), Buffer.from(exp))) bad('Payment verification failed');
  db.prepare("UPDATE orders SET pay_status='paid', rzp_payment_id=? WHERE id=?").run(String(body.razorpay_payment_id), o.id);
  return { ok: true, order_no: o.order_no };
});
route('POST', '/api/orders/track', ({ body }) => {
  const o = db.prepare('SELECT * FROM orders WHERE order_no=? COLLATE NOCASE AND phone=?').get(String(body.order_no || '').trim(), String(body.phone || '').trim());
  if (!o) bad('Order not found. Check order number and phone.', 404);
  return { order_no: o.order_no, status: o.status, pay_status: o.pay_status, method: o.method, total: o.total, created: o.created, items: pj(o.items, []) };
});
route('POST', '/api/returns', ({ body }) => {
  const o = db.prepare('SELECT * FROM orders WHERE order_no=? COLLATE NOCASE AND phone=?').get(String(body.order_no || '').trim(), String(body.phone || '').trim());
  if (!o) bad('Order not found. Check order number and phone.', 404);
  if (!String(body.reason || '').trim()) bad('Please tell us the reason');
  db.prepare('INSERT INTO returns(order_no,phone,reason,created) VALUES(?,?,?,?)').run(o.order_no, o.phone, String(body.reason).slice(0, 1000), Date.now());
  return { ok: true };
});

// Admin auth
route('POST', '/api/admin/login', ({ body, ip }) => {
  const f = fails.get(ip) || { n: 0, t: 0 };
  if (f.n >= 8 && Date.now() - f.t < 15 * 60e3) bad('Too many attempts. Try again in 15 minutes.', 429);
  if (!checkPw(String(body.password || ''), getSetting('admin_hash'))) { fails.set(ip, { n: f.n + 1, t: Date.now() }); bad('Wrong password', 401); }
  fails.delete(ip);
  return { token: sign({ a: 1, exp: Date.now() + 12 * 3600e3 }), default_pw: getSetting('default_pw') === '1' };
});
route('POST', '/api/admin/password', ({ body }) => {
  if (!checkPw(String(body.current || ''), getSetting('admin_hash'))) bad('Current password is wrong');
  if (String(body.password || '').length < 8) bad('New password must be at least 8 characters');
  setSetting('admin_hash', hashPw(body.password)); setSetting('default_pw', '0'); return { ok: true };
}, true);
route('GET', '/api/admin/stats', () => {
  const g = (q, ...a) => db.prepare(q).get(...a);
  const day = Date.now() - 864e5 * 30;
  return {
    orders: g('SELECT COUNT(*) n FROM orders').n, new_orders: g("SELECT COUNT(*) n FROM orders WHERE status='new'").n,
    revenue: g("SELECT COALESCE(SUM(total),0) n FROM orders WHERE status!='cancelled' AND (pay_status='paid' OR method='cod')").n,
    revenue30: g("SELECT COALESCE(SUM(total),0) n FROM orders WHERE status!='cancelled' AND (pay_status='paid' OR method='cod') AND created>?", day).n,
    products: g('SELECT COUNT(*) n FROM products').n, low_stock: db.prepare('SELECT id,name,stock FROM products WHERE stock<=5 AND active=1 ORDER BY stock LIMIT 10').all(),
    returns: g("SELECT COUNT(*) n FROM returns WHERE status='requested'").n,
    recent: db.prepare('SELECT order_no,name,total,status,pay_status,created FROM orders ORDER BY id DESC LIMIT 8').all(),
  };
}, true);
route('GET', '/api/admin/settings', () => { const s = allSettings(); const has = !!s.razorpay_key_secret; delete s.admin_hash; delete s.token_secret; delete s.default_pw; s.razorpay_key_secret = ''; s.razorpay_has_secret = has; return s; }, true);
route('PUT', '/api/admin/settings', ({ body }) => {
  for (const k of Object.keys(DEFAULTS)) {
    if (!(k in body)) continue;
    if (k === 'razorpay_key_secret' && !String(body[k]).trim()) continue; // keep old secret
    setSetting(k, String(body[k]).slice(0, 2000));
  }
  return { ok: true };
}, true);
route('POST', '/api/admin/upload', ({ body }) => {
  const m = /^data:image\/(png|jpeg|webp|gif);base64,(.+)$/.exec(String(body.data || ''));
  if (!m) bad('Only PNG, JPG, WEBP or GIF images are allowed');
  const buf = Buffer.from(m[2], 'base64'); if (buf.length > 6 * 1024 * 1024) bad('Image must be under 6 MB');
  const name = crypto.randomBytes(8).toString('hex') + '.' + (m[1] === 'jpeg' ? 'jpg' : m[1]);
  fs.writeFileSync(path.join(UPLOAD_DIR, name), buf); return { url: '/uploads/' + name };
}, true);

// Generic CRUD for admin
function crud(table, fields, opts = {}) {
  const cols = Object.keys(fields);
  const clean = b => { const o = {}; for (const c of cols) { if (!(c in b)) continue; const t = fields[c]; let v = b[c]; if (t === 'n') v = num(v); else if (t === 'b') v = b[c] ? 1 : 0; else if (t === 'j') v = JSON.stringify(Array.isArray(v) ? v : []); else v = String(v ?? '').slice(0, 5000); o[c] = v; } return o; };
  route('GET', `/api/admin/${table}`, () => db.prepare(`SELECT * FROM ${table} ORDER BY ${opts.order || 'id DESC'}`).all().map(r => table === 'products' ? prod(r) : r), true);
  route('POST', `/api/admin/${table}`, ({ body }) => {
    const o = clean(body); if (opts.pre) opts.pre(o, body, true);
    if (table === 'products') o.created = Date.now();
    const k = Object.keys(o); try { const r = db.prepare(`INSERT INTO ${table}(${k.join(',')}) VALUES(${k.map(() => '?').join(',')})`).run(...k.map(x => o[x])); return { id: Number(r.lastInsertRowid) }; } catch (e) { bad(/UNIQUE/.test(e.message) ? 'This name/code already exists' : e.message); }
  }, true);
  route('PUT', `/api/admin/${table}/:id`, ({ body, params }) => {
    const o = clean(body); if (opts.pre) opts.pre(o, body, false); const k = Object.keys(o); if (!k.length) return { ok: true };
    try { db.prepare(`UPDATE ${table} SET ${k.map(x => x + '=?').join(',')} WHERE id=?`).run(...k.map(x => o[x]), num(params.id)); return { ok: true }; } catch (e) { bad(/UNIQUE/.test(e.message) ? 'This name/code already exists' : e.message); }
  }, true);
  route('DELETE', `/api/admin/${table}/:id`, ({ params }) => { db.prepare(`DELETE FROM ${table} WHERE id=?`).run(num(params.id)); return { ok: true }; }, true);
}
crud('categories', { name: 's', slug: 's', image: 's', sort: 'n', active: 'b' }, { order: 'sort,id', pre: (o, b, create) => { if (create || 'name' in o) { if (!o.name?.trim()) bad('Name required'); o.slug = slugify(b.slug || o.name); } } });
crud('products', { name: 's', description: 's', category_id: 'n', price: 'n', mrp: 'n', images: 'j', sizes: 'j', stock: 'n', is_combo: 'b', badge: 's', featured: 'b', active: 'b' }, { pre: (o, b, c) => { if (c && !(o.name || '').trim()) bad('Name required'); if ('price' in o && o.price <= 0) bad('Price must be greater than 0'); } });
crud('coupons', { code: 's', type: 's', value: 'n', min_order: 'n', max_discount: 'n', expires: 's', usage_limit: 'n', active: 'b' }, { pre: (o, b, c) => { if ('code' in o) { o.code = o.code.trim().toUpperCase().replace(/\s+/g, ''); if (!o.code) bad('Code required'); } if ('type' in o && !['percent', 'flat'].includes(o.type)) bad('Type must be percent or flat'); if ('value' in o && o.value <= 0) bad('Value must be greater than 0'); if (o.type === 'percent' && o.value > 100) bad('Percent cannot exceed 100'); } });
crud('banners', { image: 's', title: 's', subtitle: 's', link: 's', sort: 'n', active: 'b' }, { order: 'sort,id' });
route('GET', '/api/admin/orders', () => db.prepare('SELECT * FROM orders ORDER BY id DESC LIMIT 500').all().map(o => ({ ...o, items: pj(o.items, []) })), true);
route('PUT', '/api/admin/orders/:id', ({ body, params }) => {
  const st = ['new', 'confirmed', 'shipped', 'delivered', 'cancelled']; const ps = ['pending', 'paid', 'failed', 'refunded'];
  const o = db.prepare('SELECT * FROM orders WHERE id=?').get(num(params.id)); if (!o) bad('Not found', 404);
  const status = body.status && st.includes(body.status) ? body.status : o.status;
  const pay = body.pay_status && ps.includes(body.pay_status) ? body.pay_status : o.pay_status;
  if (status === 'cancelled' && o.status !== 'cancelled') for (const l of pj(o.items, [])) db.prepare('UPDATE products SET stock=stock+? WHERE id=?').run(l.qty, l.id);
  db.prepare('UPDATE orders SET status=?, pay_status=?, note=? WHERE id=?').run(status, pay, String(body.note ?? o.note).slice(0, 1000), o.id); return { ok: true };
}, true);
route('GET', '/api/admin/returns', () => db.prepare('SELECT * FROM returns ORDER BY id DESC').all(), true);
route('PUT', '/api/admin/returns/:id', ({ body, params }) => { if (!['requested', 'approved', 'rejected', 'refunded'].includes(body.status)) bad('Bad status'); db.prepare('UPDATE returns SET status=? WHERE id=?').run(body.status, num(params.id)); return { ok: true }; }, true);

// ---------- server ----------
function readBody(req) {
  return new Promise((res, rej) => { const ch = []; let n = 0; req.on('data', c => { n += c.length; if (n > 9e6) { rej(new HttpError(413, 'Too large')); req.destroy(); } else ch.push(c); }); req.on('end', () => { try { res(ch.length ? JSON.parse(Buffer.concat(ch).toString()) : {}); } catch { rej(new HttpError(400, 'Bad JSON')); } }); req.on('error', rej); });
}
function serveFile(res, file, cache) {
  fs.stat(file, (e, st) => {
    if (e || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': cache ? 'public, max-age=604800' : 'no-cache', 'X-Content-Type-Options': 'nosniff' });
    fs.createReadStream(file).pipe(res);
  });
}
const safeJoin = (root, p) => { const f = path.join(root, decodeURIComponent(p)); return f.startsWith(root + path.sep) || f === root ? f : null; };

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x'); const p = url.pathname;
  const ip = req.socket.remoteAddress;
  try {
    if (p.startsWith('/api/')) {
      const rt = routes.map(r => ({ r, m: r.re.exec(p) })).find(x => x.m && x.r.method === req.method);
      if (!rt) bad('Not found', 404);
      if (rt.r.admin && !verify((req.headers.authorization || '').replace('Bearer ', ''))) bad('Please log in', 401);
      const body = ['POST', 'PUT'].includes(req.method) ? await readBody(req) : {};
      const out = await rt.r.fn({ body, params: rt.m.groups || {}, query: Object.fromEntries(url.searchParams), ip });
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); return res.end(JSON.stringify(out));
    }
    if (p.startsWith('/uploads/')) { const f = safeJoin(UPLOAD_DIR, p.slice(9)); return f ? serveFile(res, f, true) : (res.writeHead(400), res.end()); }
    if (p === '/admin') { res.writeHead(302, { Location: '/admin/' }); return res.end(); }
    const isAdmin = p.startsWith('/admin/'); const root = path.join(__dirname, isAdmin ? 'admin' : 'public');
    let rel = isAdmin ? p.slice(7) : p.slice(1); if (!rel || rel.endsWith('/')) rel += 'index.html';
    const f = safeJoin(root, rel); if (!f) { res.writeHead(400); return res.end(); }
    return serveFile(res, f, false);
  } catch (e) {
    const code = e instanceof HttpError ? e.code : 500; if (code === 500) console.error(e);
    res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: code === 500 ? 'Server error' : e.message }));
  }
});
if (!process.env.NO_DEMO_DATA) require('./seed')(db, UPLOAD_DIR, setSetting);
server.listen(PORT, () => console.log(`Store running: http://localhost:${PORT}  |  Admin: http://localhost:${PORT}/admin/`));
module.exports = { db };
