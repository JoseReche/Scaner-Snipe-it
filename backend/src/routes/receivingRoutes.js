import { Router } from 'express'
import {
  checkinReceiving,
  createIncident,
  inspectionReceiving,
  searchReceiving,
  sendToMaintenance,
  sendToStock
} from '../controllers/receivingController.js'

const router = Router()

router.get('/search', searchReceiving)
router.post('/:assetId/checkin', checkinReceiving)
router.post('/:assetId/inspection', inspectionReceiving)
router.post('/:assetId/incident', createIncident)
router.post('/:assetId/send-to-maintenance', sendToMaintenance)
router.post('/:assetId/send-to-stock', sendToStock)

export default router
