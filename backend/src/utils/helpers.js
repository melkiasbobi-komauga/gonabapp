const { query } = require('../config/database');

// ─── Haversine (JS fallback) ─────────────────────────────────
const calculateDistance = (lat1, lng1, lat2, lng2) => {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a = Math.sin(dLat/2)**2 +
    Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
};

// ─── Hitung tarif ───────────────────────────────────────────
const calculateFare = (serviceType, distanceKm, tariff = null) => {
  const defaults = {
    GooRide:      { baseFare: 10000, perKm: 3000, vehicleType: 'motor', feePct: 20 },
    GooCard:      { baseFare: 15000, perKm: 5000, vehicleType: 'mobil', feePct: 20 },
    GooKurir:     { baseFare: 8000,  perKm: 2500, vehicleType: 'motor', feePct: 20 },
    GooAmbulance: { baseFare: 25000, perKm: 4000, vehicleType: 'mobil', feePct: 10 },
  };
  const t = tariff
    ? { baseFare: Number(tariff.base_fare), perKm: Number(tariff.per_km_fare), vehicleType: tariff.vehicle_type, feePct: Number(tariff.platform_fee_pct) }
    : (defaults[serviceType] || defaults['GooRide']);

  const distFare  = Math.ceil(distanceKm) * t.perKm;
  const subtotal  = t.baseFare + distFare;
  const serviceFee = Math.floor(subtotal * t.feePct / 100);
  return {
    base_fare:    t.baseFare,
    distance_fare: distFare,
    service_fee:  serviceFee,
    total_amount: subtotal,                // pembayaran user = subtotal (fee sudah di platform)
    vehicle_type: t.vehicleType,
    distance_km:  parseFloat(distanceKm.toFixed(2))
  };
};

// ─── Ambil tarif dari DB ─────────────────────────────────────
const getTariffFromDB = async (serviceType) => {
  const { rows } = await query(
    'SELECT * FROM tariffs WHERE service_type = $1 AND is_active = TRUE',
    [serviceType]
  );
  return rows[0] || null;
};

// ─── Cari driver terdekat via PostGIS ────────────────────────
// Memanggil fungsi PostgreSQL find_nearby_drivers()
const findNearbyDriversPostGIS = async (lat, lng, radiusMeters = 5000, vehicleType = null) => {
  const { rows } = await query(
    'SELECT * FROM find_nearby_drivers($1, $2, $3, $4)',
    [lat, lng, radiusMeters, vehicleType]
  );
  return rows;
};

// ─── Generate nomor pesanan ─────────────────────────────────
const generateOrderNumber = (prefix) => {
  const now = new Date();
  const date = now.toISOString().slice(0,10).replace(/-/g,'');
  const rand = Math.floor(Math.random()*10000).toString().padStart(4,'0');
  return `${prefix}-${date}-${rand}`;
};

// ─── Standard response ───────────────────────────────────────
const sendSuccess = (res, data, message = 'Berhasil', statusCode = 200) =>
  res.status(statusCode).json({ success: true, message, data, timestamp: new Date().toISOString() });

const sendError = (res, message = 'Terjadi kesalahan', statusCode = 400, errors = null) => {
  const r = { success: false, message, timestamp: new Date().toISOString() };
  if (errors) r.errors = errors;
  return res.status(statusCode).json(r);
};

// ─── Format rupiah ───────────────────────────────────────────
const formatRupiah = (n) => `Rp ${Number(n).toLocaleString('id-ID')}`;

module.exports = {
  calculateDistance,
  calculateFare,
  getTariffFromDB,
  findNearbyDriversPostGIS,
  generateOrderNumber,
  sendSuccess,
  sendError,
  formatRupiah
};
