import { ethers } from 'ethers';
import { DonationModel } from '../models/donation';
import { MemoryDonationModel } from '../models/memoryDonation';
import { DonationStatus } from '../types/donation';
import { WebSocketService } from './websocketService';
import { pool } from '../database/connection';
import { logger } from '../utils/logger';

const USDT_ABI = [
  'event Transfer(address indexed from, address indexed to, uint256 value)',
  'function balanceOf(address account) view returns (uint256)',
  'function decimals() view returns (uint8)'
];

export class BSCService {
  private provider: ethers.JsonRpcProvider | ethers.WebSocketProvider;
  private usdtContract: ethers.Contract;
  private donationModel: DonationModel | MemoryDonationModel;
  private wsService: WebSocketService;
  private isListening: boolean = false;
  private receiveAddress: string;
  private confirmations: number;
  private tolerance: number;
  private minAlertAmount: number;

  constructor() {
    const wssUrl = process.env.BSC_WSS_URL;
    const rpcUrl = process.env.BSC_RPC_URL || 'https://bsc-dataseed1.binance.org/';
    
    this.provider = wssUrl 
      ? new ethers.WebSocketProvider(wssUrl)
      : new ethers.JsonRpcProvider(rpcUrl);
    
    const usdtAddress = process.env.USDT_BEP20 || '0x55d398326f99059fF775485246999027B3197955';
    this.usdtContract = new ethers.Contract(usdtAddress, USDT_ABI, this.provider);
    
    this.receiveAddress = (process.env.RECEIVE_ADDRESS || '0x315ece6b7ea18ea207cfed077b0f332efe397cfc').toLowerCase();
    this.confirmations = parseInt(process.env.CONFIRMATIONS || '12');
    this.tolerance = parseFloat(process.env.TOLERANCE || '0.00005');
    this.minAlertAmount = parseFloat(process.env.MIN_ALERT_AMOUNT || '1.00');
    
    this.donationModel = pool ? new DonationModel() : new MemoryDonationModel();
    this.wsService = WebSocketService.getInstance();

    logger.info('BSC Service initialized', {
      providerType: wssUrl ? 'WebSocket' : 'HTTP',
      usdtAddress,
      receiveAddress: this.receiveAddress,
      confirmations: this.confirmations,
      tolerance: this.tolerance,
      minAlertAmount: this.minAlertAmount
    });
  }

  async startListening(): Promise<void> {
    if (this.isListening) {
      logger.warn('BSC listener already running');
      return;
    }

    try {
      const network = await this.provider.getNetwork();
      logger.info(`Connected to BSC network: ${network.name} (${network.chainId})`);

      const currentBlock = await this.provider.getBlockNumber();
      logger.info(`Current BSC block: ${currentBlock}`);

      const filter = this.usdtContract.filters.Transfer?.(null, this.receiveAddress);
      
      if (filter) {
        this.usdtContract.on(filter, async (...args) => {
          const [from, to, value, event] = args;
          await this.onTransferInBlock(from, to, value, event);
        });
      }

      this.isListening = true;
      logger.info('BSC Transfer event listener started for address:', this.receiveAddress);

      this.startConfirmLoop();

    } catch (error) {
      logger.error('Failed to start BSC listener:', error);
      throw error;
    }
  }

  async stopListening(): Promise<void> {
    if (!this.isListening) {
      return;
    }

    this.usdtContract.removeAllListeners();
    this.isListening = false;
    logger.info('BSC Transfer event listener stopped');
  }

  private async onTransferInBlock(
    from: string, 
    to: string, 
    value: bigint, 
    event: any
  ): Promise<void> {
    try {
      if (to.toLowerCase() !== this.receiveAddress) {
        return;
      }

      const txHash = event.log.transactionHash;
      const blockNumber = event.log.blockNumber;
      const amount = parseFloat(ethers.formatUnits(value, 18));
      
      if (amount < this.minAlertAmount) {
        logger.debug('Amount below minimum alert threshold', { amount, minAmount: this.minAlertAmount });
        return;
      }

      logger.info('USDT Transfer detected in block', {
        from,
        to,
        amount,
        txHash,
        blockNumber
      });

      const donation = await this.donationModel.findPendingByAmount(amount, this.tolerance);
      
      if (!donation) {
        logger.warn(`No matching donation found for amount: ${amount}`, { txHash });
        return;
      }

      if (donation.status !== DonationStatus.PENDING) {
        logger.info(`Donation already processed: ${donation.id}`, { 
          currentStatus: donation.status,
          txHash 
        });
        return;
      }

      const updatedDonation = await this.donationModel.updateStatus(
        donation.id,
        DonationStatus.PENDING_SHOWN,
        { 
          txHash,
          firstBlock: blockNumber
        }
      );

      if (updatedDonation) {
        this.wsService.emitDonation({
          id: updatedDonation.id,
          nickname: updatedDonation.nickname || '匿名',
          amount: updatedDonation.payAmount,
          message: updatedDonation.message || '',
          method: 'BEP20'
        });

        logger.info(`Donation broadcasted immediately: ${donation.id}`, {
          donationId: donation.id,
          amount: updatedDonation.payAmount,
          txHash,
          blockNumber
        });
      }

    } catch (error) {
      logger.error('Error handling transfer in block:', error);
    }
  }

  private startConfirmLoop(): void {
    setInterval(async () => {
      try {
        const currentBlock = await this.provider.getBlockNumber();
        const donations = await this.donationModel.findShownNotConfirmed();

        for (const donation of donations) {
          if (donation.firstBlock && currentBlock - donation.firstBlock >= this.confirmations) {
            await this.donationModel.updateStatus(
              donation.id,
              DonationStatus.CONFIRMED
            );
            logger.info(`Donation confirmed: ${donation.id}`, {
              txHash: donation.txHash,
              confirmations: currentBlock - donation.firstBlock
            });
          }
        }
      } catch (error) {
        if (error instanceof Error && !error.message.includes('Database not available')) {
          logger.error('Error in confirm loop:', error);
        }
        // Silently ignore database errors in API-only mode
      }
    }, 15000); // Check every 15 seconds
  }

  async getBalance(): Promise<number> {
    try {
      const balance = await this.usdtContract.balanceOf?.(this.receiveAddress);
      if (!balance) return 0;
      return parseFloat(ethers.formatUnits(balance, 18));
    } catch (error) {
      logger.error('Error getting balance:', error);
      return 0;
    }
  }

  isConnected(): boolean {
    return this.isListening;
  }
}