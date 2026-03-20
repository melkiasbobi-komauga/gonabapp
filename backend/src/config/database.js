const { Pool } = require('pg');

// Untuk demo/development tanpa PostgreSQL nyata, kita gunakan mock database
// Pada produksi, ganti dengan koneksi PostgreSQL asli

let pool = null;
let mockDB = null;

// In-memory database untuk demo
const createMockDB = () => {
  const db = {
    users: [],
    drivers: [],
    merchants: [],
    products: [],
    rentals: [],
    orders: [],
    chats: [],
    notifications: [],
    categories: [],
    reviews: [],
    walletTransactions: [],
    adminLogs: []
  };

  // Seed admin user
  const bcrypt = require('bcryptjs');
  const { v4: uuidv4 } = require('uuid');
  
  const adminId = uuidv4();
  db.users.push({
    id: adminId,
    name: 'Admin GONAB',
    phone: '082199990000',
    email: 'admin@gonab.id',
    password: bcrypt.hashSync('Admin@gonab2024', 10),
    role: 'admin',
    wallet_balance: 0,
    is_verified: true,
    is_active: true,
    avatar: null,
    created_at: new Date().toISOString()
  });

  // Seed sample users
  db.users.push({
    id: uuidv4(),
    name: 'Budi Santoso',
    phone: '081234567890',
    email: 'budi@example.com',
    password: bcrypt.hashSync('password123', 10),
    role: 'customer',
    wallet_balance: 150000,
    is_verified: true,
    is_active: true,
    avatar: null,
    created_at: new Date().toISOString()
  });

  db.users.push({
    id: uuidv4(),
    name: 'Siti Rahayu',
    phone: '085678901234',
    email: 'siti@example.com',
    password: bcrypt.hashSync('password123', 10),
    role: 'customer',
    wallet_balance: 75000,
    is_verified: true,
    is_active: true,
    avatar: null,
    created_at: new Date().toISOString()
  });

  // Seed sample drivers
  const driverId1 = uuidv4();
  const driverUserId1 = uuidv4();
  db.users.push({
    id: driverUserId1,
    name: 'Joko Widodo',
    phone: '082111222333',
    email: 'joko.driver@example.com',
    password: bcrypt.hashSync('password123', 10),
    role: 'driver',
    wallet_balance: 200000,
    is_verified: true,
    is_active: true,
    avatar: null,
    created_at: new Date().toISOString()
  });
  db.drivers.push({
    id: driverId1,
    user_id: driverUserId1,
    vehicle_type: 'motor',
    vehicle_plate: 'PB 1234 AB',
    vehicle_model: 'Honda Beat',
    vehicle_color: 'Hitam',
    ktp_number: '9103041234567890',
    sim_number: 'SIM123456',
    stnk_number: 'STNK123456',
    is_verified: true,
    is_online: true,
    current_lat: -3.3640,
    current_lng: 135.4960,
    rating: 4.8,
    total_trips: 245,
    created_at: new Date().toISOString()
  });

  const driverId2 = uuidv4();
  const driverUserId2 = uuidv4();
  db.users.push({
    id: driverUserId2,
    name: 'Ahmad Fauzi',
    phone: '082444555666',
    email: 'ahmad.driver@example.com',
    password: bcrypt.hashSync('password123', 10),
    role: 'driver',
    wallet_balance: 180000,
    is_verified: true,
    is_active: true,
    avatar: null,
    created_at: new Date().toISOString()
  });
  db.drivers.push({
    id: driverId2,
    user_id: driverUserId2,
    vehicle_type: 'mobil',
    vehicle_plate: 'PB 5678 CD',
    vehicle_model: 'Toyota Avanza',
    vehicle_color: 'Putih',
    ktp_number: '9103041234567891',
    sim_number: 'SIM789012',
    stnk_number: 'STNK789012',
    is_verified: true,
    is_online: true,
    current_lat: -3.3720,
    current_lng: 135.5010,
    rating: 4.9,
    total_trips: 312,
    created_at: new Date().toISOString()
  });

  // Seed categories
  const categories = [
    { id: uuidv4(), name: 'Makanan & Minuman', icon: '🍔', type: 'product' },
    { id: uuidv4(), name: 'Elektronik', icon: '📱', type: 'product' },
    { id: uuidv4(), name: 'Pakaian', icon: '👕', type: 'product' },
    { id: uuidv4(), name: 'Kebutuhan Rumah', icon: '🏠', type: 'product' },
    { id: uuidv4(), name: 'Alat Musik', icon: '🎸', type: 'rental' },
    { id: uuidv4(), name: 'Tenda & Event', icon: '⛺', type: 'rental' },
    { id: uuidv4(), name: 'Kos & Penginapan', icon: '🏡', type: 'rental' },
    { id: uuidv4(), name: 'Alat Bangunan', icon: '🔧', type: 'rental' }
  ];
  db.categories.push(...categories);

  // Seed merchants
  const merchantId1 = uuidv4();
  const merchantUserId1 = uuidv4();
  db.users.push({
    id: merchantUserId1,
    name: 'Pemilik Fotokopi RRJM',
    phone: '082777888999',
    email: 'rrjm@example.com',
    password: bcrypt.hashSync('password123', 10),
    role: 'merchant',
    wallet_balance: 500000,
    is_verified: true,
    is_active: true,
    avatar: null,
    created_at: new Date().toISOString()
  });
  db.merchants.push({
    id: merchantId1,
    user_id: merchantUserId1,
    store_name: 'Fotokopi RRJM',
    store_description: 'Layanan fotokopi, print, laminating, dan jilid di Nabire',
    store_category: 'Percetakan',
    store_address: 'Jl. Pemuda No. 12, Nabire',
    store_lat: -3.3650,
    store_lng: 135.4970,
    phone: '082777888999',
    operating_hours: '08:00 - 21:00',
    is_open: true,
    is_verified: true,
    rating: 4.7,
    total_orders: 120,
    banner_image: null,
    created_at: new Date().toISOString()
  });

  const merchantId2 = uuidv4();
  const merchantUserId2 = uuidv4();
  db.users.push({
    id: merchantUserId2,
    name: 'Pemilik Warung Mama Papua',
    phone: '082333444555',
    email: 'mamapapua@example.com',
    password: bcrypt.hashSync('password123', 10),
    role: 'merchant',
    wallet_balance: 350000,
    is_verified: true,
    is_active: true,
    avatar: null,
    created_at: new Date().toISOString()
  });
  db.merchants.push({
    id: merchantId2,
    user_id: merchantUserId2,
    store_name: 'Warung Mama Papua',
    store_description: 'Masakan khas Papua dan makanan sehari-hari, halal dan segar',
    store_category: 'Makanan & Minuman',
    store_address: 'Jl. Trans Papua No. 45, Nabire',
    store_lat: -3.3690,
    store_lng: 135.5020,
    phone: '082333444555',
    operating_hours: '07:00 - 22:00',
    is_open: true,
    is_verified: true,
    rating: 4.9,
    total_orders: 350,
    banner_image: null,
    created_at: new Date().toISOString()
  });

  // Seed products
  db.products.push(
    {
      id: uuidv4(),
      merchant_id: merchantId2,
      name: 'Nasi + Ikan Bakar',
      description: 'Nasi putih dengan ikan bakar bumbu khas Papua, dilengkapi sambal dan lalapan segar',
      price: 25000,
      stock: 50,
      category: 'Makanan & Minuman',
      image: null,
      is_available: true,
      created_at: new Date().toISOString()
    },
    {
      id: uuidv4(),
      merchant_id: merchantId2,
      name: 'Papeda + Kuah Kuning',
      description: 'Makanan khas Papua berupa sagu cair disajikan dengan kuah ikan tongkol bumbu kuning',
      price: 20000,
      stock: 30,
      category: 'Makanan & Minuman',
      image: null,
      is_available: true,
      created_at: new Date().toISOString()
    },
    {
      id: uuidv4(),
      merchant_id: merchantId1,
      name: 'Fotokopi Hitam Putih',
      description: 'Layanan fotokopi dokumen hitam putih per lembar',
      price: 500,
      stock: 9999,
      category: 'Percetakan',
      image: null,
      is_available: true,
      created_at: new Date().toISOString()
    },
    {
      id: uuidv4(),
      merchant_id: merchantId1,
      name: 'Print Warna A4',
      description: 'Cetak dokumen berwarna ukuran A4 berkualitas tinggi',
      price: 3000,
      stock: 9999,
      category: 'Percetakan',
      image: null,
      is_available: true,
      created_at: new Date().toISOString()
    }
  );

  // Seed rentals (GooSewa)
  const rentalOwnerId = uuidv4();
  db.users.push({
    id: rentalOwnerId,
    name: 'Rental Nabire Jaya',
    phone: '082666777888',
    email: 'nabirejaya@example.com',
    password: bcrypt.hashSync('password123', 10),
    role: 'merchant',
    wallet_balance: 800000,
    is_verified: true,
    is_active: true,
    avatar: null,
    created_at: new Date().toISOString()
  });

  db.rentals.push(
    {
      id: uuidv4(),
      owner_id: rentalOwnerId,
      name: 'Tenda Pesta Besar',
      description: 'Tenda pesta kapasitas 200 orang, lengkap dengan kursi dan dekorasi dasar. Cocok untuk pesta pernikahan, ulang tahun, atau acara resmi.',
      category: 'Tenda & Event',
      price_per_day: 500000,
      price_per_week: 2500000,
      price_per_month: null,
      deposit: 1000000,
      stock: 3,
      available_stock: 2,
      location: 'Jl. Saireri No. 8, Nabire',
      lat: -3.3670,
      lng: 135.4990,
      images: [],
      is_available: true,
      rating: 4.8,
      created_at: new Date().toISOString()
    },
    {
      id: uuidv4(),
      owner_id: rentalOwnerId,
      name: 'Set Alat Musik Band Lengkap',
      description: 'Paket lengkap alat musik: gitar elektrik, bass, drum, keyboard, dan sound system. Ideal untuk acara hiburan dan pentas seni.',
      category: 'Alat Musik',
      price_per_day: 350000,
      price_per_week: 1500000,
      price_per_month: null,
      deposit: 500000,
      stock: 2,
      available_stock: 1,
      location: 'Jl. Saireri No. 8, Nabire',
      lat: -3.3670,
      lng: 135.4990,
      images: [],
      is_available: true,
      rating: 4.6,
      created_at: new Date().toISOString()
    },
    {
      id: uuidv4(),
      owner_id: rentalOwnerId,
      name: 'Kamar Kos Harian Strategis',
      description: 'Kamar kos harian di pusat kota Nabire, AC, WiFi, kamar mandi dalam. Dekat dengan pasar dan perkantoran. Cocok untuk tamu bisnis atau kunjungan singkat.',
      category: 'Kos & Penginapan',
      price_per_day: 150000,
      price_per_week: 800000,
      price_per_month: 2500000,
      deposit: 200000,
      stock: 5,
      available_stock: 3,
      location: 'Jl. Halmahera No. 22, Nabire',
      lat: -3.3710,
      lng: 135.4950,
      images: [],
      is_available: true,
      rating: 4.7,
      created_at: new Date().toISOString()
    }
  );

  // Seed sample orders
  const sampleUserId = db.users.find(u => u.name === 'Budi Santoso')?.id;
  db.orders.push({
    id: uuidv4(),
    order_number: 'GRD-001-2024',
    user_id: sampleUserId,
    driver_id: driverId1,
    service_type: 'GooRide',
    pickup_address: 'Jl. Ahmad Yani, Nabire',
    pickup_lat: -3.3660,
    pickup_lng: 135.4980,
    destination_address: 'Pasar Saniri, Nabire',
    destination_lat: -3.3750,
    destination_lng: 135.5050,
    distance_km: 3.2,
    base_fare: 10000,
    distance_fare: 9600,
    total_amount: 19600,
    payment_method: 'cash',
    status: 'completed',
    notes: '',
    created_at: new Date(Date.now() - 3600000).toISOString(),
    completed_at: new Date(Date.now() - 3000000).toISOString()
  });

  return db;
};

// Initialize in-memory database
mockDB = createMockDB();

// Database query interface
const query = async (text, params) => {
  // This is a mock - in production, replace with real pg pool.query
  console.log('[MockDB] Query:', text.substring(0, 50));
  return { rows: [], rowCount: 0 };
};

module.exports = {
  query,
  getMockDB: () => mockDB,
  pool: null
};
