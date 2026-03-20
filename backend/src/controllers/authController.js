const bcrypt = require('bcryptjs');
const jwt    = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../config/database');
const { sendSuccess, sendError } = require('../utils/helpers');

const JWT_SECRET  = process.env.JWT_SECRET   || 'gonab_secret';
const JWT_EXPIRES = process.env.JWT_EXPIRES_IN || '7d';

// ─── POST /api/auth/register ────────────────────────────────
const register = async (req, res) => {
  try {
    const { name, phone, email, password, role = 'customer' } = req.body;
    if (!name || !phone || !password)
      return sendError(res, 'Nama, nomor HP, dan kata sandi wajib diisi.');

    const { rows: existing } = await query('SELECT id FROM users WHERE phone = $1', [phone]);
    if (existing.length)
      return sendError(res, 'Nomor HP sudah terdaftar. Silakan gunakan nomor lain.');

    const safeRole = ['customer','driver','merchant'].includes(role) ? role : 'customer';
    const hashed   = bcrypt.hashSync(password, 10);
    const id       = uuidv4();

    const { rows } = await query(
      `INSERT INTO users (id, name, phone, email, password, role)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING id, name, phone, email, role, wallet_balance, is_verified, is_active, created_at`,
      [id, name.trim(), phone.trim(), email?.trim() || null, hashed, safeRole]
    );
    const user  = rows[0];
    const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
    return sendSuccess(res, { user, token }, 'Pendaftaran berhasil!', 201);
  } catch (err) {
    return sendError(res, 'Gagal mendaftar: ' + err.message, 500);
  }
};

// ─── POST /api/auth/login ────────────────────────────────────
const login = async (req, res) => {
  try {
    const { phone, password } = req.body;
    if (!phone || !password)
      return sendError(res, 'Nomor HP dan kata sandi wajib diisi.');

    const { rows } = await query(
      `SELECT id, name, phone, email, password, role, wallet_balance,
              is_verified, is_active, avatar, created_at
       FROM users WHERE phone = $1`, [phone]
    );
    if (!rows.length)
      return sendError(res, 'Nomor HP tidak terdaftar.', 404);

    const user = rows[0];
    if (!user.is_active)
      return sendError(res, 'Akun Anda telah dinonaktifkan. Hubungi admin.', 403);
    if (!bcrypt.compareSync(password, user.password))
      return sendError(res, 'Kata sandi salah.', 401);

    // Update last login
    await query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

    const { password: _, ...userClean } = user;
    const token = jwt.sign({ id: user.id, role: user.role }, JWT_SECRET, { expiresIn: JWT_EXPIRES });

    let extra = {};
    if (user.role === 'driver') {
      const { rows: dr } = await query(
        `SELECT id, vehicle_type, vehicle_plate, vehicle_model, vehicle_color,
                is_verified, is_online,
                ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng,
                rating, total_trips
         FROM drivers WHERE user_id = $1`, [user.id]
      );
      if (dr.length) extra.driver = dr[0];
    }
    if (user.role === 'merchant') {
      const { rows: mr } = await query(
        `SELECT id, store_name, store_category, is_open, is_verified, rating
         FROM merchants WHERE user_id = $1`, [user.id]
      );
      if (mr.length) extra.merchant = mr[0];
    }

    return sendSuccess(res, { user: userClean, token, ...extra }, 'Login berhasil! Selamat datang di GONAB.');
  } catch (err) {
    return sendError(res, 'Gagal login: ' + err.message, 500);
  }
};

// ─── GET /api/auth/me ────────────────────────────────────────
const getMe = async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, name, phone, email, role, wallet_balance,
              is_verified, is_active, avatar, created_at
       FROM users WHERE id = $1`, [req.user.id]
    );
    if (!rows.length) return sendError(res, 'Pengguna tidak ditemukan.', 404);
    const user = rows[0];
    let extra = {};
    if (user.role === 'driver') {
      const { rows: dr } = await query(
        `SELECT id, vehicle_type, vehicle_plate, vehicle_model, vehicle_color,
                is_verified, is_online,
                ST_Y(location::geometry) AS lat, ST_X(location::geometry) AS lng,
                rating, total_trips, total_earnings
         FROM drivers WHERE user_id = $1`, [user.id]
      );
      if (dr.length) extra.driver = dr[0];
    }
    if (user.role === 'merchant') {
      const { rows: mr } = await query(
        `SELECT id, store_name, store_category, store_address, is_open, is_verified, rating, total_orders
         FROM merchants WHERE user_id = $1`, [user.id]
      );
      if (mr.length) extra.merchant = mr[0];
    }
    return sendSuccess(res, { user, ...extra });
  } catch (err) {
    return sendError(res, 'Gagal mengambil profil: ' + err.message, 500);
  }
};

// ─── PUT /api/auth/profile ───────────────────────────────────
const updateProfile = async (req, res) => {
  try {
    const { name, email } = req.body;
    const { rows } = await query(
      `UPDATE users SET
         name = COALESCE($1, name),
         email = COALESCE($2, email)
       WHERE id = $3
       RETURNING id, name, phone, email, role, wallet_balance, avatar`,
      [name?.trim() || null, email?.trim() || null, req.user.id]
    );
    return sendSuccess(res, { user: rows[0] }, 'Profil berhasil diperbarui.');
  } catch (err) {
    return sendError(res, 'Gagal memperbarui profil: ' + err.message, 500);
  }
};

// ─── POST /api/auth/change-password ─────────────────────────
const changePassword = async (req, res) => {
  try {
    const { old_password, new_password } = req.body;
    if (!old_password || !new_password)
      return sendError(res, 'Kata sandi lama dan baru wajib diisi.');
    if (new_password.length < 6)
      return sendError(res, 'Kata sandi baru minimal 6 karakter.');

    const { rows } = await query('SELECT password FROM users WHERE id = $1', [req.user.id]);
    if (!bcrypt.compareSync(old_password, rows[0].password))
      return sendError(res, 'Kata sandi lama salah.', 401);

    await query('UPDATE users SET password = $1 WHERE id = $2',
      [bcrypt.hashSync(new_password, 10), req.user.id]);
    return sendSuccess(res, null, 'Kata sandi berhasil diubah.');
  } catch (err) {
    return sendError(res, 'Gagal mengubah kata sandi: ' + err.message, 500);
  }
};

module.exports = { register, login, getMe, updateProfile, changePassword };
