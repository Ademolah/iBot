import Fuse from 'fuse.js';
import { Product, IProduct } from '../models/Product.js';
import { redisClient } from '../config/redis.js';
import { logger } from '../utils/logger.js';

const CACHE_KEY = 'inventory:in_stock';
const CACHE_TTL = 300; // 5 minutes

export const findMatchingGadget = async (messageText: string): Promise<IProduct | null> => {
  try {
    let availableProducts: IProduct[] = [];

    // 1. Read from Redis Cache Layer
    const cachedInventory = await redisClient.get(CACHE_KEY);

    if (cachedInventory) {
      availableProducts = JSON.parse(cachedInventory);
      logger.info(`💾 [MATCHER CACHE]: Pulled ${availableProducts.length} items successfully from Redis memory.`);
    } else {
      // 2. Fetch from MongoDB on Cache Miss
      logger.info('⚠️ [MATCHER CACHE MISS]: Querying MongoDB for available inventory items...');
      availableProducts = await Product.find({ inStock: true }).lean().exec();
      
      logger.info(`📦 [MATCHER DB FETCH]: MongoDB returned ${availableProducts.length} items matching { inStock: true }.`);
      
      if (availableProducts.length > 0) {
        await redisClient.set(CACHE_KEY, JSON.stringify(availableProducts), 'EX', CACHE_TTL);
      }
    }
    
    if (availableProducts.length === 0) {
      logger.warn('❌ [MATCHER ENGINE]: Aborting search. Zero products found with { inStock: true }.');
      return null;
    }

    const lowerMessage = messageText.toLowerCase().trim();

    // 3. 🌟 PHASE 1: DIRECT KEYWORD INTERSECTION CHANNEL (Bulletproof for Group Chats)
    // Loop through stock items and check if the conversational sentence directly contains their identifiers
    for (const product of availableProducts) {
      // Check Name
      if (product.name && lowerMessage.includes(product.name.toLowerCase())) {
        logger.info(`🎯 [DIRECT MATCH - NAME]: Found exact match in text string for: ${product.name}`);
        return product;
      }
      // Check Model Name
      if (product.modelName && lowerMessage.includes(product.modelName.toLowerCase())) {
        logger.info(`🎯 [DIRECT MATCH - MODEL]: Found exact match in text string for: ${product.modelName}`);
        return product;
      }
      // Check Aliases Array
      if (product.aliases && Array.isArray(product.aliases)) {
        for (const alias of product.aliases) {
          if (alias && lowerMessage.includes(alias.toLowerCase())) {
            logger.info(`🎯 [DIRECT MATCH - ALIAS]: Intercepted alias match ("${alias}") inside text for: ${product.name}`);
            return product;
          }
        }
      }
    }

    // 4. 🔥 PHASE 2: FALLBACK FUZZY MATCH ENGINE (Only runs if direct checks miss, to handle typos)
    logger.info('ℹ️ [MATCHER FALLBACK]: Direct keyword match missed. Invoking back-up fuzzy parsing mechanics...');
    
    const fuse = new Fuse(availableProducts, {
      keys: ['name', 'aliases', 'modelName'],
      threshold: 0.6,
      ignoreLocation: true,
      includeScore: true,
    });

    const results = fuse.search(lowerMessage);

    if (results.length > 0 && results[0].item) {
      const bestMatch = results[0].item as IProduct;
      logger.info(`🎯 [FUZZY MATCH SUCCESS]: Fallback match triggered: ${bestMatch.name}`);
      return bestMatch;
    }

    logger.info('Exchange scanning complete. No matches found across catalog lists.');
    return null;
  } catch (error) {
    logger.error({ error }, 'Critical failure encountered inside the findMatchingGadget service pipeline');
    return null;
  }
};
