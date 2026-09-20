import { WASocket } from '@whiskeysockets/baileys';
import { handleIncomingMessage } from '../handlers/message.js';
import { logger } from '../utils/logger.js';

export const setupMessageListeners = (sock: WASocket) => {
  sock.ev.on('messages.upsert', async (m) => {
    // 'notify' means it's a brand new message, not an old synced message
    if (m.type === 'notify') {
      for (const msg of m.messages) {
        // Ignore messages sent by the bot itself
        if (msg.key.fromMe) continue;
        
        await handleIncomingMessage(sock, msg);
      }
    }
  });

  logger.info('Message listeners configured successfully.');
};