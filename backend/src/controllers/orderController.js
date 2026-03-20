const { v4: uuidv4 } = require('uuid');
const { getMockDB } = require('../config/database');
const { sendSuccess, sendError, calculateDistance, calculateFare, generateOrderNumber, findNearbyDrivers } = require('../utils/helpers');

// GET /api/orders/estimate - Estimasi harga sebelum pesan
const getEstimate = async (req, res) => {
  try {
    const { pickup_lat, pickup_lng, destination_lat, destination_lng, service_type = 'GooRide' } = req.query;
    if (!pickup_lat || !pickup_lng || !destination_lat || !destination_lng) {
      return sendError(res, 'Koordinat titik jemput dan tujuan wajib diisi.');
    }
    const distance = calculateDistance(
      parseFloat(pickup_lat), parseFloat(pickup_lng),
      parseFloat(destination_lat), parseFloat(destination_lng)
    );
    const fare = calculateFare(service_type, distance);
    const db = getMockDB();
    const nearbyDrivers = findNearbyDrivers(db, parseFloat(pickup_lat), parseFloat(pickup_lng), 5, fare.vehicle_type);
    return sendSuccess(res, {
      ...fare,
      service_type,
      nearby_drivers_count: nearbyDrivers.length,
      estimated_arrival: `${Math.ceil(nearbyDrivers[0]?._distance || 2) * 3}-${Math.ceil(nearbyDrivers[0]?._distance || 2) * 5} menit`
    }, 'Estimasi berhasil dihitung.');
  } catch (err) {
    return sendError(res, 'Gagal menghitung estimasi: ' + err.message, 500);
  }
};

// POST /api/orders - Buat pesanan baru
const createOrder = async (req, res) => {
  try {
    const {
      service_type, pickup_address, pickup_lat, pickup_lng,
      destination_address, destination_lat, destination_lng,
      notes = '', payment_method = 'cash'
    } = req.body;

    if (!service_type || !pickup_lat || !pickup_lng || !destination_lat || !destination_lng) {
      return sendError(res, 'Data pesanan tidak lengkap.');
    }

    const rideServices = ['GooRide', 'GooCard', 'GooKurir', 'GooAmbulance'];
    if (!rideServices.includes(service_type)) {
      return sendError(res, `Layanan ${service_type} tidak dikenali.`);
    }

    const db = getMockDB();
    const distance = calculateDistance(
      parseFloat(pickup_lat), parseFloat(pickup_lng),
      parseFloat(destination_lat), parseFloat(destination_lng)
    );
    const fare = calculateFare(service_type, distance);

    if (payment_method === 'wallet') {
      const userIdx = db.users.findIndex(u => u.id === req.user.id);
      if (db.users[userIdx].wallet_balance < fare.total_amount) {
        return sendError(res, `Saldo GooWallet tidak cukup. Saldo Anda: Rp ${db.users[userIdx].wallet_balance.toLocaleString('id-ID')}`);
      }
    }

    const nearbyDrivers = findNearbyDrivers(db, parseFloat(pickup_lat), parseFloat(pickup_lng), 5, fare.vehicle_type);
    const prefixes = { GooRide: 'GRD', GooCard: 'GCD', GooKurir: 'GKR', GooAmbulance: 'GAB' };

    const newOrder = {
      id: uuidv4(),
      order_number: generateOrderNumber(prefixes[service_type] || 'GNB'),
      user_id: req.user.id,
      driver_id: nearbyDrivers.length > 0 ? nearbyDrivers[0].id : null,
      service_type,
      pickup_address: pickup_address || 'Titik jemput',
      pickup_lat: parseFloat(pickup_lat),
      pickup_lng: parseFloat(pickup_lng),
      destination_address: destination_address || 'Tujuan',
      destination_lat: parseFloat(destination_lat),
      destination_lng: parseFloat(destination_lng),
      distance_km: fare.distance_km,
      base_fare: fare.base_fare,
      distance_fare: fare.distance_fare,
      total_amount: fare.total_amount,
      payment_method,
      status: nearbyDrivers.length > 0 ? 'searching' : 'no_driver',
      notes,
      sos_activated: false,
      created_at: new Date().toISOString(),
      completed_at: null
    };

    db.orders.push(newOrder);

    // Kurangi saldo wallet jika bayar via wallet
    if (payment_method === 'wallet') {
      const userIdx = db.users.findIndex(u => u.id === req.user.id);
      db.users[userIdx].wallet_balance -= fare.total_amount;
      db.walletTransactions.push({
        id: uuidv4(), user_id: req.user.id,
        type: 'debit', amount: fare.total_amount,
        description: `Pembayaran ${service_type} - ${newOrder.order_number}`,
        created_at: new Date().toISOString()
      });
    }

    return sendSuccess(res, {
      order: newOrder,
      assigned_driver: nearbyDrivers.length > 0 ? {
        id: nearbyDrivers[0].id,
        distance: nearbyDrivers[0]._distance
      } : null,
      message: nearbyDrivers.length > 0
        ? `Driver ditemukan! Menunggu konfirmasi driver...`
        : 'Sedang mencari driver terdekat...'
    }, 'Pesanan berhasil dibuat!', 201);
  } catch (err) {
    return sendError(res, 'Gagal membuat pesanan: ' + err.message, 500);
  }
};

// GET /api/orders - Daftar pesanan user
const getMyOrders = async (req, res) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;
    const db = getMockDB();
    let orders = db.orders.filter(o => o.user_id === req.user.id);
    if (status) orders = orders.filter(o => o.status === status);
    orders.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const total = orders.length;
    const paginated = orders.slice((page - 1) * limit, page * limit);
    
    // Enrich with driver info
    const enriched = paginated.map(order => {
      const driver = db.drivers.find(d => d.id === order.driver_id);
      const driverUser = driver ? db.users.find(u => u.id === driver.user_id) : null;
      return { ...order, driver: driverUser ? { name: driverUser.name, phone: driverUser.phone, ...driver } : null };
    });

    return sendSuccess(res, { orders: enriched, total, page: parseInt(page), limit: parseInt(limit), total_pages: Math.ceil(total / limit) });
  } catch (err) {
    return sendError(res, 'Gagal mengambil pesanan: ' + err.message, 500);
  }
};

// GET /api/orders/:id
const getOrderById = async (req, res) => {
  try {
    const db = getMockDB();
    const order = db.orders.find(o => o.id === req.params.id || o.order_number === req.params.id);
    if (!order) return sendError(res, 'Pesanan tidak ditemukan.', 404);
    if (order.user_id !== req.user.id && req.user.role !== 'admin') {
      const driver = db.drivers.find(d => d.user_id === req.user.id);
      if (!driver || order.driver_id !== driver.id) {
        return sendError(res, 'Tidak ada akses ke pesanan ini.', 403);
      }
    }
    const driver = db.drivers.find(d => d.id === order.driver_id);
    const driverUser = driver ? db.users.find(u => u.id === driver.user_id) : null;
    return sendSuccess(res, {
      ...order,
      driver: driverUser ? { name: driverUser.name, phone: driverUser.phone, ...driver } : null
    });
  } catch (err) {
    return sendError(res, 'Gagal mengambil detail pesanan: ' + err.message, 500);
  }
};

// PUT /api/orders/:id/cancel - Batalkan pesanan
const cancelOrder = async (req, res) => {
  try {
    const db = getMockDB();
    const orderIdx = db.orders.findIndex(o => o.id === req.params.id);
    if (orderIdx === -1) return sendError(res, 'Pesanan tidak ditemukan.', 404);
    const order = db.orders[orderIdx];
    if (order.user_id !== req.user.id) return sendError(res, 'Tidak ada akses.', 403);
    if (['completed', 'cancelled'].includes(order.status)) {
      return sendError(res, 'Pesanan sudah selesai atau dibatalkan.');
    }
    db.orders[orderIdx].status = 'cancelled';
    db.orders[orderIdx].cancelled_at = new Date().toISOString();
    // Refund if paid by wallet
    if (order.payment_method === 'wallet') {
      const userIdx = db.users.findIndex(u => u.id === req.user.id);
      db.users[userIdx].wallet_balance += order.total_amount;
    }
    return sendSuccess(res, { order: db.orders[orderIdx] }, 'Pesanan berhasil dibatalkan.');
  } catch (err) {
    return sendError(res, 'Gagal membatalkan pesanan: ' + err.message, 500);
  }
};

// POST /api/orders/:id/sos - Tombol darurat SOS
const activateSOS = async (req, res) => {
  try {
    const db = getMockDB();
    const orderIdx = db.orders.findIndex(o => o.id === req.params.id);
    if (orderIdx === -1) return sendError(res, 'Pesanan tidak ditemukan.', 404);
    db.orders[orderIdx].sos_activated = true;
    db.orders[orderIdx].sos_at = new Date().toISOString();
    db.notifications.push({
      id: uuidv4(), type: 'SOS', order_id: req.params.id,
      user_id: req.user.id, message: `SOS DARURAT - Pengguna ${req.user.name} membutuhkan bantuan!`,
      is_read: false, created_at: new Date().toISOString()
    });
    return sendSuccess(res, { sos: true }, '🚨 SOS Darurat telah diaktifkan! Tim GONAB akan segera menghubungi Anda.');
  } catch (err) {
    return sendError(res, 'Gagal mengaktifkan SOS: ' + err.message, 500);
  }
};

// Driver: GET /api/driver/orders/available
const getAvailableOrders = async (req, res) => {
  try {
    const db = getMockDB();
    const driver = db.drivers.find(d => d.user_id === req.user.id);
    if (!driver) return sendError(res, 'Profil driver tidak ditemukan.', 404);
    const orders = db.orders.filter(o => o.driver_id === driver.id && o.status === 'searching');
    return sendSuccess(res, { orders });
  } catch (err) {
    return sendError(res, 'Gagal mengambil pesanan: ' + err.message, 500);
  }
};

// Driver: PUT /api/driver/orders/:id/status
const updateOrderStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['accepted', 'on_the_way', 'arrived', 'in_progress', 'completed', 'rejected'];
    if (!validStatuses.includes(status)) return sendError(res, 'Status tidak valid.');
    const db = getMockDB();
    const driver = db.drivers.find(d => d.user_id === req.user.id);
    if (!driver) return sendError(res, 'Profil driver tidak ditemukan.', 404);
    const orderIdx = db.orders.findIndex(o => o.id === req.params.id && o.driver_id === driver.id);
    if (orderIdx === -1) return sendError(res, 'Pesanan tidak ditemukan.', 404);
    db.orders[orderIdx].status = status;
    if (status === 'completed') {
      db.orders[orderIdx].completed_at = new Date().toISOString();
      db.drivers[db.drivers.findIndex(d => d.id === driver.id)].total_trips += 1;
      // Credit driver earnings (80% to driver, 20% platform fee)
      const earning = Math.floor(db.orders[orderIdx].total_amount * 0.8);
      const driverUserIdx = db.users.findIndex(u => u.id === driver.user_id);
      db.users[driverUserIdx].wallet_balance += earning;
    }
    return sendSuccess(res, { order: db.orders[orderIdx] }, `Status pesanan diperbarui menjadi: ${status}`);
  } catch (err) {
    return sendError(res, 'Gagal memperbarui status: ' + err.message, 500);
  }
};

module.exports = { getEstimate, createOrder, getMyOrders, getOrderById, cancelOrder, activateSOS, getAvailableOrders, updateOrderStatus };
