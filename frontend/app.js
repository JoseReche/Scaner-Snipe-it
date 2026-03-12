(function () {
  const tokenKey = 'auth_token'
  const userKey = 'auth_user'

  function setError(id, message) {
    const el = document.getElementById(id)
    if (el) {
      el.textContent = message || ''
    }
  }

  function getToken() {
    return localStorage.getItem(tokenKey)
  }

  async function login(email, password) {
    const response = await fetch('/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    })

    const data = await response.json().catch(() => ({}))

    if (!response.ok) {
      throw new Error(data.error || 'Falha no login')
    }

    localStorage.setItem(tokenKey, data.token)
    localStorage.setItem(userKey, JSON.stringify(data.user || {}))
  }

  async function loadAssets() {
    const response = await fetch('/assets', {
      headers: {
        Authorization: `Bearer ${getToken()}`
      }
    })

    const data = await response.json().catch(() => ({}))

    if (!response.ok) {
      throw new Error(data.error || 'Falha ao buscar ativos')
    }

    return data
  }

  async function setupLoginPage() {
    const form = document.getElementById('loginForm')
    if (!form) return

    if (getToken()) {
      window.location.href = '/dashboard.html'
      return
    }

    form.addEventListener('submit', async (event) => {
      event.preventDefault()
      setError('errorMessage', '')

      const email = document.getElementById('email').value.trim()
      const password = document.getElementById('password').value
      const btn = document.getElementById('loginBtn')
      btn.disabled = true
      btn.textContent = 'Entrando...'

      try {
        await login(email, password)
        window.location.href = '/dashboard.html'
      } catch (error) {
        setError('errorMessage', error.message)
      } finally {
        btn.disabled = false
        btn.textContent = 'Login'
      }
    })
  }

  async function setupDashboardPage() {
    const list = document.getElementById('assetList')
    if (!list) return

    const token = getToken()
    if (!token) {
      window.location.href = '/login.html'
      return
    }

    const user = JSON.parse(localStorage.getItem(userKey) || '{}')
    const welcome = document.getElementById('welcomeUser')
    if (welcome) {
      welcome.textContent = user.name ? `Bem-vindo, ${user.name}` : ''
    }

    document.getElementById('logoutBtn').addEventListener('click', () => {
      localStorage.removeItem(tokenKey)
      localStorage.removeItem(userKey)
      window.location.href = '/login.html'
    })

    try {
      const data = await loadAssets()
      document.getElementById('totalAssets').textContent = data.total || 0
      list.innerHTML = ''

      ;(data.assets || []).forEach((asset) => {
        const item = document.createElement('li')
        item.innerHTML = `
          <strong>${asset.name || 'Sem nome'}</strong><br>
          TAG: ${asset.asset_tag || '-'}<br>
          Status: ${asset.status || '-'}
        `
        list.appendChild(item)
      })
    } catch (error) {
      setError('dashboardError', error.message)
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    setupLoginPage()
    setupDashboardPage()
  })
})()
