import { mockStore } from '../data/mockStore.js'
import { mapInternalToSnipeStatus } from '../utils/statusMap.js'

const moveProcessing = (assetId, status) => {
  const flow = mockStore.flows.find((item) => Number(item.snipe_asset_id) === Number(assetId))

  if (!flow) {
    return null
  }

  flow.internal_status = status
  flow.snipe_status = mapInternalToSnipeStatus(status)
  flow.updated_at = new Date().toISOString()

  return flow
}

export const markBackupComplete = (req, res) => {
  const flow = moveProcessing(req.params.assetId, 'formatacao')
  if (!flow) return res.status(404).json({ error: 'Fluxo não encontrado' })
  return res.json({ success: true, flow })
}

export const markFormatComplete = (req, res) => {
  const flow = moveProcessing(req.params.assetId, 'pronto_para_implementar')
  if (!flow) return res.status(404).json({ error: 'Fluxo não encontrado' })
  return res.json({ success: true, flow })
}

export const markReadyToDeploy = (req, res) => {
  const flow = moveProcessing(req.params.assetId, 'pronto_para_implementar')
  if (!flow) return res.status(404).json({ error: 'Fluxo não encontrado' })
  return res.json({ success: true, flow })
}
