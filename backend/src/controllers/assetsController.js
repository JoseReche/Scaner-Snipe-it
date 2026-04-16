import { mockStore } from '../data/mockStore.js'
import { snipeItService } from '../services/snipeItService.js'

export const listAssets = async (req, res) => {
  const rows = await snipeItService.listAssets(req.query.search)
  res.json({ rows })
}

export const getAsset = async (req, res) => {
  const asset = await snipeItService.getAsset(req.params.id)

  if (!asset) {
    return res.status(404).json({ error: 'Ativo não encontrado' })
  }

  return res.json(asset)
}

export const getAssetTimeline = (req, res) => {
  const assetId = Number(req.params.id)
  const movements = mockStore.movements.filter((item) => Number(item.snipe_asset_id) === assetId)
  const checklists = mockStore.checklists.filter((item) => Number(item.snipe_asset_id) === assetId)
  const incidents = mockStore.incidents.filter((item) => Number(item.snipe_asset_id) === assetId)

  res.json({ assetId, movements, checklists, incidents })
}

export const getAssetMovements = (req, res) => {
  const assetId = Number(req.params.id)
  const rows = mockStore.movements.filter((item) => Number(item.snipe_asset_id) === assetId)
  res.json({ rows })
}
