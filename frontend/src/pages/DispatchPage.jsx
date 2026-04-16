import { useState } from 'react'
import { apiClient } from '../api/client'

export function DispatchPage() {
  const [requestId, setRequestId] = useState('')
  const [assetId, setAssetId] = useState('')
  const [message, setMessage] = useState('')

  const assign = async () => {
    const data = await apiClient.request(`/requests/${requestId}/assign-asset`, { method: 'POST', body: JSON.stringify({ snipe_asset_id: Number(assetId) }) })
    setMessage(`Ativo ${data.snipe_asset_id} vinculado`)
  }

  const awaiting = async () => {
    await apiClient.request(`/requests/${requestId}/mark-awaiting-pickup`, { method: 'POST' })
    setMessage('Solicitação aguardando retirada')
  }

  const deliver = async () => {
    await apiClient.request(`/requests/${requestId}/deliver`, { method: 'POST', body: JSON.stringify({ requester_name_confirmed: 'Conferido no balcão' }) })
    setMessage('Entrega concluída e checkout executado')
  }

  return (
    <section className="page">
      <h1>Saída de Ativo</h1>
      <input placeholder="ID da solicitação" value={requestId} onChange={(e) => setRequestId(e.target.value)} />
      <input placeholder="ID do ativo no Snipe-IT" value={assetId} onChange={(e) => setAssetId(e.target.value)} />
      <div className="actions">
        <button onClick={assign}>Vincular ativo</button>
        <button onClick={awaiting}>Aguardando retirada</button>
        <button onClick={deliver}>Confirmar entrega</button>
      </div>
      <p>{message}</p>
    </section>
  )
}
