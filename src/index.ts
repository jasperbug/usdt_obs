import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createServer } from 'http';
import dotenv from 'dotenv';

import { logger } from './utils/logger';
import { database } from './database/connection';
import { WebSocketService } from './services/websocketService';
import { BSCService } from './services/bscService';
import { BinanceService } from './services/binanceService';
import { SchedulerService } from './services/schedulerService';
import apiRoutes from './routes';

// Load environment variables
dotenv.config();

const app = express();
const server = createServer(app);
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.socket.io"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "wss:", "ws:", "http:", "https:"],
    },
  },
  crossOriginEmbedderPolicy: false
}));

// CORS configuration
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://your-domain.com'] // TODO: Configure for production
    : true,
  credentials: true
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging middleware
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    method: req.method,
    url: req.url
  });
  next();
});

// API routes
app.use('/api', apiRoutes);

// OBS routes (direct access)
app.use('/obs', require('./routes/obs').default);

// Health check endpoint
app.get('/healthz', (req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: '1.0.0',
    environment: process.env.NODE_ENV,
    websocket: {
      connected: WebSocketService.getInstance().getConnectedClients()
    }
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Not Found',
    message: `Route ${req.method} ${req.originalUrl} not found`
  });
});

// Global error handler
app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Unhandled error:', err);
  
  res.status(err.status || 500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' 
      ? 'Internal Server Error' 
      : err.message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(async () => {
    await database.close();
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  server.close(async () => {
    await database.close();
    process.exit(0);
  });
});

// Start server
async function startServer() {
  try {
    // Test database connection
    const dbConnected = await database.testConnection();
    if (!dbConnected) {
      logger.warn('Database connection failed, but continuing in API-only mode');
    }

    // Initialize WebSocket service
    const wsService = WebSocketService.getInstance();
    wsService.initialize(server);

    // Start server FIRST
    server.listen(Number(PORT), '0.0.0.0', () => {
      logger.info(`🚀 USDT OBS API server running on port ${PORT}`, {
        port: PORT,
        host: '0.0.0.0',
        environment: process.env.NODE_ENV,
        nodeVersion: process.version
      });
    });

    // Initialize services AFTER server starts
    setTimeout(async () => {
      try {
        // Initialize BSC service
        const bscService = new BSCService();
        await bscService.startListening();

        // Initialize Binance service
        const binanceService = new BinanceService();
        if (await binanceService.testConnection()) {
          await binanceService.startMonitoring();
          logger.info('Binance monitoring service started');
        } else {
          logger.warn('Binance service connection failed, running in BSC-only mode');
        }

        // Start scheduler service
        const schedulerService = new SchedulerService();
        schedulerService.start();

        logger.info('All services initialized successfully');
      } catch (error) {
        logger.error('Error initializing services:', error);
      }
    }, 2000);

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

startServer();