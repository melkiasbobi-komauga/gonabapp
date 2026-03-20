const { v4: uuidv4 } = require('uuid');
const { query, withTransaction } = require('../config/database');
const { sendSuccess, sendError } = require('../utils/helpers');

// ─── GET /api/rentals ─────────────────────────────────────────
const getRentals = async (req, res) => {
  try {
    const { search, category, min_price, max_price, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    const params = [];
    let where = `WHERE r.is_available=TRUE`;

    if (search) {
      params.push(`%${search}%`);
      where += ` AND (r.name ILIKE $${params.length} OR r.description ILIKE $${params.length})`;
    }
    if (category) { params.push(category); where += ` AND r.category=$${params.length}`; }
    if (min_price) { params.push(parseInt(min_price)); where += ` AND r.price_per_day>=$${params.length}`; }
    if (max_price) { params.push(parseInt(max_price)); where += ` AND r.price_per_day<=$${params.length}`; }

    const countRes = await query(`SELECT COUNT(*) FROM rentals r ${where}`, params);
    params.push(parseInt(limit), offset);
    const { rows } = await query(
      `SELECT r.id, r.name, r.description, r.category,
              r.price_per_day, r.price_per_week, r.price_per_month,
              r.deposit, r.stock, r.available_stock,
              r.address, r.images, r.is_available, r.rating, r.total_bookings,
              ST_Y(r.location::geometry) AS lat, ST_X(r.location::geometry) AS lng,
              r.created_at,
              u.name AS owner_name, u.phone AS owner_phone
       FROM rentals r JOIN users u ON u.id=r.owner_id
       ${where} ORDER BY r.created_at DESC
       LIMIT $${params.length-1} OFFSET $${params.length}`,
      params
    );
    return sendSuccess(res, {
      rentals: rows,
      total: parseInt(countRes.rows[0].count),
      page: parseInt(page),
      total_pages: Math.ceil(countRes.rows[0].count / limit)
    });
  } catch (err) {
    return sendError(res, 'Gagal mengambil daftar sewa: ' + err.message, 500);
  }
};

// ─── GET /api/rentals/:id ─────────────────────────────────────
const getRentalById = async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT r.*, u.name AS owner_name, u.phone AS owner_phone,
              ST_Y(r.location::geometry) AS lat, ST_X(r.location::geometry) AS lng
       FROM rentals r JOIN users u ON u.id=r.owner_id
       WHERE r.id=$1`, [req.params.id]);
    if (!rows.length) return sendError(res, 'Barang sewa tidak ditemukan.', 404);

    // Booked dates
    const booked = await query(
      `SELECT rental_start_date AS start_date, rental_end_date AS end_date
       FROM orders
       WHERE rental_id=$1 AND status NOT IN ('cancelled','rejected')`,
      [req.params.id]);

    return sendSuccess(res, { rental: rows[0], booked_dates: booked.rows });
  } catch (err) {
    return sendError(res, 'Gagal mengambil detail sewa: ' + err.message, 500);
  }
};

// ─── POST /api/rentals/book ───────────────────────────────────
const bookRental = async (req, res) => {
  try {
    const { rental_id, start_date, end_date, delivery_address, delivery_lat, delivery_lng, note = '' } = req.body;
    if (!rental_id || !start_date || !end_date)
      return sendError(res, 'rental_id, start_date, end_date wajib diisi.');

    const rentalRes = await query(
      `SELECT *, ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng
       FROM rentals WHERE id=$1 AND is_available=TRUE`, [rental_id]);
    if (!rentalRes.rows.length) return sendError(res, 'Barang sewa tidak tersedia.', 404);
    const rental = rentalRes.rows[0];

    // Check date conflict
    const conflict = await query(
      `SELECT id FROM orders
       WHERE rental_id=$1 AND status NOT IN ('cancelled','rejected')
         AND NOT (rental_end_date < $2::date OR rental_start_date > $3::date)`,
      [rental_id, start_date, end_date]);
    if (conflict.rows.length) return sendError(res, 'Barang sudah dipesan pada tanggal tersebut.', 409);

    const days = Math.ceil(
      (new Date(end_date) - new Date(start_date)) / (1000 * 60 * 60 * 24)
    ) + 1;
    if (days < 1) return sendError(res, 'Tanggal akhir harus setelah tanggal mulai.');

    const subtotal = parseFloat(rental.price_per_day) * days;
    const deposit  = parseFloat(rental.deposit) || 0;
    const total    = subtotal + deposit;

    // Check wallet
    const userRes = await query(`SELECT wallet_balance FROM users WHERE id=$1`, [req.user.id]);
    if (parseFloat(userRes.rows[0].wallet_balance) < total)
      return sendError(res, `Saldo tidak mencukupi. Dibutuhkan Rp ${total.toLocaleString('id')}.`, 400);

    const orderId     = uuidv4();
    const orderNumber = `SEWA-${Date.now().toString(36).toUpperCase()}`;

    const pickupLat = parseFloat(delivery_lat || rental.lat || -3.36);
    const pickupLng = parseFloat(delivery_lng || rental.lng || 135.5);

    await withTransaction(async (client) => {
      await client.query(
        `INSERT INTO orders(
           id, order_number, user_id, service_type, status,
           rental_id, rental_start_date, rental_end_date, rental_duration,
           pickup_address, pickup_point,
           total_amount, deposit_amount, notes
         ) VALUES($1,$2,$3,'goosewa','pending',$4,$5,$6,$7,$8,
           ST_SetSRID(ST_MakePoint($10,$9),4326),
           $11,$12,$13)`,
        [
          orderId, orderNumber, req.user.id,
          rental_id, start_date, end_date, days,
          delivery_address || rental.address,
          pickupLat, pickupLng,
          total, deposit, note
        ]
      );
      // Deduct wallet
      const balRes = await client.query(
        `SELECT wallet_balance FROM users WHERE id=$1 FOR UPDATE`, [req.user.id]);
      const balBefore = parseFloat(balRes.rows[0].wallet_balance);
      const balAfter  = balBefore - total;
      await client.query(`UPDATE users SET wallet_balance=$1 WHERE id=$2`, [balAfter, req.user.id]);
      await client.query(
        `INSERT INTO wallet_transactions(id,user_id,type,amount,balance_before,balance_after,description,reference_code,status)
         VALUES($1,$2,'debit',$3,$4,$5,$6,$7,'success')`,
        [uuidv4(), req.user.id, total, balBefore, balAfter,
         `Pembayaran sewa "${rental.name}" (${days} hari)`, orderId]
      );
    });

    const orderRes = await query(`SELECT * FROM orders WHERE id=$1`, [orderId]);
    return sendSuccess(res, {
      order: orderRes.rows[0],
      rental_name: rental.name,
      days, subtotal, deposit, total
    }, 'Pemesanan sewa berhasil.', 201);
  } catch (err) {
    return sendError(res, 'Gagal memesan sewa: ' + err.message, 500);
  }
};

// ─── GET /api/rentals/my-bookings ────────────────────────────
const getMyBookings = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    const params = [req.user.id];
    let where = `WHERE o.user_id=$1 AND o.service_type='goosewa'`;
    if (status) { params.push(status); where += ` AND o.status=$${params.length}`; }

    const countRes = await query(`SELECT COUNT(*) FROM orders o ${where}`, params);
    params.push(parseInt(limit), offset);
    const { rows } = await query(
      `SELECT o.*, r.name AS rental_name, r.images AS rental_images,
              r.price_per_day, r.deposit, u.name AS owner_name
       FROM orders o
       JOIN rentals r ON r.id=o.rental_id
       JOIN users u ON u.id=r.owner_id
       ${where} ORDER BY o.created_at DESC
       LIMIT $${params.length-1} OFFSET $${params.length}`,
      params
    );
    return sendSuccess(res, {
      bookings: rows,
      total: parseInt(countRes.rows[0].count),
      page: parseInt(page),
      total_pages: Math.ceil(countRes.rows[0].count / limit)
    });
  } catch (err) {
    return sendError(res, 'Gagal mengambil riwayat sewa: ' + err.message, 500);
  }
};

// ─── POST /api/rentals ─── owner creates rental ───────────────
const createRental = async (req, res) => {
  try {
    const {
      name, description, category = 'umum',
      price_per_day, price_per_week, price_per_month,
      deposit = 0, stock = 1,
      address, location_lat, location_lng,
      images = []
    } = req.body;
    if (!name || !price_per_day || !address)
      return sendError(res, 'Nama, harga, dan alamat wajib diisi.');

    const rentalId = uuidv4();
    const lat = parseFloat(location_lat || -3.36);
    const lng = parseFloat(location_lng || 135.5);

    await query(
      `INSERT INTO rentals(id, owner_id, name, description, category,
         price_per_day, price_per_week, price_per_month,
         deposit, stock, available_stock,
         address, location, images
       ) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10,$11,
         ST_SetSRID(ST_MakePoint($13,$12),4326),
         $14)`,
      [
        rentalId, req.user.id, name, description || '', category,
        parseInt(price_per_day),
        price_per_week  ? parseInt(price_per_week)  : null,
        price_per_month ? parseInt(price_per_month) : null,
        parseInt(deposit), parseInt(stock),
        address, lat, lng,
        JSON.stringify(images)
      ]
    );
    const { rows } = await query(`SELECT * FROM rentals WHERE id=$1`, [rentalId]);
    return sendSuccess(res, { rental: rows[0] }, 'Barang sewa berhasil ditambahkan.', 201);
  } catch (err) {
    return sendError(res, 'Gagal menambahkan barang sewa: ' + err.message, 500);
  }
};

// ─── PUT /api/rentals/:id ─────────────────────────────────────
const updateRental = async (req, res) => {
  try {
    const { id } = req.params;
    const allowed = ['name','description','category','price_per_day','price_per_week',
                     'price_per_month','deposit','stock','address','is_available'];
    const params  = [];
    const updates = [];
    allowed.forEach(f => {
      if (req.body[f] !== undefined) {
        params.push(req.body[f]);
        updates.push(`${f}=$${params.length}`);
      }
    });
    if (!updates.length) return sendError(res, 'Tidak ada data yang diubah.');
    params.push(id, req.user.id);
    const { rows } = await query(
      `UPDATE rentals SET ${updates.join(',')}
       WHERE id=$${params.length-1} AND owner_id=$${params.length}
       RETURNING *`, params);
    if (!rows.length) return sendError(res, 'Barang sewa tidak ditemukan atau bukan milik Anda.', 404);
    return sendSuccess(res, { rental: rows[0] }, 'Barang sewa berhasil diperbarui.');
  } catch (err) {
    return sendError(res, 'Gagal memperbarui barang sewa: ' + err.message, 500);
  }
};

module.exports = {
  getRentals, getRentalById, bookRental,
  getMyBookings, createRental, updateRental
};
