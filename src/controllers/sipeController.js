const { findUserByMatricula } = require('../services/userStore')
const { decryptApiKey } = require('../auth/crypto')
const { fetchAssetByIdWithUserKey, searchAssetsByNameWithUserKey } = require('../services/sipeService')

const getAssetFromSipe = async (req, res) => {
  try {
    const user = await findUserByMatricula(req.user.matricula)

    if (!user) {
      return res.status(404).json({ error: 'Usuário autenticado não encontrado' })
    }

    const apiKey = user.api_key_encrypted ? decryptApiKey(user.api_key_encrypted) : null

    if (!apiKey) {
      return res.status(400).json({ error: 'Usuário sem API Key cadastrada' })
    }

    const asset = await fetchAssetByIdWithUserKey(req.params.id, apiKey)

    return res.json(asset)
  } catch (error) {
    const status = error.response?.status || 500
    return res.status(status).json({
      error: 'Falha ao consultar SIpe IT',
      details: error.response?.data || error.message
    })
  }
}


const searchAssetsByName = async (req, res) => {
  try {
    const user = await findUserByMatricula(req.user.matricula)

    if (!user) {
      return res.status(404).json({ error: 'Usuário autenticado não encontrado' })
    }

    const apiKey = user.api_key_encrypted ? decryptApiKey(user.api_key_encrypted) : null

    if (!apiKey) {
      return res.status(400).json({ error: 'Usuário sem API Key cadastrada' })
    }

    const query = String(req.query.name || '').trim()

    if (!query) {
      return res.status(400).json({ error: 'Informe o parâmetro name para buscar por nome da máquina' })
    }

    const result = await searchAssetsByNameWithUserKey(query, apiKey)

    return res.json(result)
  } catch (error) {
    const status = error.response?.status || 500
    return res.status(status).json({
      error: 'Falha ao pesquisar ativos no SIpe IT',
      details: error.response?.data || error.message
    })
  }
}

module.exports = {
  getAssetFromSipe,
  searchAssetsByName
}
