import { Redis } from 'ioredis';
import { env } from './env.js';
import { logger } from '../utils/logger.js';
export const redisClient = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
});
redisClient.on('connect', () => {
    logger.info('Redis client connected successfully.');
});
redisClient.on('error', (error) => {
    logger.error(error, 'Redis error occurred');
});
