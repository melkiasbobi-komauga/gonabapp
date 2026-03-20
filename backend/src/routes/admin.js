const express = require('express');
const router = express.Router();
const {
  getDashboard, getUsers, toggleUser,
  getDrivers, verifyDriver,
  getMerchants, verifyMerchant,
  getOrders, getTariffs, updateTariff,
  getSosAlerts, getAdminLogs, getDriversMap, getAnalytics
} = require('../controllers/adminController');
const { adminMiddleware } = require('../middleware/auth');

router.use(adminMiddleware);

router.get('/dashboard',            getDashboard);
router.get('/analytics',            getAnalytics);
router.get('/users',                getUsers);
router.put('/users/:id/toggle',     toggleUser);
router.get('/drivers',              getDrivers);
router.put('/drivers/:id/verify',   verifyDriver);
router.get('/merchants',            getMerchants);
router.put('/merchants/:id/verify', verifyMerchant);
router.get('/orders',               getOrders);
router.get('/tariffs',              getTariffs);
router.put('/tariffs/:id',          updateTariff);
router.get('/sos',                  getSosAlerts);
router.get('/logs',                 getAdminLogs);
router.get('/map/drivers',          getDriversMap);

module.exports = router;
