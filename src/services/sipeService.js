const axios = require('axios')

const buildSipeHeaders = (apiKey) => ({
  Authorization: `Bearer ${apiKey}`,
  Accept: 'application/json',
  'Content-Type': 'application/json'
})

const getSipeBaseUrl = () => {
  const base = process.env.SIPE_API_BASE || process.env.SNIPE_URL

  if (!base) {
    throw new Error('SIPE_API_BASE não configurada no .env')
  }

  return base
}

const fetchAssetByIdWithUserKey = async (id, apiKey) => {
  const url = `${getSipeBaseUrl()}/hardware/${id}`
  const response = await axios.get(url, { headers: buildSipeHeaders(apiKey) })
  return response.data
}

const searchAssetsByNameWithUserKey = async (name, apiKey) => {
  const url = `${getSipeBaseUrl()}/hardware`
  const response = await axios.get(url, {
    headers: buildSipeHeaders(apiKey),
    params: {
      search: name,
      limit: 50
    }
  })

  return response.data
}

module.exports = {
  fetchAssetByIdWithUserKey,
  searchAssetsByNameWithUserKey,
  getSipeBaseUrl
}
