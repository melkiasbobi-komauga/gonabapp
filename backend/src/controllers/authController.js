const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { getMockDB } = require('../config/database');
const { sendSuccess, sendError } = require('../utils/helpers');

const JWT_SECRET = process.env.JWT_SECRET || 'gonab_secret';
const JWT_EXPIRES = process.env.JWT_EXPIRES_IN || '7d';

// POST /api/auth/register
const register = async (req, res) => {
  try {
    const { name, phone, email, password, role = 'customer' } = req.body;
    if (!name || !phone || !password) {
      return sendError(res, 'Nama, nomor HP, dan kata sandi wajib diisi.');
    }
    const db = getMockDB();
    const existing = db.users.find(u => u.phone === phone);
    if (existing) {
      return sendError(res, 'Nomor HP sudah terdaftar. Silakan gunakan nomor lain.');
    }
    const hashedPassword = bcrypt.hashSync(password, 10);
    const newUser = {
      id: uuidv4(),
      name: name.trim(),
      phone: phone.trim(),
      email: email?.trim() || null,
      password: hashedPassword,
      role: ['customer', 'driver', 'merchant'].includes(role) ? role : 'customer',
      wallet_balance: 0,
      is_verified: false,
      is_active: true,
      avatar: null,
      created_at: new Date().toISOString()
    };
    db.users.push(newUser);
    const token = jwt.sign({ id: newUser.id, role: newUser.role }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
    const { password: _, ...userWithoutPassword } = newUser;
    return sendSuccess(res, { user: userWithoutPassword, token }, 'Pendaftaran berhasil!', 201);
  } catch (err) {
    return sendError(res, 'Gagal mendaftar: ' + err.message, 500);
  }
};

// POST /api/auth/login
const login = async (req, res) => {
  try {
    const { phone, password } = req.body;
    if (!phone || !password) {
      return sendError(res, 'Nomor HP dan kata sandi wajib diisi.');
    }
    const db = getMockDB();
    const user = db.users.find(u => u.phone === phone);
    if (!user) {
      return sendError(res, 'Nomor HP tidak terdaftar.', 404);
    }
    if (!user.is_active) {
      return sendError(res, 'Akun Anda telah dinonaktifkan. Hubungi admin.', 403);
    }
    const isMatch = bcrypt.compareSync(password, user.password);
    if (!isMatch) {
      return sendError(res, 'Kata sandi salah.', 401);
    }
    const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
    const { password: _, ...userWithoutPassword } = user;
    
    // If driver, include driver info
    let extra = {};
    if (user.role === 'driver') {
      const driverInfo = db.drivers.find(d => d.user_id === user.id);
      if (driverInfo) extra.driver = driverInfo;
    }
    if (user.role === 'merchant') {
      const merchantInfo = db.merchants.find(m => m.user_id === user.id);
      if (merchantInfo) extra.merchant = merchantInfo;
    }

    return sendSuccess(res, { user: userWithoutPassword, token, ...extra }, 'Login berhasil! Selamat datang di GONAB.');
  } catch (err) {
    return sendError(res, 'Gagal login: ' + err.message, 500);
  }
};

// GET /api/auth/me
const getMe = async (req, res) => {
  try {
    const db = getMockDB();
    const { password: _, ...userWithoutPassword } = req.user;
    let extra = {};
    if (req.user.role === 'driver') {
      extra.driver = db.drivers.find(d => d.user_id === req.user.id) || null;
    }
    if (req.user.role === 'merchant') {
      extra.merchant = db.merchants.find(m => m.user_id === req.user.id) || null;
    }
    return sendSuccess(res, { user: userWithoutPassword, ...extra }, 'Data profil berhasil diambil.');
  } catch (err) {
    return sendError(res, 'Gagal mengambil profil: ' + err.message, 500);
  }
};

// PUT /api/auth/profile
const updateProfile = async (req, res) => {
  try {
    const { name, email } = req.body;
    const db = getMockDB();
    const userIdx = db.users.findIndex(u => u.id === req.user.id);
    if (userIdx === -1) return sendError(res, 'Pengguna tidak ditemukan.', 404);
    if (name) db.users[userIdx].name = name.trim();
    if (email) db.users[userIdx].email = email.trim();
    const { password: _, ...updated } = db.users[userIdx];
    return sendSuccess(res, { user: updated }, 'Profil berhasil diperbarui.');
  } catch (err) {
    return sendError(res, 'Gagal memperbarui profil: ' + err.message, 500);
  }
};

// POST /api/auth/change-password
const changePassword = async (req, res) => {
  try {
    const { old_password, new_password } = req.body;
    if (!old_password || !new_password) {
      return sendError(res, 'Kata sandi lama dan baru wajib diisi.');
    }
    const db = getMockDB();
    const userIdx = db.users.findIndex(u => u.id === req.user.id);
    if (!bcrypt.compareSync(old_password, db.users[userIdx].password)) {
      return sendError(res, 'Kata sandi lama salah.', 401);
    }
    if (new_password.length < 6) {
      return sendError(res, 'Kata sandi baru minimal 6 karakter.');
    }
    db.users[userIdx].password = bcrypt.hashSync(new_password, 10);
    return sendSuccess(res, null, 'Kata sandi berhasil diubah.');
  } catch (err) {
    return sendError(res, 'Gagal mengubah kata sandi: ' + err.message, 500);
  }
};

module.exports = { register, login, getMe, updateProfile, changePassword };
