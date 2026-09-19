import mongoose from 'mongoose';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

export const connectMongo = async (): Promise<void> => {
  try {
    await mongoose.connect(env.MONGO_URI);
    logger.info('MongoDB connected successfully.');
  } catch (error) {
    logger.error(error, 'Redis error occurred');
    process.exit(1);
  }
};