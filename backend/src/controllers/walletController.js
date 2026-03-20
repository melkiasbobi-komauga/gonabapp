const { v4: uuidv4 } = require('uuid');
const { getMockDB } = require('../config/database');
const { sendSuccess, sendError } = require('../utils/helpers');

// GET /api/wallet/balance
const getBalance = async (req, res) => {
  try {
    const db = getMockDB();
    const user = db.users.find(u => u.id === req.user.id);
    const transactions = db.walletTransactions.filter(t => t.user_id === req.user.id)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 10);
    return sendSuccess(res, { balance: user.wallet_balance, recent_transactions: transactions });
  } catch (err) {
    return sendError(res, 'Gagal mengambil saldo: ' + err.message, 500);
  }
};

// POST /api/wallet/topup
const topUp = async (req, res) => {
  try {
    const { amount, payment_method = 'bank_transfer' } = req.body;
    if (!amount || amount < 10000) return sendError(res, 'Jumlah top-up minimal Rp 10.000.');
    if (amount > 10000000) return sendError(res, 'Jumlah top-up maksimal Rp 10.000.000.');
    const db = getMockDB();
    const userIdx = db.users.findIndex(u => u.id === req.user.id);
    db.users[userIdx].wallet_balance += parseInt(amount);
    const tx = {
      id: uuidv4(), user_id: req.user.id, type: 'credit',
      amount: parseInt(amount),
      description: `Top-up GooWallet via ${payment_method}`,
      payment_method, status: 'success',
      created_at: new Date().toISOString()
    };
    db.walletTransactions.push(tx);
    return sendSuccess(res, {
      transaction: tx,
      new_balance: db.users[userIdx].wallet_balance
    }, `Top-up Rp ${parseInt(amount).toLocaleString('id-ID')} berhasil!`);
  } catch (err) {
    return sendError(res, 'Gagal top-up: ' + err.message, 500);
  }
};

// GET /api/wallet/transactions
const getTransactions = async (req, res) => {
  try {
    const { page = 1, limit = 20, type } = req.query;
    const db = getMockDB();
    let txs = db.walletTransactions.filter(t => t.user_id === req.user.id);
    if (type) txs = txs.filter(t => t.type === type);
    txs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const total = txs.length;
    const paginated = txs.slice((page - 1) * limit, page * limit);
    return sendSuccess(res, { transactions: paginated, total, page: parseInt(page), total_pages: Math.ceil(total / limit) });
  } catch (err) {
    return sendError(res, 'Gagal mengambil riwayat transaksi: ' + err.message, 500);
  }
};

module.exports = { getBalance, topUp, getTransactions };
