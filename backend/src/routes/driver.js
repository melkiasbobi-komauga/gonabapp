const express = require('express');
const router = express.Router();
const {
  getNearbyDrivers, updateDriverLocation, toggleOnlineStatus,
  getDriverProfile, getDriverOrders, updateOrderStatus, getEarnings
} = require('../controllers/driverController');
const { authMiddleware, driverMiddleware } = require('../middleware/auth');

// Public
router.get('/nearby', getNearbyDrivers);

// Driver auth required
router.get('/profile',          driverMiddleware, getDriverProfile);
router.put('/location',         driverMiddleware, updateDriverLocation);
router.put('/online',           driverMiddleware, toggleOnlineStatus);
router.get('/orders',           driverMiddleware, getDriverOrders);
router.put('/orders/:id/status',driverMiddleware, updateOrderStatus);
router.get('/earnings',         driverMiddleware, getEarnings);

module.exports = router;
