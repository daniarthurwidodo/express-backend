import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.routes';
import { auth } from './config/auth.config';
import logger from './config/logger.config';
import requestLogger from './middleware/logger.middleware';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(requestLogger);

// Better-auth handler - mount before other routes
app.use('/api/auth', auth.handler);

// Routes
app.use('/api/auth', authRoutes);

app.get('/', (_req: Request, res: Response) => {
  res.json({ message: 'Hello from Express + TypeScript + Bun!' });
});

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
const server = app.listen(PORT, async () => {
  logger.info({ port: PORT }, `Server is running on http://localhost:${PORT}`);
  
  // Initialize database connection
  try {
    const { getConnectionManager } = await import('./config/database');
    const connectionManager = getConnectionManager();
    const result = await connectionManager.initializeConnection();
    
    if (result.success) {
      logger.info('Database connected successfully');
    } else {
      logger.error({ error: result.message }, 'Database connection failed');
    }
  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : error }, 'Database connection failed');
  }
});

// Graceful shutdown handler
const gracefulShutdown = async (signal: string) => {
  logger.info({ signal }, 'Starting graceful shutdown');
  
  // Stop accepting new connections
  server.close(async () => {
    logger.info('HTTP server closed');
    
    try {
      // Close database connections
      const { disconnectDatabase } = await import('./config/database');
      await disconnectDatabase();
      logger.info('Database connections closed');
      
      logger.info('Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      logger.error({ error }, 'Error during shutdown');
      process.exit(1);
    }
  });
  
  // Force shutdown after timeout
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000); // 10 second timeout
};

// Register shutdown handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
