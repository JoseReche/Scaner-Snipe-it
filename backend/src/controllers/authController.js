import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { mockStore, createId } from '../data/mockStore.js'
import { generateToken } from '../utils/auth.js'

const loginSchema = z.object({ email: z.string().email(), password: z.string().min(8) })

export const login = async (req, res) => {
  const input = loginSchema.parse(req.body)
  const user = mockStore.users.find((item) => item.email === input.email && item.active)

  if (!user) {
    return res.status(401).json({ error: 'Credenciais inválidas' })
  }

  const isValid = await bcrypt.compare(input.password, user.password_hash)

  if (!isValid) {
    return res.status(401).json({ error: 'Credenciais inválidas' })
  }

  const token = generateToken(user)
  return res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role } })
}

export const me = (req, res) => res.json({ user: req.user })

export const logout = (_req, res) => res.json({ success: true })

export const seedOperator = async (req, res) => {
  const schema = z.object({ name: z.string().min(2), email: z.string().email(), password: z.string().min(8), role: z.enum(['admin', 'operator', 'viewer']).default('operator') })
  const input = schema.parse(req.body)

  const existing = mockStore.users.find((user) => user.email === input.email)

  if (existing) {
    return res.status(409).json({ error: 'E-mail já cadastrado' })
  }

  const hash = await bcrypt.hash(input.password, 10)
  const user = { id: createId(), name: input.name, email: input.email, password_hash: hash, role: input.role, active: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }

  mockStore.users.push(user)

  return res.status(201).json({ id: user.id })
}
