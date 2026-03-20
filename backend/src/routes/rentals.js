const express = require('express');
const router = express.Router();
const {
  getRentals, getRentalById, bookRental,
  getMyBookings, createRental, updateRental
} = require('../controllers/rentalController');
const { authMiddleware } = require('../middleware/auth');

// Public
router.get('/', getRentals);
router.get('/:id', getRentalById);

// Auth required
router.post('/',            authMiddleware, createRental);
router.post('/book',        authMiddleware, bookRental);
router.get('/my-bookings',  authMiddleware, getMyBookings);
router.put('/:id',          authMiddleware, updateRental);

module.exports = router;
