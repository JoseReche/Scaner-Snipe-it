const express = require('express')
const jwt = require('jsonwebtoken')
const bcrypt = require('bcrypt')
const { authenticateToken } = require('./middleware')

function buildRoutes({ axiosClient, passwordHash }) {
  const router = express.Router()

  router.post('/login', async (req, res) => {
    const { email, password } = req.body || {}

    if (!email || !password) {
      return res.status(400).json({ error: 'Email e senha são obrigatórios' })
    }

    if (!passwordHash) {
      return res.status(500).json({ error: 'Servidor sem LOGIN_PASSWORD_HASH configurado' })
    }

    try {
      const usersResponse = await axiosClient.get('/api/v1/users', {
        params: { search: email }
      })

      const rows = Array.isArray(usersResponse.data?.rows) ? usersResponse.data.rows : []
      const user = rows.find((item) => item.email && item.email.toLowerCase() === email.toLowerCase())

      if (!user) {
        return res.status(401).json({ error: 'Credenciais inválidas' })
      }

      const passwordMatch = await bcrypt.compare(password, passwordHash)

      if (!passwordMatch) {
        return res.status(401).json({ error: 'Credenciais inválidas' })
      }

      const token = jwt.sign(
        {
          id: user.id,
          email: user.email,
          name: user.name || user.username || user.email
        },
        process.env.JWT_SECRET,
        { expiresIn: '8h' }
      )

      return res.json({
        token,
        user: {
          name: user.name || user.username || user.email,
          email: user.email
        }
      })
    } catch (error) {
      const status = error.response?.status

      if (status === 401 || status === 403) {
        return res.status(502).json({ error: 'Falha de autenticação do backend com a API Snipe-IT' })
      }

      return res.status(500).json({ error: 'Erro ao autenticar usuário no Snipe-IT' })
    }
  })

  router.get('/assets', authenticateToken, async (_req, res) => {
    try {
      const response = await axiosClient.get('/api/v1/hardware')
      const rows = Array.isArray(response.data?.rows) ? response.data.rows : []

      return res.json({
        total: rows.length,
        assets: rows.map((asset) => ({
          id: asset.id,
          name: asset.name,
          asset_tag: asset.asset_tag,
          status: asset.status_label?.name || null
        }))
      })
    } catch (_error) {
      return res.status(500).json({ error: 'Erro ao buscar ativos no Snipe-IT' })
    }
  })

  return router
}

module.exports = {
  buildRoutes
}
