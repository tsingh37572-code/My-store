'use strict';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const inr = n => '₹' + Math.round(n || 0).toLocaleString('en-IN');
const dt = t => new Date(t).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
let TOKEN = ''; try { TOKEN = sessionStorage.getItem('tok') || ''; } catch { }
async function api(url, body, method) {
  const r = await fetch(url, { method: method || (body ? 'POST' : 'GET'), headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && url !== '/api/admin/login') { logout(); throw new Error(j.error); }
  if (!r.ok) throw new Error(j.error || 'Error'); return j;
}
function logout() { TOKEN = ''; try { sessionStorage.removeItem('tok'); } catch { } $('#layout').classList.remove('on'); $('#login').style.display = ''; }
$('#logout').onclick = logout; $('#mb').onclick = () => $('#side').classList.toggle('open');
async function doLogin() {
  try { const r = await api('/api/admin/login', { password: $('#pw').value }); TOKEN = r.token; try { sessionStorage.setItem('tok', TOKEN); } catch { } start(r.default_pw); } catch (e) { $('#lmsg').innerHTML = `<div class="msg e">${esc(e.message)}</div>`; }
}
$('#lbtn').onclick = doLogin; $('#pw').onkeydown = e => { if (e.key === 'Enter') doLogin(); };

const TABS = [['dash', '📊 Dashboard'], ['orders', '📦 Orders'], ['products', '👕 Products'], ['categories', '🗂 Categories'], ['coupons', '🏷 Coupons'], ['banners', '🖼 Banners'], ['returns', '↩ Returns'], ['settings', '⚙ Settings & Payment']];
let cats = [], tab = 'dash';
async function start(defaultPw) {
  $('#login').style.display = 'none'; $('#layout').classList.add('on');
  $('#nav').innerHTML = TABS.map(([k, l]) => `<a data-t="${k}">${l}</a>`).join('');
  document.querySelectorAll('[data-t]').forEach(a => a.onclick = () => { go(a.dataset.t); $('#side').classList.remove('open'); });
  try { const s = await api('/api/admin/settings'); $('#brand').textContent = s.store_name + ' · ADMIN'; } catch { }
  go(defaultPw ? 'settings' : 'dash');
  if (defaultPw) setTimeout(() => alert('You are using the default password. Please change it now under Settings → Change password.'), 300);
}
async function go(t) {
  tab = t; document.querySelectorAll('[data-t]').forEach(a => a.classList.toggle('on', a.dataset.t === t));
  $('#title').textContent = TABS.find(x => x[0] === t)[1].slice(2); $('#actions').innerHTML = ''; $('#content').innerHTML = '<p>Loading…</p>';
  try { cats = await api('/api/admin/categories'); await VIEWS[t](); } catch (e) { $('#content').innerHTML = `<div class="msg e">${esc(e.message)}</div>`; }
}

// ---------- modal form builder ----------
function openForm(title, fields, data, onSave, onDelete) {
  const v = { ...data };
  const m = $('#mbox');
  const fieldHtml = f => {
    const val = v[f.k]; const id = 'f_' + f.k;
    if (f.t === 'chk') return `<div class="f chk"><input type="checkbox" id="${id}" ${val ? 'checked' : ''}><label for="${id}" style="margin:0;font-size:13px;color:var(--ink)">${f.l}</label></div>`;
    if (f.t === 'images') return `<div class="f"><label>${f.l}</label><div class="imgs" id="${id}"></div><input type="file" accept="image/*" multiple id="${id}_u" style="margin-top:8px"><div class="hint">${f.h || ''}</div></div>`;
    if (f.t === 'image') return `<div class="f"><label>${f.l}</label><div class="imgs" id="${id}"></div><input type="file" accept="image/*" id="${id}_u" style="margin-top:8px"><div class="hint">${f.h || ''}</div></div>`;
    let inp;
    if (f.t === 'ta') inp = `<textarea id="${id}" rows="4">${esc(val)}</textarea>`;
    else if (f.t === 'sel') inp = `<select id="${id}">${f.o.map(([a, b]) => `<option value="${esc(a)}" ${String(val) === String(a) ? 'selected' : ''}>${esc(b)}</option>`).join('')}</select>`;
    else if (f.t === 'csv') inp = `<input type="text" id="${id}" value="${esc((val || []).join(', '))}">`;
    else inp = `<input type="${f.t || 'text'}" id="${id}" value="${esc(val ?? '')}" ${f.t === 'number' ? 'step="any"' : ''} ${f.ph ? `placeholder="${esc(f.ph)}"` : ''}>`;
    return `<div class="f"><label>${f.l}</label>${inp}${f.h ? `<div class="hint">${f.h}</div>` : ''}</div>`;
  };
  m.innerHTML = `<h2>${esc(title)}</h2><div class="grid2">${fields.map(f => f.full || f.t === 'ta' || f.t === 'images' || f.t === 'image' || f.t === 'chk' ? '' : fieldHtml(f)).join('')}</div>${fields.filter(f => f.full || f.t === 'ta' || f.t === 'images' || f.t === 'image' || f.t === 'chk').map(fieldHtml).join('')}<div id="fmsg"></div><div style="display:flex;gap:8px;justify-content:space-between;margin-top:8px"><div>${onDelete ? '<button class="btn red" id="fdel">Delete</button>' : ''}</div><div style="display:flex;gap:8px"><button class="btn sec" id="fcancel">Cancel</button><button class="btn" id="fsave">Save</button></div></div>`;
  $('#modal').classList.add('on');
  const drawImgs = f => { const el = $('#f_' + f.k); const arr = f.t === 'images' ? (v[f.k] || []) : (v[f.k] ? [v[f.k]] : []); el.innerHTML = arr.map((u, i) => `<div><img src="${esc(u)}"><button data-rm="${i}">×</button></div>`).join(''); el.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { if (f.t === 'images') v[f.k].splice(+b.dataset.rm, 1); else v[f.k] = ''; drawImgs(f); }); };
  for (const f of fields.filter(f => f.t === 'images' || f.t === 'image')) {
    if (f.t === 'images' && !Array.isArray(v[f.k])) v[f.k] = []; drawImgs(f);
    $('#f_' + f.k + '_u').onchange = async e => {
      const files = [...e.target.files]; $('#fmsg').innerHTML = '<div class="msg o">Uploading…</div>';
      try { for (const file of files) { const url = await uploadImg(file); if (f.t === 'images') v[f.k].push(url); else v[f.k] = url; } $('#fmsg').innerHTML = ''; drawImgs(f); } catch (er) { $('#fmsg').innerHTML = `<div class="msg e">${esc(er.message)}</div>`; }
      e.target.value = '';
    };
  }
  $('#fcancel').onclick = () => $('#modal').classList.remove('on');
  if (onDelete) $('#fdel').onclick = async () => { if (confirm('Delete permanently?')) { try { await onDelete(); $('#modal').classList.remove('on'); go(tab); } catch (e) { $('#fmsg').innerHTML = `<div class="msg e">${esc(e.message)}</div>`; } } };
  $('#fsave').onclick = async () => {
    const out = { ...v };
    for (const f of fields) { if (f.t === 'images' || f.t === 'image') continue; const el = $('#f_' + f.k); if (!el) continue; out[f.k] = f.t === 'chk' ? el.checked : f.t === 'csv' ? el.value.split(',').map(s => s.trim()).filter(Boolean) : f.t === 'number' ? Number(el.value || 0) : el.value; }
    try { await onSave(out); $('#modal').classList.remove('on'); go(tab); } catch (e) { $('#fmsg').innerHTML = `<div class="msg e">${esc(e.message)}</div>`; }
  };
}
$('#modal').onclick = e => { if (e.target.id === 'modal') $('#modal').classList.remove('on'); };
function uploadImg(file) { // resize to max 1600px, JPEG
  return new Promise((res, rej) => {
    const rd = new FileReader(); rd.onerror = () => rej(new Error('Could not read file'));
    rd.onload = () => { const im = new Image(); im.onerror = () => rej(new Error('Not a valid image')); im.onload = async () => {
      const k = Math.min(1, 1600 / Math.max(im.width, im.height)); const c = document.createElement('canvas'); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
      c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
      try { res((await api('/api/admin/upload', { data: c.toDataURL('image/jpeg', 0.86) })).url); } catch (e) { rej(e); } }; im.src = rd.result; };
    rd.readAsDataURL(file);
  });
}
const table = (heads, rows) => `<div class="tw"><table><thead><tr>${heads.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('') || `<tr><td colspan="${heads.length}" style="text-align:center;color:var(--mut);padding:30px">Nothing here yet</td></tr>`}</tbody></table></div>`;
const yn = b => b ? '<span class="pill g">yes</span>' : '<span class="pill">no</span>';
const bindRows = fn => document.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => fn(+b.dataset.edit));
const addBtn = (label, fn) => { $('#actions').innerHTML = `<button class="btn" id="addb">+ ${label}</button>`; $('#addb').onclick = fn; };

// ---------- views ----------
const VIEWS = {
  async dash() {
    const s = await api('/api/admin/stats');
    $('#content').innerHTML = `<div class="stats"><div class="stat"><span>Revenue (30 days)</span><b>${inr(s.revenue30)}</b></div><div class="stat"><span>Total revenue</span><b>${inr(s.revenue)}</b></div><div class="stat"><span>New orders</span><b>${s.new_orders}</b></div><div class="stat"><span>All orders</span><b>${s.orders}</b></div><div class="stat"><span>Products</span><b>${s.products}</b></div><div class="stat"><span>Return requests</span><b>${s.returns}</b></div></div>
    <div class="card"><b>Recent orders</b><br><br>${table(['Order', 'Customer', 'Total', 'Status', 'Payment', 'Date'], s.recent.map(o => `<tr><td>${esc(o.order_no)}</td><td>${esc(o.name)}</td><td>${inr(o.total)}</td><td><span class="pill">${esc(o.status)}</span></td><td><span class="pill ${o.pay_status === 'paid' ? 'g' : 'y'}">${esc(o.pay_status)}</span></td><td>${dt(o.created)}</td></tr>`))}</div>
    <div class="card"><b>Low stock</b><br><br>${s.low_stock.length ? s.low_stock.map(p => `<div>${esc(p.name)} — <span class="pill r">${p.stock} left</span></div>`).join('') : 'All good ✔'}</div>`;
  },
  async orders() {
    const list = await api('/api/admin/orders'); window._orders = list;
    $('#content').innerHTML = table(['Order', 'Date', 'Customer', 'Total', 'Method', 'Payment', 'Status', ''], list.map(o => `<tr><td><b>${esc(o.order_no)}</b></td><td>${dt(o.created)}</td><td>${esc(o.name)}<br><small>${esc(o.phone)}</small></td><td>${inr(o.total)}</td><td>${esc(o.method.toUpperCase())}</td><td><span class="pill ${o.pay_status === 'paid' ? 'g' : 'y'}">${esc(o.pay_status)}</span></td><td><span class="pill ${o.status === 'cancelled' ? 'r' : o.status === 'delivered' ? 'g' : ''}">${esc(o.status)}</span></td><td><button class="btn sm sec" data-edit="${o.id}">Open</button></td></tr>`));
    bindRows(id => { const o = list.find(x => x.id === id); const m = $('#mbox');
      m.innerHTML = `<h2>${esc(o.order_no)}</h2><p><b>${esc(o.name)}</b> · ${esc(o.phone)} ${o.email ? '· ' + esc(o.email) : ''}</p><p>${esc(o.address)}, ${esc(o.city)}, ${esc(o.state)} - ${esc(o.pincode)}</p><br>${o.items.map(l => `<div style="display:flex;justify-content:space-between"><span>${esc(l.name)} ${l.size ? '(' + esc(l.size) + ')' : ''} × ${l.qty}</span><span>${inr(l.price * l.qty)}</span></div>`).join('')}<hr style="margin:10px 0;border:0;border-top:1px solid var(--line)"><div style="display:flex;justify-content:space-between"><span>Subtotal</span><span>${inr(o.subtotal)}</span></div>${o.discount ? `<div style="display:flex;justify-content:space-between"><span>Coupon ${esc(o.coupon)}</span><span>− ${inr(o.discount)}</span></div>` : ''}<div style="display:flex;justify-content:space-between"><span>Shipping/fees</span><span>${inr(o.shipping)}</span></div><div style="display:flex;justify-content:space-between"><b>Total</b><b>${inr(o.total)}</b></div>${o.rzp_payment_id ? `<p style="margin-top:6px"><small>Razorpay payment: ${esc(o.rzp_payment_id)}</small></p>` : ''}<br>
      <div class="grid2"><div class="f"><label>Order status</label><select id="os">${['new', 'confirmed', 'shipped', 'delivered', 'cancelled'].map(s => `<option ${s === o.status ? 'selected' : ''}>${s}</option>`).join('')}</select></div><div class="f"><label>Payment status</label><select id="ps">${['pending', 'paid', 'failed', 'refunded'].map(s => `<option ${s === o.pay_status ? 'selected' : ''}>${s}</option>`).join('')}</select></div></div><div class="f"><label>Internal note (tracking ID etc.)</label><input type="text" id="on" value="${esc(o.note)}"></div><div id="fmsg"></div><div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn sec" id="fcancel">Close</button><button class="btn" id="fsave">Update</button></div>`;
      $('#modal').classList.add('on'); $('#fcancel').onclick = () => $('#modal').classList.remove('on');
      $('#fsave').onclick = async () => { try { await api('/api/admin/orders/' + id, { status: $('#os').value, pay_status: $('#ps').value, note: $('#on').value }, 'PUT'); $('#modal').classList.remove('on'); go('orders'); } catch (e) { $('#fmsg').innerHTML = `<div class="msg e">${esc(e.message)}</div>`; } };
    });
  },
  async products() {
    const list = await api('/api/admin/products'); const cn = id => (cats.find(c => c.id === id) || {}).name || '—';
    addBtn('Add product', () => pForm());
    $('#content').innerHTML = table(['', 'Name', 'Category', 'Price', 'MRP', 'Stock', 'Combo', 'Featured', 'Active', ''], list.map(p => `<tr><td>${p.images[0] ? `<img src="${esc(p.images[0])}">` : ''}</td><td><b>${esc(p.name)}</b></td><td>${esc(cn(p.category_id))}</td><td>${inr(p.price)}</td><td>${p.mrp ? inr(p.mrp) : '—'}</td><td>${p.stock <= 5 ? `<span class="pill r">${p.stock}</span>` : p.stock}</td><td>${yn(p.is_combo)}</td><td>${yn(p.featured)}</td><td>${yn(p.active)}</td><td><button class="btn sm sec" data-edit="${p.id}">Edit</button></td></tr>`));
    bindRows(id => pForm(list.find(p => p.id === id)));
  },
  async categories() {
    const list = cats; addBtn('Add category', () => cForm());
    $('#content').innerHTML = table(['', 'Name', 'Slug', 'Order', 'Active', ''], list.map(c => `<tr><td>${c.image ? `<img src="${esc(c.image)}">` : ''}</td><td><b>${esc(c.name)}</b></td><td>${esc(c.slug)}</td><td>${c.sort}</td><td>${yn(c.active)}</td><td><button class="btn sm sec" data-edit="${c.id}">Edit</button></td></tr>`));
    bindRows(id => cForm(list.find(c => c.id === id)));
  },
  async coupons() {
    const list = await api('/api/admin/coupons'); addBtn('Add coupon', () => kForm());
    $('#content').innerHTML = table(['Code', 'Discount', 'Min order', 'Max discount', 'Expires', 'Used', 'Active', ''], list.map(c => `<tr><td><b>${esc(c.code)}</b></td><td>${c.type === 'percent' ? c.value + '%' : inr(c.value)}</td><td>${c.min_order ? inr(c.min_order) : '—'}</td><td>${c.max_discount ? inr(c.max_discount) : '—'}</td><td>${esc(c.expires) || 'never'}</td><td>${c.used}${c.usage_limit ? ' / ' + c.usage_limit : ''}</td><td>${yn(c.active)}</td><td><button class="btn sm sec" data-edit="${c.id}">Edit</button></td></tr>`));
    bindRows(id => kForm(list.find(c => c.id === id)));
  },
  async banners() {
    const list = await api('/api/admin/banners'); addBtn('Add banner', () => bForm());
    $('#content').innerHTML = table(['', 'Title', 'Subtitle', 'Link', 'Order', 'Active', ''], list.map(b => `<tr><td>${b.image ? `<img src="${esc(b.image)}">` : ''}</td><td>${esc(b.title)}</td><td>${esc(b.subtitle)}</td><td>${esc(b.link)}</td><td>${b.sort}</td><td>${yn(b.active)}</td><td><button class="btn sm sec" data-edit="${b.id}">Edit</button></td></tr>`));
    bindRows(id => bForm(list.find(b => b.id === id)));
  },
  async returns() {
    const list = await api('/api/admin/returns');
    $('#content').innerHTML = table(['Date', 'Order', 'Phone', 'Reason', 'Status', ''], list.map(r => `<tr><td>${dt(r.created)}</td><td>${esc(r.order_no)}</td><td>${esc(r.phone)}</td><td style="white-space:normal;max-width:300px">${esc(r.reason)}</td><td><select data-r="${r.id}">${['requested', 'approved', 'rejected', 'refunded'].map(s => `<option ${s === r.status ? 'selected' : ''}>${s}</option>`).join('')}</select></td><td></td></tr>`));
    document.querySelectorAll('[data-r]').forEach(s => s.onchange = async () => { try { await api('/api/admin/returns/' + s.dataset.r, { status: s.value }, 'PUT'); } catch (e) { alert(e.message); } });
  },
  async settings() {
    const s = await api('/api/admin/settings'); const sec = (id, name) => `<button data-sec="${id}">${name}</button>`;
    $('#content').innerHTML = `<div class="tabs">${sec('store', 'Store details')}${sec('pay', 'Payment gateway')}${sec('ship', 'Shipping & returns')}${sec('pw', 'Change password')}</div><div class="card" id="secbox"></div>`;
    const F = (k, l, extra = '') => `<div class="f"><label>${l}</label><input type="${extra.includes('pw') ? 'password' : 'text'}" data-k="${k}" value="${esc(s[k])}" ${extra.includes('ph') ? '' : ''}></div>`;
    const C = (k, l) => `<div class="f chk"><input type="checkbox" data-k="${k}" data-b="1" id="c_${k}" ${s[k] === '1' ? 'checked' : ''}><label for="c_${k}" style="margin:0;color:var(--ink);font-size:13px">${l}</label></div>`;
    const S = {
      store: `${F('store_name', 'Store name (shown as logo)')}${F('tagline', 'Tagline')}${F('announcement', 'Top announcement bar text (empty = hide)')}${F('hero_cta', 'Banner button text')}<div class="f"><label>Accent colour (buttons, bars)</label><input type="color" data-k="accent" value="${esc(s.accent)}" style="width:80px;height:36px"></div>${F('contact_phone', 'Contact phone')}${F('contact_email', 'Contact email')}${F('address', 'Address')}${F('footer_text', 'Footer text')}`,
      pay: `<h3 style="margin-bottom:8px">Cash on delivery</h3>${C('cod_enabled', 'Enable Cash on Delivery')}${F('cod_fee', 'COD extra fee (₹)')}<hr style="margin:16px 0;border:0;border-top:1px solid var(--line)"><h3 style="margin-bottom:8px">Razorpay (online payments)</h3><p style="color:var(--mut);margin-bottom:10px">Create a free Razorpay account → Settings → API Keys → copy Key ID and Key Secret here. Use <b>Test mode</b> keys first (rzp_test_…).</p>${C('razorpay_enabled', 'Enable online payment')}${F('razorpay_key_id', 'Key ID')}<div class="f"><label>Key Secret ${s.razorpay_has_secret ? '<span class="pill g">saved</span>' : ''}</label><input type="password" data-k="razorpay_key_secret" placeholder="${s.razorpay_has_secret ? 'Leave blank to keep the saved secret' : ''}" autocomplete="new-password"></div>`,
      ship: `${F('shipping_fee', 'Shipping fee (₹)')}${F('free_shipping_above', 'Free shipping above (₹, 0 = never free)')}${F('return_days', 'Return window (days)')}`,
    };
    const show = id => {
      document.querySelectorAll('[data-sec]').forEach(b => b.classList.toggle('on', b.dataset.sec === id));
      if (id === 'pw') { $('#secbox').innerHTML = `<div class="f"><label>Current password</label><input type="password" id="pw0"></div><div class="f"><label>New password (min 8 characters)</label><input type="password" id="pw1"></div><div id="smsg"></div><button class="btn" id="pwb">Change password</button>`;
        $('#pwb').onclick = async () => { try { await api('/api/admin/password', { current: $('#pw0').value, password: $('#pw1').value }); $('#smsg').innerHTML = '<div class="msg o">Password changed ✔</div>'; } catch (e) { $('#smsg').innerHTML = `<div class="msg e">${esc(e.message)}</div>`; } }; return; }
      $('#secbox').innerHTML = S[id] + '<div id="smsg"></div><button class="btn" id="sb">Save changes</button>';
      $('#sb').onclick = async () => { const o = {}; $('#secbox').querySelectorAll('[data-k]').forEach(el => o[el.dataset.k] = el.dataset.b ? (el.checked ? '1' : '0') : el.value);
        try { await api('/api/admin/settings', o, 'PUT'); Object.assign(s, o); $('#smsg').innerHTML = '<div class="msg o">Saved ✔</div>'; if (o.store_name) $('#brand').textContent = o.store_name + ' · ADMIN'; if (id === 'pay') { s.razorpay_has_secret = s.razorpay_has_secret || !!o.razorpay_key_secret; s.razorpay_key_secret = ''; } } catch (e) { $('#smsg').innerHTML = `<div class="msg e">${esc(e.message)}</div>`; } };
    };
    document.querySelectorAll('[data-sec]').forEach(b => b.onclick = () => show(b.dataset.sec)); show('store');
  },
};

// ---------- entity forms ----------
const save = (base, id) => d => id ? api(base + '/' + id, d, 'PUT') : api(base, d);
function pForm(p) {
  const d = p || { images: [], sizes: ['S', 'M', 'L', 'XL'], stock: 50, active: 1, price: '', mrp: '' };
  openForm(p ? 'Edit product' : 'New product', [
    { k: 'name', l: 'Product name', full: true }, { k: 'category_id', l: 'Category', t: 'sel', o: [[0, '— none —'], ...cats.map(c => [c.id, c.name])] },
    { k: 'badge', l: 'Badge (e.g. SALE, NEW)' }, { k: 'price', l: 'Selling price (₹)', t: 'number' }, { k: 'mrp', l: 'MRP / strike-through price (₹)', t: 'number' },
    { k: 'stock', l: 'Stock quantity', t: 'number' }, { k: 'sizes', l: 'Sizes (comma separated)', t: 'csv', h: 'e.g. S, M, L, XL — leave empty if no sizes' },
    { k: 'description', l: 'Description', t: 'ta' }, { k: 'images', l: 'Photos', t: 'images', h: 'First photo is the main one.' },
    { k: 'is_combo', l: 'This is a combo / bundle (shows in Combos section)', t: 'chk' }, { k: 'featured', l: 'Show on home page as Best Seller', t: 'chk' }, { k: 'active', l: 'Visible in store', t: 'chk' },
  ], d, save('/api/admin/products', p?.id), p && (() => api('/api/admin/products/' + p.id, null, 'DELETE')));
}
function cForm(c) {
  openForm(c ? 'Edit category' : 'New category', [{ k: 'name', l: 'Name' }, { k: 'sort', l: 'Sort order (small = first)', t: 'number' }, { k: 'image', l: 'Image', t: 'image' }, { k: 'active', l: 'Visible in store', t: 'chk' }], c || { active: 1, sort: cats.length }, save('/api/admin/categories', c?.id), c && (() => api('/api/admin/categories/' + c.id, null, 'DELETE')));
}
function kForm(c) {
  openForm(c ? 'Edit coupon' : 'New coupon', [{ k: 'code', l: 'Coupon code', ph: 'SAVE20' }, { k: 'type', l: 'Type', t: 'sel', o: [['percent', 'Percent off (%)'], ['flat', 'Flat amount off (₹)']] }, { k: 'value', l: 'Value', t: 'number' }, { k: 'min_order', l: 'Minimum order (₹)', t: 'number' }, { k: 'max_discount', l: 'Max discount for % coupons (₹, 0 = none)', t: 'number' }, { k: 'usage_limit', l: 'Total uses allowed (0 = unlimited)', t: 'number' }, { k: 'expires', l: 'Expiry date', t: 'date' }, { k: 'active', l: 'Active', t: 'chk' }], c || { type: 'percent', active: 1, value: 10, min_order: 0, max_discount: 0, usage_limit: 0 }, save('/api/admin/coupons', c?.id), c && (() => api('/api/admin/coupons/' + c.id, null, 'DELETE')));
}
function bForm(b) {
  openForm(b ? 'Edit banner' : 'New banner', [{ k: 'title', l: 'Title' }, { k: 'subtitle', l: 'Subtitle' }, { k: 'link', l: 'Link', ph: '#/shop?category=shirt', h: 'Use #/shop, #/shop?category=<slug>, or #/shop?combo=1' }, { k: 'sort', l: 'Sort order', t: 'number' }, { k: 'image', l: 'Banner image', t: 'image', h: 'Wide image (e.g. 1600×600) works best.' }, { k: 'active', l: 'Visible', t: 'chk' }], b || { active: 1, sort: 0 }, save('/api/admin/banners', b?.id), b && (() => api('/api/admin/banners/' + b.id, null, 'DELETE')));
}
if (TOKEN) api('/api/admin/stats').then(() => start(false)).catch(() => logout());
