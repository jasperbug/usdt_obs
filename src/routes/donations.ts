import { Router } from 'express';
import { DonationController } from '../controllers/donationController';
import rateLimit from 'express-rate-limit';

const router = Router();
const donationController = new DonationController();

// Rate limiting
const createDonationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit each IP to 10 donation creations per windowMs
  message: {
    success: false,
    error: 'Too many donation requests, please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    success: false,
    error: 'Too many requests, please try again later'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply general rate limiting to all routes
router.use(generalLimiter);

// Routes
router.post('/', createDonationLimiter, (req, res) => {
  donationController.createDonation(req, res);
});

router.get('/recent', (req, res) => {
  donationController.getRecentDonations(req, res);
});

router.get('/:id', (req, res) => {
  donationController.getDonation(req, res);
});

// Admin endpoint for testing - update donation status
router.put('/:id/status', (req, res) => {
  donationController.updateDonationStatus(req, res);
});

export default router;