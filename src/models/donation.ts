import { pool } from '../database/connection';
import { 
  Donation, 
  DonationMethod, 
  DonationStatus, 
  CreateDonationRequest 
} from '../types/donation';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger';

export class DonationModel {
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
    
    const query = `
      INSERT INTO donations (
        id, status, base_amount, tail, pay_amount, nickname, message, expires_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `;

    const values = [
      id,
      DonationStatus.PENDING,
      baseAmount,
      tail,
      payAmount,
      data.nickname || null,
      data.message || null,
      expiresAt
    ];

    try {
      if (!pool) throw new Error('Database not available');
      const result = await pool.query(query, values);
      const donation = this.mapRowToDonation(result.rows[0]);
      logger.info(`Created donation: ${donation.id}`, { 
        donationId: donation.id, 
        payAmount: donation.payAmount,
        tail: donation.tail 
      });
      return donation;
    } catch (error) {
      logger.error('Failed to create donation:', error);
      throw new Error('Failed to create donation');
    }
  }

  async findById(id: string): Promise<Donation | null> {
    const query = 'SELECT * FROM donations WHERE id = $1';
    
    try {
      if (!pool) throw new Error('Database not available');
      if (!pool) throw new Error('Database not available');
      const result = await pool.query(query, [id]);
      if (result.rows.length === 0) {
        return null;
      }
      return this.mapRowToDonation(result.rows[0]);
    } catch (error) {
      logger.error(`Failed to find donation by id ${id}:`, error);
      throw new Error('Failed to find donation');
    }
  }

  async findPendingByAmount(amount: number, tolerance = 0.00005): Promise<Donation | null> {
    const now = new Date();
    const query = `
      SELECT * FROM donations 
      WHERE status = $1 
      AND expires_at > $2
      AND ABS(pay_amount - $3) <= $4
      ORDER BY created_at ASC
      LIMIT 1
    `;
    
    try {
      if (!pool) throw new Error('Database not available');
      const result = await pool.query(query, [DonationStatus.PENDING, now, amount, tolerance]);
      if (result.rows.length === 0) {
        return null;
      }
      return this.mapRowToDonation(result.rows[0]);
    } catch (error) {
      logger.error(`Failed to find donation by amount ${amount}:`, error);
      throw new Error('Failed to find donation');
    }
  }

  async updateStatus(
    id: string, 
    status: DonationStatus, 
    transactionData?: {
      txHash?: string;
      firstBlock?: number;
    }
  ): Promise<Donation | null> {
    let query = 'UPDATE donations SET status = $1, updated_at = CURRENT_TIMESTAMP';
    const values: any[] = [status];
    let paramCount = 1;

    if (transactionData) {
      if (transactionData.txHash) {
        query += `, tx_hash = $${++paramCount}`;
        values.push(transactionData.txHash);
      }
      if (transactionData.firstBlock) {
        query += `, first_block = $${++paramCount}`;
        values.push(transactionData.firstBlock);
      }
    }

    if (status === DonationStatus.CONFIRMED) {
      query += `, confirmed_at = CURRENT_TIMESTAMP`;
    }

    query += ` WHERE id = $${++paramCount} RETURNING *`;
    values.push(id);

    try {
      if (!pool) throw new Error('Database not available');
      const result = await pool.query(query, values);
      if (result.rows.length === 0) {
        return null;
      }
      const donation = this.mapRowToDonation(result.rows[0]);
      logger.info(`Updated donation status: ${donation.id} -> ${status}`, { 
        donationId: donation.id, 
        status,
        transactionData 
      });
      return donation;
    } catch (error) {
      logger.error(`Failed to update donation status ${id}:`, error);
      throw new Error('Failed to update donation status');
    }
  }

  async findShownNotConfirmed(): Promise<Donation[]> {
    const query = `
      SELECT * FROM donations 
      WHERE status = $1 
      AND first_block IS NOT NULL
      ORDER BY created_at ASC
    `;
    
    try {
      if (!pool) throw new Error('Database not available');
      const result = await pool.query(query, [DonationStatus.PENDING_SHOWN]);
      return result.rows.map(row => this.mapRowToDonation(row));
    } catch (error) {
      logger.error('Failed to find shown not confirmed donations:', error);
      throw new Error('Failed to find shown not confirmed donations');
    }
  }

  async findRecentDonations(limit = 50): Promise<Donation[]> {
    const query = `
      SELECT * FROM donations 
      WHERE status = $1
      ORDER BY created_at DESC 
      LIMIT $2
    `;
    
    try {
      if (!pool) throw new Error('Database not available');
      const result = await pool.query(query, [DonationStatus.CONFIRMED, limit]);
      return result.rows.map(row => this.mapRowToDonation(row));
    } catch (error) {
      logger.error('Failed to find recent donations:', error);
      throw new Error('Failed to find recent donations');
    }
  }


  async expireOldPending(): Promise<number> {
    const now = new Date();
    const query = `
      UPDATE donations 
      SET status = $1, updated_at = CURRENT_TIMESTAMP
      WHERE status = $2 
      AND expires_at < $3
    `;
    
    try {
      if (!pool) throw new Error('Database not available');
      const result = await pool.query(query, [DonationStatus.EXPIRED, DonationStatus.PENDING, now]);
      const expiredCount = result.rowCount || 0;
      if (expiredCount > 0) {
        logger.info(`Expired ${expiredCount} old pending donations`);
        // Release used tails
        this.usedTails.clear();
      }
      return expiredCount;
    } catch (error) {
      logger.error('Failed to expire old pending donations:', error);
      throw new Error('Failed to expire old pending donations');
    }
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

  private mapRowToDonation(row: any): Donation {
    return {
      id: row.id,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      method: DonationMethod.BSC,
      status: row.status as DonationStatus,
      baseAmount: parseFloat(row.base_amount),
      tail: parseFloat(row.tail),
      payAmount: parseFloat(row.pay_amount),
      nickname: row.nickname,
      message: row.message || '',
      txHash: row.tx_hash,
      firstBlock: row.first_block,
      confirmedAt: row.confirmed_at ? new Date(row.confirmed_at) : undefined,
      expiresAt: new Date(row.expires_at)
    };
  }
}