import axios from 'axios';
import crypto from 'crypto';
import { DonationModel } from '../models/donation';
import { MemoryDonationModel } from '../models/memoryDonation';
import { DonationStatus } from '../types/donation';
import { WebSocketService } from './websocketService';
import { pool } from '../database/connection';
import { logger } from '../utils/logger';

export class BinanceService {
  private apiKey: string;
  private apiSecret: string;
  private donationModel: DonationModel | MemoryDonationModel;
  private wsService: WebSocketService;
  private baseURL: string = 'https://api.binance.com';
  private isMonitoring: boolean = false;
  private monitorInterval?: NodeJS.Timeout;
  private lastBalance: number = 0;
  private tolerance: number;
  private minAlertAmount: number;

  constructor() {
    this.apiKey = process.env.BINANCE_API_KEY || '';
    this.apiSecret = process.env.BINANCE_API_SECRET || '';
    this.tolerance = parseFloat(process.env.TOLERANCE || '0.001');
    this.minAlertAmount = parseFloat(process.env.MIN_ALERT_AMOUNT || '1.00');
    
    this.donationModel = pool ? new DonationModel() : new MemoryDonationModel();
    this.wsService = WebSocketService.getInstance();

    if (!this.apiKey || !this.apiSecret) {
      logger.warn('Binance API credentials not configured');
    } else {
      logger.info('Binance Service initialized', {
        tolerance: this.tolerance,
        minAlertAmount: this.minAlertAmount
      });
    }
  }

  private createSignature(queryString: string): string {
    return crypto
      .createHmac('sha256', this.apiSecret)
      .update(queryString)
      .digest('hex');
  }

  private createAuthenticatedRequest(params: Record<string, any> = {}) {
    const timestamp = Date.now();
    const queryString = new URLSearchParams({
      ...params,
      timestamp: timestamp.toString()
    }).toString();

    const signature = this.createSignature(queryString);
    
    return {
      url: `${this.baseURL}/api/v3/account?${queryString}&signature=${signature}`,
      headers: {
        'X-MBX-APIKEY': this.apiKey
      }
    };
  }

  async getUSDTBalance(): Promise<number> {
    try {
      if (!this.apiKey || !this.apiSecret) {
        throw new Error('Binance API credentials not configured');
      }

      const request = this.createAuthenticatedRequest();
      const response = await axios.get(request.url, { headers: request.headers });
      
      const usdtBalance = response.data.balances.find(
        (balance: any) => balance.asset === 'USDT'
      );

      if (!usdtBalance) {
        return 0;
      }

      return parseFloat(usdtBalance.free) + parseFloat(usdtBalance.locked);
    } catch (error) {
      logger.error('Error fetching USDT balance from Binance:', error);
      return 0;
    }
  }

  async startMonitoring(): Promise<void> {
    if (this.isMonitoring) {
      logger.warn('Binance monitoring already running');
      return;
    }

    if (!this.apiKey || !this.apiSecret) {
      logger.error('Cannot start monitoring: Binance API credentials not configured');
      return;
    }

    try {
      // Get initial balance
      this.lastBalance = await this.getUSDTBalance();
      logger.info(`Initial USDT balance: ${this.lastBalance}`);

      this.isMonitoring = true;
      
      // Monitor balance changes every 10 seconds
      this.monitorInterval = setInterval(async () => {
        await this.checkBalanceChanges();
      }, 10000);

      logger.info('Binance balance monitoring started');
    } catch (error) {
      logger.error('Failed to start Binance monitoring:', error);
      throw error;
    }
  }

  private async checkBalanceChanges(): Promise<void> {
    try {
      const currentBalance = await this.getUSDTBalance();
      
      if (currentBalance > this.lastBalance) {
        const increase = currentBalance - this.lastBalance;
        
        if (increase >= this.minAlertAmount) {
          logger.info('USDT Balance increase detected', {
            previousBalance: this.lastBalance,
            currentBalance,
            increase
          });

          await this.handleBalanceIncrease(increase);
        }
      }

      this.lastBalance = currentBalance;
    } catch (error) {
      logger.error('Error checking balance changes:', error);
    }
  }

  private async handleBalanceIncrease(amount: number): Promise<void> {
    try {
      // Find matching pending donation
      const donation = await this.donationModel.findPendingByAmount(amount, this.tolerance);
      
      if (!donation) {
        logger.warn(`No matching donation found for amount: ${amount}`);
        return;
      }

      if (donation.status !== DonationStatus.PENDING) {
        logger.info(`Donation already processed: ${donation.id}`, { 
          currentStatus: donation.status 
        });
        return;
      }

      // Update donation status to PENDING_SHOWN
      const updatedDonation = await this.donationModel.updateStatus(
        donation.id,
        DonationStatus.PENDING_SHOWN,
        { 
          txHash: `BINANCE_${Date.now()}`,
          firstBlock: 0 // Binance transactions don't have blocks
        }
      );

      if (updatedDonation) {
        // Emit donation event immediately
        this.wsService.emitDonation({
          id: updatedDonation.id,
          nickname: updatedDonation.nickname || '匿名',
          amount: updatedDonation.payAmount,
          message: updatedDonation.message || '',
          method: 'Binance'
        });

        // Mark as confirmed immediately for Binance transactions
        setTimeout(async () => {
          await this.donationModel.updateStatus(
            donation.id,
            DonationStatus.CONFIRMED
          );
          logger.info(`Binance donation confirmed: ${donation.id}`);
        }, 2000);

        logger.info(`Binance donation processed: ${donation.id}`, {
          donationId: donation.id,
          amount: updatedDonation.payAmount
        });
      }
    } catch (error) {
      logger.error('Error handling balance increase:', error);
    }
  }

  async stopMonitoring(): Promise<void> {
    if (!this.isMonitoring) {
      return;
    }

    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
    }

    this.isMonitoring = false;
    logger.info('Binance balance monitoring stopped');
  }

  isConnected(): boolean {
    return this.isMonitoring && !!this.apiKey && !!this.apiSecret;
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.getUSDTBalance();
      return true;
    } catch (error) {
      logger.error('Binance connection test failed:', error);
      return false;
    }
  }
}