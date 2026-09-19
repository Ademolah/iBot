import Fuse from 'fuse.js';
import { Product, IProduct } from '../models/Product.js';
import { logger } from '../utils/logger.js';

export const findMatchingGadget = async (messageText: string): Promise<IProduct | null> => {
  try {
    // 1. Fetch only in-stock products
    const availableProducts = await Product.find({ inStock: true }).lean();
    
    if (availableProducts.length === 0) return null;

    // 2. Configure Fuse.js for fuzzy matching against product names and aliases
    const fuse = new Fuse(availableProducts, {
      keys: ['name', 'aliases', 'modelName'],
      threshold: 0.3, // 0.0 is perfect match, 1.0 is anything. 0.3 allows slight typos
      ignoreLocation: true,
      includeScore: true,
    });

    // 3. Search the inventory using the raw message text
    const results = fuse.search(messageText);

    // 4. Return the best match if one exists
    if (results.length > 0 && results[0].item) {
      return results[0].item as IProduct;
    }

    return null;
  } catch (error) {
    logger.error({ error }, 'Error in gadget matcher service');
    return null;
  }
};