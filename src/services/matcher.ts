import Fuse from 'fuse.js';
import { Product, IProduct } from '../models/Product.js';
import { redisClient } from '../config/redis.js';
import { logger } from '../utils/logger.js';

// 🌟 DYNAMIC GENERATOR: Returns an isolated key unique to this subscriber
const getCacheKey = (tenantId: string) => `inventory:tenant:${tenantId}:in_stock`;
const CACHE_TTL = 300; // 5 minutes

export const findMatchingGadget = async (messageText: string, tenantId?: string): Promise<IProduct | null> => {
  try {
    if (!tenantId) {
      logger.warn('⚠️ [MATCHER ENGINE]: Aborting search. Execution frame missing explicit tenantId parameter.');
      return null;
    }

    let availableProducts: IProduct[] = [];
    const targetCacheKey = getCacheKey(tenantId);

    // 1. Read from ISOLATED Redis Cache Layer
    const cachedInventory = await redisClient.get(targetCacheKey);

    if (cachedInventory) {
      availableProducts = JSON.parse(cachedInventory);
      logger.info(`💾 [MATCHER CACHE]: Pulled ${availableProducts.length} items successfully for tenant: ${tenantId}`);
    } else {
      // 2. Fetch from MongoDB on Cache Miss - 🌟 RE-ENGINEERED TO FILTER OUT LEGACY SYSTEM DATA ENTRIES
      logger.info(`⚠️ [MATCHER CACHE MISS]: Querying MongoDB for tenant catalog: ${tenantId}`);
      
      // Enforces strict tenant mapping bounds. Any document without a matching tenantId is dropped.
      availableProducts = await Product.find({ 
        tenantId: tenantId, 
        inStock: true 
      }).lean().exec();
      
      logger.info(`📦 [MATCHER DB FETCH]: MongoDB returned ${availableProducts.length} items matching this active tenant.`);
      
      if (availableProducts.length > 0) {
        await redisClient.set(targetCacheKey, JSON.stringify(availableProducts), 'EX', CACHE_TTL);
      }
    }
    
    if (availableProducts.length === 0) {
      return null;
    }

    const lowerMessage = messageText.toLowerCase().trim();

    // 3. 🌟 PHASE 1: DIRECT KEYWORD INTERSECTION CHANNEL (Hardened Multi-Token Security)
    for (const product of availableProducts) {
      // A: Verify via Aliases Array (The most reliable conversational anchor)
      if (product.aliases && Array.isArray(product.aliases)) {
        for (const alias of product.aliases) {
          if (alias && lowerMessage.includes(alias.toLowerCase())) {
            logger.info(`🎯 [DIRECT MATCH - ALIAS]: Intercepted alias match ("${alias}") inside text for: ${product.name}`);
            return product as IProduct;
          }
        }
      }

      // B: Hardened Name Check using Multi-Token Tokenization
      if (product.name) {
        const tokens = product.name.toLowerCase().split(/\s+/).filter(t => t.length > 1);
        const specificTokens = tokens.filter(t => !['pro', 'max', 'plus', 'ultra', 'for', 'sell', 'air'].includes(t));
        
        if (specificTokens.length > 0) {
          const matchesAllTokens = specificTokens.every(token => lowerMessage.includes(token));
          if (matchesAllTokens) {
            logger.info(`🎯 [DIRECT MATCH - HIGH DENSITY TOKEN]: Passed verification check for: ${product.name}`);
            return product as IProduct;
          }
        }
      }
    }

    // 4. 🔥 PHASE 2: FALLBACK FUZZY MATCH ENGINE (Tight thresholds)
    const fuse = new Fuse(availableProducts, {
      keys: [
        { name: 'aliases', weight: 0.7 },
        { name: 'name', weight: 0.3 }
      ],
      threshold: 0.35, // Tightened further to ensure broad text blocks get discarded cleanly
      ignoreLocation: true,
      includeScore: true,
    });

    const results = fuse.search(lowerMessage);

    if (results.length > 0 && results[0].item) {
      const bestMatch = results[0].item as IProduct;
      logger.info(`🎯 [FUZZY MATCH SUCCESS]: Fallback match triggered: ${bestMatch.name}`);
      return bestMatch;
    }

    return null;
  } catch (error) {
    logger.error({ error }, 'Critical failure encountered inside the findMatchingGadget service pipeline');
    return null;
  }
};
