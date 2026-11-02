const router = require('express').Router();
const auth = require('../controllers/authController');
const rules = require('../middlewares/validate');
const { authenticate } = require('../middlewares/auth');
const { authLimiter } = require('../middlewares/security');

router.post('/signup', authLimiter, rules.signup, auth.signup);
router.post('/login', authLimiter, rules.login, auth.login);
router.get('/me', authenticate, auth.me);
router.post('/password-reset/request', authLimiter, rules.resetRequest, auth.requestReset);
router.post('/password-reset/confirm', authLimiter, rules.resetConfirm, auth.confirmReset);

module.exports = router;
