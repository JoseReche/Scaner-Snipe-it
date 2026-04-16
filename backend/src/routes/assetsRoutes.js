import { Router } from 'express'
import { getAsset, getAssetMovements, getAssetTimeline, listAssets } from '../controllers/assetsController.js'

const router = Router()

router.get('/', listAssets)
router.get('/:id', getAsset)
router.get('/:id/timeline', getAssetTimeline)
router.get('/:id/movements', getAssetMovements)

export default router
