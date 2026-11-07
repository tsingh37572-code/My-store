# Aapka Online Store (0 investment)

## Computer par chalane ke liye
1. Node.js 22 install karo (nodejs.org, free)
2. Is folder me terminal kholo aur chalao:  node --no-warnings server.js
3. Store: http://localhost:3000   |   Admin: http://localhost:3000/admin/
4. Pehla admin password: admin123  -> login ke turant baad Settings > Change password

## Admin se kya kya badal sakte ho
Products (photo, price, MRP, size, stock, combo) | Categories | Coupons (% ya flat) |
Banners | Orders (status badlo) | Returns | Settings: store name, announcement bar,
shipping fee, COD on/off, Razorpay Key ID + Secret (Payment gateway tab)

## Online free hosting (sab ko dikhane ke liye)
Data (database + photos) DATA_DIR folder me save hota hai; wo restart par bhi bachna chahiye.
Free + persistent disk: Oracle Cloud "Always Free" VM (Node 22 install, ADMIN_PASSWORD=xxx PORT=80 node --no-warnings server.js, pm2 se chalao).
Domain free nahi hota (.in ~Rs 500-700/saal) ya free subdomain use karo.
Razorpay: signup free, har payment par ~2% fee; setup fee nahi.
