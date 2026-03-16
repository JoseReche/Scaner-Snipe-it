const jwt = require('jsonwebtoken')

const getJwtConfig = () => {
  const secret = process.env.JWT_SECRET

  if (!secret) {
    throw new Error('JWT_SECRET não configurada no .env')
  }

  return {
    secret,
    expiresIn: process.env.JWT_EXPIRES_IN || '1h'
  }
}

const generateAccessToken = (payload) => {
  const config = getJwtConfig()

  return jwt.sign(payload, config.secret, { expiresIn: config.expiresIn })
}

const verifyAccessToken = (token) => {
  const config = getJwtConfig()

  return jwt.verify(token, config.secret)
}

module.exports = {
  generateAccessToken,
  verifyAccessToken
}
