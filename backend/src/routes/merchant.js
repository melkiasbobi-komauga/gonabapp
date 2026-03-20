const express = require('express');
const router = express.Router();
const { getMerchants, getMerchantById, getProducts, createShopOrder, getMerchantOrders, updateMerchantOrderStatus, addProduct, toggleStoreStatus } = require('../controllers/merchantController');
const { authMiddleware, merchantMiddleware } = require('../middleware/auth');

// Public
router.get('/merchants', getMerchants);
router.get('/merchants/:id', getMerchantById);
router.get('/products', getProducts);

// Customer
router.post('/shop/order', authMiddleware, createShopOrder);

// Merchant
router.get('/merchant/orders', merchantMiddleware, getMerchantOrders);
router.put('/merchant/orders/:id/status', merchantMiddleware, updateMerchantOrderStatus);
router.post('/merchant/products', merchantMiddleware, addProduct);
router.put('/merchant/toggle-status', merchantMiddleware, toggleStoreStatus);

module.exports = router;
