const express = require('express')
const rateLimit = require('express-rate-limit')
const { body } = require('express-validator')
const { login, register, changePassword } = require('../controllers/authController')
const { authMiddleware, guestOnlyMiddleware } = require('../middleware/authMiddleware')
const { validationMiddleware } = require('../middleware/validationMiddleware')

const router = express.Router()

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.LOGIN_RATE_LIMIT_MAX || 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas de login. Tente novamente em alguns minutos.' }
})

router.post(
  '/login',
  loginLimiter,
  body('matricula').isString().trim().notEmpty().isLength({ min: 3, max: 30 }).matches(/^[A-Za-z0-9_-]+$/),
  body('password').isString().isLength({ min: 8, max: 128 }),
  validationMiddleware,
  login
)


router.post(
  '/register',
  guestOnlyMiddleware,
  body('matricula').isString().trim().notEmpty().isLength({ min: 3, max: 30 }).matches(/^[A-Za-z0-9_-]+$/),
  body('password').isString().isLength({ min: 12, max: 128 }).matches(/[A-Z]/).matches(/[a-z]/).matches(/[0-9]/).matches(/[^A-Za-z0-9]/),
  body('apiKey').isString().trim().notEmpty().isLength({ min: 10, max: 999 }),
  validationMiddleware,
  register
)

router.post(
  '/change-password',
  authMiddleware,
  body('currentPassword').isString().isLength({ min: 8, max: 128 }),
  body('newPassword').isString().isLength({ min: 12, max: 128 }).matches(/[A-Z]/).matches(/[a-z]/).matches(/[0-9]/).matches(/[^A-Za-z0-9]/),
  validationMiddleware,
  changePassword
)

module.exports = {
  authRouter: router
}
