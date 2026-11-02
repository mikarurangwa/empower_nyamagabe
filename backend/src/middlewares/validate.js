const { body, validationResult } = require('express-validator');

const validate = (rules) => [
  ...rules,
  (req, res, next) => {
    const errors = validationResult(req);
    if (errors.isEmpty()) return next();
    res.status(400).json({ success: false, message: errors.array()[0].msg, errors: errors.array() });
  },
];

const rules = {
  signup: validate([
    body('name').trim().isLength({ min: 2 }).withMessage('Name is required'),
    body('email').optional({ checkFalsy: true }).trim().isEmail().withMessage('Enter a valid email address'),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  ]),
  login: validate([body('password').notEmpty().withMessage('Password is required')]),
  resetRequest: validate([body('email').trim().isEmail().withMessage('Enter a valid email address')]),
  resetConfirm: validate([
    body('email').trim().isEmail().withMessage('Enter a valid email address'),
    body('token').isLength({ min: 10 }).withMessage('Reset code is missing'),
    body('newPassword').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  ]),
};

module.exports = rules;
