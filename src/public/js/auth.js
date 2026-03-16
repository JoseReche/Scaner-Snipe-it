const TOKEN_KEY = 'scaner.jwt'

const getJwtToken = () => localStorage.getItem(TOKEN_KEY)
const setJwtToken = (token) => localStorage.setItem(TOKEN_KEY, token)
const clearJwtToken = () => localStorage.removeItem(TOKEN_KEY)

const setFeedback = (element, text, type) => {
  element.textContent = text
  element.className = 'message'

  if (type) {
    element.classList.add(type)
  }
}

const requireAuthToken = () => {
  if (!getJwtToken()) {
    window.location.href = '/login.html'
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
    window.location.href = '/dashboard.html'
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
