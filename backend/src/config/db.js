import { Pool } from 'pg'
import { env } from './env.js'

let pool = null

if (env.databaseUrl) {
  pool = new Pool({ connectionString: env.databaseUrl })
}

export const db = {
  query: async (text, params = []) => {
    if (!pool) {
      throw new Error('DATABASE_URL não configurado')
    }

    return pool.query(text, params)
  }
}
