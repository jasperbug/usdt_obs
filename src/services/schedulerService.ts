import cron from 'node-cron';
import { DonationModel } from '../models/donation';
import { MemoryDonationModel } from '../models/memoryDonation';
import { BSCService } from './bscService';
import { pool } from '../database/connection';
import { logger } from '../utils/logger';

export class SchedulerService {
  private donationModel: DonationModel | MemoryDonationModel;
  private bscService: BSCService;

  constructor() {
    this.donationModel = pool ? new DonationModel() : new MemoryDonationModel();
    this.bscService = new BSCService();
  }

  start(): void {
    // Expire old pending donations - run every 5 minutes
    cron.schedule('*/5 * * * *', async () => {
      try {
        const expiredCount = await this.donationModel.expireOldPending();
        if (expiredCount > 0) {
          logger.info(`Expired ${expiredCount} old pending donations`);
        }
      } catch (error) {
        if (error instanceof Error && !error.message.includes('Database not available')) {
          logger.error('Error expiring old donations:', error);
        }
      }
    });

    // Log system stats - run every 10 minutes
    cron.schedule('*/10 * * * *', async () => {
      try {
        await this.logSystemStats();
      } catch (error) {
        logger.error('Error logging system stats:', error);
      }
    });

    // Check BSC connection - run every 5 minutes
    cron.schedule('*/5 * * * *', async () => {
      try {
        if (!this.bscService.isConnected()) {
          logger.warn('BSC service disconnected, attempting to restart');
          await this.bscService.startListening();
        }
      } catch (error) {
        logger.error('Error checking BSC connection:', error);
      }
    });

    logger.info('Scheduler service started');
  }

  private async logSystemStats(): Promise<void> {
    try {
      const balance = await this.bscService.getBalance();
      let recentDonationsCount = 0;
      let pendingShownCount = 0;

      try {
        const recentDonations = await this.donationModel.findRecentDonations(10);
        const shownNotConfirmed = await this.donationModel.findShownNotConfirmed();
        recentDonationsCount = recentDonations.length;
        pendingShownCount = shownNotConfirmed.length;
      } catch (dbError) {
        // Ignore database errors in API-only mode
      }

      logger.info('System stats', {
        recentDonationsCount,
        pendingShownCount,
        walletBalance: balance,
        bscConnected: this.bscService.isConnected(),
        uptime: process.uptime()
      });
    } catch (error) {
      logger.error('Error collecting system stats:', error);
    }
  }
}