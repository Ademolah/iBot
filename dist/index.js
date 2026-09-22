import http from 'http';
import app from './app.js';
import { connectMongo } from './config/mongo.js';
import { redisClient } from './config/redis.js';
import { startBot } from './bot/socket.js';
import { logger } from './utils/logger.js';
import { TenantSession } from './models/TenantSession.js';
import { env } from './config/env.js';
const bootstrap = async () => {
    try {
        logger.info('Starting Smart Vendor Bot Services...');
        await connectMongo();
        logger.info('Redis client initialized. Fetching active subscriptions...');
        const activeTenants = await TenantSession.find({ isActive: true });
        if (activeTenants.length > 0) {
            logger.info(`🚀 [SaaS CLUSTER]: Found ${activeTenants.length} active bot instances. Spawning infrastructure channels...`);
            await Promise.all(activeTenants.map(async (tenant) => {
                try {
                    await startBot(tenant.whatsappSessionId, tenant.alertPhoneNumber);
                }
                catch (tenantError) {
                    logger.error({ tenantError, sessionId: tenant.whatsappSessionId }, `Failed to spawn isolated cluster instance for user session: ${tenant.whatsappSessionId}`);
                }
            }));
        }
        else {
            logger.info('ℹ️ [LOCAL STANDALONE]: No commercial tenants found in the database. Spawning default system container...');
            await startBot();
        }
        const server = http.createServer(app);
        const PORT = env.PORT || '3000';
        server.listen(PORT, () => {
            logger.info(`⚡ [SERVER RUNNING]: Enterprise REST API Engine successfully live on port ${PORT} 🚀`);
        });
    }
    catch (error) {
        logger.fatal({ error }, 'Failed to bootstrap application safely.');
        process.exit(1);
    }
};
process.on('SIGINT', async () => {
    logger.info('Shutting down gracefully...');
    try {
        await redisClient.quit();
    }
    catch (err) {
        logger.error({ err }, 'Error closing connection on terminal exit');
    }
    process.exit(0);
});
bootstrap();
