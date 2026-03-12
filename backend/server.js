const path = require('path')
const express = require('express')
const axios = require('axios')
const dotenv = require('dotenv')
const { buildRoutes } = require('./routes')

dotenv.config()

const app = express()
const PORT = Number(process.env.PORT) || 3000
const SNIPEIT_URL = process.env.SNIPEIT_URL
const SNIPEIT_API_KEY = process.env.SNIPEIT_API_KEY
const JWT_SECRET = process.env.JWT_SECRET
const LOGIN_PASSWORD_HASH = process.env.LOGIN_PASSWORD_HASH

if (!SNIPEIT_URL || !SNIPEIT_API_KEY || !JWT_SECRET) {
  console.error('Defina SNIPEIT_URL, SNIPEIT_API_KEY e JWT_SECRET no arquivo .env')
  process.exit(1)
}

const axiosClient = axios.create({
  baseURL: SNIPEIT_URL,
  timeout: 15000,
  headers: {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Authorization: `Bearer ${SNIPEIT_API_KEY}`
  }
})

app.use(express.json())
app.use(express.static(path.join(__dirname, '..', 'frontend')))
app.use(buildRoutes({ axiosClient, passwordHash: LOGIN_PASSWORD_HASH }))

app.get('/', (_req, res) => {
  res.redirect('/login.html')
})

app.get('/health', (_req, res) => {
  res.json({ ok: true })
})

app.listen(PORT, () => {
  console.log(`Servidor iniciado em http://localhost:${PORT}`)
})
