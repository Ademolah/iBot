import { Router, Response } from 'express';
import { protectTenantRoute, AuthenticatedRequest } from '../middleware/auth.js';
import { Tenant, BotInstance } from '../models/Tenant.js';
import { Product } from '../models/Product.js'; // 🌟 SURGICAL FIX: Loaded from its dedicated file definition
import { startBot } from '../bot/socket.js';
import { redisClient } from '../config/redis.js';
import { logger } from '../utils/logger.js';

const router = Router();

// ==========================================
// 1. UPDATE ALERT NOTIFICATION PHONE NUMBER
// ==========================================
router.patch('/alert-number', protectTenantRoute, async (req: AuthenticatedRequest, res: Response): Promise<any> => {
  try {
    const { alertPhoneNumber } = req.body;
    if (!alertPhoneNumber || alertPhoneNumber.length < 10) {
      return res.status(400).json({ status: 'error', message: 'Invalid phone number format provided.' });
    }

    // Isolate lookup strictly using the req.tenantId injected by middleware security checkpoints
    const updatedTenant = await Tenant.findByIdAndUpdate(
      req.tenantId,
      { alertPhoneNumber: alertPhoneNumber.replace(/\D/g, '') }, // Sanitize string data natively
      { new: true }
    ).select('-passwordHash');

    return res.status(200).json({
      status: 'success',
      message: 'Sales notification destination target number updated successfully.',
      data: { tenant: updatedTenant }
    });
  } catch (error) {
    return res.status(500).json({ status: 'error', message: 'Internal transaction dispatch failure.' });
  }
});

// ==========================================
// FETCH ALL ITEMS IN INVENTORY (For Table View)
// ==========================================
router.get('/inventory', protectTenantRoute, async (req: AuthenticatedRequest, res: Response): Promise<any> => {
  try {
    // 🌟 SECURITY MANDATE: Only fetch products belonging strictly to THIS logged-in user
    const products = await Product.find({ tenantId: req.tenantId }).sort({ createdAt: -1 });

    return res.status(200).json({
      status: 'success',
      data: products
    });
  } catch (error) {
    return res.status(500).json({ status: 'error', message: 'Failed to fetch inventory records safely.' });
  }
});


// ==========================================
// 2. ADD A NEW ITEM TO INVENTORY (Stock Catalog)
// ==========================================
router.post('/inventory', protectTenantRoute, async (req: AuthenticatedRequest, res: Response): Promise<any> => {
  try {
    // 🌟 UPGRADED PARAMETERS: Destructuring 'specs' to match your actual schema definition model
    const { name, brand, modelName, aliases, specs, price } = req.body;
    if (!name || !price || !brand || !modelName) {
      return res.status(400).json({ 
        status: 'error', 
        message: 'Product name, brand, modelName, and listing price values are required.' 
      });
    }

    // Force inject the tenantId into the constructor mapping parameters to protect multi-tenant borders
    const newProduct = new Product({
      tenantId: req.tenantId,
      name,
      brand,
      modelName,
      specs: Array.isArray(specs) ? specs.map(s => s.trim()) : [],
      aliases: Array.isArray(aliases) ? aliases.map(a => a.toLowerCase().trim()) : [],
      price,
      inStock: true
    });

    await newProduct.save();

    // ⚡ INVALIDATE REDIS INVENTORY CACHE: Forces the matcher engine to read fresh database updates on the next scan!
    await redisClient.del('inventory:in_stock');

    return res.status(201).json({
      status: 'success',
      message: 'Product listing added to inventory successfully.',
      data: { product: newProduct }
    });
  } catch (error) {
    logger.error({ error, tenantId: req.tenantId }, 'Failed to save product entity to database.');
    return res.status(500).json({ status: 'error', message: 'Failed to insert inventory record safely.' });
  }
});

// ==========================================
// 3. INITIALIZE / SPAWN WHATSAPP QR INSTANCE
// ==========================================
router.post('/bot/spawn', protectTenantRoute, async (req: AuthenticatedRequest, res: Response): Promise<any> => {
  try {
    const tenant = await Tenant.findById(req.tenantId);
    if (!tenant || tenant.subscriptionStatus !== 'ACTIVE') {
      return res.status(403).json({ status: 'error', message: 'Account context requires active status credentials to spawn channels.' });
    }

    const customSessionId = `session-tenant-${tenant._id}`;

    // 🌟 SURGICAL CACHE WIPE: Update or reset your BotInstance tracking collection records inside MongoDB
    let instance = await BotInstance.findOne({ tenantId: tenant._id });
    if (!instance) {
      instance = new BotInstance({
        tenantId: tenant._id,
        sessionId: customSessionId,
        connectionStatus: 'DISCONNECTED', // ⚡ Force tracking parameter out of "CONNECTED" loops
        qrCode: null
      });
    } else {
      // If the model entry rows already exist, wipe any stale connection status keys instantly!
      instance.connectionStatus = 'DISCONNECTED';
      instance.qrCode = null;
    }
    await instance.save();

    // 🌟 MULTI-TENANT FAILSAFE BUFFER: Also update your primary Tenant document layout fields 
    // to match, ensuring your status endpoint won't accidentally stream old configurations
    await Tenant.findByIdAndUpdate(tenant._id, {
      botStatus: 'DISCONNECTED',
      qrCode: null
    });

    logger.info(`🚀 [BOT RESET]: Stale database variables wiped clean. Spawning connection for: ${customSessionId}`);

    // Non-blocking invocation pattern: Spawns the socket process container loop asynchronously
    startBot(customSessionId, tenant.alertPhoneNumber).catch(err => {
      logger.error(err, `Asynchronous backend thread failed to start bot for session: ${customSessionId}`);
    });

    return res.status(202).json({
      status: 'success',
      message: 'WhatsApp core container service initialization sequence started completely.',
      data: {
        status: 'INITIALIZING',
        pollEndpoint: '/api/tenant/bot/status'
      }
    });
  } catch (error) {
    logger.error({ error }, 'Failed to initiate bot spawn transaction loop.');
    return res.status(500).json({ status: 'error', message: 'Failed to initiate dynamic allocation clusters.' });
  }
});


// ==========================================
// 4. FETCH CURRENT BOT QR / RECONCTION STATUS
// ==========================================
router.get('/bot/status', protectTenantRoute, async (req: AuthenticatedRequest, res: Response): Promise<any> => {
  try {
    const customSessionId = `session-tenant-${req.tenantId}`;
    
    // 🌟 THE SURGICAL DUAL-LOOKUP FALLBACK: Check for the multi-tenant key first.
    // If running in a local developer container and it returns empty, cross-check the fallback session!
    let instance = await BotInstance.findOne({ sessionId: customSessionId });
    
    if (!instance) {
      logger.info(`ℹ️ [STATUS CHECK MATCH]: Primary key missed. Re-indexing developer fallback tracker...`);
      instance = await BotInstance.findOne({ sessionId: 'vendor-bot-session' });
    }
    
    if (!instance) {
      return res.status(200).json({
        status: 'success',
        data: {
          connectionStatus: 'DISCONNECTED',
          qrCode: null
        }
      });
    }

    // Trace exactly what is being sent to your frontend dashboard
    logger.info(`📡 [POLL EMITTER]: Transmitting payload: Status=${instance.connectionStatus} | Has QR=${!!instance.lastQrCode}`);

    return res.status(200).json({
      status: 'success',
      data: {
        connectionStatus: instance.connectionStatus || 'DISCONNECTED',
        qrCode: instance.lastQrCode || null // Streams the live string straight to the React dashboard!
      }
    });
  } catch (error) {
    logger.error({ error }, 'Failed to look up bot status variables.');
    return res.status(500).json({ status: 'error', message: 'Failed to look up network runtime indicators.' });
  }
});



// ==========================================
// ❌ DELETE AN ITEM FROM INVENTORY
// ==========================================
router.delete('/inventory/:id', protectTenantRoute, async (req: AuthenticatedRequest, res: Response): Promise<any> => {
  try {
    const productId = req.params.id;

    // 🌟 SECURITY MANDATE: Only delete if the product strictly belongs to THIS logged-in user
    const deletedProduct = await Product.findOneAndDelete({
      _id: productId,
      tenantId: req.tenantId // Prevents cross-tenant data tampering
    });

    if (!deletedProduct) {
      return res.status(404).json({ 
        status: 'error', 
        message: 'Product not found or you do not have permission to delete it.' 
      });
    }

    logger.info(`🗑️ [INVENTORY DELETE]: Product ${deletedProduct.name} removed by tenant ${req.tenantId}`);

    // ⚡ INVALIDATE REDIS INVENTORY CACHE: Forces the matching engine to refresh its active stock list immediately
    await redisClient.del('inventory:in_stock');

    return res.status(200).json({
      status: 'success',
      message: 'Product removed from your stock successfully.'
    });
  } catch (error) {
    logger.error({ error, productId: req.params.id }, 'Failed to delete product from database.');
    return res.status(500).json({ status: 'error', message: 'Failed to delete inventory record safely.' });
  }
});


export default router;
