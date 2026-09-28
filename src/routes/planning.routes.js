import { Router } from 'express';
import planningController from '../controllers/planning.controller.js';
import { authMiddleware } from '../middlewares/auth.js';

const router = Router();

// Require auth for all planning endpoints

router.use(authMiddleware);


// Tab 1: Educational Activities by Theme

// Tab 2: Weekly Timetable & Slot Assignment

// Target Allocation endpoints (backward compatibility)

// AI Assistance endpoints

export default router;
