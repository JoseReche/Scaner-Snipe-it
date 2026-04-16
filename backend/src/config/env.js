import dotenv from 'dotenv'

dotenv.config()

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 4000),
  jwtSecret: process.env.JWT_SECRET || 'change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  databaseUrl: process.env.DATABASE_URL || '',
  useMockData: String(process.env.USE_MOCK_DATA || 'true') === 'true',
  filesDir: process.env.FILES_DIR || './uploads',
  snipeItBaseUrl: process.env.SNIPEIT_BASE_URL || '',
  snipeItApiToken: process.env.SNIPEIT_API_TOKEN || '',
  snipeItTimeoutMs: Number(process.env.SNIPEIT_TIMEOUT_MS || 12000),
  snipeItRetryAttempts: Number(process.env.SNIPEIT_RETRY_ATTEMPTS || 3)
}
