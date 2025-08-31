const express = require('express');
const router = express.Router();
const BookingController = require('../controllers/bookingController');

const bookingController = new BookingController();

router.post('/create', bookingController.createBookingWithPaymentLink);
router.post('/confirm', bookingController.confirmBooking);
router.delete('/cancel/:bookingId', bookingController.cancelBooking);




module.exports = router;