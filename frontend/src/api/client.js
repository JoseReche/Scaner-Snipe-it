const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000'

export const apiClient = {
  token: localStorage.getItem('assetflow.token') || '',

  setToken(token) {
    this.token = token
    localStorage.setItem('assetflow.token', token)
  },

  clearToken() {
    this.token = ''
    localStorage.removeItem('assetflow.token')
  },

  async request(path, options = {}) {
    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        ...(options.headers || {})
      }
    })

    const data = await response.json().catch(() => ({}))

    if (!response.ok) {
      throw new Error(data.error || 'Erro inesperado')
    }

    return data
  }
}
