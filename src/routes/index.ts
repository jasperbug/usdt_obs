import { Router } from 'express';
import donationRoutes from './donations';
import obsRoutes from './obs';

const router = Router();

// Health check
router.get('/healthz', (req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// API routes
router.use('/donations', donationRoutes);

// OBS routes
router.use('/obs', obsRoutes);

export default router;