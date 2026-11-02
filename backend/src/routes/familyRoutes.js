const router = require('express').Router();
const families = require('../controllers/familyController');
const { authenticate, requireLeader } = require('../middlewares/auth');

router.get('/verified', families.listVerified);
router.post('/submit', authenticate, requireLeader, families.submit);
router.get('/queue', authenticate, requireLeader, families.queue);
router.post('/:id/verify', authenticate, requireLeader, families.decide);

module.exports = router;
