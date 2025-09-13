import { Pool, PoolConfig } from 'pg';
import { logger } from '../utils/logger';

interface DatabaseConfig extends PoolConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
}

class Database {
  private pool?: Pool;

  constructor() {
    // 檢查是否有資料庫設定
    if (!process.env.DB_HOST && !process.env.DATABASE_URL) {
      logger.warn('Database not configured, running in API-only mode');
      return;
    }

    const config: DatabaseConfig = {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      database: process.env.DB_NAME || 'usdt_obs',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASS || '',
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    };

    this.pool = new Pool(config);
    
    this.pool.on('error', (err) => {
      logger.error('Unexpected error on idle client', err);
    });

    this.pool.on('connect', () => {
      logger.info('New client connected to database');
    });

    this.pool.on('remove', () => {
      logger.info('Client removed from database pool');
    });
  }

  async testConnection(): Promise<boolean> {
    if (!this.pool) {
      logger.warn('Database not configured, skipping connection test');
      return true; // 返回 true 讓服務繼續啟動
    }

    try {
      const client = await this.pool.connect();
      await client.query('SELECT NOW()');
      client.release();
      logger.info('Database connection test successful');
      return true;
    } catch (error) {
      logger.error('Database connection test failed:', error);
      return false;
    }
  }

  getPool(): Pool | null {
    return this.pool ?? null;
  }

  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      logger.info('Database connection pool closed');
    }
  }
}

export const database = new Database();
export const pool = database.getPool();