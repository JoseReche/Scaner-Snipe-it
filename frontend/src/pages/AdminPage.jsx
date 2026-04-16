import { useEffect, useState } from 'react'
import { apiClient } from '../api/client'

export function AdminPage() {
  const [statuses, setStatuses] = useState([])
  const [incidents, setIncidents] = useState([])

  useEffect(() => {
    apiClient.request('/settings/internal-statuses').then((data) => setStatuses(data.rows))
    apiClient.request('/settings/incident-types').then((data) => setIncidents(data.rows))
  }, [])

  return (
    <section className="page">
      <h1>Administração</h1>
      <h2>Status internos</h2>
      <ul>{statuses.map((status) => <li key={status}>{status}</li>)}</ul>
      <h2>Motivos de avaria</h2>
      <ul>{incidents.map((item) => <li key={item.id}>{item.label}</li>)}</ul>
    </section>
  )
}
