import { WASocket } from '@whiskeysockets/baileys';
import { IProduct } from '../models/Product.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

export const sendClientAlert = async (
  sock: WASocket,
  product: IProduct,
  groupName: string,
  buyerNumber: string,
  rawMessage: string,
  alertPhoneNumber?: string 
): Promise<void> => {
  try {
    // 🌟 DYNAMIC ROUTING CHANNEL: Use the instance alert number, fall back to .env if none provided
    const targetNumber = alertPhoneNumber || env.CLIENT_PHONE_NUMBER;
    
    if (!targetNumber) {
      logger.warn('Skipping alert dispatch: No valid alert phone number provided or configured.');
      return;
    }

    // Format the computed phone number into a standard WhatsApp JID
    const clientJid = `${targetNumber.trim()}@s.whatsapp.net`;

    // 🌟 PRODUCTION FIX: Extract ONLY the actual digits of the phone number.
    // This removes domain extensions (@s.whatsapp.net) and multi-device channels (:3) instantly.
    let finalBuyerDisplay = buyerNumber.replace(/\D/g, '');

    // 🌟 RE-ENGINEERED SAAS TRANSLATOR GATEWAY: Handle strict Meta LID isolation architectures as a backup
    if (buyerNumber.endsWith('@lid') || buyerNumber.startsWith('1516')) {
      try {
        const cleanIdSegment = buyerNumber.split('@')[0].split(':')[0];
        
        // 1. Check Baileys runtime internal mapping functions
        const currentLidMap = (sock as any).getLidToPhoneMap ? (sock as any).getLidToPhoneMap() : {};
        const mappedPhoneNumber = currentLidMap[buyerNumber.endsWith('@lid') ? buyerNumber : `${buyerNumber}@lid`];

        if (mappedPhoneNumber) {
          finalBuyerDisplay = mappedPhoneNumber.replace(/\D/g, '');
          logger.info(`✨ [LID TRANSLATOR SUCCESS]: Resolved ledger ID to phone number: ${finalBuyerDisplay}`);
        } else {
          // 2. Cross-check via Global Store contacts index arrays if active cache stores are registered
          const globalStore = (sock as any).store;
          const contactFromStore = globalStore?.contacts ? globalStore.contacts[buyerNumber] : null;
          
          // 3. Ultra Fallback: Scan standard internal identity address labels
          const contact = (sock as any).contacts ? (sock as any).contacts[buyerNumber] : null;
          const verifiedContact = contactFromStore || contact;

          if (verifiedContact && (verifiedContact.name || verifiedContact.notify)) {
            finalBuyerDisplay = `${verifiedContact.name || verifiedContact.notify} (${cleanIdSegment})`;
          }
        }
      } catch (translationErr) {
        logger.warn({ translationErr }, 'LID translation dictionary lookup skipped. Defaulting to processed digit layout.');
      }
    }

    const alertText = 
      `🚨 *SALES ALERT* 🚨\n\n` +
      `Someone is looking for an item you have in stock!\n\n` +
      `📦 *Item Match:* ${product.name}\n` +
      `💰 *Listed Price:* ₦${product.price.toLocaleString()}\n\n` +
      `📍 *Group:* ${groupName}\n` +
      // `👤 *Buyer:* +${finalBuyerDisplay}\n\n` +
      `💬 *Their Message:*\n"${rawMessage}"\n\n` +
      `_Reply in the group to close the sale!_`;

    // Simulate typing delay to look natural
    await sock.sendPresenceUpdate('composing', clientJid);
    await new Promise((resolve) => setTimeout(resolve, 2000));
    await sock.sendPresenceUpdate('paused', clientJid);

    await sock.sendMessage(clientJid, { text: alertText });
    logger.info(`Alert successfully dispatched to dynamic client JID: ${clientJid} for product: ${product.name}`);
    
  } catch (error) {
    logger.error({ error }, 'Failed to send client alert');
  }
};
