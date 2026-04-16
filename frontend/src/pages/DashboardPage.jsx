import { useEffect, useState } from 'react'
import { apiClient } from '../api/client'

export function DashboardPage() {
  const [summary, setSummary] = useState(null)
  const [pending, setPending] = useState([])

  useEffect(() => {
    apiClient.request('/dashboard/summary').then(setSummary)
    apiClient.request('/dashboard/pending').then((data) => setPending(data.rows))
  }, [])

  return (
    <section className="page">
      <h1>Dashboard Operacional</h1>
      <div className="cards">
        {summary && Object.entries(summary).map(([key, value]) => (
          <article key={key} className="card"><h3>{key.replaceAll('_', ' ')}</h3><strong>{value}</strong></article>
        ))}
      </div>
      <h2>Pendências</h2>
      <ul>
        {pending.map((item) => <li key={item.id}>Ativo {item.asset_tag || item.snipe_asset_id} - {item.internal_status}</li>)}
      </ul>
    </section>
  )
}
