import makeWASocket, {
  DisconnectReason,
  makeCacheableSignalKeyStore,
  // 1. Import the proper TypeScript type for connection updates
  ConnectionState, 
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import qrcode from 'qrcode-terminal';
import { logger } from '../utils/logger.js';
import { useRedisAuthState } from './auth.js';
import { redisClient } from '../config/redis.js';
import { setupMessageListeners } from './event.js';

export const startBot = async () => {
  logger.info('Initializing iBot...');

  // Initialize our custom Redis Auth
  const { state, saveCreds } = await useRedisAuthState(redisClient, 'vendor-bot-session');

  // 2. SURGICAL FIX: Call makeWASocket directly (removed .default)
  const sock = makeWASocket({
    auth: {
      creds: state.creds,
      // Wrap the keys in a cache layer to drastically speed up processing times
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    printQRInTerminal: false, // We will handle this manually below
    logger: logger.child({ module: 'baileys' }),
    browser: ['Mac OS', 'Chrome', '1.0.0'],  // Identifies the bot cleanly
    syncFullHistory: false, // Prevents downloading years of old group messages on start
  });

  // 3. SURGICAL FIX: Explicitly type the 'update' parameter as Partial<ConnectionState>
  sock.ev.on('connection.update', (update: Partial<ConnectionState>) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      logger.info('Action Required: Scan the QR code below to link the bot number:');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      const shouldReconnect =
        (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
      
      logger.warn(
        { reason: (lastDisconnect?.error as Boom)?.output?.statusCode },
        'Connection closed.'
      );

      if (shouldReconnect) {
        logger.info('Attempting to reconnect...');
        startBot(); // Re-initialize if dropped due to network issues
      } else {
        logger.fatal('Bot was logged out. You must clear Redis and scan a new QR code.');
      }
    } else if (connection === 'open') {
      logger.info('✅ WhatsApp connection successfully established!');
    }
  });

  // Save credentials continuously as Meta rotates encryption keys
  // Inside src/bot/socket.ts:
  sock.ev.on('creds.update', async () => {
    try {
      await saveCreds();
    } catch (err) {
      logger.error(err, 'Failed to save credentials updates to Redis');
    }
  });


  // Future Event Listener hook for Phase 3 (Message listening)
  setupMessageListeners(sock);

  return sock;
};
