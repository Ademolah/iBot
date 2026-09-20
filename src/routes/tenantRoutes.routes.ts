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

    // Upsert the tracking metrics token document safely inside MongoDB
    let instance = await BotInstance.findOne({ tenantId: tenant._id });
    if (!instance) {
      instance = new BotInstance({
        tenantId: tenant._id,
        sessionId: customSessionId,
        connectionStatus: 'DISCONNECTED'
      });
      await instance.save();
    }

    // Non-blocking invocation pattern: Spawns the socket process container loop asynchronously 
    // inside your server clusters without blocking the standard dashboard HTTP client thread
    startBot(customSessionId, tenant.alertPhoneNumber).catch(err => {
      logger.error(err, `Asynchronous backend thread failed to start bot for session: ${customSessionId}`);
    });

    return res.status(202).json({
      status: 'success',
      message: 'WhatsApp core container service initialization sequence started completely.',
      data: {
        status: 'INITIALIZING',
        pollEndpoint: '/api/tenant/bot/status' // Tells the frontend UI where to poll for state updates
      }
    });
  } catch (error) {
    return res.status(500).json({ status: 'error', message: 'Failed to initiate dynamic allocation clusters.' });
  }
});

// ==========================================
// 4. FETCH CURRENT BOT QR / RECONCTION STATUS
// ==========================================
router.get('/bot/status', protectTenantRoute, async (req: AuthenticatedRequest, res: Response): Promise<any> => {
  try {
    const instance = await BotInstance.findOne({ tenantId: req.tenantId });
    
    if (!instance) {
      return res.status(200).json({
        status: 'success',
        data: { connectionStatus: 'DISCONNECTED', qrCode: null }
      });
    }

    return res.status(200).json({
      status: 'success',
      data: {
        connectionStatus: instance.connectionStatus,
        // The frontend dashboard reads this parameter, turns it into a visually scannable QR matrix, and displays it to the user!
        qrCode: instance.lastQrCode, 
        updatedAt: instance.updatedAt
      }
    });
  } catch (error) {
    return res.status(500).json({ status: 'error', message: 'Failed to check active instance matrix records.' });
  }
});

export default router;
