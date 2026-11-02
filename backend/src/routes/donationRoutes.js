const router = require('express').Router();
const donations = require('../controllers/donationController');
const { authenticate, requireAdmin } = require('../middlewares/auth');

router.post('/create', authenticate, donations.create);
router.get('/all', authenticate, requireAdmin, donations.listAll);
router.get('/user/:userId', authenticate, donations.listMine);
router.get('/totals/:userId', authenticate, donations.myTotals);
router.get('/status/:txRef', authenticate, donations.status);
router.get('/receipt/:txRef/pdf', authenticate, donations.receiptPdf);
router.get('/receipt/:txRef', authenticate, donations.receipt);

module.exports = router;
