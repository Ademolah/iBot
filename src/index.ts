import { connectMongo } from './config/mongo.js';
import { redisClient } from './config/redis.js';
import { startBot } from './bot/socket.js';
import { logger } from './utils/logger.js';
import { TenantSession } from './models/TenantSession.js'; // 🌟 Import your new dynamic session schema

const bootstrap = async () => {
  try {
    logger.info('Starting Smart Vendor Bot Services...');

    // 1. Boot databases
    await connectMongo();
    logger.info('Redis client initialized. Fetching active subscriptions...');

    // 2. COMMERCIAL MULTI-TENANT ENGINE: Fetch all active paying subscribers out of MongoDB
    const activeTenants = await TenantSession.find({ isActive: true });

    if (activeTenants.length > 0) {
      logger.info(`🚀 [SaaS CLUSTER]: Found ${activeTenants.length} active bot instances. Spawning infrastructure channels...`);
      
      // Concurrently boot each subscriber's bot cluster safely
      await Promise.all(
        activeTenants.map(async (tenant) => {
          try {
            await startBot(tenant.whatsappSessionId, tenant.alertPhoneNumber);
          } catch (tenantError) {
            logger.error(
              { tenantError, sessionId: tenant.whatsappSessionId }, 
              `Failed to spawn isolated cluster instance for user session: ${tenant.whatsappSessionId}`
            );
          }
        })
      );
    } else {
      // 3. DEVELOPMENT FALLBACK: If zero SaaS tenants are configured, fallback to your default local setup
      logger.info('ℹ️ [LOCAL STANDALONE]: No commercial tenants found in the database. Spawning default system container...');
      await startBot();
    }

  } catch (error) {
    logger.fatal({ error }, 'Failed to bootstrap application safely.');
    process.exit(1);
  }
};

// Handle process termination gracefully
process.on('SIGINT', async () => {
  logger.info('Shutting down gracefully...');
  try {
    await redisClient.quit();
  } catch (err) {
    logger.error({ err }, 'Error closing connection on terminal exit');
  }
  process.exit(0);
});

bootstrap();
