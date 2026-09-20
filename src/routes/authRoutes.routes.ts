import { Router, Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { Tenant, BotInstance } from '../models/Tenant.js';
import { logger } from '../utils/logger.js';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'SUPER_SECRET_SECURITY_SEED';
const SALT_ROUNDS = 12; // High computation factor to protect against brute-force attacks

// ==========================================
// 1. TENANT SIGNUP / REGISTRATION
// ==========================================
router.post('/register', async (req: Request, res: Response): Promise<any> => {
  try {
    const { email, password, alertPhoneNumber } = req.body;

    if (!email || !password || !alertPhoneNumber) {
      return res.status(400).json({ status: 'error', message: 'All registration parameters are required.' });
    }

    // Check if the business email already exists inside your MongoDB cluster
    const existingTenant = await Tenant.findOne({ email: email.toLowerCase().trim() });
    if (existingTenant) {
      return res.status(409).json({ status: 'error', message: 'An account with this email address already exists.' });
    }

    // Cryptographically hash the password string securely before storage
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    // Persist the subscriber into the database
    const newTenant = new Tenant({
      email: email.toLowerCase().trim(),
      passwordHash,
      alertPhoneNumber: alertPhoneNumber.replace(/\D/g, ''), // Strip spaces, +, and symbols natively
      subscriptionStatus: 'ACTIVE'
    });

    await newTenant.save();
    logger.info(`👤 [NEW SIGNUP]: Account created for user: ${newTenant.email}`);

    // Pre-create their isolated WhatsApp instance tracker record cleanly
    const customSessionId = `session-tenant-${newTenant._id}`;
    const instance = new BotInstance({
      tenantId: newTenant._id,
      sessionId: customSessionId,
      connectionStatus: 'DISCONNECTED'
    });
    await instance.save();

    // Sign a secure JWT authentication token signature
    const token = jwt.sign({ id: newTenant._id }, JWT_SECRET, { expiresIn: '7d' });

    return res.status(201).json({
      status: 'success',
      message: 'Account registered completely. SaaS environment initialized.',
      data: {
        token,
        tenant: {
          id: newTenant._id,
          email: newTenant.email,
          alertPhoneNumber: newTenant.alertPhoneNumber,
          subscriptionStatus: newTenant.subscriptionStatus
        }
      }
    });
  } catch (error) {
    logger.error({ error }, 'Failed inside the account registration route handler');
    return res.status(500).json({ status: 'error', message: 'Internal registration failure.' });
  }
});

// ==========================================
// 2. TENANT LOGIN / INITIALIZATION
// ==========================================
router.post('/login', async (req: Request, res: Response): Promise<any> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ status: 'error', message: 'Email and password credentials are required.' });
    }

    const tenant = await Tenant.findOne({ email: email.toLowerCase().trim() });
    if (!tenant) {
      return res.status(401).json({ status: 'error', message: 'Invalid authentication credentials provided.' });
    }

    // Compare raw input password against the stored secure cryptographic hash
    const isMatch = await bcrypt.compare(password, tenant.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ status: 'error', message: 'Invalid authentication credentials provided.' });
    }

    if (tenant.subscriptionStatus !== 'ACTIVE') {
      return res.status(403).json({ status: 'error', message: 'Access suspended. Please update your billing parameters.' });
    }

    // Sign the tracking verification token block
    const token = jwt.sign({ id: tenant._id }, JWT_SECRET, { expiresIn: '7d' });
    logger.info(`🔑 [USER LOGIN]: Session successfully opened for: ${tenant.email}`);

    return res.status(200).json({
      status: 'success',
      message: 'Authentication successful. Access granted.',
      data: {
        token,
        tenant: {
          id: tenant._id,
          email: tenant.email,
          alertPhoneNumber: tenant.alertPhoneNumber
        }
      }
    });
  } catch (error) {
    logger.error({ error }, 'Failed inside the authorization handler sequence');
    return res.status(500).json({ status: 'error', message: 'Internal server error during login operation.' });
  }
});

export default router;
