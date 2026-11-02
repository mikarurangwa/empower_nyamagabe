const router = require('express').Router();
const donations = require('../controllers/donationController');

// Called by Flutterwave, not by our frontend
router.get('/flutterwave/callback', donations.callback);
router.post('/flutterwave/webhook', donations.webhook);

module.exports = router;
