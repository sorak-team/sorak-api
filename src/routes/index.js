import { Router } from 'express';

const router = Router();

router.get('/health', (req, res) => {
  res.success({
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

export default router;