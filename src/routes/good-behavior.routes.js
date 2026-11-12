import { Router } from 'express';
import goodBehaviorController from '../controllers/good-behavior.controller.js';
import { authMiddleware } from '../middlewares/auth.js';

const router = Router();

router.use(authMiddleware);

// Iteration 4: Export Sổ / Phiếu Bé Ngoan
router.get('/classes/:classId/export/excel', goodBehaviorController.exportGoodBehaviorExcel);
router.get('/classes/:classId/export/print', goodBehaviorController.exportGoodBehaviorPrint);
router.get('/students/:studentId/export/print', goodBehaviorController.exportGoodBehaviorPrint);
router.get('/export/excel', goodBehaviorController.exportGoodBehaviorExcel);
router.get('/export/print', goodBehaviorController.exportGoodBehaviorPrint);

router.get('/classes/:classId', goodBehaviorController.getOverview);
router.post('/classes/:classId/records', goodBehaviorController.saveRecords);

export default router;
