const attemptsByMatricula = new Map()

const MAX_ATTEMPTS = Number(process.env.AUTH_MAX_ATTEMPTS || 5)
const LOCK_MINUTES = Number(process.env.AUTH_LOCK_MINUTES || 15)
const MAX_TRACKED_USERS = Number(process.env.AUTH_TRACK_MAX_USERS || 5000)

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

const cleanupAttempts = () => {
  const now = Date.now()

  for (const [matricula, entry] of attemptsByMatricula.entries()) {
    if (entry.lockUntil <= now && entry.attempts <= 0) {
      attemptsByMatricula.delete(matricula)
      continue
    }

    if (entry.lockUntil <= now && entry.attempts > 0) {
      attemptsByMatricula.set(matricula, { attempts: 0, lockUntil: 0 })
    }
  }

  if (attemptsByMatricula.size <= MAX_TRACKED_USERS) {
    return
  }

  const oldestUnlocked = []

  for (const [matricula, entry] of attemptsByMatricula.entries()) {
    if (entry.lockUntil <= now) {
      oldestUnlocked.push(matricula)
    }
  }

  const excess = attemptsByMatricula.size - MAX_TRACKED_USERS

  oldestUnlocked.slice(0, excess).forEach((matricula) => {
    attemptsByMatricula.delete(matricula)
  })
}

const clearAttempts = (matricula) => {
  attemptsByMatricula.delete(matricula)
}

setInterval(cleanupAttempts, 5 * 60 * 1000).unref()

module.exports = {
  getLoginState,
  registerFailure,
  clearAttempts
}
