import { Router } from 'express'
import { login, logout, me, seedOperator } from '../controllers/authController.js'
import { authMiddleware, roleMiddleware } from '../middleware/authMiddleware.js'

const router = Router()

router.post('/login', login)
router.post('/logout', authMiddleware, logout)
router.get('/me', authMiddleware, me)
router.post('/seed-operator', authMiddleware, roleMiddleware(['admin']), seedOperator)

export default router
