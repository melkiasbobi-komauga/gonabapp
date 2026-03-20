const express = require('express');
const router = express.Router();
const { getBalance, topUp, getTransactions, transfer } = require('../controllers/walletController');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

router.get('/balance',      getBalance);
router.post('/topup',       topUp);
router.get('/transactions', getTransactions);
router.post('/transfer',    transfer);

module.exports = router;
