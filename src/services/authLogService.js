const fs = require('fs/promises')
const path = require('path')

const AUTH_LOG_FILE = path.join(__dirname, '..', 'data', 'auth.log')

const sanitizeLogValue = (value, max = 250) => {
  if (value === undefined || value === null) {
    return null
  }

  const normalized = String(value).replace(/[\r\n\t]+/g, ' ').trim()

  if (!normalized) {
    return null
  }

  return normalized.slice(0, max)
}

const writeAuthLog = async ({ event, matricula, ip, userAgent, success, reason }) => {
  const entry = {
    timestamp: new Date().toISOString(),
    event: sanitizeLogValue(event, 30),
    matricula: sanitizeLogValue(matricula, 60),
    ip: sanitizeLogValue(ip, 80),
    userAgent: sanitizeLogValue(userAgent, 300),
    success: Boolean(success),
    reason: sanitizeLogValue(reason, 300)
  }

  await fs.mkdir(path.dirname(AUTH_LOG_FILE), { recursive: true })
  await fs.chmod(path.dirname(AUTH_LOG_FILE), 0o700).catch(() => null)
  await fs.chmod(AUTH_LOG_FILE, 0o600).catch(() => null)
  await fs.appendFile(AUTH_LOG_FILE, `${JSON.stringify(entry)}\n`, 'utf8')
}

module.exports = {
  writeAuthLog
}
