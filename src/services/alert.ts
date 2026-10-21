import { WASocket } from '@whiskeysockets/baileys';
import { IProduct } from '../models/Product.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

export const sendClientAlert = async (
  sock: WASocket,
  product: IProduct | null,
  groupName: string,
  buyerDisplay: string,
  rawMessage: string,
  alertPhoneNumber?: string,
  hasExplicitIntent?: boolean
): Promise<void> => {
  try {
    const targetNumber = alertPhoneNumber || env.CLIENT_PHONE_NUMBER;
    
    if (!targetNumber) {
      logger.warn('Skipping alert dispatch: No valid alert phone number provided or configured.');
      return;
    }

    const clientJid = `${targetNumber.trim()}@s.whatsapp.net`;

    let alertText = '';

    if (product) {
      // 🌟 1. DIRECT CATALOG MATCH TEMPLATE
      alertText = 
        `🚨 *SALES ALERT: DIRECT MATCH* 🚨\n\n` +
        `Someone is looking for an item you have in stock!\n\n` +
        `📦 *Item Match:* ${product.name}\n` +
        `💰 *Listed Price:* ₦${product.price.toLocaleString()}\n\n` +
        `📍 *Group:* ${groupName}\n` +
        `👤 *Buyer:* ${buyerDisplay}\n\n` +
        `💬 *Their Message:*\n"${rawMessage}"\n\n` +
        `_Reply in the group or chat the buyer to close the sale!_`;
    } else if (hasExplicitIntent) {
      // 🌟 2. BROAD MARKET LEAD TEMPLATE (Unmatched Sourcing Opportunity)
      alertText = 
        `🔥 *HOT MARKET LEAD (UNMATCHED)* 🔥\n\n` +
        `Someone posted a buying request in a group!\n\n` +
        `🏷️ *Status:* Not in catalog (Great sourcing opportunity!)\n\n` +
        `📍 *Group:* ${groupName}\n` +
        `👤 *Buyer:* ${buyerDisplay}\n\n` +
        `💬 *Their Request:*\n"${rawMessage}"\n\n` +
        `_Reply in the group or chat the buyer to close the deal!_`;
    } else {
      return;
    }

    await sock.sendPresenceUpdate('composing', clientJid);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await sock.sendPresenceUpdate('paused', clientJid);

    await sock.sendMessage(clientJid, { text: alertText });
    
    const logItemName = product ? product.name : 'Unmatched Market Lead';
    logger.info(`Alert successfully dispatched to dynamic client JID: ${clientJid} for: ${logItemName}`);
    
  } catch (error) {
    logger.error({ error }, 'Failed to send client alert');
  }
};