const { verifyAccessToken } = require('../auth/jwt')

const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization || ''

  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token ausente ou inválido' })
  }

  const token = authHeader.replace('Bearer ', '').trim()

  try {
    req.user = verifyAccessToken(token)
    return next()
  } catch {
    return res.status(401).json({ error: 'Token inválido ou expirado' })
  }
}

module.exports = {
  authMiddleware
}
