import 'express-async-errors'
import cors from 'cors'
import express from 'express'
import helmet from 'helmet'
import pinoHttp from 'pino-http'
import fs from 'fs'
import multer from 'multer'

import { env } from './config/env.js'
import { logger } from './config/logger.js'
import { authMiddleware } from './middleware/authMiddleware.js'
import { errorMiddleware, notFoundMiddleware } from './middleware/errorMiddleware.js'

import authRoutes from './routes/authRoutes.js'
import requestsRoutes from './routes/requestsRoutes.js'
import receivingRoutes from './routes/receivingRoutes.js'
import processingRoutes from './routes/processingRoutes.js'
import assetsRoutes from './routes/assetsRoutes.js'
import settingsRoutes from './routes/settingsRoutes.js'
import dashboardRoutes from './routes/dashboardRoutes.js'

if (!fs.existsSync(env.filesDir)) {
  fs.mkdirSync(env.filesDir, { recursive: true })
}

const upload = multer({ dest: env.filesDir })

export const app = express()

app.use(helmet())
app.use(cors({ origin: env.corsOrigin }))
app.use(express.json({ limit: '5mb' }))
app.use(pinoHttp({ logger }))

app.get('/health', (_req, res) => res.json({ ok: true, mockMode: env.useMockData }))

app.use('/auth', authRoutes)
app.use('/requests', authMiddleware, requestsRoutes)
app.use('/receiving', authMiddleware, receivingRoutes)
app.use('/processing', authMiddleware, processingRoutes)
app.use('/assets', authMiddleware, assetsRoutes)
app.use('/settings', authMiddleware, settingsRoutes)
app.use('/dashboard', authMiddleware, dashboardRoutes)

app.post('/attachments/upload', authMiddleware, upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Arquivo não enviado' })
  }

  return res.status(201).json({
    file_name: req.file.originalname,
    file_path: req.file.path,
    mime_type: req.file.mimetype
  })
})

app.use(notFoundMiddleware)
app.use(errorMiddleware)
