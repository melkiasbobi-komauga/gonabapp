const express = require('express');
const router = express.Router();
const { getDashboard, getAllUsers, toggleUserStatus, getAllDrivers, verifyDriver, getAllMerchants, verifyMerchant, getAllOrders, updateTariff, getSOSAlerts } = require('../controllers/adminController');
const { adminMiddleware } = require('../middleware/auth');

router.use(adminMiddleware);

router.get('/dashboard', getDashboard);
router.get('/users', getAllUsers);
router.put('/users/:id/toggle', toggleUserStatus);
router.get('/drivers', getAllDrivers);
router.put('/drivers/:id/verify', verifyDriver);
router.get('/merchants', getAllMerchants);
router.put('/merchants/:id/verify', verifyMerchant);
router.get('/orders', getAllOrders);
router.put('/tariff', updateTariff);
router.get('/sos', getSOSAlerts);

module.exports = router;
