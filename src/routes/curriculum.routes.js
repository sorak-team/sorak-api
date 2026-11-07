import { Router } from 'express';
import { asyncHandler } from '../utils/async-handler.js';
import { authMiddleware } from '../middlewares/auth.js';
import {
  listThemeOverview,
  getThemeSetDetail,
  updateThemeSetStatus,
  updateThemeSetDetail,
  listGoalBanksOverview,
  getGoalBankDetail,
  updateGoalBankStatus,
  getSingleGoalDetail,
  updateGoalContents,
  createGoal,
  updateGoal,
  deleteGoal,
  queryAiAssistant,
  exportEducationalFrameworkExcel,
} from '../controllers/curriculum.controller.js';

const router = Router();

// Framework & Goals Export
router.get('/framework/export/excel', authMiddleware, asyncHandler(exportEducationalFrameworkExcel));
router.get('/goals/export/excel', authMiddleware, asyncHandler(exportEducationalFrameworkExcel));

// Themes endpoints

router.get('/themes/overview', authMiddleware, asyncHandler(listThemeOverview));
router.get('/themes/detail', authMiddleware, asyncHandler(getThemeSetDetail));
router.patch('/themes/status', authMiddleware, asyncHandler(updateThemeSetStatus));
router.put('/themes/detail', authMiddleware, asyncHandler(updateThemeSetDetail));
router.get('/goals/overview', authMiddleware, asyncHandler(listGoalBanksOverview));
router.get('/goals/detail', authMiddleware, asyncHandler(getGoalBankDetail));
router.patch('/goals/status', authMiddleware, asyncHandler(updateGoalBankStatus));
router.get('/goals/single-detail', authMiddleware, asyncHandler(getSingleGoalDetail));
router.put('/goals/single-detail/contents', authMiddleware, asyncHandler(updateGoalContents));
router.post('/goals/item', authMiddleware, asyncHandler(createGoal));
router.put('/goals/item', authMiddleware, asyncHandler(updateGoal));
router.delete('/goals/item', authMiddleware, asyncHandler(deleteGoal));
router.post('/goals/ai-assistant', authMiddleware, asyncHandler(queryAiAssistant));


// Goals endpoints

// AI Assistant endpoint

export default router;
