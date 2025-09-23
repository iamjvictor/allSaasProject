const express = require('express');
const router = express.Router();
const BookingController = require('../controllers/bookingController');
const apiAuthMiddleware = require('../middlewares/apiAuth');

const bookingController = new BookingController();

router.post('/create',apiAuthMiddleware, bookingController.createBookingWithPaymentLink);
router.post('/confirm', bookingController.confirmBooking);
router.post('/call-human-agent', apiAuthMiddleware, bookingController.callHumanAgent);
router.delete('/cancel/:bookingId', bookingController.cancelBooking);
router.get('/availability', bookingController.checkAvailability);
router.get('/:userId/availability-report', apiAuthMiddleware, bookingController.getAvailabilityReport);




module.exports = router;