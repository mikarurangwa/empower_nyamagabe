const router = require('express').Router();

router.use('/auth', require('./authRoutes'));
router.use('/families', require('./familyRoutes'));
router.use('/donations', require('./donationRoutes'));
router.use('/payments', require('./paymentRoutes'));
router.use('/admin', require('./adminRoutes'));
router.use('/public', require('./publicRoutes'));

module.exports = router;
