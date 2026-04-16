import { useState } from 'react'
import { apiClient } from '../api/client'

export function ReceivingPage() {
  const [assetId, setAssetId] = useState('')
  const [notes, setNotes] = useState('')
  const [result, setResult] = useState('OK')
  const [message, setMessage] = useState('')

  const checkin = async () => {
    await apiClient.request(`/receiving/${assetId}/checkin`, { method: 'POST', body: JSON.stringify({ notes }) })
    setMessage('Checkin realizado')
  }

  const inspect = async () => {
    await apiClient.request(`/receiving/${assetId}/inspection`, {
      method: 'POST',
      body: JSON.stringify({
        result,
        checklist_type: 'Notebook',
        notes,
        severity: result === 'NOK' ? 'alto' : undefined,
        items_json: [
          { item: 'Liga normalmente', required: true, status: result === 'OK' ? 'ok' : 'nok' },
          { item: 'Sem danos visíveis', required: true, status: result === 'OK' ? 'ok' : 'nok' }
        ]
      })
    })
    setMessage('Conferência registrada')
  }

  return (
    <section className="page">
      <h1>Recebimento / Conferência</h1>
      <input placeholder="ID do ativo" value={assetId} onChange={(e) => setAssetId(e.target.value)} />
      <select value={result} onChange={(e) => setResult(e.target.value)}><option>OK</option><option>NOK</option></select>
      <textarea placeholder="Observações" value={notes} onChange={(e) => setNotes(e.target.value)} />
      <div className="actions"><button onClick={checkin}>Registrar devolução</button><button onClick={inspect}>Finalizar conferência</button></div>
      <p>{message}</p>
    </section>
  )
}
