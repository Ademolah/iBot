import { Router } from 'express';
import { protectTenantRoute } from '../middleware/auth.js';
import { Tenant, BotInstance } from '../models/Tenant.js';
import { Product } from '../models/Product.js';
import { startBot } from '../bot/socket.js';
import { redisClient } from '../config/redis.js';
import { logger } from '../utils/logger.js';
const router = Router();
router.patch('/alert-number', protectTenantRoute, async (req, res) => {
    try {
        const { alertPhoneNumber } = req.body;
        if (!alertPhoneNumber || alertPhoneNumber.length < 10) {
            return res.status(400).json({ status: 'error', message: 'Invalid phone number format provided.' });
        }
        const updatedTenant = await Tenant.findByIdAndUpdate(req.tenantId, { alertPhoneNumber: alertPhoneNumber.replace(/\D/g, '') }, { new: true }).select('-passwordHash');
        return res.status(200).json({
            status: 'success',
            message: 'Sales notification destination target number updated successfully.',
            data: { tenant: updatedTenant }
        });
    }
    catch (error) {
        return res.status(500).json({ status: 'error', message: 'Internal transaction dispatch failure.' });
    }
});
router.get('/inventory', protectTenantRoute, async (req, res) => {
    try {
        const products = await Product.find({ tenantId: req.tenantId }).sort({ createdAt: -1 });
        return res.status(200).json({
            status: 'success',
            data: products
        });
    }
    catch (error) {
        return res.status(500).json({ status: 'error', message: 'Failed to fetch inventory records safely.' });
    }
});
router.post('/inventory', protectTenantRoute, async (req, res) => {
    try {
        const { name, brand, modelName, aliases, specs, price } = req.body;
        if (!name || !price || !brand || !modelName) {
            return res.status(400).json({
                status: 'error',
                message: 'Product name, brand, modelName, and listing price values are required.'
            });
        }
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
        await redisClient.del('inventory:in_stock');
        return res.status(201).json({
            status: 'success',
            message: 'Product listing added to inventory successfully.',
            data: { product: newProduct }
        });
    }
    catch (error) {
        logger.error({ error, tenantId: req.tenantId }, 'Failed to save product entity to database.');
        return res.status(500).json({ status: 'error', message: 'Failed to insert inventory record safely.' });
    }
});
router.post('/bot/spawn', protectTenantRoute, async (req, res) => {
    try {
        const tenant = await Tenant.findById(req.tenantId);
        if (!tenant || tenant.subscriptionStatus !== 'ACTIVE') {
            return res.status(403).json({ status: 'error', message: 'Account context requires active status credentials to spawn channels.' });
        }
        const customSessionId = `session-tenant-${tenant._id}`;
        let instance = await BotInstance.findOne({ tenantId: tenant._id });
        if (!instance) {
            instance = new BotInstance({
                tenantId: tenant._id,
                sessionId: customSessionId,
                connectionStatus: 'DISCONNECTED'
            });
            await instance.save();
        }
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
    }
    catch (error) {
        return res.status(500).json({ status: 'error', message: 'Failed to initiate dynamic allocation clusters.' });
    }
});
router.get('/bot/status', protectTenantRoute, async (req, res) => {
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
                qrCode: instance.lastQrCode,
                updatedAt: instance.updatedAt
            }
        });
    }
    catch (error) {
        return res.status(500).json({ status: 'error', message: 'Failed to check active instance matrix records.' });
    }
});
router.delete('/inventory/:id', protectTenantRoute, async (req, res) => {
    try {
        const productId = req.params.id;
        const deletedProduct = await Product.findOneAndDelete({
            _id: productId,
            tenantId: req.tenantId
        });
        if (!deletedProduct) {
            return res.status(404).json({
                status: 'error',
                message: 'Product not found or you do not have permission to delete it.'
            });
        }
        logger.info(`🗑️ [INVENTORY DELETE]: Product ${deletedProduct.name} removed by tenant ${req.tenantId}`);
        await redisClient.del('inventory:in_stock');
        return res.status(200).json({
            status: 'success',
            message: 'Product removed from your stock successfully.'
        });
    }
    catch (error) {
        logger.error({ error, productId: req.params.id }, 'Failed to delete product from database.');
        return res.status(500).json({ status: 'error', message: 'Failed to delete inventory record safely.' });
    }
});
export default router;
