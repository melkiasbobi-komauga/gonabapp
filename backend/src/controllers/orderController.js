const { v4: uuidv4 }  = require('uuid');
const { query, withTransaction } = require('../config/database');
const {
  calculateFare, getTariffFromDB, calculateDistance,
  findNearbyDriversPostGIS, generateOrderNumber,
  sendSuccess, sendError, formatRupiah
} = require('../utils/helpers');
const {
  estimateFareWithMaps, getDirections
} = require('../services/googleMapsService');

// ─── GET /api/orders/estimate ────────────────────────────────
const getEstimate = async (req, res) => {
  try {
    const { pickup_lat, pickup_lng, destination_lat, destination_lng, service_type = 'GooRide' } = req.query;
    if (!pickup_lat || !pickup_lng || !destination_lat || !destination_lng)
      return sendError(res, 'Koordinat titik jemput dan tujuan wajib diisi.');

    // Hitung jarak via PostGIS (lebih akurat dari JS Haversine)
    const { rows: distRows } = await query(
      'SELECT calculate_distance_km($1,$2,$3,$4) AS km',
      [parseFloat(pickup_lat), parseFloat(pickup_lng), parseFloat(destination_lat), parseFloat(destination_lng)]
    );
    const distanceKm = parseFloat(distRows[0].km);

    const tariff = await getTariffFromDB(service_type);
    const fare   = calculateFare(service_type, distanceKm, tariff);

    // Rute & polyline via Google Maps Directions API (fallback Haversine jika key kosong)
    const routeInfo = await getDirections(
      parseFloat(pickup_lat), parseFloat(pickup_lng),
      parseFloat(destination_lat), parseFloat(destination_lng)
    );

    // Driver terdekat via PostGIS
    const drivers = await findNearbyDriversPostGIS(
      parseFloat(pickup_lat), parseFloat(pickup_lng), 5000, fare.vehicle_type
    );

    return sendSuccess(res, {
      ...fare,
      service_type,
      // Gunakan jarak Google Maps jika lebih akurat, fallback ke PostGIS
      distance_km       : routeInfo.success ? routeInfo.distance_km : distanceKm,
      duration_text     : routeInfo.duration_text || `${Math.ceil(distanceKm / 0.5)} menit`,
      duration_min      : routeInfo.duration_min  || Math.ceil(distanceKm / 0.5),
      polyline          : routeInfo.polyline || null,
      route_source      : routeInfo.source,
      nearby_drivers_count: drivers.length,
      closest_driver_km : drivers[0] ? (drivers[0].distance_meters / 1000).toFixed(2) : null,
      estimated_arrival : drivers[0]
        ? `${Math.ceil(drivers[0].distance_meters / 1000 / 0.4)}-${Math.ceil(drivers[0].distance_meters / 1000 / 0.3)} menit`
        : 'Belum ada driver terdekat'
    }, 'Estimasi berhasil dihitung.');
  } catch (err) {
    return sendError(res, 'Gagal menghitung estimasi: ' + err.message, 500);
  }
};

// ─── POST /api/orders ────────────────────────────────────────
const createOrder = async (req, res) => {
  try {
    const {
      service_type, pickup_address, pickup_lat, pickup_lng,
      destination_address, destination_lat, destination_lng,
      notes = '', payment_method = 'cash'
    } = req.body;

    const rideServices = ['GooRide','GooCard','GooKurir','GooAmbulance'];
    if (!service_type || !rideServices.includes(service_type))
      return sendError(res, `Layanan ${service_type || '?'} tidak valid.`);
    if (!pickup_lat || !pickup_lng || !destination_lat || !destination_lng)
      return sendError(res, 'Koordinat titik jemput dan tujuan wajib diisi.');

    // Hitung jarak via PostGIS
    const { rows: distRows } = await query(
      'SELECT calculate_distance_km($1,$2,$3,$4) AS km',
      [parseFloat(pickup_lat), parseFloat(pickup_lng), parseFloat(destination_lat), parseFloat(destination_lng)]
    );
    const distanceKm = parseFloat(distRows[0].km);
    const tariff  = await getTariffFromDB(service_type);
    const fare    = calculateFare(service_type, distanceKm, tariff);
    const prefixes = { GooRide:'GRD', GooCard:'GCD', GooKurir:'GKR', GooAmbulance:'GAB' };

    // Cari driver via PostGIS
    const nearbyDrivers = await findNearbyDriversPostGIS(
      parseFloat(pickup_lat), parseFloat(pickup_lng), 5000, fare.vehicle_type
    );
    const assignedDriver = nearbyDrivers[0] || null;

    const result = await withTransaction(async (client) => {
      // Cek & kurangi wallet jika bayar wallet
      if (payment_method === 'wallet') {
        const { rows: uw } = await client.query(
          'SELECT wallet_balance FROM users WHERE id = $1 FOR UPDATE', [req.user.id]
        );
        if (Number(uw[0].wallet_balance) < fare.total_amount)
          throw new Error(`Saldo GooWallet tidak cukup. Saldo: ${formatRupiah(uw[0].wallet_balance)}, Dibutuhkan: ${formatRupiah(fare.total_amount)}`);

        const balBefore = Number(uw[0].wallet_balance);
        await client.query(
          'UPDATE users SET wallet_balance = wallet_balance - $1 WHERE id = $2',
          [fare.total_amount, req.user.id]
        );
        const txRefCode = uuidv4();
        await client.query(
          `INSERT INTO wallet_transactions
           (id, user_id, type, amount, balance_before, balance_after, description, reference_code, status)
           VALUES ($1,$2,'debit',$3,$4,$5,$6,$7,'success')`,
          [uuidv4(), req.user.id, fare.total_amount, balBefore, balBefore - fare.total_amount,
           `Pembayaran ${service_type}`, txRefCode]
        );
      }

      // Insert order
      const orderId = uuidv4();
      const orderNo = generateOrderNumber(prefixes[service_type] || 'GNB');
      const { rows: orderRows } = await client.query(
        `INSERT INTO orders (
           id, order_number, user_id, driver_id, service_type,
           pickup_point, pickup_address,
           destination_point, destination_address,
           distance_km, base_fare, distance_fare, service_fee, total_amount,
           payment_method, payment_status, status, notes
         ) VALUES (
           $1,$2,$3,$4,$5,
           ST_SetSRID(ST_MakePoint($6,$7),4326), $8,
           ST_SetSRID(ST_MakePoint($9,$10),4326), $11,
           $12,$13,$14,$15,$16,
           $17,$18,$19,$20
         ) RETURNING id, order_number, service_type, status, total_amount,
                     payment_method, created_at`,
        [
          orderId, orderNo, req.user.id,
          assignedDriver ? assignedDriver.driver_id : null,
          service_type,
          parseFloat(pickup_lng), parseFloat(pickup_lat), pickup_address || 'Titik jemput',
          parseFloat(destination_lng), parseFloat(destination_lat), destination_address || 'Tujuan',
          fare.distance_km, fare.base_fare, fare.distance_fare, fare.service_fee, fare.total_amount,
          payment_method,
          payment_method === 'wallet' ? 'paid' : 'pending',
          assignedDriver ? 'searching' : 'no_driver',
          notes
        ]
      );

      // Tandai driver tidak available sementara
      if (assignedDriver) {
        await client.query(
          'UPDATE drivers SET is_available = FALSE WHERE id = $1',
          [assignedDriver.driver_id]
        );
      }

      // Buat notifikasi untuk user
      await client.query(
        `INSERT INTO notifications (user_id, type, title, message, data)
         VALUES ($1,'order_created','Pesanan Dibuat',
                 $2, $3)`,
        [req.user.id,
         `Pesanan ${service_type} Anda telah dibuat. Nomor: ${orderNo}`,
         JSON.stringify({ order_id: orderId, order_number: orderNo })]
      );

      return orderRows[0];
    });

    return sendSuccess(res, {
      order: result,
      assigned_driver: assignedDriver ? {
        name:          assignedDriver.driver_name,
        phone:         assignedDriver.driver_phone,
        vehicle_plate: assignedDriver.vehicle_plate,
        vehicle_type:  assignedDriver.vehicle_type,
        rating:        assignedDriver.rating,
        distance_km:   (assignedDriver.distance_meters / 1000).toFixed(2)
      } : null,
      fare: { ...fare },
      message: assignedDriver
        ? `Driver ditemukan! Menunggu konfirmasi dari ${assignedDriver.driver_name}...`
        : 'Sedang mencari driver terdekat...'
    }, 'Pesanan berhasil dibuat!', 201);
  } catch (err) {
    return sendError(res, err.message.startsWith('Saldo') ? err.message : 'Gagal membuat pesanan: ' + err.message, 400);
  }
};

// ─── GET /api/orders ─────────────────────────────────────────
const getMyOrders = async (req, res) => {
  try {
    const { status, service_type, page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;
    const params = [req.user.id];
    let where = 'o.user_id = $1';
    if (status)       { params.push(status);       where += ` AND o.status = $${params.length}`; }
    if (service_type) { params.push(service_type); where += ` AND o.service_type = $${params.length}`; }

    const { rows: orders } = await query(
      `SELECT o.id, o.order_number, o.service_type, o.status,
              o.pickup_address, o.destination_address, o.distance_km,
              o.total_amount, o.payment_method, o.payment_status,
              o.sos_activated, o.created_at, o.completed_at,
              ST_Y(o.pickup_point::geometry) AS pickup_lat,
              ST_X(o.pickup_point::geometry) AS pickup_lng,
              ST_Y(o.destination_point::geometry) AS destination_lat,
              ST_X(o.destination_point::geometry) AS destination_lng,
              -- driver info
              u.name AS driver_name, u.phone AS driver_phone,
              d.vehicle_plate, d.vehicle_type, d.vehicle_model,
              ST_Y(d.location::geometry) AS driver_lat,
              ST_X(d.location::geometry) AS driver_lng
       FROM orders o
       LEFT JOIN drivers d ON d.id = o.driver_id
       LEFT JOIN users   u ON u.id = d.user_id
       WHERE ${where}
       ORDER BY o.created_at DESC
       LIMIT $${params.length+1} OFFSET $${params.length+2}`,
      [...params, limit, offset]
    );

    const { rows: countRows } = await query(
      `SELECT COUNT(*) FROM orders o WHERE ${where}`, params
    );

    return sendSuccess(res, {
      orders,
      total:       parseInt(countRows[0].count),
      page:        parseInt(page),
      limit:       parseInt(limit),
      total_pages: Math.ceil(parseInt(countRows[0].count) / limit)
    });
  } catch (err) {
    return sendError(res, 'Gagal mengambil pesanan: ' + err.message, 500);
  }
};

// ─── GET /api/orders/:id ─────────────────────────────────────
const getOrderById = async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT o.*,
              ST_Y(o.pickup_point::geometry)      AS pickup_lat,
              ST_X(o.pickup_point::geometry)      AS pickup_lng,
              ST_Y(o.destination_point::geometry) AS destination_lat,
              ST_X(o.destination_point::geometry) AS destination_lng,
              u.name AS driver_name, u.phone AS driver_phone,
              d.vehicle_plate, d.vehicle_type, d.vehicle_model, d.vehicle_color, d.rating AS driver_rating,
              ST_Y(d.location::geometry) AS driver_lat,
              ST_X(d.location::geometry) AS driver_lng
       FROM orders o
       LEFT JOIN drivers d ON d.id = o.driver_id
       LEFT JOIN users   u ON u.id = d.user_id
       WHERE o.id = $1 OR o.order_number = $1`, [req.params.id]
    );
    if (!rows.length) return sendError(res, 'Pesanan tidak ditemukan.', 404);
    const order = rows[0];
    if (order.user_id !== req.user.id && req.user.role !== 'admin') {
      const { rows: dr } = await query('SELECT id FROM drivers WHERE user_id=$1', [req.user.id]);
      if (!dr.length || order.driver_id !== dr[0].id)
        return sendError(res, 'Tidak ada akses ke pesanan ini.', 403);
    }
    return sendSuccess(res, { order });
  } catch (err) {
    return sendError(res, 'Gagal mengambil detail pesanan: ' + err.message, 500);
  }
};

// ─── PUT /api/orders/:id/cancel ──────────────────────────────
const cancelOrder = async (req, res) => {
  try {
    const { cancel_reason } = req.body;
    await withTransaction(async (client) => {
      const { rows } = await client.query(
        'SELECT * FROM orders WHERE id = $1 FOR UPDATE', [req.params.id]
      );
      if (!rows.length) throw new Error('NOT_FOUND');
      const order = rows[0];
      if (order.user_id !== req.user.id) throw new Error('FORBIDDEN');
      if (['completed','cancelled'].includes(order.status)) throw new Error('ALREADY_DONE');

      await client.query(
        `UPDATE orders SET status='cancelled', cancelled_at=NOW(), cancel_reason=$1 WHERE id=$2`,
        [cancel_reason || 'Dibatalkan oleh pengguna', req.params.id]
      );

      // Kembalikan driver ke available
      if (order.driver_id) {
        await client.query('UPDATE drivers SET is_available=TRUE WHERE id=$1', [order.driver_id]);
      }

      // Refund wallet
      if (order.payment_method === 'wallet' && order.payment_status === 'paid') {
        const { rows: uw } = await client.query('SELECT wallet_balance FROM users WHERE id=$1 FOR UPDATE', [req.user.id]);
        const balBefore = Number(uw[0].wallet_balance);
        await client.query('UPDATE users SET wallet_balance = wallet_balance + $1 WHERE id=$2',
          [order.total_amount, req.user.id]);
        await client.query(
          `INSERT INTO wallet_transactions (user_id, type, amount, balance_before, balance_after, description)
           VALUES ($1,'credit',$2,$3,$4,$5)`,
          [req.user.id, order.total_amount, balBefore, balBefore + Number(order.total_amount),
           `Refund pembatalan pesanan ${order.order_number}`]
        );
      }
    });
    return sendSuccess(res, null, 'Pesanan berhasil dibatalkan.');
  } catch (err) {
    if (err.message === 'NOT_FOUND') return sendError(res, 'Pesanan tidak ditemukan.', 404);
    if (err.message === 'FORBIDDEN') return sendError(res, 'Tidak ada akses.', 403);
    if (err.message === 'ALREADY_DONE') return sendError(res, 'Pesanan sudah selesai atau dibatalkan.');
    return sendError(res, 'Gagal membatalkan: ' + err.message, 500);
  }
};

// ─── POST /api/orders/:id/sos ────────────────────────────────
const activateSOS = async (req, res) => {
  try {
    const { lat, lng } = req.body;
    const sosPoint = lat && lng
      ? `ST_SetSRID(ST_MakePoint(${parseFloat(lng)},${parseFloat(lat)}),4326)`
      : 'NULL';

    await query(
      `UPDATE orders SET sos_activated=TRUE, sos_at=NOW(),
       sos_location = ${sosPoint}
       WHERE id=$1 AND user_id=$2`,
      [req.params.id, req.user.id]
    );
    await query(
      `INSERT INTO notifications (user_id, type, title, message, data)
       VALUES ($1,'sos','🚨 SOS DARURAT',
               'Pengguna membutuhkan bantuan darurat segera!',
               $2)`,
      ['b0c53077-fa19-4ef5-ad9a-e764e19f7ea8',  // admin
       JSON.stringify({ order_id: req.params.id, user_id: req.user.id, lat, lng })]
    );
    return sendSuccess(res, { sos: true }, '🚨 SOS Darurat telah diaktifkan! Tim GONAB akan segera menghubungi Anda.');
  } catch (err) {
    return sendError(res, 'Gagal mengaktifkan SOS: ' + err.message, 500);
  }
};

// ─── Driver: GET /api/driver/orders/available ────────────────
const getAvailableOrders = async (req, res) => {
  try {
    const { rows: dr } = await query('SELECT id FROM drivers WHERE user_id=$1', [req.user.id]);
    if (!dr.length) return sendError(res, 'Profil driver tidak ditemukan.', 404);

    const { rows } = await query(
      `SELECT o.id, o.order_number, o.service_type,
              o.pickup_address, o.destination_address, o.distance_km,
              o.total_amount, o.payment_method, o.created_at,
              ST_Y(o.pickup_point::geometry) AS pickup_lat,
              ST_X(o.pickup_point::geometry) AS pickup_lng,
              u.name AS customer_name, u.phone AS customer_phone
       FROM orders o
       JOIN users u ON u.id = o.user_id
       WHERE o.driver_id=$1 AND o.status IN ('searching','accepted')
       ORDER BY o.created_at DESC`,
      [dr[0].id]
    );
    return sendSuccess(res, { orders: rows });
  } catch (err) {
    return sendError(res, 'Gagal mengambil pesanan: ' + err.message, 500);
  }
};

// ─── Driver: PUT /api/driver/orders/:id/status ───────────────
const updateOrderStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['accepted','on_the_way','arrived','in_progress','completed','rejected'];
    if (!validStatuses.includes(status))
      return sendError(res, 'Status tidak valid.');

    const { rows: dr } = await query('SELECT id FROM drivers WHERE user_id=$1', [req.user.id]);
    if (!dr.length) return sendError(res, 'Profil driver tidak ditemukan.', 404);
    const driverId = dr[0].id;

    await withTransaction(async (client) => {
      const { rows: orderRows } = await client.query(
        'SELECT * FROM orders WHERE id=$1 AND driver_id=$2 FOR UPDATE',
        [req.params.id, driverId]
      );
      if (!orderRows.length) throw new Error('NOT_FOUND');
      const order = orderRows[0];

      const timeFields = {
        accepted:    'accepted_at = NOW()',
        picked_up:   'picked_up_at = NOW()',
        completed:   'completed_at = NOW()',
      };
      const extraUpdate = status === 'accepted'   ? ', accepted_at = NOW()' :
                          status === 'in_progress' ? ', picked_up_at = NOW()' :
                          status === 'completed'   ? ', completed_at = NOW(), payment_status = \'paid\'' : '';

      await client.query(
        `UPDATE orders SET status=$1 ${extraUpdate} WHERE id=$2`,
        [status, req.params.id]
      );

      if (status === 'completed') {
        // Earnings: 80% ke driver
        const earning = Math.floor(Number(order.total_amount) * 0.8);
        await client.query(
          `UPDATE drivers SET total_trips = total_trips+1, total_earnings = total_earnings+$1, is_available=TRUE WHERE id=$2`,
          [earning, driverId]
        );
        await client.query(
          'UPDATE users SET wallet_balance = wallet_balance + $1 WHERE id = (SELECT user_id FROM drivers WHERE id=$2)',
          [earning, driverId]
        );
        await client.query(
          `INSERT INTO wallet_transactions (user_id, type, amount, balance_before, balance_after, description)
           VALUES ((SELECT user_id FROM drivers WHERE id=$1), 'credit', $2, 0, $2, $3)`,
          [driverId, earning, `Pendapatan GooRide - ${order.order_number}`]
        );
      }
      if (status === 'rejected') {
        await client.query('UPDATE drivers SET is_available=TRUE WHERE id=$1', [driverId]);
      }
    });

    const { rows: updated } = await query('SELECT id, order_number, status FROM orders WHERE id=$1', [req.params.id]);
    return sendSuccess(res, { order: updated[0] }, `Status pesanan: ${status}`);
  } catch (err) {
    if (err.message === 'NOT_FOUND') return sendError(res, 'Pesanan tidak ditemukan.', 404);
    return sendError(res, 'Gagal memperbarui status: ' + err.message, 500);
  }
};

module.exports = {
  getEstimate, createOrder, getMyOrders, getOrderById,
  cancelOrder, activateSOS, getAvailableOrders, updateOrderStatus
};
