const router = require('express').Router();
const pub = require('../controllers/publicController');

router.get('/impact', pub.impact);
router.get('/health', pub.health);

module.exports = router;
