const attemptsByMatricula = new Map()

const MAX_ATTEMPTS = Number(process.env.AUTH_MAX_ATTEMPTS || 5)
const LOCK_MINUTES = Number(process.env.AUTH_LOCK_MINUTES || 15)

const getEntry = (matricula) => attemptsByMatricula.get(matricula) || { attempts: 0, lockUntil: 0 }

const getLoginState = (matricula) => {
  const now = Date.now()
  const entry = getEntry(matricula)

  if (entry.lockUntil > now) {
    return {
      locked: true,
      retryAfterSeconds: Math.ceil((entry.lockUntil - now) / 1000)
    }
  }

  return { locked: false, retryAfterSeconds: 0 }
}

const registerFailure = (matricula) => {
  const now = Date.now()
  const entry = getEntry(matricula)
  const nextAttempts = entry.lockUntil > now ? entry.attempts : entry.attempts + 1
  const lockUntil = nextAttempts >= MAX_ATTEMPTS ? now + LOCK_MINUTES * 60 * 1000 : 0

  attemptsByMatricula.set(matricula, {
    attempts: nextAttempts,
    lockUntil
  })

  return { attempts: nextAttempts, lockUntil }
}

const clearAttempts = (matricula) => {
  attemptsByMatricula.delete(matricula)
}

module.exports = {
  getLoginState,
  registerFailure,
  clearAttempts
}
