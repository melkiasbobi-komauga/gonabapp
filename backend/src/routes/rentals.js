const express = require('express');
const router = express.Router();
const { getRentals, getRentalById, bookRental, addRental } = require('../controllers/rentalController');
const { authMiddleware } = require('../middleware/auth');

router.get('/', getRentals);
router.get('/:id', getRentalById);
router.post('/book', authMiddleware, bookRental);
router.post('/', authMiddleware, addRental);

module.exports = router;
