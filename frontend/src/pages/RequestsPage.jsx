import { useEffect, useState } from 'react'
import { apiClient } from '../api/client'

const defaultForm = {
  requester_name: '', requester_email: '', cost_center: '', department: '', location: '', asset_type: '', justification: '', notes: ''
}

export function RequestsPage() {
  const [rows, setRows] = useState([])
  const [form, setForm] = useState(defaultForm)

  const load = () => apiClient.request('/requests').then((data) => setRows(data.rows))

  useEffect(() => { load() }, [])

  const submit = async (event) => {
    event.preventDefault()
    await apiClient.request('/requests', { method: 'POST', body: JSON.stringify(form) })
    setForm(defaultForm)
    load()
  }

  return (
    <section className="page">
      <h1>Solicitações</h1>
      <form className="grid" onSubmit={submit}>
        {Object.keys(defaultForm).map((field) => (
          <input key={field} placeholder={field} value={form[field]} onChange={(e) => setForm({ ...form, [field]: e.target.value })} />
        ))}
        <button>Criar solicitação</button>
      </form>
      <table><tbody>{rows.map((row) => <tr key={row.id}><td>{row.requester_name}</td><td>{row.cost_center}</td><td>{row.status}</td></tr>)}</tbody></table>
    </section>
  )
}
