const jwt   = require('jsonwebtoken');
const { query } = require('../config/database');

const JWT_SECRET = process.env.JWT_SECRET || 'gonab_secret';

const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer '))
    return res.status(401).json({ success: false, message: 'Token tidak ditemukan. Silakan login terlebih dahulu.' });

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const { rows } = await query(
      'SELECT id, name, phone, email, role, wallet_balance, is_active FROM users WHERE id = $1',
      [decoded.id]
    );
    if (!rows.length || !rows[0].is_active)
      return res.status(401).json({ success: false, message: 'Akun tidak ditemukan atau tidak aktif.' });
    req.user = rows[0];
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Token tidak valid atau sudah kadaluarsa.' });
  }
};

const adminMiddleware = async (req, res, next) => {
  await authMiddleware(req, res, () => {
    if (req.user.role !== 'admin')
      return res.status(403).json({ success: false, message: 'Akses ditolak. Hanya untuk Admin.' });
    next();
  });
};

const driverMiddleware = async (req, res, next) => {
  await authMiddleware(req, res, () => {
    if (req.user.role !== 'driver')
      return res.status(403).json({ success: false, message: 'Akses ditolak. Hanya untuk Driver.' });
    next();
  });
};

const merchantMiddleware = async (req, res, next) => {
  await authMiddleware(req, res, () => {
    if (!['merchant','admin'].includes(req.user.role))
      return res.status(403).json({ success: false, message: 'Akses ditolak. Hanya untuk Merchant.' });
    next();
  });
};

module.exports = { authMiddleware, adminMiddleware, driverMiddleware, merchantMiddleware };
