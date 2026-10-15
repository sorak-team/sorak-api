import { Router } from 'express';
import goodBehaviorController from '../controllers/good-behavior.controller.js';
import { authMiddleware } from '../middlewares/auth.js';

const router = Router();


router.use(authMiddleware);



export default router;
