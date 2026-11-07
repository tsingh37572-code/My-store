// Demo data so the store is not empty on first run. Delete/replace everything from the Admin panel.
const fs = require('node:fs'), path = require('node:path');
const TEE = 'M30 40 L55 28 Q75 42 95 28 L120 40 L108 66 L96 60 L96 128 L54 128 L54 60 L42 66 Z';
function svg(bg, fg, label) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 150 188"><rect width="150" height="188" fill="${bg}"/><path d="${TEE}" fill="${fg}" transform="translate(0 8)"/><text x="75" y="172" text-anchor="middle" font-family="Arial" font-size="9" fill="#00000066" letter-spacing="1">${label}</text></svg>`;
}
module.exports = function seed(db, uploadDir, setSetting) {
  if (db.prepare("SELECT 1 FROM settings WHERE key='seeded'").get()) return;
  const mk = (name, bg, fg) => { const f = name.replace(/\W+/g, '_').toLowerCase() + '.svg'; fs.writeFileSync(path.join(uploadDir, f), svg(bg, fg, 'DEMO IMAGE')); return '/uploads/' + f; };
  const cats = ['Shirt', 'T-Shirt', 'Jeans', 'Trousers', 'Track Pants', 'Shorts', 'Combos'];
  const ci = {};
  cats.forEach((c, i) => { const r = db.prepare('INSERT INTO categories(name,slug,image,sort) VALUES(?,?,?,?)').run(c, c.toLowerCase().replace(/\W+/g, '-'), mk('cat_' + c, '#ececec', '#222'), i); ci[c] = Number(r.lastInsertRowid); });
  const P = [
    ['Classic Everyday Shirt', 'Shirt', 799, 1299, '#e8e3da', '#3a4a63', 1, 0, ['S', 'M', 'L', 'XL']],
    ['Linen Blend Shirt', 'Shirt', 899, 1499, '#e6ebe6', '#7a9a86', 0, 0, ['S', 'M', 'L', 'XL']],
    ['Dri-Fit Training Tee', 'T-Shirt', 399, 799, '#e9e9f0', '#4b5fd6', 1, 0, ['S', 'M', 'L', 'XL', 'XXL']],
    ['Oversized Graphic Tee', 'T-Shirt', 499, 899, '#f1e6df', '#d97a4a', 1, 0, ['S', 'M', 'L', 'XL']],
    ['Straight Fit Jeans', 'Jeans', 1199, 1999, '#e4e8ee', '#2d3e5c', 0, 0, ['28', '30', '32', '34', '36']],
    ['Pleated Trousers', 'Trousers', 1099, 1799, '#efe9dc', '#c9b894', 1, 0, ['28', '30', '32', '34', '36']],
    ['Soft Lycra Track Pants', 'Track Pants', 599, 999, '#e7e7e7', '#33363b', 0, 0, ['S', 'M', 'L', 'XL']],
    ['Cotton Shorts', 'Shorts', 449, 799, '#e6efe9', '#4f8a6b', 0, 0, ['S', 'M', 'L', 'XL']],
    ['Pick Any 3 Soft Lycra Trousers', 'Combos', 1230, 2400, '#ebe4e1', '#7a5648', 0, 1, ['28', '30', '32', '34', '36']],
    ['Pick Any 5 Training Tees', 'Combos', 1199, 2495, '#e4ecf2', '#3f7fb0', 0, 1, ['S', 'M', 'L', 'XL']],
  ];
  for (const [n, c, price, mrp, bg, fg, feat, combo, sizes] of P)
    db.prepare('INSERT INTO products(name,description,category_id,price,mrp,images,sizes,stock,is_combo,featured,badge,created) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(n, 'Demo product. Edit the name, price, photos and description from the Admin panel.', ci[c], price, mrp, JSON.stringify([mk(n, bg, fg)]), JSON.stringify(sizes), 50, combo, feat, combo ? 'COMBO' : (mrp > price * 1.5 ? 'SALE' : ''), Date.now());
  db.prepare('INSERT INTO banners(image,title,subtitle,link,sort) VALUES(?,?,?,?,?)').run(mk('banner1', '#dfe6ee', '#2d3e5c'), 'Festive Sale', 'Up to 40% off on everything', '/#/shop', 0);
  db.prepare('INSERT INTO banners(image,title,subtitle,link,sort) VALUES(?,?,?,?,?)').run(mk('banner2', '#efe3d8', '#b4673a'), 'New Combos', 'Pick more, pay less', '/#/shop?combo=1', 1);
  db.prepare('INSERT INTO coupons(code,type,value,min_order,max_discount) VALUES(?,?,?,?,?)').run('WELCOME10', 'percent', 10, 499, 300);
  db.prepare('INSERT INTO coupons(code,type,value,min_order) VALUES(?,?,?,?)').run('FLAT100', 'flat', 100, 999);
  setSetting('seeded', '1');
};
