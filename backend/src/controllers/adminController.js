const { v4: uuidv4 } = require('uuid');
const { getMockDB } = require('../config/database');
const { sendSuccess, sendError } = require('../utils/helpers');

// Admin: GET /api/admin/dashboard
const getDashboard = async (req, res) => {
  try {
    const db = getMockDB();
    const totalUsers = db.users.filter(u => u.role === 'customer').length;
    const totalDrivers = db.drivers.length;
    const verifiedDrivers = db.drivers.filter(d => d.is_verified).length;
    const onlineDrivers = db.drivers.filter(d => d.is_online).length;
    const totalMerchants = db.merchants.length;
    const verifiedMerchants = db.merchants.filter(m => m.is_verified).length;
    const totalOrders = db.orders.length;
    const completedOrders = db.orders.filter(o => o.status === 'completed').length;
    const pendingOrders = db.orders.filter(o => ['searching', 'pending', 'accepted'].includes(o.status)).length;
    const totalRevenue = db.orders.filter(o => o.status === 'completed').reduce((sum, o) => sum + o.total_amount, 0);
    const platformFee = Math.floor(totalRevenue * 0.2);

    const today = new Date().toDateString();
    const todayOrders = db.orders.filter(o => new Date(o.created_at).toDateString() === today);
    const todayRevenue = todayOrders.filter(o => o.status === 'completed').reduce((sum, o) => sum + o.total_amount, 0);

    const serviceBreakdown = {};
    db.orders.forEach(o => {
      if (!serviceBreakdown[o.service_type]) serviceBreakdown[o.service_type] = 0;
      serviceBreakdown[o.service_type]++;
    });

    const recentOrders = db.orders.slice(-10).reverse().map(o => {
      const user = db.users.find(u => u.id === o.user_id);
      return { ...o, user_name: user?.name || 'Unknown' };
    });

    return sendSuccess(res, {
      stats: {
        total_users: totalUsers,
        total_drivers: totalDrivers,
        verified_drivers: verifiedDrivers,
        online_drivers: onlineDrivers,
        total_merchants: totalMerchants,
        verified_merchants: verifiedMerchants,
        total_orders: totalOrders,
        completed_orders: completedOrders,
        pending_orders: pendingOrders,
        total_revenue: totalRevenue,
        platform_fee: platformFee,
        today_orders: todayOrders.length,
        today_revenue: todayRevenue
      },
      service_breakdown: serviceBreakdown,
      recent_orders: recentOrders
    });
  } catch (err) {
    return sendError(res, 'Gagal mengambil data dashboard: ' + err.message, 500);
  }
};

// Admin: GET /api/admin/users
const getAllUsers = async (req, res) => {
  try {
    const { role, search, page = 1, limit = 20 } = req.query;
    const db = getMockDB();
    let users = db.users.map(u => { const { password, ...u2 } = u; return u2; });
    if (role) users = users.filter(u => u.role === role);
    if (search) users = users.filter(u => u.name.toLowerCase().includes(search.toLowerCase()) || u.phone.includes(search));
    users.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const total = users.length;
    const paginated = users.slice((page - 1) * limit, page * limit);
    return sendSuccess(res, { users: paginated, total, page: parseInt(page), total_pages: Math.ceil(total / limit) });
  } catch (err) {
    return sendError(res, 'Gagal mengambil data pengguna: ' + err.message, 500);
  }
};

// Admin: PUT /api/admin/users/:id/toggle
const toggleUserStatus = async (req, res) => {
  try {
    const db = getMockDB();
    const userIdx = db.users.findIndex(u => u.id === req.params.id);
    if (userIdx === -1) return sendError(res, 'Pengguna tidak ditemukan.', 404);
    if (db.users[userIdx].role === 'admin') return sendError(res, 'Tidak dapat menonaktifkan akun admin.');
    db.users[userIdx].is_active = !db.users[userIdx].is_active;
    return sendSuccess(res, { is_active: db.users[userIdx].is_active },
      `Akun ${db.users[userIdx].is_active ? 'diaktifkan' : 'dinonaktifkan'} berhasil.`);
  } catch (err) {
    return sendError(res, 'Gagal mengubah status pengguna: ' + err.message, 500);
  }
};

// Admin: GET /api/admin/drivers
const getAllDrivers = async (req, res) => {
  try {
    const { verified, page = 1, limit = 20 } = req.query;
    const db = getMockDB();
    let drivers = db.drivers.map(d => {
      const user = db.users.find(u => u.id === d.user_id);
      return { ...d, user_name: user?.name, user_phone: user?.phone, user_email: user?.email };
    });
    if (verified !== undefined) drivers = drivers.filter(d => d.is_verified === (verified === 'true'));
    const total = drivers.length;
    const paginated = drivers.slice((page - 1) * limit, page * limit);
    return sendSuccess(res, { drivers: paginated, total, page: parseInt(page), total_pages: Math.ceil(total / limit) });
  } catch (err) {
    return sendError(res, 'Gagal mengambil data driver: ' + err.message, 500);
  }
};

// Admin: PUT /api/admin/drivers/:id/verify
const verifyDriver = async (req, res) => {
  try {
    const { action } = req.body; // 'approve' or 'reject'
    const db = getMockDB();
    const driverIdx = db.drivers.findIndex(d => d.id === req.params.id);
    if (driverIdx === -1) return sendError(res, 'Driver tidak ditemukan.', 404);
    db.drivers[driverIdx].is_verified = action === 'approve';
    db.drivers[driverIdx].verified_at = new Date().toISOString();
    db.adminLogs.push({
      id: uuidv4(), admin_id: req.user.id, action: `driver_${action}`,
      target_id: req.params.id, created_at: new Date().toISOString()
    });
    return sendSuccess(res, { driver: db.drivers[driverIdx] },
      `Driver ${action === 'approve' ? 'diverifikasi' : 'ditolak'} berhasil.`);
  } catch (err) {
    return sendError(res, 'Gagal verifikasi driver: ' + err.message, 500);
  }
};

// Admin: GET /api/admin/merchants
const getAllMerchants = async (req, res) => {
  try {
    const { verified, page = 1, limit = 20 } = req.query;
    const db = getMockDB();
    let merchants = db.merchants.map(m => {
      const user = db.users.find(u => u.id === m.user_id);
      return { ...m, owner_name: user?.name, owner_phone: user?.phone };
    });
    if (verified !== undefined) merchants = merchants.filter(m => m.is_verified === (verified === 'true'));
    const total = merchants.length;
    const paginated = merchants.slice((page - 1) * limit, page * limit);
    return sendSuccess(res, { merchants: paginated, total, page: parseInt(page), total_pages: Math.ceil(total / limit) });
  } catch (err) {
    return sendError(res, 'Gagal mengambil data merchant: ' + err.message, 500);
  }
};

// Admin: PUT /api/admin/merchants/:id/verify
const verifyMerchant = async (req, res) => {
  try {
    const { action } = req.body;
    const db = getMockDB();
    const mIdx = db.merchants.findIndex(m => m.id === req.params.id);
    if (mIdx === -1) return sendError(res, 'Merchant tidak ditemukan.', 404);
    db.merchants[mIdx].is_verified = action === 'approve';
    db.merchants[mIdx].verified_at = new Date().toISOString();
    return sendSuccess(res, { merchant: db.merchants[mIdx] },
      `Merchant ${action === 'approve' ? 'diverifikasi' : 'ditolak'} berhasil.`);
  } catch (err) {
    return sendError(res, 'Gagal verifikasi merchant: ' + err.message, 500);
  }
};

// Admin: GET /api/admin/orders
const getAllOrders = async (req, res) => {
  try {
    const { status, service_type, page = 1, limit = 20 } = req.query;
    const db = getMockDB();
    let orders = db.orders.map(o => {
      const user = db.users.find(u => u.id === o.user_id);
      const driver = db.drivers.find(d => d.id === o.driver_id);
      const driverUser = driver ? db.users.find(u => u.id === driver.user_id) : null;
      return { ...o, user_name: user?.name, driver_name: driverUser?.name };
    });
    if (status) orders = orders.filter(o => o.status === status);
    if (service_type) orders = orders.filter(o => o.service_type === service_type);
    orders.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const total = orders.length;
    const paginated = orders.slice((page - 1) * limit, page * limit);
    return sendSuccess(res, { orders: paginated, total, page: parseInt(page), total_pages: Math.ceil(total / limit) });
  } catch (err) {
    return sendError(res, 'Gagal mengambil data pesanan: ' + err.message, 500);
  }
};

// Admin: Update tarif
const updateTariff = async (req, res) => {
  try {
    const { service_type, base_fare, per_km } = req.body;
    // In production, this would update database
    return sendSuccess(res, { service_type, base_fare, per_km }, `Tarif ${service_type} berhasil diperbarui.`);
  } catch (err) {
    return sendError(res, 'Gagal memperbarui tarif: ' + err.message, 500);
  }
};

// Admin: GET /api/admin/sos
const getSOSAlerts = async (req, res) => {
  try {
    const db = getMockDB();
    const sosOrders = db.orders.filter(o => o.sos_activated);
    const enriched = sosOrders.map(o => {
      const user = db.users.find(u => u.id === o.user_id);
      return { ...o, user_name: user?.name, user_phone: user?.phone };
    });
    return sendSuccess(res, { alerts: enriched, count: enriched.length });
  } catch (err) {
    return sendError(res, 'Gagal mengambil data SOS: ' + err.message, 500);
  }
};

module.exports = { getDashboard, getAllUsers, toggleUserStatus, getAllDrivers, verifyDriver, getAllMerchants, verifyMerchant, getAllOrders, updateTariff, getSOSAlerts };
