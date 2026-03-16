const fs = require('fs/promises')
const path = require('path')

const AUTH_LOG_FILE = path.join(__dirname, '..', 'data', 'auth.log')

const writeAuthLog = async ({ event, matricula, ip, userAgent, success, reason }) => {
  const entry = {
    timestamp: new Date().toISOString(),
    event,
    matricula,
    ip,
    userAgent,
    success,
    reason: reason || null
  }

  await fs.mkdir(path.dirname(AUTH_LOG_FILE), { recursive: true })
  await fs.appendFile(AUTH_LOG_FILE, `${JSON.stringify(entry)}\n`, 'utf8')
}

module.exports = {
  writeAuthLog
}
