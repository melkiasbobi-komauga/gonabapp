const { v4: uuidv4 } = require('uuid');
const { getMockDB } = require('../config/database');
const { sendSuccess, sendError } = require('../utils/helpers');

// GET /api/drivers - Driver terdekat
const getNearbyDrivers = async (req, res) => {
  try {
    const { lat, lng, radius = 5, vehicle_type } = req.query;
    if (!lat || !lng) return sendError(res, 'Koordinat lokasi wajib diisi.');
    const { findNearbyDrivers } = require('../utils/helpers');
    const db = getMockDB();
    const drivers = findNearbyDrivers(db, parseFloat(lat), parseFloat(lng), parseFloat(radius), vehicle_type || null);
    const enriched = drivers.map(d => {
      const user = db.users.find(u => u.id === d.user_id);
      return {
        id: d.id, name: user?.name, vehicle_type: d.vehicle_type,
        vehicle_plate: d.vehicle_plate, vehicle_model: d.vehicle_model,
        vehicle_color: d.vehicle_color, rating: d.rating,
        total_trips: d.total_trips, distance: d._distance,
        current_lat: d.current_lat, current_lng: d.current_lng
      };
    });
    return sendSuccess(res, { drivers: enriched, count: enriched.length });
  } catch (err) {
    return sendError(res, 'Gagal mengambil driver terdekat: ' + err.message, 500);
  }
};

// PUT /api/driver/location - Update lokasi driver
const updateDriverLocation = async (req, res) => {
  try {
    const { lat, lng } = req.body;
    if (!lat || !lng) return sendError(res, 'Koordinat lokasi wajib diisi.');
    const db = getMockDB();
    const driverIdx = db.drivers.findIndex(d => d.user_id === req.user.id);
    if (driverIdx === -1) return sendError(res, 'Profil driver tidak ditemukan.', 404);
    db.drivers[driverIdx].current_lat = parseFloat(lat);
    db.drivers[driverIdx].current_lng = parseFloat(lng);
    db.drivers[driverIdx].location_updated_at = new Date().toISOString();
    return sendSuccess(res, { location: { lat: parseFloat(lat), lng: parseFloat(lng) } }, 'Lokasi driver diperbarui.');
  } catch (err) {
    return sendError(res, 'Gagal memperbarui lokasi: ' + err.message, 500);
  }
};

// PUT /api/driver/toggle-online - Toggle online/offline
const toggleOnlineStatus = async (req, res) => {
  try {
    const db = getMockDB();
    const driverIdx = db.drivers.findIndex(d => d.user_id === req.user.id);
    if (driverIdx === -1) return sendError(res, 'Profil driver tidak ditemukan.', 404);
    if (!db.drivers[driverIdx].is_verified) return sendError(res, 'Akun driver belum diverifikasi oleh admin.');
    db.drivers[driverIdx].is_online = !db.drivers[driverIdx].is_online;
    return sendSuccess(res, { is_online: db.drivers[driverIdx].is_online },
      `Status driver: ${db.drivers[driverIdx].is_online ? '🟢 Online' : '🔴 Offline'}`);
  } catch (err) {
    return sendError(res, 'Gagal mengubah status: ' + err.message, 500);
  }
};

// POST /api/driver/register - Daftar sebagai driver
const registerDriver = async (req, res) => {
  try {
    const { vehicle_type, vehicle_plate, vehicle_model, vehicle_color, ktp_number, sim_number, stnk_number } = req.body;
    if (!vehicle_type || !vehicle_plate || !ktp_number || !sim_number) {
      return sendError(res, 'Data kendaraan dan dokumen wajib diisi.');
    }
    const db = getMockDB();
    const existing = db.drivers.find(d => d.user_id === req.user.id);
    if (existing) return sendError(res, 'Anda sudah terdaftar sebagai driver.');
    const newDriver = {
      id: uuidv4(), user_id: req.user.id,
      vehicle_type: vehicle_type.toLowerCase(),
      vehicle_plate: vehicle_plate.toUpperCase(),
      vehicle_model: vehicle_model || '',
      vehicle_color: vehicle_color || '',
      ktp_number, sim_number, stnk_number: stnk_number || '',
      is_verified: false, is_online: false,
      current_lat: -3.3640, current_lng: 135.4960,
      rating: 0, total_trips: 0,
      created_at: new Date().toISOString()
    };
    db.drivers.push(newDriver);
    // Update user role
    const userIdx = db.users.findIndex(u => u.id === req.user.id);
    db.users[userIdx].role = 'driver';
    return sendSuccess(res, { driver: newDriver }, 'Pendaftaran driver berhasil! Menunggu verifikasi admin.', 201);
  } catch (err) {
    return sendError(res, 'Gagal mendaftar driver: ' + err.message, 500);
  }
};

// GET /api/driver/earnings
const getDriverEarnings = async (req, res) => {
  try {
    const db = getMockDB();
    const driver = db.drivers.find(d => d.user_id === req.user.id);
    if (!driver) return sendError(res, 'Profil driver tidak ditemukan.', 404);
    const completedOrders = db.orders.filter(o => o.driver_id === driver.id && o.status === 'completed');
    const totalEarnings = completedOrders.reduce((sum, o) => sum + Math.floor(o.total_amount * 0.8), 0);
    const todayOrders = completedOrders.filter(o => {
      const orderDate = new Date(o.completed_at || o.created_at).toDateString();
      return orderDate === new Date().toDateString();
    });
    const todayEarnings = todayOrders.reduce((sum, o) => sum + Math.floor(o.total_amount * 0.8), 0);
    const user = db.users.find(u => u.id === req.user.id);
    return sendSuccess(res, {
      wallet_balance: user.wallet_balance,
      total_earnings: totalEarnings,
      today_earnings: todayEarnings,
      total_trips: driver.total_trips,
      today_trips: todayOrders.length,
      rating: driver.rating
    });
  } catch (err) {
    return sendError(res, 'Gagal mengambil pendapatan: ' + err.message, 500);
  }
};

module.exports = { getNearbyDrivers, updateDriverLocation, toggleOnlineStatus, registerDriver, getDriverEarnings };
