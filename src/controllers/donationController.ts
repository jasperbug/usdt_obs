import { Request, Response } from 'express';
import { DonationModel } from '../models/donation';
import { MemoryDonationModel } from '../models/memoryDonation';
import { pool } from '../database/connection';
import { 
  validateRequest, 
  createDonationSchema, 
  getDonationSchema
} from '../utils/validation';
import { 
  CreateDonationRequest, 
  DonationResponse,
  DonationStatus
} from '../types/donation';
import { logger } from '../utils/logger';

export class DonationController {
  private donationModel: DonationModel | MemoryDonationModel;

  constructor() {
    // 如果沒有數據庫連接，使用記憶體版本
    this.donationModel = pool ? new DonationModel() : new MemoryDonationModel();
  }

  async createDonation(req: Request, res: Response): Promise<void> {
    try {
      const { error, value } = validateRequest(createDonationSchema, req.body);
      
      if (error) {
        res.status(400).json({ 
          success: false, 
          error: 'Validation failed', 
          details: error 
        });
        return;
      }

      const donationData = value as CreateDonationRequest;
      const donation = await this.donationModel.create(donationData);

      const response: DonationResponse = {
        id: donation.id,
        payAmount: donation.payAmount,
        address: process.env.RECEIVE_ADDRESS || '0x315ece6b7ea18ea207cfed077b0f332efe397cfc',
        expiresAt: donation.expiresAt
      };

      res.status(201).json({
        success: true,
        data: response
      });

      logger.info(`Created donation: ${donation.id}`, {
        donationId: donation.id,
        payAmount: donation.payAmount,
        tail: donation.tail,
        expiresAt: donation.expiresAt
      });

    } catch (error) {
      logger.error('Failed to create donation:', error);
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      });
    }
  }

  async getDonation(req: Request, res: Response): Promise<void> {
    try {
      const { error, value } = validateRequest(getDonationSchema, req.params);
      
      if (error) {
        res.status(400).json({ 
          success: false, 
          error: 'Invalid donation ID' 
        });
        return;
      }

      const { id } = value as { id: string };
      const donation = await this.donationModel.findById(id);

      if (!donation) {
        res.status(404).json({
          success: false,
          error: 'Donation not found'
        });
        return;
      }

      res.json({
        success: true,
        data: {
          id: donation.id,
          status: donation.status,
          payAmount: donation.payAmount,
          address: process.env.RECEIVE_ADDRESS || '0x315ece6b7ea18ea207cfed077b0f332efe397cfc',
          nickname: donation.nickname,
          message: donation.message,
          expiresAt: donation.expiresAt,
          txHash: donation.txHash,
          confirmedAt: donation.confirmedAt
        }
      });

    } catch (error) {
      logger.error('Failed to get donation:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  async getRecentDonations(req: Request, res: Response): Promise<void> {
    try {
      const limit = parseInt(req.query.limit as string) || 20;
      const donations = await this.donationModel.findRecentDonations(Math.min(limit, 100));

      res.json({
        success: true,
        data: donations.map((donation: any) => ({
          id: donation.id,
          amount: donation.amount,
          nickname: donation.nickname,
          message: donation.message,
          createdAt: donation.createdAt,
          method: donation.method
        }))
      });

    } catch (error) {
      logger.error('Failed to get recent donations:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }


  // Admin function for testing - manually update donation status
  async updateDonationStatus(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { status } = req.body;

      if (!id) {
        res.status(400).json({
          success: false,
          error: 'Donation ID is required'
        });
        return;
      }

      if (!['PAID', 'FAILED', 'EXPIRED'].includes(status)) {
        res.status(400).json({
          success: false,
          error: 'Invalid status. Must be PAID, FAILED, or EXPIRED'
        });
        return;
      }

      const updatedDonation = await this.donationModel.updateStatus(id, status as DonationStatus);
      
      if (!updatedDonation) {
        res.status(404).json({
          success: false,
          error: 'Donation not found'
        });
        return;
      }

      // If status is PAID, trigger WebSocket notification
      if (status === 'PAID') {
        const WebSocketService = require('../services/websocketService').WebSocketService;
        const wsService = WebSocketService.getInstance();
        
        wsService.emitDonation({
          id: updatedDonation.id,
          nickname: updatedDonation.nickname || '匿名',
          message: updatedDonation.message || '',
          amount: updatedDonation.payAmount,
          method: 'BEP20'
        });
      }

      res.json({
        success: true,
        data: updatedDonation,
        message: `Donation status updated to ${status}`
      });

    } catch (error) {
      logger.error('Failed to update donation status:', error);
      res.status(500).json({
        success: false,
        error: 'Internal server error'
      });
    }
  }

  async getHealthCheck(_req: Request, res: Response): Promise<void> {
    res.json({
      success: true,
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    });
  }
}