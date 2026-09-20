import Fuse from 'fuse.js';
import { Product, IProduct } from '../models/Product.js';
import { redisClient } from '../config/redis.js'; // 🌟 Import your working Redis client
import { logger } from '../utils/logger.js';

const CACHE_KEY = 'inventory:in_stock';
const CACHE_TTL = 300; // Cache inventory for 5 minutes (300 seconds)

export const findMatchingGadget = async (messageText: string): Promise<IProduct | null> => {
  try {
    let availableProducts: IProduct[] = [];

    // 1. ⚡ OPTIMIZATION LAYER: Attempt to read inventory out of the superfast Redis memory cache
    const cachedInventory = await redisClient.get(CACHE_KEY);

    if (cachedInventory) {
      availableProducts = JSON.parse(cachedInventory);
    } else {
      // 2. DATABASE FALLBACK: If cache is empty, query MongoDB (Cache Miss)
      availableProducts = await Product.find({ inStock: true }).lean();
      
      // Save results to Redis memory with an automatic 5-minute expiration time
      if (availableProducts.length > 0) {
        await redisClient.set(CACHE_KEY, JSON.stringify(availableProducts), 'EX', CACHE_TTL);
      }
    }
    
    if (availableProducts.length === 0) return null;

    // 3. FUZZY MATCH ENGINE: Run Fuse.js array scoring mechanics
    const fuse = new Fuse(availableProducts, {
      keys: ['name', 'aliases', 'modelName'],
      threshold: 0.3, // Allows minor conversational typos naturally
      ignoreLocation: true,
      includeScore: true,
    });

    // 4. Search the catalog using the conversational text frame
    const results = fuse.search(messageText);

    // 5. Return the absolute highest scoring asset match
    if (results.length > 0 && results[0].item) {
      return results[0].item as IProduct;
    }

    return null;
  } catch (error) {
    logger.error({ error }, 'Error in commercial gadget matcher service pipeline');
    return null;
  }
};
