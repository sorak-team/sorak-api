import { Router } from 'express';
import planningController from '../controllers/planning.controller.js';
import { authMiddleware } from '../middlewares/auth.js';

const router = Router();

// Require auth for all planning endpoints
router.use(authMiddleware);

// Tab 1: Educational Activities by Theme
router.get('/classes/:classId/activities', planningController.getThemeActivities);
router.post('/classes/:classId/activities', planningController.saveEducationalActivity);
router.delete('/classes/:classId/activities/:activityId', planningController.deleteEducationalActivity);

// Tab 2: Weekly Timetable & Slot Assignment
router.get('/classes/:classId/timetable', planningController.getWeeklyTimetable);
router.post('/classes/:classId/timetable/assign-activity', planningController.assignActivityToSlot);
router.post('/classes/:classId/timetable/slots', planningController.saveWeeklySlot);
router.post('/classes/:classId/timetable/reorder', planningController.reorderWeeklySlots);
router.delete('/classes/:classId/timetable/slots/:slotId', planningController.deleteWeeklySlot);

// Target Allocation endpoints (backward compatibility)
router.get('/classes/:classId/allocation', planningController.getTargetAllocation);
router.post('/classes/:classId/allocation', planningController.saveTargetAllocation);
router.post('/classes/:classId/allocation/publish', planningController.publishAllocation);

// AI Assistance endpoints
router.post('/ai/allocation', planningController.queryAiAllocation);
router.post('/ai/generate-activity', planningController.generateActivityAi);

export default router;
