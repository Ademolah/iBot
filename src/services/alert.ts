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
  alertPhoneNumber?: string // 🌟 Upgraded parameter to handle dynamic tenant numbers
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

    const alertText = 
      `🚨 *SALES ALERT* 🚨\n\n` +
      `Someone is looking for an item you have in stock!\n\n` +
      `📦 *Item Match:* ${product.name}\n` +
      `💰 *Listed Price:* ₦${product.price.toLocaleString()}\n\n` +
      `📍 *Group:* ${groupName}\n` +
      `👤 *Buyer:* +${buyerNumber.split('@')[0]}\n\n` +
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
