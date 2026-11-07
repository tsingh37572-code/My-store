'use strict';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const inr = n => '₹' + Math.round(n).toLocaleString('en-IN');
let CFG = {}, CART = [], COUPON = null; // COUPON = {code, discount}
try { CART = JSON.parse(localStorage.getItem('cart') || '[]'); } catch { }
const saveCart = () => { try { localStorage.setItem('cart', JSON.stringify(CART)); } catch { } renderCart(); };
async function api(url, body, method) {
  const r = await fetch(url, body ? { method: method || 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined);
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Something went wrong'); return j;
}
let toastT; function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2200); }

// drawers
function openD(id) { $(id).classList.add('open'); $('#scrim').classList.add('on'); }
function closeD() { document.querySelectorAll('.drawer').forEach(d => d.classList.remove('open')); $('#scrim').classList.remove('on'); }
$('#scrim').onclick = closeD; document.querySelectorAll('[data-close]').forEach(b => b.onclick = closeD);
$('#btnMenu').onclick = () => openD('#menu'); $('#btnCart').onclick = () => { renderCart(); openD('#cart'); };
$('#btnSearch').onclick = () => { $('#searchbar').classList.toggle('open'); $('#searchInput').focus(); };
$('#searchForm').onsubmit = e => { e.preventDefault(); const q = $('#searchInput').value.trim(); if (q) { location.hash = '#/shop?q=' + encodeURIComponent(q); $('#searchbar').classList.remove('open'); } };

const sizePrice = p => { const d = p.mrp > p.price ? Math.round((1 - p.price / p.mrp) * 100) : 0; return `<div class="price">${inr(p.price)}${d ? `<s>${inr(p.mrp)}</s><em>${d}% OFF</em>` : ''}</div>`; };
const card = p => `<a class="card" href="#/p/${p.id}"><div class="im">${p.images[0] ? `<img loading="lazy" src="${esc(p.images[0])}" alt="${esc(p.name)}">` : ''}${p.stock <= 0 ? '<span class="badge">SOLD OUT</span>' : p.badge ? `<span class="badge ${p.badge === 'SALE' ? 'sale' : ''}">${esc(p.badge)}</span>` : ''}</div><h3>${esc(p.name)}</h3>${sizePrice(p)}</a>`;

// cart
const cartKey = (id, size) => id + '|' + size;
async function cartTotals() {
  // fetch fresh prices
  const out = []; let subtotal = 0;
  for (const l of CART) { out.push(l); subtotal += l.price * l.qty; }
  return { lines: out, subtotal };
}
function totals() {
  const subtotal = CART.reduce((a, l) => a + l.price * l.qty, 0);
  const discount = COUPON ? Math.min(COUPON.discount, subtotal) : 0;
  const free = Number(CFG.free_shipping_above || 0);
  const ship = CART.length === 0 ? 0 : (free && subtotal - discount >= free ? 0 : Number(CFG.shipping_fee || 0));
  return { subtotal, discount, ship, total: subtotal - discount + ship };
}
function renderCart() {
  $('#cartCount').textContent = CART.reduce((a, l) => a + l.qty, 0);
  const b = $('#cartBody');
  if (!CART.length) { b.innerHTML = `<div class="empty"><p>Your cart is empty</p><br><a class="btn sm" href="#/shop" data-go>Continue shopping</a></div>`; return; }
  const t = totals();
  b.innerHTML = `<div class="cart-lines">${CART.map((l, i) => `<div class="cl"><img src="${esc(l.image)}" alt=""><div><a href="#/p/${l.id}" data-go><b>${esc(l.name)}</b></a><br><small>${l.size ? 'Size: ' + esc(l.size) : ''}</small><br><div class="qty"><button data-q="${i}" data-d="-1">−</button><span>${l.qty}</span><button data-q="${i}" data-d="1">+</button></div></div><div style="text-align:right"><b>${inr(l.price * l.qty)}</b><br><button class="rm" data-rm="${i}">Remove</button></div></div>`).join('')}</div>
  <div class="cart-foot"><form class="coupon" id="cpForm"><input id="cpIn" placeholder="Coupon code" value="${esc(COUPON?.code || '')}"><button class="btn sm ghost">${COUPON ? 'Remove' : 'Apply'}</button></form>
  <div class="row"><span>Subtotal</span><span>${inr(t.subtotal)}</span></div>
  ${t.discount ? `<div class="row green"><span>Coupon (${esc(COUPON.code)})</span><span>− ${inr(t.discount)}</span></div>` : ''}
  <div class="row"><span>Shipping</span><span>${t.ship ? inr(t.ship) : 'FREE'}</span></div>
  <div class="row tot"><span>Total</span><span>${inr(t.total)}</span></div><br>
  <a class="btn" href="#/checkout" data-go>CHECKOUT</a></div>`;
  b.querySelectorAll('[data-q]').forEach(x => x.onclick = () => { const l = CART[+x.dataset.q]; l.qty = Math.max(1, Math.min(20, l.qty + +x.dataset.d)); COUPON = null; saveCart(); });
  b.querySelectorAll('[data-rm]').forEach(x => x.onclick = () => { CART.splice(+x.dataset.rm, 1); COUPON = null; saveCart(); });
  b.querySelectorAll('[data-go]').forEach(x => x.addEventListener('click', closeD));
  $('#cpForm').onsubmit = async e => {
    e.preventDefault();
    if (COUPON) { COUPON = null; return renderCart(); }
    const code = $('#cpIn').value.trim(); if (!code) return;
    try { const r = await api('/api/coupon/check', { code, items: CART.map(l => ({ id: l.id, size: l.size, qty: l.qty })) }); COUPON = { code: r.code, discount: r.discount }; toast('Coupon applied'); renderCart(); } catch (er) { toast(er.message); }
  };
}
function addToCart(p, size, qty = 1) {
  const k = cartKey(p.id, size), ex = CART.find(l => cartKey(l.id, l.size) === k);
  if (ex) ex.qty = Math.min(20, ex.qty + qty); else CART.push({ id: p.id, name: p.name, price: p.price, image: p.images[0] || '', size, qty });
  COUPON = null; saveCart();
}

// views
const app = $('#app');
const view = h => { app.innerHTML = h; window.scrollTo(0, 0); };
const loading = () => view('<div class="empty">Loading…</div>');

async function home() {
  loading(); const d = await api('/api/home');
  const slides = d.banners.map(b => `<a class="slide" href="${esc(b.link || '#/shop')}"><img src="${esc(b.image)}" alt="${esc(b.title)}">${b.title || b.subtitle ? `<div class="cap"><h1>${esc(b.title)}</h1><p>${esc(b.subtitle)}</p><span class="cta">${esc(CFG.hero_cta || 'SHOP NOW')}</span></div>` : ''}</a>`).join('');
  view(`${d.banners.length ? `<div class="slider"><div class="slides" id="slides">${slides}</div><div class="dots" id="dots">${d.banners.map((_, i) => `<i class="${i ? '' : 'on'}"></i>`).join('')}</div></div>` : ''}
  <div class="wrap">
  ${d.categories.length ? `<section class="sec"><h2>Shop by Category</h2><div class="cats">${d.categories.map(c => `<a class="cat" href="#/shop?category=${esc(c.slug)}">${c.image ? `<img loading="lazy" src="${esc(c.image)}" alt="">` : ''}${esc(c.name)}</a>`).join('')}</div></section>` : ''}
  ${d.combos.length ? `<section class="sec"><div class="sec-h"><h2>Combos</h2><a href="#/shop?combo=1">View all</a></div><div class="hscroll">${d.combos.map(card).join('')}</div></section>` : ''}
  ${d.featured.length ? `<section class="sec"><div class="sec-h"><h2>Best Sellers</h2><a href="#/shop">View all</a></div><div class="grid">${d.featured.map(card).join('')}</div></section>` : ''}
  <div class="trust"><div><b>Free shipping</b>above ${inr(CFG.free_shipping_above || 0)}</div><div><b>Easy returns</b>${esc(CFG.return_days)} day policy</div><div><b>Secure payment</b>UPI, cards, COD</div></div></div>`);
  const s = $('#slides'); if (s && d.banners.length > 1) {
    const dots = [...document.querySelectorAll('#dots i')];
    s.onscroll = () => { const i = Math.round(s.scrollLeft / s.clientWidth); dots.forEach((x, j) => x.classList.toggle('on', i === j)); };
    clearInterval(window._sl); window._sl = setInterval(() => { if (!document.body.contains(s)) return clearInterval(window._sl); const n = (Math.round(s.scrollLeft / s.clientWidth) + 1) % d.banners.length; s.scrollTo({ left: n * s.clientWidth, behavior: 'smooth' }); }, 4500);
  }
}
async function shop(q) {
  loading(); const cats = (await api('/api/home')).categories;
  const qs = new URLSearchParams(q); const prods = await api('/api/products?' + qs);
  const cur = qs.get('category') || '';
  const mk = (extra) => { const n = new URLSearchParams(q); for (const k in extra) extra[k] ? n.set(k, extra[k]) : n.delete(k); return '#/shop?' + n; };
  view(`<div class="wrap"><div class="chips"><a class="chip ${!cur && !qs.get('combo') ? 'on' : ''}" href="#/shop">All</a>${cats.map(c => `<a class="chip ${cur === c.slug ? 'on' : ''}" href="#/shop?category=${esc(c.slug)}">${esc(c.name)}</a>`).join('')}</div>
  <div class="bar"><span>${qs.get('q') ? `Results for “${esc(qs.get('q'))}” · ` : ''}${prods.length} products</span><select class="sel" id="sortSel"><option value="">Newest</option><option value="low" ${qs.get('sort') === 'low' ? 'selected' : ''}>Price: Low to High</option><option value="high" ${qs.get('sort') === 'high' ? 'selected' : ''}>Price: High to Low</option></select></div>
  ${prods.length ? `<div class="grid">${prods.map(card).join('')}</div>` : '<div class="empty">No products found.</div>'}</div>`);
  $('#sortSel').onchange = e => { location.hash = mk({ sort: e.target.value }); };
}
async function pdp(id) {
  loading(); let p; try { p = await api('/api/products/' + id); } catch { return view('<div class="empty">Product not found.</div>'); }
  let size = '', qty = 1, img = 0;
  const draw = () => {
    view(`<div class="wrap"><div class="pdp"><div class="gal"><div class="main">${p.images[img] ? `<img src="${esc(p.images[img])}" alt="${esc(p.name)}">` : ''}</div>${p.images.length > 1 ? `<div class="thumbs">${p.images.map((u, i) => `<img data-i="${i}" class="${i === img ? 'on' : ''}" src="${esc(u)}" alt="">`).join('')}</div>` : ''}</div>
    <div><h1>${esc(p.name)}</h1>${sizePrice(p)}<small style="color:var(--muted)">Inclusive of all taxes</small>
    ${p.sizes.length ? `<div style="margin-top:16px" class="lbl">Select size</div><div class="sizes">${p.sizes.map(s => `<button class="sz ${s === size ? 'on' : ''}" data-s="${esc(s)}">${esc(s)}</button>`).join('')}</div>` : '<br>'}
    <div class="actions">${p.stock > 0 ? `<button class="btn" id="add">ADD TO CART</button><button class="btn ghost" id="buy">BUY NOW</button>` : '<button class="btn" disabled>SOLD OUT</button>'}</div>
    ${p.stock > 0 && p.stock <= 5 ? `<p style="color:var(--sale);margin-top:10px;font-weight:600">Only ${p.stock} left!</p>` : ''}
    <p class="desc">${esc(p.description)}</p></div></div></div>`);
    document.querySelectorAll('[data-i]').forEach(x => x.onclick = () => { img = +x.dataset.i; draw(); });
    document.querySelectorAll('[data-s]').forEach(x => x.onclick = () => { size = x.dataset.s; draw(); });
    const need = () => { if (p.sizes.length && !size) { toast('Please select a size'); return false; } return true; };
    if ($('#add')) { $('#add').onclick = () => { if (need()) { addToCart(p, size, qty); toast('Added to cart'); } }; $('#buy').onclick = () => { if (need()) { addToCart(p, size, qty); location.hash = '#/checkout'; } }; }
  }; draw(); document.title = p.name + ' | ' + CFG.store_name;
}
function checkout() {
  if (!CART.length) { location.hash = '#/shop'; return; }
  const t = totals(); const cod = CFG.cod_enabled, onl = CFG.online_enabled;
  let method = onl ? 'online' : 'cod';
  const codFee = Number(CFG.cod_fee || 0);
  view(`<form class="form" id="co"><h1>Checkout</h1>
  <div class="fld"><label>Full name</label><input name="name" required autocomplete="name"></div>
  <div class="two"><div class="fld"><label>Mobile</label><input name="phone" required inputmode="numeric" maxlength="10" pattern="[6-9][0-9]{9}" autocomplete="tel"></div><div class="fld"><label>Email (optional)</label><input name="email" type="email" autocomplete="email"></div></div>
  <div class="fld"><label>Address</label><textarea name="address" rows="2" required autocomplete="street-address"></textarea></div>
  <div class="two"><div class="fld"><label>City</label><input name="city" required></div><div class="fld"><label>State</label><input name="state" required></div></div>
  <div class="fld"><label>Pincode</label><input name="pincode" required inputmode="numeric" maxlength="6" pattern="[0-9]{6}"></div>
  <div class="lbl" style="margin:16px 0 8px">Payment</div><div id="pays">
  ${onl ? `<label class="pay" data-m="online"><input type="radio" name="m"><div><b>Pay online</b><br><small>UPI, cards, netbanking, wallets</small></div></label>` : ''}
  ${cod ? `<label class="pay" data-m="cod"><input type="radio" name="m"><div><b>Cash on delivery</b><br><small>${codFee ? 'Extra ' + inr(codFee) + ' COD fee' : 'Pay when you receive'}</small></div></label>` : ''}
  ${!onl && !cod ? '<div class="err">No payment method is available right now.</div>' : ''}</div>
  <div class="box"><b>Order summary</b><br>${CART.map(l => `<div class="row"><span>${esc(l.name)}${l.size ? ' (' + esc(l.size) + ')' : ''} × ${l.qty}</span><span>${inr(l.price * l.qty)}</span></div>`).join('')}<hr style="border:0;border-top:1px solid var(--line);margin:8px 0">
  <div class="row"><span>Subtotal</span><span>${inr(t.subtotal)}</span></div>${t.discount ? `<div class="row green"><span>Coupon ${esc(COUPON.code)}</span><span>− ${inr(t.discount)}</span></div>` : ''}
  <div class="row"><span>Shipping</span><span>${t.ship ? inr(t.ship) : 'FREE'}</span></div><div class="row" id="codRow"></div><div class="row tot"><span>Total</span><span id="grand"></span></div></div>
  <div id="msg"></div><button class="btn" id="place">PLACE ORDER</button></form>`);
  const upd = () => { document.querySelectorAll('.pay').forEach(p => { const on = p.dataset.m === method; p.classList.toggle('on', on); p.querySelector('input').checked = on; });
    const f = method === 'cod' ? codFee : 0; $('#codRow').innerHTML = f ? `<span>COD fee</span><span>${inr(f)}</span>` : ''; $('#grand').textContent = inr(t.total + f); $('#place').textContent = method === 'online' ? 'PAY ' + inr(t.total + f) : 'PLACE ORDER'; };
  document.querySelectorAll('.pay').forEach(p => p.onclick = () => { method = p.dataset.m; upd(); });
  if (!onl) method = 'cod'; upd();
  $('#co').onsubmit = async e => {
    e.preventDefault(); const btn = $('#place'); btn.disabled = true; $('#msg').innerHTML = '';
    const f = Object.fromEntries(new FormData(e.target)); delete f.m;
    try {
      const r = await api('/api/orders', { customer: f, items: CART.map(l => ({ id: l.id, size: l.size, qty: l.qty })), coupon: COUPON?.code || '', method });
      if (r.razorpay) await payOnline(r, f); else done(r.order_no);
    } catch (er) { $('#msg').innerHTML = `<div class="err">${esc(er.message)}</div>`; btn.disabled = false; }
  };
}
function loadRzp() { return new Promise((res, rej) => { if (window.Razorpay) return res(); const s = document.createElement('script'); s.src = 'https://checkout.razorpay.com/v1/checkout.js'; s.onload = res; s.onerror = () => rej(new Error('Could not load payment window. Check your internet.')); document.head.appendChild(s); }); }
async function payOnline(r, f) {
  await loadRzp();
  await new Promise((resolve, reject) => {
    const rz = new Razorpay({ key: r.razorpay.key, amount: r.razorpay.amount, currency: 'INR', name: CFG.store_name, order_id: r.razorpay.order_id, prefill: { name: f.name, contact: f.phone, email: f.email },
      handler: async resp => { try { await api('/api/orders/verify', { order_no: r.order_no, ...resp }); done(r.order_no); resolve(); } catch (e) { reject(e); } },
      modal: { ondismiss: () => reject(new Error('Payment was cancelled. Your order is saved as unpaid; please try again.')) } });
    rz.open();
  });
}
function done(no) { CART = []; COUPON = null; saveCart(); location.hash = '#/done/' + no; }
function doneView(no) { view(`<div class="form" style="text-align:center;padding-top:50px"><div style="font-size:54px">✅</div><h1>Order placed!</h1><p>Thank you. Your order number is</p><h2 style="margin:8px 0 14px;letter-spacing:.06em">${esc(no)}</h2><p style="color:var(--muted)">Save this number. Use it with your mobile number to track your order.</p><br><a class="btn" href="#/track">Track order</a><br><a class="btn ghost" href="#/shop">Continue shopping</a></div>`); }
function track() {
  view(`<form class="form" id="tf"><h1>Track your order</h1><div class="fld"><label>Order number</label><input name="order_no" required></div><div class="fld"><label>Mobile number</label><input name="phone" required inputmode="numeric" maxlength="10"></div><div id="msg"></div><button class="btn">TRACK</button></form>`);
  $('#tf').onsubmit = async e => { e.preventDefault(); try { const o = await api('/api/orders/track', Object.fromEntries(new FormData(e.target)));
    $('#msg').innerHTML = `<div class="box"><b>${esc(o.order_no)}</b> <span class="status">${esc(o.status)}</span><br><small>Payment: ${esc(o.method.toUpperCase())} · ${esc(o.pay_status)}</small>${o.items.map(l => `<div class="row"><span>${esc(l.name)} ${l.size ? '(' + esc(l.size) + ')' : ''} × ${l.qty}</span></div>`).join('')}<div class="row tot"><span>Total</span><span>${inr(o.total)}</span></div></div>`; } catch (er) { $('#msg').innerHTML = `<div class="err">${esc(er.message)}</div>`; } };
}
function returns() {
  view(`<form class="form" id="rf"><h1>Return order</h1><p style="color:var(--muted);margin-bottom:14px">Returns accepted within ${esc(CFG.return_days)} days of delivery.</p><div class="fld"><label>Order number</label><input name="order_no" required></div><div class="fld"><label>Mobile number</label><input name="phone" required inputmode="numeric" maxlength="10"></div><div class="fld"><label>Reason</label><textarea name="reason" rows="3" required></textarea></div><div id="msg"></div><button class="btn">SUBMIT REQUEST</button></form>`);
  $('#rf').onsubmit = async e => { e.preventDefault(); try { await api('/api/returns', Object.fromEntries(new FormData(e.target))); $('#msg').innerHTML = '<div class="ok">Return request received. We will contact you soon.</div>'; e.target.reset(); } catch (er) { $('#msg').innerHTML = `<div class="err">${esc(er.message)}</div>`; } };
}

async function route() {
  closeD(); document.title = CFG.store_name || 'Store';
  const h = location.hash.slice(1) || '/'; const [pathPart, qs] = h.split('?');
  try {
    if (pathPart === '/') await home();
    else if (pathPart === '/shop') await shop(qs || '');
    else if (pathPart.startsWith('/p/')) await pdp(pathPart.slice(3));
    else if (pathPart === '/checkout') checkout();
    else if (pathPart.startsWith('/done/')) doneView(decodeURIComponent(pathPart.slice(6)));
    else if (pathPart === '/track') track();
    else if (pathPart === '/return') returns();
    else await home();
  } catch (e) { view(`<div class="empty">${esc(e.message)}</div>`); }
}
(async function init() {
  CFG = await api('/api/config');
  document.documentElement.style.setProperty('--accent', CFG.accent || '#111');
  document.title = CFG.store_name; $('#logo').textContent = CFG.store_name; $('#announce').textContent = CFG.announcement;
  const cats = (await api('/api/home')).categories;
  $('#menuLinks').innerHTML = `<a href="#/">Home</a>${cats.map(c => `<a href="#/shop?category=${esc(c.slug)}">${esc(c.name)}</a>`).join('')}<a href="#/track">Track order</a><a href="#/return">↩ Return order</a>`;
  $('#foot').innerHTML = `<div class="in"><div><b>${esc(CFG.store_name)}</b>${esc(CFG.tagline)}<br><small>${esc(CFG.footer_text)}</small></div><div><b>HELP</b><a href="#/track">Track order</a><a href="#/return">Return order</a></div><div><b>CONTACT</b>${CFG.contact_phone ? `<a href="tel:${esc(CFG.contact_phone)}">${esc(CFG.contact_phone)}</a>` : ''}${CFG.contact_email ? `<a href="mailto:${esc(CFG.contact_email)}">${esc(CFG.contact_email)}</a>` : ''}<span>${esc(CFG.address)}</span></div></div>`;
  renderCart(); window.addEventListener('hashchange', route); route();
})();
