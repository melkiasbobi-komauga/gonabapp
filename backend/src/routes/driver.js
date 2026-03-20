const express = require('express');
const router = express.Router();
const { getNearbyDrivers, updateDriverLocation, toggleOnlineStatus, registerDriver, getDriverEarnings } = require('../controllers/driverController');
const { authMiddleware, driverMiddleware } = require('../middleware/auth');

router.get('/nearby', getNearbyDrivers);
router.post('/register', authMiddleware, registerDriver);
router.put('/location', driverMiddleware, updateDriverLocation);
router.put('/toggle-online', driverMiddleware, toggleOnlineStatus);
router.get('/earnings', driverMiddleware, getDriverEarnings);

module.exports = router;
