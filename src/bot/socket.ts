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
import { BotInstance } from '../models/Tenant.js'; // Successfully wired to your core schemas

// 🌟 COMMERCIAL SaaS REFACTOR: Accepts dynamic session definitions per active subscriber
export const startBot = async (sessionId: string = 'vendor-bot-session', alertPhoneNumber?: string) => {
  logger.info(`Initializing iBot Instance for Session: [${sessionId}]...`);

  // Initialize our custom Redis Auth using the dynamic dynamic tenant sessionId namespace
  const { state, saveCreds } = await useRedisAuthState(redisClient, sessionId);

  // 2. Call makeWASocket directly with unique child logging context per instance
  const sock = makeWASocket({
    auth: {
      creds: state.creds,
      // Wrap the keys in a cache layer to drastically speed up processing times
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    printQRInTerminal: false, // We will handle this manually below
    logger: logger.child({ module: `baileys-${sessionId}`, level: 'warn' }),
    browser: ['Mac OS', 'Chrome', '1.0.0'],  // Identifies the bot cleanly
    syncFullHistory: false, // Prevents downloading years of old group messages on start
  });

  // 🌟 Context Attachment: Keep track of sessionId right on the socket instance
  (sock as any).sessionId = sessionId;

  // 3. Handle dynamic connection lifecycles per running client container
  sock.ev.on('connection.update', async (update: Partial<ConnectionState>) => {
    const { connection, lastDisconnect, qr } = update;

    // A: IF A FRESH QR IS BROADCASTED FROM META
    if (qr) {
      logger.info(`✨ [QR GENERATED] Session: [${sessionId}]. Syncing matrix string to MongoDB catalog...`);
      
      try {
        // Save raw string to MongoDB. Your React dashboard polls this field to render the dynamic canvas!
        await BotInstance.findOneAndUpdate(
          { sessionId },
          { connectionStatus: 'GENERATING_QR', lastQrCode: qr, updatedAt: new Date() }
        );
      } catch (dbErr) {
        logger.error({ dbErr, sessionId }, 'Failed to write active QR matrix to database records');
      }

      // Keep this intact so you can still scan directly from your terminal during testing!
      qrcode.generate(qr, { small: true });
    }

    // B: IF CONNECTION DROPS OR CLOSES
    if (connection === 'close') {
      const shouldReconnect =
        (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
      
      logger.warn(
        { reason: (lastDisconnect?.error as Boom)?.output?.statusCode, sessionId },
        'Connection closed.'
      );

      try {
        // Clear old QR strings and drop status to DISCONNECTED inside MongoDB safely
        await BotInstance.findOneAndUpdate(
          { sessionId },
          { connectionStatus: 'DISCONNECTED', lastQrCode: null, updatedAt: new Date() }
        );
      } catch (dbErr) {
        logger.error({ dbErr, sessionId }, 'Failed to clear instance connection metadata markers in DB');
      }

      if (shouldReconnect) {
        logger.info(`Attempting to reconnect dynamic session: [${sessionId}]...`);
        startBot(sessionId, alertPhoneNumber); // Re-initialize specific dynamic tenant instance loops
      } else {
        logger.fatal(`Bot instance [${sessionId}] was logged out. You must clear Redis keys and scan a new QR code.`);
      }
    } 
    
    // C: IF LOGIN HANDSHAKE COMPLETES SUCCESSFULLY
    else if (connection === 'open') {
      logger.info(`✅ WhatsApp connection successfully established for session: [${sessionId}]!`);
      
      try {
        // Update database to CONNECTED. The dashboard immediately stops polling and displays "Active"
        await BotInstance.findOneAndUpdate(
          { sessionId },
          { connectionStatus: 'CONNECTED', lastQrCode: null, updatedAt: new Date() }
        );
      } catch (dbErr) {
        logger.error({ dbErr, sessionId }, 'Failed to mark instance status as CONNECTED in database');
      }
    }
  });

  // Save credentials continuously as Meta rotates encryption keys
  sock.ev.on('creds.update', async () => {
    try {
      await saveCreds();
    } catch (err) {
      logger.error(err, `Failed to save credentials updates to Redis for session: ${sessionId}`);
    }
  });

  // 🌟 Dynamic Attachment Layer: Store the custom alert number context inside the socket object instance
  if (alertPhoneNumber) {
    (sock as any).alertPhoneNumber = alertPhoneNumber;
  }

  // Future Event Listener hook for Phase 3 (Message listening)
  setupMessageListeners(sock);

  return sock;
};
