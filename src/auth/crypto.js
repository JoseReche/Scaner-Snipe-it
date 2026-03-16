const crypto = require('crypto')

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12

const getEncryptionKey = () => {
  const rawKey = process.env.ENCRYPTION_KEY

  if (!rawKey) {
    throw new Error('ENCRYPTION_KEY não configurada no .env')
  }

  return crypto.createHash('sha256').update(rawKey, 'utf8').digest()
}

const encryptApiKey = (plainText) => {
  if (typeof plainText !== 'string' || !plainText.trim()) {
    throw new Error('API Key inválida para criptografia')
  }

  const key = getEncryptionKey()
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)

  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()

  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`
}

const decryptApiKey = (encryptedText) => {
  if (typeof encryptedText !== 'string') {
    throw new Error('Valor criptografado inválido')
  }

  const [ivHex, tagHex, payloadHex] = encryptedText.split(':')

  if (!ivHex || !tagHex || !payloadHex) {
    throw new Error('Formato da API Key criptografada inválido')
  }

  const key = getEncryptionKey()
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'))
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'))

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payloadHex, 'hex')),
    decipher.final()
  ])

  return decrypted.toString('utf8')
}

module.exports = {
  encryptApiKey,
  decryptApiKey
}
