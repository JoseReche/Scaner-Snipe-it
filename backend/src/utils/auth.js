import jwt from 'jsonwebtoken'
import { env } from '../config/env.js'

export const generateToken = (user) => jwt.sign({ sub: user.id, role: user.role, name: user.name, email: user.email }, env.jwtSecret, { expiresIn: env.jwtExpiresIn })

export const verifyToken = (token) => jwt.verify(token, env.jwtSecret)
