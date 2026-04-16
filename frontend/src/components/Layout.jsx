import { Link, Outlet, useNavigate } from 'react-router-dom'
import { apiClient } from '../api/client'

const links = [
  ['/', 'Dashboard'],
  ['/requests', 'Solicitações'],
  ['/dispatch', 'Saída'],
  ['/receiving', 'Recebimento'],
  ['/processing', 'Processamento'],
  ['/assets', 'Histórico'],
  ['/admin', 'Admin']
]

export function Layout() {
  const navigate = useNavigate()

  const logout = async () => {
    try {
      await apiClient.request('/auth/logout', { method: 'POST' })
    } finally {
      apiClient.clearToken()
      navigate('/login')
    }
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <h2>Asset Flow TI</h2>
        <nav>
          {links.map(([to, label]) => (
            <Link key={to} to={to}>{label}</Link>
          ))}
        </nav>
        <button onClick={logout}>Sair</button>
      </aside>
      <main>
        <Outlet />
      </main>
    </div>
  )
}
