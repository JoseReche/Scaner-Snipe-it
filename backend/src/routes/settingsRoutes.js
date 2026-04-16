import { Router } from 'express'
import { getChecklists, getIncidentTypes, getInternalStatuses, saveChecklist } from '../controllers/adminController.js'

const router = Router()

router.get('/checklists', getChecklists)
router.post('/checklists', saveChecklist)
router.get('/internal-statuses', getInternalStatuses)
router.get('/incident-types', getIncidentTypes)

export default router
