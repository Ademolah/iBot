import { WASocket } from '@whiskeysockets/baileys';
import { IProduct } from '../models/Product.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

export const sendClientAlert = async (
  sock: WASocket,
  product: IProduct | null, // 🌟 FIXED: Now safely allows null when an item isn't in stock
  groupName: string,
  buyerNumber: string,
  rawMessage: string,
  alertPhoneNumber?: string,
  hasExplicitIntent?: boolean // 🌟 FIXED: 7th Argument added to catch the 'I need' intent
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
    let finalBuyerDisplay = buyerNumber.replace(/\D/g, '');

    // 🌟 RE-ENGINEERED SAAS TRANSLATOR GATEWAY: Handle strict Meta LID isolation architectures
    if (buyerNumber.endsWith('@lid') || buyerNumber.startsWith('1516')) {
      try {
        const cleanIdSegment = buyerNumber.split('@')[0].split(':')[0];
        
        const currentLidMap = (sock as any).getLidToPhoneMap ? (sock as any).getLidToPhoneMap() : {};
        const mappedPhoneNumber = currentLidMap[buyerNumber.endsWith('@lid') ? buyerNumber : `${buyerNumber}@lid`];

        if (mappedPhoneNumber) {
          finalBuyerDisplay = mappedPhoneNumber.replace(/\D/g, '');
          logger.info(`✨ [LID TRANSLATOR SUCCESS]: Resolved ledger ID to phone number: ${finalBuyerDisplay}`);
        } else {
          const globalStore = (sock as any).store;
          const contactFromStore = globalStore?.contacts ? globalStore.contacts[buyerNumber] : null;
          
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

    // 🚀 THE NEW DYNAMIC ALERT ROUTING ENGINE
    let alertText = '';

    if (product) {
      // SCENARIO 1: We actually have this item in our DB
      alertText = 
        `🚨 *SALES ALERT: DIRECT MATCH* 🚨\n\n` +
        `Someone is looking for an item you currently have in stock!\n\n` +
        `📦 *Item Match:* ${product.name}\n` +
        `💰 *Listed Price:* ₦${product.price.toLocaleString()}\n\n` +
        `📍 *Group:* ${groupName}\n` +
        `💬 *Their Message:*\n"${rawMessage}"\n\n` +
        `_Reply in the group to close the sale!_`;
    } else if (hasExplicitIntent) {
      // SCENARIO 2: Hot lead bypass! They said "I need", but we don't have it stocked
      alertText = 
        `🔥 *HOT MARKET LEAD* 🔥\n\n` +
        `A buyer is actively looking for something, but it's not currently in your inventory. Check if you can source it!\n\n` +
        `📍 *Group:* ${groupName}\n` +
        `💬 *Their Request:*\n"${rawMessage}"\n\n` +
        `_Source it quickly and jump into the group!_`;
    } else {
      // Failsafe drop
      return;
    }

    // Simulate typing delay to look natural
    await sock.sendPresenceUpdate('composing', clientJid);
    await new Promise((resolve) => setTimeout(resolve, 2000));
    await sock.sendPresenceUpdate('paused', clientJid);

    await sock.sendMessage(clientJid, { text: alertText });
    
    // Adjusted log to handle null product names gracefully
    const logItemName = product ? product.name : 'Out-of-stock lead';
    logger.info(`Alert successfully dispatched to dynamic client JID: ${clientJid} for: ${logItemName}`);
    
  } catch (error) {
    logger.error({ error }, 'Failed to send client alert');
  }
};