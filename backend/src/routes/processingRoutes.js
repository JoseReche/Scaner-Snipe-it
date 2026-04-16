import { Router } from 'express'
import { markBackupComplete, markFormatComplete, markReadyToDeploy } from '../controllers/processingController.js'

const router = Router()

router.post('/:assetId/backup-complete', markBackupComplete)
router.post('/:assetId/format-complete', markFormatComplete)
router.post('/:assetId/ready-to-deploy', markReadyToDeploy)

export default router
