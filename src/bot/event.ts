import { WASocket } from '@whiskeysockets/baileys';
import { handleIncomingMessage } from '../handlers/message.js';
import { logger } from '../utils/logger.js';

export const setupMessageListeners = (sock: WASocket) => {
  sock.ev.on('messages.upsert', async (m) => {
    // 'notify' means it's a brand new message, not an old synced message
    if (m.type === 'notify') {
      // 🌟 COMMERCIAL SaaS UPGRADE: Extract the specific tenant alert phone number bound to this instance
      const alertPhoneNumber = (sock as any).alertPhoneNumber;

      for (const msg of m.messages) {
        try {
          // Ignore messages sent by the bot itself (double guard)
          if (msg.key.fromMe) continue;
          
          // Forward the message along with the dynamic tenant destination phone number
          await handleIncomingMessage(sock, msg, alertPhoneNumber);
        } catch (msgError) {
          // Fault Isolation: If one message fails to process, log it and keep processing other messages
          logger.error(
            { msgError, msgId: msg.key?.id, alertPhoneNumber }, 
            'Error encountered while processing an individual group message packet'
          );
        }
      }
    }
  });

  logger.info('Message listeners configured successfully.');
};
