const crypto = require('crypto')

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12
const SALT_LENGTH = 16
const KEY_LENGTH = 32
const KEY_DERIVATION = 'scrypt'
const PAYLOAD_VERSION = 'v2'
const AUTH_CONTEXT = 'scaner-snipe-it:api-key'

const getMasterSecret = () => {
  const secret = process.env.ENCRYPTION_KEY

  if (!secret || typeof secret !== 'string') {
    throw new Error('ENCRYPTION_KEY não configurada no .env')
  }

  if (secret.length < 16) {
    throw new Error('ENCRYPTION_KEY fraca: use pelo menos 16 caracteres')
  }

  return secret
}

const deriveKey = (salt) => {
  const masterSecret = getMasterSecret()

  return crypto.scryptSync(masterSecret, salt, KEY_LENGTH, {
    N: 2 ** 15,
    r: 8,
    p: 1,
    maxmem: 64 * 1024 * 1024
  })
}

const serializeV2 = ({ salt, iv, tag, encrypted }) => {
  return [
    PAYLOAD_VERSION,
    salt.toString('hex'),
    iv.toString('hex'),
    tag.toString('hex'),
    encrypted.toString('hex')
  ].join(':')
}

const encryptApiKey = (plainText) => {
  if (typeof plainText !== 'string' || !plainText.trim()) {
    throw new Error('API Key inválida para criptografia')
  }

  const salt = crypto.randomBytes(SALT_LENGTH)
  const iv = crypto.randomBytes(IV_LENGTH)
  const key = deriveKey(salt)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)

  cipher.setAAD(Buffer.from(AUTH_CONTEXT, 'utf8'))

  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()

  return serializeV2({ salt, iv, tag, encrypted })
}

const decryptLegacyV1 = (ivHex, tagHex, payloadHex) => {
  const iv = Buffer.from(ivHex, 'hex')
  const tag = Buffer.from(tagHex, 'hex')
  const encrypted = Buffer.from(payloadHex, 'hex')
  const key = crypto.createHash('sha256').update(getMasterSecret(), 'utf8').digest()

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()])
  return decrypted.toString('utf8')
}

const decryptApiKey = (encryptedText) => {
  if (typeof encryptedText !== 'string' || !encryptedText.trim()) {
    throw new Error('Valor criptografado inválido')
  }

  const parts = encryptedText.split(':')

  if (parts.length === 5 && parts[0] === PAYLOAD_VERSION) {
    const [, saltHex, ivHex, tagHex, payloadHex] = parts
    const salt = Buffer.from(saltHex, 'hex')
    const iv = Buffer.from(ivHex, 'hex')
    const tag = Buffer.from(tagHex, 'hex')
    const encrypted = Buffer.from(payloadHex, 'hex')

    const key = deriveKey(salt)
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)

    decipher.setAAD(Buffer.from(AUTH_CONTEXT, 'utf8'))
    decipher.setAuthTag(tag)

    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()])
    return decrypted.toString('utf8')
  }

  if (parts.length === 3) {
    const [ivHex, tagHex, payloadHex] = parts
    return decryptLegacyV1(ivHex, tagHex, payloadHex)
  }

  throw new Error('Formato da API Key criptografada inválido')
}

module.exports = {
  encryptApiKey,
  decryptApiKey
}
