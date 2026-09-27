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
  updateGoal,
  deleteGoal,
  queryAiAssistant,
} from '../controllers/curriculum.controller.js';

const router = Router();

// Themes endpoints

router.get('/themes/overview', authMiddleware, asyncHandler(listThemeOverview));
router.get('/themes/detail', authMiddleware, asyncHandler(getThemeSetDetail));
router.patch('/themes/status', authMiddleware, asyncHandler(updateThemeSetStatus));
router.put('/themes/detail', authMiddleware, asyncHandler(updateThemeSetDetail));


// Goals endpoints

// AI Assistant endpoint

export default router;
