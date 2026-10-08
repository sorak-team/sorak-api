import { Router } from 'express';
import planningController from '../controllers/planning.controller.js';
import { authMiddleware } from '../middlewares/auth.js';

const router = Router();

// Require auth for all planning endpoints

router.use(authMiddleware);
router.get('/classes/:classId/activities', planningController.getThemeActivities);
router.post('/classes/:classId/activities', planningController.saveEducationalActivity);
router.delete('/classes/:classId/activities/:activityId', planningController.deleteEducationalActivity);
router.get('/classes/:classId/timetable', planningController.getWeeklyTimetable);
router.post('/classes/:classId/timetable/assign-activity', planningController.assignActivityToSlot);


// Tab 1: Educational Activities by Theme

// Tab 2: Weekly Timetable & Slot Assignment

// Target Allocation endpoints (backward compatibility)

// AI Assistance endpoints

export default router;
