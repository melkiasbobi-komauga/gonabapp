const { v4: uuidv4 } = require('uuid');
const { getMockDB } = require('../config/database');
const { sendSuccess, sendError } = require('../utils/helpers');

// GET /api/merchants - Daftar toko
const getMerchants = async (req, res) => {
  try {
    const { search, category, lat, lng, radius = 10 } = req.query;
    const db = getMockDB();
    let merchants = db.merchants.filter(m => m.is_verified);
    if (search) {
      merchants = merchants.filter(m =>
        m.store_name.toLowerCase().includes(search.toLowerCase()) ||
        m.store_description.toLowerCase().includes(search.toLowerCase())
      );
    }
    if (category) merchants = merchants.filter(m => m.store_category === category);
    return sendSuccess(res, { merchants, total: merchants.length });
  } catch (err) {
    return sendError(res, 'Gagal mengambil daftar toko: ' + err.message, 500);
  }
};

// GET /api/merchants/:id
const getMerchantById = async (req, res) => {
  try {
    const db = getMockDB();
    const merchant = db.merchants.find(m => m.id === req.params.id);
    if (!merchant) return sendError(res, 'Toko tidak ditemukan.', 404);
    const products = db.products.filter(p => p.merchant_id === merchant.id && p.is_available);
    return sendSuccess(res, { merchant, products });
  } catch (err) {
    return sendError(res, 'Gagal mengambil detail toko: ' + err.message, 500);
  }
};

// GET /api/products - Daftar produk semua toko
const getProducts = async (req, res) => {
  try {
    const { search, category, merchant_id, min_price, max_price, page = 1, limit = 20 } = req.query;
    const db = getMockDB();
    let products = db.products.filter(p => p.is_available);
    if (search) products = products.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));
    if (category) products = products.filter(p => p.category === category);
    if (merchant_id) products = products.filter(p => p.merchant_id === merchant_id);
    if (min_price) products = products.filter(p => p.price >= parseInt(min_price));
    if (max_price) products = products.filter(p => p.price <= parseInt(max_price));
    const total = products.length;
    const paginated = products.slice((page - 1) * limit, page * limit);
    return sendSuccess(res, { products: paginated, total, page: parseInt(page), total_pages: Math.ceil(total / limit) });
  } catch (err) {
    return sendError(res, 'Gagal mengambil produk: ' + err.message, 500);
  }
};

// POST /api/shop/order - Pesan produk dari toko
const createShopOrder = async (req, res) => {
  try {
    const { merchant_id, items, delivery_address, delivery_lat, delivery_lng, payment_method = 'cash', notes = '' } = req.body;
    if (!merchant_id || !items || !items.length) {
      return sendError(res, 'Data pesanan tidak lengkap.');
    }
    const db = getMockDB();
    const merchant = db.merchants.find(m => m.id === merchant_id);
    if (!merchant) return sendError(res, 'Toko tidak ditemukan.', 404);
    if (!merchant.is_open) return sendError(res, 'Maaf, toko ini sedang tutup.');

    let totalAmount = 0;
    const orderItems = [];
    for (const item of items) {
      const product = db.products.find(p => p.id === item.product_id);
      if (!product) return sendError(res, `Produk dengan ID ${item.product_id} tidak ditemukan.`);
      if (product.stock < item.quantity) return sendError(res, `Stok ${product.name} tidak mencukupi.`);
      const subtotal = product.price * item.quantity;
      totalAmount += subtotal;
      orderItems.push({ product_id: product.id, name: product.name, price: product.price, quantity: item.quantity, subtotal });
    }

    const deliveryFee = delivery_lat ? 10000 : 0;
    totalAmount += deliveryFee;

    if (payment_method === 'wallet') {
      const userIdx = db.users.findIndex(u => u.id === req.user.id);
      if (db.users[userIdx].wallet_balance < totalAmount) {
        return sendError(res, 'Saldo GooWallet tidak cukup.');
      }
      db.users[userIdx].wallet_balance -= totalAmount;
    }

    // Reduce stock
    for (const item of items) {
      const pIdx = db.products.findIndex(p => p.id === item.product_id);
      db.products[pIdx].stock -= item.quantity;
    }

    const newOrder = {
      id: uuidv4(),
      order_number: `GRP-${Date.now()}`,
      user_id: req.user.id,
      merchant_id,
      service_type: 'GooShop',
      items: orderItems,
      delivery_address: delivery_address || 'Ambil sendiri di toko',
      delivery_lat: delivery_lat || null,
      delivery_lng: delivery_lng || null,
      delivery_fee: deliveryFee,
      total_amount: totalAmount,
      payment_method,
      status: 'pending',
      notes,
      created_at: new Date().toISOString()
    };
    db.orders.push(newOrder);
    return sendSuccess(res, { order: newOrder }, 'Pesanan ke toko berhasil dibuat!', 201);
  } catch (err) {
    return sendError(res, 'Gagal membuat pesanan toko: ' + err.message, 500);
  }
};

// Merchant: GET /api/merchant/orders
const getMerchantOrders = async (req, res) => {
  try {
    const db = getMockDB();
    const merchant = db.merchants.find(m => m.user_id === req.user.id);
    if (!merchant) return sendError(res, 'Profil merchant tidak ditemukan.', 404);
    const orders = db.orders.filter(o => o.merchant_id === merchant.id)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return sendSuccess(res, { orders, total: orders.length });
  } catch (err) {
    return sendError(res, 'Gagal mengambil pesanan merchant: ' + err.message, 500);
  }
};

// Merchant: PUT /api/merchant/orders/:id/status
const updateMerchantOrderStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const db = getMockDB();
    const merchant = db.merchants.find(m => m.user_id === req.user.id);
    if (!merchant) return sendError(res, 'Profil merchant tidak ditemukan.', 404);
    const orderIdx = db.orders.findIndex(o => o.id === req.params.id && o.merchant_id === merchant.id);
    if (orderIdx === -1) return sendError(res, 'Pesanan tidak ditemukan.', 404);
    db.orders[orderIdx].status = status;
    if (status === 'completed') {
      db.orders[orderIdx].completed_at = new Date().toISOString();
      const mIdx = db.merchants.findIndex(m => m.id === merchant.id);
      db.merchants[mIdx].total_orders += 1;
    }
    return sendSuccess(res, { order: db.orders[orderIdx] }, 'Status pesanan diperbarui.');
  } catch (err) {
    return sendError(res, 'Gagal memperbarui status: ' + err.message, 500);
  }
};

// Merchant: POST /api/merchant/products
const addProduct = async (req, res) => {
  try {
    const { name, description, price, stock, category } = req.body;
    if (!name || !price || !stock) return sendError(res, 'Nama, harga, dan stok wajib diisi.');
    const db = getMockDB();
    const merchant = db.merchants.find(m => m.user_id === req.user.id);
    if (!merchant) return sendError(res, 'Profil merchant tidak ditemukan.', 404);
    const newProduct = {
      id: uuidv4(), merchant_id: merchant.id, name: name.trim(),
      description: description || '', price: parseInt(price), stock: parseInt(stock),
      category: category || 'Umum', image: null, is_available: true,
      created_at: new Date().toISOString()
    };
    db.products.push(newProduct);
    return sendSuccess(res, { product: newProduct }, 'Produk berhasil ditambahkan!', 201);
  } catch (err) {
    return sendError(res, 'Gagal menambahkan produk: ' + err.message, 500);
  }
};

// Merchant: Toggle store open/close
const toggleStoreStatus = async (req, res) => {
  try {
    const db = getMockDB();
    const mIdx = db.merchants.findIndex(m => m.user_id === req.user.id);
    if (mIdx === -1) return sendError(res, 'Profil merchant tidak ditemukan.', 404);
    db.merchants[mIdx].is_open = !db.merchants[mIdx].is_open;
    return sendSuccess(res, { is_open: db.merchants[mIdx].is_open },
      `Toko ${db.merchants[mIdx].is_open ? 'dibuka' : 'ditutup'} berhasil.`);
  } catch (err) {
    return sendError(res, 'Gagal memperbarui status toko: ' + err.message, 500);
  }
};

module.exports = { getMerchants, getMerchantById, getProducts, createShopOrder, getMerchantOrders, updateMerchantOrderStatus, addProduct, toggleStoreStatus };
