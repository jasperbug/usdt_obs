import { Server as SocketIOServer } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { WebSocketDonationEvent } from '../types/donation';
import { logger } from '../utils/logger';

export class WebSocketService {
  private static instance: WebSocketService;
  private io: SocketIOServer | null = null;

  private constructor() {}

  static getInstance(): WebSocketService {
    if (!WebSocketService.instance) {
      WebSocketService.instance = new WebSocketService();
    }
    return WebSocketService.instance;
  }

  initialize(server: HTTPServer): void {
    this.io = new SocketIOServer(server, {
      cors: {
        origin: "*", // TODO: Configure for production
        methods: ["GET", "POST"]
      },
      transports: ['websocket', 'polling']
    });

    this.io.on('connection', (socket) => {
      logger.info(`WebSocket client connected: ${socket.id}`, { 
        clientId: socket.id,
        ip: socket.handshake.address 
      });

      socket.on('disconnect', (reason) => {
        logger.info(`WebSocket client disconnected: ${socket.id}`, { 
          clientId: socket.id,
          reason 
        });
      });

      socket.on('join_room', (room: string) => {
        if (room === 'obs') {
          socket.join('obs');
          logger.info(`Client ${socket.id} joined OBS room`);
          socket.emit('joined', { room: 'obs' });
        }
      });

      // Send ping to keep connection alive
      const pingInterval = setInterval(() => {
        socket.emit('ping', { timestamp: Date.now() });
      }, 30000);

      socket.on('disconnect', () => {
        clearInterval(pingInterval);
      });

      // Initial connection acknowledgment
      socket.emit('connected', { 
        message: 'Connected to USDT OBS donation system',
        timestamp: Date.now()
      });
    });

    logger.info('WebSocket service initialized');
  }

  emitDonation(donation: WebSocketDonationEvent): void {
    if (!this.io) {
      logger.error('WebSocket service not initialized');
      return;
    }

    const event = {
      type: 'donation',
      data: donation,
      timestamp: Date.now()
    };

    // Emit to OBS room
    this.io.to('obs').emit('donation', event);
    
    // Also emit to all connected clients
    this.io.emit('new_donation', event);

    logger.info(`Emitted donation event: ${donation.id}`, {
      donationId: donation.id,
      nickname: donation.nickname,
      amount: donation.amount,
      connectedClients: this.io.engine.clientsCount
    });
  }

  getConnectedClients(): number {
    return this.io?.engine.clientsCount || 0;
  }

  emitSystemMessage(message: string, data?: any): void {
    if (!this.io) return;

    this.io.emit('system_message', {
      message,
      data,
      timestamp: Date.now()
    });

    logger.info('Emitted system message', { message, data });
  }
}