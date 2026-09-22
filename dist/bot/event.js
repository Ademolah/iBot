import { handleIncomingMessage } from '../handlers/message.js';
import { logger } from '../utils/logger.js';
export const setupMessageListeners = (sock) => {
    sock.ev.on('messages.upsert', async (m) => {
        if (m.type === 'notify') {
            const alertPhoneNumber = sock.alertPhoneNumber;
            for (const msg of m.messages) {
                try {
                    if (msg.key.fromMe)
                        continue;
                    await handleIncomingMessage(sock, msg, alertPhoneNumber);
                }
                catch (msgError) {
                    logger.error({ msgError, msgId: msg.key?.id, alertPhoneNumber }, 'Error encountered while processing an individual group message packet');
                }
            }
        }
    });
    logger.info('Message listeners configured successfully.');
};
