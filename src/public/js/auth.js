const TOKEN_KEY = 'scaner.jwt'
const THEME_KEY = 'scaner.theme'
const API_BASE_KEY = 'scaner.apiBaseUrl'

const getJwtToken = () => localStorage.getItem(TOKEN_KEY)
const setJwtToken = (token) => localStorage.setItem(TOKEN_KEY, token)
const clearJwtToken = () => localStorage.removeItem(TOKEN_KEY)

const normalizeBaseUrl = (value) => String(value || '').trim().replace(/\/+$/, '')
const getConfiguredApiBase = () => {
  const fromWindow = typeof window !== 'undefined' ? window.SCANER_API_BASE_URL : ''
  const fromStorage = localStorage.getItem(API_BASE_KEY)
  const fromMeta = document.querySelector('meta[name="scaner-api-base"]')?.getAttribute('content')

  return normalizeBaseUrl(fromWindow || fromStorage || fromMeta || '')
}

const resolveApiUrl = (path) => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  const configuredBase = getConfiguredApiBase()

  if (!configuredBase) {
    return normalizedPath
  }

  return `${configuredBase}${normalizedPath}`
}

const readJsonResponse = async (response) => {
  const contentType = response.headers.get('content-type') || ''

  if (!contentType.includes('application/json')) {
    return null
  }

  try {
    return await response.json()
  } catch (error) {
    return null
  }
}

const getRequestErrorMessage = (response, fallback) => {
  if (response.status === 405) {
    return 'API indisponível neste endereço. Configure o backend em SCANER_API_BASE_URL.'
  }

  return fallback
}

const applyTheme = (theme) => {
  const normalized = theme === 'dark' ? 'dark' : 'light'
  document.documentElement.setAttribute('data-theme', normalized)
  localStorage.setItem(THEME_KEY, normalized)

  const btn = document.getElementById('theme-toggle')

  if (btn) {
    btn.textContent = normalized === 'dark' ? '☀️ Tema claro' : '🌙 Tema escuro'
  }
}

const initThemeToggle = () => {
  const savedTheme = localStorage.getItem(THEME_KEY)

  if (savedTheme) {
    applyTheme(savedTheme)
  } else {
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
    applyTheme(prefersDark ? 'dark' : 'light')
  }

  if (document.getElementById('theme-toggle')) {
    return
  }

  const toggleButton = document.createElement('button')
  toggleButton.id = 'theme-toggle'
  toggleButton.type = 'button'
  toggleButton.className = 'theme-toggle'
  toggleButton.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme')
    applyTheme(current === 'dark' ? 'light' : 'dark')
  })

  document.body.appendChild(toggleButton)
  applyTheme(document.documentElement.getAttribute('data-theme'))
}


const setFeedback = (element, text, type) => {
  element.textContent = text
  element.className = 'message'

  if (type) {
    element.classList.add(type)
  }
}

const requireAuthToken = () => {
  if (!getJwtToken()) {
    window.location.href = '/login'
  }
}

const setupLoginForm = (formId, messageId) => {
  const form = document.getElementById(formId)
  const message = document.getElementById(messageId)

  form.addEventListener('submit', async (event) => {
    event.preventDefault()

    const body = Object.fromEntries(new FormData(form).entries())

    const response = await fetch(resolveApiUrl('/api/auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })

    const data = await readJsonResponse(response)

    if (!response.ok) {
      setFeedback(message, data?.error || getRequestErrorMessage(response, 'Falha no login'), 'error')
      return
    }

    setJwtToken(data.token)
    window.location.href = '/scanner'
  })
}

const setupChangePasswordForm = (formId, messageId) => {
  requireAuthToken()

  const form = document.getElementById(formId)
  const message = document.getElementById(messageId)

  form.addEventListener('submit', async (event) => {
    event.preventDefault()

    const body = Object.fromEntries(new FormData(form).entries())
    const response = await fetch(resolveApiUrl('/api/auth/change-password'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getJwtToken()}`
      },
      body: JSON.stringify(body)
    })

    const data = await readJsonResponse(response)

    if (!response.ok) {
      setFeedback(message, data?.error || getRequestErrorMessage(response, 'Falha na alteração de senha'), 'error')
      return
    }

    setFeedback(message, 'Senha alterada com sucesso', 'success')
    form.reset()
  })
}


const setupRegisterForm = (formId, messageId) => {
  const form = document.getElementById(formId)
  const message = document.getElementById(messageId)

  form.addEventListener('submit', async (event) => {
    event.preventDefault()

    const body = Object.fromEntries(new FormData(form).entries())
    const response = await fetch(resolveApiUrl('/api/auth/register'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })

    const data = await readJsonResponse(response)

    if (!response.ok) {
      setFeedback(message, data?.error || getRequestErrorMessage(response, 'Falha no cadastro'), 'error')
      return
    }

    setFeedback(message, 'Usuário criado com sucesso. Redirecionando para login...', 'success')
    form.reset()

    setTimeout(() => {
      window.location.href = '/login'
    }, 1200)
  })
}

document.addEventListener('DOMContentLoaded', () => {
  initThemeToggle()
})
