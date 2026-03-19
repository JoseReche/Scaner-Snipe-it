const { validationResult } = require('express-validator')

const validationMiddleware = (req, res, next) => {
  const result = validationResult(req)

  if (result.isEmpty()) {
    return next()
  }

  return res.status(400).json({
    error: 'Dados inválidos',
    details: result.array().map((item) => ({ field: item.path, message: item.msg }))
  })
}

module.exports = {
  validationMiddleware
}
