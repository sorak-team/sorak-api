import { Router } from 'express';
import { asyncHandler } from '../utils/async-handler.js';
import { validate } from '../middlewares/validate.js';
import { authMiddleware } from '../middlewares/auth.js';
import { requireRoles } from '../middlewares/roles.js';
import {
  createBroadcastSchema,
  queryBroadcastSchema,
  updateBroadcastSchema,
} from '../validators/notification.schema.js';
import {
  createBroadcast,
  listBroadcasts,
  listAutomatedNotifications,
  getAutomatedNotificationDetail,
  getBroadcastDetail,
  deleteBroadcast,
  updateBroadcast,
  getMyNotifications,
  markAsRead,
  markAllAsRead,
  registerDeviceToken,
  unregisterDeviceToken,
  testPushNotification,
} from '../controllers/notification.controller.js';

const router = Router();

// All notification endpoints require authentication
router.use(authMiddleware);

// --- User Recipient Inbox endpoints ---
router.get('/my', asyncHandler(getMyNotifications));
router.patch('/read-all', asyncHandler(markAllAsRead));
router.patch('/:id/read', asyncHandler(markAsRead));

// --- Mobile Device Push Token Management ---
router.post('/device-token', asyncHandler(registerDeviceToken));
router.delete('/device-token', asyncHandler(unregisterDeviceToken));
router.post('/test-push', asyncHandler(testPushNotification));

// --- Principal Broadcast & Automated Notifications Management endpoints ---
router.get(
  '/automated',
  requireRoles('PRINCIPAL_BGH', 'ADMIN_BGH', 'TEACHER_GV'),
  asyncHandler(listAutomatedNotifications)
);

router.get(
  '/automated/:id',
  requireRoles('PRINCIPAL_BGH', 'ADMIN_BGH', 'TEACHER_GV'),
  asyncHandler(getAutomatedNotificationDetail)
);

router.get(
  '/broadcasts',
  requireRoles('PRINCIPAL_BGH', 'ADMIN_BGH'),
  validate(queryBroadcastSchema, 'query'),
  asyncHandler(listBroadcasts)
);

router.post(
  '/broadcasts',
  requireRoles('PRINCIPAL_BGH', 'ADMIN_BGH'),
  validate(createBroadcastSchema),
  asyncHandler(createBroadcast)
);

router.get(
  '/broadcasts/:batchId',
  requireRoles('PRINCIPAL_BGH', 'ADMIN_BGH'),
  asyncHandler(getBroadcastDetail)
);

router.delete(
  '/broadcasts/:batchId',
  requireRoles('PRINCIPAL_BGH', 'ADMIN_BGH'),
  asyncHandler(deleteBroadcast)
);

router.put(
  '/broadcasts/:batchId',
  requireRoles('PRINCIPAL_BGH', 'ADMIN_BGH'),
  validate(updateBroadcastSchema),
  asyncHandler(updateBroadcast)
);

export default router;

