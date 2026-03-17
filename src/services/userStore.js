const fs = require('fs/promises')
const path = require('path')
const { encryptApiKey } = require('../auth/crypto')

const USERS_DB_FILE = path.join(__dirname, '..', 'data', 'users.db.json')
const LEGACY_USERS_FILE = path.join(__dirname, '..', 'data', 'users.json')

const ensureUsersDbFile = async () => {
  try {
    await fs.access(USERS_DB_FILE)
  } catch {
    await fs.mkdir(path.dirname(USERS_DB_FILE), { recursive: true })
    await fs.writeFile(USERS_DB_FILE, '[]\n', 'utf8')
  }
}

const sanitizeUserRecord = (user) => {
  if (!user || typeof user !== 'object') {
    return null
  }

  const matricula = typeof user.matricula === 'string' ? user.matricula.trim() : ''
  const passwordHash = typeof user.password_hash === 'string' ? user.password_hash : ''
  const encryptedApiKey = typeof user.api_key_encrypted === 'string'
    ? user.api_key_encrypted
    : (typeof user.api_key === 'string' && user.api_key.trim() ? encryptApiKey(user.api_key) : '')

  if (!matricula || !passwordHash || !encryptedApiKey) {
    return null
  }

  return {
    matricula,
    password_hash: passwordHash,
    api_key_encrypted: encryptedApiKey
  }
}

const migrateLegacyUsersIfNeeded = async () => {
  let hasCurrentDb = true

  try {
    await fs.access(USERS_DB_FILE)
  } catch {
    hasCurrentDb = false
  }

  if (hasCurrentDb) {
    return
  }

  try {
    const legacyRaw = await fs.readFile(LEGACY_USERS_FILE, 'utf8')
    const legacyParsed = JSON.parse(legacyRaw)

    if (!Array.isArray(legacyParsed)) {
      await ensureUsersDbFile()
      return
    }

    const sanitizedUsers = legacyParsed
      .map((user) => sanitizeUserRecord(user))
      .filter(Boolean)

    await fs.mkdir(path.dirname(USERS_DB_FILE), { recursive: true })
    await fs.writeFile(USERS_DB_FILE, `${JSON.stringify(sanitizedUsers, null, 2)}\n`, 'utf8')
  } catch {
    await ensureUsersDbFile()
  }
}

const readUsers = async () => {
  await migrateLegacyUsersIfNeeded()
  await ensureUsersDbFile()

  const raw = await fs.readFile(USERS_DB_FILE, 'utf8')
  const parsed = JSON.parse(raw)

  if (!Array.isArray(parsed)) {
    throw new Error('users.db.json inválido: esperado array de usuários')
  }

  return parsed
}

const writeUsers = async (users) => {
  const tempFile = `${USERS_DB_FILE}.tmp`
  const payload = `${JSON.stringify(users, null, 2)}\n`

  await fs.writeFile(tempFile, payload, 'utf8')
  await fs.rename(tempFile, USERS_DB_FILE)
}

const findUserByMatricula = async (matricula) => {
  const users = await readUsers()
  return users.find((user) => user.matricula === matricula) || null
}

const updateUser = async (matricula, updater) => {
  const users = await readUsers()
  const index = users.findIndex((user) => user.matricula === matricula)

  if (index === -1) {
    return null
  }

  const updated = sanitizeUserRecord(updater(users[index]))

  if (!updated) {
    throw new Error('Registro de usuário inválido após atualização')
  }

  users[index] = updated
  await writeUsers(users)

  return users[index]
}

const createUser = async (userData) => {
  const users = await readUsers()
  const sanitized = sanitizeUserRecord(userData)

  if (!sanitized) {
    throw new Error('Dados de usuário inválidos para criação')
  }

  users.push(sanitized)
  await writeUsers(users)

  return sanitized
}

module.exports = {
  USERS_DB_FILE,
  LEGACY_USERS_FILE,
  readUsers,
  writeUsers,
  createUser,
  findUserByMatricula,
  updateUser
}
