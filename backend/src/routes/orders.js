const express = require('express');
const router = express.Router();
const { getEstimate, createOrder, getMyOrders, getOrderById, cancelOrder, activateSOS, getAvailableOrders, updateOrderStatus } = require('../controllers/orderController');
const { authMiddleware, driverMiddleware } = require('../middleware/auth');

router.get('/estimate', getEstimate);
router.post('/', authMiddleware, createOrder);
router.get('/', authMiddleware, getMyOrders);
router.get('/:id', authMiddleware, getOrderById);
router.put('/:id/cancel', authMiddleware, cancelOrder);
router.post('/:id/sos', authMiddleware, activateSOS);

// Driver routes
router.get('/driver/available', driverMiddleware, getAvailableOrders);
router.put('/driver/:id/status', driverMiddleware, updateOrderStatus);

module.exports = router;
