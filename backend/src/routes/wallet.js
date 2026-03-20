const express = require('express');
const router = express.Router();
const { getBalance, topUp, getTransactions } = require('../controllers/walletController');
const { authMiddleware } = require('../middleware/auth');

router.get('/balance', authMiddleware, getBalance);
router.post('/topup', authMiddleware, topUp);
router.get('/transactions', authMiddleware, getTransactions);

module.exports = router;
