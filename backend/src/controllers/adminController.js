const { query, withTransaction } = require('../config/database');
const { sendSuccess, sendError } = require('../utils/helpers');

// ─── GET /api/admin/dashboard ────────────────────────────────
const getDashboard = async (req, res) => {
  try {
    const [users, drivers, merchants, orders, revenue, todayStats] = await Promise.all([
      query(`SELECT
               COUNT(*) FILTER (WHERE role='customer')  AS total_users,
               COUNT(*) FILTER (WHERE role='driver')    AS total_drivers,
               COUNT(*) FILTER (WHERE role='merchant')  AS total_merchants
             FROM users`),
      query(`SELECT
               COUNT(*) FILTER (WHERE is_verified=TRUE)  AS verified_drivers,
               COUNT(*) FILTER (WHERE is_online=TRUE)    AS online_drivers
             FROM drivers`),
      query(`SELECT COUNT(*) FILTER (WHERE is_verified=TRUE) AS verified_merchants FROM merchants`),
      query(`SELECT
               COUNT(*)                                         AS total_orders,
               COUNT(*) FILTER (WHERE status='completed')      AS completed_orders,
               COUNT(*) FILTER (WHERE status IN ('searching','pending','accepted','on_the_way')) AS pending_orders
             FROM orders`),
      query(`SELECT COALESCE(SUM(total_amount),0) AS total_revenue,
                    COALESCE(SUM(service_fee),0)   AS platform_fee
             FROM orders WHERE status='completed'`),
      query(`SELECT
               COUNT(*) AS today_orders,
               COALESCE(SUM(total_amount) FILTER (WHERE status='completed'),0) AS today_revenue
             FROM orders WHERE DATE(created_at)=CURRENT_DATE`)
    ]);

    const serviceBreakdown = await query(`
      SELECT service_type, COUNT(*) AS cnt
      FROM orders GROUP BY service_type ORDER BY cnt DESC`);

    const recentOrders = await query(`
      SELECT o.*, u.name AS user_name, u.phone AS user_phone,
             d.vehicle_type, du.name AS driver_name
      FROM orders o
      JOIN users u ON u.id = o.user_id
      LEFT JOIN drivers d ON d.id = o.driver_id
      LEFT JOIN users du ON du.id = d.user_id
      ORDER BY o.created_at DESC LIMIT 10`);

    return sendSuccess(res, {
      stats: {
        ...users.rows[0],
        ...drivers.rows[0],
        ...merchants.rows[0],
        ...orders.rows[0],
        ...revenue.rows[0],
        ...todayStats.rows[0]
      },
      service_breakdown: serviceBreakdown.rows.reduce((acc, r) => {
        acc[r.service_type] = parseInt(r.cnt); return acc;
      }, {}),
      recent_orders: recentOrders.rows
    });
  } catch (err) {
    return sendError(res, 'Gagal mengambil data dashboard: ' + err.message, 500);
  }
};

// ─── GET /api/admin/users ─────────────────────────────────────
const getUsers = async (req, res) => {
  try {
    const { search, role, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    const params = [];
    let where = 'WHERE 1=1';
    if (role) { params.push(role); where += ` AND u.role=$${params.length}`; }
    if (search) {
      params.push(`%${search}%`);
      where += ` AND (u.name ILIKE $${params.length} OR u.phone ILIKE $${params.length})`;
    }
    const countRes = await query(`SELECT COUNT(*) FROM users u ${where}`, params);
    params.push(parseInt(limit), offset);
    const { rows } = await query(
      `SELECT u.id, u.name, u.phone, u.email, u.role, u.wallet_balance,
              u.is_verified, u.is_active, u.created_at,
              COUNT(o.id) AS total_orders
       FROM users u
       LEFT JOIN orders o ON o.user_id = u.id
       ${where}
       GROUP BY u.id ORDER BY u.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
    return sendSuccess(res, {
      users: rows,
      total: parseInt(countRes.rows[0].count),
      page: parseInt(page),
      total_pages: Math.ceil(countRes.rows[0].count / limit)
    });
  } catch (err) {
    return sendError(res, 'Gagal mengambil daftar user: ' + err.message, 500);
  }
};

// ─── PUT /api/admin/users/:id/toggle ─────────────────────────
const toggleUser = async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await query(
      `UPDATE users SET is_active = NOT is_active WHERE id=$1 RETURNING id, name, is_active`, [id]);
    if (!rows.length) return sendError(res, 'User tidak ditemukan.', 404);
    return sendSuccess(res, { user: rows[0] }, `User ${rows[0].is_active ? 'diaktifkan' : 'dinonaktifkan'}.`);
  } catch (err) {
    return sendError(res, 'Gagal mengubah status user: ' + err.message, 500);
  }
};

// ─── GET /api/admin/drivers ───────────────────────────────────
const getDrivers = async (req, res) => {
  try {
    const { verified, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    const params = [];
    let where = 'WHERE 1=1';
    if (verified !== undefined) {
      params.push(verified === 'true');
      where += ` AND d.is_verified=$${params.length}`;
    }
    const countRes = await query(`SELECT COUNT(*) FROM drivers d ${where}`, params);
    params.push(parseInt(limit), offset);
    const { rows } = await query(
      `SELECT d.*, u.name, u.phone, u.email, u.avatar AS profile_photo,
              ST_Y(d.location::geometry) AS current_lat,
              ST_X(d.location::geometry) AS current_lng
       FROM drivers d JOIN users u ON u.id=d.user_id
       ${where} ORDER BY d.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
    return sendSuccess(res, {
      drivers: rows,
      total: parseInt(countRes.rows[0].count),
      page: parseInt(page),
      total_pages: Math.ceil(countRes.rows[0].count / limit)
    });
  } catch (err) {
    return sendError(res, 'Gagal mengambil daftar driver: ' + err.message, 500);
  }
};

// ─── PUT /api/admin/drivers/:id/verify ───────────────────────
const verifyDriver = async (req, res) => {
  try {
    const { id } = req.params;
    const { verified } = req.body;
    const { rows } = await query(
      `UPDATE drivers SET is_verified=$1, verified_at=CASE WHEN $1 THEN NOW() ELSE NULL END
       WHERE id=$2 RETURNING id, is_verified`,
      [verified !== false, id]);
    if (!rows.length) return sendError(res, 'Driver tidak ditemukan.', 404);
    await query(
      `INSERT INTO admin_logs(admin_id,action,target_type,target_id,description)
       VALUES($1,'verify_driver','driver',$2,$3)`,
      [req.user.id, id, `Driver ${rows[0].is_verified ? 'diverifikasi' : 'dibatalkan verifikasi'}`]);
    return sendSuccess(res, { driver: rows[0] }, `Driver berhasil ${rows[0].is_verified ? 'diverifikasi' : 'dibatalkan'}.`);
  } catch (err) {
    return sendError(res, 'Gagal verifikasi driver: ' + err.message, 500);
  }
};

// ─── GET /api/admin/merchants ────────────────────────────────
const getMerchants = async (req, res) => {
  try {
    const { verified, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    const params = [];
    let where = 'WHERE 1=1';
    if (verified !== undefined) {
      params.push(verified === 'true');
      where += ` AND m.is_verified=$${params.length}`;
    }
    const countRes = await query(`SELECT COUNT(*) FROM merchants m ${where}`, params);
    params.push(parseInt(limit), offset);
    const { rows } = await query(
      `SELECT m.*, u.name AS owner_name, u.phone AS owner_phone,
              ST_Y(m.location::geometry) AS lat, ST_X(m.location::geometry) AS lng
       FROM merchants m JOIN users u ON u.id=m.user_id
       ${where} ORDER BY m.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
    return sendSuccess(res, {
      merchants: rows,
      total: parseInt(countRes.rows[0].count),
      page: parseInt(page),
      total_pages: Math.ceil(countRes.rows[0].count / limit)
    });
  } catch (err) {
    return sendError(res, 'Gagal mengambil daftar merchant: ' + err.message, 500);
  }
};

// ─── PUT /api/admin/merchants/:id/verify ─────────────────────
const verifyMerchant = async (req, res) => {
  try {
    const { id } = req.params;
    const { verified } = req.body;
    const { rows } = await query(
      `UPDATE merchants SET is_verified=$1 WHERE id=$2 RETURNING id, store_name, is_verified`,
      [verified !== false, id]);
    if (!rows.length) return sendError(res, 'Merchant tidak ditemukan.', 404);
    await query(
      `INSERT INTO admin_logs(admin_id,action,target_type,target_id,description)
       VALUES($1,'verify_merchant','merchant',$2,$3)`,
      [req.user.id, id, `Merchant ${rows[0].store_name} ${rows[0].is_verified ? 'diverifikasi' : 'dibatalkan'}`]);
    return sendSuccess(res, { merchant: rows[0] });
  } catch (err) {
    return sendError(res, 'Gagal verifikasi merchant: ' + err.message, 500);
  }
};

// ─── GET /api/admin/orders ───────────────────────────────────
const getOrders = async (req, res) => {
  try {
    const { status, service_type, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    const params = [];
    let where = 'WHERE 1=1';
    if (status) { params.push(status); where += ` AND o.status=$${params.length}`; }
    if (service_type) { params.push(service_type); where += ` AND o.service_type=$${params.length}`; }
    const countRes = await query(`SELECT COUNT(*) FROM orders o ${where}`, params);
    params.push(parseInt(limit), offset);
    const { rows } = await query(
      `SELECT o.*, u.name AS user_name, u.phone AS user_phone,
              du.name AS driver_name, du.phone AS driver_phone
       FROM orders o
       JOIN users u ON u.id=o.user_id
       LEFT JOIN drivers d ON d.id=o.driver_id
       LEFT JOIN users du ON du.id=d.user_id
       ${where} ORDER BY o.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
    return sendSuccess(res, {
      orders: rows,
      total: parseInt(countRes.rows[0].count),
      page: parseInt(page),
      total_pages: Math.ceil(countRes.rows[0].count / limit)
    });
  } catch (err) {
    return sendError(res, 'Gagal mengambil daftar order: ' + err.message, 500);
  }
};

// ─── GET /api/admin/tariffs ──────────────────────────────────
const getTariffs = async (req, res) => {
  try {
    const { rows } = await query(`SELECT * FROM tariffs ORDER BY service_type`);
    return sendSuccess(res, { tariffs: rows });
  } catch (err) {
    return sendError(res, 'Gagal mengambil tarif: ' + err.message, 500);
  }
};

// ─── PUT /api/admin/tariffs/:id ──────────────────────────────
const updateTariff = async (req, res) => {
  try {
    const { id } = req.params;
    const { base_fare, per_km_rate, min_fare, surge_multiplier } = req.body;
    const fields = [];
    const params = [];
    if (base_fare !== undefined)       { params.push(base_fare);       fields.push(`base_fare=$${params.length}`); }
    if (per_km_rate !== undefined)     { params.push(per_km_rate);     fields.push(`per_km_rate=$${params.length}`); }
    if (min_fare !== undefined)        { params.push(min_fare);        fields.push(`min_fare=$${params.length}`); }
    if (surge_multiplier !== undefined){ params.push(surge_multiplier);fields.push(`surge_multiplier=$${params.length}`); }
    if (!fields.length) return sendError(res, 'Tidak ada data yang diubah.');
    params.push(id);
    const { rows } = await query(
      `UPDATE tariffs SET ${fields.join(',')} WHERE id=$${params.length} RETURNING *`, params);
    if (!rows.length) return sendError(res, 'Tarif tidak ditemukan.', 404);
    await query(
      `INSERT INTO admin_logs(admin_id,action,target_type,target_id,description)
       VALUES($1,'update_tariff','tariff',$2,$3)`,
      [req.user.id, id, `Tarif ${rows[0].service_type} diperbarui`]);
    return sendSuccess(res, { tariff: rows[0] }, 'Tarif berhasil diperbarui.');
  } catch (err) {
    return sendError(res, 'Gagal memperbarui tarif: ' + err.message, 500);
  }
};

// ─── GET /api/admin/sos ──────────────────────────────────────
const getSosAlerts = async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT o.id, o.order_number, o.service_type, o.status,
             o.sos_at AS sos_triggered_at,
             u.name AS user_name, u.phone AS user_phone,
             du.name AS driver_name, du.phone AS driver_phone
      FROM orders o
      JOIN users u ON u.id=o.user_id
      LEFT JOIN drivers d ON d.id=o.driver_id
      LEFT JOIN users du ON du.id=d.user_id
      WHERE o.sos_activated = TRUE
      ORDER BY o.sos_at DESC LIMIT 50`);
    return sendSuccess(res, { sos_alerts: rows, count: rows.length });
  } catch (err) {
    return sendError(res, 'Gagal mengambil data SOS: ' + err.message, 500);
  }
};

// ─── GET /api/admin/logs ─────────────────────────────────────
const getAdminLogs = async (req, res) => {
  try {
    const { page = 1, limit = 30 } = req.query;
    const offset = (page - 1) * limit;
    const countRes = await query(`SELECT COUNT(*) FROM admin_logs`);
    const { rows } = await query(
      `SELECT al.*, u.name AS admin_name
       FROM admin_logs al JOIN users u ON u.id=al.admin_id
       ORDER BY al.created_at DESC LIMIT $1 OFFSET $2`,
      [parseInt(limit), offset]);
    return sendSuccess(res, {
      logs: rows,
      total: parseInt(countRes.rows[0].count),
      page: parseInt(page),
      total_pages: Math.ceil(countRes.rows[0].count / limit)
    });
  } catch (err) {
    return sendError(res, 'Gagal mengambil log admin: ' + err.message, 500);
  }
};

// ─── GET /api/admin/map/drivers ──────────────────────────────
const getDriversMap = async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT d.id, u.name, d.vehicle_type, d.vehicle_plate,
             d.is_online, d.is_verified, d.rating,
             ST_Y(d.location::geometry) AS lat,
             ST_X(d.location::geometry) AS lng,
             d.location_updated_at
      FROM drivers d JOIN users u ON u.id=d.user_id
      WHERE d.location IS NOT NULL ORDER BY d.location_updated_at DESC`);
    return sendSuccess(res, { drivers: rows, count: rows.length });
  } catch (err) {
    return sendError(res, 'Gagal mengambil peta driver: ' + err.message, 500);
  }
};

// ─── GET /api/admin/analytics ────────────────────────────────
const getAnalytics = async (req, res) => {
  try {
    const { days = 7 } = req.query;
    const [daily, serviceStats, topDrivers, topMerchants] = await Promise.all([
      query(`
        SELECT DATE(created_at) AS date,
               COUNT(*) AS orders,
               COUNT(*) FILTER (WHERE status='completed') AS completed,
               COALESCE(SUM(total_amount) FILTER (WHERE status='completed'),0) AS revenue
        FROM orders
        WHERE created_at >= NOW() - INTERVAL '${parseInt(days)} days'
        GROUP BY DATE(created_at) ORDER BY date ASC`),
      query(`
        SELECT service_type,
               COUNT(*) AS total, COUNT(*) FILTER (WHERE status='completed') AS completed,
               COALESCE(SUM(total_amount) FILTER (WHERE status='completed'),0) AS revenue,
               COALESCE(AVG(user_rating),0) AS avg_rating
        FROM orders GROUP BY service_type ORDER BY total DESC`),
      query(`
        SELECT d.id, u.name, d.vehicle_type, d.total_trips, d.rating,
               COUNT(o.id) AS recent_orders,
               COALESCE(SUM(o.service_fee)  FILTER (WHERE o.status='completed'),0) AS recent_revenue
        FROM drivers d JOIN users u ON u.id=d.user_id
        LEFT JOIN orders o ON o.driver_id=d.id AND o.created_at>=NOW()-INTERVAL '30 days'
        GROUP BY d.id, u.name ORDER BY recent_orders DESC LIMIT 10`),
      query(`
        SELECT m.id, m.store_name, m.store_category, m.total_orders, m.rating,
               COUNT(o.id) AS recent_orders
        FROM merchants m
        LEFT JOIN orders o ON o.merchant_id=m.id AND o.created_at>=NOW()-INTERVAL '30 days'
        GROUP BY m.id ORDER BY recent_orders DESC LIMIT 10`)
    ]);
    return sendSuccess(res, {
      daily_stats: daily.rows,
      service_stats: serviceStats.rows,
      top_drivers: topDrivers.rows,
      top_merchants: topMerchants.rows
    });
  } catch (err) {
    return sendError(res, 'Gagal mengambil analitik: ' + err.message, 500);
  }
};

module.exports = {
  getDashboard, getUsers, toggleUser,
  getDrivers, verifyDriver,
  getMerchants, verifyMerchant,
  getOrders, getTariffs, updateTariff,
  getSosAlerts, getAdminLogs, getDriversMap, getAnalytics
};
