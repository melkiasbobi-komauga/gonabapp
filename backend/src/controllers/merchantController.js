const { v4: uuidv4 } = require('uuid');
const { query, withTransaction } = require('../config/database');
const { sendSuccess, sendError } = require('../utils/helpers');

// ─── GET /api/merchants ──────────────────────────────────────
const getMerchants = async (req, res) => {
  try {
    const { search, category, lat, lng, radius = 10 } = req.query;
    let whereClause = 'WHERE m.is_verified = TRUE';
    const params = [];

    if (search) {
      params.push(`%${search}%`);
      whereClause += ` AND (m.store_name ILIKE $${params.length} OR m.store_description ILIKE $${params.length})`;
    }
    if (category) {
      params.push(category);
      whereClause += ` AND m.store_category = $${params.length}`;
    }
    if (lat && lng) {
      params.push(parseFloat(lng), parseFloat(lat), parseFloat(radius) * 1000);
      whereClause += ` AND ST_DWithin(m.location::geography, ST_SetSRID(ST_MakePoint($${params.length-2},$${params.length-1}),4326)::geography, $${params.length})`;
    }

    const { rows } = await query(
      `SELECT m.id, m.store_name, m.store_description, m.store_category,
              m.store_address, m.phone, m.operating_hours,
              m.is_open, m.is_verified, m.rating, m.total_orders,
              m.banner_image, m.created_at,
              ST_Y(m.location::geometry) AS lat,
              ST_X(m.location::geometry) AS lng
       FROM merchants m ${whereClause}
       ORDER BY m.rating DESC, m.total_orders DESC`, params
    );
    return sendSuccess(res, { merchants: rows, total: rows.length });
  } catch (err) {
    return sendError(res, 'Gagal mengambil daftar toko: ' + err.message, 500);
  }
};

// ─── GET /api/merchants/:id ──────────────────────────────────
const getMerchantById = async (req, res) => {
  try {
    const { rows: mRows } = await query(
      `SELECT m.*, u.name AS owner_name, u.phone AS owner_phone,
              ST_Y(m.location::geometry) AS lat, ST_X(m.location::geometry) AS lng
       FROM merchants m JOIN users u ON u.id = m.user_id WHERE m.id = $1`, [req.params.id]
    );
    if (!mRows.length) return sendError(res, 'Toko tidak ditemukan.', 404);
    const { rows: products } = await query(
      'SELECT * FROM products WHERE merchant_id = $1 AND is_available = TRUE ORDER BY name', [req.params.id]
    );
    return sendSuccess(res, { merchant: mRows[0], products });
  } catch (err) {
    return sendError(res, 'Gagal mengambil detail toko: ' + err.message, 500);
  }
};

// ─── GET /api/products ───────────────────────────────────────
const getProducts = async (req, res) => {
  try {
    const { search, category, merchant_id, min_price, max_price, page = 1, limit = 20 } = req.query;
    const params = [];
    let where = 'WHERE p.is_available = TRUE';
    if (search)      { params.push(`%${search}%`);      where += ` AND (p.name ILIKE $${params.length} OR p.description ILIKE $${params.length})`; }
    if (category)    { params.push(category);            where += ` AND p.category = $${params.length}`; }
    if (merchant_id) { params.push(merchant_id);         where += ` AND p.merchant_id = $${params.length}`; }
    if (min_price)   { params.push(parseInt(min_price)); where += ` AND p.price >= $${params.length}`; }
    if (max_price)   { params.push(parseInt(max_price)); where += ` AND p.price <= $${params.length}`; }

    const offset = (page - 1) * limit;
    const { rows } = await query(
      `SELECT p.*, m.store_name, m.is_open
       FROM products p JOIN merchants m ON m.id = p.merchant_id
       ${where} ORDER BY p.name
       LIMIT $${params.length+1} OFFSET $${params.length+2}`,
      [...params, limit, offset]
    );
    const { rows: cnt } = await query(`SELECT COUNT(*) FROM products p ${where}`, params);
    return sendSuccess(res, { products: rows, total: parseInt(cnt[0].count), page: parseInt(page), total_pages: Math.ceil(parseInt(cnt[0].count)/limit) });
  } catch (err) {
    return sendError(res, 'Gagal mengambil produk: ' + err.message, 500);
  }
};

// ─── POST /api/shop/order ────────────────────────────────────
const createShopOrder = async (req, res) => {
  try {
    const { merchant_id, items, delivery_address, delivery_lat, delivery_lng, payment_method = 'cash', notes = '' } = req.body;
    if (!merchant_id || !items?.length)
      return sendError(res, 'Data pesanan tidak lengkap.');

    const result = await withTransaction(async (client) => {
      const { rows: mr } = await client.query('SELECT * FROM merchants WHERE id=$1 FOR UPDATE', [merchant_id]);
      if (!mr.length) throw new Error('Toko tidak ditemukan.');
      if (!mr[0].is_open) throw new Error('Maaf, toko ini sedang tutup.');

      let totalAmount = 0;
      const orderItems = [];
      for (const item of items) {
        const { rows: pr } = await client.query('SELECT * FROM products WHERE id=$1 FOR UPDATE', [item.product_id]);
        if (!pr.length) throw new Error(`Produk ${item.product_id} tidak ditemukan.`);
        if (pr[0].stock < item.quantity) throw new Error(`Stok ${pr[0].name} tidak mencukupi.`);
        const subtotal = Number(pr[0].price) * item.quantity;
        totalAmount += subtotal;
        orderItems.push({ product_id: pr[0].id, name: pr[0].name, price: Number(pr[0].price), quantity: item.quantity, subtotal });
        await client.query('UPDATE products SET stock = stock - $1 WHERE id=$2', [item.quantity, item.product_id]);
      }

      const deliveryFee = delivery_lat ? 10000 : 0;
      totalAmount += deliveryFee;

      if (payment_method === 'wallet') {
        const { rows: uw } = await client.query('SELECT wallet_balance FROM users WHERE id=$1 FOR UPDATE', [req.user.id]);
        if (Number(uw[0].wallet_balance) < totalAmount)
          throw new Error('Saldo GooWallet tidak cukup.');
        await client.query('UPDATE users SET wallet_balance = wallet_balance - $1 WHERE id=$2', [totalAmount, req.user.id]);
      }

      const orderId = uuidv4();
      const destPoint = delivery_lat
        ? `ST_SetSRID(ST_MakePoint(${parseFloat(delivery_lng)},${parseFloat(delivery_lat)}),4326)`
        : 'NULL';
      const { rows: orderRows } = await client.query(
        `INSERT INTO orders (id, order_number, user_id, merchant_id, service_type,
           destination_point, destination_address,
           delivery_fee, total_amount, payment_method, payment_status, status, items, notes)
         VALUES ($1,$2,$3,$4,'GooShop',
           ${destPoint}, $5,
           $6,$7,$8,$9,'pending',$10,$11)
         RETURNING id, order_number, status, total_amount, created_at`,
        [orderId, `GRP-${Date.now()}`, req.user.id, merchant_id,
         delivery_address || 'Ambil sendiri',
         deliveryFee, totalAmount, payment_method,
         payment_method === 'wallet' ? 'paid' : 'pending',
         JSON.stringify(orderItems), notes]
      );
      await client.query('UPDATE merchants SET total_orders = total_orders+1 WHERE id=$1', [merchant_id]);
      return orderRows[0];
    });
    return sendSuccess(res, { order: result }, 'Pesanan ke toko berhasil dibuat!', 201);
  } catch (err) {
    return sendError(res, err.message, 400);
  }
};

// ─── Merchant: GET /api/merchant/orders ─────────────────────
const getMerchantOrders = async (req, res) => {
  try {
    const { rows: mr } = await query('SELECT id FROM merchants WHERE user_id=$1', [req.user.id]);
    if (!mr.length) return sendError(res, 'Profil merchant tidak ditemukan.', 404);
    const { rows } = await query(
      `SELECT o.*, u.name AS customer_name, u.phone AS customer_phone
       FROM orders o JOIN users u ON u.id = o.user_id
       WHERE o.merchant_id=$1 ORDER BY o.created_at DESC LIMIT 100`,
      [mr[0].id]
    );
    return sendSuccess(res, { orders: rows, total: rows.length });
  } catch (err) {
    return sendError(res, 'Gagal mengambil pesanan: ' + err.message, 500);
  }
};

// ─── Merchant: PUT /api/merchant/orders/:id/status ──────────
const updateMerchantOrderStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const { rows: mr } = await query('SELECT id FROM merchants WHERE user_id=$1', [req.user.id]);
    if (!mr.length) return sendError(res, 'Profil merchant tidak ditemukan.', 404);
    const { rows } = await query(
      'UPDATE orders SET status=$1 WHERE id=$2 AND merchant_id=$3 RETURNING id, order_number, status',
      [status, req.params.id, mr[0].id]
    );
    if (!rows.length) return sendError(res, 'Pesanan tidak ditemukan.', 404);
    return sendSuccess(res, { order: rows[0] }, 'Status pesanan diperbarui.');
  } catch (err) {
    return sendError(res, 'Gagal memperbarui: ' + err.message, 500);
  }
};

// ─── Merchant: POST /api/merchant/products ──────────────────
const addProduct = async (req, res) => {
  try {
    const { name, description, price, stock, category } = req.body;
    if (!name || !price || stock === undefined)
      return sendError(res, 'Nama, harga, dan stok wajib diisi.');
    const { rows: mr } = await query('SELECT id FROM merchants WHERE user_id=$1', [req.user.id]);
    if (!mr.length) return sendError(res, 'Profil merchant tidak ditemukan.', 404);
    const { rows } = await query(
      `INSERT INTO products (id, merchant_id, name, description, price, stock, category)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING *`,
      [uuidv4(), mr[0].id, name.trim(), description || '', parseInt(price), parseInt(stock), category || 'Umum']
    );
    return sendSuccess(res, { product: rows[0] }, 'Produk berhasil ditambahkan!', 201);
  } catch (err) {
    return sendError(res, 'Gagal menambahkan produk: ' + err.message, 500);
  }
};

// ─── Merchant: PUT /api/merchant/toggle-status ──────────────
const toggleStoreStatus = async (req, res) => {
  try {
    const { rows } = await query(
      'UPDATE merchants SET is_open = NOT is_open WHERE user_id=$1 RETURNING is_open, store_name',
      [req.user.id]
    );
    if (!rows.length) return sendError(res, 'Profil merchant tidak ditemukan.', 404);
    return sendSuccess(res, { is_open: rows[0].is_open },
      `Toko ${rows[0].is_open ? 'dibuka' : 'ditutup'} berhasil.`);
  } catch (err) {
    return sendError(res, 'Gagal memperbarui status toko: ' + err.message, 500);
  }
};

module.exports = {
  getMerchants, getMerchantById, getProducts, createShopOrder,
  getMerchantOrders, updateMerchantOrderStatus, addProduct, toggleStoreStatus
};
