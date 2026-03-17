const { findUserByMatricula, updateUser, createUser } = require('../services/userStore')
const { verifyPassword, hashPassword } = require('../auth/password')
const { generateAccessToken } = require('../auth/jwt')
const { getLoginState, registerFailure, clearAttempts } = require('../services/loginAttemptService')
const { writeAuthLog } = require('../services/authLogService')
const { encryptApiKey } = require('../auth/crypto')

const getRequestMeta = (req) => ({
  ip: req.ip,
  userAgent: req.get('user-agent') || 'desconhecido'
})

const login = async (req, res) => {
  const { matricula, password } = req.body
  const normalizedMatricula = matricula.trim()
  const state = getLoginState(normalizedMatricula)

  if (state.locked) {
    await writeAuthLog({
      event: 'login',
      matricula: normalizedMatricula,
      success: false,
      reason: 'Matrícula bloqueada por excesso de tentativas',
      ...getRequestMeta(req)
    })

    return res.status(429).json({
      error: 'Conta temporariamente bloqueada por tentativas inválidas',
      retryAfterSeconds: state.retryAfterSeconds
    })
  }

  const user = await findUserByMatricula(normalizedMatricula)

  if (!user) {
    registerFailure(normalizedMatricula)
    await writeAuthLog({
      event: 'login',
      matricula: normalizedMatricula,
      success: false,
      reason: 'Matrícula inexistente',
      ...getRequestMeta(req)
    })

    return res.status(401).json({ error: 'Credenciais inválidas' })
  }

  const validPassword = await verifyPassword(password, user.password_hash)

  if (!validPassword) {
    registerFailure(normalizedMatricula)
    await writeAuthLog({
      event: 'login',
      matricula: normalizedMatricula,
      success: false,
      reason: 'Senha inválida',
      ...getRequestMeta(req)
    })

    return res.status(401).json({ error: 'Credenciais inválidas' })
  }

  clearAttempts(normalizedMatricula)

  const token = generateAccessToken({
    matricula: user.matricula
  })

  await writeAuthLog({
    event: 'login',
    matricula: normalizedMatricula,
    success: true,
    ...getRequestMeta(req)
  })

  return res.json({ token, expiresIn: process.env.JWT_EXPIRES_IN || '3h' })
}

const register = async (req, res) => {
  const { matricula, password, apiKey } = req.body
  const normalizedMatricula = matricula.trim()

  const existingUser = await findUserByMatricula(normalizedMatricula)

  if (existingUser) {
    return res.status(409).json({ error: 'Matrícula já cadastrada' })
  }

  const passwordHash = await hashPassword(password)

  await createUser({
    matricula: normalizedMatricula,
    password_hash: passwordHash,
    api_key_encrypted: encryptApiKey(apiKey)
  })

  await writeAuthLog({
    event: 'register',
    matricula: normalizedMatricula,
    success: true,
    ...getRequestMeta(req)
  })

  return res.status(201).json({ success: true })
}

const changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body
  const matricula = req.user.matricula

  const user = await findUserByMatricula(matricula)

  if (!user) {
    return res.status(404).json({ error: 'Usuário não encontrado' })
  }

  const validPassword = await verifyPassword(currentPassword, user.password_hash)

  if (!validPassword) {
    await writeAuthLog({
      event: 'change-password',
      matricula,
      success: false,
      reason: 'Senha atual inválida',
      ...getRequestMeta(req)
    })

    return res.status(401).json({ error: 'Senha atual inválida' })
  }

  const newHash = await hashPassword(newPassword)

  await updateUser(matricula, (current) => ({
    ...current,
    password_hash: newHash
  }))

  await writeAuthLog({
    event: 'change-password',
    matricula,
    success: true,
    ...getRequestMeta(req)
  })

  return res.json({ success: true })
}

module.exports = {
  login,
  register,
  changePassword
}
