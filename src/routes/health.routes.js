import { Router } from 'express';
import healthController from '../controllers/health.controller.js';
import { authMiddleware } from '../middlewares/auth.js';

const router = Router();


router.use(authMiddleware);



export default router;
