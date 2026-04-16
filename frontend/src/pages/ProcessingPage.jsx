import { useState } from 'react'
import { apiClient } from '../api/client'

export function ProcessingPage() {
  const [assetId, setAssetId] = useState('')
  const [message, setMessage] = useState('')

  const call = async (route) => {
    await apiClient.request(`/processing/${assetId}/${route}`, { method: 'POST' })
    setMessage(`Etapa ${route} concluída`)
  }

  return (
    <section className="page">
      <h1>Processamento Interno</h1>
      <input placeholder="ID do ativo" value={assetId} onChange={(e) => setAssetId(e.target.value)} />
      <div className="actions">
        <button onClick={() => call('backup-complete')}>Backup concluído</button>
        <button onClick={() => call('format-complete')}>Formatação concluída</button>
        <button onClick={() => call('ready-to-deploy')}>Pronto para implantar</button>
      </div>
      <p>{message}</p>
    </section>
  )
}
