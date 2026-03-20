// Utility: Hitung jarak antara dua koordinat (Haversine Formula)
const calculateDistance = (lat1, lng1, lat2, lng2) => {
  const R = 6371; // Radius bumi dalam KM
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// Utility: Hitung tarif berdasarkan jenis layanan
const calculateFare = (serviceType, distanceKm) => {
  const tariffs = {
    GooRide: { baseFare: 10000, perKm: 3000, vehicleType: 'motor' },    // Ojek Motor
    GooCard: { baseFare: 15000, perKm: 5000, vehicleType: 'mobil' },    // Angkutan Mobil
    GooKurir: { baseFare: 8000, perKm: 2500, vehicleType: 'motor' },    // Pengiriman Barang
    GooAmbulance: { baseFare: 25000, perKm: 4000, vehicleType: 'mobil' } // Ambulans
  };

  const tariff = tariffs[serviceType] || tariffs['GooRide'];
  const distanceFare = Math.ceil(distanceKm) * tariff.perKm;
  const total = tariff.baseFare + distanceFare;

  return {
    base_fare: tariff.baseFare,
    distance_fare: distanceFare,
    total_amount: total,
    vehicle_type: tariff.vehicleType,
    distance_km: parseFloat(distanceKm.toFixed(2))
  };
};

// Utility: Generate order number
const generateOrderNumber = (prefix) => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `${prefix}-${year}${month}${day}-${random}`;
};

// Utility: Standard response
const sendSuccess = (res, data, message = 'Berhasil', statusCode = 200) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
    timestamp: new Date().toISOString()
  });
};

const sendError = (res, message = 'Terjadi kesalahan', statusCode = 400, errors = null) => {
  const response = { success: false, message, timestamp: new Date().toISOString() };
  if (errors) response.errors = errors;
  return res.status(statusCode).json(response);
};

// Utility: Find nearby drivers
const findNearbyDrivers = (db, lat, lng, radiusKm = 5, vehicleType = null) => {
  return db.drivers.filter(driver => {
    if (!driver.is_online || !driver.is_verified) return false;
    if (vehicleType && driver.vehicle_type !== vehicleType) return false;
    
    // Check if driver is currently occupied
    const activeOrder = db.orders.find(o => 
      o.driver_id === driver.id && 
      ['accepted', 'on_the_way', 'arrived', 'in_progress'].includes(o.status)
    );
    if (activeOrder) return false;

    const distance = calculateDistance(lat, lng, driver.current_lat, driver.current_lng);
    driver._distance = parseFloat(distance.toFixed(2));
    return distance <= radiusKm;
  }).sort((a, b) => a._distance - b._distance);
};

module.exports = {
  calculateDistance,
  calculateFare,
  generateOrderNumber,
  sendSuccess,
  sendError,
  findNearbyDrivers
};
