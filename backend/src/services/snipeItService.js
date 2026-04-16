import axios from 'axios'
import { env } from '../config/env.js'
import { logger } from '../config/logger.js'

const client = axios.create({
  baseURL: env.snipeItBaseUrl,
  timeout: env.snipeItTimeoutMs,
  headers: {
    Authorization: `Bearer ${env.snipeItApiToken}`,
    Accept: 'application/json',
    'Content-Type': 'application/json'
  }
})

const mockAssetRows = [
  { id: 101, asset_tag: 'NTB-001', serial: 'ABC001', name: 'Notebook Dell', status_label: { name: 'Ready to Deploy' } },
  { id: 102, asset_tag: 'MON-010', serial: 'MON001', name: 'Monitor 24', status_label: { name: 'Em estoque' } }
]

const withRetry = async (fn) => {
  let lastError

  for (let attempt = 1; attempt <= env.snipeItRetryAttempts; attempt += 1) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      logger.warn({ attempt, err: error.message }, 'Falha integração Snipe-IT')
    }
  }

  throw lastError
}

export const snipeItService = {
  async listAssets(search) {
    if (env.useMockData || !env.snipeItBaseUrl || !env.snipeItApiToken) {
      return mockAssetRows.filter((asset) => !search || String(asset.asset_tag).includes(search) || String(asset.id).includes(search))
    }

    const data = await withRetry(async () => {
      const response = await client.get('/hardware', { params: { search, limit: 50 } })
      return response.data
    })

    return data.rows || []
  },

  async getAsset(assetId) {
    if (env.useMockData || !env.snipeItBaseUrl || !env.snipeItApiToken) {
      return mockAssetRows.find((asset) => String(asset.id) === String(assetId)) || null
    }

    const response = await client.get(`/hardware/${assetId}`)
    return response.data
  },

  async checkoutAsset(assetId, payload) {
    if (env.useMockData || !env.snipeItBaseUrl || !env.snipeItApiToken) {
      return { success: true, mocked: true, assetId, payload }
    }

    const response = await client.post(`/hardware/${assetId}/checkout`, payload)
    return response.data
  },

  async checkinAsset(assetId, payload = {}) {
    if (env.useMockData || !env.snipeItBaseUrl || !env.snipeItApiToken) {
      return { success: true, mocked: true, assetId, payload }
    }

    const response = await client.post(`/hardware/${assetId}/checkin`, payload)
    return response.data
  },

  async updateAsset(assetId, payload) {
    if (env.useMockData || !env.snipeItBaseUrl || !env.snipeItApiToken) {
      return { success: true, mocked: true, assetId, payload }
    }

    const response = await client.patch(`/hardware/${assetId}`, payload)
    return response.data
  },

  async getLookups() {
    if (env.useMockData || !env.snipeItBaseUrl || !env.snipeItApiToken) {
      return {
        users: [{ id: 1, name: 'Usuário Mock' }],
        locations: [{ id: 1, name: 'Matriz' }],
        categories: [{ id: 1, name: 'Notebook' }],
        statuses: [{ id: 1, name: 'Em estoque' }]
      }
    }

    const [users, locations, categories, statuses] = await Promise.all([
      client.get('/users'),
      client.get('/locations'),
      client.get('/categories'),
      client.get('/statuslabels')
    ])

    return {
      users: users.data.rows || [],
      locations: locations.data.rows || [],
      categories: categories.data.rows || [],
      statuses: statuses.data.rows || []
    }
  }
}
