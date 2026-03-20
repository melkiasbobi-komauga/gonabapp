const jwt = require('jsonwebtoken');
const { getMockDB } = require('../config/database');

const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Token tidak ditemukan. Silakan login terlebih dahulu.' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'gonab_secret');
    const db = getMockDB();
    const user = db.users.find(u => u.id === decoded.id);
    if (!user || !user.is_active) {
      return res.status(401).json({ success: false, message: 'Akun tidak ditemukan atau tidak aktif.' });
    }
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Token tidak valid atau sudah kadaluarsa.' });
  }
};

const adminMiddleware = (req, res, next) => {
  authMiddleware(req, res, () => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Akses ditolak. Hanya untuk Admin.' });
    }
    next();
  });
};

const driverMiddleware = (req, res, next) => {
  authMiddleware(req, res, () => {
    if (req.user.role !== 'driver') {
      return res.status(403).json({ success: false, message: 'Akses ditolak. Hanya untuk Driver.' });
    }
    next();
  });
};

const merchantMiddleware = (req, res, next) => {
  authMiddleware(req, res, () => {
    if (!['merchant', 'admin'].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Akses ditolak. Hanya untuk Merchant.' });
    }
    next();
  });
};

module.exports = { authMiddleware, adminMiddleware, driverMiddleware, merchantMiddleware };
