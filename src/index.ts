import { connectMongo } from './config/mongo.js';
import { redisClient } from './config/redis.js';
import { startBot } from './bot/socket.js';
import { logger } from './utils/logger.js';

const bootstrap = async () => {
  try {
    logger.info('Starting Smart Vendor Bot Services...');

    // 1. Boot databases
    await connectMongo();
    
    // 2. SURGICAL FIX: Removed the stalled redisClient.status !== 'ready' promise block
    logger.info('Redis client initialized. Launching socket channel...');
    
    // 3. Start the WhatsApp Web socket cleanly
    await startBot();

  } catch (error) {
    logger.fatal({ error }, 'Failed to bootstrap application.');
    process.exit(1);
  }
};

// Handle process termination gracefully
process.on('SIGINT', async () => {
  logger.info('Shutting down gracefully...');
  await redisClient.quit();
  process.exit(0);
});

bootstrap();
