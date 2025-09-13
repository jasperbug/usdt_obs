import { 
  Donation, 
  DonationMethod, 
  DonationStatus, 
  CreateDonationRequest 
} from '../types/donation';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';

// 記憶體中的捐款存儲（用於測試和無數據庫模式）
const donationStore: Map<string, Donation> = new Map();

export class MemoryDonationModel {
  private readonly MIN_ALERT_AMOUNT = parseFloat(process.env.MIN_ALERT_AMOUNT || '1.00');
  private readonly TIME_WINDOW_MIN = parseInt(process.env.TIME_WINDOW_MIN || '30');
  private usedTails = new Set<number>();

  async create(data: CreateDonationRequest): Promise<Donation> {
    if (data.amount < this.MIN_ALERT_AMOUNT) {
      throw new Error(`Amount must be at least ${this.MIN_ALERT_AMOUNT} USDT`);
    }

    const id = uuidv4();
    const tail = this.generateTail();
    const baseAmount = data.amount;
    const payAmount = baseAmount + tail;
    const expiresAt = new Date(Date.now() + this.TIME_WINDOW_MIN * 60 * 1000);
    const now = new Date();
    
    const donation: Donation = {
      id,
      createdAt: now,
      updatedAt: now,
      method: DonationMethod.BSC,
      status: DonationStatus.PENDING,
      baseAmount,
      tail,
      payAmount,
      nickname: data.nickname,
      message: data.message,
      expiresAt
    };

    donationStore.set(id, donation);
    logger.info(`Created donation in memory: ${donation.id}`, { 
      donationId: donation.id, 
      payAmount: donation.payAmount,
      tail: donation.tail 
    });
    
    return donation;
  }

  async findById(id: string): Promise<Donation | null> {
    const donation = donationStore.get(id);
    return donation || null;
  }

  async findPendingByAmount(amount: number, tolerance = 0.00005): Promise<Donation | null> {
    const now = new Date();
    
    for (const donation of donationStore.values()) {
      if (donation.status === DonationStatus.PENDING 
          && donation.expiresAt > now
          && Math.abs(donation.payAmount - amount) <= tolerance) {
        return donation;
      }
    }
    
    return null;
  }

  async updateStatus(
    id: string, 
    status: DonationStatus, 
    transactionData?: {
      txHash?: string;
      firstBlock?: number;
    }
  ): Promise<Donation | null> {
    const donation = donationStore.get(id);
    if (!donation) return null;

    donation.status = status;
    donation.updatedAt = new Date();
    
    if (transactionData) {
      if (transactionData.txHash) {
        donation.txHash = transactionData.txHash;
      }
      if (transactionData.firstBlock) {
        donation.firstBlock = transactionData.firstBlock;
      }
    }

    if (status === DonationStatus.CONFIRMED) {
      donation.confirmedAt = new Date();
    }
    
    donationStore.set(id, donation);
    logger.info(`Updated donation status: ${id} -> ${status}`, { 
      donationId: donation.id, 
      status,
      transactionData 
    });
    
    return donation;
  }

  async findShownNotConfirmed(): Promise<Donation[]> {
    return Array.from(donationStore.values())
      .filter(d => d.status === DonationStatus.PENDING_SHOWN && d.firstBlock !== undefined);
  }

  async findRecentDonations(limit = 50): Promise<Donation[]> {
    return Array.from(donationStore.values())
      .filter(d => d.status === DonationStatus.CONFIRMED)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  async expireOldPending(): Promise<number> {
    const now = new Date();
    let expiredCount = 0;
    
    for (const donation of donationStore.values()) {
      if (donation.status === DonationStatus.PENDING && donation.expiresAt < now) {
        donation.status = DonationStatus.EXPIRED;
        donation.updatedAt = now;
        donationStore.set(donation.id, donation);
        expiredCount++;
      }
    }
    
    if (expiredCount > 0) {
      logger.info(`Expired ${expiredCount} old pending donations in memory`);
      // Release used tails
      this.usedTails.clear();
    }
    
    return expiredCount;
  }

  private generateTail(): number {
    let tail: number;
    let attempts = 0;
    const maxAttempts = 1000;
    
    do {
      const randomNum = Math.floor(Math.random() * 9999) + 1; // 0001-9999
      tail = randomNum / 1000000; // 0.000001-0.009999
      attempts++;
      
      if (attempts > maxAttempts) {
        this.usedTails.clear();
        logger.warn('Cleared used tails cache due to exhaustion');
      }
    } while (this.usedTails.has(tail) && attempts <= maxAttempts);
    
    this.usedTails.add(tail);
    return tail;
  }
}