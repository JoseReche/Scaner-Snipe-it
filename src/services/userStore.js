const fs = require('fs/promises')
const path = require('path')
const sqlite3 = require('sqlite3')
const { encryptApiKey } = require('../auth/crypto')

const USERS_DB_FILE = path.join(__dirname, '..', 'data', 'users.sqlite')

let dbInitPromise
let dbInstance

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

const run = async (db, sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(error) {
      if (error) {
        reject(error)
        return
      }

      resolve(this)
    })
  })
}

const get = async (db, sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => {
      if (error) {
        reject(error)
        return
      }

      resolve(row)
    })
  })
}

const all = async (db, sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) => {
      if (error) {
        reject(error)
        return
      }

      resolve(rows)
    })
  })
}

const applySecurityPragmas = async (db) => {
  await run(db, 'PRAGMA foreign_keys = ON')
  await run(db, 'PRAGMA journal_mode = WAL')
  await run(db, 'PRAGMA synchronous = FULL')
  await run(db, 'PRAGMA secure_delete = ON')
  await run(db, 'PRAGMA trusted_schema = OFF')
}

const openDatabase = async () => {
  if (dbInstance) {
    return dbInstance
  }

  await fs.mkdir(path.dirname(USERS_DB_FILE), { recursive: true })

  dbInstance = await new Promise((resolve, reject) => {
    const db = new sqlite3.Database(USERS_DB_FILE, (error) => {
      if (error) {
        reject(error)
        return
      }

      resolve(db)
    })
  })

  await fs.chmod(USERS_DB_FILE, 0o600).catch(() => null)
  await applySecurityPragmas(dbInstance)

  return dbInstance
}

const initializeDatabase = async () => {
  const db = await openDatabase()

  await run(db, `
    CREATE TABLE IF NOT EXISTS users (
      matricula TEXT PRIMARY KEY,
      password_hash TEXT NOT NULL,
      api_key_encrypted TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CHECK(length(trim(matricula)) BETWEEN 3 AND 30),
      CHECK(length(password_hash) >= 20),
      CHECK(length(api_key_encrypted) >= 20)
    )
  `)

  return db
}

const getDb = async () => {
  if (!dbInitPromise) {
    dbInitPromise = initializeDatabase()
  }

  return dbInitPromise
}

const readUsers = async () => {
  const db = await getDb()

  return all(
    db,
    'SELECT matricula, password_hash, api_key_encrypted FROM users ORDER BY matricula ASC'
  )
}

const writeUsers = async (users) => {
  const db = await getDb()
  const sanitizedUsers = users.map((user) => sanitizeUserRecord(user)).filter(Boolean)

  await run(db, 'BEGIN IMMEDIATE TRANSACTION')

  try {
    await run(db, 'DELETE FROM users')

    for (const user of sanitizedUsers) {
      await run(
        db,
        'INSERT INTO users (matricula, password_hash, api_key_encrypted) VALUES (?, ?, ?)',
        [user.matricula, user.password_hash, user.api_key_encrypted]
      )
    }

    await run(db, 'COMMIT')
  } catch (error) {
    await run(db, 'ROLLBACK')
    throw error
  }
}

const findUserByMatricula = async (matricula) => {
  const db = await getDb()
  const normalizedMatricula = typeof matricula === 'string' ? matricula.trim() : ''

  if (!normalizedMatricula) {
    return null
  }

  return get(
    db,
    'SELECT matricula, password_hash, api_key_encrypted FROM users WHERE matricula = ?',
    [normalizedMatricula]
  )
}

const updateUser = async (matricula, updater) => {
  const currentUser = await findUserByMatricula(matricula)

  if (!currentUser) {
    return null
  }

  const updated = sanitizeUserRecord(updater(currentUser))

  if (!updated) {
    throw new Error('Registro de usuário inválido após atualização')
  }

  const db = await getDb()

  await run(
    db,
    `UPDATE users
      SET matricula = ?,
          password_hash = ?,
          api_key_encrypted = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE matricula = ?`,
    [updated.matricula, updated.password_hash, updated.api_key_encrypted, currentUser.matricula]
  )

  return updated
}

const createUser = async (userData) => {
  const sanitized = sanitizeUserRecord(userData)

  if (!sanitized) {
    throw new Error('Dados de usuário inválidos para criação')
  }

  const db = await getDb()

  await run(
    db,
    'INSERT INTO users (matricula, password_hash, api_key_encrypted) VALUES (?, ?, ?)',
    [sanitized.matricula, sanitized.password_hash, sanitized.api_key_encrypted]
  )

  return sanitized
}

module.exports = {
  USERS_DB_FILE,
  readUsers,
  writeUsers,
  createUser,
  findUserByMatricula,
  updateUser
}
