const { v4: uuidv4 } = require('uuid');
const { getMockDB } = require('../config/database');
const { sendSuccess, sendError } = require('../utils/helpers');

// GET /api/rentals - Daftar barang sewa (GooSewa)
const getRentals = async (req, res) => {
  try {
    const { search, category, min_price, max_price, page = 1, limit = 20 } = req.query;
    const db = getMockDB();
    let rentals = db.rentals.filter(r => r.is_available);
    if (search) rentals = rentals.filter(r => r.name.toLowerCase().includes(search.toLowerCase()) || r.description.toLowerCase().includes(search.toLowerCase()));
    if (category) rentals = rentals.filter(r => r.category === category);
    if (min_price) rentals = rentals.filter(r => r.price_per_day >= parseInt(min_price));
    if (max_price) rentals = rentals.filter(r => r.price_per_day <= parseInt(max_price));
    const total = rentals.length;
    const paginated = rentals.slice((page - 1) * limit, page * limit);
    return sendSuccess(res, { rentals: paginated, total, page: parseInt(page), total_pages: Math.ceil(total / limit) });
  } catch (err) {
    return sendError(res, 'Gagal mengambil daftar sewa: ' + err.message, 500);
  }
};

// GET /api/rentals/:id
const getRentalById = async (req, res) => {
  try {
    const db = getMockDB();
    const rental = db.rentals.find(r => r.id === req.params.id);
    if (!rental) return sendError(res, 'Barang sewa tidak ditemukan.', 404);
    const owner = db.users.find(u => u.id === rental.owner_id);
    return sendSuccess(res, { rental, owner: owner ? { id: owner.id, name: owner.name, phone: owner.phone } : null });
  } catch (err) {
    return sendError(res, 'Gagal mengambil detail sewa: ' + err.message, 500);
  }
};

// POST /api/rentals/book - Booking sewa barang
const bookRental = async (req, res) => {
  try {
    const { rental_id, start_date, end_date, rental_period, payment_method = 'cash', notes = '' } = req.body;
    if (!rental_id || !start_date || !end_date) {
      return sendError(res, 'ID barang, tanggal mulai, dan tanggal selesai wajib diisi.');
    }
    const db = getMockDB();
    const rental = db.rentals.find(r => r.id === rental_id);
    if (!rental) return sendError(res, 'Barang sewa tidak ditemukan.', 404);
    if (rental.available_stock <= 0) return sendError(res, 'Stok barang sewa habis.');

    const start = new Date(start_date);
    const end = new Date(end_date);
    const diffTime = Math.abs(end - start);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) || 1;

    let totalAmount = 0;
    if (rental_period === 'month' && rental.price_per_month) {
      const months = Math.ceil(diffDays / 30);
      totalAmount = months * rental.price_per_month;
    } else if (rental_period === 'week' && rental.price_per_week) {
      const weeks = Math.ceil(diffDays / 7);
      totalAmount = weeks * rental.price_per_week;
    } else {
      totalAmount = diffDays * rental.price_per_day;
    }

    const depositAmount = rental.deposit || 0;
    const grandTotal = totalAmount + depositAmount;

    if (payment_method === 'wallet') {
      const userIdx = db.users.findIndex(u => u.id === req.user.id);
      if (db.users[userIdx].wallet_balance < grandTotal) {
        return sendError(res, `Saldo GooWallet tidak cukup. Dibutuhkan: Rp ${grandTotal.toLocaleString('id-ID')}`);
      }
      db.users[userIdx].wallet_balance -= grandTotal;
    }

    // Reduce available stock
    const rentalIdx = db.rentals.findIndex(r => r.id === rental_id);
    db.rentals[rentalIdx].available_stock -= 1;

    const booking = {
      id: uuidv4(),
      order_number: `GSW-${Date.now()}`,
      user_id: req.user.id,
      rental_id,
      rental_name: rental.name,
      owner_id: rental.owner_id,
      service_type: 'GooSewa',
      start_date,
      end_date,
      duration_days: diffDays,
      rental_period: rental_period || 'day',
      rental_amount: totalAmount,
      deposit_amount: depositAmount,
      total_amount: grandTotal,
      payment_method,
      status: 'confirmed',
      notes,
      created_at: new Date().toISOString()
    };
    db.orders.push(booking);
    return sendSuccess(res, { booking }, 'Booking GooSewa berhasil!', 201);
  } catch (err) {
    return sendError(res, 'Gagal booking sewa: ' + err.message, 500);
  }
};

// POST /api/rentals - Tambah barang sewa (pemilik)
const addRental = async (req, res) => {
  try {
    const { name, description, category, price_per_day, price_per_week, price_per_month, deposit, stock, location, lat, lng } = req.body;
    if (!name || !price_per_day || !stock) return sendError(res, 'Nama, harga per hari, dan jumlah stok wajib diisi.');
    const db = getMockDB();
    const newRental = {
      id: uuidv4(), owner_id: req.user.id, name: name.trim(),
      description: description || '', category: category || 'Umum',
      price_per_day: parseInt(price_per_day),
      price_per_week: price_per_week ? parseInt(price_per_week) : null,
      price_per_month: price_per_month ? parseInt(price_per_month) : null,
      deposit: deposit ? parseInt(deposit) : 0,
      stock: parseInt(stock), available_stock: parseInt(stock),
      location: location || '', lat: lat ? parseFloat(lat) : null, lng: lng ? parseFloat(lng) : null,
      images: [], is_available: true, rating: 0, created_at: new Date().toISOString()
    };
    db.rentals.push(newRental);
    return sendSuccess(res, { rental: newRental }, 'Barang sewa berhasil ditambahkan!', 201);
  } catch (err) {
    return sendError(res, 'Gagal menambahkan barang sewa: ' + err.message, 500);
  }
};

module.exports = { getRentals, getRentalById, bookRental, addRental };
