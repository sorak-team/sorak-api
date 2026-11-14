import { notificationService } from '../services/notification.service.js';

export const createBroadcast = async (req, res) => {
  const result = await notificationService.createBroadcast(req.body, req.user);
  res.status(201).success(result);
};

export const listBroadcasts = async (req, res) => {
  const result = await notificationService.listBroadcasts(req.query, req.user);
  res.success(result);
};

export const listAutomatedNotifications = async (req, res) => {
  const result = await notificationService.listAutomatedNotifications(req.query, req.user);
  res.success(result);
};

export const getAutomatedNotificationDetail = async (req, res) => {
  const { id } = req.params;
  const result = await notificationService.getAutomatedNotificationDetail(id, req.user);
  res.success(result);
};

export const getBroadcastDetail = async (req, res) => {
  const { batchId } = req.params;
  const result = await notificationService.getBroadcastDetail(batchId, req.user);
  res.success(result);
};

export const deleteBroadcast = async (req, res) => {
  const { batchId } = req.params;
  const result = await notificationService.deleteBroadcast(batchId, req.user);
  res.success(result);
};

export const updateBroadcast = async (req, res) => {
  const { batchId } = req.params;
  const result = await notificationService.updateBroadcast(batchId, req.body, req.user);
  res.success(result);
};

export const getMyNotifications = async (req, res) => {
  const result = await notificationService.getMyNotifications(req.query, req.user);
  res.success(result);
};

export const markAsRead = async (req, res) => {
  const { id } = req.params;
  const result = await notificationService.markAsRead(id, req.user);
  res.success(result);
};

export const markAllAsRead = async (req, res) => {
  const result = await notificationService.markAllAsRead(req.user);
  res.success(result);
};

export const registerDeviceToken = async (req, res) => {
  const result = await notificationService.registerDeviceToken(req.user, req.body);
  res.success(result);
};

export const unregisterDeviceToken = async (req, res) => {
  const result = await notificationService.unregisterDeviceToken(req.user, req.body);
  res.success(result);
};

export const testPushNotification = async (req, res) => {
  const result = await notificationService.testPushNotification(req.user, req.body);
  res.success(result);
};

