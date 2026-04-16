import { Router } from 'express'
import { getMetrics, getPending, getSummary } from '../controllers/dashboardController.js'

const router = Router()

router.get('/summary', getSummary)
router.get('/pending', getPending)
router.get('/metrics', getMetrics)

export default router
