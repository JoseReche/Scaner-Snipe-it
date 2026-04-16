import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiClient } from '../api/client'

export function LoginPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ email: 'admin@local', password: 'Admin@1234' })
  const [error, setError] = useState('')

  const onSubmit = async (event) => {
    event.preventDefault()
    setError('')

    try {
      const data = await apiClient.request('/auth/login', { method: 'POST', body: JSON.stringify(form) })
      apiClient.setToken(data.token)
      navigate('/')
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="page login">
      <h1>Entrar</h1>
      <form onSubmit={onSubmit}>
        <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="E-mail" />
        <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Senha" />
        <button type="submit">Login</button>
      </form>
      {error && <p className="error">{error}</p>}
    </div>
  )
}
