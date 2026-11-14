import { Router } from 'express';
import planningController from '../controllers/planning.controller.js';
import { authMiddleware } from '../middlewares/auth.js';
import { validate } from '../middlewares/validate.js';
import { createActivitySchema } from '../validators/planning.schema.js';

const router = Router();

// Require auth for all planning endpoints
router.use(authMiddleware);

// Iteration 3: Export Planning Endpoints
router.get('/themes/export/excel', planningController.exportThemePlanExcel);
router.get('/themes/export/print', planningController.exportThemePlanPrint);
router.get('/classes/:classId/themes/:themeId/export/print', planningController.exportThemeTeachingPlanPrint);
router.get('/classes/:classId/themes/:themeId/export/excel', planningController.exportThemeTeachingPlanExcel);
router.get('/classes/:classId/themes/export/print', planningController.exportThemeTeachingPlanPrint);
router.get('/classes/:classId/themes/export/excel', planningController.exportThemeTeachingPlanExcel);
router.get('/classes/:classId/weeks/:weekNumber/export/print', planningController.exportWeeklyTeachingPlanPrint);
router.get('/classes/:classId/weeks/:weekNumber/export/excel', planningController.exportWeeklyTeachingPlanExcel);
router.get('/classes/:classId/weeks/export/print', planningController.exportWeeklyTeachingPlanPrint);
router.get('/classes/:classId/weeks/export/excel', planningController.exportWeeklyTeachingPlanExcel);

router.get('/classes/:classId/activities', planningController.getThemeActivities);
router.post('/classes/:classId/activities', validate(createActivitySchema), planningController.saveEducationalActivity);
router.delete('/classes/:classId/activities/:activityId', planningController.deleteEducationalActivity);
router.get('/classes/:classId/timetable', planningController.getWeeklyTimetable);
router.post('/classes/:classId/timetable/assign-activity', planningController.assignActivityToSlot);
router.post('/classes/:classId/timetable/slots', planningController.saveWeeklySlot);
router.post('/classes/:classId/timetable/swap-slots', planningController.swapWeeklySlots);
router.post('/classes/:classId/timetable/reorder', planningController.reorderWeeklySlots);
router.delete('/classes/:classId/timetable/slots/:slotId', planningController.deleteWeeklySlot);
router.get('/classes/:classId/allocation', planningController.getTargetAllocation);
router.post('/classes/:classId/allocation', planningController.saveTargetAllocation);
router.post('/classes/:classId/allocation/publish', planningController.publishAllocation);
router.get('/classes/:classId/theme-plan/summary', planningController.getClassThemePlansSummary);
router.get('/classes/:classId/theme-plan/status', planningController.getThemePlanStatus);
router.get('/classes/:classId/theme-plan/preview', planningController.getThemePlanAppraisalPreview);
router.post('/classes/:classId/theme-plan/submit', planningController.submitThemePlan);
router.post('/classes/:classId/theme-plan/approve', planningController.approveThemePlan);
router.post('/classes/:classId/theme-plan/revision-request', planningController.requestThemePlanRevision);
router.get('/submissions/matrix', planningController.getThemePlanMatrix);
router.get('/submissions', planningController.getThemePlanSubmissions);
router.post('/ai/allocation', planningController.queryAiAllocation);
router.post('/ai/generate-activity', planningController.generateActivityAi);


// Tab 1: Educational Activities by Theme

// Tab 2: Weekly Timetable & Slot Assignment

// Target Allocation endpoints (backward compatibility)

// AI Assistance endpoints

export default router;
