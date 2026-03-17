const TOKEN_KEY = 'scaner.jwt'
const THEME_KEY = 'scaner.theme'

const getJwtToken = () => localStorage.getItem(TOKEN_KEY)
const setJwtToken = (token) => localStorage.setItem(TOKEN_KEY, token)
const clearJwtToken = () => localStorage.removeItem(TOKEN_KEY)

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

    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })

    const data = await response.json()

    if (!response.ok) {
      setFeedback(message, data.error || 'Falha no login', 'error')
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
    const response = await fetch('/api/auth/change-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getJwtToken()}`
      },
      body: JSON.stringify(body)
    })

    const data = await response.json()

    if (!response.ok) {
      setFeedback(message, data.error || 'Falha na alteração de senha', 'error')
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
    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })

    const data = await response.json()

    if (!response.ok) {
      setFeedback(message, data.error || 'Falha no cadastro', 'error')
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
