const bcrypt = require('bcryptjs')

const SALT_ROUNDS = 12

const hashPassword = async (password) => bcrypt.hash(password, SALT_ROUNDS)

const verifyPassword = async (password, hash) => bcrypt.compare(password, hash)

module.exports = {
  hashPassword,
  verifyPassword
}
