import { Router } from 'express'
import {
  assignAsset,
  createRequest,
  deliver,
  getRequestById,
  listRequests,
  markAwaitingPickup,
  markPreparing,
  updateRequest
} from '../controllers/requestsController.js'

const router = Router()

router.get('/', listRequests)
router.post('/', createRequest)
router.get('/:id', getRequestById)
router.patch('/:id', updateRequest)
router.post('/:id/assign-asset', assignAsset)
router.post('/:id/prepare', markPreparing)
router.post('/:id/mark-awaiting-pickup', markAwaitingPickup)
router.post('/:id/deliver', deliver)

export default router
