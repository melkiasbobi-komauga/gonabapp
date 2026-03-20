const { v4: uuidv4 } = require('uuid');
const { query, withTransaction } = require('../config/database');
const { sendSuccess, sendError } = require('../utils/helpers');

// ─── GET /api/wallet/balance ──────────────────────────────────
const getBalance = async (req, res) => {
  try {
    const [userRes, txRes] = await Promise.all([
      query(`SELECT wallet_balance FROM users WHERE id=$1`, [req.user.id]),
      query(
        `SELECT id, type, amount, description, status, created_at
         FROM wallet_transactions
         WHERE user_id=$1 ORDER BY created_at DESC LIMIT 10`,
        [req.user.id])
    ]);
    if (!userRes.rows.length) return sendError(res, 'User tidak ditemukan.', 404);
    return sendSuccess(res, {
      balance: parseFloat(userRes.rows[0].wallet_balance),
      recent_transactions: txRes.rows
    });
  } catch (err) {
    return sendError(res, 'Gagal mengambil saldo: ' + err.message, 500);
  }
};

// ─── POST /api/wallet/topup ───────────────────────────────────
const topUp = async (req, res) => {
  try {
    const { amount, payment_method = 'bank_transfer' } = req.body;
    if (!amount || amount < 10000)   return sendError(res, 'Jumlah top-up minimal Rp 10.000.');
    if (amount > 10000000)           return sendError(res, 'Jumlah top-up maksimal Rp 10.000.000.');

    const txId = uuidv4();
    const result = await withTransaction(async (client) => {
      // Get current balance
      const balRes = await client.query(
        `SELECT wallet_balance FROM users WHERE id=$1 FOR UPDATE`, [req.user.id]);
      const balBefore = parseFloat(balRes.rows[0].wallet_balance);
      const balAfter  = balBefore + parseInt(amount);

      await client.query(
        `INSERT INTO wallet_transactions(id,user_id,type,amount,balance_before,balance_after,description,payment_method,reference_code,status)
         VALUES($1,$2,'credit',$3,$4,$5,$6,$7,$8,'success')`,
        [txId, req.user.id, parseInt(amount), balBefore, balAfter,
         `Top-up GooWallet via ${payment_method}`, payment_method, txId]
      );
      await client.query(
        `UPDATE users SET wallet_balance=$1 WHERE id=$2`, [balAfter, req.user.id]);
      return { new_balance: balAfter, amount: parseInt(amount), reference_code: txId };
    });

    return sendSuccess(res, result, 'Top-up berhasil diproses.');
  } catch (err) {
    return sendError(res, 'Gagal melakukan top-up: ' + err.message, 500);
  }
};

// ─── GET /api/wallet/transactions ────────────────────────────
const getTransactions = async (req, res) => {
  try {
    const { page = 1, limit = 20, type } = req.query;
    const offset = (page - 1) * limit;
    const params = [req.user.id];
    let where = `WHERE user_id=$1`;
    if (type) { params.push(type); where += ` AND type=$${params.length}`; }
    const countRes = await query(`SELECT COUNT(*) FROM wallet_transactions ${where}`, params);
    params.push(parseInt(limit), offset);
    const { rows } = await query(
      `SELECT * FROM wallet_transactions ${where}
       ORDER BY created_at DESC LIMIT $${params.length-1} OFFSET $${params.length}`,
      params
    );
    return sendSuccess(res, {
      transactions: rows,
      total: parseInt(countRes.rows[0].count),
      page: parseInt(page),
      total_pages: Math.ceil(countRes.rows[0].count / limit)
    });
  } catch (err) {
    return sendError(res, 'Gagal mengambil riwayat transaksi: ' + err.message, 500);
  }
};

// ─── POST /api/wallet/transfer ────────────────────────────────
const transfer = async (req, res) => {
  try {
    const { to_phone, amount, note = '' } = req.body;
    if (!to_phone) return sendError(res, 'Nomor tujuan wajib diisi.');
    if (!amount || amount < 1000) return sendError(res, 'Jumlah transfer minimal Rp 1.000.');

    const senderRes = await query(
      `SELECT wallet_balance FROM users WHERE id=$1`, [req.user.id]);
    if (parseFloat(senderRes.rows[0].wallet_balance) < amount)
      return sendError(res, 'Saldo tidak mencukupi.', 400);

    const recipientRes = await query(
      `SELECT id, name FROM users WHERE phone=$1`, [to_phone]);
    if (!recipientRes.rows.length) return sendError(res, 'Penerima tidak ditemukan.', 404);
    const recipient = recipientRes.rows[0];
    if (recipient.id === req.user.id) return sendError(res, 'Tidak dapat transfer ke diri sendiri.');

    const refCode = uuidv4();
    const result = await withTransaction(async (client) => {
      // Sender balances
      const sBal = await client.query(
        `SELECT wallet_balance FROM users WHERE id=$1 FOR UPDATE`, [req.user.id]);
      const sBalBefore = parseFloat(sBal.rows[0].wallet_balance);
      const sBalAfter  = sBalBefore - parseInt(amount);

      await client.query(
        `INSERT INTO wallet_transactions(id,user_id,type,amount,balance_before,balance_after,description,reference_code,status)
         VALUES($1,$2,'debit',$3,$4,$5,$6,$7,'success')`,
        [uuidv4(), req.user.id, parseInt(amount), sBalBefore, sBalAfter,
         `Transfer ke ${recipient.name}${note ? ': ' + note : ''}`, refCode]
      );
      await client.query(
        `UPDATE users SET wallet_balance=$1 WHERE id=$2`, [sBalAfter, req.user.id]);

      // Recipient balances
      const rBal = await client.query(
        `SELECT wallet_balance FROM users WHERE id=$1 FOR UPDATE`, [recipient.id]);
      const rBalBefore = parseFloat(rBal.rows[0].wallet_balance);
      const rBalAfter  = rBalBefore + parseInt(amount);

      await client.query(
        `INSERT INTO wallet_transactions(id,user_id,type,amount,balance_before,balance_after,description,reference_code,status)
         VALUES($1,$2,'credit',$3,$4,$5,$6,$7,'success')`,
        [uuidv4(), recipient.id, parseInt(amount), rBalBefore, rBalAfter,
         `Terima transfer${note ? ': ' + note : ''}`, refCode]
      );
      await client.query(
        `UPDATE users SET wallet_balance=$1 WHERE id=$2`, [rBalAfter, recipient.id]);

      return {
        sender_balance   : sBalAfter,
        amount_transferred: parseInt(amount),
        recipient_name   : recipient.name,
        reference_code   : refCode
      };
    });

    return sendSuccess(res, result, `Transfer Rp ${parseInt(amount).toLocaleString('id')} ke ${recipient.name} berhasil.`);
  } catch (err) {
    return sendError(res, 'Gagal melakukan transfer: ' + err.message, 500);
  }
};

module.exports = { getBalance, topUp, getTransactions, transfer };
