const { query } = require('../config/database');
const { sendSuccess, sendError } = require('../utils/helpers');

// ─── GET /api/drivers/nearby ─────────────────────────────────
const getNearbyDrivers = async (req, res) => {
  try {
    const { lat, lng, radius = 5, vehicle_type } = req.query;
    if (!lat || !lng) return sendError(res, 'Koordinat lokasi wajib diisi.');

    const params = [parseFloat(lng), parseFloat(lat), parseFloat(radius) * 1000];
    let vehicleFilter = '';
    if (vehicle_type) {
      params.push(vehicle_type);
      vehicleFilter = `AND d.vehicle_type = $${params.length}`;
    }

    const { rows } = await query(
      `SELECT d.id, u.name, u.phone, u.avatar AS profile_photo,
              d.vehicle_type, d.vehicle_plate, d.vehicle_model, d.vehicle_color,
              d.rating, d.total_trips, d.is_verified,
              ST_Y(d.location::geometry) AS current_lat,
              ST_X(d.location::geometry) AS current_lng,
              ST_Distance(
                d.location::geography,
                ST_SetSRID(ST_MakePoint($1,$2),4326)::geography
              ) / 1000 AS distance_km
       FROM drivers d
       JOIN users u ON u.id = d.user_id
       WHERE d.is_online = TRUE
         AND d.is_verified = TRUE
         AND d.location IS NOT NULL
         AND ST_DWithin(
           d.location::geography,
           ST_SetSRID(ST_MakePoint($1,$2),4326)::geography, $3
         )
         ${vehicleFilter}
       ORDER BY distance_km ASC`,
      params
    );
    return sendSuccess(res, { drivers: rows, count: rows.length });
  } catch (err) {
    return sendError(res, 'Gagal mengambil driver terdekat: ' + err.message, 500);
  }
};

// ─── PUT /api/drivers/location ───────────────────────────────
const updateDriverLocation = async (req, res) => {
  try {
    const { lat, lng } = req.body;
    if (!lat || !lng) return sendError(res, 'Koordinat wajib diisi.');

    const driverRes = await query(
      `SELECT id FROM drivers WHERE user_id = $1`, [req.user.id]);
    if (!driverRes.rows.length) return sendError(res, 'Data driver tidak ditemukan.', 404);

    await query(
      `UPDATE drivers SET
         location = ST_SetSRID(ST_MakePoint($1,$2),4326),
         location_updated_at = NOW()
       WHERE id = $3`,
      [parseFloat(lng), parseFloat(lat), driverRes.rows[0].id]
    );
    return sendSuccess(res, { lat, lng }, 'Lokasi berhasil diperbarui.');
  } catch (err) {
    return sendError(res, 'Gagal memperbarui lokasi: ' + err.message, 500);
  }
};

// ─── PUT /api/drivers/online ──────────────────────────────────
const toggleOnlineStatus = async (req, res) => {
  try {
    const { is_online } = req.body;
    const driverRes = await query(
      `SELECT id FROM drivers WHERE user_id = $1`, [req.user.id]);
    if (!driverRes.rows.length) return sendError(res, 'Data driver tidak ditemukan.', 404);

    const { rows } = await query(
      `UPDATE drivers SET is_online = $1 WHERE id = $2 RETURNING id, is_online`,
      [is_online !== false, driverRes.rows[0].id]
    );
    return sendSuccess(res, { driver: rows[0] },
      `Status ${rows[0].is_online ? 'Online' : 'Offline'}`);
  } catch (err) {
    return sendError(res, 'Gagal mengubah status: ' + err.message, 500);
  }
};

// ─── GET /api/drivers/profile ─────────────────────────────────
const getDriverProfile = async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT d.*, u.name, u.phone, u.email, u.avatar AS profile_photo, u.wallet_balance,
              ST_Y(d.location::geometry) AS current_lat,
              ST_X(d.location::geometry) AS current_lng
       FROM drivers d JOIN users u ON u.id = d.user_id
       WHERE d.user_id = $1`, [req.user.id]);
    if (!rows.length) return sendError(res, 'Profil driver tidak ditemukan.', 404);
    return sendSuccess(res, { driver: rows[0] });
  } catch (err) {
    return sendError(res, 'Gagal mengambil profil: ' + err.message, 500);
  }
};

// ─── GET /api/drivers/orders ──────────────────────────────────
const getDriverOrders = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const driverRes = await query(
      `SELECT id FROM drivers WHERE user_id = $1`, [req.user.id]);
    if (!driverRes.rows.length) return sendError(res, 'Data driver tidak ditemukan.', 404);
    const driverId = driverRes.rows[0].id;

    const params = [driverId];
    let where = `WHERE o.driver_id = $1`;
    if (status) { params.push(status); where += ` AND o.status=$${params.length}`; }

    const countRes = await query(`SELECT COUNT(*) FROM orders o ${where}`, params);
    params.push(parseInt(limit), offset);
    const { rows } = await query(
      `SELECT o.*, u.name AS user_name, u.phone AS user_phone
       FROM orders o JOIN users u ON u.id=o.user_id
       ${where} ORDER BY o.created_at DESC
       LIMIT $${params.length-1} OFFSET $${params.length}`, params);

    return sendSuccess(res, {
      orders: rows,
      total: parseInt(countRes.rows[0].count),
      page: parseInt(page),
      total_pages: Math.ceil(countRes.rows[0].count / limit)
    });
  } catch (err) {
    return sendError(res, 'Gagal mengambil riwayat order: ' + err.message, 500);
  }
};

// ─── PUT /api/drivers/orders/:id/status ──────────────────────
const updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, lat, lng } = req.body;
    const allowed = ['accepted', 'on_the_way', 'arrived', 'in_progress', 'completed', 'cancelled'];
    if (!allowed.includes(status)) return sendError(res, 'Status tidak valid.');

    const driverRes = await query(
      `SELECT id FROM drivers WHERE user_id=$1`, [req.user.id]);
    if (!driverRes.rows.length) return sendError(res, 'Data driver tidak ditemukan.', 404);

    const extra = {};
    if (status === 'completed') extra.completed_at = 'NOW()';
    if (status === 'accepted')  extra.accepted_at  = 'NOW()';

    const setExtra = Object.keys(extra).map(k => `${k}=${extra[k]}`).join(', ');
    const { rows } = await query(
      `UPDATE orders SET status=$1 ${setExtra ? ',' + setExtra : ''}
       WHERE id=$2 AND driver_id=$3
       RETURNING *`,
      [status, id, driverRes.rows[0].id]
    );
    if (!rows.length) return sendError(res, 'Order tidak ditemukan atau bukan milik driver ini.', 404);

    // Update driver location if provided
    if (lat && lng) {
      await query(
        `UPDATE drivers SET location=ST_SetSRID(ST_MakePoint($1,$2),4326), location_updated_at=NOW()
         WHERE id=$3`, [parseFloat(lng), parseFloat(lat), driverRes.rows[0].id]);
    }

    // Update total_trips on completion
    if (status === 'completed') {
      await query(`UPDATE drivers SET total_trips=total_trips+1 WHERE id=$1`, [driverRes.rows[0].id]);
    }

    return sendSuccess(res, { order: rows[0] }, `Status order diperbarui menjadi ${status}.`);
  } catch (err) {
    return sendError(res, 'Gagal memperbarui status order: ' + err.message, 500);
  }
};

// ─── GET /api/drivers/earnings ───────────────────────────────
const getEarnings = async (req, res) => {
  try {
    const { period = 'today' } = req.query;
    const driverRes = await query(
      `SELECT id FROM drivers WHERE user_id=$1`, [req.user.id]);
    if (!driverRes.rows.length) return sendError(res, 'Data driver tidak ditemukan.', 404);
    const driverId = driverRes.rows[0].id;

    const intervalMap = { today: '1 day', week: '7 days', month: '30 days' };
    const interval = intervalMap[period] || '1 day';

    const [summary, breakdown] = await Promise.all([
      query(
        `SELECT COUNT(*) AS trips,
                COALESCE(SUM(total_amount - service_fee),0) AS earnings,
                COALESCE(SUM(distance_km),0) AS total_km,
                COALESCE(AVG(user_rating),0) AS avg_rating
         FROM orders
         WHERE driver_id=$1 AND status='completed'
           AND completed_at >= NOW() - INTERVAL '${interval}'`,
        [driverId]),
      query(
        `SELECT DATE(completed_at) AS date,
                COUNT(*) AS trips,
                SUM(total_amount - service_fee) AS earnings
         FROM orders
         WHERE driver_id=$1 AND status='completed'
           AND completed_at >= NOW() - INTERVAL '30 days'
         GROUP BY DATE(completed_at) ORDER BY date DESC`,
        [driverId])
    ]);

    return sendSuccess(res, {
      summary: summary.rows[0],
      daily_breakdown: breakdown.rows,
      period
    });
  } catch (err) {
    return sendError(res, 'Gagal mengambil pendapatan: ' + err.message, 500);
  }
};

module.exports = {
  getNearbyDrivers, updateDriverLocation, toggleOnlineStatus,
  getDriverProfile, getDriverOrders, updateOrderStatus, getEarnings
};
