const router = require('express').Router();
const admin = require('../controllers/adminController');
const { authenticate, requireAdmin } = require('../middlewares/auth');

router.use(authenticate, requireAdmin);

router.get('/leaders', admin.listLeaders);
router.post('/leaders', admin.createLeader);
router.get('/reports/summary', admin.report);
router.get('/audit-logs', admin.auditLogs);
router.get('/export/:dataset.:format', admin.exportData);

module.exports = router;
