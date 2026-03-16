const fs = require('fs/promises')
const path = require('path')

const USERS_FILE = path.join(__dirname, '..', 'data', 'users.json')

const ensureUsersFile = async () => {
  try {
    await fs.access(USERS_FILE)
  } catch {
    await fs.mkdir(path.dirname(USERS_FILE), { recursive: true })
    await fs.writeFile(USERS_FILE, '[]\n', 'utf8')
  }
}

const readUsers = async () => {
  await ensureUsersFile()
  const raw = await fs.readFile(USERS_FILE, 'utf8')
  const parsed = JSON.parse(raw)

  if (!Array.isArray(parsed)) {
    throw new Error('users.json inválido: esperado array de usuários')
  }

  return parsed
}

const writeUsers = async (users) => {
  const tempFile = `${USERS_FILE}.tmp`
  const payload = `${JSON.stringify(users, null, 2)}\n`

  await fs.writeFile(tempFile, payload, 'utf8')
  await fs.rename(tempFile, USERS_FILE)
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

  users[index] = updater(users[index])
  await writeUsers(users)

  return users[index]
}

const createUser = async (userData) => {
  const users = await readUsers()
  users.push(userData)
  await writeUsers(users)

  return userData
}

module.exports = {
  USERS_FILE,
  readUsers,
  writeUsers,
  createUser,
  findUserByMatricula,
  updateUser
}
