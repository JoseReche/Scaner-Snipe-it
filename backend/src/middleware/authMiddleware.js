import { verifyToken } from '../utils/auth.js'

export const authMiddleware = (req, res, next) => {
  const header = req.get('authorization') || ''
  const [, token] = header.split(' ')

  if (!token) {
    return res.status(401).json({ error: 'Token ausente' })
  }

  try {
    req.user = verifyToken(token)
    return next()
  } catch {
    return res.status(401).json({ error: 'Token inválido' })
  }
}

export const roleMiddleware = (roles = []) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Acesso negado' })
  }

  return next()
}
