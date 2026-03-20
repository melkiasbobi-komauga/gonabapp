require('dotenv').config();
const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const cors       = require('cors');
const helmet     = require('helmet');
const compression = require('compression');
const morgan     = require('morgan');
const path       = require('path');

const authRoutes    = require('./routes/auth');
const orderRoutes   = require('./routes/orders');
const merchantRoutes= require('./routes/merchant');
const rentalRoutes  = require('./routes/rentals');
const walletRoutes  = require('./routes/wallet');
const driverRoutes  = require('./routes/driver');
const adminRoutes   = require('./routes/admin');
const mapsRoutes    = require('./routes/maps');
const { setupSocket } = require('./socket/socketHandler');
const { testConnection } = require('./config/database');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE'] }
});

// ─── Middleware ───────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(compression());
app.use(cors({ origin: '*', credentials: true }));
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ─── Static frontend ─────────────────────────────────────────
app.use(express.static(path.join(__dirname, '../../frontend/public')));

// ─── Health check ─────────────────────────────────────────────
app.get('/health', async (req, res) => {
  const dbOk = await testConnection().catch(() => false);
  res.json({
    status: dbOk ? 'OK' : 'DEGRADED',
    app: 'GONAB API',
    version: '1.0.0',
    db: dbOk ? 'PostgreSQL+PostGIS connected' : 'DB unavailable',
    location: 'Kabupaten Nabire, Papua Tengah',
    timestamp: new Date().toISOString()
  });
});

// ─── API info ─────────────────────────────────────────────────
app.get('/api', (req, res) => {
  res.json({
    app: 'GONAB - Platform Penjualan & Jasa Nabire',
    version: '1.0.0',
    db: 'PostgreSQL + PostGIS',
    description: 'API Backend untuk Ekosistem GONAB Kabupaten Nabire, Papua Tengah',
    modules: ['GooRide', 'GooCard', 'GooKurir', 'GooShop', 'GooSewa', 'GooAmbulance'],
    endpoints: {
      auth:     '/api/auth',
      orders:   '/api/orders',
      merchants:'/api/merchants',
      products: '/api/products',
      rentals:  '/api/rentals',
      wallet:   '/api/wallet',
      drivers:  '/api/drivers',
      maps:     '/api/maps',
      admin:    '/api/admin'
    }
  });
});

// ─── Routes ───────────────────────────────────────────────────
app.use('/api/auth',    authRoutes);
app.use('/api/orders',  orderRoutes);
app.use('/api',         merchantRoutes);   // /api/merchants + /api/products
app.use('/api/rentals', rentalRoutes);
app.use('/api/wallet',  walletRoutes);
app.use('/api/drivers', driverRoutes);
app.use('/api/maps',    mapsRoutes);
app.use('/api/admin',   adminRoutes);

// ─── Socket.io ───────────────────────────────────────────────
setupSocket(io);

// ─── 404 ──────────────────────────────────────────────────────
app.use('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `Endpoint ${req.method} ${req.originalUrl} tidak ditemukan.`
  });
});

// ─── Frontend fallback ────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../../frontend/public/index.html'));
});

// ─── Global error handler ─────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[Error]', err.message);
  res.status(500).json({ success: false, message: 'Internal Server Error', error: err.message });
});

// ─── Start ────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', async () => {
  console.log('\n🚀 ============================================');
  console.log('   GONAB - Platform Digital Nabire');
  console.log('   Kabupaten Nabire, Papua Tengah');
  console.log('============================================');
  console.log(`✅ Server berjalan di : http://0.0.0.0:${PORT}`);
  console.log(`📡 Socket.io aktif   : port ${PORT}`);
  console.log(`🌐 Admin Dashboard   : http://0.0.0.0:${PORT}/`);
  console.log(`📱 API Base URL      : http://0.0.0.0:${PORT}/api`);

  const ok = await testConnection().catch(() => false);
  console.log(`🗄️  PostgreSQL+PostGIS : ${ok ? '✅ Terhubung' : '❌ Gagal (cek .env)'}`);
  console.log('============================================\n');
  console.log('🔐 Admin Login : 082199990000 / Admin@gonab2024');
  console.log('👤 Test User   : 081234567890 / password123\n');
});

module.exports = { app, server, io };
