import makeWASocket, {
  DisconnectReason,
  makeCacheableSignalKeyStore,
  ConnectionState,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import qrcode from 'qrcode-terminal';
import { logger } from '../utils/logger.js';
import { useRedisAuthState } from './auth.js';
import { redisClient } from '../config/redis.js';
import { setupMessageListeners } from './event.js';
import { BotInstance } from '../models/Tenant.js'; 

// 🌟 SESSION MANAGER: Prevent duplicate sockets for the same tenant
export const activeSessions = new Map<string, any>();

export const startBot = async (sessionId: string = 'vendor-bot-session', alertPhoneNumber?: string) => {
  // Prevent duplicate connections if the session is already active in memory
  if (activeSessions.has(sessionId)) {
    logger.warn(`Session [${sessionId}] is already running. Returning existing instance to prevent conflict.`);
    return activeSessions.get(sessionId);
  }

  logger.info(`Initializing iBot Instance for Session: [${sessionId}]...`);

  const { state, saveCreds } = await useRedisAuthState(redisClient, sessionId);

  const sock = makeWASocket({
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    printQRInTerminal: false,
    logger: logger.child({ module: `baileys-${sessionId}`, level: 'warn' }),
    browser: ['Mac OS', 'Chrome', '1.0.0'], 
    syncFullHistory: false, 
  });

  (sock as any).sessionId = sessionId;

  // Add the newly created socket to our active sessions map
  activeSessions.set(sessionId, sock);

  sock.ev.on('connection.update', async (update: Partial<ConnectionState>) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      logger.info(`✨ [QR GENERATED] Session: [${sessionId}]. Syncing matrix string to MongoDB catalog...`);
      
      try {
        await BotInstance.findOneAndUpdate(
          { sessionId },
          { connectionStatus: 'GENERATING_QR', lastQrCode: qr, updatedAt: new Date() }
        );
      } catch (dbErr) {
        logger.error({ dbErr, sessionId }, 'Failed to write active QR matrix to database records');
      }

      qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      // Clean up the active session map immediately upon closure
      activeSessions.delete(sessionId);

      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      
      logger.warn(
        { reason: statusCode, sessionId },
        'Connection closed.'
      );

      try {
        await BotInstance.findOneAndUpdate(
          { sessionId },
          { connectionStatus: 'DISCONNECTED', lastQrCode: null, updatedAt: new Date() }
        );
      } catch (dbErr) {
        logger.error({ dbErr, sessionId }, 'Failed to clear instance connection metadata markers in DB');
      }

      if (shouldReconnect) {
        // Handle stream conflicts and standard reconnects with a backoff delay
        if (statusCode === 428 || statusCode === 440 || statusCode === DisconnectReason.connectionReplaced) {
          logger.warn(`Stream conflict detected for [${sessionId}]. Waiting 5 seconds to let stale streams drop before reconnecting...`);
          setTimeout(() => startBot(sessionId, alertPhoneNumber), 5000);
        } else {
          logger.info(`Attempting to reconnect dynamic session: [${sessionId}] in 2 seconds...`);
          setTimeout(() => startBot(sessionId, alertPhoneNumber), 2000);
        }
      } else {
        logger.fatal(`Bot instance [${sessionId}] was logged out. You must clear Redis keys and scan a new QR code.`);
      }
    } 
    
    else if (connection === 'open') {
      logger.info(`✅ WhatsApp connection successfully established for session: [${sessionId}]!`);
      
      try {
        await BotInstance.findOneAndUpdate(
          { sessionId },
          { connectionStatus: 'CONNECTED', lastQrCode: null, updatedAt: new Date() }
        );
      } catch (dbErr) {
        logger.error({ dbErr, sessionId }, 'Failed to mark instance status as CONNECTED in database');
      }
    }
  });

  sock.ev.on('creds.update', async () => {
    try {
      await saveCreds();
    } catch (err) {
      logger.error(err, `Failed to save credentials updates to Redis for session: ${sessionId}`);
    }
  });

  if (alertPhoneNumber) {
    (sock as any).alertPhoneNumber = alertPhoneNumber;
  }

  setupMessageListeners(sock);

  return sock;
};