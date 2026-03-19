const express = require('express')
const { param } = require('express-validator')
const { getAssetFromSipe } = require('../controllers/sipeController')
const { authMiddleware } = require('../middleware/authMiddleware')
const { validationMiddleware } = require('../middleware/validationMiddleware')

const router = express.Router()

const handlers = [
  authMiddleware,
  param('id').isInt({ min: 1 }),
  validationMiddleware,
  getAssetFromSipe
]

// Rota principal padronizada com o endpoint de hardware.
router.get('/hardware/:id', ...handlers)

// Alias para retrocompatibilidade com integrações anteriores.
router.get('/asset/:id', ...handlers)

module.exports = {
  sipeRouter: router
}
