import { useState } from 'react'
import { apiClient } from '../api/client'

export function AssetHistoryPage() {
  const [assetId, setAssetId] = useState('')
  const [timeline, setTimeline] = useState(null)

  const load = async () => {
    const data = await apiClient.request(`/assets/${assetId}/timeline`)
    setTimeline(data)
  }

  return (
    <section className="page">
      <h1>Histórico do Ativo</h1>
      <input placeholder="ID do ativo" value={assetId} onChange={(e) => setAssetId(e.target.value)} />
      <button onClick={load}>Carregar timeline</button>
      {timeline && (
        <>
          <h2>Movimentações</h2>
          <ul>{timeline.movements.map((mv) => <li key={mv.id}>{mv.movement_type}: {mv.from_status} → {mv.to_status}</li>)}</ul>
          <h2>Incidentes</h2>
          <ul>{timeline.incidents.map((inc) => <li key={inc.id}>{inc.severity}: {inc.description}</li>)}</ul>
        </>
      )}
    </section>
  )
}
